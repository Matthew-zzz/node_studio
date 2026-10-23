import assert from "node:assert/strict";
import test from "node:test";
import { portalFixture, fixturePassword } from "./helpers/portal-fixture.mjs";
import { portalApi } from "./helpers/http.mjs";

const orderInput = { projectName: "Клиентский проект", clientName: "Клиент", email: "client@example.test", username: "client_v", brief: "Каталог и поиск", totalKopecks: 100_000 };
async function createOrder(f) {
  await f.service.action(f.login("developer").session, { type: "order.create", order: orderInput });
  return f.store.all("orders").at(-1);
}
async function createQuote(f) {
  await f.service.action(f.login("developer").session, { type: "quote.create", projectId: "one", number: 2, baseKopecks: 100_000 });
  return f.store.all("quotes").find(quote => !quote.deletedAt && quote.status === "pending");
}
const removeQuote = quote => ({ type: "quote.delete", quoteId: quote.id });
const removeOrder = order => ({ type: "order.delete", orderId: order.id });

test("deletion API requires an authenticated developer, verified session and CSRF", async () => {
  const f = portalFixture();
  try {
    const api = portalApi(f); const order = await createOrder(f); const quote = await createQuote(f);
    const actions = [{ type: "project.delete", projectId: "one", confirmation: "one" }, removeOrder(order), removeQuote(quote)];
    for (const action of actions) assert.equal((await api.request("action", action)).statusCode, 401);
    for (const role of ["client", "other", "admin", "temporary"]) {
      const account = await api.login(role, fixturePassword);
      for (const action of actions) assert.equal((await api.request("action", action, account)).statusCode, 403, role);
    }
    const challenge = await api.request("login", { email: "developer@example.test", password: fixturePassword, role: "developer" });
    assert.equal(challenge.body.kind, "verification");
    for (const action of actions) assert.equal((await api.request("action", action, challenge)).statusCode, 401);
    const code = f.sent.filter(mail => mail.email === "developer@example.test" && mail.subject === "Код для входа — Node Studio").at(-1).content.match(/\b\d{6}\b/)[0];
    const developer = await api.request("auth/verify", { code }, challenge);
    assert.equal(developer.statusCode, 200);
    for (const action of actions) assert.equal((await api.request("action", action, developer, { "x-csrf-token": "invalid" })).statusCode, 403);
    assert.equal(f.store.get("projects", "one").status, "active");
    assert.equal(f.store.get("orders", order.id).deletedAt, undefined);
    assert.equal(f.store.get("quotes", quote.id).deletedAt, undefined);
    for (const action of [removeQuote(quote), removeOrder(order), actions[0]]) assert.equal((await api.request("action", action, developer)).statusCode, 200);
  } finally { f.close(); }
});

test("project deletion confirms its name, preserves history and hides every project entry point", async () => {
  const f = portalFixture();
  try {
    const developer = f.login("developer").session; const order = await createOrder(f);
    const project = f.store.get("projects", "one");
    f.store.put("orders", { ...order, projectId: project.id, status: "provisioning" });
    await createQuote(f);
    f.store.enqueue("provision", { orderId: order.id });
    f.store.enqueue("assistant", { threadId: "chat-one", messageId: "message-one" });
    f.store.enqueue("github.repository.create", { projectId: project.id, developerId: developer.viewer.id });
    f.store.enqueue("mail", { orderId: order.id, email: order.email, content: "must not send" });
    f.store.put("briefLinks", { id: "telegram", threadId: "telegram", projectId: "one", createdBy: developer.viewer.id, updatedAt: project.createdAt });
    f.store.put("conversations", { ...f.store.get("conversations", "chat-one"), id: "telegram", kind: "telegram", projectId: "", telegramId: "123" });
    f.store.put("clientBriefs", { id: "telegram", threadId: "telegram", requestId: "brief-request", status: "failed", messageCount: 0, sourceHash: "source", stale: false, updatedAt: project.createdAt });
    const action = { type: "project.delete", projectId: project.id, confirmation: "wrong" };
    await assert.rejects(f.service.action(developer, action), { status: 400 });
    assert.equal(f.store.get("projects", project.id).status, "active");
    await f.service.action(developer, { ...action, confirmation: project.name });
    const archived = f.store.get("projects", project.id);
    await f.service.action(developer, { ...action, confirmation: project.name });
    assert.deepEqual(f.store.get("projects", project.id), archived, "repeating deletion preserves the first audit entry");
    assert.equal(archived.archivedBy, developer.viewer.id); assert.ok(archived.archivedAt);
    assert.equal(archived.repo, project.repo);
    for (const role of ["client", "developer", "admin"]) {
      const snapshot = await f.service.snapshot(f.login(role).session, project.id);
      for (const kind of ["projects", "tasks", "stages", "commits", "quotes", "orders", "briefProjects", "projectBriefs"]) assert.ok(!snapshot[kind].some(item => item.id === project.id || item.projectId === project.id), `${role}: ${kind}`);
      assert.ok(!snapshot.messages.some(message => message.threadId === "chat-one"));
      if (role === "developer") {
        assert.ok(snapshot.conversations.some(thread => thread.id === "telegram"), "intake remains independent of the deleted project");
        assert.equal(snapshot.clientBriefs.find(brief => brief.id === "telegram").projectId, undefined);
      }
    }
    await f.service.workJobs();
    assert.equal(f.sent.length, 0); assert.equal(f.repositories.length, 0);
    assert.throws(() => f.service.checkout(order.checkoutToken), { status: 404 });
    await assert.rejects(f.service.action(developer, { type: "project.repository.create", projectId: project.id }), { status: 404 });
    await assert.rejects(f.service.action(f.login("client").session, { type: "message", threadId: "chat-one", text: "Hidden" }), { status: 404 });
    assert.equal(f.store.get("messages", "message-one").text, "Личная переписка one");
    assert.equal(f.store.get("projects", "two").status, "active");
  } finally { f.close(); }
});

