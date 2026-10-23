import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { chromium } from "playwright";
import { createStaticServer } from "../scripts/lib/static-server.mjs";
import { portalFixture } from "./helpers/portal-fixture.mjs";
import { telegramLaunch } from "./helpers/telegram.mjs";
import { completeEmailCode, selectLoginRole } from "./browser/portal.mjs";

const screenshots = resolve("test-results/screenshots/telegram-auth"); await mkdir(screenshots, { recursive: true });
const server = createStaticServer(resolve(process.env.SITE_OUTPUT_DIR || "dist")); const frontend = server.listeners("request")[0]; server.removeAllListeners("request");
let fixture; let browser; let worker;
server.on("request", (request, response) => void (request.url.startsWith("/api/portal/") ? fixture.handler(request, response) : frontend(request, response)));
try {
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve)); const origin = `http://127.0.0.1:${server.address().port}`;
  fixture = portalFixture(origin); worker = setInterval(() => void fixture.service.workJobs(), 100);
  const a = telegramLaunch(fixture.config.telegramToken, 101); const b = telegramLaunch(fixture.config.telegramToken, 202);
  browser = await chromium.launch({ headless: true, ...(process.env.CHROMIUM_EXECUTABLE ? { executablePath: process.env.CHROMIUM_EXECUTABLE } : {}) });
  const context = await browser.newContext({ viewport: { width: 320, height: 844 }, reducedMotion: "reduce" });
  let releaseSdk; let sdkRequested; const ready = new Promise(resolve => { sdkRequested = resolve; }); const sdkGate = new Promise(resolve => { releaseSdk = resolve; });
  await context.route("https://telegram.org/js/telegram-web-app.js*", async route => { sdkRequested(); await sdkGate; await route.fulfill({ contentType: "application/javascript", body: "/* isolated signed launch bridge */" }); });
  await context.addInitScript(initData => {
    const events = new Map(); const back = new Set();
    window.Telegram = { WebApp: {
      initData, platform: "ios", colorScheme: "light", viewportStableHeight: innerHeight,
      ready() {}, expand() {}, isVersionAtLeast: () => true,
      onEvent(name, callback) { if (!events.has(name)) events.set(name, new Set()); events.get(name).add(callback); },
      offEvent(name, callback) { events.get(name)?.delete(callback); },
      setHeaderColor() {}, setBackgroundColor() {}, setBottomBarColor() {}, openLink() {}, openTelegramLink() {},
      BackButton: { show() {}, hide() {}, onClick: callback => back.add(callback), offClick: callback => back.delete(callback) },
    } };
    window.__switchTelegram = data => { window.Telegram.WebApp.initData = data; events.get("activated")?.forEach(callback => callback()); window.dispatchEvent(new Event("focus")); };
  }, a);
  const page = await context.newPage(); const errors = []; const requests = [];
  page.on("pageerror", error => errors.push(error.message)); page.on("request", request => { if (request.url().startsWith(origin + "/api/portal/")) requests.push(request); });
  async function switchTo(data) { await page.evaluate(data => window.__switchTelegram(data), data); }
  async function role(expected) { await page.waitForFunction(expected => document.querySelector('[data-testid="portal"]')?.dataset.role === expected, expected); }
  try {
    await page.goto(origin + "/miniapp/", { waitUntil: "domcontentloaded" }); await ready;
    await page.getByRole("status").filter({ hasText: "Открываем приложение" }).waitFor(); assert.equal(requests.length, 0, "no shared cookie is read before Telegram SDK readiness");
    releaseSdk(); await page.getByLabel("Почта", { exact: true }).waitFor();
    await selectLoginRole(page, "developer"); await page.getByLabel("Почта", { exact: true }).fill(fixture.users.developer.email);
    await page.getByRole("button", { name: "Получить код", exact: true }).click(); await page.getByLabel("Код из письма", { exact: true }).waitFor();
    await completeEmailCode(page, origin, fixture.users.developer.email); await role("developer");

    await page.getByRole("button", { name: "Открыть меню приложения", exact: true }).click();
    await page.screenshot({ path: resolve(screenshots, "320-staff-switch-menu.png") });
    await page.getByRole("button", { name: "Добавить профиль: Администратор", exact: true }).click();
    const add = page.getByRole("dialog", { name: "Добавить профиль", exact: true });
    await add.getByLabel("Почта профиля", { exact: true }).fill(fixture.users.admin.email);
    await add.getByRole("button", { name: "Получить код и добавить", exact: true }).click();
    await page.getByLabel("Код из письма", { exact: true }).waitFor();
    assert.equal(await page.getByTestId("portal").getAttribute("data-role"), "developer", "administrator access requires its own email code");
    await completeEmailCode(page, origin, fixture.users.admin.email); await role("admin");
    const staffCodes = fixture.sent.filter(mail => mail.subject === "Код для входа — Node Studio").length;
    for (const [expected, label] of [["developer", "Разработчик"], ["admin", "Администратор"], ["developer", "Разработчик"]]) {
      await page.getByRole("button", { name: "Открыть меню приложения", exact: true }).click();
      await page.getByRole("button", { name: `Переключиться: ${label}, ${expected}`, exact: true }).click(); await role(expected);
      await page.getByRole("dialog", { name: "Меню приложения", exact: true }).waitFor({ state: "hidden" });
    }
    assert.equal(fixture.sent.filter(mail => mail.subject === "Код для входа — Node Studio").length, staffCodes);

    await switchTo(b); await page.getByRole("heading", { name: "С возвращением", exact: true }).waitFor(); assert.equal(await page.getByTestId("portal").count(), 0);
    await page.getByLabel("Почта", { exact: true }).fill(fixture.users.client.email); await page.getByRole("button", { name: "Получить код", exact: true }).click();
    await page.getByLabel("Код из письма", { exact: true }).waitFor();
    await switchTo(a); await role("developer"); assert.equal(await page.getByLabel("Код из письма", { exact: true }).count(), 0);
    await switchTo(b); await page.getByLabel("Код из письма", { exact: true }).waitFor();
    await completeEmailCode(page, origin, fixture.users.client.email); await role("client");
    await page.screenshot({ path: resolve(screenshots, "320-profile-b-client.png") });
    const sessions = (await context.cookies()).filter(cookie => cookie.name.startsWith("node_miniapp_session_v2_")); assert.equal(sessions.length, 2); assert.ok(sessions.every(cookie => cookie.httpOnly));

    await switchTo(a); await role("developer");
    let releaseSnapshot; let captured; let hold = true; const capturedSnapshot = new Promise(resolve => { captured = resolve; }); const snapshotGate = new Promise(resolve => { releaseSnapshot = resolve; });
    await page.route("**/api/portal/snapshot?**", async route => {
      if (hold && route.request().headers()["x-telegram-init-data"] === a) { hold = false; const response = await route.fetch(); captured(); await snapshotGate; await route.fulfill({ response }); }
      else await route.continue();
    });
    await page.evaluate(() => window.dispatchEvent(new Event("focus"))); await capturedSnapshot;
    await switchTo(b); await role("client"); releaseSnapshot();
    await page.waitForTimeout(200); assert.equal(await page.getByTestId("portal").getAttribute("data-role"), "client", "a late snapshot for A cannot replace B's account");
    await page.unroute("**/api/portal/snapshot?**");

    await page.getByRole("button", { name: "Открыть меню приложения", exact: true }).click();
    assert.equal(await page.getByRole("button", { name: /Переключиться: (Разработчик|Администратор)/ }).count(), 0);
    await page.getByRole("button", { name: "Выйти из аккаунтов", exact: true }).click(); await page.getByLabel("Почта", { exact: true }).waitFor();
    await switchTo(a); await role("developer"); await page.reload(); await role("developer");
    await switchTo(""); await page.getByRole("status").filter({ hasText: "Закройте и откройте миниапп" }).waitFor(); assert.equal(await page.getByTestId("portal").count(), 0);
    await switchTo(a); await role("developer");
    const web = await context.newPage(); await web.goto(origin + "/cabinet/"); await web.getByLabel("Почта", { exact: true }).waitFor(); assert.equal(await web.getByTestId("portal").count(), 0); await web.close();
    assert.ok(requests.every(request => request.headers()["x-telegram-init-data"] === a || request.headers()["x-telegram-init-data"] === b));
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)); assert.deepEqual(errors, []);
    console.log("Telegram 320px: verified developer/admin menu switching without logout, delayed SDK, A/B profile isolation, codes, late replies, individual logout, reload and web separation passed.");
  } finally { releaseSdk(); await context.close(); }
} finally { await browser?.close(); clearInterval(worker); fixture?.close(); await new Promise(resolve => server.close(resolve)); }
