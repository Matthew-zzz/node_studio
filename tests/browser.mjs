import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { createStaticServer } from "../scripts/lib/static-server.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const screenshots = resolve(root, "test-results/screenshots");
await mkdir(screenshots, { recursive: true });
const server = createStaticServer(resolve(root, process.env.SITE_OUTPUT_DIR || "dist"));
const errors = [];
let browser;

try {
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const origin = `http://127.0.0.1:${server.address().port}`;
  browser = await chromium.launch({
    headless: true,
    ...(process.env.CHROMIUM_EXECUTABLE ? { executablePath: process.env.CHROMIUM_EXECUTABLE } : {}),
  });

  for (const width of [1440, 768, 390, 320]) {
    const context = await browser.newContext({ viewport: { width, height: 900 }, reducedMotion: "reduce" });
    const page = await context.newPage();
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
    page.on("requestfailed", (request) => {
      const failure = request.failure()?.errorText;
      if (failure !== "net::ERR_ABORTED") errors.push(`${request.url()}: ${failure}`);
    });
    for (const path of ["/", "/projects/autoparts/", "/projects/anime-love/", "/projects/vectra/"]) {
      const response = await page.goto(origin + path);
      assert.equal(response.status(), 200, path);
      await page.waitForFunction(() => document.querySelector(".brand-symbol[data-logo-visible]"));
      assert.equal(await page.locator("h1").count(), 1);
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), `${width}px ${path}: horizontal overflow`);
      await page.evaluate(async () => {
        for (let y = 0; y < document.body.scrollHeight; y += 800) {
          window.scrollTo(0, y);
          await new Promise((resolve) => setTimeout(resolve, 20));
        }
        await Promise.all([...document.images].filter((image) => image.getBoundingClientRect().width > 0).map((image) => image.decode()));
        window.scrollTo(0, 0);
      });
      await page.screenshot({ path: resolve(screenshots, `${width}-${path.split("/").filter(Boolean).join("-") || "home"}.png`), fullPage: true });
    }

    await page.goto(origin);
    const faq = page.locator(".faq-item").first();
    await faq.locator("summary").focus();
    await page.keyboard.press("Enter");
    assert.equal(await faq.getAttribute("open"), "");

    if (width <= 760) {
      const disclosures = page.locator(".service-disclosure");
      await disclosures.nth(0).locator("summary").click();
      await disclosures.nth(1).locator("summary").click();
      assert.equal(await page.locator(".service-disclosure[open]").count(), 1);
    }

    if (width <= 900) {
      const menuButton = page.getByRole("button", { name: "Открыть меню", exact: true });
      await menuButton.click();
      assert.equal(await menuButton.getAttribute("aria-expanded"), "true");
      assert.ok(await page.locator("#mobile-nav").evaluate((element) => element.open));
      await page.keyboard.press("Escape");
      await page.waitForFunction(() => !document.querySelector("#mobile-nav").open);
      assert.equal(await menuButton.getAttribute("aria-expanded"), "false");
      assert.ok(await menuButton.evaluate((element) => document.activeElement === element));
      await menuButton.click();
      await page.locator(".drawer-nav").getByRole("link", { name: "Проекты", exact: true }).click();
      await page.waitForFunction(() => !document.body.classList.contains("menu-open"));
      assert.equal(await page.locator("#mobile-nav").evaluate((element) => element.open), false);
    }

    await page.locator(".project-content").first().click();
    await page.waitForURL("**/projects/autoparts/");
    await page.locator(".next-project a").click();
    await page.waitForURL("**/projects/anime-love/");
    await page.locator(".back-link").click();
    await page.waitForURL("**/#projects");
    assert.equal(await page.locator("h1").count(), 1);
    assert.equal(await page.locator('.ability-art[data-playing="true"]').count(), 0, "reduced motion is respected after navigation");

    if (width === 1440) {
      await context.grantPermissions(["clipboard-read", "clipboard-write"]);
      await page.getByRole("button", { name: "Скопировать Telegram-аккаунт" }).click();
      await page.waitForFunction(() => document.querySelector(".toast").textContent.includes("скопирован"));
      assert.equal(await page.evaluate(() => navigator.clipboard.readText()), "@ma11hew_z");
    }
    await context.close();
  }

  const noJs = await browser.newContext({ javaScriptEnabled: false, viewport: { width: 390, height: 844 } });
  const fallbackPage = await noJs.newPage();
  await fallbackPage.goto(origin);
  assert.equal(await fallbackPage.locator("h1").count(), 1);
  await fallbackPage.locator(".service-disclosure summary").first().click();
  assert.equal(await fallbackPage.locator(".service-disclosure[open]").count(), 1);
  await noJs.close();
  assert.deepEqual(errors, [], "no console, network or hydration errors");
  console.log("Passed: 4 viewports, all pages, client navigation, mobile menu, keyboard, disclosures, clipboard, reduced motion and no-JS content.");
} finally {
  await browser?.close();
  await new Promise((resolve) => server.close(resolve));
}
