import { portalApi } from "./helpers/http.mjs";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { PortalService } from "../server/service.ts";
import { PortalStore } from "../server/store.ts";
import { portalFixture, fixturePassword } from "./helpers/portal-fixture.mjs";

test("server filters each role and isolates projects belonging to different clients", async () => {
  const f = portalFixture();
  try {
    const client = await f.service.snapshot(f.login("client").session, "three");
    assert.deepEqual(client.projects.map(project => project.id), ["one", "two"]);
    assert.equal(client.selectedProjectId, "one");
    assert.ok(!JSON.stringify(client).includes("Личная переписка three"));
    assert.equal((await f.service.snapshot(f.login("other").session)).projects.length, 1);
    assert.equal((await f.service.snapshot(f.login("developer").session)).projects.length, 3);
    for (const role of ["admin", "temporary"]) {
      const snapshot = await f.service.snapshot(f.login(role).session);
      for (const kind of ["projects", "tasks", "stages", "commits", "drafts", "quotes"]) assert.deepEqual(snapshot[kind], [], `${role}: ${kind}`);
      assert.deepEqual(snapshot.messages, []);
    }
  } finally { f.close(); }
});

test("authorization is enforced on actions, independent of UI and submitted role", async () => {
  const f = portalFixture();
  try {
    await assert.rejects(f.service.action(f.login("client").session, { type: "task.status", projectId: "one", number: 1, status: "done", role: "developer" }), { status: 403 });
    await assert.rejects(f.service.action(f.login("developer").session, { type: "message", threadId: "chat-one", text: "Hi" }), { status: 409 });
    await assert.rejects(f.service.action(f.login("client").session, { type: "message", threadId: "chat-three", text: "Hi" }), { status: 404 });
    await assert.rejects(f.service.action(f.login("temporary").session, { type: "message", threadId: "chat-one", text: "Hi" }), { status: 403 });
  } finally { f.close(); }
});

test("only a developer can take an active project; claiming is idempotent and survives GitHub sync", async () => {
  const f = portalFixture();
  try {
    const action = { type: "project.accept", projectId: "one", developerId: "forged" };
    for (const role of ["client", "other", "admin", "temporary"]) {
      await assert.rejects(f.service.action(f.login(role).session, action), { status: 403 });
    }
    const developer = f.login("developer").session;
    await assert.rejects(f.service.action(developer, { ...action, projectId: "missing" }), { status: 404 });
    f.store.put("projects", { ...f.store.get("projects", "two"), status: "provisioning" });
    await assert.rejects(f.service.action(developer, { ...action, projectId: "two" }), { status: 409 });
    f.store.put("projects", { ...f.store.get("projects", "three"), developerId: "another-developer" });
    await assert.rejects(f.service.action(developer, { ...action, projectId: "three" }), { status: 409 });

    const before = structuredClone(f.issues.get("Matthew-zzz/fixture-one"));
    const staleProject = f.store.get("projects", "one");
    await Promise.all([1, 2].map(() => f.service.action(developer, action)));
    const accepted = f.store.get("projects", "one");
    assert.equal(accepted.developerId, developer.viewer.id, "the authenticated developer is used instead of submitted ownership");
    assert.ok(accepted.acceptedAt);
    await f.service.action(developer, action);
    assert.equal(f.store.get("projects", "one").acceptedAt, accepted.acceptedAt);
    await f.service.sync(staleProject, 1, true);
    assert.equal(f.store.get("projects", "one").developerId, developer.viewer.id, "an in-flight GitHub sync cannot overwrite the assignment");
    const snapshot = await f.service.snapshot(f.login("developer").session, "one");
    assert.equal(snapshot.projects.find(project => project.id === "one").developerId, developer.viewer.id);
    assert.deepEqual(f.issues.get("Matthew-zzz/fixture-one"), before, "taking a project does not replace GitHub task statuses");
  } finally { f.close(); }
});

