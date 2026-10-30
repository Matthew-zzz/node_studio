import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { once } from "node:events";
import { readFile } from "node:fs/promises";
import test from "node:test";
import sharp from "sharp";
import { chromium } from "playwright";
import { createStaticServer } from "../scripts/lib/static-server.mjs";
import { screenshots } from "../src/features/projects/data/screenshots.ts";

const root = new URL("../", import.meta.url);
const report = JSON.parse(await readFile(new URL("docs/asset-generation/project-screenshots.json", root), "utf8"));
const variants = new Map(report.images.flatMap((image) => image.variants.map((variant) => [variant.src, { ...variant, originalWidth: image.width }])));
const routes = ["anime-love", "autoparts", "vectra"];

test("all screenshot variants decode, preserve proportions and source masters", async () => {
  const registered = Object.values(screenshots).flatMap((image) => [image, image.mobile].filter(Boolean));
  assert.deepEqual(new Set(report.images.map((image) => image.source)), new Set(registered.map((image) => image.src)));
  for (const image of report.images) {
    const original = await readFile(new URL(`public${image.source}`, root));
    assert.equal(createHash("sha256").update(original).digest("hex"), image.sha256, `master preserved: ${image.source}`);
    for (const variant of image.variants) {
      const file = await readFile(new URL(`public${variant.src}`, root));
      const metadata = await sharp(file).metadata();
      assert.equal(metadata.format, "webp");
      assert.equal(metadata.width, variant.width);
      assert.equal(metadata.height, variant.height);
      assert(variant.width <= image.width, "never upscale the original");
      assert(Math.abs(variant.height - image.height * variant.width / image.width) <= 1, "preserve aspect ratio");
      await sharp(file).raw().toBuffer();
    }
    assert(image.variants.at(-1).bytes < image.bytes, `full-size WebP is smaller: ${image.source}`);
  }
});

