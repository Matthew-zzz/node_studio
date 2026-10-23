import { portalApi } from "./helpers/http.mjs";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { PortalStore } from "../server/store.ts";
import { portalFixture, fixturePassword } from "./helpers/portal-fixture.mjs";

const api = fixture => portalApi(fixture, true).request;

test("profiles require individual login, rotate authentication, isolate devices and preserve server permissions", async () => {
  const f = portalFixture(); const request = api(f);
  try {
    const credentials = role => ({ email: f.users[role].email, password: fixturePassword });
    const otherDevice = await request("login", credentials("developer"));
    assert.equal((await request("profiles/switch", { userId: f.users.developer.id })).statusCode, 401);
    assert.equal((await request("profiles/add", credentials("developer"))).statusCode, 401);
    const client = await request("login", credentials("client"));
    assert.deepEqual(client.body.profiles.map(profile => profile.id), [f.users.client.id]);
    assert.equal((await request("profiles/switch", { userId: f.users.developer.id, role: "developer" }, client)).statusCode, 404);
    assert.equal((await request("profiles/add", credentials("developer"), client, { "x-csrf-token": "" })).statusCode, 403);
    assert.equal((await request("profiles/add", credentials("developer"), client, { origin: "https://another.test" })).statusCode, 403);
    const pending = await portalApi(f).request("profiles/add", credentials("developer"), client);
    assert.equal(pending.body.kind, "verification");
    assert.equal((await portalApi(f).request("auth/verify", { code: "invalid" }, pending)).statusCode, 400);
    f.store.db.exec("UPDATE auth_challenges SET resend_at=0");
    assert.equal((await request("snapshot", undefined, client)).body.viewer.id, f.users.client.id);
    const developer = await request("profiles/add", credentials("developer"), client);
    assert.equal(developer.statusCode, 200);
    assert.equal(developer.body.viewer.role, "developer");
    assert.equal(developer.body.profiles.length, 2);
    assert.ok([developer.headers["Set-Cookie"]].flat().some(cookie => cookie.includes("HttpOnly; SameSite=Lax")));
    const switched = await request("profiles/switch", { userId: f.users.client.id }, developer);
    assert.equal(switched.statusCode, 200);
    assert.notEqual(switched.cookie, client.cookie); assert.notEqual(switched.body.csrf, client.body.csrf);
    assert.deepEqual(switched.body.projects.map(project => project.id), ["one", "two"]);
    assert.ok(!JSON.stringify(switched.body).includes("Личная переписка three"));
    assert.equal((await request("snapshot", undefined, client)).body.viewer, null, "previous token was rotated");
    assert.equal((await request("profiles/switch", { userId: f.users.developer.id }, switched, { "x-csrf-token": developer.body.csrf })).statusCode, 403, "stale tabs cannot write with a previous profile's CSRF");
    assert.equal((await request("action", { type: "task.status", projectId: "one", number: 1, status: "done", role: "developer" }, switched)).statusCode, 403);
    const back = await request("profiles/switch", { userId: f.users.developer.id }, switched);
    assert.equal(back.body.viewer.role, "developer");
    assert.equal((await request("logout", {}, back)).statusCode, 200);
    for (const account of [switched, developer, back]) assert.equal((await request("snapshot", undefined, account)).body.viewer, null);
    assert.equal((await request("snapshot", undefined, otherDevice)).body.viewer.role, "developer", "logout affects this device only");
    assert.deepEqual((await request("snapshot")).body.profiles, []);
  } finally { f.close(); }
});

test("saved profiles expire without renewal and password changes revoke them on other devices", () => {
  const f = portalFixture();
  try {
    const client = f.login("client");
    let developer = f.store.login(f.users.developer.email, fixturePassword, "test", client.session);
    const expires = Date.now() + 60_000;
    f.store.db.prepare("UPDATE sessions SET expires=? WHERE token_hash=?").run(expires, client.session.tokenHash);
    const switched = f.store.switchProfile(developer.session, f.users.client.id);
    assert.equal(f.store.db.prepare("SELECT expires FROM sessions WHERE token_hash=?").get(switched.session.tokenHash).expires, expires);
    const elsewhere = f.login("client");
    f.store.changePassword(elsewhere.session, fixturePassword, "New-profile-password-2026");
    assert.equal(f.store.session(switched.token), undefined);
    assert.throws(() => f.store.switchProfile(developer.session, f.users.client.id), { status: 404 });
    assert.deepEqual(f.store.profiles(developer.session).map(profile => profile.role), [], "the whole affected device group is revoked");
    developer = f.login("developer");
    const intake = f.store.login(f.users.admin.email, fixturePassword, "test", developer.session);
    f.store.db.prepare("UPDATE sessions SET expires=0 WHERE token_hash=?").run(developer.session.tokenHash);
    assert.throws(() => f.store.switchProfile(intake.session, f.users.developer.id), { status: 404 });
    assert.deepEqual(f.store.profiles(intake.session).map(profile => profile.role), ["admin"]);
  } finally { f.close(); }
});

test("profile groups survive updates and existing session schemas migrate without signing users out", async () => {
  const directory = await mkdtemp(join(tmpdir(), "nodo-profiles-")); const path = join(directory, "portal.sqlite");
  let store = new PortalStore(path);
  try {
    const client = store.createUser("client@example.test", "Client", "client", fixturePassword, false);
    const developer = store.createUser("developer@example.test", "Developer", "developer", fixturePassword, false);
    const initial = store.login(client.email, fixturePassword, "test");
    // Simulate the schema deployed before multi-account support.
    store.db.exec("DROP INDEX sessions_group; ALTER TABLE sessions DROP COLUMN group_id");
    store.close(); store = new PortalStore(path);
    const migrated = store.session(initial.token); assert.equal(migrated.viewer.id, client.id);
    const added = store.login(developer.email, fixturePassword, "test", migrated);
    store.close(); store = new PortalStore(path);
    const restored = store.session(added.token);
    assert.equal(store.profiles(restored).length, 2);
    assert.equal(store.switchProfile(restored, client.id).session.viewer.id, client.id);
  } finally { store.close(); await rm(directory, { recursive: true, force: true }); }
});