test("project assignment survives reopening the database and a new developer session", async () => {
  const f = portalFixture();
  const directory = await mkdtemp(join(tmpdir(), "node-projects-"));
  const database = join(directory, "portal.sqlite");
  let store = new PortalStore(database);
  try {
    const developer = store.createUser("developer@example.test", "Developer", "developer", fixturePassword, false);
    const client = store.createUser("client@example.test", "Client", "client", fixturePassword, false);
    store.put("projects", { ...f.store.get("projects", "one"), clientId: client.id });
    let service = new PortalService(store, f.integrations, f.config);
    await service.action(store.login(developer.email, fixturePassword, "test").session, { type: "project.accept", projectId: "one" });
    const acceptedAt = store.get("projects", "one").acceptedAt;
    store.close();
    store = new PortalStore(database);
    service = new PortalService(store, f.integrations, f.config);
    const snapshot = await service.snapshot(store.login(developer.email, fixturePassword, "test").session);
    assert.equal(snapshot.projects[0].developerId, developer.id);
    assert.equal(snapshot.projects[0].acceptedAt, acceptedAt);
  } finally { store.close(); f.close(); await rm(directory, { recursive: true, force: true }); }
});

test("temporary passwords must change; changing a password revokes other sessions", async () => {
  const f = portalFixture();
  try {
    const first = f.login("temporary"); const other = f.login("temporary");
    assert.equal(first.session.viewer.mustChangePassword, true);
    assert.throws(() => f.store.changePassword(first.session, fixturePassword, fixturePassword), { status: 400 });
    f.store.changePassword(first.session, fixturePassword, "My-new-password-2026");
    assert.equal(f.store.session(first.token).viewer.mustChangePassword, false);
    assert.equal(f.store.session(other.token), undefined);
    assert.throws(() => f.login("temporary"), { status: 401 });
    assert.equal(f.store.login(f.users.temporary.email, "My-new-password-2026", "fixture").session.viewer.mustChangePassword, false);
  } finally { f.close(); }
});

test("AI drafts only become GitHub Issues after client confirmation, once", async () => {
  const f = portalFixture();
  try {
    const session = f.login("client").session;
    await f.service.action(session, { type: "message", threadId: "chat-one", text: "Добавьте поиск по каталогу" });
    assert.equal(f.issues.get("Matthew-zzz/fixture-one").length, 2);
    await f.service.workJobs();
    const draft = f.store.all("drafts")[0]; assert.ok(draft);
    await Promise.all([1, 2].map(() => f.service.action(session, { type: "draft.confirm", draftId: draft.id })));
    assert.equal(f.issues.get("Matthew-zzz/fixture-one").length, 3);
    assert.equal(f.store.get("drafts", draft.id).confirmed, true);
    await assert.rejects(f.service.action(f.login("other").session, { type: "draft.confirm", draftId: draft.id }), { status: 404 });
  } finally { f.close(); }
});

