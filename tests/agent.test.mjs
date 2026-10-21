import assert from "node:assert/strict";
import test from "node:test";
import { Readable } from "node:stream";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { portalFixture, fixturePassword } from "./helpers/portal-fixture.mjs";
import { PortalStore } from "../server/store.ts";
import { TelegramAgent } from "../server/agent/service.ts";
import { createIntegrations } from "../server/integrations.ts";
import { readConfig } from "../server/config.ts";
import { formatTelegramHtml, parseTelegramHtml } from "../src/features/portal/model/telegram-html.ts";

const assistantReply = reply => ({ reply, title: "", body: "", handoff: false });
function update(f, updateId, content, chatId = 901) {
  f.service.receiveTelegram({ update_id: updateId, message: { text: content, chat: { id: chatId, type: "private" }, from: { first_name: "Клиент", username: "fixture_client" } } });
}
function api(f) {
  return async (path, body, account, headers = {}) => {
    const request = Readable.from(body === undefined ? [] : [Buffer.from(JSON.stringify(body))]);
    request.url = `/api/portal/${path}`; request.method = body === undefined ? "GET" : "POST";
    request.socket = { remoteAddress: "127.0.0.1" };
    request.headers = { origin: f.config.origin, "content-type": "application/json", ...(account ? { cookie: account.cookie, "x-csrf-token": account.body.csrf } : {}), ...headers };
    const response = { statusCode: 200, headers: {}, setHeader(key, value) { this.headers[key] = value; }, end(value) { this.body = JSON.parse(value); } };
    await f.handler(request, response); response.cookie = response.headers["Set-Cookie"]?.split(";")[0]; return response;
  };
}

test("Telegram HTML balances tags, escapes untrusted markup, rejects unsafe links and bounds Unicode text", () => {
  assert.deepEqual(formatTelegramHtml('<strong>Заголовок</strong>\n<i>Текст &amp; детали</i>'), { html: '<b>Заголовок</b>\n<i>Текст &amp; детали</i>', text: 'Заголовок\nТекст & детали' });
  const html = formatTelegramHtml('<b>Важно <i>да</b></i><script>alert(1)</script><a href="javascript:alert(1)">ссылка</a><constructor>x</constructor>');
  assert.ok(html.html.startsWith('<b>Важно <i>да</i></b>'));
  assert.ok(!html.html.includes('<script>') && !html.html.includes('<constructor>') && !html.html.includes('href="javascript:'));
  assert.ok(html.text.includes('<script>alert(1)</script>'));
  const link = formatTelegramHtml('<a href="https://example.test/?a=1&amp;b=2">Сайт</a>');
  assert.equal(link.html, '<a href="https://example.test/?a=1&amp;b=2">Сайт</a>');
  assert.deepEqual(formatTelegramHtml(link.html), link, "canonical HTML is stable when sanitized again");
  const long = formatTelegramHtml(`<b>${"😀".repeat(5000)}</b>`);
  assert.ok(long.text.length <= 4000); assert.ok(long.html.endsWith('…</b>')); assert.ok(!long.text.includes('�'));
  assert.equal(parseTelegramHtml('<pre><code>1 &lt; 2</code></pre>')[0].tag, 'pre');
});

test("Telegram adapter uses HTML and falls back to escaped text only for entity errors", async () => {
  const sent = [];
  const adapter = createIntegrations(readConfig({ PORTAL_TELEGRAM_TOKEN: "test-token" }), async (url, init) => {
    assert.ok(url.endsWith('/sendMessage')); sent.push(JSON.parse(init.body));
    return new Response(JSON.stringify(sent.length === 1 ? { ok: false, description: "Bad Request: can't parse entities" } : { ok: true }), { status: sent.length === 1 ? 400 : 200 });
  });
  await adapter.telegram("1", "Текст < x", "<b>Текст &lt; x</b>");
  assert.equal(sent.length, 2); assert.equal(sent[0].parse_mode, 'HTML'); assert.equal(sent[0].text, '<b>Текст &lt; x</b>'); assert.equal(sent[1].text, 'Текст &lt; x');
  await adapter.telegram("1", "<b>буквальный текст</b>");
  assert.equal(sent[2].text, '&lt;b&gt;буквальный текст&lt;/b&gt;');
});

