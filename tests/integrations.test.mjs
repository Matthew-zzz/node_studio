import assert from "node:assert/strict";
import test from "node:test";
import { readConfig } from "../server/config.ts";
import { createIntegrations, issueToWork } from "../server/integrations.ts";

const config = () => readConfig({ PORTAL_GITHUB_TOKEN: "fixture-key", PORTAL_OPENAI_KEY: "fixture-key", PORTAL_OPENAI_MODEL: "fixture-model", PORTAL_RESEND_KEY: "fixture-key", PORTAL_MAIL_FROM: "studio@example.test", PORTAL_ENCRYPTION_KEY: "cd".repeat(32) });
const reply = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });
const issue = (number, labels = []) => ({ number, title: `Issue ${number}`, body: "Description", state: "open", state_reason: null, labels, updated_at: "2026-10-20T12:00:00Z" });

test("GitHub adapter paginates Issues, omits PRs and handles empty commit histories", async () => {
  const first = Array.from({ length: 100 }, (_, i) => issue(i + 1)); first[0].pull_request = {};
  const adapter = createIntegrations(config(), async url => url.includes("/commits") ? reply({ message: "empty" }, 409) : reply(url.includes("page=2") ? [issue(101)] : first));
  assert.equal((await adapter.issues("Matthew-zzz/project")).length, 100);
  assert.deepEqual(await adapter.commits("Matthew-zzz/project", 1), []);
  await assert.rejects(adapter.issues("other/secret"), { status: 400 });
  assert.equal(issueToWork({ ...issue(1, [{ name: "nodo:stage" }]), state: "closed", state_reason: "not_planned" }).status, "canceled");
});

test("GitHub mutations preserve markers and other labels and retry Issue creation safely", async () => {
  let written; let posts = 0;
  const existing = { ...issue(2, [{ name: "nodo:wish" }, { name: "custom" }, { name: "nodo:in-progress" }]), body: "Text\n\n<!-- nodo:draft:123 -->" };
  const adapter = createIntegrations(config(), async (url, init) => {
    if (init.method === "POST") posts++;
    if (init.method === "PATCH") { written = JSON.parse(init.body); return reply({ ...existing, ...written }); }
    return reply(url.includes("issues?") ? [existing] : existing);
  });
  assert.equal((await adapter.createIssue("Matthew-zzz/project", "Retry", "Text", "wish", "draft:123")).number, 2);
  assert.equal(posts, 0);
  await adapter.updateIssue("Matthew-zzz/project", 2, { status: "new", body: "Updated text" });
  assert.deepEqual(written.labels, ["nodo:wish", "custom"]);
  assert.equal(written.state, "open"); assert.equal(written.state_reason, undefined);
  assert.ok(written.body.includes("<!-- nodo:draft:123 -->"));
});

test("repository adapter creates a private empty repo and reuses it on retries with its labels", async () => {
  let exists = false; let posts = 0; const labels = [];
  const adapter = createIntegrations(config(), async (url, init) => {
    const path = new URL(url).pathname;
    if (path === "/user") return reply({ login: "Matthew-zzz" });
    if (path === "/user/repos" && init.method === "POST") {
      assert.deepEqual(JSON.parse(init.body), { name: "node-project", private: true, auto_init: false, has_issues: true });
      exists = true; posts++; return reply({ full_name: "Matthew-zzz/node-project", private: true }, 201);
    }
    if (path === "/repos/Matthew-zzz/node-project") return reply(exists ? { private: true } : { message: "Not found" }, exists ? 200 : 404);
    if (path.endsWith("/labels")) {
      if (init.method === "POST") { labels.push(JSON.parse(init.body)); return reply(labels.at(-1), 201); }
      return reply(labels);
    }
    throw new Error(`Unexpected GitHub operation: ${path}`);
  });
  assert.equal(await adapter.createRepository("node-project"), "Matthew-zzz/node-project");
  const count = labels.length; assert.ok(count > 0);
  assert.equal(await adapter.createRepository("node-project"), "Matthew-zzz/node-project");
  assert.equal(posts, 1); assert.equal(labels.length, count);
  const publicRepo = createIntegrations(config(), async url => reply(url.endsWith("/user") ? { login: "Matthew-zzz" } : { private: false }));
  await assert.rejects(publicRepo.createRepository("node-project"), { status: 409 });
  const otherOwner = createIntegrations(config(), async () => reply({ login: "someone-else" }));
  await assert.rejects(otherOwner.createRepository("node-project"), { status: 503 });
});