test("quote versions, 30% markup and payment gate are checked on the server", async () => {
  const f = portalFixture();
  try {
    const developer = f.login("developer").session; const client = f.login("client").session;
    await f.service.action(developer, { type: "quote.create", projectId: "one", number: 2, baseKopecks: 1000000 });
    const first = f.store.all("quotes")[0]; assert.equal(first.totalKopecks, 1300000);
    await assert.rejects(f.service.action(developer, { type: "task.status", projectId: "one", number: 2, status: "in_progress" }), { status: 409 });
    await f.service.action(developer, { type: "quote.create", projectId: "one", number: 2, baseKopecks: 2000000 });
    const current = f.store.all("quotes").find(quote => quote.status === "pending");
    f.config.mockPayments = false;
    await assert.rejects(f.service.action(client, { type: "quote.pay", quoteId: current.id, outcome: "succeeded" }), { status: 503 });
    assert.equal(f.store.get("quotes", current.id).status, "pending");
    f.config.mockPayments = true;
    await assert.rejects(f.service.action(client, { type: "quote.pay", quoteId: first.id, outcome: "succeeded" }), { status: 409 });
    await assert.rejects(f.service.action(f.login("other").session, { type: "quote.pay", quoteId: current.id, outcome: "succeeded" }), { status: 404 });
    await f.service.action(client, { type: "quote.pay", quoteId: current.id, outcome: "failed" });
    assert.equal(f.store.get("quotes", current.id).status, "pending");
    await f.service.action(client, { type: "quote.pay", quoteId: current.id, outcome: "succeeded", totalKopecks: 1 });
    await f.service.action(client, { type: "quote.pay", quoteId: current.id, outcome: "succeeded" });
    assert.equal(f.store.get("quotes", current.id).totalKopecks, 2600000);
    await f.service.action(developer, { type: "task.status", projectId: "one", number: 2, status: "in_progress" });
    assert.equal(f.issues.get("Matthew-zzz/fixture-one")[1].status, "in_progress");
    await assert.rejects(f.service.action(developer, { type: "quote.create", projectId: "one", number: 2, baseKopecks: 1 }), { status: 409 });
  } finally { f.close(); }
});

test("developer can include a wish in the original paid scope, recorded in GitHub", async () => {
  const f = portalFixture();
  try {
    const session = f.login("developer").session;
    await f.service.action(session, { type: "task.include", projectId: "one", number: 2 });
    assert.equal(f.issues.get("Matthew-zzz/fixture-one")[1].included, true);
    await f.service.action(session, { type: "task.status", projectId: "one", number: 2, status: "in_progress" });
    await assert.rejects(f.service.action(session, { type: "quote.create", projectId: "one", number: 2, baseKopecks: 100 }), { status: 409 });
  } finally { f.close(); }
});

test("GitHub updates replace cached statuses; paginated history includes the initial commit", async () => {
  const f = portalFixture();
  try {
    const repo = "Matthew-zzz/fixture-one";
    const history = Array.from({ length: 101 }, (_, i) => ({ sha: i.toString(16).padStart(40, "0"), projectId: "", title: i === 100 ? "init: original" : `change ${i}`, author: "Developer", createdAt: new Date(Date.UTC(2026, 9, 20, 0, 0, 101 - i)).toISOString() }));
    f.commits.set(repo, history);
    const session = f.login("client").session;
    assert.equal((await f.service.snapshot(session)).hasMoreCommits, true);
    const complete = await f.service.snapshot(session, "one", 2);
    assert.equal(complete.commits.length, 101); assert.equal(complete.hasMoreCommits, false);
    assert.ok(complete.commits.some(commit => commit.title === "init: original"));
    f.issues.get(repo)[0].status = "done";
    await f.service.sync(f.store.get("projects", "one"), 2, true);
    assert.equal((await f.service.snapshot(session, "one", 2)).tasks.find(task => task.number === 1).status, "done");
  } finally { f.close(); }
});

test("an in-flight AI response is discarded after a human joins, including join and leave", async () => {
  const f = portalFixture();
  try {
    let resolveAnswer; let started;
    const ready = new Promise(resolve => { started = resolve; });
    f.integrations.assistant = async () => { started(); return new Promise(resolve => { resolveAnswer = resolve; }); };
    await f.service.action(f.login("client").session, { type: "message", threadId: "chat-one", text: "Добавить поиск" });
    const work = f.service.workJobs(); await ready;
    const developer = f.login("developer").session;
    await f.service.action(developer, { type: "takeover", threadId: "chat-one" });
    await f.service.action(developer, { type: "leave", threadId: "chat-one" });
    resolveAnswer({ reply: "stale reply", title: "stale draft", body: "stale body", handoff: false }); await work;
    assert.ok(!f.store.all("messages").some(message => message.text === "stale reply"));
    assert.equal(f.store.all("drafts").length, 0);
    await f.service.action(f.login("client").session, { type: "message", threadId: "chat-one", text: "Позови разработчика" });
    assert.equal(f.store.get("conversations", "chat-one").handoffRequested, true);
  } finally { f.close(); }
});

