import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { backup } from "node:sqlite";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PortalStore } from "../server/store.ts";
import { PortalService } from "../server/service.ts";
import { createIntegrations } from "../server/integrations.ts";
import { readConfig } from "../server/config.ts";
import { briefChunks } from "../server/client-briefs.ts";
import { briefText } from "../src/features/portal/model/client-brief.ts";
import { portalFixture, fixturePassword } from "./helpers/portal-fixture.mjs";
import { portalApi } from "./helpers/http.mjs";

function thread(f, suffix = "one") {
  const id = `telegram:${suffix}`;
  f.store.put("conversations", { id, kind: "telegram", projectId: "", name: suffix, username: suffix, email: "", telegramId: suffix, ownerId: null, ownerName: null, handoffRequested: false, updatedAt: new Date().toISOString() });
  message(f, id, "Самое раннее требование клиента", "client"); return id;
}
function message(f, threadId, text, role = "client") { f.store.put("messages", { id: randomUUID(), threadId, author: role, role, text, createdAt: new Date().toISOString() }); }
const action = threadId => ({ type: "brief.generate", threadId });
async function drain(f, service = f.service) { for (let i = 0; i < 100 && f.store.db.prepare("SELECT count(*) AS n FROM jobs WHERE kind='brief.generate' AND attempts<8").get().n; i++) await service.workJobs(); }

test("curator requests a durable brief from all history, isolated by client; repeated clicks and cached views do not regenerate", async () => {
  const f = portalFixture();
  try {
    const id = thread(f); const other = thread(f, "two"); message(f, other, "ЧУЖОЙ СЕКРЕТ");
    for (let i = 0; i < 85; i++) message(f, id, `Ответ ${i}`);
    message(f, id, "Вопрос куратора", "curator"); message(f, id, "Предположение ИИ", "assistant");
    let input; let calls = 0; const original = f.integrations.brief;
    f.integrations.brief = async (...args) => { calls++; input = args[0]; return original(...args); };
    const curator = f.login("curator").session;
    for (const role of ["client", "developer", "admin", "temporary"]) await assert.rejects(f.service.action(f.login(role).session, action(id)), { status: 403 });
    await assert.rejects(f.service.action(curator, action("chat-one")), { status: 404 });
    await Promise.all([1,2,3].map(() => f.service.action(curator, action(id))));
    assert.equal(calls, 0); assert.equal(f.store.db.prepare("SELECT count(*) AS n FROM jobs WHERE kind='brief.generate'").get().n, 1);
    await drain(f);
    assert.equal(calls, 1); assert.ok(input.includes("Самое раннее требование")); assert.ok(input.includes("Ответ 84")); assert.ok(input.includes("Вопрос куратора")); assert.ok(input.includes("Предположение ИИ")); assert.ok(!input.includes("ЧУЖОЙ СЕКРЕТ"));
    const snapshot = await f.service.snapshot(curator); assert.equal(snapshot.clientBriefs[0].status, "ready"); assert.equal(snapshot.clientBriefs[0].messageCount, 88);
    assert.ok(briefText(snapshot.clientBriefs[0].document).length <= 16000);
    for (const role of ["client", "developer", "admin"]) assert.deepEqual((await f.service.snapshot(f.login(role).session)).clientBriefs, []);
    await f.service.action(curator, action(id)); await drain(f); assert.equal(calls, 1);
    assert.equal(f.sent.length, 0, "briefs are never posted to Telegram or emailed automatically");
    assert.equal(f.store.all("briefRequests").length, 0, "completed raw request snapshots are removed");
  } finally { f.close(); }
});

test("long messages and early history are processed completely, then merged; checkpointed work resumes after restart", async () => {
  const f = portalFixture(); const directory = await mkdtemp(join(tmpdir(), "node-brief-restart-")); let recovered;
  try {
    const id = thread(f);
    const source = "🙂Первая деталь. ".repeat(15000) + "ПОСЛЕДНЯЯ ДЕТАЛЬ";
    message(f, id, source);
    const messages = f.store.all("messages").filter(message => message.threadId === id);
    const chunks = briefChunks(messages); assert.ok(chunks.length > 3);
    const parts = chunks.flatMap(chunk => chunk.trim().split("\n").map(line => JSON.parse(line))).filter(part => part.id === messages.find(message => message.text === source).id);
    assert.equal(parts.map(part => part.text).join(""), source); assert.ok(chunks.every(chunk => chunk.length <= 24000));
    const phases = []; let first = true; const original = f.integrations.brief;
    f.integrations.brief = async (...args) => { if (first) { first = false; throw new Error("Provider temporarily unavailable"); } phases.push(args[2]); return original(...args); };
    await f.service.action(f.login("curator").session, action(id)); await f.service.workJobs();
    assert.equal(f.store.get("clientBriefs", id).status, "retrying");
    f.store.db.prepare("UPDATE jobs SET available=0 WHERE kind='brief.generate'").run();
    await f.service.workJobs();
    assert.equal(f.store.all("briefRequests")[0].results.length, 1);
    f.store.db.prepare("UPDATE jobs SET running=1 WHERE kind='brief.generate'").run();
    const path = join(directory, "portal.sqlite"); await backup(f.store.db, path);
    recovered = new PortalStore(path);
    const restarted = new PortalService(recovered, f.integrations, f.config);
    for (let i=0;i<100 && recovered.db.prepare("SELECT count(*) AS n FROM jobs WHERE kind='brief.generate'").get().n;i++) await restarted.workJobs();
    assert.equal(recovered.get("clientBriefs", id).status, "ready");
    assert.ok(phases.includes("merge")); assert.equal(phases.filter(phase => phase === "extract").length, chunks.length);
  } finally { recovered?.close(); f.close(); await rm(directory, { recursive: true, force: true }); }
});