test("agent administration requires an administrator and CSRF; versions prevent stale writes and secrets never reach exports", async () => {
  const f = portalFixture(); const request = api(f);
  try {
    assert.equal((await request('admin/agent')).statusCode, 401);
    for (const role of ['client', 'developer', 'curator', 'temporary']) {
      const account = await request('login', { email: f.users[role].email, password: fixturePassword });
      assert.equal((await request('admin/agent', undefined, account)).statusCode, 403);
      assert.equal((await request('admin/agent', { type: 'reindex', role: 'admin' }, account)).statusCode, 403);
      assert.equal((await request('admin/agent/export', undefined, account)).statusCode, 403);
    }
    const admin = await request('login', { email: f.users.admin.email, password: fixturePassword });
    const initial = (await request('admin/agent', undefined, admin)).body;
    const settings = { ...initial.settings, name: 'София', systemPrompt: 'PRIVATE_AGENT_INSTRUCTIONS' };
    assert.equal((await request('admin/agent', { type: 'settings.save', settings, version: 0 }, admin, { 'x-csrf-token': '' })).statusCode, 403);
    assert.equal((await request('admin/agent', { type: 'settings.save', settings, version: 0 }, admin, { origin: 'https://other.test' })).statusCode, 403);
    const saved = await request('admin/agent', { type: 'settings.save', settings, version: 0 }, admin);
    assert.equal(saved.statusCode, 200); assert.equal(saved.body.settings.version, 1); assert.equal(saved.body.settings.name, 'София');
    assert.equal((await request('admin/agent', { type: 'settings.save', settings, version: 0 }, admin)).statusCode, 409);
    assert.equal((await request('admin/agent', { type: 'settings.save', settings: { ...settings, maxReplyChars: 8001 }, version: 1 }, admin)).statusCode, 400);
    assert.equal((await request('admin/agent', { type: 'settings.save', settings: { ...settings, greeting: '<b></b>' }, version: 1 }, admin)).statusCode, 400);
    assert.equal((await request('admin/agent', { type: 'settings.save', settings: { ...settings, rag: { ...settings.rag, overlap: 900 } }, version: 1 }, admin)).statusCode, 400);
    f.config.aiKey = 'NEVER_EXPOSE_API_KEY'; f.config.telegramToken = 'NEVER_EXPOSE_TELEGRAM_TOKEN';
    const exported = JSON.stringify((await request('admin/agent/export', undefined, admin)).body);
    assert.ok(!exported.includes('NEVER_EXPOSE'));
    for (const role of ['client', 'developer', 'curator']) assert.ok(!JSON.stringify(await f.service.snapshot(f.login(role).session)).includes('PRIVATE_AGENT_INSTRUCTIONS'));
    const original = saved.body.revisions.find(revision => revision.version === 0);
    assert.equal((await request('admin/agent', { type: 'settings.restore', revisionId: original.id, version: 1 }, admin)).body.settings.version, 2);
  } finally { f.close(); }
});