test("Telegram intake is deduplicated, private, and supports intake takeover", async () => {
  const f = portalFixture();
  try {
    const update = { update_id: 42, message: { message_id: 1, chat: { id: 123, type: "private" }, from: { first_name: "Катя", username: "kate" }, text: "Позови разработчика" } };
    f.service.receiveTelegram(update); f.service.receiveTelegram(update); await f.service.workJobs();
    const thread = f.store.get("conversations", "telegram:123"); assert.equal(thread.handoffRequested, true);
    assert.equal(f.store.all("messages").filter(message => message.text === update.message.text).length, 1);
    const intake = f.login("developer").session;
    const snapshot = await f.service.snapshot(intake); assert.equal(snapshot.conversations.filter(thread => thread.kind === "telegram").length, 1); assert.equal(snapshot.projects.length, 3);
    await f.service.action(intake, { type: "takeover", threadId: thread.id });
    await f.service.action(intake, { type: "message", threadId: thread.id, text: "Здравствуйте! Помогу." });
    await f.service.workJobs(); assert.ok(f.sent.some(message => message.chatId === "123" && message.text === "Здравствуйте! Помогу."));
    await f.service.action(intake, { type: "leave", threadId: thread.id });
    assert.equal(f.store.get("conversations", thread.id).ownerId, null);
    await assert.rejects(f.service.action(f.login("client").session, { type: "takeover", threadId: thread.id }), { status: 403 });
  } finally { f.close(); }
});

test("paid order creates a client and project without GitHub; developer creates the repo after acceptance", async () => {
  const f = portalFixture();
  try {
    const intake = f.login("developer").session;
    await f.service.action(intake, { type: "order.create", order: { projectName: "Shop", clientName: "Новый клиент", email: "new@example.test", username: "newclient", brief: "Согласованное ТЗ", totalKopecks: 5000000 } });
    const order = f.store.all("orders")[0]; assert.equal(order.totalKopecks, 5000000);
    await assert.rejects(f.service.action(intake, { type: "order.provision", orderId: order.id }), { status: 409 });
    f.service.payOrder(order.checkoutToken, "succeeded"); f.service.payOrder(order.checkoutToken, "succeeded");
    await f.service.action(intake, { type: "order.provision", orderId: order.id });
    await f.service.action(intake, { type: "order.provision", orderId: order.id });
    let queued;
    f.integrations.mail = async (email, content, deliveryId, subject) => { if (deliveryId.startsWith("access:")) queued = String(f.store.db.prepare("SELECT payload FROM jobs WHERE id=?").get(deliveryId).payload); f.sent.push({ email, content, deliveryId, subject }); };
    await f.service.workJobs();
    assert.equal(f.repositories.length, 0);
    const project = f.store.get("projects", `project:${order.id}`);
    assert.equal(project.repo, ""); assert.equal(project.developerId, undefined);
    assert.equal(f.store.all("tasks", project.id).length, 0);
    const client = f.store.findUser("new@example.test"); assert.equal(client.mustChangePassword, true);
    const mail = f.sent.find(item => item.deliveryId === `access:${order.id}`); assert.ok(mail.content.includes("Временный пароль"));
    assert.ok(!queued.includes("Временный пароль")); assert.ok(!queued.includes(mail.content.match(/Временный пароль: (.+)/)[1]));
    assert.equal(f.store.get("orders", order.id).status, "ready");
    await f.service.action(intake, { type: "order.provision", orderId: order.id }); assert.equal(f.repositories.length, 0);
    const developer = f.login("developer").session;
    await f.service.action(developer, { type: "project.accept", projectId: project.id });
    await f.service.action(developer, { type: "project.repository.create", projectId: project.id });
    await f.service.workJobs();
    assert.equal(f.repositories.length, 1); assert.equal(f.issues.get(f.repositories[0]).length, 1);
  } finally { f.close(); }
});

