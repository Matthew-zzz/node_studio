import assert from "node:assert/strict";
import { resolve } from "node:path";
import { fixtureAt } from "../helpers/portal-fixture.mjs";

export async function checkClientBrief(page, origin, width, screenshots, miniapp = false) {
  if (miniapp) await page.getByRole("region", { name: "Очередь обращений", exact: true }).getByRole("button", { name: /^Открыть диалог:/ }).first().click();
  const button = miniapp ? page.getByRole("region", { name: "Открытый Telegram-диалог", exact: true }).getByRole("button", { name: /^Итоговый бриф:/ }) : page.getByRole("region", { name: "Очередь обращений", exact: true }).getByRole("button", { name: /^Итоговый бриф:/ }).first();
  const label = await button.getAttribute("aria-label"); await button.click();
  const dialog = page.getByRole("dialog", { name: label, exact: true });
  await dialog.getByText("Бриф готов", { exact: true }).waitFor();
  for (const title of ["Цель проекта", "Пользователи и сценарии", "Функциональные требования", "Дизайн и платформы", "Интеграции и данные", "Ограничения, бюджет и сроки", "Критерии готовности", "Открытые вопросы и противоречия"]) assert.ok(await dialog.getByText(title, { exact: true }).isVisible());
  await dialog.getByText("ТЗ целиком", { exact: true }).click();
  const text = await dialog.getByRole("textbox", { name: "Полный текст ТЗ", exact: true }).inputValue();
  assert.ok(text.startsWith("Техническое задание:")); assert.ok(text.includes("Каталог с поиском")); assert.ok(text.length <= 16000);
  assert.ok(await dialog.evaluate(element => element.scrollWidth <= element.clientWidth + 1));
  const bounds = await dialog.boundingBox(); assert.ok(bounds.x >= 0 && bounds.x + bounds.width <= width + 1);
  await page.screenshot({ path: resolve(screenshots, `${width}-${miniapp ? "miniapp-" : ""}client-brief.png`) });
  const snapshot = await (await page.request.get(`${origin}/api/portal/snapshot`, { headers: miniapp ? { "X-Portal-Client": "miniapp" } : {} })).json();
  const generatedAt = snapshot.clientBriefs[0].generatedAt;
  const form = dialog.getByRole("form", { name: "Привязка брифа к проекту", exact: true });
  await form.getByLabel("Проект для брифа", { exact: true }).selectOption("one");
  await form.getByRole("button", { name: "Сохранить привязку", exact: true }).click();
  await dialog.locator('[data-sonner-toast][data-type="success"]').filter({ hasText: "Бриф добавлен в обзор проекта." }).waitFor();
  const fixture = fixtureAt(origin); const original = fixture.integrations.brief; let release;
  const gate = new Promise(resolve => { release = resolve; });
  fixture.integrations.brief = async (...args) => { await gate; return { ...await original(...args), features: "Поиск товаров и фильтры" }; };
  try {
    await dialog.getByRole("button", { name: "Обновить бриф", exact: true }).click();
    await dialog.getByRole("button", { name: "Готовим бриф…", exact: true }).waitFor();
    assert.ok((await dialog.getByRole("textbox", { name: "Полный текст ТЗ", exact: true }).inputValue()).includes("Поиск товаров"));
    assert.equal(await dialog.locator('[data-sonner-toast]').filter({ hasText: "Бриф успешно обновлён." }).count(), 0, "success waits for AI completion");
    release();
    const success = dialog.locator('[data-sonner-toast][data-type="success"]').filter({ hasText: "Бриф успешно обновлён." });
    await success.waitFor();
    const toast = await success.boundingBox(); assert.ok(toast.x >= 0 && toast.x + toast.width <= width + 1 && toast.y >= 0 && toast.y + toast.height <= await page.evaluate(() => innerHeight), "the success notification is visible inside the modal top layer");
    await dialog.getByText("Бриф готов", { exact: true }).waitFor();
    assert.ok((await dialog.getByRole("textbox", { name: "Полный текст ТЗ", exact: true }).inputValue()).includes("Поиск товаров и фильтры"));
    await page.screenshot({ path: resolve(screenshots, `${width}-${miniapp ? "miniapp-" : ""}brief-updated-toast.png`) });
  } finally { release(); fixture.integrations.brief = original; }
  const refreshed = await (await page.request.get(`${origin}/api/portal/snapshot`, { headers: miniapp ? { "X-Portal-Client": "miniapp" } : {} })).json();
  assert.notEqual(refreshed.clientBriefs[0].generatedAt, generatedAt);
  assert.equal(refreshed.clientBriefs[0].projectId, "one");
  await dialog.getByRole("button", { name: "Закрыть итоговый бриф", exact: true }).click();
  await button.click(); await dialog.getByText("Бриф готов", { exact: true }).waitFor();
  const repeat = await (await page.request.get(`${origin}/api/portal/snapshot`, { headers: miniapp ? { "X-Portal-Client": "miniapp" } : {} })).json();
  assert.equal(repeat.clientBriefs[0].generatedAt, refreshed.clientBriefs[0].generatedAt);
  if (miniapp) { await page.waitForFunction(() => window.__telegram.backVisible); await page.evaluate(() => window.__telegram.back()); await dialog.waitFor({ state: "hidden" }); }
  else await dialog.getByRole("button", { name: "Закрыть итоговый бриф", exact: true }).click();
}

export async function checkSharedProjectBrief(page) {
  const brief = page.getByRole("region", { name: "Итоговый бриф проекта", exact: true });
  await brief.getByText("Открыть итоговый бриф", { exact: true }).click();
  await brief.getByText("ТЗ целиком", { exact: true }).click();
  const text = brief.getByRole("textbox", { name: "Полный текст итогового брифа", exact: true });
  assert.ok((await text.inputValue()).includes("Поиск товаров и фильтры"));
  assert.ok(await text.getAttribute("readonly") !== null);
  assert.equal(await brief.getByRole("button", { name: "Обновить бриф", exact: true }).count(), 0);
  assert.ok(await brief.evaluate(element => element.scrollWidth <= element.clientWidth + 1));
  await brief.getByText("Открыть итоговый бриф", { exact: true }).click();
}
