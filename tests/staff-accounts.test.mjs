import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { DatabaseSync, backup } from "node:sqlite";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { portalFixture, fixturePassword } from "./helpers/portal-fixture.mjs";
import { portalApi, emailCode } from "./helpers/http.mjs";
import { PortalStore } from "../server/store.ts";
import { PortalService } from "../server/service.ts";

const developerInput = () => ({ type: "developer.create", requestId: randomUUID(), name: "Новый разработчик", email: "new-developer@example.test" });

test("only a verified administrator can list and create developers; origin, CSRF and fixed role are enforced", async () => {
  const f = portalFixture(); const { request, login } = portalApi(f);
  try {
    const input = developerInput(); const count = f.store.db.prepare("SELECT count(*) n FROM users").get().n;
    assert.equal((await request("admin/staff")).statusCode, 401);
    assert.equal((await request("admin/staff", input)).statusCode, 401);
    for (const role of ["client", "developer"]) {
      const account = await login(role);
      assert.equal((await request("admin/staff", undefined, account)).statusCode, 403);
      assert.equal((await request("admin/staff", { ...input, role: "admin" }, account)).statusCode, 403);
      if (role === "client") assert.equal((await request("profiles/add", { email: f.users.admin.email, role: "admin" }, account)).statusCode, 403);
    }
    const admin = await login("admin");
    assert.equal((await request("admin/staff", input, admin, { "x-csrf-token": "" })).statusCode, 403);
    assert.equal((await request("admin/staff", input, admin, { origin: "https://attacker.test" })).statusCode, 403);
    for (const role of ["admin", "client", "curator"]) assert.equal((await request("admin/staff", { ...input, role }, admin)).statusCode, 400);
    for (const patch of [{ requestId: "" }, { email: "bad" }, { name: " " }]) assert.equal((await request("admin/staff", { ...input, ...patch }, admin)).statusCode, 400);
    assert.equal(f.store.db.prepare("SELECT count(*) n FROM users").get().n, count);
    const created = await request("admin/staff", input, admin); assert.equal(created.statusCode, 200);
    const user = f.store.findUser(input.email, "developer"); assert.ok(user); assert.equal(user.mustChangePassword, false);
    assert.deepEqual(created.body.developers.find(item => item.id === user.id), { id: user.id, name: input.name, email: input.email, createdAt: f.store.get("staffAccounts", input.requestId).createdAt, createdBy: f.users.admin.name });
    assert.equal(f.store.get("staffAccounts", input.requestId).createdBy, f.users.admin.id);
    assert.equal(f.store.findUser(input.email, "admin"), undefined);
    assert.equal((await request("admin/staff", input, admin)).statusCode, 200);
    assert.equal((await request("admin/staff", { ...input, name: "Другой" }, admin)).statusCode, 409);
    assert.equal((await request("admin/staff", { ...input, requestId: randomUUID() }, admin)).statusCode, 409);
    assert.equal(f.store.db.prepare("SELECT count(*) n FROM users").get().n, count + 1);
    const jobs = f.store.db.prepare("SELECT payload FROM jobs WHERE id=?").all(`staff-invite:${input.requestId}`); assert.equal(jobs.length, 1);
    assert.ok(!jobs[0].payload.includes("Администратор создал"));
    await f.service.workJobs(); const mail = f.sent.find(item => item.subject === "Доступ разработчика — Node Studio");
    assert.equal(mail.email, input.email); assert.ok(mail.content.includes(`${f.config.origin}/cabinet/`)); assert.ok(mail.content.includes("Вход для сотрудников"));
    assert.ok(!JSON.stringify(created.body).includes("password"));
    const pending = await request("login", { email: input.email, role: "developer" });
    const signed = await request("auth/verify", { code: await emailCode(f, input.email) }, pending);
    assert.equal(signed.body.viewer.id, user.id); assert.equal(signed.body.viewer.role, "developer");
    assert.deepEqual(signed.body.profiles.map(item => item.id), [user.id]);
  } finally { f.close(); }
});

test("public login never creates employee accounts, including a forged staff role on an existing client's email", async () => {
  const f = portalFixture(); const { request } = portalApi(f);
  try {
    const before = f.store.db.prepare("SELECT id,role FROM users ORDER BY id").all();
    for (const role of ["developer", "admin"]) {
      const pending = await request("login", { email: f.users.client.email, role });
      assert.equal(pending.body.kind, "verification");
      assert.equal((await request("auth/verify", { code: "123456" }, pending)).statusCode, 400);
      assert.equal((await request("snapshot", undefined, pending)).body.viewer, null);
      f.store.db.exec("UPDATE auth_challenges SET resend_at=0");
    }
    assert.deepEqual(f.store.db.prepare("SELECT id,role FROM users ORDER BY id").all(), before);
    assert.equal(f.store.db.prepare("SELECT count(*) n FROM jobs WHERE kind='auth.mail'").get().n, 0);
  } finally { f.close(); }
});

