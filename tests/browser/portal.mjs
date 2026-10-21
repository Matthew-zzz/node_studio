import assert from "node:assert/strict";
import { resolve } from "node:path";
import { fixturePassword } from "../helpers/portal-fixture.mjs";

async function switchRole(page, role) {
  if (role === "admin") {
    const menu = page.getByRole("region", { name: "Демонстрация кабинетов", exact: true }).locator("details");
    await menu.locator("summary").click();
    await menu.getByRole("button", { name: "Администратор", exact: true }).click();
  } else {
    const names = { client: "Клиент", developer: "Разработчик", curator: "Куратор" };
    await page.getByRole("group", { name: "Быстрое переключение кабинетов", exact: true }).getByRole("button", { name: names[role], exact: true }).click();
  }
  await page.waitForFunction(expected => document.querySelector('[data-testid="portal"]')?.dataset.role === expected, role);
}

export async function checkPortal(page, origin, width, screenshots) {
  await page.goto(origin + "/cabinet-demo/");
  const root = page.getByTestId("portal");
  await root.waitFor();
  assert.equal(await root.getAttribute("data-role"), "client");
  assert.equal(await page.locator("h1").textContent(), "Atelier");
  assert.equal(await page.locator("main").count(), 1);
  assert.equal(await page.getByRole("button", { name: "Nova", exact: true }).count(), 0);
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `${width}px portal: no overflow`);
  await page.screenshot({ path: resolve(screenshots, `${width}-cabinet-client.png`), fullPage: true });
  const tabs = page.getByRole("navigation", { name: "Вкладки кабинета" });
  const chat = page.getByRole("region", { name: "Чат проекта", exact: true });
  if (width <= 650) await tabs.getByRole("button", { name: "Чат", exact: true }).click();

  const wish = "Добавить поиск товаров по названию";
  await chat.getByLabel("Сообщение", { exact: true }).fill(wish);
  await chat.getByRole("button", { name: "Отправить сообщение", exact: true }).click();
  const confirm = chat.getByRole("button", { name: "Подтвердить и отправить задачу", exact: true });
  await confirm.waitFor();
  await confirm.click();
  await confirm.waitFor({ state: "detached" });
  await switchRole(page, "developer");
  await page.waitForFunction(() => document.querySelector('[data-testid="portal"]').dataset.role === "developer");
  await page.getByRole("region", { name: "Ожидают разработчика", exact: true }).getByRole("button", { name: "Открыть диалог", exact: true }).click();
  assert.ok(await chat.isVisible(), "the developer handoff opens the chat, including on a phone");
  await tabs.getByRole("button", { name: "Общая очередь", exact: true }).click();
  const queue = page.getByRole("region", { name: "Общая очередь задач", exact: true });
  await page.getByRole("group", { name: "Фильтр задач", exact: true }).getByRole("button", { name: "Нужна оценка", exact: true }).click();
  await page.getByLabel("Поиск задач", { exact: true }).fill("ПОИСК ТОВАРОВ");
  assert.equal(await queue.locator("article").count(), 1, "queue combines estimation filter with case-insensitive search");
  await page.getByLabel("Поиск задач", { exact: true }).fill("не существующая задача");
  await queue.getByRole("heading", { name: "Ничего не найдено", exact: true }).waitFor();
  await queue.getByRole("button", { name: "Сбросить фильтры", exact: true }).click();
  const queued = page.getByRole("region", { name: "Общая очередь задач" }).locator("article").filter({ has: page.getByRole("heading", { name: wish, exact: true }) });
  await queued.getByRole("button", { name: "Открыть", exact: true }).click();
  const task = page.getByRole("region", { name: "Задачи проекта" }).locator("article").filter({ has: page.getByRole("heading", { name: new RegExp(wish) }) });
  await task.locator("summary").filter({ hasText: "Управление задачей" }).click();
  await task.getByLabel("Ваша стоимость, ₽", { exact: true }).fill("1000");
  await task.getByRole("button", { name: "Выставить оценку", exact: true }).click();
  if (width <= 650) await tabs.getByRole("button", { name: "Чат", exact: true }).click();
  await chat.getByRole("heading", { name: wish, exact: true }).waitFor();

  await switchRole(page, "client");
  await page.waitForFunction(() => document.querySelector('[data-testid="portal"]').dataset.role === "client");
  if (width <= 650) await tabs.getByRole("button", { name: "Чат", exact: true }).click();
  const quote = chat.locator("article").filter({ has: page.getByRole("heading", { name: wish, exact: true }) });
  assert.ok((await quote.textContent()).includes("1 300"));
  await quote.getByRole("button", { name: "Оплатить · тест", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Проверка оплаты", exact: true });
  await dialog.getByRole("button", { name: "Имитировать ошибку", exact: true }).click();
  await dialog.getByText("Тестовая ошибка. Можно повторить оплату.", { exact: true }).waitFor();
  await dialog.getByRole("button", { name: "Отменить", exact: true }).click();
  await quote.getByRole("button", { name: "Оплатить · тест", exact: true }).click();
  await dialog.getByRole("button", { name: "Подтвердить тестовую оплату", exact: true }).click();
  await quote.getByText("Оплачено · тест", { exact: true }).waitFor();
  await page.reload();
  await root.waitFor();
  await tabs.getByRole("button", { name: "История", exact: true }).click();
  await page.getByRole("heading", { name: "init: первоначальная версия проекта", exact: true }).waitFor();
  await page.getByRole("button", { name: "Включить тёмную тему", exact: true }).click();
  assert.equal(await root.getAttribute("data-theme"), "dark");
  await page.reload(); await root.waitFor();
  assert.equal(await root.getAttribute("data-theme"), "dark");

  await switchRole(page, "developer");
  await page.waitForFunction(() => document.querySelector('[data-testid="portal"]').dataset.role === "developer");
  await page.getByRole("region", { name: "Общая очередь задач" }).locator("article").filter({ has: page.getByRole("heading", { name: wish, exact: true }) }).getByRole("button", { name: "Открыть", exact: true }).click();
  await task.locator("summary").filter({ hasText: "Управление задачей" }).click();
  await task.getByLabel("Статус", { exact: true }).selectOption("in_progress");
  await task.getByRole("button", { name: "Обновить", exact: true }).click();
  await task.getByText("В работе", { exact: true }).first().waitFor();
  if (width <= 650) await tabs.getByRole("button", { name: "Чат", exact: true }).click();
  await chat.getByRole("button", { name: "Подключиться к диалогу", exact: true }).click();
  await chat.getByRole("button", { name: "Покинуть диалог", exact: true }).waitFor();
  await page.reload(); await root.waitFor();
  await page.getByRole("region", { name: "Общая очередь задач", exact: true }).locator("article").filter({ has: page.getByRole("heading", { name: wish, exact: true }) }).getByRole("button", { name: "Открыть", exact: true }).click();
  if (width <= 650) await tabs.getByRole("button", { name: "Чат", exact: true }).click();
  await chat.getByRole("button", { name: "Покинуть диалог", exact: true }).click();
  await chat.getByRole("button", { name: "Подключиться к диалогу", exact: true }).waitFor();
  await page.screenshot({ path: resolve(screenshots, `${width}-cabinet-developer.png`), fullPage: true });

  await switchRole(page, "curator");
  const inbox = page.getByRole("region", { name: "Очередь обращений", exact: true });
  await page.getByLabel("Поиск диалогов", { exact: true }).fill("@KATE_STUDIO");
  assert.equal(await inbox.getByRole("button").count(), 1, "curator can search by Telegram username");
  await page.getByLabel("Поиск диалогов", { exact: true }).fill("dmitry@example.test");
  assert.equal(await inbox.getByRole("button").count(), 1, "curator can search by email");
  await inbox.getByText("Дмитрий", { exact: true }).waitFor();
  await page.getByLabel("Поиск диалогов", { exact: true }).fill("");
  await page.getByRole("group", { name: "Фильтр диалогов", exact: true }).getByRole("button", { name: "Ждут куратора", exact: true }).click();
  assert.equal(await inbox.getByRole("button").count(), 1);
  const telegram = page.getByRole("region", { name: "Telegram-диалог", exact: true });
  await telegram.waitFor();
  assert.equal(await page.getByRole("region", { name: "Этапы проекта", exact: true }).count(), 0);
  assert.equal(await page.getByRole("region", { name: "Задачи проекта", exact: true }).count(), 0);
  await telegram.getByRole("button", { name: "Подключиться к диалогу", exact: true }).click();
  await telegram.getByRole("button", { name: "Покинуть диалог", exact: true }).waitFor();
  assert.ok(await telegram.isVisible(), "claiming a filtered request keeps the chat open");
  await page.getByRole("group", { name: "Фильтр диалогов", exact: true }).getByRole("button", { name: "Мои диалоги", exact: true }).click();
  assert.equal(await inbox.getByRole("button").count(), 1);
  await telegram.getByLabel("Сообщение", { exact: true }).fill("Здравствуйте! Помогу с проектом.");
  await telegram.getByRole("button", { name: "Отправить сообщение", exact: true }).click();
  await telegram.getByText("Здравствуйте! Помогу с проектом.", { exact: true }).waitFor();
  await telegram.getByRole("button", { name: "Покинуть диалог", exact: true }).click();
  await page.screenshot({ path: resolve(screenshots, `${width}-cabinet-support.png`), fullPage: true });

  if (width === 1440) {
    await tabs.getByRole("button", { name: "Создание проектов", exact: true }).click();
    await page.getByText("Подготовить проект", { exact: true }).click();
    await page.getByLabel("Название проекта", { exact: true }).fill("Bamboo");
    await page.getByLabel("Имя клиента", { exact: true }).fill("Александр");
    await page.getByLabel("Почта клиента", { exact: true }).fill("alex@example.test");
    await page.getByLabel("Telegram username", { exact: true }).fill("alex_atelier");
    await page.getByLabel("Основная работа, ₽", { exact: true }).fill("5000");
    await page.getByLabel("Согласованное ТЗ", { exact: true }).fill("Каталог для студии Bamboo.");
    await page.getByRole("button", { name: "Подготовить ссылку на оплату", exact: true }).click();
    const link = page.getByRole("link", { name: "Открыть ссылку на оплату ↗", exact: true });
    await link.waitFor();
    await page.goto(origin + await link.getAttribute("href"));
    await page.getByRole("heading", { name: "Bamboo", exact: true }).waitFor();
    await page.getByRole("button", { name: "Оплатить · тест", exact: true }).click();
    await dialog.getByRole("button", { name: "Подтвердить тестовую оплату", exact: true }).click();
    await page.getByText("Тестовая оплата подтверждена. Студия подготовит доступ к проекту.", { exact: true }).waitFor();
    await page.goto(origin + "/cabinet-demo/"); await root.waitFor();
    await tabs.getByRole("button", { name: "Создание проектов", exact: true }).click();
    await page.getByRole("button", { name: "Создать проект и выдать доступ", exact: true }).click();
    await page.getByText("Доступ выдан", { exact: true }).waitFor();
    await switchRole(page, "client");
    await page.getByRole("navigation", { name: "Выбор проекта" }).getByRole("button", { name: "Bamboo", exact: true }).click();
    await page.getByRole("heading", { name: "Bamboo", level: 1, exact: true }).waitFor();
  }
  await switchRole(page, "admin");
  await page.getByRole("heading", { name: "Здесь будет управление студией", exact: true }).waitFor();
  assert.equal(await page.getByRole("region", { name: "Чат проекта", exact: true }).count(), 0);
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `${width}px admin: no overflow`);
  console.log(`Portal ${width}px: role workflows, payments, handoff and themes passed.`);
}

