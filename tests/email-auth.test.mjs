import assert from "node:assert/strict";
import test from "node:test";
import { DatabaseSync, backup } from "node:sqlite";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHmac } from "node:crypto";
import { portalApi, emailCode } from "./helpers/http.mjs";
import { portalFixture, fixturePassword } from "./helpers/portal-fixture.mjs";
import { PortalStore, tokenHash } from "../server/store.ts";
import { PortalService } from "../server/service.ts";
import { configureOwnerAccounts } from "../server/accounts.ts";

const freshChallenge = f => f.store.db.exec("UPDATE auth_challenges SET resend_at=0; DELETE FROM auth_limits");
const notices = f => f.sent.filter(mail => mail.subject === "Новый вход — Node Studio");
async function begin(f, role = "client", current) { return portalApi(f).request(current ? "profiles/add" : "login", { email: f.users[role].email, role: ["developer", "admin"].includes(role) ? role : "client" }, current); }
async function verify(f, pending, email = f.users.client.email) { return portalApi(f).request("auth/verify", { code: await emailCode(f, email) }, pending); }
function sharedMailbox(f) { const email = "owner@example.test"; for (const role of ["client", "developer", "admin"]) { f.store.db.prepare("UPDATE users SET email=? WHERE id=?").run(email, f.users[role].id); f.users[role] = f.store.user(f.users[role].id); } return email; }

test("email alone requests a browser-bound single-use code; no password or public code can open a session", async () => {
  const f = portalFixture();
  try {
    const { request } = portalApi(f); const pending = await begin(f);
    assert.equal(pending.statusCode, 200); assert.equal(pending.body.kind, "verification");
    assert.ok(pending.cookie.includes("node_challenge=")); assert.ok(!pending.cookie.includes("nodo_session="));
    assert.equal((await request("snapshot", undefined, pending)).body.viewer, null);
    const code = await emailCode(f, f.users.client.email);
    assert.ok(!JSON.stringify(pending.body).includes(code));
    const row = f.store.db.prepare("SELECT * FROM auth_challenges").get(); assert.notEqual(row.code_hash, code);
    const jobs = f.store.db.prepare("SELECT payload FROM jobs WHERE kind='auth.mail'").all(); assert.ok(jobs.every(job => !job.payload.includes(`Код для входа в Node Studio: ${code}`)));
    assert.equal((await request("auth/verify", { code })).statusCode, 401);
    const wrong = code === "000000" ? "111111" : "000000";
    assert.equal((await request("auth/verify", { code: wrong }, pending)).statusCode, 400);
    const logged = await request("auth/verify", { code }, pending); assert.equal(logged.statusCode, 200); assert.equal(logged.body.viewer.role, "client");
    assert.equal((await request("auth/verify", { code }, pending)).statusCode, 401);
    assert.ok([logged.headers["Set-Cookie"]].flat().some(value => /HttpOnly; SameSite=Lax; Max-Age=43\d{3}/.test(value)));
    assert.equal(f.store.db.prepare("SELECT count(*) n FROM auth_challenges").get().n, 0);
  } finally { f.close(); }
});

test("known and unknown accounts have identical challenge responses; unknown mail never registers users or authenticates", async () => {
  const f = portalFixture();
  try {
    const { request } = portalApi(f); const count = f.store.db.prepare("SELECT count(*) n FROM users").get().n;
    const known = await begin(f); const missing = await request("login", { email: "absent@example.test", role: "client" });
    assert.equal(known.statusCode, missing.statusCode); assert.deepEqual(Object.keys(known.body), Object.keys(missing.body)); assert.equal(missing.body.kind, "verification");
    await f.service.workJobs(); assert.ok(!f.sent.some(mail => mail.email === "absent@example.test"));
    const fake = f.store.db.prepare("SELECT * FROM auth_challenges WHERE user_id IS NULL").get();
    f.store.db.prepare("UPDATE auth_challenges SET code_hash=? WHERE id=?").run(createHmac("sha256", f.config.encryptionKey).update(`${fake.id}:123456`).digest("hex"), fake.id);
    assert.equal((await request("auth/verify", { code: "123456" }, missing)).statusCode, 400, "even a guessed dummy code cannot create an identity");
    assert.equal(f.store.db.prepare("SELECT count(*) n FROM users").get().n, count);
    assert.equal((await request("login", { email: "invalid", role: "client" })).statusCode, 400);
    assert.equal((await request("login", { email: f.users.client.email, role: "root" })).statusCode, 400);
  } finally { f.close(); }
});

