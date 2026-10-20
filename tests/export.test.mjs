import assert from "node:assert/strict";
import { access, readFile, readdir, stat } from "node:fs/promises";
import { resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { parse } from "parse5";
import nextEnv from "@next/env";

const root = fileURLToPath(new URL("../", import.meta.url));
nextEnv.loadEnvConfig(root, false);
const output = resolve(root, process.env.SITE_OUTPUT_DIR || "dist");
const origin = new URL(process.env.SITE_ORIGIN || "https://node-studio.ru").origin;
const routes = ["/", "/projects/autoparts/", "/projects/anime-love/", "/projects/vectra/"];

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
        assert.ok(Number(attribute(node, "width")) > 0 && Number(attribute(node, "height")) > 0, "image has intrinsic dimensions");
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
  assert.equal(nodes.filter((node) => hasClass(node, "service-disclosure")).length, 8);
  assert.equal(nodes.filter((node) => hasClass(node, "project-card")).length, 3);
  assert.equal(nodes.filter((node) => hasClass(node, "faq-item")).length, 6);
});

test("case navigation cycles through the three projects", async () => {
  for (const [index, route] of routes.slice(1).entries()) {
    const { nodes } = await documentAt(route);
    const section = nodes.find((node) => attribute(node, "class") === "next-project container");
    const link = descendants(section).find((node) => node.tagName === "a");
    assert.equal(attribute(link, "href"), routes[1 + ((index + 1) % 3)]);
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

test("portal and checkout routes are exported and excluded from indexing", async () => {
  const sitemap = await readFile(resolve(output, "sitemap.xml"), "utf8");
  for (const route of ["/cabinet/", "/cabinet-demo/", "/checkout/", "/checkout-demo/"]) {
    const { nodes } = await documentAt(route);
    assert.equal(nodes.filter(node => node.tagName === "h1").length, 1);
    assert.equal(nodes.filter(node => node.tagName === "main").length, 1);
    assert.ok(nodes.some(node => node.tagName === "meta" && attribute(node, "name") === "robots" && attribute(node, "content").includes("noindex")));
    assert.ok(!sitemap.includes(`<loc>${origin}${route}</loc>`));
  }
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
