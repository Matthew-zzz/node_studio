import assert from "node:assert/strict";
import { resolve } from "node:path";
import { fixturePassword } from "../helpers/portal-fixture.mjs";

// External services are fixtures only in tests. The browser uses the production HTTP API.
export function preparePortalFixture(portal) {
  const createdAt = new Date().toISOString();
  const repo = "Matthew-zzz/fixture-one";
  portal.issues.get(repo).push({ id: "3", number: 3, projectId: "", title: "Разработка", body: "Сборка и проверка проекта", kind: "stage", included: true, status: "in_progress", updatedAt: createdAt });
  portal.commits.set(repo, [{ sha: "a".repeat(40), projectId: "", title: "init: первоначальная версия проекта", author: "Developer", createdAt }]);
  portal.store.put("conversations", { ...portal.store.get("conversations", "chat-three"), handoffRequested: true });
  for (const [id, name, username, email, handoffRequested] of [["1", "Екатерина", "kate_studio", "kate@example.test", true], ["2", "Дмитрий", "dmitry_product", "dmitry@example.test", false]]) {
    portal.store.put("conversations", { id: `telegram-${id}`, kind: "telegram", projectId: "", name, username, email, telegramId: id, ownerId: null, ownerName: null, handoffRequested, updatedAt: createdAt });
    portal.store.put("messages", { id: `telegram-message-${id}`, threadId: `telegram-${id}`, author: name, role: "client", text: "Здравствуйте! Нужна помощь с проектом.", createdAt });
  }
}

