import assert from "node:assert/strict";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PortalStore, PortalError, SESSION_LIFETIME } from "../server/store.ts";
import { configureOwnerAccounts } from "../server/accounts.ts";
import { portalFixture, fixturePassword } from "./helpers/portal-fixture.mjs";
import { portalApi } from "./helpers/http.mjs";

const codeFor = (f, email) => f.sent.filter(mail => mail.email === email && mail.subject === "Код для входа — Node Studio").at(-1).content.match(/\b\d{6}\b/)[0];
const credentials = (f, role = "client") => ({ email: f.users[role].email, password: fixturePassword, role });
async function verify(f, request, pending, email = f.users.client.email) { return request("auth/verify", { code: codeFor(f, email) }, pending); }
function shareMailbox(f) {
  const email = "owner@example.test";
  const password = f.store.db.prepare("SELECT password FROM users WHERE id=?").get(f.users.client.id).password;
  for (const role of ["client", "curator", "developer", "admin"]) {
    f.store.db.prepare("UPDATE users SET email=?,password=? WHERE id=?").run(email, password, f.users[role].id);
    f.users[role] = f.store.user(f.users[role].id);
  }
  return email;
}

test("HTTP passwords cannot open a session before a browser-bound, single-use email code", async () => {
  const f = portalFixture(); const { request } = portalApi(f);
  try {
    assert.equal((await request("login", { ...credentials(f), role: "admin" })).statusCode, 401);
    const pending = await request("login", credentials(f)); assert.equal(pending.body.kind, "verification");
    assert.equal(pending.body.csrf, undefined); assert.equal(pending.body.viewer, undefined);
    assert.equal(f.store.db.prepare("SELECT count(*) AS count FROM sessions").get().count, 0);
    assert.equal((await request("snapshot", undefined, pending)).body.viewer, null);
    assert.equal((await request("action", { type: "message", threadId: "chat-one", text: "Blocked" }, pending)).statusCode, 401);
    const code = codeFor(f, f.users.client.email);
    assert.equal((await request("auth/verify", { code })).statusCode, 401, "another browser has no challenge cookie");
    const incorrect = code === "000000" ? "111111" : "000000";
    assert.equal((await request("auth/verify", { code: incorrect }, pending)).statusCode, 400);
    const account = await verify(f, request, pending); assert.equal(account.statusCode, 200); assert.equal(account.body.viewer.id, f.users.client.id);
    assert.equal((await request("auth/verify", { code }, pending)).statusCode, 401);
    const cookies = [account.headers["Set-Cookie"]].flat(); const main = cookies.find(cookie => cookie.startsWith("nodo_session="));
    assert.ok(main.includes("HttpOnly; SameSite=Lax")); const age = Number(main.match(/Max-Age=(\d+)/)[1]);
    assert.ok(age > 43100 && age <= SESSION_LIFETIME / 1000);
    const count = f.sent.length; await request("snapshot", undefined, account); await request("snapshot", undefined, account);
    assert.equal(f.sent.length, count, "refreshing does not request another code");
  } finally { f.close(); }
});

test("shared email grants only existing profiles with the authenticated credential and switching never renews the deadline", async () => {
  const f = portalFixture(); const { request } = portalApi(f);
  try {
    const email = shareMailbox(f);
    const pending = await request("login", { email, password: fixturePassword, role: "client" });
    const account = await verify(f, request, pending, email);
    assert.deepEqual(new Set(account.body.profiles.map(p => p.role)), new Set(["client", "curator", "developer", "admin"]));
    const deadline = f.store.db.prepare("SELECT min(expires) AS expires FROM sessions").get().expires;
    const sent = f.sent.length;
    const curator = await request("profiles/switch", { userId: f.users.curator.id }, account);
    assert.equal(curator.body.viewer.role, "curator"); assert.equal(f.sent.length, sent);
    assert.equal(f.store.db.prepare("SELECT min(expires) AS expires FROM sessions").get().expires, deadline);
    assert.equal((await request("profiles/switch", { userId: f.users.other.id }, curator)).statusCode, 404);
    // Same mailbox with a different credential is not silently granted.
    f.store.db.prepare("UPDATE users SET password='different-hash' WHERE id=?").run(f.users.admin.id);
    await request("logout", {}, curator); f.store.db.exec("DELETE FROM auth_limits");
    const next = await request("login", { email, password: fixturePassword, role: "client" });
    const fresh = await verify(f, request, next, email);
    assert.ok(!fresh.body.profiles.some(p => p.role === "admin"));
  } finally { f.close(); }
});

