import assert from "node:assert/strict";

export async function checkMotionPreferences(browser, origin) {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    reducedMotion: "no-preference",
  });
  const errors = [];
  const page = await context.newPage();
  page.on("pageerror", (error) => errors.push(error.message));

  try {
    await page.goto(origin);
    const selector = '[data-marquee="stack"]';
    const marquee = page.locator(selector);
    await marquee.scrollIntoViewIfNeeded();
    await page.waitForFunction((selector) => document.querySelector(selector)?.dataset.playing === "true", selector);
    const playingHeight = (await marquee.boundingBox()).height;

    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForFunction((selector) => document.querySelector(selector)?.dataset.playing === "false", selector);
    assert.equal(await marquee.getAttribute("data-static"), "false", "offscreen playback pauses without switching presentation");
    const pausedHeight = (await marquee.boundingBox()).height;
    assert.ok(Math.abs(playingHeight - pausedHeight) < 1, "pausing the marquee preserves its height");
    await page.waitForFunction((selector) => {
      const animations = document.querySelector(selector).getAnimations({ subtree: true });
      return animations.length > 0 && animations.every((animation) => animation.playState === "paused");
    }, selector);

    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.waitForFunction((selector) => document.querySelector(selector)?.dataset.static === "true", selector);
    await marquee.scrollIntoViewIfNeeded();
    assert.equal(await marquee.getAttribute("data-playing"), "false");
    assert.equal(await marquee.locator('ul[aria-hidden="true"]').isVisible(), false, "the duplicate group stays hidden in the static layout");
    assert.ok((await marquee.boundingBox()).height > playingHeight, "reduced motion exposes the complete wrapped list");
    assert.ok(await marquee.evaluate((element) => element.getAnimations({ subtree: true }).every((animation) => animation.playState !== "running")), "reduced motion stops marquee animation");

    await page.emulateMedia({ reducedMotion: "no-preference" });
    await marquee.scrollIntoViewIfNeeded();
    await page.waitForFunction((selector) => document.querySelector(selector)?.dataset.playing === "true", selector);
    assert.equal(await marquee.getAttribute("data-static"), "false");
    assert.ok(Math.abs((await marquee.boundingBox()).height - playingHeight) < 1, "restoring motion restores the single row");
    assert.deepEqual(errors, [], "changing motion preferences produces no runtime errors");
  } finally {
    await context.close();
  }
}