test("project images and carousel work at mobile, tablet and desktop sizes", { timeout: 180000 }, async (t) => {
  let origin = process.env.PROJECT_IMAGES_ORIGIN;
  if (!origin) {
    const server = createStaticServer(new URL("dist/", root).pathname);
    server.listen(0, "127.0.0.1");
    await once(server, "listening");
    origin = `http://127.0.0.1:${server.address().port}`;
    t.after(() => { server.closeAllConnections(); server.close(); });
  }
  const browser = await chromium.launch({ headless: true, args: ["--no-sandbox"] });
  t.after(() => browser.close());
  const errors = [];
  const profiles = [[320, 1], [390, 3], [760, 2], [768, 2], [1024, 2], [1440, 1], [1920, 2]];

  for (const [width, deviceScaleFactor] of profiles) {
    const page = await browser.newPage({ viewport: { width, height: 1000 }, deviceScaleFactor, isMobile: width <= 760, hasTouch: width <= 760, reducedMotion: "reduce" });
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("response", (response) => { if (response.status() >= 400) errors.push(`${response.status()}: ${response.url()}`); });
    for (const slug of routes) {
      const requested = [];
      const onRequest = (request) => { if (request.resourceType() === "image") requested.push(new URL(request.url()).pathname); };
      page.on("request", onRequest);
      await page.goto(`${origin}/projects/${slug}/`, { waitUntil: "networkidle" });
      await page.evaluate(() => document.fonts.ready);
      const images = page.locator(".case-page .responsive-picture img");
      if (slug === "anime-love") {
        const carousel = page.getByRole("region", { name: "Экраны приложения AnimeLove" });
        await carousel.scrollIntoViewIfNeeded();
        await carousel.focus();
        await page.keyboard.press("ArrowRight");
        await page.waitForFunction(() => document.querySelector('[aria-label="Выбрать экран"] button:nth-child(2)')?.getAttribute("aria-current") === "true");
        for (let index = 0; index < 4; index++) {
          await page.locator('[aria-label="Выбрать экран"] button').nth(index).click();
          const active = page.locator('[aria-roledescription="слайд"][data-active="true"] img');
          await active.evaluate((img) => img.decode());
        }
      }
      for (const image of await images.all()) {
        if (!await image.isVisible()) continue;
        await image.scrollIntoViewIfNeeded();
        await image.evaluate((img) => img.decode());
        const info = await image.evaluate((img) => ({ src: new URL(img.currentSrc).pathname, width: img.offsetWidth, height: img.offsetHeight, cropped: getComputedStyle(img).objectFit === "cover" }));
        const selected = variants.get(info.src);
        assert(selected, `WebP selected at ${width}px: ${info.src}`);
        const needed = Math.min(info.width * deviceScaleFactor, selected.originalWidth);
        assert(selected.width >= needed * 0.88, `sufficient resolution at ${width}px: ${info.src}`);
        assert(selected.width <= Math.max(320, needed * 1.6), `avoid oversized downloads at ${width}px: ${info.src}`);
        if (slug !== "vectra" && !info.cropped) assert(Math.abs(info.height - info.width * selected.height / selected.width) <= 2, `unchanged proportions: ${info.src}`);
      }
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${slug}: no overflow at ${width}px`);
      assert(!requested.some((src) => report.images.some((image) => image.source === src)), `${slug}: no PNG/JPEG fallback downloaded by WebP browsers`);
      page.off("request", onRequest);
      console.log(`${slug}: ${width}px / DPR ${deviceScaleFactor} — images decoded, resolution and layout checked`);
    }
    await page.close();
  }

  for (const width of [390, 1440]) {
    const mobile = width === 390;
    const page = await browser.newPage({ viewport: { width, height: 1000 }, isMobile: mobile, hasTouch: mobile });
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(`${origin}/projects/anime-love/`, { waitUntil: "networkidle" });
    const carousel = page.getByRole("region", { name: "Экраны приложения AnimeLove" });
    await carousel.scrollIntoViewIfNeeded();
    const box = await carousel.boundingBox();
    const x = box.x + box.width * 0.7;
    const y = box.y + box.height / 2;
    if (mobile) {
      const client = await page.context().newCDPSession(page);
      await client.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y }] });
      for (let step = 1; step <= 5; step++) await client.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: x - step * 16, y }] });
      await client.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    } else {
      await page.mouse.move(x, y);
      await page.mouse.down();
      await page.mouse.move(x - 80, y, { steps: 5 });
      await page.mouse.up();
    }
    await page.waitForFunction(() => document.querySelector('[aria-label="Выбрать экран"] button:nth-child(2)')?.getAttribute("aria-current") === "true");
    await page.getByRole("button", { name: "Следующий экран" }).click();
    await page.waitForFunction(() => document.querySelector('[aria-label="Выбрать экран"] button:nth-child(3)')?.getAttribute("aria-current") === "true");
    await page.getByRole("button", { name: "Предыдущий экран" }).click();
    await page.locator('[aria-roledescription="слайд"][data-active="true"] img').evaluate((img) => img.decode());
    if (mobile) {
      for (const newWidth of [1024, 390]) {
        await page.setViewportSize({ width: newWidth, height: 1000 });
        const cover = page.locator(".case-cover img").first();
        await cover.scrollIntoViewIfNeeded();
        await cover.evaluate((img) => img.decode());
        const src = await cover.evaluate((img) => new URL(img.currentSrc).pathname);
        assert(src.includes(newWidth <= 760 ? "/mobile-anime-catalog-" : "/prepared-anime-catalog-"), "art direction adapts after resizing");
      }
    }
    await page.close();
    console.log(`${width}px: normal animation, ${mobile ? "touch swipe and rotation" : "mouse drag"}, previous/next controls checked`);
  }

  // With scripts disabled, exercise the native PNG/JPEG fallback without hydration.
  for (const width of [390, 1440]) {
    const page = await browser.newPage({ viewport: { width, height: 1000 }, javaScriptEnabled: false });
    for (const slug of routes) {
      await page.goto(`${origin}/projects/${slug}/`, { waitUntil: "networkidle" });
      await page.locator(".case-page picture").evaluateAll((pictures) => {
        for (const picture of pictures) {
          picture.querySelectorAll('source[type="image/webp"]').forEach((source) => source.remove());
          picture.querySelector("img").loading = "eager";
        }
      });
      for (const image of await page.locator(".case-page .responsive-picture img").all()) {
        await image.evaluate((img) => img.decode());
        const fallback = await image.evaluate((img) => ({ actual: new URL(img.currentSrc).pathname, expected: [...img.parentElement.querySelectorAll("source")].find((source) => !source.media || matchMedia(source.media).matches)?.srcset || img.getAttribute("src") }));
        assert.equal(fallback.actual, fallback.expected, `native fallback and mobile art direction: ${slug}`);
      }
    }
    await page.close();
  }
  assert.deepEqual(errors, [], "no browser errors or failed requests");
});