test("deletion during GitHub synchronization prevents a late request from creating an estimate", async () => {
  const f = portalFixture();
  try {
    const developer = f.login("developer").session; const original = f.integrations.issues;
    let resume; let started;
    const ready = new Promise(resolve => { started = resolve; });
    f.integrations.issues = async repo => { started(); await new Promise(resolve => { resume = resolve; }); return original(repo); };
    const pending = f.service.action(developer, { type: "quote.create", projectId: "one", number: 2, baseKopecks: 100_000 });
    await ready;
    await f.service.action(developer, { type: "project.delete", projectId: "one", confirmation: "one" });
    resume();
    await assert.rejects(pending, { status: 404 });
    assert.equal(f.store.all("quotes", "one").length, 0); assert.equal(f.store.all("paymentNotifications").length, 0);
    assert.equal(f.store.get("projects", "one").status, "archived");
  } finally { f.close(); }
});

test("pending order deletion revokes old links and cancels both notification channels", async () => {
  const f = portalFixture();
  try {
    const order = await createOrder(f); const developer = f.login("developer").session;
    await f.service.action(developer, removeOrder(order));
    const removed = f.store.get("orders", order.id);
    assert.ok(removed.deletedAt); assert.equal(removed.deletedBy, developer.viewer.id); assert.equal(removed.status, "pending");
    await f.service.action(developer, removeOrder(order)); assert.deepEqual(f.store.get("orders", order.id), removed);
    const api = portalApi(f);
    for (const path of ["checkout", "checkout/pay"]) assert.equal((await api.request(path, { token: order.checkoutToken, outcome: "succeeded" })).statusCode, 404);
    await assert.rejects(f.service.action(developer, { type: "order.provision", orderId: order.id }), { status: 404 });
    assert.ok(!(await f.service.snapshot(developer)).orders.some(item => item.id === order.id));
    for (const channel of ["mail", "telegram"]) await f.service.paymentNotifications.deliver(`payment:order:${order.id}:requested`, channel, "late");
    await f.service.workJobs(); assert.equal(f.sent.length, 0);
    assert.ok(f.store.all("paymentNotifications").every(item => item.cancelledAt));
    assert.equal(f.store.db.prepare("SELECT count(*) n FROM jobs").get().n, 0);
    await assert.rejects(f.service.action(developer, { type: "order.delete", orderId: "missing" }), { status: 404 });
  } finally { f.close(); }
});

test("deleting an already paid order retains its amount, project, client access and conversations", async () => {
  const f = portalFixture();
  try {
    const order = await createOrder(f); const developer = f.login("developer").session;
    f.service.payOrder(order.checkoutToken, "succeeded");
    await f.service.action(developer, { type: "order.provision", orderId: order.id }); await f.service.workJobs();
    const provisioned = f.store.get("orders", order.id); assert.equal(provisioned.status, "ready");
    const project = f.store.get("projects", provisioned.projectId); const client = f.store.user(project.clientId);
    const password = f.store.db.prepare("SELECT password FROM users WHERE id=?").get(client.id).password;
    const thread = f.store.all("conversations").find(thread => thread.projectId === project.id); const messages = f.store.all("messages").filter(item => item.threadId === thread.id);
    await f.service.action(developer, removeOrder(order)); await f.service.workJobs();
    const removed = f.store.get("orders", order.id); assert.equal(removed.totalKopecks, order.totalKopecks); assert.equal(removed.status, "ready");
    assert.deepEqual(f.store.get("projects", project.id), project); assert.deepEqual(f.store.user(client.id), client);
    assert.equal(f.store.db.prepare("SELECT password FROM users WHERE id=?").get(client.id).password, password);
    assert.deepEqual(f.store.all("messages").filter(item => item.threadId === thread.id), messages);
    assert.ok((await f.service.snapshot(f.login("client").session)).projects.some(item => item.id === project.id));
    assert.ok(!(await f.service.snapshot(developer)).orders.some(item => item.id === order.id));
  } finally { f.close(); }
});