test("resending invalidates prior codes and queued mail, while attempt, email and IP limits apply", async () => {
  const f = portalFixture();
  try {
    const { request } = portalApi(f); const pending = await begin(f); const old = await emailCode(f, f.users.client.email);
    assert.equal((await request("auth/resend", {}, pending)).statusCode, 429); assert.equal((await begin(f)).statusCode, 429);
    freshChallenge(f); assert.equal((await request("auth/resend", {}, pending)).statusCode, 200);
    const next = await emailCode(f, f.users.client.email); assert.notEqual(next, old);
    assert.equal((await request("auth/verify", { code: old }, pending)).statusCode, 400); assert.equal((await request("auth/verify", { code: next }, pending)).statusCode, 200);
    freshChallenge(f); const limited = await begin(f); const valid = await emailCode(f, f.users.client.email); const wrong = valid === "000000" ? "111111" : "000000";
    for (let attempt = 0; attempt < 5; attempt++) assert.equal((await request("auth/verify", { code: wrong }, limited)).statusCode, 400);
    assert.equal((await request("auth/verify", { code: valid }, limited)).statusCode, 401);
    freshChallenge(f); const expired = await begin(f); const expiredCode = await emailCode(f, f.users.client.email); f.store.db.exec("UPDATE auth_challenges SET expires=0");
    assert.equal((await request("auth/verify", { code: expiredCode }, expired)).statusCode, 401);
    freshChallenge(f); f.store.db.prepare("INSERT OR REPLACE INTO auth_limits VALUES(?,?,?)").run(tokenHash("login-ip:127.0.0.1"), 30, Date.now());
    assert.equal((await begin(f)).statusCode, 429);
  } finally { f.close(); }
});

test("one mailbox code grants existing roles even with different legacy passwords; first access never requires a password change", async () => {
  const f = portalFixture();
  try {
    const email = sharedMailbox(f); f.store.db.prepare("UPDATE users SET password='different',must_change=1 WHERE role='admin'").run();
    const { request } = portalApi(f); const logged = await verify(f, await begin(f), email);
    assert.equal(logged.body.profiles.length, 3); assert.ok(logged.body.profiles.every(user => !user.mustChangePassword));
    const before = f.sent.filter(mail => mail.subject === "Код для входа — Node Studio").length;
    const switched = await request("profiles/switch", { userId: f.users.admin.id }, logged); assert.equal(switched.body.viewer.role, "admin");
    assert.equal(f.sent.filter(mail => mail.subject === "Код для входа — Node Studio").length, before);
    const expires = f.store.db.prepare("SELECT min(expires) n FROM sessions").get().n;
    assert.equal(expires <= Date.now() + 12 * 3_600_000, true);
    f.store.db.exec("UPDATE sessions SET expires=0"); assert.equal((await request("snapshot", undefined, switched)).body.viewer, null);
    freshChallenge(f); assert.equal((await begin(f)).body.kind, "verification");
  } finally { f.close(); }
});

test("adding another mailbox needs its own code, is bound to its parent session, and never extends cookie expiry", async () => {
  const f = portalFixture();
  try {
    const { request } = portalApi(f); const client = await verify(f, await begin(f)); const expiry = f.store.db.prepare("SELECT min(expires) n FROM sessions").get().n;
    const pending = await begin(f, "developer", client); const code = await emailCode(f, f.users.developer.email);
    assert.equal((await request("auth/verify", { code }, { ...pending, cookie: pending.cookie.split(";").filter(part => !part.includes("nodo_session")).join(";") })).statusCode, 401);
    const developer = await request("auth/verify", { code }, pending); assert.equal(developer.body.profiles.length, 2); assert.equal(f.store.db.prepare("SELECT min(expires) n FROM sessions").get().n, expiry);
    const added = await begin(f, "admin", developer); const adminCode = await emailCode(f, f.users.admin.email);
    await request("logout", {}, developer); assert.equal((await request("auth/verify", { code: adminCode }, added)).statusCode, 401);
  } finally { f.close(); }
});

