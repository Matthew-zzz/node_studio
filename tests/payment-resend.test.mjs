import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { portalFixture, fixturePassword } from "./helpers/portal-fixture.mjs";
import { portalApi } from "./helpers/http.mjs";
import { PaymentUpdates } from "../src/features/portal/model/payment-updates.ts";

function setup() {
  const f = portalFixture();
  f.store.put("conversations", { id: "telegram:123", kind: "telegram", projectId: "", name: "Клиент", username: "client_v", email: "client@example.test", telegramId: "123", ownerId: null, ownerName: null, handoffRequested: false, updatedAt: new Date().toISOString() });
  return f;
}
async function order(f) {
  await f.service.action(f.login("developer").session, { type: "order.create", order: { projectName: "Каталог <Node>", clientName: "Клиент", email: "client@example.test", username: "client_v", brief: "Согласованное ТЗ", totalKopecks: 100_001 } });
  return f.store.all("orders").at(-1);
}
const resend = (payment, channel = "both", source = "order") => ({ type: "payment.resend", source, sourceId: payment.id, channel, requestId: randomUUID() });
const jobs = f => f.store.db.prepare("SELECT * FROM jobs WHERE kind LIKE 'payment.notify.%'").all();
const mails = f => f.sent.filter(item => item.subject?.startsWith("Ссылка на оплату"));
const telegrams = f => f.sent.filter(item => item.chatId);
const state = (f, payment, source = "order") => f.service.paymentNotifications.state().find(item => item.source === source && item.sourceId === payment.id);
const expireCooldown = f => { for (const item of f.store.all("paymentNotifications").filter(item => item.requestId)) f.store.put("paymentNotifications", { ...item, createdAt: new Date(Date.now() - 31_000).toISOString() }); };

test("manual resend delivers the same checkout and amount with a fresh mail key, durable audit and independent statuses", async () => {
  const f = setup();
  try {
    const payment = await order(f); await f.service.workJobs(); const initial = f.store.get("paymentNotifications", `payment:order:${payment.id}:requested`);
    const developer = f.login("developer").session; const action = resend(payment);
    await f.service.action(developer, { ...action, totalKopecks: 1, email: "attacker@example.test", telegramId: "999" });
    assert.equal(jobs(f).length, 2); assert.equal(mails(f).length, 1); assert.equal(state(f, payment).mail.state, "queued");
    assert.equal(state(f, payment).mail.requestId, action.requestId);
    await f.service.workJobs(); assert.equal(mails(f).length, 2); assert.equal(telegrams(f).length, 2);
    assert.equal(mails(f)[1].email, payment.email); assert.equal(telegrams(f)[1].chatId, "123");
    assert.equal(mails(f)[1].content, mails(f)[0].content); assert.notEqual(mails(f)[1].deliveryId, mails(f)[0].deliveryId);
    assert.ok(mails(f)[1].content.includes(payment.checkoutToken)); assert.ok(telegrams(f)[1].html.includes("&lt;Node&gt;"));
    assert.deepEqual(f.store.get("paymentNotifications", initial.id), initial, "original delivery history remains immutable");
    assert.deepEqual(f.store.get("orders", payment.id), payment, "resending never creates or changes an invoice");
    assert.equal(state(f, payment).mail.state, "sent"); assert.equal(state(f, payment).telegram.state, "sent");
    const audit = f.store.all("paymentNotifications").find(item => item.requestId === action.requestId);
    assert.equal(audit.requestedBy, developer.viewer.id); assert.equal(audit.sequence, 1);
  } finally { f.close(); }
});

test("idempotency, channel binding and per-channel cooldown prevent duplicated sends across retries and tabs", async () => {
  const f = setup();
  try {
    const payment = await order(f); await f.service.workJobs(); const developer = f.login("developer").session;
    const action = resend(payment, "mail"); await f.service.action(developer, action); await f.service.action(developer, action);
    assert.equal(jobs(f).length, 1); await f.service.workJobs();
    await f.service.action(developer, action); assert.equal(jobs(f).length, 0);
    await assert.rejects(f.service.action(developer, { ...action, channel: "telegram" }), { status: 409 });
    await assert.rejects(f.service.action(developer, resend(payment, "mail")), { status: 429 });
    await f.service.action(developer, resend(payment, "telegram")); await f.service.workJobs();
    assert.equal(mails(f).length, 2); assert.equal(telegrams(f).length, 2);
    expireCooldown(f); await f.service.action(developer, resend(payment, "mail")); await f.service.workJobs();
    assert.equal(mails(f).length, 3); assert.equal(telegrams(f).length, 2);
  } finally { f.close(); }
});

