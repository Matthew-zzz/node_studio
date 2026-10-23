import assert from "node:assert/strict";
import test from "node:test";
import { DatabaseSync, backup } from "node:sqlite";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { portalFixture } from "./helpers/portal-fixture.mjs";
import { portalApi, emailCode } from "./helpers/http.mjs";
import { telegramHeaders, telegramLaunch } from "./helpers/telegram.mjs";
import { PortalStore } from "../server/store.ts";
import { PortalService } from "../server/service.ts";
import { createPortalHandler } from "../server/http.ts";

const merge = (...accounts) => {
  const cookies = new Map(); for (const account of accounts) for (const part of account.cookie.split(";").map(value => value.trim()).filter(Boolean)) { const [name, token] = part.split("="); cookies.set(name, token); }
  return { ...accounts.at(-1), cookie: [...cookies].map(([name, token]) => `${name}=${token}`).join("; ") };
};
const cookie = (account, kind) => account.cookie.split(";").map(value => value.trim()).filter(value => value.includes(`miniapp_${kind}_v2_`)).at(-1);

test("Telegram launch signatures, dates, duplicate fields and numeric identities are checked before reading any session", async () => {
  const f = portalFixture(); const { request } = portalApi(f); const valid = telegramHeaders(f.config.telegramToken, 101);
  try {
    assert.equal((await request("snapshot", undefined, undefined, valid)).body.viewer, null, "a signed Telegram launch does not replace email authentication");
    const epoch = Math.floor(Date.now() / 1000);
    for (const data of [
      "forged", telegramLaunch("another-bot", 101),
      telegramLaunch(f.config.telegramToken, 101, { auth_date: String(epoch - 43_201) }),
      telegramLaunch(f.config.telegramToken, 101, { auth_date: String(epoch + 120) }),
      telegramLaunch(f.config.telegramToken, 101, { user: JSON.stringify({ id: "101" }) }),
      telegramLaunch(f.config.telegramToken, -1), telegramLaunch(f.config.telegramToken, 1.5),
      telegramLaunch(f.config.telegramToken, 101, { user: "null" }),
      valid["x-telegram-init-data"] + "&user=%7B%22id%22%3A202%7D",
      valid["x-telegram-init-data"] + "&hash=" + "0".repeat(64),
    ]) assert.equal((await request("snapshot", undefined, undefined, { ...valid, "x-telegram-init-data": data })).statusCode, 401);
    assert.equal((await request("snapshot", undefined, undefined, { "x-portal-client": "miniapp", "x-telegram-context": "telegram" })).statusCode, 401);
    assert.equal((await request("login", { email: f.users.client.email }, undefined, { "x-portal-client": "miniapp" })).statusCode, 401, "an old client cannot fall back to shared browser authorization");
    f.config.telegramToken = ""; assert.equal((await request("snapshot", undefined, undefined, valid)).statusCode, 503);
  } finally { f.close(); }
});

test("two Telegram profiles share a cookie jar while sessions, roles, logout and the browser remain isolated", async () => {
  const f = portalFixture(); const { request, login } = portalApi(f);
  const a = telegramHeaders(f.config.telegramToken, 101); const b = telegramHeaders(f.config.telegramToken, 202);
  async function signed(role, headers, account) {
    const pending = await request("login", { email: f.users[role].email, role }, account, headers); assert.equal(pending.body.kind, "verification");
    return request("auth/verify", { code: await emailCode(f, f.users[role].email) }, pending, headers);
  }
  try {
    const web = await login("client"); const first = await signed("developer", a, web);
    assert.equal(first.body.viewer.role, "developer");
    assert.equal((await request("snapshot", undefined, first, b)).body.viewer, null);
    const second = await signed("client", b, first); const jar = merge(first, second);
    for (const [headers, role] of [[a, "developer"], [b, "client"]]) { const snapshot = await request("snapshot", undefined, jar, headers); assert.equal(snapshot.body.viewer.role, role); assert.deepEqual(snapshot.body.profiles.map(user => user.role), [role]); }
    assert.equal((await request("snapshot", undefined, jar)).body.viewer.id, f.users.client.id);
    assert.equal((await request("snapshot", undefined, jar, { "x-portal-client": "miniapp", "x-telegram-context": "browser" })).body.viewer, null);
    const aToken = cookie(first, "session").split("=")[1]; const bName = cookie(second, "session").split("=")[0];
    const copied = { ...second, cookie: `${bName}=${aToken}` };
    assert.equal((await request("snapshot", undefined, copied, b)).body.viewer, null, "renaming a stolen cookie cannot cross the server context binding");
    const copiedToWeb = { ...first, cookie: `nodo_session=${aToken}` };
    assert.equal((await request("snapshot", undefined, copiedToWeb)).body.viewer, null);
    const sameProfileNewLaunch = telegramHeaders(f.config.telegramToken, 101, { query_id: "another-launch", user: JSON.stringify({ id: 101, first_name: "Renamed", username: "new_username" }) });
    assert.equal((await request("snapshot", undefined, jar, sameProfileNewLaunch)).body.viewer.role, "developer", "the stable signed numeric ID preserves login across launches and username changes");
    const logout = await request("logout", {}, { ...jar, body: first.body }, a); assert.equal(logout.statusCode, 200);
    assert.equal((await request("snapshot", undefined, logout, a)).body.viewer, null);
    assert.equal((await request("snapshot", undefined, logout, b)).body.viewer.role, "client");
    assert.equal((await request("snapshot", undefined, logout)).body.viewer.role, "client");
  } finally { f.close(); }
});