export async function checkPortalAuthentication(browser, origin) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  try {
    const page = await context.newPage();
    await page.goto(origin + "/cabinet/");
    await page.getByLabel("Почта", { exact: true }).fill("temporary@example.test");
    await page.getByLabel("Пароль", { exact: true }).fill(fixturePassword);
    await page.getByRole("button", { name: "Войти в кабинет", exact: true }).click();
    await page.getByRole("heading", { name: "Задайте свой пароль", exact: true }).waitFor();
    assert.equal(await page.getByRole("group", { name: "Быстрое переключение кабинетов", exact: true }).count(), 0);
    await page.getByLabel("Временный пароль", { exact: true }).fill(fixturePassword);
    await page.getByLabel("Новый пароль · от 12 символов", { exact: true }).fill("My-browser-password-2026");
    await page.getByLabel("Повторите новый пароль", { exact: true }).fill("My-browser-password-2026");
    await page.getByRole("button", { name: "Сохранить пароль", exact: true }).click();
    await page.getByRole("heading", { name: "Проект появится здесь", exact: true }).waitFor();
    await page.getByRole("button", { name: "Выйти", exact: true }).click();
    await page.getByLabel("Почта", { exact: true }).fill("client@example.test");
    await page.getByLabel("Пароль", { exact: true }).fill(fixturePassword);
    await page.getByRole("button", { name: "Войти в кабинет", exact: true }).click();
    await page.getByRole("heading", { name: "one", level: 1, exact: true }).waitFor();
    assert.equal(await page.getByRole("button", { name: "three", exact: true }).count(), 0);
    await page.goto(origin + "/cabinet/?role=developer"); await page.getByTestId("portal").waitFor();
    assert.equal(await page.getByTestId("portal").getAttribute("data-role"), "client");
    assert.equal(await page.getByRole("group", { name: "Быстрое переключение кабинетов", exact: true }).count(), 0, "role controls never appear in authenticated accounts");
  } finally { await context.close(); }
}

