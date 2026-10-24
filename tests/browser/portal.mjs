import { chooseAction, closeDialog } from "./focus-dialogs.mjs";
import assert from "node:assert/strict";
import { emailCode } from "../helpers/http.mjs";
import { resolve } from "node:path";
import { fixtureAt } from "../helpers/portal-fixture.mjs";
import { checkClientBrief } from "./client-briefs.mjs";

export async function completeEmailCode(page, origin, email) {
  const fixture = fixtureAt(origin);
  const code = await emailCode(fixture, email);
  await page.getByLabel("Код из письма", { exact: true }).fill(code);
  await page.getByRole("button", { name: "Подтвердить и войти", exact: true }).click();
}

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

export async function selectLoginRole(page, role) {
  if (["developer", "admin"].includes(role)) {
    await page.getByRole("button", { name: "Вход для сотрудников", exact: true }).click();
    await page.getByRole("combobox", { name: "Профиль", exact: true }).selectOption(role);
  }
}

export async function login(page, origin, role) {
  await page.goto(origin + "/cabinet/");
  const signOut = page.getByRole("button", { name: "Выйти", exact: true });
  await page.waitForFunction(() => document.querySelector('[data-testid="portal"]') || document.querySelector('input[type="email"]'));
  if (await signOut.count()) await signOut.click();
  await selectLoginRole(page, role);
  await page.getByLabel("Почта", { exact: true }).fill(`${role}@example.test`);
  await page.getByRole("button", { name: "Получить код", exact: true }).click();
  await page.getByLabel("Код из письма", { exact: true }).waitFor();
  await completeEmailCode(page, origin, `${role}@example.test`);
  await page.getByTestId("portal").waitFor();
  // Browser scenarios are independent login sequences, not an hour-long account abuse test.
  fixtureAt(origin).store.db.exec("DELETE FROM auth_limits");
  assert.equal(await page.locator('a[href*="-demo"]').count(), 0);
  assert.ok((await page.title()).includes("Node Studio"));
  const path = await page.locator('header a[href="/"]').evaluate(link => [...link.parentElement.children].map(element => ({ height: element.getBoundingClientRect().height, lineHeight: Number.parseFloat(getComputedStyle(element).lineHeight) })));
  assert.ok(path.every(element => element.height <= element.lineHeight + 1), "every breadcrumb segment stays on one line");
  assert.equal(await page.locator('main nav[aria-label="Вкладки кабинета"]').count(), 0);
}

