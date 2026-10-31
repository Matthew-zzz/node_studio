import assert from "node:assert/strict";
import { once } from "node:events";
import test from "node:test";
import { chromium } from "playwright";
import { createStaticServer } from "../scripts/lib/static-server.mjs";
import { projects } from "../src/features/projects/data/projects.ts";

test("page styles remain consistent after client navigation and menu/FAQ interactions", { timeout: 120000 }, async (t) => {
  let origin = process.env.PAGE_STYLES_ORIGIN;
  if (!origin) {
    const server = createStaticServer(new URL("../dist/", import.meta.url).pathname);
    server.listen(0, "127.0.0.1");
    await once(server, "listening");
    origin = `http://127.0.0.1:${server.address().port}`;
    t.after(() => { server.closeAllConnections(); server.close(); });
  }
  const browser = await chromium.launch({ headless: true, args: ["--no-sandbox"] });
  t.after(() => browser.close());
  const errors = [];
  const routes = ["/", ...projects.map(({ slug }) => `/projects/${slug}/`), "/services/", "/terms/"];
  const snapshot = (page) => page.evaluate(() => {
    const keys = ["display", "fontSize", "fontWeight", "lineHeight", "color", "backgroundColor", "paddingTop", "paddingBottom", "borderRadius", "gridTemplateColumns"];
    return [...document.querySelectorAll("body,.header,.desktop-nav,.menu-toggle,.footer,.footer-contacts,.contact-panel,main h1,main h2,main h3,main .button,.case-cover,.screen-frame,.landing-service-card")].map((element) => {
      const style = getComputedStyle(element);
      return Object.fromEntries(keys.map((key) => [key, style[key]]));
    });
  });
  const contactSnapshot = (page) => page.locator("#contact").evaluate((section) => {
    const keys = ["display", "width", "height", "fontSize", "fontWeight", "lineHeight", "letterSpacing", "color", "backgroundColor", "backgroundImage", "paddingTop", "paddingBottom", "paddingLeft", "paddingRight", "borderTopColor", "borderRadius", "gap"];
    return [section, ...section.querySelectorAll("*")].map((element) => {
      const style = getComputedStyle(element);
      return Object.fromEntries(keys.map((key) => [key, style[key]]));
    });
  });

  for (const width of [390, 820, 1440]) {
    const baseline = new Map();
    let sharedContact;
    for (const route of routes) {
      const page = await browser.newPage({ viewport: { width, height: 1000 }, reducedMotion: "reduce" });
      await page.goto(origin + route, { waitUntil: "networkidle" });
      await page.evaluate(() => document.fonts.ready);
      assert.equal(await page.locator("#contact").count(), 1);
      const contact = await contactSnapshot(page);
      if (route === "/") sharedContact = contact;
      else assert.deepEqual(contact, sharedContact, `${route}: contact matches the homepage at ${width}px`);
      baseline.set(route, await snapshot(page));
      await page.close();
    }
    const page = await browser.newPage({ viewport: { width, height: 1000 }, reducedMotion: "reduce" });
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(origin, { waitUntil: "networkidle" });
    await page.evaluate(() => { window.__sharedContact = document.getElementById("contact"); });
    for (const route of [...routes.slice(1), ...routes]) {
      const link = page.locator(`a[href="${route}"]`).first();
      await link.evaluate((element) => element.click());
      await page.waitForURL(origin + route);
      await page.waitForLoadState("networkidle");
      await page.evaluate(async () => {
        window.scrollTo({ top: 0, behavior: "instant" });
        await document.fonts.ready;
        await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      });
      assert.deepEqual(await snapshot(page), baseline.get(route), `${route}: loaded styles do not leak at ${width}px`);
      assert(await page.evaluate(() => window.__sharedContact === document.getElementById("contact")), "layout preserves the same contact component across navigation");
      assert.deepEqual(await contactSnapshot(page), sharedContact, `${route}: shared contact styles survive client navigation`);
    }
    await page.locator('a[href="/"]').first().evaluate((link) => link.click());
    await page.waitForURL(origin + "/");
    const faq = page.locator(".faq-item").first();
    await faq.locator("summary").click();
    assert.equal(await faq.getAttribute("open"), "");
    assert(await faq.locator(".faq-answer").isVisible());
    await faq.locator("summary").click();
    assert.equal(await faq.getAttribute("open"), null);
    if (width <= 900) {
      await page.getByRole("button", { name: "Открыть меню", exact: true }).click();
      assert(await page.locator("dialog[open]").isVisible());
      await page.keyboard.press("Escape");
      assert.equal(await page.locator("dialog[open]").count(), 0);
    }
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await page.close();
    console.log(`${width}px: direct/client styles, identical shared contact, layout persistence, FAQ and navigation checked`);
  }
  assert.deepEqual(errors, []);
});