export async function checkWorkspacePreferences(browser, origin) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, colorScheme: "dark" });
  try {
    const page = await context.newPage();
    await page.goto(origin + "/cabinet-demo/");
    const root = page.getByTestId("portal");
    await root.waitFor();
    assert.equal(await root.getAttribute("data-theme"), "dark", "a new visitor gets the system theme");
    await page.getByRole("button", { name: "Включить светлую тему", exact: true }).click();
    await switchRole(page, "developer");
    await page.reload();
    await root.waitFor();
    assert.equal(await root.getAttribute("data-role"), "developer", "selected role survives reload");
    assert.equal(await root.getAttribute("data-theme"), "light", "explicit theme overrides the system preference");
    await page.getByRole("region", { name: "Общая очередь задач", exact: true }).waitFor();
    const login = await context.newPage();
    await login.goto(origin + "/cabinet/");
    await login.getByRole("heading", { name: "С возвращением", exact: true }).waitFor();
    assert.equal(await login.getByRole("button", { name: "Включить светлую тему", exact: true }).getAttribute("aria-pressed"), "true");
    await login.getByRole("button", { name: "Включить тёмную тему", exact: true }).click();
    await page.waitForFunction(() => document.querySelector('[data-testid="portal"]').dataset.theme === "dark");
    await switchRole(page, "curator");
    assert.equal(await root.getAttribute("data-theme"), "dark", "theme is shared across roles and open tabs");
  } finally { await context.close(); }

  const privateContext = await browser.newContext({ viewport: { width: 320, height: 844 } });
  try {
    await privateContext.addInitScript(() => Object.defineProperty(window, "localStorage", { get() { throw new Error("Storage unavailable"); } }));
    const page = await privateContext.newPage();
    await page.goto(origin + "/cabinet-demo/");
    await page.getByTestId("portal").waitFor();
    await page.getByRole("button", { name: "Включить тёмную тему", exact: true }).click();
    await switchRole(page, "curator");
    assert.equal(await page.getByTestId("portal").getAttribute("data-theme"), "dark");
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), "controls fit a narrow viewport when storage is unavailable");
  } finally { await privateContext.close(); }
}