test("HTTP boundary rejects cross-origin writes, missing CSRF, and unverified webhooks", async () => {
  const f = portalFixture();
  const http = portalApi(f, true).request;
  const request = (path, body, headers = {}, method = "POST") => http(path, method === "GET" ? undefined : body, undefined, headers);

  try {
    assert.equal((await request("login", { email: f.users.client.email, password: fixturePassword }, { origin: "https://another.test" })).statusCode, 403);
    const login = await request("login", { email: f.users.client.email, password: fixturePassword });
    assert.equal(login.statusCode, 200); assert.ok([login.headers["Set-Cookie"]].flat().some(cookie => cookie.includes("HttpOnly; SameSite=Lax")));
    const cookie = login.cookie;
    const action = { type: "message", threadId: "chat-one", text: "Hello" };
    assert.equal((await request("action", action, { cookie })).statusCode, 403);
    assert.equal((await request("action", action, { cookie, "x-csrf-token": login.body.csrf })).statusCode, 200);
    assert.equal((await request("snapshot", undefined, {}, "GET")).body.viewer, null);
    assert.equal((await request("action", action)).statusCode, 401);
    await f.service.action(f.login("developer").session, { type: "order.create", order: { projectName: "Checkout", clientName: "Client", email: "new@example.test", username: "client", brief: "Initial scope", totalKopecks: 500000 } });
    const order = f.store.all("orders")[0];
    f.config.mockPayments = false;
    assert.equal((await request("checkout", { token: order.checkoutToken })).body.provider, "disabled");
    assert.equal((await request("checkout/pay", { token: order.checkoutToken, outcome: "succeeded" })).statusCode, 503);
    assert.equal(f.store.get("orders", order.id).status, "pending");
    f.config.mockPayments = true;
    assert.equal((await request("checkout/pay", { token: "0".repeat(64), outcome: "succeeded" })).statusCode, 404);
    assert.equal((await request("checkout/pay", { token: order.checkoutToken, outcome: "failed" })).body.status, "pending");
    const paid = await request("checkout/pay", { token: order.checkoutToken, outcome: "succeeded", totalKopecks: 1 });
    assert.equal(paid.body.provider, "mock");
    assert.equal(paid.body.totalKopecks, 500000, "browser cannot change the checkout amount");
    assert.equal((await request("checkout/pay", { token: order.checkoutToken, outcome: "succeeded" })).body.status, "paid");
    const event = { repository: { full_name: "Matthew-zzz/fixture-one" } };
    assert.equal((await request("webhooks/github", event)).statusCode, 403);
    const signature = "sha256=" + createHmac("sha256", f.config.githubWebhookSecret).update(JSON.stringify(event)).digest("hex");
    assert.equal((await request("webhooks/github", event, { "x-hub-signature-256": signature, "x-github-delivery": "delivery-1" })).statusCode, 202);
    assert.equal((await request("webhooks/telegram", { update_id: 1 })).statusCode, 403);
  } finally { f.close(); }
});

test("failed login attempts are limited and stored passwords are hashed", () => {
  const f = portalFixture();
  try {
    const stored = f.store.db.prepare("SELECT password FROM users WHERE id=?").get(f.users.client.id).password;
    assert.notEqual(stored, fixturePassword); assert.match(stored, /^[a-f0-9]{32}:[a-f0-9]{128}$/);
    for (let i = 0; i < 8; i++) assert.throws(() => f.store.login(f.users.client.email, "incorrect", "attacker"), { status: 401 });
    assert.throws(() => f.store.login(f.users.client.email, fixturePassword, "attacker"), { status: 429 });
  } finally { f.close(); }
});