test("named repository creation marks ownership and never writes into an unrelated existing GitHub repository", async () => {
  let description; let exists = false; let creates = 0; const mutations = [];
  const adapter = createIntegrations(config(), async (url, init) => {
    const path = new URL(url).pathname;
    if (path === "/user") return reply({ login: "Matthew-zzz" });
    if (path === "/user/repos") { const body = JSON.parse(init.body); description = body.description; exists = true; creates++; assert.equal(body.name, "AnimeLove"); return reply({ full_name: "Matthew-zzz/AnimeLove" }, 201); }
    if (path === "/repos/Matthew-zzz/AnimeLove") return reply(exists ? { private: true, description } : {}, exists ? 200 : 404);
    if (path.endsWith("/labels")) { if (init.method === "POST") mutations.push(init.body); return reply([]); }
    throw new Error("Unexpected GitHub call");
  });
  assert.equal(await adapter.createRepository("AnimeLove", "project:original"), "Matthew-zzz/AnimeLove");
  assert.equal(description, "Node Studio · project:original");
  assert.equal(await adapter.createRepository("AnimeLove", "project:original"), "Matthew-zzz/AnimeLove"); assert.equal(creates, 1);
  const before = mutations.length;
  await assert.rejects(adapter.createRepository("AnimeLove", "project:another"), { status: 409 }); assert.equal(mutations.length, before);
  description = null;
  await assert.rejects(adapter.createRepository("AnimeLove", "project:original"), { status: 409 }); assert.equal(mutations.length, before);
});

test("assistant request contains only supplied messages, configured model, and a structured reply schema", async () => {
  let payload;
  const adapter = createIntegrations(config(), async (url, init) => {
    assert.equal(url, "https://api.openai.com/v1/responses"); payload = JSON.parse(init.body);
    return reply({ output: [{ type: "message", content: [{ type: "output_text", text: JSON.stringify({ reply: "Уточните детали", title: "", body: "", handoff: false }) }] }] });
  });
  const result = await adapter.assistant([{ id: "m", threadId: "one", author: "Client", role: "client", text: "Пожелание", createdAt: "2026-10-20T12:00:00Z" }], "project");
  assert.equal(result.reply, "Уточните детали");
  assert.equal(payload.model, "fixture-model"); assert.equal(payload.store, false); assert.equal(payload.tools, undefined);
  assert.deepEqual(payload.input, [{ role: "user", content: "Client: Пожелание" }]);
  assert.equal(payload.text.format.type, "json_schema"); assert.equal(payload.text.format.strict, true);
});

test("email adapter provides idempotency and missing integration settings fail explicitly", async () => {
  let headers; let body;
  const adapter = createIntegrations(config(), async (url, init) => { assert.equal(url, "https://api.resend.com/emails"); headers = init.headers; body = JSON.parse(init.body); return reply({ id: "email-1" }); });
  await adapter.mail("client@example.test", "Access message", "delivery-1");
  assert.equal(headers["Idempotency-Key"], "delivery-1"); assert.deepEqual(body.to, ["client@example.test"]);
  const unconfigured = createIntegrations(readConfig({}), async () => { throw new Error("Should not call upstream"); });
  assert.equal(unconfigured.ready.payments, "disabled");
  await assert.rejects(unconfigured.assistant([], "project"), { status: 503 });
  await assert.rejects(unconfigured.mail("client@example.test", "text", "id"), { status: 503 });
  await assert.rejects(unconfigured.issues("Matthew-zzz/project"), { status: 503 });
});