test("deleting a paid order before provisioning cancels account creation and late access jobs", async () => {
  const f = portalFixture();
  try {
    const order = await createOrder(f); const developer = f.login("developer").session;
    f.service.payOrder(order.checkoutToken, "succeeded");
    await f.service.action(developer, { type: "order.provision", orderId: order.id });
    await f.service.action(developer, removeOrder(order));
    // A previously queued copy or retry also rechecks the persisted tombstone.
    f.store.enqueue("provision", { orderId: order.id }); f.store.enqueue("mail", { orderId: order.id, email: order.email, content: "must not decrypt" });
    await f.service.workJobs();
    assert.equal(f.store.get("orders", order.id).status, "provisioning");
    assert.equal(f.store.get("projects", `project:${order.id}`), undefined); assert.equal(f.sent.length, 0);
    assert.equal(f.store.db.prepare("SELECT count(*) n FROM jobs").get().n, 0);
  } finally { f.close(); }
});

test("deleted wish estimates cannot be paid or delivered; a new estimate gets a new identity", async () => {
  const f = portalFixture();
  try {
    const quote = await createQuote(f); const developer = f.login("developer").session;
    await f.service.action(developer, removeQuote(quote));
    for (const role of ["client", "developer"]) assert.ok(!(await f.service.snapshot(f.login(role).session)).quotes.some(item => item.id === quote.id));
    await assert.rejects(f.service.action(f.login("client").session, { type: "quote.pay", quoteId: quote.id, outcome: "succeeded" }), { status: 404 });
    await f.service.paymentNotifications.deliver(`payment:quote:${quote.id}:requested`, "mail", "late");
    await f.service.workJobs(); assert.equal(f.sent.length, 0);
    const replacement = await createQuote(f); assert.notEqual(replacement.id, quote.id);
    assert.equal(f.store.get("quotes", quote.id).status, "pending", "deletion retains the original historical state");
    assert.ok((await f.service.snapshot(f.login("client").session)).quotes.some(item => item.id === replacement.id));
  } finally { f.close(); }
});

test("paid wish deletion retains entitlement, prevents duplicate charging and isolates repository scopes", async () => {
  const f = portalFixture();
  try {
    const quote = await createQuote(f); const developer = f.login("developer").session;
    await f.service.action(f.login("client").session, { type: "quote.pay", quoteId: quote.id, outcome: "succeeded" });
    f.store.put("tasks", { ...f.store.all("tasks", "one").find(item => item.number === 2), id: "other-source", subprojectId: "backend" });
    await f.service.action(developer, removeQuote(quote));
    const paid = f.store.get("quotes", quote.id); assert.equal(paid.status, "paid"); assert.equal(paid.totalKopecks, 130_000);
    for (const role of ["client", "developer"]) {
      const snapshot = await f.service.snapshot(f.login(role).session);
      assert.ok(!snapshot.quotes.some(item => item.id === quote.id));
      assert.equal(snapshot.tasks.find(item => item.projectId === "one" && item.number === 2 && !item.subprojectId).paid, true);
      assert.equal(snapshot.tasks.find(item => item.id === "other-source").paid, false);
    }
    await assert.rejects(f.service.action(developer, { type: "quote.create", projectId: "one", number: 2, baseKopecks: 200_000 }), { status: 409 });
    await assert.rejects(f.service.action(developer, { type: "task.include", projectId: "one", number: 2 }), { status: 409 });
    await f.service.action(developer, { type: "task.status", projectId: "one", number: 2, status: "in_progress" });
    assert.equal(f.store.all("tasks", "one").find(item => item.number === 2 && !item.subprojectId).status, "in_progress");
    await f.service.workJobs(); assert.equal(f.sent.length, 0);
  } finally { f.close(); }
});

test("deletion rechecks assigned developer ownership and rolls back payment tombstone with its outbox", async () => {
  const f = portalFixture();
  try {
    const quote = await createQuote(f); const developer = f.login("developer").session; const project = f.store.get("projects", "one");
    f.store.put("projects", { ...project, developerId: "another-developer" });
    await assert.rejects(f.service.action(developer, removeQuote(quote)), { status: 403 });
    await assert.rejects(f.service.action(developer, { type: "project.delete", projectId: "one", confirmation: "one" }), { status: 403 });
    f.store.put("projects", project);
    f.store.db.exec("CREATE TRIGGER fail_deletion BEFORE DELETE ON jobs BEGIN SELECT RAISE(ABORT,'outbox unavailable'); END");
    await assert.rejects(f.service.action(developer, removeQuote(quote)), /outbox unavailable/);
    assert.equal(f.store.get("quotes", quote.id).deletedAt, undefined);
    assert.equal(f.store.get("paymentNotifications", `payment:quote:${quote.id}:requested`).cancelledAt, undefined);
    assert.equal(f.store.db.prepare("SELECT count(*) n FROM jobs").get().n, 2);
  } finally { f.close(); }
});
