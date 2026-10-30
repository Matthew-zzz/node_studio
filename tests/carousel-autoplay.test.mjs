import assert from "node:assert/strict";
import { once } from "node:events";
import test from "node:test";
import { chromium } from "playwright";
import { createStaticServer } from "../scripts/lib/static-server.mjs";

const index = (page) => page.locator('[aria-label="Выбрать экран"] button').evaluateAll((buttons) => buttons.findIndex((button) => button.getAttribute("aria-current") === "true"));

test("carousel autoplay pauses offscreen, in hidden tabs and during interaction", { timeout: 90000 }, async (t) => {
  let origin = process.env.CAROUSEL_TEST_ORIGIN;
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

  for (const width of [390, 1440]) {
    const page = await browser.newPage({ viewport: { width, height: 900 }, isMobile: width === 390, hasTouch: width === 390 });
    page.on("pageerror", (error) => errors.push(error.message));
    await page.clock.install({ time: new Date("2026-10-30T12:00:00Z") });
    await page.goto(`${origin}/projects/anime-love/`, { waitUntil: "networkidle" });
    await page.clock.pauseAt(new Date("2026-10-30T12:01:00Z"));
    const carousel = page.getByRole("region", { name: "Экраны приложения AnimeLove" });
    const advance = async (milliseconds) => { await page.clock.runFor(milliseconds); };
    const settleVisibility = async () => {
      // IntersectionObserver follows real layout frames, not the virtual timer clock.
      await page.evaluate(() => new Promise((resolve) => {
        const observer = new IntersectionObserver(() => { observer.disconnect(); resolve(); });
        observer.observe(document.querySelector('[aria-label="Экраны приложения AnimeLove"]'));
      }));
      await advance(100);
    };
    const show = async () => {
      await carousel.evaluate((element) => element.scrollIntoView({ block: "center", behavior: "instant" }));
      await settleVisibility();
    };
    const hide = async () => {
      await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
      await settleVisibility();
    };
    const clearFocus = () => page.evaluate(() => { if (document.activeElement instanceof HTMLElement) document.activeElement.blur(); });

    await advance(20000);
    assert.equal(await index(page), 0, "initially offscreen: no autoplay");
    await show();
    await advance(6300);
    assert.equal(await index(page), 1, "visible carousel advances");

    await hide();
    await advance(20000);
    assert.equal(await index(page), 1, "offscreen carousel keeps its slide");
    await show();
    assert.equal(await index(page), 1, "no immediate jump after returning");
    await advance(5900);
    assert.equal(await index(page), 1, "fresh interval after returning");
    await advance(400);
    assert.equal(await index(page), 2, "resumes from the current slide");

    await page.evaluate(() => {
      Object.defineProperty(document, "hidden", { configurable: true, get: () => true });
      document.dispatchEvent(new Event("visibilitychange"));
    });
    await advance(20000);
    assert.equal(await index(page), 2, "hidden tab: no autoplay");
    await hide();
    await page.evaluate(() => { delete document.hidden; document.dispatchEvent(new Event("visibilitychange")); });
    await advance(10000);
    assert.equal(await index(page), 2, "visible tab but offscreen: stays paused");
    await show();
    await advance(6300);
    assert.equal(await index(page), 3, "visible tab and carousel: resumes");

    await carousel.focus();
    await settleVisibility();
    if (width === 1440) {
      const box = await carousel.boundingBox();
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await settleVisibility();
      await page.mouse.move(1, 1);
      await settleVisibility();
    }
    await advance(15000);
    assert.equal(await index(page), 3, "keyboard focus keeps autoplay paused after mouse leaves");
    await page.keyboard.press("ArrowRight");
    assert.equal(await index(page), 0, "manual keyboard navigation remains available");
    await clearFocus();
    await settleVisibility();
    await advance(6300);
    assert.equal(await index(page), 1, "autoplay resumes after focus leaves");

    if (width === 1440) {
      const box = await carousel.boundingBox();
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await settleVisibility();
      await carousel.focus();
      await settleVisibility();
      await clearFocus();
      await settleVisibility();
      await advance(10000);
      assert.equal(await index(page), 1, "hover keeps autoplay paused after focus leaves");
      await page.mouse.move(1, 1);
      await settleVisibility();
    }

    await page.emulateMedia({ reducedMotion: "reduce" });
    await settleVisibility();
    await advance(15000);
    assert.equal(await index(page), 1, "reduced motion pauses autoplay immediately");
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await settleVisibility();
    for (let cycle = 0; cycle < 3; cycle++) { await hide(); await show(); }
    await advance(6300);
    assert.equal(await index(page), 2, "rapid visibility changes do not create duplicate timers");
    await page.goto(`${origin}/`, { waitUntil: "networkidle" });
    await advance(20000);
    await page.close();
    console.log(`${width}px: offscreen, hidden tab, resume, interaction, reduced motion and cleanup checked`);
  }
  assert.deepEqual(errors, [], "no browser errors");
});
