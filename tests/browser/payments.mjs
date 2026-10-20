import assert from "node:assert/strict";
import { resolve } from "node:path";

export async function checkPayments(page, origin, width, screenshots) {
  const response = await page.goto(`${origin}/payment-demo/`);
  assert.equal(response.status(), 200);
  assert.ok((await page.locator('meta[name="robots"]').getAttribute("content")).includes("noindex"));
  assert.equal(await page.locator("h1").count(), 1);
  const card = page.locator("[data-payment-status]");
  const amount = page.getByTestId("payment-total");
  const dialog = page.getByRole("dialog", { name: "Тестовая оплата", exact: true });
  const waitStatus = (status) => page.waitForFunction((expected) =>
    document.querySelector("[data-payment-status]")?.getAttribute("data-payment-status") === expected, status);
  const digits = async () => (await amount.textContent()).replace(/\D/g, "");

  assert.equal(await digits(), "13000");
  await page.getByRole("button", { name: "Включить светлую тему" }).click();
  assert.equal(await page.locator("[data-payment-theme]").getAttribute("data-payment-theme"), "light");
  await page.screenshot({ path: resolve(screenshots, `${width}-payment-light.png`), fullPage: true });

  await page.getByRole("button", { name: "Проверить оплату", exact: true }).click();
  await dialog.waitFor({ state: "visible" });
  await dialog.getByRole("button", { name: "Имитировать ошибку" }).click();
  await waitStatus("failed");
  assert.ok((await card.textContent()).includes("Оплата не прошла"));

  await page.getByRole("button", { name: "Попробовать ещё раз" }).click();
  await dialog.waitFor({ state: "visible" });
  await page.keyboard.press("Escape");
  await waitStatus("canceled");
  const pay = page.getByRole("button", { name: "Проверить оплату", exact: true });
  assert.ok(await pay.evaluate((button) => document.activeElement === button), "cancel restores focus");

  await pay.click();
  await dialog.waitFor({ state: "visible" });
  await dialog.getByRole("button", { name: "Подтвердить тестовую оплату" }).click();
  await waitStatus("pending");
  await dialog.getByRole("button", { name: "Отменить оплату" }).click();
  await waitStatus("canceled");
  // A completed attempt and a new attempt must not affect one another.
  await pay.click();
  await dialog.waitFor({ state: "visible" });
  await dialog.getByRole("button", { name: "Подтвердить тестовую оплату" }).click();
  await waitStatus("succeeded");
  assert.ok(await page.getByRole("button", { name: "Повторить проверку" }).evaluate((button) => document.activeElement === button));
  await page.getByRole("button", { name: "Повторить проверку" }).click();
  await waitStatus("idle");

  await page.getByText("Параметры теста", { exact: true }).click();
  await page.getByLabel("Цена разработчика, ₽").fill("0");
  await page.getByRole("button", { name: "Обновить сумму" }).click();
  const validation = page.getByRole("alert").filter({ hasText: "Укажите положительную сумму" });
  await validation.waitFor({ state: "visible" });
  assert.equal(
    await page.getByLabel("Цена разработчика, ₽").getAttribute("aria-describedby"),
    await validation.getAttribute("id"),
    "validation belongs to the amount field, independently of the Next.js route announcer",
  );
  assert.equal(await digits(), "13000", "invalid input keeps the previous quote");
  await page.getByLabel("Что оплачиваем").selectOption("project");
  await page.getByLabel("Цена разработчика, ₽").fill("25000");
  await page.getByRole("button", { name: "Обновить сумму" }).click();
  assert.equal(await digits(), "25000", "no markup on the initial project");
  await page.getByLabel("Что оплачиваем").selectOption("wish");
  await page.getByLabel("Цена разработчика, ₽").fill("10000,50");
  await page.getByRole("button", { name: "Обновить сумму" }).click();
  assert.equal(await digits(), "1300065");
  await waitStatus("idle");
  await page.getByText("Параметры теста", { exact: true }).click();
  await page.getByRole("button", { name: "Включить тёмную тему" }).click();
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `${width}px: payment overflow`);
  await page.screenshot({ path: resolve(screenshots, `${width}-payment-dark.png`), fullPage: true });
}
