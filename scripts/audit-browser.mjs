import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium, webkit, devices } from "playwright";

const root = fileURLToPath(new URL("../", import.meta.url));
const origin = process.env.AUDIT_ORIGIN || "https://node-studio.ru";
const output = resolve(root, process.env.AUDIT_OUTPUT_DIR || ".cache/performance-audit/2026-10-30");
const vitals = await readFile(resolve(root, ".cache/performance-tools/node_modules/web-vitals/dist/web-vitals.attribution.iife.js"), "utf8");
const routes = ["/", "/projects/anime-love/", "/projects/autoparts/", "/projects/vectra/", "/services/", "/terms/"];
const profiles = [
  { name: "desktop-chromium", engine: chromium, viewport: { width: 1440, height: 1000 }, cpu: 1 },
  { name: "android-chromium", engine: chromium, device: devices["Pixel 7"], cpu: 1 },
  { name: "android-slow4g-cpu6", engine: chromium, device: devices["Pixel 7"], cpu: 6, latency: 150, downloadKbps: 1600, uploadKbps: 750 },
  { name: "android-3g-cpu6", engine: chromium, device: devices["Pixel 7"], cpu: 6, latency: 400, downloadKbps: 400, uploadKbps: 100, routes: routes.slice(0, 2) },
  { name: "iphone-webkit", engine: webkit, device: devices["iPhone 13"], cpu: null },
];
const summary = {
  origin,
  revision: execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim(),
  vitalsVersion: "6.2.3",
  scope: "Synthetic browser sessions; no physical devices or real-user percentile data. INP is measured from scripted trusted clicks/taps. CPU/network throttling applies only to Chromium profiles with explicit settings.",
  runs: [],
};
await mkdir(output, { recursive: true });

