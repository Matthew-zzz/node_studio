import assert from "node:assert/strict";
import { chromium } from "playwright";
import { resolve } from "node:path";
import { createStaticServer } from "../scripts/lib/static-server.mjs";
import { portalFixture } from "./helpers/portal-fixture.mjs";
import { telegramLaunch } from "./helpers/telegram.mjs";
import { completeEmailCode, selectLoginRole } from "./browser/portal.mjs";

const server = createStaticServer(resolve(process.env.SITE_OUTPUT_DIR || "dist")); const frontend = server.listeners("request")[0]; server.removeAllListeners("request");
let fixture; let browser; let worker; const vault = new Map(); const errors = [];
server.on("request", (request, response) => void (request.url.startsWith("/api/portal/") ? fixture.handler(request, response) : frontend(request, response)));
try {
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve)); const origin = `http://127.0.0.1:${server.address().port}`;
  fixture = portalFixture(origin); worker = setInterval(() => void fixture.service.workJobs(), 100);
  browser = await chromium.launch({ headless: true, ...(process.env.CHROMIUM_EXECUTABLE ? { executablePath: process.env.CHROMIUM_EXECUTABLE } : {}) });
  async function open(id, { storageError = false, cookies } = {}) {
    const context = await browser.newContext({ viewport: { width: 320, height: 844 }, reducedMotion: "reduce" });
    if (cookies) await context.addCookies(cookies);
    await context.route("https://telegram.org/js/telegram-web-app.js*", route => route.fulfill({ contentType: "application/javascript", body: "/* native secure storage fixture */" }));
    await context.exposeBinding("nativeVault", (_source, operation) => {
      if (storageError) return { error: "STORAGE_UNAVAILABLE" };
      const key = `${id}:${operation.key}`;
      if (operation.type === "get") return { value: vault.get(key) ?? null };
      if (operation.type === "set") vault.set(key, operation.value); else if (operation.type === "remove") vault.delete(key);
      return { success: true };
    });
    await context.addInitScript(initData => {
      const events = new Map(); const back = new Set();
      const storage = {
        getItem(key, callback) { window.nativeVault({ type: "get", key }).then(result => callback(result.error ?? null, result.value ?? null)); },
        setItem(key, value, callback) { window.nativeVault({ type: "set", key, value }).then(result => callback(result.error ?? null, result.success)); },
        removeItem(key, callback) { window.nativeVault({ type: "remove", key }).then(result => callback(result.error ?? null, result.success)); },
      };
      window.Telegram = { WebApp: {
        initData, platform: "ios", colorScheme: "light", viewportStableHeight: innerHeight, SecureStorage: storage,
        ready() {}, expand() {}, isVersionAtLeast: () => true,
        onEvent(name, callback) { if (!events.has(name)) events.set(name, new Set()); events.get(name).add(callback); }, offEvent(name, callback) { events.get(name)?.delete(callback); },
        setHeaderColor() {}, setBackgroundColor() {}, setBottomBarColor() {}, openLink() {}, openTelegramLink() {},
        BackButton: { show() {}, hide() {}, onClick: callback => back.add(callback), offClick: callback => back.delete(callback) },
      } };
    }, telegramLaunch(fixture.config.telegramToken, id, { query_id: `launch-${id}-${Date.now()}` }));
    const page = await context.newPage(); page.on("pageerror", error => errors.push(error.message));
    await page.goto(origin + "/miniapp/"); return { page, context };
  }
  async function role(page, expected) { await page.waitForFunction(expected => document.querySelector('[data-testid="portal"]')?.dataset.role === expected, expected); }
  async function login(page, expected) {
    await page.getByLabel("Почта", { exact: true }).waitFor(); await selectLoginRole(page, expected);
    await page.getByLabel("Почта", { exact: true }).fill(fixture.users[expected].email);
    await page.getByRole("button", { name: "Получить код", exact: true }).click(); await page.getByLabel("Код из письма", { exact: true }).waitFor();
    await completeEmailCode(page, origin, fixture.users[expected].email); await role(page, expected);
  }
  const codes = () => fixture.sent.filter(mail => mail.subject === "Код для входа — Node Studio").length;
  const aKey = "101:node_login_v1_telegram-101"; const bKey = "202:node_login_v1_telegram-202";
  let current;
  try {
    current = await open(101); await login(current.page, "developer");
    let credential = JSON.parse(vault.get(aKey)); assert.match(credential.token, /^[a-f0-9]{64}$/); assert.ok(credential.expiresAt > Date.now() + 29 * 86_400_000);
    await current.page.getByRole("button", { name: "Открыть меню приложения", exact: true }).click();
    await current.page.getByRole("button", { name: "Добавить профиль: Администратор", exact: true }).click();
    await current.page.getByLabel("Почта профиля", { exact: true }).fill(fixture.users.admin.email);
    await current.page.getByRole("button", { name: "Получить код и добавить", exact: true }).click(); await current.page.getByLabel("Код из письма", { exact: true }).waitFor();
    await completeEmailCode(current.page, origin, fixture.users.admin.email); await role(current.page, "admin");
    const expiry = credential.expiresAt; credential = JSON.parse(vault.get(aKey)); assert.equal(credential.expiresAt, expiry);
    const before = codes(); await current.context.close(); current = await open(101); await role(current.page, "admin");
    assert.equal(codes(), before, "a new WebView without any cookies restores the last confirmed role without a code");
    assert.ok((await current.context.cookies()).some(cookie => cookie.name.startsWith("node_miniapp_session_v2_")), "native restoration repairs the HttpOnly cookie");
    const publicStorage = await current.page.evaluate(() => JSON.stringify({ ...localStorage })); assert.ok(!publicStorage.includes(credential.token));
    await current.context.clearCookies(); await current.page.evaluate(() => window.dispatchEvent(new Event("focus"))); await role(current.page, "admin");
    await current.page.getByRole("button", { name: "Открыть меню приложения", exact: true }).click();
    await current.page.getByRole("button", { name: "Переключиться: Разработчик, developer", exact: true }).click(); await role(current.page, "developer");
    assert.equal(codes(), before); assert.equal(JSON.parse(vault.get(aKey)).expiresAt, expiry); await current.context.close();
    current = await open(101); await role(current.page, "developer"); const aCookies = await current.context.cookies(); await current.context.close();

    vault.set(bKey, vault.get(aKey)); current = await open(202); await current.page.getByLabel("Почта", { exact: true }).waitFor();
    assert.equal(await current.page.getByTestId("portal").count(), 0, "copying a saved credential cannot open another Telegram account");
    await login(current.page, "client"); assert.ok(vault.has(bKey)); await current.context.close();

    current = await open(101, { storageError: true, cookies: aCookies }); await role(current.page, "developer"); await current.context.close();
    current = await open(101); await role(current.page, "developer");
    await current.page.getByRole("button", { name: "Открыть меню приложения", exact: true }).click();
    await current.page.getByRole("button", { name: "Выйти из аккаунтов", exact: true }).click(); await current.page.getByLabel("Почта", { exact: true }).waitFor();
    assert.equal(vault.has(aKey), false); await current.context.close(); current = await open(101); await current.page.getByLabel("Почта", { exact: true }).waitFor(); await current.context.close();
    current = await open(202); await role(current.page, "client");
    await current.page.getByRole("button", { name: "Открыть проект one", exact: true }).click();
    await current.page.getByRole("button", { name: "Открыть меню приложения", exact: true }).click(); await current.page.getByRole("button", { name: "Настройки", exact: true }).click();
    await current.page.getByRole("button", { name: "Безопасность аккаунта", exact: true }).click();
    await current.page.getByRole("button", { name: "Завершить все сеансы", exact: true }).click();
    await current.page.getByRole("button", { name: "Подтвердить завершение сеансов", exact: true }).click(); await current.page.getByLabel("Почта", { exact: true }).waitFor();
    assert.equal(vault.has(bKey), false); await current.context.close(); current = await open(202); await current.page.getByLabel("Почта", { exact: true }).waitFor();
    assert.deepEqual(errors, []); console.log("Persistent Mini App login 320px: secure storage, fresh WebViews without cookies, 30-day fixed expiry, last role, separate Telegram accounts, storage failure, logout and global revocation passed.");
  } finally { await current?.context.close(); }
} finally { await browser?.close(); clearInterval(worker); fixture?.close(); await new Promise(resolve => server.close(resolve)); }