test("resending replaces queued deliveries only in selected channels and atomically rolls back on an outbox failure", async () => {
  const f = setup();
  try {
    const payment = await order(f); const originalId = `payment:order:${payment.id}:requested`; const developer = f.login("developer").session;
    const enqueue = f.store.enqueue.bind(f.store); f.store.enqueue = () => { throw new Error("Disk failure"); };
    await assert.rejects(f.service.action(developer, resend(payment, "mail")), /Disk failure/);
    assert.equal(jobs(f).length, 2); assert.equal(f.store.get("paymentNotifications", originalId).mailCancelledAt, undefined);
    f.store.enqueue = enqueue; const action = resend(payment, "mail"); await f.service.action(developer, action);
    assert.equal(jobs(f).length, 2); assert.ok(f.store.get("paymentNotifications", originalId).mailCancelledAt);
    assert.equal(f.store.get("paymentNotifications", originalId).telegramCancelledAt, undefined);
    await f.service.workJobs(); assert.equal(mails(f).length, 1); assert.equal(telegrams(f).length, 1);
    assert.equal(state(f, payment).mail.requestId, action.requestId); assert.equal(state(f, payment).telegram.requestId, undefined);
    await f.service.paymentNotifications.deliver(originalId, "mail", "stale"); assert.equal(mails(f).length, 1);
  } finally { f.close(); }
});

test("a channel already sending cannot be duplicated; an independent channel remains available", async () => {
  const f = setup();
  try {
    const payment = await order(f); const developer = f.login("developer").session; const id = `payment:order:${payment.id}:requested`;
    f.store.db.prepare("UPDATE jobs SET running=1 WHERE id=?").run(`${id}:telegram`);
    await assert.rejects(f.service.action(developer, resend(payment)), { status: 409 }); assert.equal(f.store.all("paymentNotifications").length, 1);
    assert.equal(state(f, payment).telegram.state, "sending");
    await f.service.action(developer, resend(payment, "mail")); assert.equal(jobs(f).length, 2);
    assert.equal(f.store.get("paymentNotifications", id).telegramCancelledAt, undefined);
  } finally { f.close(); }
});

test("missing Telegram does not block mail, retries keep one provider key and terminal failures can be resent", async () => {
  const f = setup();
  try {
    const payment = await order(f); await f.service.workJobs(); const developer = f.login("developer").session;
    const original = f.integrations.telegram; f.integrations.telegram = async () => { throw new Error("Telegram unavailable"); };
    const action = resend(payment); await f.service.action(developer, action); await f.service.workJobs();
    assert.equal(state(f, payment).mail.state, "sent"); assert.equal(state(f, payment).telegram.state, "retrying");
    f.store.db.prepare("UPDATE jobs SET attempts=8 WHERE kind='payment.notify.telegram'").run(); assert.equal(state(f, payment).telegram.state, "failed");
    expireCooldown(f); f.integrations.telegram = original;
    const retry = resend(payment, "telegram"); await f.service.action(developer, retry); await f.service.workJobs();
    assert.equal(state(f, payment).telegram.state, "sent"); assert.equal(state(f, payment).telegram.requestId, retry.requestId); assert.equal(mails(f).length, 2);
    assert.equal(jobs(f).length, 0);
  } finally { f.close(); }
});

test("a late Telegram contact can receive the resend without repeating email or changing its pinned recipient", async () => {
  const f = setup();
  try {
    const thread = f.store.get("conversations", "telegram:123"); f.store.db.prepare("DELETE FROM records WHERE kind='conversations' AND id=?").run(thread.id);
    const payment = await order(f); const developer = f.login("developer").session;
    await f.service.action(developer, resend(payment)); await f.service.workJobs();
    assert.equal(mails(f).length, 1); assert.equal(state(f, payment).telegram.state, "retrying"); assert.ok(state(f, payment).telegram.hint.includes("@node_studio_bot"));
    f.store.put("conversations", thread); expireCooldown(f);
    await f.service.action(developer, resend(payment, "telegram")); await f.service.workJobs();
    f.store.put("conversations", { ...thread, username: "renamed" });
    f.store.put("conversations", { ...thread, id: "telegram:456", telegramId: "456", username: "client_v", email: "" }); expireCooldown(f);
    await f.service.action(developer, resend(payment, "telegram")); await f.service.workJobs();
    assert.deepEqual(telegrams(f).map(item => item.chatId), ["123", "123"]); assert.equal(mails(f).length, 1);
  } finally { f.close(); }
});

