import assert from "node:assert/strict";
import { resolve } from "node:path";
import { completeEmailCode } from "./portal.mjs";
import { fixturePassword } from "../helpers/portal-fixture.mjs";

export async function checkEmailAuthentication(browser, origin, fixture, screenshots) {
  const email = "owner@example.test"; const roles = ["client", "developer", "admin"];
  const original = roles.map(role => ({ ...fixture.users[role] }));
  const hash = fixture.store.db.prepare("SELECT password FROM users WHERE id=?").get(fixture.users.client.id).password;
  for (const user of original) fixture.store.db.prepare("UPDATE users SET email=?,password=? WHERE id=?").run(email, hash, user.id);
  fixture.store.db.exec("DELETE FROM sessions; DELETE FROM auth_verifications; DELETE FROM auth_challenges; DELETE FROM auth_limits; DELETE FROM login_limits; DELETE FROM jobs WHERE kind='auth.mail'");
  try {
    for (const width of [1440, 320]) {
      const context = await browser.newContext({ viewport: { width, height: 900 }, reducedMotion: "reduce" }); const errors = [];
      try {
        const page = await context.newPage(); page.on("pageerror", error => errors.push(error.message));
        const notices = () => fixture.sent.filter(mail => mail.email === email && mail.subject === "Код для входа — Node Studio");
        async function begin(password = fixturePassword) {
          await page.getByRole("combobox", { name: "Профиль", exact: true }).selectOption("client");
          await page.getByLabel("Почта", { exact: true }).fill(email);
          await page.getByLabel("Пароль", { exact: true }).fill(password);
          await page.getByRole("button", { name: "Войти в кабинет", exact: true }).click();
          await page.getByLabel("Код из письма", { exact: true }).waitFor();
        }
        let releasePending;
        if (width === 1440) {
          const gate = new Promise(resolve => { releasePending = resolve; });
          await page.route("**/api/portal/auth/challenge", async route => {
            const response = await route.fetch(); await gate; await route.fulfill({ response });
          });
        }
        await page.goto(origin + "/cabinet/"); await begin();
        if (releasePending) {
          const late = page.waitForResponse(response => response.url().endsWith("/api/portal/auth/challenge"));
          releasePending(); await late;
          await page.getByLabel("Код из письма", { exact: true }).waitFor();
          await page.unroute("**/api/portal/auth/challenge");
        }
        assert.equal((await (await page.request.get(origin + "/api/portal/snapshot")).json()).viewer, null);
        const valid = notices().at(-1).content.match(/\b\d{6}\b/)[0];
        await page.getByLabel("Код из письма", { exact: true }).fill(valid === "000000" ? "111111" : "000000");
        await page.getByRole("button", { name: "Подтвердить и войти", exact: true }).click();
        await page.locator('[data-sonner-toast]').filter({ hasText: "Код указан неверно" }).waitFor();
        await page.getByRole("button", { name: "Включить тёмную тему", exact: true }).click();
        await page.screenshot({ path: resolve(screenshots, `${width}-email-code-dark.png`), fullPage: true });
        await completeEmailCode(page, origin, email); await page.getByTestId("portal").waitFor();
        const count = notices().length;
        const cookie = (await context.cookies()).find(cookie => cookie.name === "nodo_session");
        assert.ok(cookie.httpOnly && cookie.expires * 1000 > Date.now());
        assert.ok(cookie.expires * 1000 <= Date.now() + 12 * 3_600_000);
        if (width <= 650) await page.getByRole("button", { name: "Открыть профили", exact: true }).click();
        const profiles = page.getByRole("group", { name: "Переключение профилей", exact: true });
        assert.equal(await profiles.getByRole("button", { name: /^Переключиться:/ }).count(), 3);
        await profiles.getByRole("button", { name: "Переключиться: Администратор, admin", exact: true }).click();
        await page.getByRole("heading", { name: "ИИ-агент Telegram", exact: true }).waitFor();
        await page.reload(); await page.getByTestId("portal").waitFor(); assert.equal(notices().length, count);
        fixture.store.db.exec("UPDATE sessions SET expires=0");
        await page.evaluate(() => window.dispatchEvent(new Event("focus")));
        await page.getByRole("heading", { name: "С возвращением", exact: true }).waitFor();
        await begin(); assert.equal(notices().length, count + 1); await completeEmailCode(page, origin, email);
        await page.getByTestId("portal").waitFor(); await fixture.service.workJobs();
        const security = fixture.sent.filter(mail => mail.email === email && mail.subject === "Новый вход — Node Studio").at(-1);
        const token = security.content.match(/\/recover\/#([a-f0-9]{64})/)[1];
        const recovery = await context.newPage(); recovery.on("pageerror", error => errors.push(error.message));
        await recovery.goto(`${origin}/recover/#${token}`);
        await recovery.getByLabel("Новый пароль · от 12 символов", { exact: true }).waitFor();
        assert.ok((await (await page.request.get(origin + "/api/portal/snapshot")).json()).viewer, "opening a link does not end sessions");
        const password = `New-browser-password-${width}`;
        await recovery.getByLabel("Новый пароль · от 12 символов", { exact: true }).fill(password);
        await recovery.getByLabel("Повторите новый пароль", { exact: true }).fill(password);
        await recovery.getByRole("button", { name: "Сменить пароль и завершить все сеансы", exact: true }).click();
        await recovery.getByRole("heading", { name: "Доступ защищён", exact: true }).waitFor();
        await page.getByRole("heading", { name: "С возвращением", exact: true }).waitFor();
        assert.ok(!new URL(recovery.url()).hash);
        await page.getByLabel("Почта", { exact: true }).fill(email); await page.getByLabel("Пароль", { exact: true }).fill(fixturePassword);
        await page.getByRole("button", { name: "Войти в кабинет", exact: true }).click();
        await page.locator('[data-sonner-toast]').filter({ hasText: "Проверьте почту и пароль." }).waitFor();
        await begin(password); await completeEmailCode(page, origin, email); await page.getByTestId("portal").waitFor();
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)); assert.deepEqual(errors, []);
        fixture.store.transaction(() => fixture.store.resetIdentityPassword(email, fixturePassword));
        fixture.store.db.exec("DELETE FROM auth_limits; DELETE FROM login_limits");
        console.log(`Email authentication ${width}px: required code, three roles, expiry, notification recovery, global logout and new-password login passed`);
      } finally { await context.close(); }
    }
  } finally {
    for (const user of original) fixture.store.db.prepare("UPDATE users SET email=?,password=? WHERE id=?").run(user.email, hash, user.id);
  }
}
