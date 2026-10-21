import assert from "node:assert/strict";
import { resolve } from "node:path";
import { fixturePassword } from "../helpers/portal-fixture.mjs";
import { login } from "./portal.mjs";

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
      await page.getByLabel("Пароль", { exact: true }).fill("Incorrect-password");
      await page.getByRole("button", { name: "Войти в кабинет", exact: true }).click();
      await page.locator(visibleToast).filter({ hasText: "Проверьте почту и пароль." }).waitFor();
      assert.equal(await page.locator('main [role="alert"]').count(), 0, "errors use notifications instead of page banners");
      await login(page, origin, role);
      const save = page.getByRole("button", { name: "Сохранить пароль", exact: true });
      await page.getByLabel("Временный пароль", { exact: true }).fill(fixturePassword);
      await page.getByLabel("Новый пароль · от 12 символов", { exact: true }).fill("Updated-notification-password");
      await page.getByLabel("Повторите новый пароль", { exact: true }).fill("Different-notification-password");
      await save.click();
      const mismatch = page.locator(visibleToast).filter({ hasText: "Пароли не совпадают." });
      await mismatch.waitFor();
      assert.ok(await save.evaluate(element => document.activeElement === element), "notifications preserve form focus");
      const bounds = await mismatch.boundingBox();
      assert.ok(bounds.y >= 0 && bounds.y < 100 && bounds.x >= 0 && bounds.x + bounds.width <= width + 1);
      assert.equal(await mismatch.evaluate(element => element.closest("section").getAttribute("aria-live")), "polite");
      await page.screenshot({ path: resolve(screenshots, `${width}-notification-light.png`), fullPage: true });
      await page.getByRole("button", { name: "Включить тёмную тему", exact: true }).click();
      await page.locator('[data-sonner-toaster][data-sonner-theme="dark"] [data-sonner-toast]').filter({ hasText: "Пароли не совпадают." }).waitFor();
      await page.screenshot({ path: resolve(screenshots, `${width}-notification-dark.png`), fullPage: true });
      await mismatch.getByRole("button", { name: "Закрыть уведомление", exact: true }).focus();
      await page.keyboard.press("Enter"); await mismatch.waitFor({ state: "detached" });
      await page.getByLabel("Повторите новый пароль", { exact: true }).fill("Updated-notification-password");
      await save.click();
      const success = page.locator(visibleToast).filter({ hasText: "Пароль сохранён." });
      await success.waitFor();
      await success.waitFor({ state: "detached", timeout: 7000 });

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
        await fixture.service.action(fixture.login("curator").session, { type: "order.create", order: { projectName: name, clientName: "Клиент", email: "notifications-client@example.test", username: "client", brief: "ТЗ", totalKopecks: 10000 } });
        const order = fixture.store.all("orders").find(order => order.projectName === name);
        fixture.service.payOrder(order.checkoutToken, "succeeded");
        await login(page, origin, "curator");
        await page.getByRole("navigation", { name: "Разделы кабинета", exact: true }).getByRole("button", { name: "Создание проектов", exact: true }).click();
        fixture.config.mockProvisioning = false;
        try {
          await page.getByRole("button", { name: "Создать проект и выдать доступ", exact: true }).click();
          const setupError = page.locator(visibleToast).filter({ hasText: "Для создания проекта нужны GitHub" });
          await setupError.waitFor();
          await page.screenshot({ path: resolve(screenshots, "1440-notification-project-error.png"), fullPage: true });
          await setupError.getByRole("button", { name: "Закрыть уведомление", exact: true }).click();
        } finally { fixture.config.mockProvisioning = true; }
      }
    } finally { await context.close(); }
  }
  console.log("Notifications: login and validation errors, success, dismissal, themes, focus, retry and background deduplication passed.");
}
