import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { chromium } from "playwright";
import { createStaticServer } from "../scripts/lib/static-server.mjs";
import { portalFixture } from "./helpers/portal-fixture.mjs";
import { completeEmailCode, selectLoginRole } from "./browser/portal.mjs";

const screenshots = resolve("test-results/screenshots/staff"); await mkdir(screenshots, { recursive: true });
const server = createStaticServer(resolve(process.env.SITE_OUTPUT_DIR || "dist"));
const frontend = server.listeners("request")[0]; server.removeAllListeners("request");
let fixture; let browser;
server.on("request", (request, response) => void (request.url.startsWith("/api/portal/") ? fixture.handler(request, response) : frontend(request, response)));
try {
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve)); const origin = `http://127.0.0.1:${server.address().port}`;
  browser = await chromium.launch({ headless: true, ...(process.env.CHROMIUM_EXECUTABLE ? { executablePath: process.env.CHROMIUM_EXECUTABLE } : {}) });
  for (const [presentation, width] of [["web", 1440], ["web", 320], ["miniapp", 390], ["miniapp", 320]]) {
    fixture = portalFixture(origin); const context = await browser.newContext({ viewport: { width, height: 900 }, reducedMotion: "reduce" });
    await context.route("https://telegram.org/js/telegram-web-app.js*", route => route.fulfill({ contentType: "application/javascript", body: "/* isolated bridge */" }));
    const page = await context.newPage(); const errors = []; page.on("pageerror", error => errors.push(error.message));
    const mini = presentation === "miniapp"; const path = mini ? "/miniapp/" : "/cabinet/";
    const fits = async () => assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1 && [...document.querySelectorAll("dialog[open]")].every(element => element.scrollWidth <= element.clientWidth + 1)), `${presentation} ${width}px: content fits`);
    async function signIn(role, email = `${role}@example.test`) {
      await page.goto(origin + path); await page.getByLabel("Почта", { exact: true }).waitFor();
      assert.equal(await page.getByRole("combobox", { name: "Профиль", exact: true }).count(), 0, "public client entry has no role selector");
      await selectLoginRole(page, role); await page.getByLabel("Почта", { exact: true }).fill(email);
      await page.getByRole("button", { name: "Получить код", exact: true }).click(); await page.getByLabel("Код из письма", { exact: true }).waitFor();
      await completeEmailCode(page, origin, email); await page.getByTestId("portal").waitFor(); fixture.store.db.exec("DELETE FROM auth_limits");
    }
    async function signOut() {
      if (mini) { await page.getByRole("button", { name: "Открыть меню приложения", exact: true }).click(); await page.getByRole("button", { name: "Выйти из аккаунтов", exact: true }).click(); }
      else await page.getByRole("button", { name: "Выйти", exact: true }).click();
      await page.getByLabel("Почта", { exact: true }).waitFor();
    }
    try {
      await signIn("admin");
      if (mini) await page.getByRole("button", { name: "Открыть меню приложения", exact: true }).click();
      else if (width <= 650) await page.getByRole("button", { name: "Открыть меню кабинета", exact: true }).click();
      await page.getByRole("button", { name: "Разработчики", exact: true }).click();
      const staff = page.getByRole("region", { name: "Аккаунты разработчиков", exact: true });
      await staff.getByText("developer@example.test", { exact: true }).waitFor();
      const create = staff.getByRole("button", { name: "Создать разработчика", exact: true }); await create.click();
      const dialog = page.getByRole("dialog", { name: "Создать разработчика", exact: true });
      await dialog.getByLabel("Имя разработчика", { exact: true }).fill("Участник команды");
      await dialog.getByLabel("Почта разработчика", { exact: true }).fill("new-developer@example.test");
      assert.equal(await dialog.getByRole("combobox").count(), 0); await fits();
      await dialog.getByRole("button", { name: "Создать аккаунт", exact: true }).click(); await dialog.waitFor({ state: "hidden" });
      await staff.getByText("new-developer@example.test", { exact: true }).waitFor();
      await page.locator('[data-sonner-toast][data-type="success"]').filter({ hasText: "Аккаунт разработчика создан." }).waitFor();
      await fits(); await page.screenshot({ path: resolve(screenshots, `${presentation}-${width}-admin.png`), fullPage: true });
      await signOut(); await signIn("developer", "new-developer@example.test"); assert.equal(await page.getByTestId("portal").getAttribute("data-role"), "developer");
      await signOut(); await signIn("client");
      if (mini) await page.getByRole("button", { name: "Открыть меню приложения", exact: true }).click();
      else if (width <= 650) await page.getByRole("button", { name: "Открыть профили", exact: true }).click();
      assert.equal(await page.getByRole("button", { name: /Добавить профиль: (Разработчик|Администратор)/ }).count(), 0);
      assert.equal(await page.getByRole("button", { name: "Разработчики", exact: true }).count(), 0);
      const snapshot = await page.request.get(origin + "/api/portal/snapshot", { headers: mini ? { "X-Portal-Client": "miniapp" } : {} }).then(response => response.json());
      assert.deepEqual(snapshot.profiles.map(profile => profile.role), ["client"]);
      const forged = await page.request.post(origin + "/api/portal/admin/staff", { headers: { Origin: origin, "X-CSRF-Token": snapshot.csrf, ...(mini ? { "X-Portal-Client": "miniapp" } : {}) }, data: { type: "developer.create", requestId: "forged", email: "forged@example.test", name: "Forged", role: "admin" } });
      assert.equal(forged.status(), 403); assert.deepEqual(errors, []); await fits();
      console.log(`Staff ${presentation} ${width}px: admin creates and invites a developer, email login works, client UI and direct API deny staff creation.`);
    } catch (error) { await page.screenshot({ path: resolve(screenshots, `${presentation}-${width}-failure.png`), fullPage: true }).catch(() => {}); throw error; }
    finally { await context.close(); fixture.close(); }
  }
} finally { await browser?.close(); await new Promise(resolve => server.close(resolve)); }