test("login notices provide a fixed-origin single-use session revocation link; opening it does not log anyone out", async () => {
  const f = portalFixture();
  try {
    const email = sharedMailbox(f); const { request } = portalApi(f); const first = await verify(f, await begin(f), email); freshChallenge(f);
    const second = await verify(f, await begin(f, "admin"), email); freshChallenge(f); const pending = await begin(f);
    await f.service.workJobs(); const notice = notices(f).at(-1); const token = notice.content.match(/\/recover\/#([a-f0-9]{64})/)[1];
    assert.ok(notice.content.includes(`${f.config.origin}/recover/#${token}`)); assert.ok(!notice.content.includes("пароль"));
    assert.equal((await request("auth/recovery", { token })).statusCode, 200); assert.equal((await request("snapshot", undefined, first)).body.viewer.role, "client");
    assert.equal((await request("auth/revoke", { token }, undefined, { origin: "https://attacker.test" })).statusCode, 403);
    assert.equal((await request("auth/revoke", { token })).statusCode, 200);
    for (const account of [first, second]) assert.equal((await request("snapshot", undefined, account)).body.viewer, null);
    assert.equal((await request("auth/challenge", undefined, pending)).body.challenge, null); assert.equal((await request("auth/revoke", { token })).statusCode, 400);
    assert.equal(f.store.db.prepare("SELECT count(*) n FROM auth_verifications").get().n, 0);
    assert.equal(f.store.db.prepare("SELECT count(*) n FROM auth_recoveries").get().n, 0);
    freshChallenge(f); const again = await verify(f, await begin(f), email); assert.equal(again.body.viewer.role, "client");
  } finally { f.close(); }
});

test("global logout requires a verified session and CSRF, and former password endpoints are disabled", async () => {
  const f = portalFixture();
  try {
    const { request } = portalApi(f); const logged = await verify(f, await begin(f));
    assert.equal((await request("auth/logout-all", {})).statusCode, 401);
    assert.equal((await request("auth/logout-all", {}, logged, { "x-csrf-token": "bad" })).statusCode, 403);
    assert.equal((await request("password", { current: fixturePassword, replacement: "New-password-2026" }, logged)).statusCode, 410);
    for (const path of ["auth/reset", "auth/forgot"]) assert.equal((await request(path, {})).statusCode, 410);
    assert.equal((await request("auth/logout-all", {}, logged)).statusCode, 200); assert.equal((await request("snapshot", undefined, logged)).body.viewer, null);
    freshChallenge(f); const pending = await request("login", { email: f.users.client.email, role: "client", password: "wrong" }); assert.equal(pending.body.kind, "verification");
    assert.equal((await request("snapshot", undefined, pending)).body.viewer, null);
  } finally { f.close(); }
});

test("code delivery is durable, retries keep its idempotency key, and superseded or cancelled codes never send", async () => {
  const f = portalFixture(); const directory = await mkdtemp(join(tmpdir(), "node-email-code-")); let store;
  try {
    const pending = await begin(f); const mail = f.integrations.mail; const keys = [];
    f.integrations.mail = async (_email, _content, id) => { keys.push(id); throw new Error("Mail unavailable"); };
    await f.service.workJobs(); assert.equal(f.store.db.prepare("SELECT count(*) n FROM sessions").get().n, 0);
    await backup(f.store.db, join(directory, "portal.sqlite")); store = new PortalStore(join(directory, "portal.sqlite"));
    f.integrations.mail = async (...args) => { keys.push(args[2]); return mail(...args); }; const recovered = new PortalService(store, f.integrations, f.config);
    store.db.exec("UPDATE jobs SET available=0"); await recovered.workJobs(); assert.equal(keys.length, 2); assert.equal(keys[0], keys[1]);
    assert.equal(f.sent.filter(item => item.subject === "Код для входа — Node Studio").length, 1);
    const api = portalApi(f); freshChallenge(f); await api.request("auth/resend", {}, pending); await api.request("auth/cancel", {}, pending); await f.service.workJobs();
    assert.equal(f.sent.filter(item => item.subject === "Код для входа — Node Studio").length, 1);
  } finally { store?.close(); f.close(); await rm(directory, { recursive: true, force: true }); }
});

test("missing mail configuration fails closed equally for known and unknown addresses", async () => {
  const f = portalFixture();
  try { f.integrations.ready.mail = false; const { request } = portalApi(f); assert.equal((await begin(f)).statusCode, 503); assert.equal((await request("login", { email: "missing@example.test", role: "client" })).statusCode, 503); assert.equal(f.store.db.prepare("SELECT count(*) n FROM sessions").get().n, 0); }
  finally { f.close(); }
});
test("legacy account migration preserves foreign keys and IDs; owner setup keeps the client password, projects and exactly three roles", async () => {
  const directory = await mkdtemp(join(tmpdir(), "node-auth-")); const path = join(directory, "portal.sqlite");
  let store;
  try {
    store = new PortalStore(path);
    const accounts = ["client", "developer", "admin"].map(role => store.createUser(`${role}@example.test`, role, role, fixturePassword, false));
    const oldClient = accounts[0]; const oldSession = store.login(oldClient.email, fixturePassword, "test");
    store.put("projects", { id: "project:existing", clientId: oldClient.id, clientEmail: oldClient.email, clientName: "Client", name: "Existing", description: "", repo: "Matthew-zzz/existing", brief: "Brief", status: "active", createdAt: "2026-10-01T00:00:00Z" });
    store.close(); store = undefined;
    // Reproduce the deployed schema with email UNIQUE, then open the new application.
    const legacy = new DatabaseSync(path); legacy.exec("PRAGMA foreign_keys=OFF; DROP TABLE auth_challenges; DROP TABLE auth_recoveries; DROP TABLE auth_verifications; DROP INDEX one_developer; ALTER TABLE users RENAME TO users_modern; CREATE TABLE users(id TEXT PRIMARY KEY,email TEXT NOT NULL UNIQUE COLLATE NOCASE,name TEXT NOT NULL,role TEXT NOT NULL,password TEXT NOT NULL,must_change INTEGER NOT NULL); INSERT INTO users SELECT * FROM users_modern; DROP TABLE users_modern; ALTER TABLE sessions RENAME TO sessions_previous; CREATE TABLE sessions(token_hash TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id),csrf TEXT NOT NULL,expires INTEGER NOT NULL,group_id TEXT NOT NULL); INSERT INTO sessions SELECT * FROM sessions_previous; DROP TABLE sessions_previous;"); legacy.close();
    store = new PortalStore(path);
    assert.equal(store.session(oldSession.token).viewer.id, oldClient.id); assert.deepEqual(store.db.prepare("PRAGMA foreign_key_check").all(), []);
    const result = configureOwnerAccounts(store, "owner@example.test"); assert.equal(result.length, 3);
    assert.deepEqual(new Set(result.map(user => user.id)), new Set(accounts.map(user => user.id)));
    assert.equal(store.db.prepare("SELECT count(*) AS count FROM users").get().count, 3);
    assert.equal(store.session(oldSession.token), undefined);
    for (const role of ["client", "developer", "admin"]) assert.equal(store.authenticatePassword("owner@example.test", fixturePassword, "test", role).role, role);
    assert.equal(store.get("projects", "project:existing").clientId, oldClient.id); assert.equal(store.get("projects", "project:existing").clientEmail, "owner@example.test");
    assert.throws(() => store.createUser("owner@example.test", "Again", "client", fixturePassword), { status: 409 });
  } finally { store?.close(); await rm(directory, { recursive: true, force: true }); }
});

test("upgrading the previous challenge schema preserves active codes, verified sessions, account IDs and foreign keys", async () => {
  const f = portalFixture(); const directory = await mkdtemp(join(tmpdir(), "node-otp-upgrade-")); const path = join(directory, "portal.sqlite"); let store;
  try {
    const verified = f.login("developer"); const pending = await f.service.auth.begin(f.users.client.email, "client", { address: "upgrade", agent: "fixture" });
    const code = await emailCode(f, f.users.client.email); const before = f.store.db.prepare("SELECT id FROM users ORDER BY id").all();
    await backup(f.store.db, path);
    const legacy = new DatabaseSync(path); legacy.exec(`PRAGMA foreign_keys=OFF;
      ALTER TABLE auth_challenges RENAME TO challenges_current;
      CREATE TABLE auth_challenges(id TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id),email TEXT NOT NULL COLLATE NOCASE,credential_hash TEXT NOT NULL,code_hash TEXT NOT NULL,created_at INTEGER NOT NULL,expires INTEGER NOT NULL,attempts INTEGER NOT NULL DEFAULT 0,resend_at INTEGER NOT NULL,group_id TEXT NOT NULL DEFAULT '',parent_token TEXT NOT NULL DEFAULT '');
      INSERT INTO auth_challenges SELECT id,user_id,email,credential_hash,code_hash,created_at,expires,attempts,resend_at,group_id,parent_token FROM challenges_current;
      DROP TABLE challenges_current;`); legacy.close();
    store = new PortalStore(path); const migrated = new PortalService(store, f.integrations, f.config);
    assert.equal(migrated.auth.session(verified.token).viewer.id, f.users.developer.id); assert.equal(migrated.auth.pending(pending.token).role, "client");
    const logged = migrated.auth.verify(pending.token, code, { address: "upgrade", agent: "fixture" }); assert.equal(logged.session.viewer.id, f.users.client.id);
    assert.deepEqual(store.db.prepare("SELECT id FROM users ORDER BY id").all(), before); assert.deepEqual(store.db.prepare("PRAGMA foreign_key_check").all(), []);
    assert.equal(store.db.prepare("PRAGMA table_info(auth_challenges)").all().find(column => column.name === "user_id").notnull, 0);
  } finally { store?.close(); f.close(); await rm(directory, { recursive: true, force: true }); }
});