test("RAG retrieves bounded relevant chunks and excludes disabled or archived documents; preview has no external chat side effects", async () => {
  const f = portalFixture();
  try {
    const admin = f.users.admin;
    f.service.agent.saveDocument({ title: 'Оплата', content: 'Оплата проекта производится в рублях. Пожелания оценивает разработчик.', enabled: true }, admin);
    f.service.agent.saveDocument({ title: 'Доставка', content: 'Доставка заказов в студии не производится.', enabled: true }, admin);
    const settings = f.service.agent.settings();
    const found = await f.service.agent.retrieve('Как происходит оплата проекта?', settings);
    assert.equal(found.sources[0].title, 'Оплата'); assert.ok(found.sources.reduce((sum, source) => sum + source.text.length, 0) <= settings.rag.maxContextChars);
    const document = f.store.all('agentDocuments').find(document => document.title === 'Оплата');
    const messages = f.store.all('messages').length; const jobs = f.store.db.prepare('SELECT count(*) AS count FROM jobs').get().count;
    f.integrations.assistant = async (input, kind, options) => { assert.equal(kind, 'telegram'); assert.equal(options.preferences.name, 'Тестовый агент'); assert.equal(options.knowledge[0].title, 'Оплата'); return { ...assistantReply('<b>Оплата</b>\nВ рублях.'), handoff: true }; };
    const preview = await f.service.agent.preview({ settings: { ...settings, name: 'Тестовый агент' }, messages: [{ role: 'client', text: 'Оплата проекта' }] });
    assert.equal(preview.html, '<b>Оплата</b>\nВ рублях.'); assert.equal(preview.sources[0].documentId, document.id);
    assert.equal(f.store.all('messages').length, messages); assert.equal(f.store.db.prepare('SELECT count(*) AS count FROM jobs').get().count, jobs); assert.equal(f.sent.length, 0);
    f.service.agent.saveDocument({ ...document, enabled: false }, admin);
    assert.equal((await f.service.agent.retrieve('Оплата проекта', settings)).sources.length, 0);
    await assert.rejects(f.service.agentAction(f.login('admin').session, { type: 'document.save', document }), { status: 409 });
    const disabled = f.store.get('agentDocuments', document.id);
    f.service.agent.saveDocument({ ...disabled, enabled: true }, admin);
    const enabled = f.store.get('agentDocuments', document.id);
    f.service.agent.archiveDocument(document.id, enabled.version, true, admin);
    assert.equal((await f.service.agent.retrieve('Оплата проекта', settings)).sources.length, 0);
    let calls = 0; f.integrations.assistant = async () => { calls++; return assistantReply('unused'); };
    const strict = await f.service.agent.preview({ settings: { ...settings, rag: { ...settings.rag, strict: true } }, messages: [{ role: 'client', text: 'Лунная база' }] });
    assert.equal(calls, 0); assert.equal(strict.reply, settings.noKnowledgeMessage);
  } finally { f.close(); }
});

test("hybrid retrieval builds embeddings and finds semantic matches without shared words", async () => {
  const f = portalFixture();
  try {
    const settings = f.service.agent.settings();
    f.service.agent.saveSettings({ ...settings, rag: { ...settings.rag, mode: 'hybrid' } }, 0, f.users.admin);
    f.integrations.embed = async inputs => inputs.map(input => input.includes('лес') ? [0, 1, 0] : [1, 0, 0]);
    f.service.agent.saveDocument({ title: 'Палитра', content: 'Пурпурный оттенок логотипа студии.', enabled: true }, f.users.admin);
    f.service.agent.saveDocument({ title: 'Природа', content: 'Зелёный лес и деревья.', enabled: true }, f.users.admin);
    await f.service.workJobs();
    assert.ok(f.store.all('agentDocuments').every(document => document.indexStatus === 'ready'));
    const result = await f.service.agent.retrieve('Фиолетовый цвет', f.service.agent.settings());
    assert.equal(result.sources[0].title, 'Палитра'); assert.deepEqual(result.warnings, []);
  } finally { f.close(); }
});

