import assert from "node:assert/strict";
import test from "node:test";
import { createPaymentQuote, parseRubles } from "../src/features/payments/model/payment.ts";
import { simulatePayment } from "../src/features/payments/lib/mock-payment.ts";

test("wish quote adds 30% in kopecks; primary project retains its base price", () => {
  const wish = createPaymentQuote("wish-1", 1_000_000, "wish");
  assert.equal(wish.markupKopecks, 300_000);
  assert.equal(wish.totalKopecks, 1_300_000);
  assert.equal(wish.currency, "RUB");
  const project = createPaymentQuote("project-1", 1_000_000, "project");
  assert.equal(project.markupKopecks, 0);
  assert.equal(project.totalKopecks, 1_000_000);
});

test("fractional rubles and half-kopeck markup round to a whole kopeck", () => {
  assert.equal(parseRubles("10 000,50"), 1_000_050);
  assert.equal(parseRubles("0.29"), 29);
  assert.equal(createPaymentQuote("small", 5, "wish").totalKopecks, 7);
  assert.equal(createPaymentQuote("decimal", 29, "wish").totalKopecks, 38);
});

test("invalid, negative, unsafe and over-precision amounts cannot create a quote", () => {
  for (const value of ["", "0", "-10", "1.001", "1e4", "Infinity", "text", "9".repeat(40)]) {
    assert.equal(parseRubles(value), null, value);
  }
  for (const amount of [0, -100, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER]) {
    assert.throws(() => createPaymentQuote("invalid", amount, "wish"), RangeError);
  }
  assert.throws(() => createPaymentQuote("", 100, "wish"), RangeError);
  assert.throws(() => createPaymentQuote("invalid-kind", 100, "other"), RangeError);
});

test("mock success preserves the quote and is explicitly marked as a simulation", async () => {
  const quote = createPaymentQuote("test-order", 10_000, "wish");
  const result = await simulatePayment(quote, "succeeded", new AbortController().signal, 0);
  assert.equal(result.provider, "mock");
  assert.equal(result.status, "succeeded");
  assert.equal(result.quote, quote);
  assert.equal(result.quote.totalKopecks, 13_000, "markup is not applied a second time");
  assert.ok(Object.isFrozen(result.quote));
});

test("a failed payment does not become a success", async () => {
  const quote = createPaymentQuote("failure", 100, "project");
  const result = await simulatePayment(quote, "failed", new AbortController().signal, 0);
  assert.equal(result.status, "failed");
});

test("cancelling an in-flight mock prevents a late successful confirmation", async () => {
  const controller = new AbortController();
  const pending = simulatePayment(createPaymentQuote("cancel", 100, "wish"), "succeeded", controller.signal);
  const rejected = assert.rejects(pending, { name: "AbortError" });
  controller.abort();
  await rejected;
  await assert.rejects(
    simulatePayment(createPaymentQuote("already-canceled", 100, "wish"), "succeeded", controller.signal),
    { name: "AbortError" },
  );
});