test("expired sessions and logout require a new code and cannot be revived by polling or profile switching", async () => {
  const f = portalFixture(); const { request, login } = portalApi(f);
  try {
    const account = await login("client", fixturePassword);
    f.store.db.exec("UPDATE sessions SET expires=0");
    assert.equal((await request("snapshot", undefined, account)).body.viewer, null);
    assert.equal((await request("profiles/switch", { userId: f.users.client.id }, account)).statusCode, 401);
    let pending = await request("login", credentials(f)); assert.equal(pending.body.kind, "verification");
    const fresh = await verify(f, request, pending); await request("logout", {}, fresh);
    assert.equal((await request("snapshot", undefined, fresh)).body.viewer, null);
    pending = await request("login", credentials(f)); assert.equal(pending.body.kind, "verification");
  } finally { f.close(); }
});

test("code expiry, resend cooldown and attempt limits survive new requests; resending does not restore attempts", async () => {
  const f = portalFixture(); const { request } = portalApi(f);
  try {
    const pending = await request("login", credentials(f)); const original = codeFor(f, f.users.client.email);
    assert.equal((await request("auth/resend", {}, pending)).statusCode, 429);
    assert.equal((await request("login", credentials(f))).statusCode, 429, "a new challenge cannot bypass the send cooldown");
    const wrong = original === "000000" ? "111111" : "000000";
    for (let i = 0; i < 3; i++) assert.equal((await request("auth/verify", { code: wrong }, pending)).statusCode, 400);
    f.store.db.exec("UPDATE auth_challenges SET resend_at=0");
    const resent = await request("auth/resend", {}, pending); assert.equal(resent.statusCode, 200);
    assert.equal(f.store.db.prepare("SELECT attempts FROM auth_challenges").get().attempts, 3);
    const latest = codeFor(f, f.users.client.email); const invalid = latest === "999999" ? "888888" : "999999";
    for (let i = 0; i < 2; i++) assert.equal((await request("auth/verify", { code: invalid }, resent)).statusCode, 400);
    assert.equal((await request("auth/verify", { code: latest }, resent)).statusCode, 401);
    f.store.db.exec("UPDATE auth_challenges SET expires=0");
    assert.equal((await request("auth/challenge", undefined, pending)).body.challenge, null);
    const row = f.store.db.prepare("SELECT * FROM auth_challenges").get(); assert.equal(row.code_hash.length, 64); assert.equal(row.code, undefined);
  } finally { f.close(); }
});

test("mail outages fail closed; there is no password-only fallback or session created by a failed delivery", async () => {
  const f = portalFixture(); const { request } = portalApi(f);
  try {
    f.integrations.ready.mail = false;
    assert.equal((await request("login", credentials(f))).statusCode, 503);
    f.integrations.ready.mail = true;
    f.integrations.mail = async () => { throw new PortalError(502, "Почта недоступна"); };
    assert.equal((await request("login", credentials(f))).statusCode, 502);
    assert.equal(f.store.db.prepare("SELECT count(*) AS count FROM sessions").get().count, 0);
    assert.equal(f.store.db.prepare("SELECT count(*) AS count FROM auth_challenges").get().count, 0);
  } finally { f.close(); }
});

