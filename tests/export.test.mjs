import assert from "node:assert/strict";
import { access, readFile, readdir, stat } from "node:fs/promises";
import { resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { gunzipSync } from "node:zlib";
import { parse } from "parse5";
import nextEnv from "@next/env";
import { projects } from "../src/features/projects/data/projects.ts";

const root = fileURLToPath(new URL("../", import.meta.url));
nextEnv.loadEnvConfig(root, false);
const output = resolve(root, process.env.SITE_OUTPUT_DIR || "dist");
const origin = new URL(process.env.SITE_ORIGIN || "https://node-studio.ru").origin;
const projectRoutes = projects.map(({ slug }) => `/projects/${slug}/`);
const routes = ["/", ...projectRoutes, "/services/", "/terms/"];

function descendants(node) {
  return [node, ...(node.childNodes ?? []).flatMap(descendants)];
}

function attribute(node, name) {
  return node.attrs?.find((item) => item.name === name)?.value;
}

async function documentAt(route) {
  const html = await readFile(resolve(output, `.${route}index.html`), "utf8");
  return { html, nodes: descendants(parse(html)) };
}

for (const route of routes) {
  test(`${route}: semantic content, metadata, ARIA and local resources`, async () => {
    const { html, nodes } = await documentAt(route);
    assert.equal(nodes.filter((node) => node.tagName === "h1").length, 1, "one page heading");
    assert.equal(nodes.filter((node) => node.tagName === "main").length, 1, "one main landmark");
    assert.equal(attribute(nodes.find((node) => node.tagName === "html"), "lang"), "ru");
    assert.ok(nodes.some((node) => node.tagName === "meta" && attribute(node, "name") === "description" && attribute(node, "content")));
    assert.ok(nodes.some((node) => node.tagName === "link" && attribute(node, "rel") === "canonical" && attribute(node, "href") === origin + route));
    assert.ok(!/armtek|stparts|армтек|стпартс/i.test(html), "supplier anonymization is retained");

    const ids = nodes.map((node) => attribute(node, "id")).filter(Boolean);
    assert.equal(ids.length, new Set(ids).size, "unique DOM IDs");
    for (const node of nodes) {
      for (const name of ["aria-controls", "aria-labelledby", "aria-describedby"]) {
        for (const target of attribute(node, name)?.split(/\s+/) ?? []) assert.ok(ids.includes(target), `${name} points to ${target}`);
      }
      if (node.tagName === "img") {
        assert.notEqual(attribute(node, "alt"), undefined, "image has alt text");
        const hasDimensions = Number(attribute(node, "width")) > 0 && Number(attribute(node, "height")) > 0;
        const usesFill = attribute(node, "data-nimg") === "fill" && (attribute(node, "style") ?? "").includes("position:absolute") && Boolean(attribute(node, "sizes") || node.parentNode?.childNodes.some((child) => child.tagName === "source" && attribute(child, "sizes")));
        assert.ok(hasDimensions || usesFill, "image has intrinsic dimensions or uses responsive Next.js fill");
      }
      if (["path", "rect", "circle", "ellipse"].includes(node.tagName)) {
        assert.ok(!node.childNodes.some((child) => child.tagName), "SVG shapes are siblings, not nested elements");
      }
      if (attribute(node, "target") === "_blank") {
        const rel = attribute(node, "rel")?.split(/\s+/) ?? [];
        assert.ok(rel.includes("noopener") && rel.includes("noreferrer"), "safe external link");
      }
      const references = [attribute(node, "src"), attribute(node, "href"), ...(attribute(node, "srcset")?.split(",").map((item) => item.trim().split(/\s+/)[0]) ?? [])].filter(Boolean);
      for (const reference of references) {
        if (!reference.startsWith("/") && !reference.startsWith("#")) continue;
        const url = new URL(reference, origin + route);
        let target = resolve(output, `.${decodeURIComponent(url.pathname)}`);
        assert.ok(target.startsWith(output + sep) || target === output, `resource stays in output: ${reference}`);
        if ((await stat(target)).isDirectory()) target = resolve(target, "index.html");
        await access(target);
        if (url.hash) {
          const destination = descendants(parse(await readFile(target, "utf8")));
          assert.ok(destination.some((item) => attribute(item, "id") === decodeURIComponent(url.hash.slice(1))), `anchor exists: ${reference}`);
        }
      }
    }
  });
}

test("homepage retains all service disclosures, cases and FAQ entries", async () => {
  const { nodes } = await documentAt("/");
  const hasClass = (node, className) => attribute(node, "class")?.split(/\s+/).includes(className);
  assert.equal(nodes.filter((node) => hasClass(node, "landing-service-card")).length, 7);
  const projectsSection = nodes.find((node) => attribute(node, "id") === "projects");
  const projectLinks = descendants(projectsSection).filter((node) => node.tagName === "a").map((node) => attribute(node, "href"));
  for (const route of projectRoutes) assert.ok(projectLinks.includes(route), `homepage links to ${route}`);
  const cards = descendants(projectsSection).filter((node) => node.tagName === "article");
  assert.equal(cards.length, projectRoutes.length, "each portfolio project has a page");
  for (const card of cards) {
    assert(descendants(card).some((node) => node.tagName === "a" && projectRoutes.includes(attribute(node, "href"))), "each card opens its case page");
  }
  assert.equal(nodes.filter((node) => hasClass(node, "faq-item")).length, 6);
});

test("case navigation cycles through all published projects", async () => {
  for (const [index, route] of projectRoutes.entries()) {
    const { nodes } = await documentAt(route);
    const section = nodes.find((node) => attribute(node, "class") === "next-project container");
    const link = descendants(section).find((node) => node.tagName === "a");
    assert.equal(attribute(link, "href"), projectRoutes[(index + 1) % projectRoutes.length]);
  }
});

test("sitemap, robots and custom 404 are exported", async () => {
  const sitemap = await readFile(resolve(output, "sitemap.xml"), "utf8");
  for (const route of routes) assert.ok(sitemap.includes(`<loc>${origin}${route}</loc>`));
  const robots = await readFile(resolve(output, "robots.txt"), "utf8");
  assert.ok(robots.includes(`Sitemap: ${origin}/sitemap.xml`));
  const notFound = await readFile(resolve(output, "404.html"), "utf8");
  assert.ok(notFound.includes("Кажется, здесь"));
  assert.ok(notFound.includes('name="robots" content="noindex"'));
});

test("exported assets match the source files byte for byte", async () => {
  async function verify(directory, relative = "") {
    for (const item of await readdir(directory, { withFileTypes: true })) {
      const path = `${relative}/${item.name}`;
      if (item.isDirectory()) await verify(resolve(directory, item.name), path);
      else assert.deepEqual(await readFile(resolve(output, `assets${path}`)), await readFile(resolve(directory, item.name)), path);
    }
  }
  await verify(resolve(root, "public/assets"));
});

test("existing hosting configuration still consumes dist/", async () => {
  const hosting = JSON.parse(await readFile(resolve(root, ".openai/hosting.json"), "utf8"));
  assert.ok(hosting.project_id);
  assert.equal(hosting.static.directory, "dist");
});

test("all build-time Gzip files decode to their retained originals", async () => {
  let count = 0;
  async function verify(directory) {
    for (const item of await readdir(directory, { withFileTypes: true })) {
      const path = resolve(directory, item.name);
      if (item.isDirectory()) await verify(path);
      else if (item.name.endsWith(".gz")) {
        const [compressed, original] = await Promise.all([readFile(path), readFile(path.slice(0, -3))]);
        assert(compressed.length < original.length, `compression reduces ${path}`);
        assert.deepEqual(gunzipSync(compressed), original, `lossless Gzip: ${path}`);
        count++;
      }
    }
  }
  await verify(output);
  assert(count > 0, "the build generates precompressed text assets");
});
