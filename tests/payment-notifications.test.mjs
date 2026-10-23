import assert from "node:assert/strict";
import test from "node:test";
import { backup } from "node:sqlite";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PortalService } from "../server/service.ts";
import { PortalStore } from "../server/store.ts";
import { portalFixture } from "./helpers/portal-fixture.mjs";

function telegram(f, overrides = {}) {
  return f.store.put("conversations", { id: "telegram:123", kind: "telegram", projectId: "", name: "Клиент", username: "client_v",
    email: "", telegramId: "123", ownerId: null, ownerName: null, handoffRequested: false, updatedAt: new Date().toISOString(), ...overrides });
}
async function createOrder(f, overrides = {}) {
  await f.service.action(f.login("curator").session, { type: "order.create", order: { projectName: "Каталог <NS> & магазин", clientName: "Клиент",
    email: "new@example.test", username: "@CLIENT_V", brief: "Согласованное ТЗ, не включать в уведомление", totalKopecks: 500001, ...overrides } });
  return f.store.all("orders").at(-1);
}
const jobs = f => f.store.db.prepare("SELECT * FROM jobs WHERE kind LIKE 'payment.notify.%' ORDER BY id").all();
const retry = store => store.db.prepare("UPDATE jobs SET available=0 WHERE kind LIKE 'payment.notify.%'").run();
const mails = f => f.sent.filter(item => item.subject?.endsWith("— Node Studio"));
const messages = f => f.sent.filter(item => item.chatId);

test("creating a payment link queues both channels atomically and sends the server amount, project and working checkout URL", async () => {
  const f = portalFixture();
  try {
    telegram(f); const order = await createOrder(f);
    assert.equal(jobs(f).length, 2); assert.equal(f.sent.length, 0);
    assert.ok(jobs(f).every(job => !job.payload.includes(order.checkoutToken) && !job.payload.includes(order.brief)));
    await f.service.workJobs();
    assert.equal(mails(f).length, 1); assert.equal(messages(f).length, 1);
    const mail = mails(f)[0]; const message = messages(f)[0];
    assert.equal(mail.email, order.email); assert.equal(message.chatId, "123");
    assert.equal(mail.subject, "Ссылка на оплату — Node Studio");
    for (const content of [mail.content, message.text]) {
      assert.ok(content.includes(order.projectName)); assert.ok(content.includes("5 000,01"));
      assert.ok(content.includes(`${f.config.origin}/checkout/#${order.checkoutToken}`));
      assert.ok(content.includes("Тестовая оплата")); assert.ok(!content.includes(order.brief));
    }
    assert.ok(message.html.includes("&lt;NS&gt; &amp; магазин")); assert.ok(!message.html.includes("<NS>"));
    assert.equal(f.store.get("orders", order.id).status, "pending", "delivery is separate from project provisioning");
    assert.ok(f.store.get("messages", `payment:order:${order.id}:requested`));
    await f.service.workJobs(); assert.equal(f.sent.length, 2);
  } finally { f.close(); }
});

test("success notifies both channels once, while failure and duplicate confirmation do not create another event", async () => {
  const f = portalFixture();
  try {
    telegram(f); const order = await createOrder(f); await f.service.workJobs();
    f.service.payOrder(order.checkoutToken, "failed"); assert.equal(jobs(f).length, 0);
    f.service.payOrder(order.checkoutToken, "succeeded"); f.service.payOrder(order.checkoutToken, "succeeded");
    assert.equal(jobs(f).length, 2); await f.service.workJobs();
    assert.equal(mails(f).length, 2); assert.equal(messages(f).length, 2);
    const receipt = mails(f)[1]; assert.equal(receipt.subject, "Оплата прошла успешно — Node Studio");
    assert.ok(receipt.content.includes("5 000,01")); assert.ok(receipt.content.includes("Деньги не списывались"));
    assert.ok(!receipt.content.includes(order.checkoutToken));
    assert.equal(f.store.get("orders", order.id).status, "paid");
    f.service.payOrder(order.checkoutToken, "succeeded"); await f.service.workJobs();
    assert.equal(f.sent.length, 4); assert.equal(jobs(f).length, 0);
    assert.equal(f.store.all("paymentNotifications").length, 2);
  } finally { f.close(); }
});

