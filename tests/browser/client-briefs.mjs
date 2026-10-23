import assert from "node:assert/strict";
import { resolve } from "node:path";

export async function checkClientBrief(page, origin, width, screenshots, miniapp = false) {
  const button = page.getByRole("region", { name: "Очередь обращений", exact: true }).getByRole("button", { name: /^Итоговый бриф:/ }).first();
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
  await dialog.getByRole("button", { name: "Закрыть итоговый бриф", exact: true }).click();
  await button.click(); await dialog.getByText("Бриф готов", { exact: true }).waitFor();
  const repeat = await (await page.request.get(`${origin}/api/portal/snapshot`, { headers: miniapp ? { "X-Portal-Client": "miniapp" } : {} })).json();
  assert.equal(repeat.clientBriefs[0].generatedAt, generatedAt);
  if (miniapp) { await page.waitForFunction(() => window.__telegram.backVisible); await page.evaluate(() => window.__telegram.back()); await dialog.waitFor({ state: "hidden" }); }
  else await dialog.getByRole("button", { name: "Закрыть итоговый бриф", exact: true }).click();
}
