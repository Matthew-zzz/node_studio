import assert from "node:assert/strict";
import { once } from "node:events";
import test from "node:test";
import { chromium } from "playwright";
import { createStaticServer } from "../scripts/lib/static-server.mjs";

test("service cards keep staged scroll geometry, reverse correctly and adapt to layout changes", { timeout: 120000 }, async (t) => {
  let origin = process.env.SERVICE_CARDS_ORIGIN;
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
    const page = await browser.newPage({ viewport: { width, height: 1000 }, reducedMotion: "reduce" });
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(origin, { waitUntil: "networkidle" });
    await page.evaluate(() => document.fonts.ready);
    const cards = page.locator(".landing-service-card");
    const settle = () => page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    const scroll = async (y) => { await page.evaluate((y) => scrollTo({ top: y, behavior: "instant" }), y); await settle(); };
    const geometry = () => cards.evaluateAll((cards) => cards.map((card) => ({ height: card.getBoundingClientRect().height, bottom: card.getBoundingClientRect().bottom, phase: Number(card.dataset.phase), inert: card.querySelector(".landing-service-panel").inert, hidden: card.querySelector(".landing-service-panel").getAttribute("aria-hidden") })));
    const collapsed = 124;
    const expanded = width <= 760 ? 450 : 310;
    assert.equal((await geometry())[0].height, expanded, "first card starts open");
    const starts = [];

    for (let index = 1; index < await cards.count(); index++) {
      const anchor = cards.nth(Math.min(index + 1, 6));
      const start = await anchor.evaluate((element) => element.getBoundingClientRect().bottom + scrollY - innerHeight);
      starts[index] = start;
      await scroll(start - 2);
      assert.equal((await geometry())[index].height, collapsed, "wait for the next card to be fully visible");
      for (const [progress, phase] of [[0.15, 1], [0.5, 2], [0.85, 3], [1, 3]]) {
        await scroll(start + (expanded - collapsed) * progress);
        const state = await geometry();
        assert(Math.abs(state[index].height - (collapsed + (expanded - collapsed) * progress)) <= 1, `card ${index + 1} grows by the distance scrolled`);
        assert.equal(state[index].phase, phase, `card ${index + 1}: phase ${phase}`);
        assert.equal(state[index].inert, phase < 3, "closed actions stay outside keyboard navigation");
        assert.equal(state[index].hidden, String(phase < 2));
        assert(Math.abs(state[Math.min(index + 1, 6)].bottom - 1000) <= 1, "next card stays at the viewport bottom");
      }
    }
    for (let index = 6; index >= 1; index--) {
      await scroll(starts[index] + (expanded - collapsed) * 0.5);
      assert.equal((await geometry())[index].phase, 2, "reverse scrolling reverses stages");
      await scroll(starts[index] - 2);
      assert.equal((await geometry())[index].phase, 0);
    }

    // A scrollbar jump must settle all cards, even if no intermediate scroll event ran.
    await page.locator("#contact").evaluate((element) => element.scrollIntoView({ behavior: "instant" }));
    await settle();
    assert((await geometry()).every((card) => card.phase === 3));
    await scroll(0);
    assert((await geometry()).slice(1).every((card) => card.phase === 0));

    // Filtering projects changes the section's document position without a window resize.
    await page.getByRole("button", { name: "Скрипты", exact: true }).evaluate((button) => button.click());
    await settle();
    const shifted = await cards.nth(2).evaluate((element) => element.getBoundingClientRect().bottom + scrollY - innerHeight);
    await scroll(shifted + (expanded - collapsed) * 0.5);
    assert.equal((await geometry())[1].phase, 2, "project filter invalidates cached position");

    await page.setViewportSize({ width: width <= 760 ? 1440 : 390, height: 1000 });
    await settle();
    await scroll(0);
    assert.equal((await geometry())[0].height, width <= 760 ? 310 : 450, "first card adapts on rotation");
    assert((await geometry()).slice(1).every((card) => card.phase === 0));
    await settle();
    await page.evaluate(() => {
      window.__cardReads = 0;
      const original = window.getComputedStyle.bind(window);
      window.getComputedStyle = (element, ...args) => {
        if (element.classList.contains("landing-service-card")) window.__cardReads++;
        return original(element, ...args);
      };
    });
    for (let y = 0; y <= 700; y += 100) await scroll(y);
    assert.equal(await page.evaluate(() => window.__cardReads), 0, "offscreen scroll does not remeasure cards");
    await page.close();
    console.log(`${width}px: all seven cards, staged opening/closing, anchors, jump, filtering and resize passed`);
  }
  assert.deepEqual(errors, []);
});
