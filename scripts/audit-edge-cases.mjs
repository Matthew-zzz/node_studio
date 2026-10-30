import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium, webkit, devices } from "playwright";

const root = fileURLToPath(new URL("../", import.meta.url));
const output = resolve(root, process.env.AUDIT_OUTPUT_DIR || ".cache/performance-audit/2026-10-30");
const origin = process.env.AUDIT_ORIGIN || "https://node-studio.ru";
const results = [];
await mkdir(output, { recursive: true });
const save = () => writeFile(resolve(output, "edge-cases.json"), JSON.stringify(results, null, 2) + "\n");

for (const variant of ["default-dpr3", "video-blocked-dpr3", "default-dpr1", "art-hidden-dpr3"]) {
  const browser = await webkit.launch();
  const context = await browser.newContext({ ...devices["iPhone 13"], ...(variant.endsWith("dpr1") ? { deviceScaleFactor: 1 } : {}) });
  if (variant.startsWith("video-blocked")) await context.route("**/*.mp4", route => route.abort());
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  if (variant.startsWith("art-hidden")) await page.addInitScript(() => {
    new MutationObserver(() => {
      if (!document.head || document.getElementById("audit-style")) return;
      const style = document.createElement("style");
      style.id = "audit-style";
      style.textContent = ".landing-service-art { display:none !important; }";
      document.head.append(style);
    }).observe(document, { childList: true, subtree: true });
  });
  const start = Date.now();
  let result;
  try {
    await page.goto(origin, { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.waitForFunction(() => !!document.querySelector(".landing-service-card")?.style.height, null, { timeout: 20000 });
    await page.waitForTimeout(3500);
    const media = await page.locator("video").evaluateAll(videos => videos.map(video => ({ src: video.currentSrc, paused: video.paused, currentTime: video.currentTime, readyState: video.readyState, error: video.error?.message })));
    await page.getByRole("button", { name: "Открыть меню", exact: true }).tap();
    await page.waitForSelector("dialog[open]", { timeout: 5000 });
    await page.getByRole("button", { name: "Закрыть меню", exact: true }).last().tap();
    result = { variant, status: "passed", durationMs: Date.now() - start, media, errors };
  } catch (error) {
    result = { variant, status: "failed", durationMs: Date.now() - start, error: String(error), errors };
  }
  results.push(result);
  await save();
  console.log(JSON.stringify(result));
  await browser.close().catch(() => {});
}

for (let attempt = 1; attempt <= 2; attempt++) {
  const browser = await chromium.launch({ args: ["--no-sandbox", "--disable-dev-shm-usage"] });
  const context = await browser.newContext(devices["Pixel 7"]);
  const page = await context.newPage();
  const client = await context.newCDPSession(page);
  await client.send("Network.enable");
  await client.send("Network.setCacheDisabled", { cacheDisabled: true });
  await client.send("Emulation.setCPUThrottlingRate", { rate: 6 });
  await client.send("Network.emulateNetworkConditions", { offline: false, latency: 400, downloadThroughput: 400000 / 8, uploadThroughput: 100000 / 8 });
  await page.goto(`${origin}/projects/anime-love/`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(1000);
  const firstTapAt = await page.evaluate(() => performance.now());
  await page.getByRole("button", { name: "Открыть меню", exact: true }).tap();
  await page.waitForTimeout(1200);
  const firstTapOpened = await page.locator("dialog[open]").count() > 0;
  if (firstTapOpened) await page.getByRole("button", { name: "Закрыть меню", exact: true }).last().tap();
  await page.waitForLoadState("networkidle", { timeout: 60000 });
  await page.waitForTimeout(500);
  await page.getByRole("button", { name: "Открыть меню", exact: true }).tap();
  await page.waitForSelector("dialog[open]", { timeout: 5000 });
  results.push({ variant: "early-menu-3g-cpu6", attempt, firstTapAtMs: firstTapAt, firstTapOpened, afterLoadTapOpened: true, afterLoadAtMs: await page.evaluate(() => performance.now()) });
  await save();
  console.log(JSON.stringify(results.at(-1)));
  await browser.close();
}

console.log(`Edge-case results saved: ${output}`);
