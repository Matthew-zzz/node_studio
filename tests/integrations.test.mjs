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
  await assert.rejects(unconfigured.assistant([], "project"), { status: 503 });
  await assert.rejects(unconfigured.mail("client@example.test", "text", "id"), { status: 503 });
  await assert.rejects(unconfigured.issues("Matthew-zzz/project"), { status: 503 });
});