test("email codes and cancellation belong to their Telegram profile and cannot be transferred through renamed cookies", async () => {
  const f = portalFixture(); const { request } = portalApi(f);
  const a = telegramHeaders(f.config.telegramToken, 101); const b = telegramHeaders(f.config.telegramToken, 202);
  try {
    const first = await request("login", { email: f.users.client.email, role: "client" }, undefined, a);
    const second = await request("login", { email: f.users.other.email, role: "client" }, first, b);
    const code = await emailCode(f, f.users.client.email); const jar = merge(first, second);
    const aValue = cookie(first, "challenge").split("=")[1]; const bName = cookie(second, "challenge").split("=")[0];
    const copied = { ...jar, cookie: `${bName}=${aValue}` };
    assert.equal((await request("auth/verify", { code }, copied, b)).statusCode, 401);
    assert.equal((await request("auth/resend", {}, copied, b)).statusCode, 401);
    await request("auth/cancel", {}, copied, b);
    assert.equal((await request("auth/challenge", undefined, jar, a)).body.challenge.role, "client");
    assert.equal((await request("auth/verify", { code }, jar, a)).body.viewer.id, f.users.client.id);
    assert.equal((await request("auth/challenge", undefined, jar, b)).body.challenge.email.includes("@"), true);
  } finally { f.close(); }
});

test("the previous shared Mini App cookies are retired, browser sessions migrate safely and new bindings survive restart", async () => {
  const f = portalFixture(); const directory = await mkdtemp(join(tmpdir(), "node-telegram-context-")); let store;
  const { request, login } = portalApi(f); const a = telegramHeaders(f.config.telegramToken, 101);
  try {
    const web = await login("developer"); const token = web.cookie.match(/nodo_session=([a-f0-9]+)/)[1];
    for (const name of ["node_miniapp_session", "node_miniapp_session_v2_browser"]) assert.equal((await request("snapshot", undefined, { ...web, cookie: `${name}=${token}` }, name.endsWith("browser") ? { "x-portal-client": "miniapp", "x-telegram-context": "browser" } : a)).body.viewer, null);
    const pending = await request("login", { email: f.users.client.email, role: "client" }, undefined, a);
    const signed = await request("auth/verify", { code: await emailCode(f, f.users.client.email) }, pending, a);
    const path = join(directory, "portal.sqlite"); await backup(f.store.db, path); store = new PortalStore(path); const service = new PortalService(store, f.integrations, f.config);
    const restored = { ...f, handler: createPortalHandler(service, f.config) };
    assert.equal((await portalApi(restored).request("snapshot", undefined, signed, a)).body.viewer.id, f.users.client.id);
    assert.equal((await portalApi(restored).request("snapshot", undefined, web)).body.viewer.id, f.users.developer.id);
    assert.deepEqual(store.db.prepare("PRAGMA foreign_key_check").all(), []);
  } finally { store?.close(); f.close(); await rm(directory, { recursive: true, force: true }); }
});

test("upgrading the deployed schema preserves existing web sessions, active email codes and account identities", async () => {
  const f = portalFixture(); const directory = await mkdtemp(join(tmpdir(), "node-telegram-upgrade-")); let store;
  try {
    const { request, login } = portalApi(f); const web = await login("developer");
    const pending = await request("login", { email: f.users.client.email, role: "client" }); const code = await emailCode(f, f.users.client.email);
    const before = f.store.db.prepare("SELECT id,email,role FROM users ORDER BY id").all();
    const path = join(directory, "portal.sqlite"); await backup(f.store.db, path);
    const legacy = new DatabaseSync(path); legacy.exec("DROP TABLE auth_session_contexts; ALTER TABLE auth_challenges DROP COLUMN context"); legacy.close();
    store = new PortalStore(path); const service = new PortalService(store, f.integrations, f.config); const upgraded = portalApi({ ...f, handler: createPortalHandler(service, f.config) });
    assert.equal((await upgraded.request("snapshot", undefined, web)).body.viewer.id, f.users.developer.id);
    assert.equal((await upgraded.request("auth/verify", { code }, pending)).body.viewer.id, f.users.client.id);
    assert.deepEqual(store.db.prepare("SELECT id,email,role FROM users ORDER BY id").all(), before);
    assert.deepEqual(store.db.prepare("PRAGMA foreign_key_check").all(), []);
  } finally { store?.close(); f.close(); await rm(directory, { recursive: true, force: true }); }
});