async function login(page, origin, role, password = fixturePassword) {
  await page.goto(origin + "/cabinet/");
  const signOut = page.getByRole("button", { name: "Выйти", exact: true });
  await page.waitForFunction(() => document.querySelector('[data-testid="portal"]') || document.querySelector('input[type="email"]'));
  if (await signOut.count()) await signOut.click();
  await page.getByLabel("Почта", { exact: true }).fill(`${role}@example.test`);
  await page.getByLabel("Пароль", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Войти в кабинет", exact: true }).click();
  await page.getByTestId("portal").waitFor();
  assert.equal(await page.getByRole("group", { name: "Быстрое переключение кабинетов", exact: true }).count(), 0);
  assert.equal(await page.locator('a[href*="-demo"]').count(), 0);
}

async function openChat(page, width) {
  if (width <= 650) await page.getByRole("navigation", { name: "Вкладки кабинета" }).getByRole("button", { name: "Чат", exact: true }).click();
}

export async function checkPortal(page, origin, width, screenshots, portal) {
  for (const path of ["/cabinet-demo/", "/checkout-demo/", "/payment-demo/"]) assert.equal((await page.request.get(origin + path)).status(), 404);
  await login(page, origin, "client");
  const root = page.getByTestId("portal");
  assert.equal(await root.getAttribute("data-role"), "client");
  await page.getByRole("heading", { name: "one", level: 1, exact: true }).waitFor();
  assert.equal(await page.getByRole("button", { name: "three", exact: true }).count(), 0, "client projects remain private");
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
  await page.screenshot({ path: resolve(screenshots, `${width}-cabinet-client.png`), fullPage: true });
  const tabs = page.getByRole("navigation", { name: "Вкладки кабинета" });
  const chat = page.getByRole("region", { name: "Чат проекта", exact: true });
  await openChat(page, width);
  await chat.getByLabel("Сообщение", { exact: true }).fill("Добавить поиск товаров по названию");
  await chat.getByRole("button", { name: "Отправить сообщение", exact: true }).click();
  await portal.service.workJobs();
  await page.reload(); await root.waitFor(); await openChat(page, width);
  const confirm = chat.getByRole("button", { name: "Подтвердить и отправить задачу", exact: true });
  await confirm.click(); await confirm.waitFor({ state: "detached" });

  const title = "Подготовленная задача";
  await login(page, origin, "developer");
  await page.getByRole("region", { name: "Ожидают разработчика", exact: true }).getByRole("button", { name: "Открыть диалог", exact: true }).click();
  assert.ok(await chat.isVisible(), "handoff opens the chat on desktop and mobile");
  await tabs.getByRole("button", { name: "Общая очередь", exact: true }).click();
  const queue = page.getByRole("region", { name: "Общая очередь задач", exact: true });
  await page.getByRole("group", { name: "Фильтр задач", exact: true }).getByRole("button", { name: "Нужна оценка", exact: true }).click();
  await page.getByLabel("Поиск задач", { exact: true }).fill("ПОДГОТОВЛЕННАЯ");
  assert.equal(await queue.locator("article").count(), 1);
  await page.getByLabel("Поиск задач", { exact: true }).fill("несуществующая задача");
  await queue.getByRole("heading", { name: "Ничего не найдено", exact: true }).waitFor();
  await queue.getByRole("button", { name: "Сбросить фильтры", exact: true }).click();
  const queued = queue.locator("article").filter({ has: page.getByRole("heading", { name: title, exact: true }) });
  await queued.getByRole("button", { name: "Открыть", exact: true }).click();
  const task = page.getByRole("region", { name: "Задачи проекта", exact: true }).locator("article").filter({ has: page.getByRole("heading", { name: new RegExp(title) }) });
  await task.locator("summary").filter({ hasText: "Управление задачей" }).click();
  await task.getByLabel("Ваша стоимость, ₽", { exact: true }).fill("1000");
  await task.getByRole("button", { name: "Выставить оценку", exact: true }).click();
  await openChat(page, width);
  await chat.getByRole("heading", { name: title, exact: true }).waitFor();

  await login(page, origin, "client"); await openChat(page, width);
  const quote = chat.locator("article").filter({ has: page.getByRole("heading", { name: title, exact: true }) });
  assert.ok((await quote.textContent()).includes("1 300"));
  await quote.getByRole("button", { name: "Оплатить · тест", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Проверка оплаты", exact: true });
  await dialog.getByRole("button", { name: "Имитировать ошибку", exact: true }).click();
  await dialog.getByText("Тестовая ошибка. Можно повторить оплату.", { exact: true }).waitFor();
  await dialog.getByRole("button", { name: "Отменить", exact: true }).click();
  await quote.getByRole("button", { name: "Оплатить · тест", exact: true }).click();
  await dialog.getByRole("button", { name: "Подтвердить тестовую оплату", exact: true }).click();
  await quote.getByText("Оплачено · тест", { exact: true }).waitFor();
  await page.reload(); await root.waitFor(); await openChat(page, width);
  await quote.getByText("Оплачено · тест", { exact: true }).waitFor();
  await tabs.getByRole("button", { name: "История", exact: true }).click();
  await page.getByRole("heading", { name: "init: первоначальная версия проекта", exact: true }).waitFor();
  await page.getByRole("button", { name: "Включить тёмную тему", exact: true }).click();
  await page.reload(); await root.waitFor();
  assert.equal(await root.getAttribute("data-theme"), "dark");

  await login(page, origin, "developer");
  await queued.getByRole("button", { name: "Открыть", exact: true }).click();
  await task.locator("summary").filter({ hasText: "Управление задачей" }).click();
  await task.getByLabel("Статус", { exact: true }).selectOption("in_progress");
  await task.getByRole("button", { name: "Обновить", exact: true }).click();
  await task.getByText("В работе", { exact: true }).first().waitFor();
  await openChat(page, width);
  await chat.getByRole("button", { name: "Подключиться к диалогу", exact: true }).click();
  await chat.getByRole("button", { name: "Покинуть диалог", exact: true }).waitFor();
  await chat.getByLabel("Сообщение", { exact: true }).fill("Изменения приняты в работу.");
  await chat.getByRole("button", { name: "Отправить сообщение", exact: true }).click();
  await page.reload(); await root.waitFor();
  await queued.getByRole("button", { name: "Открыть", exact: true }).click(); await openChat(page, width);
  await chat.getByText("Изменения приняты в работу.", { exact: true }).waitFor();
  await chat.getByRole("button", { name: "Покинуть диалог", exact: true }).click();
  await chat.getByRole("button", { name: "Подключиться к диалогу", exact: true }).waitFor();
  await page.screenshot({ path: resolve(screenshots, `${width}-cabinet-developer.png`), fullPage: true });

  await login(page, origin, "curator");
  assert.equal(await page.getByRole("region", { name: "Задачи проекта", exact: true }).count(), 0);
  const inbox = page.getByRole("region", { name: "Очередь обращений", exact: true });
  await page.getByLabel("Поиск диалогов", { exact: true }).fill("@KATE_STUDIO");
  assert.equal(await inbox.getByRole("button").count(), 1);
  await page.getByLabel("Поиск диалогов", { exact: true }).fill("dmitry@example.test");
  await inbox.getByText("Дмитрий", { exact: true }).waitFor();
  await page.getByLabel("Поиск диалогов", { exact: true }).fill("");
  const filters = page.getByRole("group", { name: "Фильтр диалогов", exact: true });
  await filters.getByRole("button", { name: "Ждут куратора", exact: true }).click();
  const telegram = page.getByRole("region", { name: "Telegram-диалог", exact: true });
  await telegram.getByRole("button", { name: "Подключиться к диалогу", exact: true }).click();
  await telegram.getByRole("button", { name: "Покинуть диалог", exact: true }).waitFor();
  await filters.getByRole("button", { name: "Мои диалоги", exact: true }).click();
  assert.equal(await inbox.getByRole("button").count(), 1);
  await telegram.getByLabel("Сообщение", { exact: true }).fill("Здравствуйте! Помогу с проектом.");
  await telegram.getByRole("button", { name: "Отправить сообщение", exact: true }).click();
  await telegram.getByText("Здравствуйте! Помогу с проектом.", { exact: true }).waitFor();
  await telegram.getByRole("button", { name: "Покинуть диалог", exact: true }).click();
  await page.screenshot({ path: resolve(screenshots, `${width}-cabinet-curator.png`), fullPage: true });

  const projectName = `Новый проект ${width}`;
  await tabs.getByRole("button", { name: "Создание проектов", exact: true }).click();
  await page.getByText("Подготовить проект", { exact: true }).click();
  await page.getByLabel("Название проекта", { exact: true }).fill(projectName);
  await page.getByLabel("Имя клиента", { exact: true }).fill("Клиент");
  await page.getByLabel("Почта клиента", { exact: true }).fill("client@example.test");
  await page.getByLabel("Telegram username", { exact: true }).fill("client_customer");
  await page.getByLabel("Основная работа, ₽", { exact: true }).fill("5000");
  await page.getByLabel("Согласованное ТЗ", { exact: true }).fill("Каталог и оформление заказа.");
  await page.getByRole("button", { name: "Подготовить ссылку на оплату", exact: true }).click();
  const link = page.getByRole("link", { name: "Открыть ссылку на оплату ↗", exact: true });
  await link.waitFor(); await page.goto(origin + await link.getAttribute("href"));
  await page.getByRole("heading", { name: projectName, exact: true }).waitFor();
  await page.getByRole("button", { name: "Оплатить · тест", exact: true }).click();
  await dialog.getByRole("button", { name: "Подтвердить тестовую оплату", exact: true }).click();
  await page.getByText("Тестовая оплата подтверждена. Студия подготовит доступ к проекту.", { exact: true }).waitFor();
  await page.reload();
  await page.getByText("Тестовая оплата подтверждена. Студия подготовит доступ к проекту.", { exact: true }).waitFor();
  await page.goto(origin + "/cabinet/"); await root.waitFor();
  await tabs.getByRole("button", { name: "Создание проектов", exact: true }).click();
  await page.getByRole("button", { name: "Создать проект и выдать доступ", exact: true }).click();
  await portal.service.workJobs();
  await page.reload(); await root.waitFor();
  await tabs.getByRole("button", { name: "Создание проектов", exact: true }).click();
  await page.getByText("Доступ выдан", { exact: true }).waitFor();
  await login(page, origin, "client");
  if (width <= 650) await page.getByLabel("Текущий проект", { exact: true }).selectOption({ label: projectName });
  else await page.getByRole("navigation", { name: "Выбор проекта" }).getByRole("button", { name: projectName, exact: true }).click();
  await page.getByRole("heading", { name: projectName, level: 1, exact: true }).waitFor();
  await login(page, origin, "admin");
  await page.getByRole("heading", { name: "Здесь будет управление студией", exact: true }).waitFor();
  assert.equal(await chat.count(), 0);
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `${width}px authenticated account: no overflow`);
  console.log(`Portal ${width}px: authenticated role workflows, server payments, private projects and handoff passed.`);
}

export async function checkPortalAuthentication(browser, origin) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  try {
    const page = await context.newPage();
    await login(page, origin, "temporary");
    await page.getByRole("heading", { name: "Задайте свой пароль", exact: true }).waitFor();
    await page.getByLabel("Временный пароль", { exact: true }).fill(fixturePassword);
    await page.getByLabel("Новый пароль · от 12 символов", { exact: true }).fill("My-browser-password-2026");
    await page.getByLabel("Повторите новый пароль", { exact: true }).fill("My-browser-password-2026");
    await page.getByRole("button", { name: "Сохранить пароль", exact: true }).click();
    await page.getByRole("heading", { name: "Проект появится здесь", exact: true }).waitFor();
    await login(page, origin, "client");
    await page.evaluate(() => localStorage.setItem("nodo.portal.demo.v1", JSON.stringify({ version: 1, role: "admin", data: { projects: [] } })));
    await page.goto(origin + "/cabinet/?role=admin"); await page.getByTestId("portal").waitFor();
    assert.equal(await page.getByTestId("portal").getAttribute("data-role"), "client", "URL and stale browser state cannot change the server-assigned role");
    assert.equal(await page.getByRole("button", { name: "three", exact: true }).count(), 0);
  } finally { await context.close(); }
}

export async function checkWorkspacePreferences(browser, origin) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, colorScheme: "dark" });
  try {
    const page = await context.newPage();
    await login(page, origin, "client");
    const root = page.getByTestId("portal");
    assert.equal(await root.getAttribute("data-theme"), "dark");
    await page.getByRole("button", { name: "Включить светлую тему", exact: true }).click();
    await login(page, origin, "developer");
    await page.reload(); await root.waitFor();
    assert.equal(await root.getAttribute("data-role"), "developer");
    assert.equal(await root.getAttribute("data-theme"), "light");
    const second = await context.newPage();
    await second.goto(origin + "/cabinet/"); await second.getByTestId("portal").waitFor();
    await second.getByRole("button", { name: "Включить тёмную тему", exact: true }).click();
    await page.waitForFunction(() => document.querySelector('[data-testid="portal"]').dataset.theme === "dark");
    await login(page, origin, "curator");
    assert.equal(await root.getAttribute("data-theme"), "dark");
  } finally { await context.close(); }
  const privateContext = await browser.newContext({ viewport: { width: 320, height: 844 } });
  try {
    await privateContext.addInitScript(() => Object.defineProperty(window, "localStorage", { get() { throw new Error("Storage unavailable"); } }));
    const page = await privateContext.newPage();
    await login(page, origin, "client");
    await page.getByRole("button", { name: "Включить тёмную тему", exact: true }).click();
    assert.equal(await page.getByTestId("portal").getAttribute("data-theme"), "dark");
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
  } finally { await privateContext.close(); }
}
