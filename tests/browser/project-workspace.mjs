import assert from "node:assert/strict";
import { resolve } from "node:path";
import { login, openProject } from "./portal.mjs";
import { checkSharedProjectBrief } from "./client-briefs.mjs";

export async function checkProjectWorkspace(browser, origin, width, screenshots, fixture) {
  const developer = fixture.login("developer").session;
  for (const projectId of ["one", "two"]) await fixture.service.action(developer, { type: "project.accept", projectId });
  const context = await browser.newContext({ viewport: { width, height: 900 }, reducedMotion: "reduce" });
  const errors = [];
  try {
    const page = await context.newPage();
    page.on("pageerror", error => errors.push(error.message));
    for (const role of ["client", "developer"]) {
      await login(page, origin, role);
      if (await page.getByTestId("portal").getAttribute("data-theme") === "dark") await page.getByRole("button", { name: "Включить светлую тему", exact: true }).click();
      await openProject(page, width, "one", "История");
      await page.getByRole("button", { name: "Открыть рядом", exact: true }).click();
      const workspace = page.getByRole("region", { name: "Рабочая область проекта", exact: true });
      const left = workspace.getByRole("region", { name: "Левая область проекта", exact: true });
      const right = workspace.getByRole("region", { name: "Правая область проекта", exact: true });
      const leftSelect = workspace.getByLabel("Раздел слева", { exact: true });
      const rightSelect = workspace.getByLabel("Раздел справа", { exact: true });
      const chat = workspace.getByRole("region", { name: "Чат проекта", exact: true });
      await left.getByRole("heading", { name: "init: первоначальная версия проекта", exact: true }).waitFor();
      await right.getByText("Личная переписка one", { exact: true }).waitFor();
      const leftBounds = await left.boundingBox(); const rightBounds = await right.boundingBox();
      if (width > 1000) assert.ok(rightBounds.x >= leftBounds.x + leftBounds.width, "panes appear side by side on a wide screen");
      else assert.ok(rightBounds.y >= leftBounds.y + leftBounds.height, "narrow screens stack both panes without hiding either");
      if (role === "developer") {
        await chat.getByRole("button", { name: "Подключиться к диалогу", exact: true }).click();
        await chat.getByRole("button", { name: "Покинуть диалог", exact: true }).waitFor();
      }
      const draft = "Несохранённое сообщение проекта one";
      await chat.getByLabel("Сообщение", { exact: true }).fill(draft);
      await leftSelect.selectOption("overview");
      await checkSharedProjectBrief(page);
      assert.equal(await chat.getByLabel("Сообщение", { exact: true }).inputValue(), draft);
      await openProject(page, width, "one", "История");
      assert.equal(await chat.getByLabel("Сообщение", { exact: true }).inputValue(), draft, "sidebar navigation preserves the pinned chat and its draft");
      await page.screenshot({ path: resolve(screenshots, `${width}-${role}-workspace-light.png`), fullPage: true });
      await page.getByRole("button", { name: "Включить тёмную тему", exact: true }).click();
      await page.screenshot({ path: resolve(screenshots, `${width}-${role}-workspace-dark.png`), fullPage: true });

      const content = { overview: "Этапы проекта", tasks: "Задачи проекта", history: "История коммитов", chat: "Чат проекта" };
      for (const [first, second] of [["overview", "tasks"], ["tasks", "history"], ["tasks", "chat"], ["overview", "history"], ["overview", "chat"], ["history", "chat"]]) {
        await leftSelect.selectOption(first); await rightSelect.selectOption(second);
        await left.getByRole("region", { name: content[first], exact: true }).waitFor();
        await right.getByRole("region", { name: content[second], exact: true }).waitFor();
        assert.equal(await leftSelect.inputValue(), first); assert.equal(await rightSelect.inputValue(), second);
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
      }
      await leftSelect.selectOption("overview"); await rightSelect.selectOption("tasks");
      assert.equal(await workspace.getByRole("region", { name: "Задачи проекта", exact: true }).count(), 1, "overview and tasks do not duplicate the task list or its controls");
      await page.screenshot({ path: resolve(screenshots, `${width}-${role}-workspace-overview-tasks.png`), fullPage: true });
      await leftSelect.selectOption("tasks");
      assert.equal(await rightSelect.inputValue(), "overview", "selecting the other pane's section swaps them");
      await workspace.getByRole("button", { name: "Поменять разделы местами", exact: true }).click();
      assert.equal(await leftSelect.inputValue(), "overview"); assert.equal(await rightSelect.inputValue(), "tasks");
      await workspace.getByRole("button", { name: "Закрыть правый раздел", exact: true }).click();
      await workspace.getByRole("button", { name: "Открыть рядом", exact: true }).waitFor();
      assert.equal(await right.count(), 0);

      await openProject(page, width, "one", "Чат");
      await chat.getByLabel("Сообщение", { exact: true }).fill(draft);
      await workspace.getByRole("button", { name: "Открыть рядом", exact: true }).click();
      assert.equal(await rightSelect.inputValue(), "chat", "opening a companion from chat places chat on the right");
      assert.equal(await chat.getByLabel("Сообщение", { exact: true }).inputValue(), draft, "moving chat between panes preserves its draft");
      await workspace.getByRole("button", { name: "Развернуть правый раздел", exact: true }).click();
      await workspace.getByRole("button", { name: "Открыть рядом", exact: true }).waitFor();
      assert.equal(await chat.getByLabel("Сообщение", { exact: true }).inputValue(), draft, "maximizing chat preserves its draft");
      await workspace.getByRole("button", { name: "Открыть рядом", exact: true }).click();
      await openProject(page, width, "two", "Обзор проекта");
      await workspace.getByRole("button", { name: "Открыть рядом", exact: true }).waitFor();
      assert.equal(await chat.count(), 0, "a new project starts with its own workspace");
      await openProject(page, width, "two", "Чат");
      await chat.getByText("Личная переписка two", { exact: true }).waitFor();
      assert.equal(await chat.getByLabel("Сообщение", { exact: true }).inputValue(), "", "drafts never move into another project's chat");
      assert.equal(await chat.getByText("Личная переписка one", { exact: true }).count(), 0);
      await openProject(page, width, "one", "Чат");
      if (role === "developer") await chat.getByRole("button", { name: "Покинуть диалог", exact: true }).click();
    }
    assert.deepEqual(errors, []);
    console.log(`Project workspace ${width}px: both roles, all section pairs, swapping, chat drafts, responsive layout and project isolation passed.`);
  } finally { await context.close(); }
}
