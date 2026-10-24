import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { chromium } from "playwright";
import { createStaticServer } from "../scripts/lib/static-server.mjs";
import { portalFixture } from "./helpers/portal-fixture.mjs";
import { completeEmailCode, login, selectLoginRole } from "./browser/portal.mjs";
import { chooseAction } from "./browser/focus-dialogs.mjs";

const screenshots = resolve("test-results/screenshots/repository-connection"); await mkdir(screenshots, { recursive: true });
const server = createStaticServer(resolve(process.env.SITE_OUTPUT_DIR || "dist")); const frontend = server.listeners("request")[0]; server.removeAllListeners("request");
let fixture; let browser; let worker;
server.on("request", (request, response) => void (request.url.startsWith("/api/portal/") ? fixture.handler(request, response) : frontend(request, response)));
try {
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve)); const origin = `http://127.0.0.1:${server.address().port}`;
  browser = await chromium.launch({ headless: true, ...(process.env.CHROMIUM_EXECUTABLE ? { executablePath: process.env.CHROMIUM_EXECUTABLE } : {}) });
  for (const [presentation, width] of [["web", 1440], ["web", 320], ["miniapp", 320]]) {
    fixture = portalFixture(origin); worker = setInterval(() => void fixture.service.workJobs(), 100);
    const context = await browser.newContext({ viewport: { width, height: 900 }, reducedMotion: "reduce" });
    await context.route("https://telegram.org/js/telegram-web-app.js*", route => route.fulfill({ contentType: "application/javascript", body: "/* standalone Mini App fixture */" }));
    const page = await context.newPage(); const errors = []; page.on("pageerror", error => errors.push(error.message));
    const mini = presentation === "miniapp";
    async function navigate(name) {
      if (mini) {
        const navigation = page.getByRole("navigation", { name: "Навигация приложения", exact: true }); const label = name === "Создание проектов" ? "Создать" : name;
        if (!await navigation.getByRole("button", { name: label, exact: true }).count()) await navigation.getByRole("button", { name: "Проекты", exact: true }).click();
        await navigation.getByRole("button", { name: label, exact: true }).click();
      }
      else {
        if (width <= 650) await page.getByRole("button", { name: "Открыть меню кабинета", exact: true }).click();
        await page.getByRole("navigation", { name: "Разделы кабинета", exact: true }).getByRole("button", { name, exact: true }).click();
      }
    }
    async function create(name, repo = "") {
      await navigate("Создание проектов"); await chooseAction(page, "Создать проект", "Создать для существующего клиента");
      const form = page.getByRole("form", { name: "Создание проекта разработчиком", exact: true });
      await form.getByLabel("Название проекта", { exact: true }).fill(name); await form.getByLabel("Почта клиента", { exact: true }).fill("client@example.test");
      await form.getByLabel("ТЗ проекта", { exact: true }).fill("Подключить существующий проект и сохранить его историю.");
      if (repo) { await form.getByLabel("Репозиторий", { exact: true }).selectOption("existing"); await form.getByLabel("Существующий репозиторий GitHub", { exact: true }).fill(repo); }
      assert.equal(await form.getByLabel("Название GitHub-репозитория", { exact: true }).count(), repo ? 0 : 1);
      assert.ok(await form.evaluate(element => element.scrollWidth <= element.clientWidth + 1));
      if (repo) await page.screenshot({ path: resolve(screenshots, `${presentation}-${width}-create.png`), fullPage: true });
      await form.getByRole("button", { name: "Создать проект", exact: true }).click();
      await page.getByRole("region", { name: "Проекты клиентов", exact: true }).getByRole("heading", { name, exact: true }).waitFor();
    }
    async function accept(name) {
      await navigate("Общая очередь");
      await page.getByRole("region", { name: "Общая очередь проектов", exact: true }).locator("article").filter({ has: page.getByRole("heading", { name, exact: true }) }).getByRole("button", { name: "Взять в работу", exact: true }).click();
      await page.getByRole("heading", { name, exact: true, level: 1 }).waitFor();
    }
    try {
      if (mini) {
        await page.goto(origin + "/miniapp/"); await page.getByLabel("Почта", { exact: true }).waitFor(); await selectLoginRole(page, "developer");
        await page.getByLabel("Почта", { exact: true }).fill("developer@example.test"); await page.getByRole("button", { name: "Получить код", exact: true }).click();
        await page.getByLabel("Код из письма", { exact: true }).waitFor(); await completeEmailCode(page, origin, "developer@example.test"); await page.getByTestId("portal").waitFor();
      } else await login(page, origin, "developer");
      const repo = "Matthew-zzz/Existing"; const task = { ...fixture.issues.get("Matthew-zzz/fixture-one")[0], title: "Этап из существующего GitHub" };
      fixture.issues.set(repo, [task]); fixture.commits.set(repo, [{ sha: "c".repeat(40), title: "init: существующая история", author: "Developer", createdAt: new Date().toISOString() }]);
      await create("Проект из GitHub", "https://github.com/Matthew-zzz/Existing.git"); await accept("Проект из GitHub");
      if (mini) await page.getByRole("navigation", { name: "Навигация приложения", exact: true }).getByRole("button", { name: "Задачи", exact: true }).click();
      else { if (width <= 650) await page.getByRole("button", { name: "Открыть меню кабинета", exact: true }).click(); await page.getByRole("group", { name: "Разделы проекта Проект из GitHub", exact: true }).getByRole("button", { name: "Задачи", exact: true }).click(); }
      await page.getByRole("heading", { name: new RegExp(`${task.title}$`) }).waitFor();
      assert.equal(await page.getByRole("button", { name: "Создать GitHub-репозиторий", exact: true }).count(), 0);
      const project = fixture.store.all("projects").find(project => project.name === "Проект из GitHub"); assert.equal(project.repo, repo);

      await create("Подключить к готовому проекту"); await accept("Подключить к готовому проекту");
      const setup = page.getByRole("region", { name: "Репозиторий проекта", exact: true }); await setup.getByLabel("Репозиторий", { exact: true }).selectOption("existing");
      await setup.getByLabel("Название подпроекта", { exact: true }).fill("Frontend");
      await setup.getByLabel("Существующий репозиторий GitHub", { exact: true }).fill("Matthew-zzz/Existing-second");
      await setup.getByRole("button", { name: "Подключить репозиторий", exact: true }).click();
      await page.locator('[data-sonner-toast][data-type="success"]').filter({ hasText: "Репозиторий подключён к проекту." }).waitFor();
      assert.equal(fixture.store.all("projects").find(project => project.name === "Подключить к готовому проекту").repo, "Matthew-zzz/Existing-second");
      assert.equal(fixture.repositories.length, 0); assert.deepEqual(fixture.issues.get(repo), [task]);
      const configured = fixture.store.all("projects").find(project => project.name === "Подключить к готовому проекту");
      assert.equal(configured.subprojects[0].name, "Frontend");
      const manager = page.getByRole("region", { name: "Подготовить разработку", exact: true }); await manager.waitFor();
      await manager.getByRole("button", { name: "Изменить название подпроекта Frontend", exact: true }).click();
      await page.getByLabel("Новое название подпроекта", { exact: true }).fill("Интерфейс");
      await page.getByRole("button", { name: "Сохранить название", exact: true }).click();
      await manager.getByRole("button", { name: "Изменить название подпроекта Интерфейс", exact: true }).waitFor();
      const originalCreate = fixture.integrations.createRepository;
      fixture.integrations.createRepository = async () => { throw new Error("Temporary subproject outage"); };
      const extra = manager.getByRole("form", { name: "Добавление подпроекта", exact: true });
      await extra.getByLabel("Название нового подпроекта", { exact: true }).fill("Backend");
      await extra.getByLabel("Способ подключения подпроекта", { exact: true }).selectOption("new");
      const backendName = `browser-${presentation}-${width}-backend`;
      await extra.getByLabel("Название GitHub-репозитория", { exact: true }).fill(backendName);
      await extra.getByRole("button", { name: "Создать репозиторий подпроекта", exact: true }).click();
      await manager.getByRole("heading", { name: "Повторим создание автоматически", exact: true }).waitFor();
      const pending = fixture.store.get("projects", configured.id).subprojects[1];
      assert.equal(pending.name, "Backend"); assert.equal(pending.repo, "");
      assert.equal(fixture.store.get("projects", configured.id).repo, "Matthew-zzz/Existing-second");
      await page.screenshot({ path: resolve(screenshots, `${presentation}-${width}-subproject-retry.png`), fullPage: true });
      fixture.store.db.prepare("UPDATE jobs SET attempts=7,available=0 WHERE kind='github.repository.create' AND json_extract(payload,'$.subprojectId')=?").run(pending.id);
      await fixture.service.workJobs();
      await manager.getByRole("heading", { name: "Создание приостановлено", exact: true }).waitFor();
      fixture.integrations.createRepository = originalCreate;
      await manager.getByRole("button", { name: "Повторить создание подпроекта", exact: true }).click();
      await manager.getByRole("link", { name: `Matthew-zzz/${backendName}`, exact: true }).waitFor();
      assert.equal(fixture.repositories.length, 1);
      await extra.getByLabel("Способ подключения подпроекта", { exact: true }).selectOption("existing");
      await extra.getByLabel("Название нового подпроекта", { exact: true }).fill("Worker");
      await extra.getByLabel("Репозиторий нового подпроекта", { exact: true }).fill("https://github.com/Matthew-zzz/Existing-worker.git");
      await extra.getByRole("button", { name: "Подключить подпроект", exact: true }).click();
      await manager.getByRole("link", { name: "Matthew-zzz/Existing-worker", exact: true }).waitFor();
      assert.equal(fixture.store.get("projects", configured.id).subprojects.length, 3);
      assert.equal(fixture.repositories.length, 1);
      await page.screenshot({ path: resolve(screenshots, `${presentation}-${width}-subprojects.png`), fullPage: true });
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)); assert.deepEqual(errors, []);
      console.log(`Existing repositories ${presentation} ${width}px: create from a GitHub URL, preserve tasks/history, attach to an accepted project, named subprojects, rename, independent repository creation/retry, existing subproject attachment and mobile layout passed.`);
    } finally { await context.close(); clearInterval(worker); fixture.close(); }
  }
} finally { await browser?.close(); clearInterval(worker); await new Promise(resolve => server.close(resolve)); }
