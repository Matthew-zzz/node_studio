import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { chromium } from "playwright";
import { createStaticServer } from "../scripts/lib/static-server.mjs";
import { portalFixture, fixturePassword } from "./helpers/portal-fixture.mjs";
import { completeEmailCode, preparePortalFixture } from "./browser/portal.mjs";
import { checkClientBrief } from "./browser/client-briefs.mjs";

const screenshots = resolve("test-results/screenshots/miniapp"); await mkdir(screenshots, { recursive: true });
const server = createStaticServer(resolve(process.env.SITE_OUTPUT_DIR || "dist"));
const frontend = server.listeners("request")[0]; server.removeAllListeners("request");
let fixture; let worker; let browser;
server.on("request", (request, response) => void (request.url.startsWith("/api/portal/") ? fixture.handler(request, response) : frontend(request, response)));

async function installTelegram(context) {
  await context.route("https://telegram.org/js/telegram-web-app.js*", route => route.fulfill({ contentType: "application/javascript", body: "/* SDK transport fixture; browser tests provide the native client bridge. */" }));
  await context.addInitScript(() => {
    const events = new Map(); const back = new Set();
    const state = { ready: 0, expanded: 0, backVisible: false, background: "", links: [], emit: event => events.get(event)?.forEach(handler => handler()), back: () => back.forEach(handler => handler()) };
    window.__telegram = state;
    window.Telegram = { WebApp: {
      platform: "ios", colorScheme: "dark", viewportStableHeight: innerHeight,
      initDataUnsafe: { user: { id: 1, username: "admin", role: "admin" } },
      ready: () => state.ready++, expand: () => state.expanded++, isVersionAtLeast: () => true,
      onEvent: (event, handler) => { if (!events.has(event)) events.set(event, new Set()); events.get(event).add(handler); },
      offEvent: (event, handler) => events.get(event)?.delete(handler),
      setHeaderColor: color => { state.background = color; }, setBackgroundColor() {}, setBottomBarColor() {},
      openTelegramLink: url => state.links.push(url), openLink: url => state.links.push(url),
      BackButton: { show: () => { state.backVisible = true; }, hide: () => { state.backVisible = false; }, onClick: handler => back.add(handler), offClick: handler => back.delete(handler) },
    } };
    document.addEventListener("DOMContentLoaded", () => {
      document.documentElement.style.setProperty("--tg-safe-area-inset-top", "12px");
      document.documentElement.style.setProperty("--tg-content-safe-area-inset-top", "8px");
      document.documentElement.style.setProperty("--tg-safe-area-inset-bottom", "20px");
    });
  });
}
async function signIn(page, origin, role) {
  await page.goto(`${origin}/miniapp/`);
  await page.waitForFunction(() => document.querySelector('[data-testid="portal"]') || document.querySelector('input[type="email"]'));
  if (await page.getByTestId("portal").count()) {
    await page.getByRole("button", { name: "Открыть меню приложения", exact: true }).click();
    await page.getByRole("button", { name: "Выйти из аккаунтов", exact: true }).click();
  }
  await page.getByRole("combobox", { name: "Профиль", exact: true }).selectOption(role);
  await page.getByLabel("Почта", { exact: true }).fill(`${role}@example.test`);
  await page.getByLabel("Пароль", { exact: true }).fill(fixturePassword);
  await page.getByRole("button", { name: "Войти в кабинет", exact: true }).click();
  await page.getByLabel("Код из письма", { exact: true }).waitFor();
  await completeEmailCode(page, origin, `${role}@example.test`);
  await page.waitForFunction(role => document.querySelector('[data-testid="portal"]')?.dataset.role === role, role);
  fixture.store.db.exec("DELETE FROM auth_limits");
}
async function fits(page, width) {
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `${width}px: no page overflow`);
  assert.ok(await page.evaluate(() => [...document.querySelectorAll('main, dialog[open], [role="log"]')].every(element => element.scrollWidth <= element.clientWidth + 1)), `${width}px: no horizontal scrolling inside screens or dialogs`);
  const navigation = page.getByRole("navigation", { name: "Навигация приложения", exact: true });
  const nav = await navigation.count() ? await navigation.boundingBox() : null;
  if (nav) assert.ok(nav.x >= 0 && nav.x + nav.width <= width + 1 && nav.y + nav.height <= await page.evaluate(() => innerHeight) + 1, "navigation stays inside the viewport");
  assert.equal(await page.locator('main nav[aria-label="Вкладки кабинета"]').count(), 0);
}
async function tab(page, name) { await page.getByRole("navigation", { name: "Навигация приложения", exact: true }).getByRole("button", { name, exact: true }).click(); }