test("paid, superseded, deleted and archived payments are never resent and invalidate already queued reminders", async () => {
  for (const outcome of ["paid", "deleted", "archived"]) {
    const f = setup();
    try {
      let payment = await order(f); const developer = f.login("developer").session;
      if (outcome === "archived") { payment = f.store.put("orders", { ...payment, projectId: "one" }); }
      await f.service.action(developer, resend(payment));
      if (outcome === "paid") f.service.payOrder(payment.checkoutToken, "succeeded");
      if (outcome === "deleted") await f.service.action(developer, { type: "order.delete", orderId: payment.id });
      if (outcome === "archived") await f.service.action(developer, { type: "project.delete", projectId: "one", confirmation: "one" });
      await assert.rejects(f.service.action(developer, resend(payment)), { status: outcome === "paid" ? 409 : 404 });
      await f.service.workJobs(); assert.equal(mails(f).length, 0); assert.ok(!telegrams(f).some(item => item.text.includes(payment.checkoutToken)));
    } finally { f.close(); }
  }
  const f = setup();
  try {
    const developer = f.login("developer").session; await f.service.action(developer, { type: "quote.create", projectId: "one", number: 2, baseKopecks: 100_001 }); const quote = f.store.all("quotes")[0];
    await f.service.action(developer, resend(quote, "both", "quote"));
    await f.service.action(developer, { type: "quote.create", projectId: "one", number: 2, baseKopecks: 200_000 });
    await assert.rejects(f.service.action(developer, resend(quote, "both", "quote")), { status: 409 }); await f.service.workJobs();
    assert.equal(mails(f).length, 1); assert.ok(mails(f)[0].content.includes("2 600"));
  } finally { f.close(); }
});

test("resend API requires email proof, developer role, CSRF and ownership; metadata never reaches other roles", async () => {
  const f = setup();
  try {
    const payment = await order(f); const action = resend(payment); const api = portalApi(f);
    assert.equal((await api.request("action", action)).statusCode, 401);
    for (const role of ["client", "other", "admin", "temporary"]) { const account = await api.login(role, fixturePassword); assert.equal((await api.request("action", action, account)).statusCode, 403); assert.deepEqual((await f.service.snapshot(f.login(role).session)).paymentDeliveries, []); }
    const account = await api.login("developer", fixturePassword); assert.equal((await api.request("action", action, account, { "x-csrf-token": "bad" })).statusCode, 403);
    assert.equal((await api.request("action", { ...action, source: "other" }, account)).statusCode, 400);
    assert.equal((await api.request("action", { ...action, channel: "sms" }, account)).statusCode, 400);
    assert.equal((await api.request("action", { ...action, requestId: "invalid" }, account)).statusCode, 400);
    assert.equal((await api.request("action", action, account)).statusCode, 200);
    const snapshot = (await api.request("snapshot", undefined, account)).body;
    assert.equal(snapshot.paymentDeliveries.length, 1); assert.ok(!JSON.stringify(snapshot.paymentDeliveries).includes(payment.checkoutToken));
    f.store.put("orders", { ...payment, projectId: "one" }); f.store.put("projects", { ...f.store.get("projects", "one"), developerId: "another" });
    await assert.rejects(f.service.action(f.login("developer").session, resend(payment)), { status: 403 });
  } finally { f.close(); }
});

test("completion notifications follow actual channel results, survive partial delivery and clear across account changes", async () => {
  const f = setup();
  try {
    const payment = await order(f); await f.service.workJobs(); const developer = f.login("developer").session;
    const updates = new PaymentUpdates(); const action = resend(payment); updates.track(await f.service.snapshot(developer), action);
    await f.service.action(developer, action); assert.deepEqual(updates.observe(await f.service.snapshot(developer)), []);
    f.integrations.telegram = async () => { throw new Error("Offline"); }; await f.service.workJobs();
    assert.deepEqual(updates.observe(await f.service.snapshot(developer)), [], "a delivered email is not success for both channels");
    f.integrations.telegram = async () => {}; f.store.db.prepare("UPDATE jobs SET available=0").run(); await f.service.workJobs();
    const snapshot = await f.service.snapshot(developer); assert.deepEqual(updates.observe(snapshot), [{ success: true, message: "Ссылка на оплату повторно отправлена на почту и в Telegram." }]);
    assert.deepEqual(updates.observe(snapshot), [], "a cached result never repeats its toast");
    const fresh = resend(payment, "mail"); updates.track(snapshot, fresh); updates.observe(await f.service.snapshot(f.login("client").session));
    assert.deepEqual(updates.observe(snapshot), []);
  } finally { f.close(); }
});
