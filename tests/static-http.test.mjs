import assert from "node:assert/strict";
import { once } from "node:events";
import { request } from "node:http";
import { access, mkdir, mkdtemp, readFile, rm, symlink, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { gunzipSync } from "node:zlib";
import test from "node:test";
import { precompress } from "../scripts/lib/precompress.mjs";
import { createStaticServer } from "../scripts/lib/static-server.mjs";

test("static HTTP server negotiates Gzip and reliably falls back to originals", async (t) => {
  const folder = await mkdtemp(join(tmpdir(), "node-studio-static-"));
  const directory = join(folder, "site");
  await mkdir(join(directory, "_next/static"), { recursive: true });
  const contents = {
    "index.html": `<html><body>${"<p>Node Studio — проверка сайта</p>".repeat(100)}</body></html>`,
    "404.html": `<html><body>${"Not found. ".repeat(200)}</body></html>`,
    "_next/static/app.js": "const example = 'Node Studio';\n".repeat(200),
    "styles.css": ".example { color: blue; background: white; }\n".repeat(200),
    "data.json": JSON.stringify({ text: "Node Studio".repeat(200) }),
    "small.txt": "Small file",
    "video.mp4": Buffer.alloc(4096, 12),
    "picture.webp": Buffer.alloc(4096, 34),
    "font.woff2": Buffer.alloc(4096, 56),
  };
  for (const [path, data] of Object.entries(contents)) await writeFile(join(directory, path), data);
  await writeFile(join(directory, "small.txt.gz"), "obsolete sidecar");
  const stats = await precompress(directory);
  assert.equal(stats.files, 5);
  for (const path of ["small.txt", "video.mp4", "picture.webp", "font.woff2"]) {
    await assert.rejects(access(join(directory, `${path}.gz`)));
  }
  const server = createStaticServer(directory);
  t.after(async () => {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
    await rm(folder, { recursive: true, force: true });
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  function get(path, headers = {}, method = "GET") {
    return new Promise((resolve, reject) => {
      const req = request({ hostname: "127.0.0.1", port: server.address().port, path, method, headers }, (res) => {
        const chunks = [];
        res.on("data", (chunk) => chunks.push(chunk));
        res.on("end", () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks) }));
        res.on("error", reject);
      });
      req.on("error", reject);
      req.end();
    });
  }

  await t.test("Gzip bytes, MIME types, cache headers and lossless decoding", async () => {
    for (const [path, type] of [["/", "text/html"], ["/_next/static/app.js", "text/javascript"], ["/styles.css", "text/css"], ["/data.json", "application/json"]]) {
      const response = await get(path, { "Accept-Encoding": "gzip, deflate, br" });
      const source = path === "/" ? "index.html" : path.slice(1);
      assert.equal(response.status, 200);
      assert.equal(response.headers["content-encoding"], "gzip");
      assert(response.headers["content-type"].startsWith(type));
      assert.equal(response.headers.vary, "Accept-Encoding");
      assert.equal(Number(response.headers["content-length"]), response.body.length);
      assert.deepEqual(gunzipSync(response.body), Buffer.from(contents[source]));
      assert.deepEqual(response.body, await readFile(join(directory, `${source}.gz`)));
    }
    const js = await get("/_next/static/app.js", { "Accept-Encoding": "gzip" });
    assert.equal(js.headers["cache-control"], "public, max-age=31536000, immutable");
  });

  await t.test("encoding negotiation, exclusions, quality values and ordinary clients", async () => {
    for (const [encoding, compressed] of [[undefined, false], ["", false], ["identity", false], ["br", false], ["gzip", true], ["GZip; Q=1.0", true], ["*", true], ["gzip;q=0, *;q=1", false], ["gzip;q=0.2, identity;q=0.8", false], ["gzip;q=0.8, identity;q=0.2", true], ["gzip;q=invalid", false]]) {
      const response = await get("/styles.css", encoding === undefined ? {} : { "Accept-Encoding": encoding });
      assert.equal(response.status, 200, encoding);
      assert.equal(response.headers["content-encoding"], compressed ? "gzip" : undefined, encoding);
      assert.equal(response.headers.vary, "Accept-Encoding");
      assert.deepEqual(compressed ? gunzipSync(response.body) : response.body, Buffer.from(contents["styles.css"]));
    }
    assert.equal((await get("/", { "Accept-Encoding": "gzip;q=0, identity;q=0" })).status, 406);
    assert.equal((await get("/", { "Accept-Encoding": "gzip, identity;q=0" })).headers["content-encoding"], "gzip");
  });

  await t.test("HEAD, distinct validators, 304 responses and encoding changes", async () => {
    const gzip = await get("/", { "Accept-Encoding": "gzip" });
    const plain = await get("/", { "Accept-Encoding": "identity" });
    assert.notEqual(gzip.headers.etag, plain.headers.etag);
    const head = await get("/", { "Accept-Encoding": "gzip" }, "HEAD");
    assert.equal(head.body.length, 0);
    for (const header of ["content-encoding", "content-type", "content-length", "etag", "last-modified", "vary"]) assert.equal(head.headers[header], gzip.headers[header]);
    for (const [encoding, etag] of [["gzip", gzip.headers.etag], ["identity", plain.headers.etag]]) {
      const cached = await get("/", { "Accept-Encoding": encoding, "If-None-Match": `"other", ${etag}` });
      assert.equal(cached.status, 304);
      assert.equal(cached.body.length, 0);
      assert.equal(cached.headers.vary, "Accept-Encoding");
      assert.equal(cached.headers.etag, etag);
    }
    assert.equal((await get("/", { "Accept-Encoding": "identity", "If-None-Match": gzip.headers.etag })).status, 200);
    assert.equal((await get("/", { "Accept-Encoding": "gzip", "If-None-Match": "*" })).status, 304);
  });

  await t.test("missing, stale, invalid and outside-root sidecars fall back", async () => {
    const path = join(directory, "styles.css.gz");
    const original = await readFile(path);
    async function verify() {
      const response = await get("/styles.css", { "Accept-Encoding": "gzip" });
      assert.equal(response.status, 200);
      assert.equal(response.headers["content-encoding"], undefined);
      assert.equal(response.headers.vary, "Accept-Encoding");
      assert.deepEqual(response.body, Buffer.from(contents["styles.css"]));
    }
    await rm(path);
    await verify();
    await writeFile(path, original);
    await utimes(path, new Date(0), new Date(0));
    await verify();
    await rm(path);
    await mkdir(path);
    await verify();
    await rm(path, { recursive: true });
    const outside = join(folder, "outside.gz");
    await writeFile(outside, original);
    await symlink(outside, path);
    await verify();
    await rm(path);
    await writeFile(path, original);
  });

  await t.test("media stays unchanged and byte ranges remain usable", async () => {
    for (const path of ["video.mp4", "picture.webp", "font.woff2", "small.txt"]) {
      const response = await get(`/${path}`, { "Accept-Encoding": "gzip" });
      assert.equal(response.headers["content-encoding"], undefined);
      assert.deepEqual(response.body, Buffer.from(contents[path]));
    }
    for (const path of ["video.mp4", "_next/static/app.js"]) {
      const response = await get(`/${path}`, { "Accept-Encoding": "gzip", Range: "bytes=10-29" });
      assert.equal(response.status, 206);
      assert.equal(response.headers["content-encoding"], undefined);
      assert.deepEqual(response.body, Buffer.from(contents[path]).subarray(10, 30));
      assert.equal(Number(response.headers["content-length"]), 20);
      assert.equal(response.headers["content-range"], `bytes 10-29/${Buffer.byteLength(contents[path])}`);
    }
    const invalid = await get("/video.mp4", { "Accept-Encoding": "gzip", Range: "bytes=999999-" });
    assert.equal(invalid.status, 416);
    assert.equal(invalid.headers["content-range"], "bytes */4096");
  });

  await t.test("404s, redirects, invalid requests and absent originals remain correct", async () => {
    const missing = await get("/missing", { "Accept-Encoding": "gzip" });
    assert.equal(missing.status, 404);
    assert.equal(gunzipSync(missing.body).toString(), contents["404.html"]);
    assert.equal((await get("/%2ehidden", { "Accept-Encoding": "gzip" })).status, 404);
    assert.equal((await get("/%ZZ")).status, 400);
    assert.equal((await get("/", {}, "POST")).status, 405);
    const redirect = await get("/_next/static?x=1", { "Accept-Encoding": "gzip" });
    assert.equal(redirect.status, 308);
    assert.equal(redirect.headers.location, "/_next/static/?x=1");
    await rm(join(directory, "_next/static/app.js"));
    assert.equal((await get("/_next/static/app.js", { "Accept-Encoding": "gzip" })).status, 404);
  });
});
