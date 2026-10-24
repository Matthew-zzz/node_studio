import assert from "node:assert/strict";

export async function chooseAction(page, trigger, action, opensDialog = true) {
  await (typeof trigger === "string" ? page.getByRole("button", { name: trigger, exact: true }) : trigger).click();
  const menu = page.locator("dialog[open]").last();
  await menu.waitFor();
  const menuId = await menu.getAttribute("aria-labelledby");
  if (await menu.getByRole("heading", { name: action, exact: true, level: 2 }).count() === 0) {
    await menu.getByRole("button", { name: action, exact: true }).click();
    if (menuId) await page.locator(`dialog[aria-labelledby=${JSON.stringify(menuId)}]`).waitFor({ state: "hidden" });
  }
  if (opensDialog) {
    await page.waitForFunction(() => document.querySelectorAll("dialog[open]").length === 1);
    const dialog = page.locator("dialog[open]");
    assert.match(await dialog.evaluate(element => getComputedStyle(element, "::backdrop").backdropFilter), /blur\(/);
    assert.ok(await dialog.evaluate(element => element.scrollWidth <= element.clientWidth + 1), "modal content fits its own width");
    return dialog;
  }
}

export async function closeDialog(page) {
  const dialog = page.locator("dialog[open]").last();
  await page.keyboard.press("Escape");
  await dialog.waitFor({ state: "hidden" });
}

export async function openDescription(page, trigger) {
  await trigger.click();
  const dialog = page.locator("dialog[open]");
  await dialog.waitFor();
  assert.equal(await dialog.count(), 1);
  assert.match(await dialog.evaluate(element => getComputedStyle(element, "::backdrop").backdropFilter), /blur\(/);
  return dialog;
}

export async function checkProjectDescriptionFocus(page) {
  const workspace = page.getByRole("region", { name: "Рабочая область проекта", exact: true });
  const before = await workspace.boundingBox();
  const dialog = await chooseAction(page, "О проекте", "Открыть описание проекта");
  assert.ok((await dialog.innerText()).trim().length > 0);
  const viewport = await page.evaluate(() => ({ width: innerWidth, height: innerHeight }));
  const bounds = await dialog.boundingBox();
  assert.ok(bounds.x >= 0 && bounds.y >= 0 && bounds.x + bounds.width <= viewport.width + 1 && bounds.y + bounds.height <= viewport.height + 1, "focused description stays inside the screen");
  const after = await workspace.boundingBox();
  assert.ok(Math.abs(after.height - before.height) <= 1, "opening details never expands the workspace underneath");
  await page.keyboard.press("Tab");
  assert.ok(await dialog.evaluate(element => element.contains(document.activeElement)), "keyboard focus stays in the modal");
  await closeDialog(page);
  assert.ok(await page.getByRole("button", { name: "О проекте", exact: true }).evaluate(element => element === document.activeElement), "closing details restores the project action button");
}
