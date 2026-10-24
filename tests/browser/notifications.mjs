import assert from "node:assert/strict";
import { resolve } from "node:path";
import { fixturePassword } from "../helpers/portal-fixture.mjs";
import { login } from "./portal.mjs";
import { emailCode } from "../helpers/http.mjs";

const visibleToast = '[data-sonner-toast]:not([data-removed="true"])';

export async function checkNotifications(browser, origin, fixture, screenshots) {
  for (const width of [1440, 320]) {
    const role = `notifications-${width}`;
    fixture.store.createUser(`${role}@example.test`, "Уведомления", "client", fixturePassword);
    const context = await browser.newContext({ viewport: { width, height: 900 }, reducedMotion: "reduce" });
    const errors = [];
    try {
      const page = await context.newPage();
      page.on("pageerror", error => errors.push(error.message));
      await page.goto(origin + "/cabinet/");
      await page.getByLabel("Почта", { exact: true }).fill(`${role}@example.test`);
      await page.getByRole("button", { name: "Получить код", exact: true }).click();
      await page.getByLabel("Код из письма", { exact: true }).waitFor();
      const code = await emailCode(fixture, `${role}@example.test`);
      await page.getByLabel("Код из письма", { exact: true }).fill(code === "000000" ? "111111" : "000000");
      const verify = page.getByRole("button", { name: "Подтвердить и войти", exact: true }); await verify.click();
      const mismatch = page.locator(visibleToast).filter({ hasText: "Код указан неверно" }); await mismatch.waitFor();
      assert.equal(await page.locator('main [role="alert"]').count(), 0);
      await page.waitForFunction(() => document.activeElement?.getAttribute("autocomplete") === "one-time-code");
      const bounds = await mismatch.boundingBox(); assert.ok(bounds.y >= 0 && bounds.y < 100 && bounds.x >= 0 && bounds.x + bounds.width <= width + 1);
      assert.equal(await mismatch.evaluate(element => element.closest("section").getAttribute("aria-live")), "polite");
      await page.screenshot({ path: resolve(screenshots, `${width}-notification-light.png`), fullPage: true });
      await page.getByRole("button", { name: "Включить тёмную тему", exact: true }).click();
      await page.locator('[data-sonner-toaster][data-sonner-theme="dark"] [data-sonner-toast]').filter({ hasText: "Код указан неверно" }).waitFor();
      await page.screenshot({ path: resolve(screenshots, `${width}-notification-dark.png`), fullPage: true });
      await mismatch.getByRole("button", { name: "Закрыть уведомление", exact: true }).focus(); await page.keyboard.press("Enter"); await mismatch.waitFor({ state: "detached" });
      await page.getByLabel("Код из письма", { exact: true }).fill(code); await verify.click(); await page.getByTestId("portal").waitFor();

      const syncMessage = "Не удалось обновить GitHub. Повторите попытку.";
      const pattern = "**/api/portal/snapshot?*";
      const interrupted = async route => {
        const response = await route.fetch();
        await route.fulfill({ response, json: { ...await response.json(), syncError: syncMessage } });
      };
      async function refresh() {
        await Promise.all([
          page.waitForResponse(response => response.url().includes("/api/portal/snapshot?")),
          page.evaluate(() => window.dispatchEvent(new Event("focus"))),
        ]);
        await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      }
      await page.route(pattern, interrupted); await refresh();
      const sync = page.locator(visibleToast).filter({ hasText: syncMessage });
      await sync.waitFor();
      for (let i = 0; i < 3; i++) await refresh();
      assert.equal(await sync.count(), 1, "background refreshes do not stack identical errors");
      await sync.getByRole("button", { name: "Повторить", exact: true }).click();
      await sync.waitFor();
      await sync.getByRole("button", { name: "Закрыть уведомление", exact: true }).click();
      await sync.waitFor({ state: "detached" });
      await refresh(); assert.equal(await sync.count(), 0, "dismissed background errors stay dismissed during the same outage");
      await page.unroute(pattern, interrupted); await refresh();
      await page.route(pattern, interrupted); await refresh(); await sync.waitFor();
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
      assert.deepEqual(errors, []);
      if (width === 1440) {
        await page.unroute(pattern, interrupted);
        const name = "Проверка ошибки создания проекта";
        await fixture.service.action(fixture.login("developer").session, { type: "order.create", order: { projectName: name, clientName: "Клиент", email: "notifications-client@example.test", username: "client", brief: "ТЗ", totalKopecks: 10000 } });
        const order = fixture.store.all("orders").find(order => order.projectName === name);
        fixture.service.payOrder(order.checkoutToken, "succeeded");
        await login(page, origin, "developer");
        await page.getByRole("navigation", { name: "Разделы кабинета", exact: true }).getByRole("button", { name: "Проекты и оплаты", exact: true }).click();
        await page.getByRole("group", { name: "Проекты и оплаты", exact: true }).getByRole("button", { name: "Оплаты", exact: true }).click();
        fixture.config.mockProvisioning = false;
        try {
          await page.getByRole("button", { name: "Создать проект и выдать доступ", exact: true }).click();
          const setupError = page.locator(visibleToast).filter({ hasText: "Для выдачи доступа нужны почта" });
          await setupError.waitFor();
          await page.screenshot({ path: resolve(screenshots, "1440-notification-project-error.png"), fullPage: true });
          await setupError.getByRole("button", { name: "Закрыть уведомление", exact: true }).click();
        } finally { fixture.config.mockProvisioning = true; }
      }
    } finally { await context.close(); }
  }
  console.log("Notifications: login and validation errors, success, dismissal, themes, focus, retry and background deduplication passed.");
}
