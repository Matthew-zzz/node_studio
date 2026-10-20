import type { PaymentQuote } from "@/features/payments/model/payment";

export type MockPaymentOutcome = "succeeded" | "failed";

export interface MockPaymentResult {
  readonly provider: "mock";
  readonly status: MockPaymentOutcome;
  readonly quote: PaymentQuote;
}

/** Browser-only simulation. Its result is never proof that an order was paid. */
export function simulatePayment(
  quote: PaymentQuote,
  outcome: MockPaymentOutcome,
  signal: AbortSignal,
  delayMs = 650,
): Promise<MockPaymentResult> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(new DOMException("Тестовая оплата отменена", "AbortError"));
      return;
    }
    const abort = () => {
      clearTimeout(timer);
      reject(new DOMException("Тестовая оплата отменена", "AbortError"));
    };
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", abort);
      resolve({ provider: "mock", status: outcome, quote });
    }, delayMs);
    signal.addEventListener("abort", abort, { once: true });
  });
}