// Linux WebKit needs an explicit selection so it can be run in a memory-limited scope.
const selected = process.env.AUDIT_PROFILES?.split(",");
for (const profile of profiles.filter(profile => selected ? selected.includes(profile.name) : profile.engine === chromium)) {
  const browser = await profile.engine.launch(profile.engine === chromium ? { args: ["--no-sandbox", "--disable-dev-shm-usage"] } : {});
  try {
    for (const route of process.env.AUDIT_ROUTES?.split(",") || profile.routes || routes) {
      const context = await browser.newContext({ ...profile.device, ...(profile.viewport ? { viewport: profile.viewport } : {}), reducedMotion: "no-preference" });
      const page = await context.newPage();
      page.setDefaultTimeout(30000);
      const errors = [];
      const failedRequests = [];
      const steps = [];
      page.on("pageerror", (error) => errors.push(error.message));
      page.on("response", (response) => { if (response.status() >= 400) failedRequests.push({ status: response.status(), url: response.url() }); });
      await page.addInitScript({ content: `${vitals}\n;(() => {
        window.__audit = { metrics: {}, longTasks: [], shifts: [], supported: PerformanceObserver.supportedEntryTypes || [] };
        const record = metric => {
          const a = metric.attribution || {};
          window.__audit.metrics[metric.name] = { value: metric.value, rating: metric.rating, navigationType: metric.navigationType,
            target: a.target || a.interactionTarget || a.largestShiftTarget, url: a.url,
            inputDelay: a.inputDelay, processingDuration: a.processingDuration, presentationDelay: a.presentationDelay,
            timeToFirstByte: a.timeToFirstByte, resourceLoadDelay: a.resourceLoadDelay, resourceLoadDuration: a.resourceLoadDuration, elementRenderDelay: a.elementRenderDelay };
        };
        for (const key of ['onFCP','onLCP','onINP','onCLS','onTTFB']) webVitals[key](record, {reportAllChanges: true});
        if (window.__audit.supported.includes('longtask')) new PerformanceObserver(list => { for (const e of list.getEntries()) window.__audit.longTasks.push({start: e.startTime, duration: e.duration}); }).observe({type: 'longtask', buffered: true});
        if (window.__audit.supported.includes('layout-shift')) new PerformanceObserver(list => { for (const e of list.getEntries()) if (!e.hadRecentInput) window.__audit.shifts.push({time: e.startTime, value: e.value, targets: (e.sources || []).map(s => s.node?.className || s.node?.tagName)}); }).observe({type: 'layout-shift', buffered: true});
      })();` });
      if (profile.engine === chromium) {
        const client = await context.newCDPSession(page);
        await client.send("Network.enable");
        await client.send("Network.setCacheDisabled", { cacheDisabled: true });
        await client.send("Emulation.setCPUThrottlingRate", { rate: profile.cpu });
        if (profile.latency) await client.send("Network.emulateNetworkConditions", { offline: false, latency: profile.latency, downloadThroughput: profile.downloadKbps * 1000 / 8, uploadThroughput: profile.uploadKbps * 1000 / 8 });
      }
      const started = Date.now();
      let run;
      let initial;
      try {
        await page.goto(origin + route, { waitUntil: "domcontentloaded", timeout: 90000 });
        await page.evaluate(() => document.fonts.ready);
        if (route === "/") await page.waitForFunction(() => Boolean(document.querySelector(".landing-service-card")?.style.height), null, { timeout: 60000 });
        await page.waitForTimeout(1000);
        initial = await page.evaluate(() => ({
          metrics: window.__audit.metrics,
          navigation: performance.getEntriesByType("navigation")[0]?.toJSON(),
          video: [...document.querySelectorAll("video")].map(v => ({ src: v.currentSrc, paused: v.paused, poster: v.poster, error: v.error?.message, readyState: v.readyState })),
          codecs: document.createElement("video").canPlayType('video/mp4; codecs="avc1.42E01E"'),
        }));
        const click = (locator) => profile.device?.isMobile ? locator.tap() : locator.click();
        if (profile.device?.isMobile) {
          await click(page.getByRole("button", { name: "Открыть меню", exact: true }));
          await page.waitForSelector("dialog[open]");
          await click(page.getByRole("button", { name: "Закрыть меню", exact: true }).last());
          await page.waitForSelector("dialog[open]", { state: "hidden" });
          steps.push("mobile menu opens and closes");
        }
        if (route === "/") {
          assert(await page.locator("#projects article").count() > 0, "portfolio is available without filtering");
          const frames = await page.evaluate(async () => {
            const list = document.querySelector(".landing-service-list");
            const top = list.getBoundingClientRect().top + scrollY;
            const from = top - innerHeight / 2;
            const to = top + (innerWidth <= 760 ? 3500 : 2400);
            const gaps = [];
            let last;
            for (let i = 0; i <= 140; i++) {
              scrollTo({ top: from + (to - from) * i / 140, behavior: "instant" });
              const now = await new Promise(resolve => requestAnimationFrame(resolve));
              if (last) gaps.push(now - last);
              last = now;
            }
            return gaps;
          });
          const sorted = frames.toSorted((a, b) => a - b);
          steps.push({ scrollFrames: frames.length, frameMedianMs: sorted[Math.floor(sorted.length / 2)], frameP95Ms: sorted[Math.floor(sorted.length * 0.95)], framesOver50Ms: frames.filter(gap => gap > 50).length });
          await page.locator("#contact").evaluate(e => e.scrollIntoView({ behavior: "instant" }));
          await page.waitForTimeout(300);
          assert(await page.locator("video").evaluateAll(videos => videos.every(v => v.paused)));
          steps.push("offscreen videos paused");
          const faq = page.locator(".faq-item").first();
          await click(faq.locator("summary"));
          assert.equal(await faq.getAttribute("open"), "");
          await click(faq.locator("summary"));
          steps.push("FAQ opens and closes");
        }
        if (route === "/projects/anime-love/") {
          // Scroll into and out of the 3D scene twice. A fast initial page load
          // does not catch expensive compositing when the gallery enters view.
          const frames = await page.evaluate(async () => {
            const carousel = document.querySelector('[aria-label="Экраны приложения AnimeLove"]');
            const top = carousel.getBoundingClientRect().top + scrollY;
            const gaps = [];
            let started;
            let last;
            await new Promise(resolve => {
              const frame = time => {
                started ??= time;
                if (last !== undefined) gaps.push(time - last);
                last = time;
                const elapsed = time - started;
                const progress = (elapsed % 3200) / 3200;
                const fraction = progress < 0.5 ? progress * 2 : (1 - progress) * 2;
                scrollTo({ top: top - innerHeight - 200 + fraction * (innerHeight + 700), behavior: "instant" });
                if (elapsed < 6400) requestAnimationFrame(frame);
                else resolve();
              };
              requestAnimationFrame(frame);
            });
            return gaps;
          });
          const sorted = frames.toSorted((a, b) => a - b);
          steps.push({ carouselScrollFrames: frames.length, frameMedianMs: sorted[Math.floor(sorted.length / 2)], frameP95Ms: sorted[Math.floor(sorted.length * 0.95)], framesOver34Ms: frames.filter(gap => gap > 34).length, framesOver50Ms: frames.filter(gap => gap > 50).length });
          for (let i = 0; i < 4; i++) {
            await click(page.locator('[aria-label="Выбрать экран"] button').nth(i));
            const img = page.locator('[aria-roledescription="слайд"][data-active="true"] img');
            await img.evaluate(img => img.decode());
          }
          steps.push("all carousel slides display and decode");
        }
        if (route.startsWith("/projects/")) {
          for (const image of await page.locator(".case-page .responsive-picture img").all()) {
            if (!await image.isVisible()) continue;
            await image.scrollIntoViewIfNeeded();
            await image.evaluate(img => img.decode());
          }
          steps.push("visible project screenshots decode");
        }
        if (route === "/services/") {
          assert.equal(await page.locator("main h1").count(), 1);
          await page.locator("main").evaluate(e => scrollTo({ top: e.scrollHeight, behavior: "instant" }));
          steps.push("service descriptions and prices accessible");
        }
        if (route === "/terms/") {
          await page.locator(".terms-page section").last().scrollIntoViewIfNeeded();
          assert(await page.locator(".terms-page").isVisible());
          steps.push("offer available through the end of the document");
        }
        assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), "no horizontal overflow");
        await page.waitForTimeout(600);
        // Flush visit metrics as when leaving a tab. Nothing is sent to a server.
        await page.evaluate(() => {
          Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "hidden" });
          Object.defineProperty(document, "hidden", { configurable: true, get: () => true });
          document.dispatchEvent(new Event("visibilitychange"));
        });
        await page.waitForTimeout(100);
        const data = await page.evaluate(() => ({
          ...window.__audit,
          resourceBytes: performance.getEntriesByType("resource").reduce((sum, r) => sum + r.transferSize, 0),
          imageErrors: [...document.images].filter(img => img.complete && img.naturalWidth === 0).map(img => img.currentSrc || img.src),
        }));
        assert.equal(data.imageErrors.length, 0, "no broken images");
        assert.equal(errors.length, 0, "no browser exceptions");
        assert.equal(failedRequests.length, 0, "no failed HTTP responses");
        run = { profile: profile.name, route, status: "passed", durationMs: Date.now() - started, initial, ...data, steps, errors, failedRequests };
      } catch (error) {
        const partial = await page.evaluate(() => window.__audit).catch(() => null);
        run = { profile: profile.name, route, finalUrl: page.url(), status: "failed", error: String(error), durationMs: Date.now() - started, initial, partial, steps, errors, failedRequests };
        await page.screenshot({ path: resolve(output, `${profile.name}-${route.replaceAll("/", "_") || "home"}-failure.png`) }).catch(() => {});
      }
      run.environment = { browser: browser.version(), physicalDevice: false, cpuSlowdownMultiplier: profile.cpu, latencyMs: profile.latency ?? null, downloadKbps: profile.downloadKbps ?? null, uploadKbps: profile.uploadKbps ?? null };
      summary.runs.push(run);
      await writeFile(resolve(output, "browser-summary.json"), JSON.stringify(summary, null, 2) + "\n");
      console.log(`${profile.name} ${route}: ${run.status}; LCP ${run.metrics?.LCP?.value?.toFixed(0) ?? "unsupported"}ms, INP ${run.metrics?.INP?.value?.toFixed(0) ?? "unsupported"}ms, CLS ${run.metrics?.CLS?.value?.toFixed(3) ?? "unsupported"}${run.error ? `; ${run.error}` : ""}`);
      await context.close();
    }
  } finally { await browser.close(); }
}
if (summary.runs.some(run => run.status === "failed")) process.exitCode = 1;