export async function checkProfileSwitching(browser, origin, width, screenshots) {
  const context = await browser.newContext({ viewport: { width, height: 900 } });
  try {
    const page = await context.newPage();
    await login(page, origin, "admin");
    const root = page.getByTestId("portal");
    const profiles = page.getByRole("group", { name: "Переключение профилей", exact: true });
    async function openProfiles() {
      if (width <= 650) await page.getByRole("button", { name: "Открыть профили", exact: true }).click();
      await profiles.waitFor({ state: "visible" });
    }
    async function waitForRole(role) { await page.waitForFunction(role => document.querySelector('[data-testid="portal"]')?.dataset.role === role, role); }
    for (const [role, label] of [["developer", "Разработчик"], ["client", "Клиент"]]) {
      if (role === "client") {
        await openProfiles();
        await profiles.getByRole("button", { name: "Переключиться: Администратор, admin", exact: true }).click();
        await waitForRole("admin");
      }
      await openProfiles();
      await profiles.getByRole("button", { name: `Добавить профиль: ${label}`, exact: true }).click();
      const dialog = page.getByRole("dialog", { name: "Добавить профиль", exact: true });
      await dialog.getByLabel("Почта профиля", { exact: true }).fill(`${role}@example.test`);
      await dialog.getByRole("button", { name: "Получить код и добавить", exact: true }).click();
      await page.getByLabel("Код из письма", { exact: true }).waitFor();
      const validCode = await emailCode(fixtureAt(origin), `${role}@example.test`);
      await page.getByLabel("Код из письма", { exact: true }).fill(validCode === "000000" ? "111111" : "000000");
      await page.getByRole("button", { name: "Подтвердить и войти", exact: true }).click();
      const error = page.getByRole("dialog", { name: "Подтвердите вход", exact: true }).locator('[data-sonner-toast][data-type="error"]').filter({ hasText: "Код указан неверно" });
      await error.waitFor();
      const bounds = await error.boundingBox();
      assert.ok(bounds.y < 100 && bounds.x >= 0 && bounds.x + bounds.width <= width + 1, "modal error is at the top and fits the viewport");
      await error.getByRole("button", { name: "Закрыть уведомление", exact: true }).click();
      assert.notEqual(await root.getAttribute("data-role"), role, "an invalid email code cannot switch profiles");
      await completeEmailCode(page, origin, `${role}@example.test`);
      await waitForRole(role);
    }
    const second = await context.newPage();
    await second.goto(origin + "/cabinet/"); await second.getByTestId("portal").waitFor();
    for (const [role, label] of [["client", "Клиент"], ["developer", "Разработчик"], ["admin", "Администратор"], ["client", "Клиент"]]) {
      await openProfiles();
      await profiles.getByRole("button", { name: `Переключиться: ${label}, ${role}`, exact: true }).click();
      await waitForRole(role);
      await second.waitForFunction(role => document.querySelector('[data-testid="portal"]')?.dataset.role === role, role);
      assert.equal(await page.getByRole("dialog").count(), 0, "remembered profiles switch without a password dialog");
    }
    await page.reload(); await waitForRole("client");
    await openProfiles();
    assert.equal(await profiles.getByRole("button", { name: /^Переключиться:/ }).count(), 3);
    const active = profiles.getByRole("button", { name: "Переключиться: Клиент, client", exact: true });
    assert.equal(await active.getAttribute("aria-pressed"), "true");
    assert.equal(await page.getByRole("button", { name: "three", exact: true }).count(), 0);
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    if (width > 650) {
      const bounds = await profiles.boundingBox();
      assert.ok(bounds.x < 30 && bounds.y + bounds.height > 830, "profiles sit in the bottom left of the viewport");
    }
    await page.screenshot({ path: resolve(screenshots, `${width}-profiles-light.png`), fullPage: true });
    if (width <= 650) await page.keyboard.press("Escape");
    await page.getByRole("button", { name: "Включить тёмную тему", exact: true }).click();
    if (width <= 650) await openProfiles();
    await page.screenshot({ path: resolve(screenshots, `${width}-profiles-dark.png`), fullPage: true });
    if (width <= 650) await page.keyboard.press("Escape");
    await page.getByRole("button", { name: "Выйти", exact: true }).click();
    await page.getByRole("heading", { name: "С возвращением", exact: true }).waitFor();
    await second.getByRole("heading", { name: "С возвращением", exact: true }).waitFor();
    await login(page, origin, "client"); await openProfiles();
    assert.equal(await profiles.getByRole("button", { name: /^Переключиться:/ }).count(), 1, "signing out removes remembered profiles");
  } finally { await context.close(); }
}

async function openChat(page, width) {
  await navigate(page, width, "Чат");
}

export async function openProject(page, width, projectId, section = "Обзор проекта") {
  if (width <= 650) await page.getByRole("button", { name: "Открыть меню кабинета", exact: true }).click();
  const developer = await page.getByTestId("portal").getAttribute("data-role") === "developer";
  const projects = page.getByRole("navigation", { name: developer ? "Проекты в работе" : "Мои проекты", exact: true });
  const branch = projects.locator("details").filter({ has: page.getByText(projectId, { exact: true }) });
  if (!await branch.evaluate(element => element.open)) await branch.locator("summary").click();
  await branch.getByRole("button", { name: section, exact: true }).click();
  if (width <= 650) await page.getByRole("dialog", { name: "Меню кабинета", exact: true }).waitFor({ state: "hidden" });
  await page.getByRole("heading", { name: projectId, level: 1, exact: true }).waitFor();
}

async function navigate(page, width, label) {
  if (width <= 650) await page.getByRole("button", { name: "Открыть меню кабинета", exact: true }).click();
  const projectSection = ["Обзор проекта", "Задачи", "История", "Чат"].includes(label);
  const developer = await page.getByTestId("portal").getAttribute("data-role") === "developer";
  const navigation = page.getByRole("navigation", { name: projectSection ? developer ? "Проекты в работе" : "Мои проекты" : "Разделы кабинета", exact: true });
  await navigation.getByRole("button", { name: label, exact: true }).filter({ visible: true }).click();
  assert.equal(await page.locator('main nav[aria-label="Вкладки кабинета"]').count(), 0);
  if (width <= 650) await page.getByRole("dialog", { name: "Меню кабинета", exact: true }).waitFor({ state: "hidden" });
}

