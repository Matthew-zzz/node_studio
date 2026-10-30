import assert from "node:assert/strict";
import { once } from "node:events";
import test from "node:test";
import { chromium } from "playwright";
import { createStaticServer } from "../scripts/lib/static-server.mjs";

const sections = { "#projects": "Проекты", "#services": "Услуги", "#contact": "Контакты" };
const selectors = { "#projects": "#projects .section-head", "#services": "#services .section-head", "#contact": "#contact .contact-panel" };

test("section links land below the header despite changing card heights", { timeout: 120000 }, async (t) => {
  let origin = process.env.SECTION_NAVIGATION_ORIGIN;
  if (!origin) {
    const server = createStaticServer(new URL("../dist/", import.meta.url).pathname);
    server.listen(0, "127.0.0.1");
    await once(server, "listening");
    origin = `http://127.0.0.1:${server.address().port}`;
    t.after(() => { server.closeAllConnections(); server.close(); });
  }
  const browser = await chromium.launch({ args: ["--no-sandbox"] });
  t.after(() => browser.close());
  const errors = [];
  for (const width of [390, 820, 1440]) {
    const page = await browser.newPage({ viewport: { width, height: 1000 }, isMobile: width === 390, hasTouch: width === 390 });
    page.on("pageerror", error => errors.push(error.message));
    const open = async (hash) => {
      if (width <= 900) {
        await page.getByRole("button", { name: "Открыть меню", exact: true }).click();
        await page.getByRole("navigation", { name: "Мобильная навигация" }).getByRole("link", { name: sections[hash] }).click();
      } else await page.getByRole("navigation", { name: "Главная навигация" }).getByRole("link", { name: sections[hash] }).click();
    };
    const aligned = async (hash) => {
      await page.waitForFunction(({ hash, selector }) => {
        const target = document.querySelector(selector);
        const header = document.querySelector(".header");
        return location.hash === hash && target && Math.abs(target.getBoundingClientRect().top - header.getBoundingClientRect().bottom - 20) < 2;
      }, { hash, selector: selectors[hash] }, { timeout: 7000 });
      await page.waitForTimeout(200);
      const gap = await page.locator(selectors[hash]).evaluate(element => element.getBoundingClientRect().top - document.querySelector(".header").getBoundingClientRect().bottom);
      assert(Math.abs(gap - 20) < 2, `${width}px ${hash}: stable visible content below header, gap ${gap}`);
      assert.equal(await page.locator("dialog[open]").count(), 0, "mobile menu closed");
      assert.equal(await page.locator("body.menu-open").count(), 0, "page unlocked");
    };

    await page.goto(origin, { waitUntil: "networkidle" });
    await page.evaluate(() => document.fonts.ready);
    for (const hash of ["#contact", "#services", "#projects", "#contact"]) { await open(hash); await aligned(hash); }
    await page.evaluate(() => scrollTo({ top: 0, behavior: "instant" }));
    await page.waitForTimeout(150);
    await open("#contact");
    await aligned("#contact");

    // Deep links and navigation from a case page resolve the same destination.
    await page.goto("about:blank");
    await page.goto(`${origin}/#contact`, { waitUntil: "networkidle" });
    await aligned("#contact");
    await page.goto(`${origin}/projects/anime-love/`, { waitUntil: "networkidle" });
    await open("#services");
    await aligned("#services");

    await page.emulateMedia({ reducedMotion: "reduce" });
    await open("#contact");
    await aligned("#contact");
    await page.emulateMedia({ reducedMotion: "no-preference" });
    if (width === 1440) {
      await open("#projects");
      await page.waitForTimeout(120);
      await open("#services");
      await aligned("#services");
      await page.getByRole("navigation", { name: "Главная навигация" }).getByRole("link", { name: "Контакты" }).focus();
      await page.keyboard.press("Enter");
      await aligned("#contact");
      await page.goBack();
      await aligned("#services");

      await open("#projects");
      await aligned("#projects");
      await open("#contact");
      await page.waitForTimeout(100);
      await page.mouse.wheel(0, 160);
      await page.waitForTimeout(150);
      const y = await page.evaluate(() => scrollY);
      await page.waitForTimeout(1300);
      assert(Math.abs(await page.evaluate(() => scrollY) - y) < 2, "user wheel cancels navigation without snapping back");
    }
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), "no horizontal overflow");
    await page.close();
    console.log(`${width}px: forward/reverse navigation, repeated hash, deep link, cross-page and reduced motion passed`);
  }
  assert.deepEqual(errors, []);
});