test("an outbox failure rolls back creation or successful payment instead of losing a notification", async () => {
  const f = portalFixture();
  try {
    const enqueue = f.store.enqueue.bind(f.store);
    f.store.enqueue = (kind, ...args) => { if (kind === "payment.notify.telegram") throw new Error("Disk failure"); return enqueue(kind, ...args); };
    await assert.rejects(createOrder(f), /Disk failure/);
    assert.equal(f.store.all("orders").length, 0); assert.equal(f.store.all("paymentNotifications").length, 0); assert.equal(jobs(f).length, 0);
    f.store.enqueue = enqueue; telegram(f); const order = await createOrder(f); await f.service.workJobs();
    f.store.enqueue = () => { throw new Error("Disk failure"); };
    assert.throws(() => f.service.payOrder(order.checkoutToken, "succeeded"), /Disk failure/);
    assert.equal(f.store.get("orders", order.id).status, "pending"); assert.equal(f.store.all("paymentNotifications").length, 1);
    f.store.enqueue = enqueue; f.service.payOrder(order.checkoutToken, "succeeded"); assert.equal(jobs(f).length, 2);
  } finally { f.close(); }
});

test("mail retries survive a database restart without repeating Telegram or changing the provider idempotency key", async () => {
  const f = portalFixture(); const directory = await mkdtemp(join(tmpdir(), "node-payment-notices-")); let store;
  try {
    telegram(f); const order = await createOrder(f); const attempts = [];
    f.integrations.mail = async (_email, _content, deliveryId) => { attempts.push(deliveryId); throw new Error("Mail unavailable"); };
    await f.service.workJobs(); assert.equal(messages(f).length, 1); assert.equal(jobs(f).length, 1); assert.equal(jobs(f)[0].attempts, 1);
    await backup(f.store.db, join(directory, "portal.sqlite")); store = new PortalStore(join(directory, "portal.sqlite"));
    f.integrations.mail = async (email, content, deliveryId, subject) => { attempts.push(deliveryId); f.sent.push({ email, content, deliveryId, subject }); };
    const recovered = new PortalService(store, f.integrations, f.config); retry(store); await recovered.workJobs();
    assert.equal(messages(f).length, 1); assert.equal(mails(f).length, 1); assert.equal(attempts.length, 2); assert.equal(attempts[0], attempts[1]);
    assert.equal(store.get("orders", order.id).status, "pending");
    assert.ok(store.get("paymentNotifications", `payment:order:${order.id}:requested`).mailSentAt);
    assert.equal(store.db.prepare("SELECT count(*) AS n FROM jobs").get().n, 0);
  } finally { store?.close(); f.close(); await rm(directory, { recursive: true, force: true }); }
});

test("missing Telegram contact does not block mail, is reported to the admin, and can be delivered after the client starts the bot", async () => {
  const f = portalFixture();
  try {
    const order = await createOrder(f); await f.service.workJobs();
    assert.equal(mails(f).length, 1); assert.equal(messages(f).length, 0); assert.equal(jobs(f).length, 1);
    const error = f.service.errors.query({ state: "all" }).events.find(event => event.operation === "payment.notify.telegram");
    assert.ok(error.explanation.includes("Telegram-диалог")); assert.equal(error.projectName, order.projectName);
    assert.ok(!JSON.stringify(error).includes(order.checkoutToken));
    telegram(f); retry(f.store); await f.service.workJobs();
    assert.equal(mails(f).length, 1); assert.equal(messages(f).length, 1); assert.equal(jobs(f).length, 0);
    assert.equal(f.store.get("paymentNotifications", `payment:order:${order.id}:requested`).telegramId, "123");
  } finally { f.close(); }
});

