import { execFileSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { chromium } from "playwright";

const root = fileURLToPath(new URL("../", import.meta.url));
const tools = createRequire(resolve(root, ".cache/performance-tools/package.json"));
const { default: lighthouse, desktopConfig } = await import(pathToFileURL(tools.resolve("lighthouse")));
const { launch } = await import(pathToFileURL(tools.resolve("chrome-launcher")));
const origin = process.env.AUDIT_ORIGIN || "https://node-studio.ru";
const output = resolve(root, process.env.AUDIT_OUTPUT_DIR || ".cache/performance-audit/2026-10-30");
const routes = ["/", "/projects/anime-love/", "/projects/autoparts/", "/projects/vectra/", "/services/", "/terms/"];
const revision = execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim();
const summary = { origin, revision, runner: "Lighthouse 13.6.0; Chromium from Playwright; sequential cold navigations", runs: [] };
await mkdir(output, { recursive: true });

for (const profile of ["mobile", "desktop"]) {
  for (const route of routes) {
    const repeats = route === "/" ? 3 : 1;
    for (let iteration = 1; iteration <= repeats; iteration++) {
      const name = `${profile}-${route === "/" ? "home" : route.split("/").filter(Boolean).join("-")}-${iteration}`;
      const jsonPath = resolve(output, `${name}.json`);
      let lhr;
      if (process.env.AUDIT_RESUME === "1") {
        try { lhr = JSON.parse(await readFile(jsonPath, "utf8")); } catch { /* Run missing results. */ }
      }
      if (!lhr) {
        const browser = await launch({ chromePath: chromium.executablePath(), chromeFlags: ["--headless", "--no-sandbox", "--disable-dev-shm-usage"] });
        try {
          const result = await lighthouse(new URL(route, origin).href, {
            port: browser.port,
            output: ["json", "html"],
            onlyCategories: ["performance"],
            logLevel: "error",
          }, profile === "desktop" ? desktopConfig : undefined);
          if (!result || result.lhr.runtimeError) throw new Error(JSON.stringify(result?.lhr.runtimeError || "Lighthouse did not return a report"));
          lhr = result.lhr;
          await writeFile(jsonPath, JSON.stringify(lhr));
          await writeFile(resolve(output, `${name}.html`), result.report[1]);
        } finally {
          await browser.kill();
        }
      }
      const metric = (key) => lhr.audits[key]?.numericValue ?? null;
      const run = {
        profile, route, iteration, fetchedAt: lhr.fetchTime,
        score: Math.round(lhr.categories.performance.score * 100),
        fcpMs: metric("first-contentful-paint"), lcpMs: metric("largest-contentful-paint"),
        speedIndexMs: metric("speed-index"), tbtMs: metric("total-blocking-time"), cls: metric("cumulative-layout-shift"),
        settings: lhr.configSettings, warnings: lhr.runWarnings,
        findings: Object.values(lhr.audits).filter((audit) => audit.score !== null && audit.score < 1 && !["first-contentful-paint", "largest-contentful-paint", "speed-index", "total-blocking-time", "cumulative-layout-shift"].includes(audit.id)).map((audit) => ({ id: audit.id, title: audit.title, score: audit.score, displayValue: audit.displayValue, metricSavings: audit.metricSavings })),
        report: `${name}.html`,
      };
      summary.runs.push(run);
      await writeFile(resolve(output, "lighthouse-summary.json"), JSON.stringify(summary, null, 2) + "\n");
      console.log(`${name}: score ${run.score}, FCP ${(run.fcpMs / 1000).toFixed(2)}s, LCP ${(run.lcpMs / 1000).toFixed(2)}s, TBT ${Math.round(run.tbtMs)}ms, CLS ${run.cls.toFixed(3)}`);
    }
  }
}
