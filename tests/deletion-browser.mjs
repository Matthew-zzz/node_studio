import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { chromium } from "playwright";
import { createStaticServer } from "../scripts/lib/static-server.mjs";
import { portalFixture } from "./helpers/portal-fixture.mjs";
import { completeEmailCode, login, openProject, preparePortalFixture } from "./browser/portal.mjs";
import { chooseAction, closeDialog } from "./browser/focus-dialogs.mjs";

const screenshots = resolve("test-results/screenshots/deletion"); await mkdir(screenshots, { recursive: true });
const server = createStaticServer(resolve("dist")); const frontend = server.listeners("request")[0]; server.removeAllListeners("request");
let fixture, worker, browser;
server.on("request", (req, res) => void (req.url.startsWith("/api/portal/") ? fixture.handler(req, res) : frontend(req, res)));
async function fits(page) {
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
  const dialog = page.locator("dialog[open]");
  assert.equal(await dialog.count(), 1);
  assert.ok(await dialog.evaluate(element => element.scrollWidth <= element.clientWidth + 1));
  const box = await dialog.boundingBox(); const viewport = page.viewportSize();
  assert.ok(box.x >= 0 && box.y >= 0 && box.x + box.width <= viewport.width + 1 && box.y + box.height <= viewport.height + 1);
}
async function dismiss(page, text) {
  const toast = page.locator('[data-sonner-toast]:not([data-removed="true"])').filter({ hasText: text });
  await toast.waitFor(); await toast.getByRole("button", { name: "Закрыть уведомление", exact: true }).click();
}
try {
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve)); const origin = `http://127.0.0.1:${server.address().port}`;
  browser = await chromium.launch({ headless: true, ...(process.env.CHROMIUM_EXECUTABLE ? { executablePath: process.env.CHROMIUM_EXECUTABLE } : {}) });
  for (const [presentation, width] of [["web", 1440], ["web", 320], ["miniapp", 390], ["miniapp", 320]]) {
    fixture = portalFixture(origin); preparePortalFixture(fixture);
    fixture.store.put("conversations", { id: "payment-client", kind: "telegram", projectId: "", name: "Клиент", username: "client", email: "client@example.test", telegramId: "123", ownerId: null, ownerName: null, handoffRequested: false, updatedAt: new Date().toISOString() });
    const developer = fixture.login("developer").session;
    for (const id of ["one", "two"]) {
      fixture.store.put("projects", { ...fixture.store.get("projects", id), developerId: developer.viewer.id });
      await fixture.service.action(developer, { type: "quote.create", projectId: id, number: 2, baseKopecks: 100_000 });
    }
    const paidQuote = fixture.store.all("quotes").find(quote => quote.projectId === "one");
    await fixture.service.action(fixture.login("client").session, { type: "quote.pay", quoteId: paidQuote.id, outcome: "succeeded" });
    for (const projectName of ["Неоплаченный заказ", "Оплаченный заказ"]) await fixture.service.action(developer, { type: "order.create", order: { projectName, clientName: "Клиент", email: "client@example.test", username: "client", brief: "Каталог и поиск", totalKopecks: 100_000 } });
    const paidOrder = fixture.store.all("orders").find(order => order.projectName === "Оплаченный заказ"); fixture.store.put("orders", { ...paidOrder, status: "ready", projectId: "two" });
    worker = setInterval(() => void fixture.service.workJobs(), 100);
    const context = await browser.newContext({ viewport: { width, height: 900 }, reducedMotion: "reduce" });
    await context.route("https://telegram.org/js/telegram-web-app.js*", route => route.fulfill({ contentType: "application/javascript", body: "/* standalone Mini App */" }));
    const page = await context.newPage(); page.setDefaultTimeout(15000); const errors = []; page.on("pageerror", error => errors.push(error.message));
    const miniapp = presentation === "miniapp";
    async function navigate(label) {
      if (miniapp) await page.getByRole("navigation", { name: "Навигация приложения", exact: true }).getByRole("button", { name: label === "Создание проектов" ? "Проекты" : label, exact: true }).click();
      else {
        if (width <= 650) await page.getByRole("button", { name: "Открыть меню кабинета", exact: true }).click();
        await page.getByRole("navigation", { name: "Разделы кабинета", exact: true }).getByRole("button", { name: label, exact: true }).click();
        if (width <= 650) await page.getByRole("dialog", { name: "Меню кабинета", exact: true }).waitFor({ state: "hidden" });
      }
    }
    async function project(id, section = "Обзор проекта") {
      if (!miniapp) return openProject(page, width, id, section);
      await page.getByRole("button", { name: "Открыть меню приложения", exact: true }).click();
      await page.getByRole("button", { name: "Мои проекты", exact: true }).click();
      await page.getByRole("button", { name: `Открыть проект ${id}`, exact: true }).click();
      if (section !== "Обзор проекта") await navigate(section);
    }
    try {
      if (!miniapp) await login(page, origin, "developer");
      else {
        await page.goto(origin + "/miniapp/");
        await page.getByRole("combobox", { name: "Профиль", exact: true }).selectOption("developer");
        await page.getByLabel("Почта", { exact: true }).fill("developer@example.test");
        await page.getByRole("button", { name: "Получить код", exact: true }).click(); await page.getByLabel("Код из письма", { exact: true }).waitFor();
        await completeEmailCode(page, origin, "developer@example.test"); await page.getByTestId("portal").waitFor();
      }
      await documentFonts(page); await navigate("Создание проектов");
      for (const name of ["Неоплаченный заказ", "Оплаченный заказ"]) {
        const card = page.locator("article").filter({ has: page.getByRole("heading", { name, exact: true }) });
        if (name === "Неоплаченный заказ") {
          const resend = await chooseAction(page, card.getByRole("button", { name: `Действия заказа: ${name}`, exact: true }), "Повторно отправить ссылку");
          await fits(page);
          const telegram = fixture.integrations.telegram;
          if (presentation === "web" && width === 320) fixture.integrations.telegram = async () => { throw new Error("Temporary Telegram outage"); };
          await resend.getByRole("button", { name: "Отправить ссылку повторно", exact: true }).click();
          const status = resend.getByRole("status", { name: "Статус отправки ссылки", exact: true });
          await status.getByText("Почта: Отправлено", { exact: true }).waitFor();
          if (presentation === "web" && width === 320) {
            await status.getByText("Telegram: Повторим автоматически", { exact: true }).waitFor();
            assert.equal(await page.locator('[data-sonner-toast]').filter({ hasText: "Ссылка на оплату повторно отправлена на почту и в Telegram." }).count(), 0, "partial delivery is not reported as success");
            await page.screenshot({ path: resolve(screenshots, `${presentation}-${width}-resend-retry.png`) });
            fixture.integrations.telegram = telegram; fixture.store.db.prepare("UPDATE jobs SET available=0 WHERE kind='payment.notify.telegram'").run(); await fixture.service.workJobs();
          }
          await status.getByText("Telegram: Отправлено", { exact: true }).waitFor();
          await dismiss(page, "Ссылка на оплату повторно отправлена на почту и в Telegram.");
          await page.screenshot({ path: resolve(screenshots, `${presentation}-${width}-resend-complete.png`) });
          assert.equal(fixture.store.all("orders").length, 2, "resending never duplicates an invoice");
          await closeDialog(page);
        } else {
          await card.getByRole("button", { name: `Действия заказа: ${name}`, exact: true }).click();
          assert.equal(await page.getByRole("button", { name: "Повторно отправить ссылку", exact: true }).count(), 0, "paid orders have no resend action");
          await closeDialog(page);
        }
        let dialog = await chooseAction(page, card.getByRole("button", { name: `Действия заказа: ${name}`, exact: true }), "Удалить оплату");
        await fits(page); await dialog.getByRole("button", { name: "Отмена", exact: true }).click();
        await page.locator("dialog[open]").waitFor({ state: "hidden" }); assert.ok(await card.isVisible(), "cancelling keeps the order");
        dialog = await chooseAction(page, card.getByRole("button", { name: `Действия заказа: ${name}`, exact: true }), "Удалить оплату");
        await dialog.getByRole("button", { name: "Подтвердить удаление", exact: true }).click(); await card.waitFor({ state: "detached" });
        await dismiss(page, "Оплата удалена. Ссылка больше недоступна.");
      }
      assert.equal(fixture.store.get("projects", "two").status, "active");
      for (const id of ["two", "one"]) {
        await project(id, "Чат");
        const quote = page.locator("article").filter({ has: page.getByRole("button", { name: "Действия оплаты: Пожелание", exact: true }) });
        if (id === "two") {
          const resend = await chooseAction(page, quote.getByRole("button", { name: "Действия оплаты: Пожелание", exact: true }), "Повторно отправить ссылку");
          await resend.getByRole("combobox", { name: "Куда отправить", exact: true }).selectOption("telegram");
          await resend.getByRole("button", { name: "Отправить ссылку повторно", exact: true }).click();
          await dismiss(page, "Ссылка на оплату повторно отправлена в Telegram."); await fits(page);
          const latest = fixture.store.all("paymentNotifications").find(item => item.source === "quote" && item.requestId);
          assert.deepEqual(latest.channels, ["telegram"]); assert.equal(latest.mailSentAt, undefined); assert.ok(latest.telegramSentAt);
          await closeDialog(page);
        }
        const dialog = await chooseAction(page, quote.getByRole("button", { name: "Действия оплаты: Пожелание", exact: true }), "Удалить оплату");
        await fits(page); await page.screenshot({ path: resolve(screenshots, `${presentation}-${width}-${id}-payment.png`) });
        await dialog.getByRole("button", { name: "Подтвердить удаление", exact: true }).click(); await quote.waitFor({ state: "detached" }); await dismiss(page, "Оплата удалена.");
      }
      await project("one", "Задачи");
      const task = page.getByRole("region", { name: "Задачи проекта", exact: true }).locator("article").filter({ has: page.getByRole("heading", { name: /Пожелание$/ }) });
      await task.getByText("Оплачено · тест", { exact: true }).waitFor();
      await chooseAction(page, task.getByRole("button", { name: /^Действия задачи:/ }), "Управление задачей");
      assert.equal(await page.getByRole("textbox", { name: "Ваша стоимость, ₽", exact: true }).count(), 0); await closeDialog(page);
      await project("one");
      let dialog = await chooseAction(page, "О проекте", "Удалить проект");
      const confirmation = dialog.getByLabel("Введите название проекта для подтверждения", { exact: true });
      const remove = dialog.getByRole("button", { name: "Подтвердить удаление", exact: true });
      assert.ok(await remove.isDisabled()); await confirmation.fill("wrong"); assert.ok(await remove.isDisabled());
      await confirmation.fill("one"); await fits(page); await page.screenshot({ path: resolve(screenshots, `${presentation}-${width}-project.png`) });
      await closeDialog(page); assert.equal(fixture.store.get("projects", "one").status, "active");
      dialog = await chooseAction(page, "О проекте", "Удалить проект"); await dialog.getByLabel("Введите название проекта для подтверждения", { exact: true }).fill("one");
      await dialog.getByRole("button", { name: "Подтвердить удаление", exact: true }).click(); await dismiss(page, "Проект удалён из кабинетов.");
      assert.equal(fixture.store.get("projects", "one").status, "archived");
      assert.equal(await page.getByRole("heading", { name: "one", level: 1, exact: true }).count(), 0);
      assert.equal(await page.locator("dialog[open]").count(), 0); assert.deepEqual(errors, []);
      console.log(`Payments ${presentation} ${width}px: resends, channel status, completion toasts, deletion, paid rights and project removal passed.`);
    } catch (error) {
      await page.screenshot({ path: resolve(screenshots, `${presentation}-${width}-failure.png`) });
      console.error(JSON.stringify(await page.evaluate(() => ({ dialogs: [...document.querySelectorAll("dialog")].filter(e => e.open || e.querySelector("input")).map(e => ({ open: e.open, text: e.innerText.slice(0, 200), rect: e.getBoundingClientRect().toJSON() })), busy: document.querySelector("main")?.getAttribute("aria-busy"), focus: document.activeElement?.outerHTML.slice(0, 150) }))));
      throw error;
    } finally { await context.close(); clearInterval(worker); fixture.close(); fixture = undefined; }
  }
} finally { await browser?.close(); clearInterval(worker); await new Promise(resolve => server.close(resolve)); fixture?.close(); }
async function documentFonts(page) { await page.evaluate(() => document.fonts.ready.then(() => undefined)); }