test("a changed conversation marks the document stale, failed refresh preserves it, and manual retry resumes safely", async () => {
  const f = portalFixture();
  try {
    const id = thread(f); const curator = f.login("curator").session;
    await f.service.action(curator, action(id)); await drain(f);
    const document = f.store.get("clientBriefs", id).document;
    message(f, id, "Новое пожелание"); assert.equal((await f.service.snapshot(curator)).clientBriefs[0].stale, true);
    const original = f.integrations.brief; f.integrations.brief = async () => { throw new Error("Unavailable"); };
    await f.service.action(curator, action(id));
    for (let i=0;i<8;i++) { f.store.db.prepare("UPDATE jobs SET available=0 WHERE kind='brief.generate'").run(); await f.service.workJobs(); }
    assert.equal(f.store.get("clientBriefs", id).status, "failed"); assert.deepEqual(f.store.get("clientBriefs", id).document, document);
    const event = f.service.errors.query({}).events.find(event => event.operation === "brief.generate"); assert.equal(event.actor.id, curator.viewer.id);
    const request = f.store.get("clientBriefs", id).requestId;
    f.integrations.brief = original;
    await f.service.action(curator, action(id)); assert.equal(f.store.get("clientBriefs", id).requestId, request);
    await drain(f); assert.equal((await f.service.snapshot(curator)).clientBriefs[0].stale, false);
  } finally { f.close(); }
});

test("a new message during generation remains visibly outside the frozen brief, and long AI work does not block other jobs", async () => {
  const f = portalFixture();
  try {
    const id = thread(f); let release; let started; const ready = new Promise(resolve => { started = resolve; });
    const original = f.integrations.brief;
    f.integrations.brief = async (...args) => { started(); await new Promise(resolve => { release = resolve; }); return original(...args); };
    await f.service.action(f.login("curator").session, action(id));
    const pending = f.service.workJobs(); await ready;
    message(f, id, "Пожелание после запуска"); f.store.enqueue("telegram.send", { chatId: "fixture", text: "Обычное сообщение" });
    await f.service.workJobs(); assert.ok(f.sent.some(item => item.text === "Обычное сообщение"));
    release(); await pending;
    assert.equal((await f.service.snapshot(f.login("curator").session)).clientBriefs[0].stale, true);
  } finally { f.close(); }
});

test("brief action is protected by HTTP session, role, Origin and CSRF", async () => {
  const f = portalFixture(); const {request,login} = portalApi(f);
  try {
    const id = thread(f); const curator = await login("curator", fixturePassword);
    assert.equal((await request("action",action(id))).statusCode,401);
    assert.equal((await request("action",action(id),curator,{origin:"https://evil.test"})).statusCode,403);
    assert.equal((await request("action",action(id),curator,{"x-csrf-token":"wrong"})).statusCode,403);
    assert.equal((await request("action",action(id),curator)).statusCode,200);
  } finally { f.close(); }
});

test("brief adapter sends complete supplied text as data with its own schema, handles refusal/incomplete output and rejects malformed content", async () => {
  const f = portalFixture(); const document = await f.integrations.brief(); f.close();
  const config = readConfig({PORTAL_OPENAI_KEY:"fixture-key",PORTAL_OPENAI_MODEL:"fixture-model"}); let body;
  const adapter = createIntegrations(config, async (url, init) => { body=JSON.parse(init.body);return Response.json({status:"completed",output:[{content:[{type:"output_text",text:JSON.stringify(document)}]}]}); });
  const input = "ранняя история\n" + "ответ клиента\n".repeat(80);
  assert.deepEqual(await adapter.brief(input,"fixture-model","extract"),document);
  assert.equal(body.input[0].content,input);assert.equal(body.store,false);assert.equal(body.text.format.strict,true);assert.equal(body.tools,undefined);assert.ok(body.instructions.includes("Не превращай предположения ИИ"));
  for(const data of [{status:"incomplete",output:[]},{status:"completed",output:[{content:[{type:"refusal"}]}]},{output:[{content:[{type:"output_text",text:"{}"}]}]}]) {
    const broken=createIntegrations(config,async()=>Response.json(data));await assert.rejects(broken.brief(input,"fixture-model","extract"),{status:502});
  }
});