test("Telegram agent applies live settings, retrieves knowledge, emits HTML and only updates contact metadata from the user's text", async () => {
  const f = portalFixture();
  try {
    const settings = f.service.agent.settings();
    f.service.agent.saveSettings({ ...settings, name: 'София', greeting: '<b>Привет!</b> Можно позвать куратора.' }, 0, f.users.admin);
    f.service.agent.saveDocument({ title: 'Правила', content: 'Проект начинаем с согласования пожеланий.', enabled: true }, f.users.admin);
    f.integrations.assistant = async (messages, kind, options) => {
      assert.equal(options.preferences.name, 'София'); assert.equal(kind, 'telegram'); assert.ok(messages.every(message => message.threadId === 'telegram:901'));
      return { ...assistantReply('<b>Начало работы</b>\n<i>Согласуем пожелания.</i>'), title: 'Нельзя создавать Issue', body: 'Это Telegram' };
    };
    update(f, 1, '/start'); await f.service.workJobs();
    assert.ok(f.sent.some(message => message.html?.includes('<b>Привет!</b>')));
    update(f, 2, 'Расскажите правила начала проекта'); await f.service.workJobs();
    const answer = f.store.get('messages', 'reply:telegram-message:2');
    assert.equal(answer.author, 'София'); assert.ok(answer.html.includes('<b>')); assert.ok(!answer.text.includes('<b>'));
    assert.equal(f.store.all('drafts').length, 0); assert.equal(f.store.all('agentRuns').length, 1);
    update(f, 3, 'Почта client@example.test'); await f.service.workJobs();
    assert.equal(f.store.get('conversations', 'telegram:901').email, 'client@example.test');
    update(f, 4, 'Расскажите про поддержку'); await f.service.workJobs();
    assert.equal(f.store.get('conversations', 'telegram:901').handoffRequested, false, 'mentioning support is not a request for a human');
    update(f, 5, 'Позови куратора'); await f.service.workJobs();
    assert.equal(f.store.get('conversations', 'telegram:901').handoffRequested, true);
  } finally { f.close(); }
});

test("curator takeover and changing agent configuration discard in-flight replies", async () => {
  for (const mutation of ['takeover', 'settings']) {
    const f = portalFixture();
    try {
      let resolveAnswer, started; const ready = new Promise(resolve => { started = resolve; }); let calls = 0;
      f.integrations.assistant = async () => { calls++; if (calls > 1) return assistantReply('<b>Новые настройки</b>'); started(); return new Promise(resolve => { resolveAnswer = resolve; }); };
      update(f, 1, 'Расскажи про студию'); const work = f.service.workJobs(); await ready;
      if (mutation === 'takeover') await f.service.action(f.login('curator').session, { type: 'takeover', threadId: 'telegram:901' });
      else f.service.agent.saveSettings({ ...f.service.agent.settings(), name: 'Новый агент' }, 0, f.users.admin);
      resolveAnswer(assistantReply('Устаревший ответ')); await work;
      assert.ok(!f.store.all('messages').some(message => message.text === 'Устаревший ответ'));
      if (mutation === 'settings') { assert.equal(calls, 2); assert.equal(f.store.get('messages', 'reply:telegram-message:1').author, 'Новый агент'); }
    } finally { f.close(); }
  }
});

test("upstream failure, pausing and reply limits provide a safe fallback and hand the thread to a curator", async () => {
  for (const scenario of ['error', 'paused', 'limit']) {
    const f = portalFixture();
    try {
      let calls = 0; f.integrations.assistant = async () => { calls++; if (scenario === 'error') throw new Error('PRIVATE_UPSTREAM_SECRET'); return assistantReply('<b>Ответ</b>'); };
      const settings = f.service.agent.settings();
      f.service.agent.saveSettings({ ...settings, enabled: scenario !== 'paused', repliesPerHour: 1 }, 0, f.users.admin);
      update(f, 1, 'Расскажите про студию'); await f.service.workJobs();
      if (scenario === 'limit') { update(f, 2, 'Ещё вопрос'); await f.service.workJobs(); assert.equal(calls, 1); }
      if (scenario === 'paused') assert.equal(calls, 0);
      assert.equal(f.store.get('conversations', 'telegram:901').handoffRequested, true);
      assert.ok(!JSON.stringify(f.store.all('messages')).includes('PRIVATE_UPSTREAM_SECRET'));
      assert.ok(f.sent.some(message => message.text.includes('Передал запрос куратору')));
    } finally { f.close(); }
  }
});