test("multiple developers persist; assigned projects, chats, tasks and repositories remain private to their developer", async () => {
  const f = portalFixture(); const { request, login } = portalApi(f);
  const directory = await mkdtemp(join(tmpdir(), "node-staff-")); let store;
  try {
    const owner = await login("admin"); const input = developerInput(); await request("admin/staff", input, owner);
    const pending = await request("login", { email: input.email, role: "developer" });
    const second = await request("auth/verify", { code: await emailCode(f, input.email) }, pending);
    const first = await login("developer");
    assert.equal((await request("action", { type: "project.accept", projectId: "one" }, first)).statusCode, 200);
    const snapshot = await request("snapshot?project=one", undefined, second);
    assert.ok(!snapshot.body.projects.some(project => project.id === "one"));
    assert.ok(!JSON.stringify(snapshot.body).includes("Личная переписка one"));
    for (const action of [
      { type: "project.accept", projectId: "one" },
      { type: "task.status", projectId: "one", number: 1, status: "done" },
      { type: "project.repository.create", projectId: "one" },
      { type: "message", threadId: "chat-one", text: "Forged" },
    ]) assert.equal((await request("action", action, second)).statusCode, 404);
    assert.equal((await request("action", { type: "project.accept", projectId: "two" }, second)).statusCode, 200);
    const path = join(directory, "portal.sqlite"); await backup(f.store.db, path); store = new PortalStore(path);
    assert.equal(store.db.prepare("SELECT count(*) n FROM users WHERE role='developer'").get().n, 2);
    assert.equal(store.get("projects", "two").developerId, f.store.findUser(input.email, "developer").id);
    assert.deepEqual(store.db.prepare("PRAGMA foreign_key_check").all(), []);
  } finally { store?.close(); f.close(); await rm(directory, { recursive: true, force: true }); }
});

test("role changes invalidate both an old profile proof and a pending code for that role", async () => {
  const f = portalFixture(); const { request, login } = portalApi(f);
  try {
    const developer = await login("developer"); const admin = await login("admin");
    const pending = await request("profiles/add", { email: f.users.developer.email, role: "developer" }, admin);
    const code = await emailCode(f, f.users.developer.email);
    f.store.db.prepare("UPDATE users SET role='client' WHERE id=?").run(f.users.developer.id);
    assert.equal((await request("snapshot", undefined, developer)).body.viewer, null);
    assert.equal((await request("auth/verify", { code }, pending)).statusCode, 401);
  } finally { f.close(); }
});

test("migration revokes legacy mixed-role groups once and preserves safe sessions, accounts, foreign keys and project data", async () => {
  const f = portalFixture(); const directory = await mkdtemp(join(tmpdir(), "node-profile-policy-")); const path = join(directory, "portal.sqlite"); let store;
  try {
    const client = f.login("client"); const safe = f.login("developer");
    await f.service.auth.begin(f.users.other.email, "client", { address: "test", agent: "test" }, client.session);
    const mixed = f.store.login(f.users.admin.email, fixturePassword, "test", client.session);
    const before = f.store.db.prepare("SELECT * FROM users ORDER BY id").all(); const project = f.store.get("projects", "one");
    await backup(f.store.db, path); const legacy = new DatabaseSync(path); legacy.exec("DROP TABLE auth_profile_verifications"); legacy.close();
    store = new PortalStore(path); const service = new PortalService(store, f.integrations, f.config);
    assert.equal(service.auth.session(client.token), undefined); assert.equal(service.auth.session(mixed.token), undefined);
    assert.equal(store.db.prepare("SELECT count(*) n FROM auth_challenges WHERE group_id=?").get(client.session.groupId).n, 0);
    assert.equal(service.auth.session(safe.token).viewer.id, safe.session.viewer.id);
    assert.deepEqual(store.db.prepare("SELECT * FROM users ORDER BY id").all(), before); assert.deepEqual(store.get("projects", "one"), project);
    assert.deepEqual(store.db.prepare("PRAGMA foreign_key_check").all(), []);
    store.close(); store = new PortalStore(path); assert.ok(new PortalService(store, f.integrations, f.config).auth.session(safe.token));
  } finally { store?.close(); f.close(); await rm(directory, { recursive: true, force: true }); }
});
