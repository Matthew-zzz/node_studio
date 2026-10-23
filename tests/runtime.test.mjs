import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, mkdir, readFile, writeFile, stat, symlink, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable, Writable } from "node:stream";
import { finished } from "node:stream/promises";
import { PortalStore } from "../server/store.ts";
import { PortalService } from "../server/service.ts";
import { readConfig } from "../server/config.ts";
import { initializeRuntime } from "../server/runtime.ts";
import { createStaticHandler } from "../server/static.ts";
import { createApplicationHandler } from "../server/application.ts";
import { createIntegrations } from "../server/integrations.ts";

async function request(handler, url, method = "GET", headers = {}) {
  const req = Readable.from([]);
  req.url = url; req.method = method; req.headers = headers; req.socket = { remoteAddress: "127.0.0.1" };
  const chunks = [];
  const res = new Writable({ write(chunk, _encoding, done) { chunks.push(Buffer.from(chunk)); done(); } });
  res.headers = {}; res.headersSent = false; res.statusCode = 200;
  res.setHeader = (key, value) => { res.headers[key.toLowerCase()] = value; };
  res.writeHead = (status, headers = {}) => { res.statusCode = status; Object.entries(headers).forEach(([key, value]) => res.setHeader(key, value)); res.headersSent = true; return res; };
  await handler(req, res); await finished(res);
  return { status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks).toString() };
}

test("persistent volume keeps secrets, passwords, conversations and sessions across application updates", async () => {
  const directory = await mkdtemp(join(tmpdir(), "nodo-runtime-")); let store;
  try {
    const environment = { PORTAL_STATE_DIR: directory, PORTAL_DATABASE: join(directory, "portal.sqlite"), PORTAL_BOOTSTRAP_EMPLOYEES: "true" };
    let config = readConfig(environment); store = new PortalStore(config.database);
    initializeRuntime(store, config);
    const access = JSON.parse(await readFile(join(directory, "initial-access.json"), "utf8"));
    assert.equal(access.length, 2); assert.equal((await stat(join(directory, "initial-access.json"))).mode & 0o777, 0o600);
    assert.equal((await stat(join(directory, "runtime-secrets.json"))).mode & 0o777, 0o600);
    const developer = access.find(user => user.role === "developer");
    const login = store.login(developer.email, developer.password, "test");
    store.changePassword(login.session, developer.password, "Updated-runtime-password-2026");
    store.put("messages", { id: "persistent", threadId: "test", author: "Клиент", role: "client", text: "Сохранённая переписка", createdAt: new Date().toISOString() });
    const encryptionKey = config.encryptionKey; store.close(); store = undefined;
    config = readConfig(environment); store = new PortalStore(config.database); initializeRuntime(store, config);
    assert.equal(config.encryptionKey, encryptionKey);
    assert.equal(store.session(login.token).viewer.mustChangePassword, false);
    assert.equal(store.get("messages", "persistent").text, "Сохранённая переписка");
    assert.equal(store.login(developer.email, "Updated-runtime-password-2026", "test").session.viewer.role, "developer");
    assert.equal(store.db.prepare("SELECT count(*) AS total FROM users").get().total, 2);
  } finally { store?.close(); await rm(directory, { recursive: true, force: true }); }
});

test("frontend server supports Next.js routes, HEAD, immutable resources, ETags and byte ranges", async () => {
  const directory = await mkdtemp(join(tmpdir(), "nodo-static-"));
  try {
    await mkdir(join(directory, "cabinet")); await mkdir(join(directory, "_next/static"), { recursive: true });
    for (const [name, value] of [["index.html", "<h1>Studio</h1>"], ["404.html", "Not found page"], ["cabinet/index.html", "<h1>Cabinet</h1>"], ["_next/static/app.js", "console.log('app')"], ["clip.mp4", "0123456789"]]) await writeFile(join(directory, name), value);
    const handler = createStaticHandler(directory);
    const home = await request(handler, "/"); assert.equal(home.status, 200); assert.equal(home.headers["content-type"], "text/html; charset=utf-8");
    assert.equal((await request(handler, "/cabinet/?view=one")).body, "<h1>Cabinet</h1>");
    assert.equal((await request(handler, "/cabinet?view=one")).headers.location, "/cabinet/?view=one");
    assert.equal((await request(handler, "/%2fcabinet")).headers.location, "/cabinet/");
    assert.equal((await request(handler, "/", "HEAD")).body, "");
    assert.equal((await request(handler, "/", "GET", { "if-none-match": home.headers.etag })).status, 304);
    assert.ok((await request(handler, "/_next/static/app.js")).headers["cache-control"].includes("immutable"));
    const range = await request(handler, "/clip.mp4", "GET", { range: "bytes=3-6" }); assert.equal(range.status, 206); assert.equal(range.body, "3456");
    assert.equal((await request(handler, "/clip.mp4", "GET", { range: "bytes=-3" })).body, "789");
    assert.equal((await request(handler, "/clip.mp4", "GET", { range: "bytes=100-" })).status, 416);
    assert.equal((await request(handler, "/missing")).status, 404);
    assert.equal((await request(handler, "/", "POST")).status, 405);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test("frontend cannot expose dotfiles, traversal or symlinks to server data", async () => {
  const directory = await mkdtemp(join(tmpdir(), "nodo-static-scope-"));
  try {
    const root = join(directory, "public"); await mkdir(root);
    await writeFile(join(root, "404.html"), "Missing"); await writeFile(join(directory, "private.txt"), "Private server data");
    await writeFile(join(root, ".env"), "Private setting"); await symlink(join(directory, "private.txt"), join(root, "link.txt"));
    const handler = createStaticHandler(root);
    for (const path of ["/.env", "/%2e%2e%2fprivate.txt", "/server/main.ts", "/link.txt"]) {
      const result = await request(handler, path); assert.ok([403, 404].includes(result.status)); assert.ok(!result.body.includes("Private"));
    }
    assert.equal((await request(handler, "/invalid%ZZ")).status, 400);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test("one application handler serves both frontend and API on the same listener", async () => {
  const directory = await mkdtemp(join(tmpdir(), "nodo-application-")); const store = new PortalStore(":memory:");
  try {
    await writeFile(join(directory, "index.html"), "Frontend application"); await writeFile(join(directory, "404.html"), "Missing");
    const config = readConfig({ PORTAL_STATIC_DIR: directory, SOURCE_REVISION: "test-revision" });
    const handler = createApplicationHandler(new PortalService(store, createIntegrations(config), config), config);
    assert.equal((await request(handler, "/")).body, "Frontend application");
    const health = await request(handler, "/api/portal/health"); assert.equal(JSON.parse(health.body).revision, "test-revision");
    assert.equal(JSON.parse((await request(handler, "/api/portal/snapshot")).body).viewer, null);
    assert.equal((await request(handler, "/api/portal/private")).headers["content-type"], "application/json; charset=utf-8");
  } finally { store.close(); await rm(directory, { recursive: true, force: true }); }
});