test("agent settings, knowledge fragments and revision history survive database reopening", async () => {
  const f = portalFixture(); const directory = await mkdtemp(join(tmpdir(), 'node-agent-')); const database = join(directory, 'portal.sqlite');
  let store = new PortalStore(database);
  try {
    let agent = new TelegramAgent(store, f.integrations, f.config);
    agent.saveSettings({ ...agent.settings(), name: 'Сохранённый агент' }, 0, f.users.admin);
    agent.saveDocument({ title: 'Гарантия', content: 'Гарантия обсуждается с куратором студии.', enabled: true }, f.users.admin);
    store.close(); store = new PortalStore(database); agent = new TelegramAgent(store, f.integrations, f.config);
    assert.equal(agent.settings().name, 'Сохранённый агент'); assert.equal(agent.state().revisions.length, 2);
    assert.equal((await agent.retrieve('Гарантия', agent.settings())).sources[0].title, 'Гарантия');
  } finally { store.close(); f.close(); await rm(directory, { recursive: true, force: true }); }
});

test("editing prompts during embedding generation does not leave the knowledge index pending", async () => {
  const f = portalFixture();
  try {
    const initial = f.service.agent.settings();
    f.service.agent.saveSettings({ ...initial, rag: { ...initial.rag, mode: 'hybrid' } }, 0, f.users.admin);
    f.service.agent.saveDocument({ title: 'Студия', content: 'Разработка сайтов и личных кабинетов.', enabled: true }, f.users.admin);
    let started, finish; const ready = new Promise(resolve => { started = resolve; });
    f.integrations.embed = async inputs => { started(); return new Promise(resolve => { finish = () => resolve(inputs.map(() => [1, 0, 0])); }); };
    const work = f.service.workJobs(); await ready;
    f.service.agent.saveSettings({ ...f.service.agent.settings(), name: 'Другое имя' }, 1, f.users.admin);
    finish(); await work;
    assert.equal(f.store.all('agentDocuments')[0].indexStatus, 'ready');
    assert.ok(f.store.db.prepare('SELECT embedding FROM agent_chunks').get().embedding);
  } finally { f.close(); }
});

test("OpenAI request applies admin model, generation controls, history limits and selected knowledge only", async () => {
  const f = portalFixture();
  try {
    let payload;
    const adapter = createIntegrations(readConfig({ PORTAL_OPENAI_KEY: 'fixture-key', PORTAL_OPENAI_MODEL: 'original' }), async (url, init) => {
      assert.equal(url, 'https://api.openai.com/v1/responses'); payload = JSON.parse(init.body);
      return new Response(JSON.stringify({ output: [{ content: [{ type: 'output_text', text: JSON.stringify(assistantReply('<b>Готово</b>')) }] }] }));
    });
    const preferences = { ...f.service.agent.settings(), model: 'selected-model', historyLimit: 2, maxOutputTokens: 1200, generation: { temperature: 0.4, reasoningEffort: 'low', verbosity: 'high' } };
    const messages = Array.from({ length: 4 }, (_, index) => ({ id: String(index), threadId: 'test', author: 'User', role: 'client', text: `Question ${index}`, createdAt: new Date().toISOString() }));
    await adapter.assistant(messages, 'telegram', { preferences, knowledge: [{ documentId: 'k', title: 'Услуги', text: 'Только этот фрагмент', score: 1 }] });
    assert.equal(payload.model, 'selected-model'); assert.equal(payload.max_output_tokens, 1200); assert.equal(payload.temperature, 0.4); assert.equal(payload.reasoning.effort, 'low'); assert.equal(payload.text.verbosity, 'high');
    assert.equal(payload.store, false); assert.equal(payload.input.length, 3); assert.ok(payload.input[0].content.includes('Только этот фрагмент')); assert.ok(payload.input[1].content.includes('Question 2'));
    assert.equal(payload.tools, undefined); assert.equal(payload.text.format.strict, true);
  } finally { f.close(); }
});