export async function checkPortal(page, origin, width, screenshots, portal) {
  for (const path of ["/cabinet-demo/", "/checkout-demo/", "/payment-demo/"]) assert.equal((await page.request.get(origin + path)).status(), 404);
  await login(page, origin, "client");
  const root = page.getByTestId("portal");
  assert.equal(await root.getAttribute("data-role"), "client");
  await page.getByRole("heading", { name: "one", level: 1, exact: true }).waitFor();
  if (width <= 650) {
    const open = page.getByRole("button", { name: "Открыть меню кабинета", exact: true });
    await open.click();
    const menu = page.getByRole("dialog", { name: "Меню кабинета", exact: true });
    await menu.getByRole("navigation", { name: "Разделы кабинета", exact: true }).waitFor();
    await page.screenshot({ path: resolve(screenshots, `${width}-cabinet-sidebar.png`), fullPage: true });
    await page.keyboard.press("Escape");
    assert.equal(await menu.count(), 0);
    assert.ok(await open.evaluate(element => document.activeElement === element), "closing the sidebar restores keyboard focus");
  }
  if (width <= 650) await page.getByRole("button", { name: "Открыть меню кабинета", exact: true }).click();
  const clientMenu = page.getByRole("navigation", { name: "Мои проекты", exact: true });
  assert.deepEqual(await clientMenu.locator("summary > span:first-of-type").allTextContents(), ["one", "two"], "only this client's projects appear in the sidebar");
  assert.deepEqual(await page.getByRole("navigation", { name: "Разделы кабинета", exact: true }).getByRole("button").allTextContents(), ["Настройки"]);
  assert.deepEqual(await page.getByRole("group", { name: "Разделы проекта one", exact: true }).getByRole("button").allTextContents(), ["Обзор проекта", "Задачи", "История", "Чат"]);
  if (width <= 650) await page.keyboard.press("Escape");
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
  await page.screenshot({ path: resolve(screenshots, `${width}-cabinet-client.png`), fullPage: true });
  const chat = page.getByRole("region", { name: "Чат проекта", exact: true });
  assert.equal(await chat.count(), 0, "client chat has its own project section");
  await openProject(page, width, "two", "Чат");
  await chat.getByText("Личная переписка two", { exact: true }).waitFor();
  assert.equal(await chat.getByText("Личная переписка one", { exact: true }).count(), 0);
  await openProject(page, width, "one", "Задачи");
  await page.getByRole("region", { name: "Задачи проекта", exact: true }).waitFor();
  assert.equal(await chat.count(), 0);
  await openChat(page, width);
  await chat.getByLabel("Сообщение", { exact: true }).fill("Добавить поиск товаров по названию");
  await chat.getByRole("button", { name: "Отправить сообщение", exact: true }).click();
  await portal.service.workJobs();
  await page.reload(); await root.waitFor(); await openChat(page, width);
  const confirm = chat.getByRole("button", { name: "Подтвердить и отправить задачу", exact: true });
  await confirm.click(); await confirm.waitFor({ state: "detached" });

  const title = "Подготовленная задача";
  await login(page, origin, "developer");
  await navigate(page, width, "Очередь");
  const queue = page.getByRole("region", { name: "Очередь проектов", exact: true });
  const queuedProject = id => queue.locator("article").filter({ has: page.getByRole("heading", { name: id, exact: true }) });
  assert.equal(await page.getByRole("navigation", { name: "Проекты в работе", exact: true }).count(), 0, "unclaimed projects are absent from the sidebar");
  await page.getByRole("region", { name: "Ожидают разработчика", exact: true }).getByRole("button", { name: "Взять проект и открыть чат", exact: true }).click();
  await chat.waitFor();
  assert.ok(await chat.isVisible(), "handoff opens the project chat on desktop and mobile");
  await navigate(page, width, "Очередь");
  assert.equal(await queuedProject("three").count(), 0, "accepted projects leave the general queue");
  await page.getByLabel("Поиск проектов", { exact: true }).fill("ONE");
  assert.equal(await queue.locator("article").count(), 1);
  await page.getByLabel("Поиск проектов", { exact: true }).fill("несуществующий проект");
  await queue.getByRole("heading", { name: "Ничего не найдено", exact: true }).waitFor();
  await queue.getByRole("button", { name: "Сбросить поиск", exact: true }).click();
  await queuedProject("one").getByRole("button", { name: "Взять в работу", exact: true }).click();
  await page.getByRole("heading", { name: "one", level: 1, exact: true }).waitFor();
  assert.equal(await chat.count(), 0, "developer chat has its own project section");
  if (width <= 650) await page.getByRole("button", { name: "Открыть меню кабинета", exact: true }).click();
  const globalMenu = page.getByRole("navigation", { name: "Разделы кабинета", exact: true });
  assert.deepEqual(await globalMenu.getByRole("button").allTextContents(), ["Диалоги", "Очередь", "Проекты и оплаты", "Настройки"]);
  const sections = page.getByRole("group", { name: "Разделы проекта one", exact: true });
  assert.deepEqual(await sections.getByRole("button").allTextContents(), ["Обзор проекта", "Задачи", "История", "Чат"]);
  await page.screenshot({ path: resolve(screenshots, `${width}-developer-project-menu-light.png`), fullPage: true });
  if (width <= 650) await page.keyboard.press("Escape");
  await page.reload(); await root.waitFor();
  assert.equal(await queuedProject("one").count(), 0, "selection is restored from the server after reload");
  await openProject(page, width, "one", "Задачи");
  const task = page.getByRole("region", { name: "Задачи проекта", exact: true }).locator("article").filter({ has: page.getByRole("heading", { name: new RegExp(title) }) });
  await chooseAction(page, task.getByRole("button", { name: /^Действия задачи:/ }), "Управление задачей");
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
  await navigate(page, width, "История");
  await page.getByRole("heading", { name: "init: первоначальная версия проекта", exact: true }).waitFor();
  await page.getByRole("button", { name: "Включить тёмную тему", exact: true }).click();
  await page.reload(); await root.waitFor();
  assert.equal(await root.getAttribute("data-theme"), "dark");
  await navigate(page, width, "История");
  if (width <= 650) await page.getByRole("button", { name: "Открыть меню кабинета", exact: true }).click();
  await page.screenshot({ path: resolve(screenshots, `${width}-client-project-menu-dark.png`), fullPage: true });
  if (width <= 650) await page.keyboard.press("Escape");

  await login(page, origin, "developer");
  await openProject(page, width, "one", "Задачи");
  await chooseAction(page, task.getByRole("button", { name: /^Действия задачи:/ }), "Управление задачей");
  await task.getByLabel("Статус", { exact: true }).selectOption("in_progress");
  await task.getByRole("button", { name: "Обновить", exact: true }).click();
  await task.getByText("В работе", { exact: true }).first().waitFor();
  await openChat(page, width);
  await chat.getByRole("button", { name: "Подключиться к диалогу", exact: true }).click();
  await chat.getByRole("button", { name: "Покинуть диалог", exact: true }).waitFor();
  await chat.getByLabel("Сообщение", { exact: true }).fill("Изменения приняты в работу.");
  await chat.getByRole("button", { name: "Отправить сообщение", exact: true }).click();
  await page.reload(); await root.waitFor();
  await openProject(page, width, "one", "Чат");
  await chat.getByText("Изменения приняты в работу.", { exact: true }).waitFor();
  await chat.getByRole("button", { name: "Покинуть диалог", exact: true }).click();
  await chat.getByRole("button", { name: "Подключиться к диалогу", exact: true }).waitFor();
  await page.screenshot({ path: resolve(screenshots, `${width}-cabinet-developer.png`), fullPage: true });
  await navigate(page, width, "История");
  await page.getByRole("heading", { name: "init: первоначальная версия проекта", exact: true }).waitFor();
  if (width <= 650) await page.getByRole("button", { name: "Открыть меню кабинета", exact: true }).click();
  await page.screenshot({ path: resolve(screenshots, `${width}-developer-project-menu-dark.png`), fullPage: true });
  if (width <= 650) await page.keyboard.press("Escape");
  await navigate(page, width, "Обзор проекта");
  await page.getByRole("button", { name: "Добавить этап", exact: true }).click();
  const stageEditor = page.getByRole("dialog", { name: "Добавить этап", exact: true });
  await stageEditor.getByLabel("Название", { exact: true }).fill("Черновик только для проекта one");
  await closeDialog(page);
  await openProject(page, width, "three", "Чат");
  await chat.getByText("Личная переписка three", { exact: true }).waitFor();
  assert.equal(await chat.getByText("Личная переписка one", { exact: true }).count(), 0);
  await navigate(page, width, "Очередь");
  await queuedProject("two").getByRole("button", { name: "Взять в работу", exact: true }).click();
  await page.getByRole("heading", { name: "two", level: 1, exact: true }).waitFor();
  await page.getByRole("button", { name: "Добавить этап", exact: true }).click();
  assert.equal(await stageEditor.getByLabel("Название", { exact: true }).inputValue(), "", "unsaved forms cannot move into a different project");
  await closeDialog(page);
  await navigate(page, width, "Очередь");
  await queue.getByRole("heading", { name: "Очередь свободна", exact: true }).waitFor();
  await openProject(page, width, "one", "Обзор проекта");

  await login(page, origin, "developer");
  await checkClientBrief(page, origin, width, screenshots);
  assert.equal(await page.getByRole("region", { name: "Задачи проекта", exact: true }).count(), 0);
  const inbox = page.getByRole("region", { name: "Очередь обращений", exact: true });
  await page.getByLabel("Поиск диалогов", { exact: true }).fill("@KATE_STUDIO");
  assert.equal(await inbox.getByRole("button", { name: /^Открыть диалог:/ }).count(), 1);
  await page.getByLabel("Поиск диалогов", { exact: true }).fill("dmitry@example.test");
  await inbox.getByText("Дмитрий", { exact: true }).waitFor();
  await page.getByLabel("Поиск диалогов", { exact: true }).fill("");
  const filters = page.getByRole("group", { name: "Фильтр диалогов", exact: true });
  await filters.getByRole("button", { name: "Ждут разработчика", exact: true }).click();
  const telegram = page.getByRole("region", { name: "Telegram-диалог", exact: true });
  await telegram.getByRole("button", { name: "Подключиться к диалогу", exact: true }).click();
  await telegram.getByRole("button", { name: "Покинуть диалог", exact: true }).waitFor();
  await filters.getByRole("button", { name: "Мои диалоги", exact: true }).click();
  assert.equal(await inbox.getByRole("button", { name: /^Открыть диалог:/ }).count(), 1);
  await telegram.getByLabel("Сообщение", { exact: true }).fill("Здравствуйте! Помогу с проектом.");
  await telegram.getByRole("button", { name: "Отправить сообщение", exact: true }).click();
  await telegram.getByText("Здравствуйте! Помогу с проектом.", { exact: true }).waitFor();
  await telegram.getByRole("button", { name: "Покинуть диалог", exact: true }).click();
  await page.screenshot({ path: resolve(screenshots, `${width}-cabinet-intake.png`), fullPage: true });

  const projectName = `Новый проект ${width}`;
  await navigate(page, width, "Проекты и оплаты");
  await page.getByRole("group", { name: "Проекты и оплаты", exact: true }).getByRole("button", { name: "Оплаты", exact: true }).click();
  await chooseAction(page, "Создать проект", "Подготовить ссылку на оплату");
  const paidProject = page.getByRole("dialog", { name: "Оплата и выдача доступа", exact: true });
  await paidProject.getByLabel("Название проекта", { exact: true }).fill(projectName);
  await page.getByLabel("Имя клиента", { exact: true }).fill("Клиент");
  await paidProject.getByLabel("Почта клиента", { exact: true }).fill("client@example.test");
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
  await navigate(page, width, "Проекты и оплаты");
  await page.getByRole("group", { name: "Проекты и оплаты", exact: true }).getByRole("button", { name: "Оплаты", exact: true }).click();
  await page.getByRole("button", { name: "Создать проект и выдать доступ", exact: true }).click();
  await portal.service.workJobs();
  await page.reload(); await root.waitFor();
  await navigate(page, width, "Проекты и оплаты");
  await page.getByRole("group", { name: "Проекты и оплаты", exact: true }).getByRole("button", { name: "Оплаты", exact: true }).click();
  await page.getByText("Доступ выдан", { exact: true }).waitFor();
  await login(page, origin, "client");
  await openProject(page, width, projectName);
  await login(page, origin, "admin");
  await page.getByRole("heading", { name: "ИИ-агент Telegram", exact: true }).waitFor();
  assert.equal(await chat.count(), 0);
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `${width}px authenticated account: no overflow`);
  console.log(`Portal ${width}px: authenticated role workflows, server payments, private projects and handoff passed.`);
}

export async function checkPortalAuthentication(browser, origin) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  try {
    const page = await context.newPage();
    await login(page, origin, "temporary");
    assert.equal(await page.locator('input[type="password"]').count(), 0);
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
    await login(page, origin, "developer");
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