test("login notifications contain a fixed-origin recovery link; reset consumes it once and revokes every related device and role", async () => {
  const f = portalFixture(); const { request } = portalApi(f);
  try {
    const email = shareMailbox(f); const unrelated = f.login("other");
    const pending = await request("login", { email, password: fixturePassword, role: "client" });
    const account = await verify(f, request, pending, email);
    const other = await request("login", { email, password: fixturePassword, role: "admin" });
    const otherDevice = await verify(f, request, other, email);
    const jobs = f.store.db.prepare("SELECT payload FROM jobs WHERE kind='auth.mail'").all();
    assert.equal(jobs.length, 2); assert.ok(jobs.every(row => !row.payload.includes("/recover/#")));
    await f.service.workJobs(); const notices = f.sent.filter(mail => mail.subject === "Новый вход — Node Studio"); assert.equal(notices.length, 2);
    const token = notices[0].content.match(/\/recover\/#([a-f0-9]{64})/)[1];
    assert.ok(notices[0].content.includes(`${f.config.origin}/recover/#${token}`));
    assert.equal((await request("auth/recovery", { token })).statusCode, 200);
    assert.equal((await request("auth/recovery", { token })).statusCode, 200, "inspection does not consume the token");
    assert.equal((await request("snapshot", undefined, account)).body.viewer.id, f.users.client.id);
    assert.equal((await request("auth/reset", { token, replacement: "New-owner-password-2026" }, undefined, { origin: "https://attacker.test" })).statusCode, 403);
    assert.equal((await request("auth/reset", { token, replacement: "short" })).statusCode, 400);
    assert.equal((await request("auth/reset", { token, replacement: "New-owner-password-2026" })).statusCode, 200);
    for (const browser of [account, otherDevice]) assert.equal((await request("snapshot", undefined, browser)).body.viewer, null);
    assert.ok(f.service.auth.session(unrelated.token), "unrelated identities on other devices remain intact");
    assert.equal((await request("auth/reset", { token, replacement: "Another-password-2026" })).statusCode, 400);
    for (const role of ["client", "curator", "developer", "admin"]) {
      assert.throws(() => f.store.authenticatePassword(email, fixturePassword, "after-reset", role), { status: 401 });
      assert.equal(f.store.authenticatePassword(email, "New-owner-password-2026", "after-reset", role).id, f.users[role].id);
    }
    const again = await request("login", { email, password: "New-owner-password-2026", role: "client" }); assert.equal(again.body.kind, "verification");
  } finally { f.close(); }
});

test("forgot-password responses do not enumerate accounts and stale tokens and pending login codes are invalid after a password change", async () => {
  const f = portalFixture(); const { request } = portalApi(f);
  try {
    const unknown = await request("auth/forgot", { email: "missing@example.test", role: "client" });
    const known = await request("auth/forgot", { email: f.users.client.email, role: "client" });
    assert.deepEqual(unknown.body, known.body); assert.equal(known.statusCode, 200);
    await f.service.workJobs(); const mail = f.sent.find(mail => mail.subject === "Восстановление доступа — Node Studio");
    const token = mail.content.match(/\/recover\/#([a-f0-9]{64})/)[1];
    const pending = await request("login", credentials(f)); const code = codeFor(f, f.users.client.email);
    const user = f.login("client"); f.store.changePassword(user.session, fixturePassword, "Settings-password-2026");
    assert.equal((await request("auth/recovery", { token })).statusCode, 400);
    assert.equal((await request("auth/verify", { code }, pending)).statusCode, 401);
    assert.equal(f.store.db.prepare("SELECT count(*) AS count FROM auth_recoveries").get().count, 0);
  } finally { f.close(); }
});

test("legacy account migration preserves foreign keys and IDs; owner setup keeps the client password, projects and exactly four roles", async () => {
  const directory = await mkdtemp(join(tmpdir(), "node-auth-")); const path = join(directory, "portal.sqlite");
  let store;
  try {
    store = new PortalStore(path);
    const accounts = ["client", "curator", "developer", "admin"].map(role => store.createUser(`${role}@example.test`, role, role, fixturePassword, false));
    const oldClient = accounts[0]; const oldSession = store.login(oldClient.email, fixturePassword, "test");
    store.put("projects", { id: "project:existing", clientId: oldClient.id, clientEmail: oldClient.email, clientName: "Client", name: "Existing", description: "", repo: "Matthew-zzz/existing", brief: "Brief", status: "active", createdAt: "2026-10-01T00:00:00Z" });
    store.close(); store = undefined;
    // Reproduce the deployed schema with email UNIQUE, then open the new application.
    const legacy = new DatabaseSync(path); legacy.exec("PRAGMA foreign_keys=OFF; DROP TABLE auth_challenges; DROP TABLE auth_recoveries; DROP TABLE auth_verifications; DROP INDEX one_developer; ALTER TABLE users RENAME TO users_modern; CREATE TABLE users(id TEXT PRIMARY KEY,email TEXT NOT NULL UNIQUE COLLATE NOCASE,name TEXT NOT NULL,role TEXT NOT NULL,password TEXT NOT NULL,must_change INTEGER NOT NULL); INSERT INTO users SELECT * FROM users_modern; DROP TABLE users_modern; ALTER TABLE sessions RENAME TO sessions_previous; CREATE TABLE sessions(token_hash TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id),csrf TEXT NOT NULL,expires INTEGER NOT NULL,group_id TEXT NOT NULL); INSERT INTO sessions SELECT * FROM sessions_previous; DROP TABLE sessions_previous;"); legacy.close();
    store = new PortalStore(path);
    assert.equal(store.session(oldSession.token).viewer.id, oldClient.id); assert.deepEqual(store.db.prepare("PRAGMA foreign_key_check").all(), []);
    const result = configureOwnerAccounts(store, "owner@example.test"); assert.equal(result.length, 4);
    assert.deepEqual(new Set(result.map(user => user.id)), new Set(accounts.map(user => user.id)));
    assert.equal(store.db.prepare("SELECT count(*) AS count FROM users").get().count, 4);
    assert.equal(store.session(oldSession.token), undefined);
    for (const role of ["client", "curator", "developer", "admin"]) assert.equal(store.authenticatePassword("owner@example.test", fixturePassword, "test", role).role, role);
    assert.equal(store.get("projects", "project:existing").clientId, oldClient.id); assert.equal(store.get("projects", "project:existing").clientEmail, "owner@example.test");
    assert.throws(() => store.createUser("owner@example.test", "Again", "client", fixturePassword), { status: 409 });
  } finally { store?.close(); await rm(directory, { recursive: true, force: true }); }
});
