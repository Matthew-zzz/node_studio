import assert from "node:assert/strict";
import test from "node:test";
import { portalFixture, fixturePassword } from "./helpers/portal-fixture.mjs";
import { portalApi, emailCode } from "./helpers/http.mjs";
import { configureTelegramMenu } from "../server/telegram-menu.ts";
import { readConfig } from "../server/config.ts";

const headers = { "x-portal-client": "miniapp" };


test("Mini App requires email proof and uses separate secure partitioned cookies without changing web sessions", async () => {
  const f = portalFixture("https://studio.example.test"); const { request, login } = portalApi(f);
  try {
    const web = await login("client", fixturePassword);
    assert.ok(web.cookie.includes("__Host-nodo_session="));
    assert.equal((await request("snapshot", undefined, web, headers)).body.viewer, null);
    const pending = await request("login", { email: f.users.client.email, password: fixturePassword, role: "client", initDataUnsafe: { user: { id: f.users.admin.id, role: "admin" } } }, undefined, headers);
    assert.equal(pending.body.kind, "verification");
    assert.ok(pending.cookie.includes("__Host-node_miniapp_challenge="));
    const challengeCookie = pending.headers["Set-Cookie"];
    assert.ok(challengeCookie.includes("SameSite=None")); assert.ok(challengeCookie.includes("Secure; Partitioned"));
    assert.equal((await request("snapshot", undefined, pending, headers)).body.viewer, null);
    assert.equal((await request("auth/verify", { code: await emailCode(f, f.users.client.email) }, pending)).statusCode, 401, "a Mini App code cannot be consumed using the web cookie context");
    const miniapp = await request("auth/verify", { code: await emailCode(f, f.users.client.email) }, pending, headers);
    assert.equal(miniapp.body.viewer.id, f.users.client.id); assert.equal(miniapp.body.viewer.role, "client");
    const cookie = miniapp.headers["Set-Cookie"].find(value => value.startsWith("__Host-node_miniapp_session="));
    assert.ok(cookie.includes("HttpOnly; SameSite=None")); assert.ok(cookie.endsWith("Secure; Partitioned"));
    assert.ok(Number(cookie.match(/Max-Age=(\d+)/)[1]) <= 43200);
    assert.equal((await request("admin/agent", undefined, miniapp, headers)).statusCode, 403);
    assert.equal((await request("action", { type: "takeover", threadId: "chat-one" }, miniapp, { ...headers, origin: "https://evil.test" })).statusCode, 403);
    assert.equal((await request("logout", {}, miniapp, { ...headers, "x-csrf-token": "wrong" })).statusCode, 403);
    await request("logout", {}, miniapp, headers);
    assert.equal((await request("snapshot", undefined, miniapp, headers)).body.viewer, null);
    assert.equal((await request("snapshot", undefined, web)).body.viewer.id, f.users.client.id);
  } finally { f.close(); }
});

test("Mini App local development keeps HttpOnly Lax cookies and never creates a session from Telegram metadata", async () => {
  const f = portalFixture(); const { request } = portalApi(f);
  try {
    const result = await request("login", { role: "admin", email: f.users.admin.email, password: "Wrong-password", initData: "forged" }, undefined, headers);
    assert.equal(result.statusCode, 200); assert.equal(result.body.kind, "verification"); assert.ok(!result.cookie.includes("nodo_session="));
    const pending = await request("login", { role: "client", email: f.users.client.email, password: fixturePassword }, undefined, headers);
    assert.ok(pending.headers["Set-Cookie"].includes("HttpOnly; SameSite=Lax"));
    assert.ok(!pending.headers["Set-Cookie"].includes("Partitioned"));
  } finally { f.close(); }
});

test("operator configures and verifies a Telegram web-app menu without sending messages or changing the webhook", async () => {
  const config = readConfig({ PORTAL_ORIGIN: "https://studio.example.test", PORTAL_TELEGRAM_TOKEN: "test-only-token" });
  const calls = []; let menu;
  const result = await configureTelegramMenu(config, async (url, init) => {
    const method = new URL(url).pathname.split("/").at(-1); calls.push(method);
    if (method === "getMe") return Response.json({ ok: true, result: { username: "fixture_bot", is_bot: true } });
    if (method === "setChatMenuButton") { menu = JSON.parse(init.body).menu_button; return Response.json({ ok: true, result: true }); }
    if (method === "getChatMenuButton") return Response.json({ ok: true, result: menu });
    throw new Error("Unexpected Telegram mutation");
  });
  assert.deepEqual(calls, ["getMe", "setChatMenuButton", "getChatMenuButton"]);
  assert.equal(result.bot, "fixture_bot"); assert.equal(result.menu.web_app.url, "https://studio.example.test/miniapp/");
  await assert.rejects(configureTelegramMenu(readConfig({})), { status: 503 });
});