try {
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  browser = await chromium.launch({ headless: true, ...(process.env.CHROMIUM_EXECUTABLE ? { executablePath: process.env.CHROMIUM_EXECUTABLE } : {}) });
  for (const width of (process.env.MINIAPP_WIDTHS || "320,390,430,768").split(",").map(Number)) {
    fixture = portalFixture(origin); preparePortalFixture(fixture);
    worker = setInterval(() => void fixture.service.workJobs(), 100);
    const context = await browser.newContext({ viewport: { width, height: 800 }, reducedMotion: "reduce" });
    await installTelegram(context);
    const page = await context.newPage(); page.setDefaultTimeout(15000); const errors = [];
    page.on("pageerror", error => errors.push(error.message));
    try {
      await page.goto(`${origin}/miniapp/`);
      await page.getByRole("button", { name: "Войти в кабинет", exact: true }).waitFor();
      assert.equal(await page.getByTestId("portal").count(), 0, "Telegram metadata never authenticates an account");
      await page.waitForFunction(() => window.__telegram.ready > 0 && window.__telegram.expanded > 0);
      await signIn(page, origin, "client"); await fits(page, width);
      await page.getByRole("button", { name: "Открыть проект one", exact: true }).waitFor();
      assert.equal(await page.getByRole("button", { name: "Открыть проект three", exact: true }).count(), 0);
      await page.screenshot({ path: resolve(screenshots, `${width}-client-projects.png`) });
      await page.getByRole("button", { name: "Открыть проект one", exact: true }).click();
      await tab(page, "Чат");
      const chat = page.getByRole("region", { name: "Чат проекта", exact: true });
      await chat.getByLabel("Сообщение", { exact: true }).fill("Добавить удобный поиск товаров");
      await page.setViewportSize({ width, height: 380 });
      await page.waitForFunction(() => document.querySelector('[data-keyboard="true"]'));
      const compose = await chat.getByLabel("Сообщение", { exact: true }).boundingBox();
      assert.ok(compose.y >= 0 && compose.y + compose.height <= 380, "the composer remains visible above the keyboard");
      await page.screenshot({ path: resolve(screenshots, `${width}-chat-keyboard.png`) });
      await page.setViewportSize({ width, height: 800 });
      await chat.getByRole("button", { name: "Отправить сообщение", exact: true }).click();
      await chat.getByRole("button", { name: "Подтвердить и отправить задачу", exact: true }).click();
      await tab(page, "Задачи"); await page.getByRole("heading", { name: "Подготовленная задача", exact: true }).waitFor();
      await tab(page, "История"); await page.getByText("init: первоначальная версия проекта", { exact: true }).waitFor();
      await page.evaluate(() => window.__telegram.back());
      await page.getByRole("heading", { name: "Мои проекты", exact: true }).waitFor();
      await page.getByRole("button", { name: "Открыть меню приложения", exact: true }).click();
      await page.getByRole("button", { name: "Включить светлую тему", exact: true }).click();
      await page.evaluate(() => { window.Telegram.WebApp.colorScheme = "dark"; window.__telegram.emit("themeChanged"); });
      assert.equal(await page.getByTestId("portal").getAttribute("data-theme"), "light");
      await page.getByRole("button", { name: "Добавить профиль: Разработчик", exact: true }).click();
      const add = page.getByRole("dialog", { name: "Добавить профиль", exact: true });
      await add.getByLabel("Почта профиля", { exact: true }).fill("developer@example.test");
      await add.getByLabel("Пароль профиля", { exact: true }).fill(fixturePassword);
      await add.getByRole("button", { name: "Добавить и перейти", exact: true }).click();
      await page.getByLabel("Код из письма", { exact: true }).waitFor();
      await completeEmailCode(page, origin, "developer@example.test");
      await page.waitForFunction(() => document.querySelector('[data-testid="portal"]')?.dataset.role === "developer");
      fixture.store.db.exec("DELETE FROM auth_limits");
      await page.getByRole("button", { name: /Общая очередь.*Новые проекты студии/ }).click();
      const queue = page.getByRole("region", { name: "Общая очередь проектов", exact: true });
      await queue.locator("article").filter({ has: page.getByRole("heading", { name: "one", exact: true }) }).getByRole("button", { name: "Взять в работу", exact: true }).click();
      await tab(page, "Задачи");
      const task = page.getByRole("region", { name: "Задачи проекта", exact: true }).locator("article").filter({ has: page.getByRole("heading", { name: /Подготовленная задача$/ }) });
      await task.getByText("Управление задачей", { exact: true }).click();
      await task.getByRole("textbox", { name: "Ваша стоимость, ₽", exact: true }).fill("1000");
      await task.getByRole("button", { name: "Выставить оценку", exact: true }).click(); await fits(page, width);
      await page.screenshot({ path: resolve(screenshots, `${width}-developer-tasks.png`) });

      await signIn(page, origin, "curator");
      assert.equal(await page.getByRole("region", { name: "Telegram-диалог", exact: true }).count(), 0, "the inbox starts with a list, without opening a conversation");
      await page.getByLabel("Поиск диалогов", { exact: true }).fill("kate_studio");
      await fits(page, width);
      await page.screenshot({ path: resolve(screenshots, `${width}-curator-dialog-list.png`) });
      await checkClientBrief(page, origin, width, screenshots, true);
      assert.equal(await page.getByRole("region", { name: "Очередь обращений", exact: true }).count(), 0, "an open conversation has its own screen");
      assert.equal(await page.getByRole("navigation", { name: "Навигация приложения", exact: true }).count(), 0);
      await page.getByRole("button", { name: "Подключиться к диалогу", exact: true }).click();
      await page.getByRole("textbox", { name: "Сообщение", exact: true }).fill("Черновик только для Екатерины");
      await page.setViewportSize({ width, height: 380 });
      await page.waitForFunction(() => document.querySelector('[data-keyboard="true"]'));
      const curatorCompose = await page.getByRole("textbox", { name: "Сообщение", exact: true }).boundingBox();
      assert.ok(curatorCompose.y >= 0 && curatorCompose.y + curatorCompose.height <= 380, "curator composer stays above the keyboard");
      await page.setViewportSize({ width, height: 800 });
      await page.evaluate(() => window.__telegram.back());
      await page.getByRole("region", { name: "Очередь обращений", exact: true }).waitFor();
      assert.equal(await page.getByLabel("Поиск диалогов", { exact: true }).inputValue(), "kate_studio");
      assert.equal(await page.getByRole("region", { name: "Telegram-диалог", exact: true }).count(), 0);
      await page.getByLabel("Поиск диалогов", { exact: true }).fill("dmitry_product");
      await page.getByRole("button", { name: "Открыть диалог: Дмитрий", exact: true }).click();
      assert.equal(await page.getByRole("textbox", { name: "Сообщение", exact: true }).inputValue(), "", "drafts never transfer to another client");
      await page.getByRole("button", { name: "Вернуться к диалогам", exact: true }).click();
      await page.getByLabel("Поиск диалогов", { exact: true }).fill("kate_studio");
      await page.getByRole("button", { name: "Открыть диалог: Екатерина", exact: true }).click();
      assert.equal(await page.getByRole("textbox", { name: "Сообщение", exact: true }).inputValue(), "Черновик только для Екатерины");
      await page.getByRole("button", { name: "Покинуть диалог", exact: true }).waitFor();
      await fits(page, width);
      await page.screenshot({ path: resolve(screenshots, `${width}-curator-open-dialog.png`) });
      await page.getByRole("textbox", { name: "Сообщение", exact: true }).fill("Здравствуйте, я помогу с проектом");
      await page.getByRole("button", { name: "Отправить сообщение", exact: true }).click();
      await page.getByRole("button", { name: "Покинуть диалог", exact: true }).click();
      await page.getByRole("button", { name: "Вернуться к диалогам", exact: true }).click();
      await tab(page, "Проекты");
      await page.getByText("Создать для существующего клиента", { exact: true }).click();
      const form = page.getByRole("form", { name: "Создание проекта куратором", exact: true });
      const name = `Мобильный проект ${width}`;
      await form.getByLabel("Название проекта", { exact: true }).fill(name);
      await form.getByLabel("Почта клиента", { exact: true }).fill("client@example.test");
      await form.getByLabel("ТЗ проекта", { exact: true }).fill("Каталог с поиском и личным кабинетом");
      await form.getByRole("button", { name: "Создать проект", exact: true }).click();
      await page.getByRole("heading", { name, exact: true }).waitFor(); await fits(page, width);
      await page.screenshot({ path: resolve(screenshots, `${width}-curator.png`) });
      if (width === 390) {
        const paymentSetup = page.getByRole("region", { name: "Оплата и выдача доступа", exact: true });
        await paymentSetup.getByText("Подготовить проект", { exact: true }).click();
        await paymentSetup.getByLabel("Название проекта", { exact: true }).fill("Новый клиент Mini App");
        await paymentSetup.getByLabel("Имя клиента", { exact: true }).fill("Новый клиент");
        await paymentSetup.getByLabel("Почта клиента", { exact: true }).fill("miniapp-new@example.test");
        await paymentSetup.getByLabel("Telegram username", { exact: true }).fill("miniapp_new");
        await paymentSetup.getByLabel("Основная работа, ₽", { exact: true }).fill("5000");
        await paymentSetup.getByLabel("Согласованное ТЗ", { exact: true }).fill("Сайт нового клиента");
        await paymentSetup.getByRole("button", { name: "Подготовить ссылку на оплату", exact: true }).click();
        const link = page.getByRole("link", { name: "Открыть ссылку на оплату ↗", exact: true }); await link.waitFor();
        const href = await link.getAttribute("href"); assert.ok(href.startsWith("/miniapp/checkout/#"));
        const payment = await context.newPage();
        const response = await payment.goto(origin + href);
        assert.ok(response.headers()["content-security-policy"].includes("https://web.telegram.org"));
        await payment.getByRole("button", { name: "Оплатить · тест", exact: true }).click();
        await payment.getByRole("button", { name: "Подтвердить тестовую оплату", exact: true }).click();
        await payment.getByText("Тестовая оплата подтверждена. Студия подготовит доступ к проекту.", { exact: true }).waitFor();
        assert.ok(await payment.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
        await payment.screenshot({ path: resolve(screenshots, `${width}-checkout.png`) }); await payment.close();
        await page.getByRole("button", { name: "Создать проект и выдать доступ", exact: true }).click();
        await page.getByText("Проект передан в общую очередь, доступ отправлен на почту. Репозиторий создаст разработчик после принятия проекта.", { exact: true }).waitFor();
        assert.ok(fixture.sent.some(mail => mail.email === "miniapp-new@example.test"));
      }

      await signIn(page, origin, "developer");
      await page.getByRole("button", { name: /Общая очередь.*Новые проекты студии/ }).click();
      await page.getByRole("region", { name: "Общая очередь проектов", exact: true }).locator("article").filter({ has: page.getByRole("heading", { name, exact: true }) }).getByRole("button", { name: "Взять в работу", exact: true }).click();
      await page.getByRole("button", { name: "Создать GitHub-репозиторий", exact: true }).click();
      await page.getByRole("heading", { name: new RegExp(`Разработка: ${name}$`) }).waitFor();
      assert.equal(fixture.repositories.length, 1);

      await signIn(page, origin, "client");
      await page.getByRole("button", { name: "Открыть проект one", exact: true }).click(); await tab(page, "Чат");
      await page.getByRole("button", { name: "Оплатить · тест", exact: true }).click();
      await page.getByRole("dialog", { name: "Проверка оплаты", exact: true }).getByRole("button", { name: "Подтвердить тестовую оплату", exact: true }).click();
      await page.getByText("Оплачено · тест", { exact: true }).waitFor(); await fits(page, width);
      await page.screenshot({ path: resolve(screenshots, `${width}-client-chat.png`) });

      await signIn(page, origin, "admin"); await fits(page, width);
      await page.screenshot({ path: resolve(screenshots, `${width}-admin.png`) });
      await tab(page, "Знания"); await fits(page, width);
      await tab(page, "Ошибки"); await fits(page, width);
      await page.getByRole("button", { name: "Открыть меню приложения", exact: true }).click();
      for (const label of ["Промпты", "Проверка агента", "История настроек"]) assert.ok(await page.getByRole("button", { name: label, exact: true }).isVisible());
      await page.getByRole("link", { name: "Поддержка студии", exact: true }).click();
      assert.ok((await page.evaluate(() => window.__telegram.links)).includes("https://t.me/node_studio_bot"));
      assert.deepEqual(errors, []);
      console.log(`Mini App ${width}px: MFA, roles, native back/theme, keyboard, curator project, GitHub creation, client draft, developer pricing and stub payment passed`);
    } catch (error) {
      await page.screenshot({ path: resolve(screenshots, `${width}-failure.png`) }).catch(() => undefined);
      console.error((await page.locator("body").innerText()).slice(0, 7000));
      throw error;
    } finally { await context.close(); clearInterval(worker); fixture.close(); }
  }
} finally { await browser?.close(); clearInterval(worker); await new Promise(resolve => server.close(resolve)); }