test("Telegram is pinned to the original numeric chat ID even when usernames change or are reused", async () => {
  const f = portalFixture();
  try {
    const original = telegram(f); const order = await createOrder(f); await f.service.workJobs();
    f.store.put("conversations", { ...original, username: "renamed" });
    telegram(f, { id: "telegram:456", telegramId: "456" });
    f.service.payOrder(order.checkoutToken, "succeeded"); await f.service.workJobs();
    assert.deepEqual(messages(f).map(message => message.chatId), ["123", "123"]);
  } finally { f.close(); }
});

test("ambiguous or conflicting contacts never receive a client's payment link", async () => {
  for (const conflict of ["duplicate", "email"]) {
    const f = portalFixture();
    try {
      telegram(f, conflict === "email" ? { email: "someone-else@example.test" } : {});
      if (conflict === "duplicate") telegram(f, { id: "telegram:456", telegramId: "456" });
      await createOrder(f); await f.service.workJobs();
      assert.equal(messages(f).length, 0); assert.equal(mails(f).length, 1); assert.equal(jobs(f).length, 1);
    } finally { f.close(); }
  }
});

test("wish estimates notify the project client, include the 30% total and send success only for its authorized current quote", async () => {
  const f = portalFixture();
  try {
    telegram(f, { email: f.users.client.email });
    const developer = f.login("developer").session; const client = f.login("client").session;
    await f.service.action(developer, { type: "quote.create", projectId: "one", number: 2, baseKopecks: 100001 });
    const quote = f.store.all("quotes")[0]; await f.service.workJobs();
    assert.equal(mails(f)[0].email, f.users.client.email); assert.ok(mails(f)[0].content.includes("1 300,01"));
    assert.ok(messages(f)[0].text.includes("Пожелание")); assert.ok(messages(f)[0].text.includes("раздел «Чат»"));
    await assert.rejects(f.service.action(f.login("other").session, { type: "quote.pay", quoteId: quote.id, outcome: "succeeded" }), { status: 404 });
    await f.service.action(client, { type: "quote.pay", quoteId: quote.id, outcome: "failed" }); assert.equal(jobs(f).length, 0);
    await f.service.action(client, { type: "quote.pay", quoteId: quote.id, outcome: "succeeded", totalKopecks: 1 });
    await f.service.action(client, { type: "quote.pay", quoteId: quote.id, outcome: "succeeded" }); await f.service.workJobs();
    assert.equal(mails(f).length, 2); assert.equal(messages(f).length, 2); assert.ok(mails(f)[1].content.includes("1 300,01"));
    assert.equal(f.store.get("quotes", quote.id).totalKopecks, 130001); assert.equal(f.store.get("quotes", quote.id).status, "paid");
  } finally { f.close(); }
});

test("superseded or already paid links are suppressed before delivery and disabled payments never notify success", async () => {
  const f = portalFixture();
  try {
    telegram(f, { email: f.users.client.email }); const developer = f.login("developer").session;
    for (const baseKopecks of [10000, 20000]) await f.service.action(developer, { type: "quote.create", projectId: "one", number: 2, baseKopecks });
    await f.service.workJobs(); assert.equal(mails(f).length, 1); assert.ok(mails(f)[0].content.includes("260"));
    const outdated = f.store.all("quotes").find(quote => quote.status === "superseded");
    await assert.rejects(f.service.action(f.login("client").session, { type: "quote.pay", quoteId: outdated.id, outcome: "succeeded" }), { status: 409 });
    const order = await createOrder(f); f.service.payOrder(order.checkoutToken, "succeeded"); await f.service.workJobs();
    assert.ok(!mails(f).some(mail => mail.content.includes(order.checkoutToken)), "a fast payment does not send an obsolete payment request");
    const other = await createOrder(f, { projectName: "Disabled" }); f.config.mockPayments = false;
    assert.throws(() => f.service.payOrder(other.checkoutToken, "succeeded"), { status: 503 });
    assert.equal(f.store.get("orders", other.id).status, "pending");
    assert.equal(f.store.get("paymentNotifications", `payment:order:${other.id}:succeeded`), undefined);
  } finally { f.close(); }
});
