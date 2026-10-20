export type PaymentKind = "project" | "wish";

export interface PaymentQuote {
  readonly reference: string;
  readonly kind: PaymentKind;
  readonly baseKopecks: number;
  readonly markupKopecks: number;
  readonly totalKopecks: number;
  readonly currency: "RUB";
}

/** Parse decimal rubles without introducing floating point errors into money. */
export function parseRubles(value: string): number | null {
  const normalized = value.trim().replace(/[ \u00a0\u202f]/g, "");
  const match = /^(\d+)(?:[.,](\d{1,2}))?$/.exec(normalized);
  if (!match) return null;
  const whole = Number(match[1]);
  const fraction = Number((match[2] ?? "").padEnd(2, "0"));
  const kopecks = whole * 100 + fraction;
  return Number.isSafeInteger(kopecks) && kopecks > 0 ? kopecks : null;
}

export function createPaymentQuote(reference: string, baseKopecks: number, kind: PaymentKind): PaymentQuote {
  // Multiplication and rounding remain exact within the safe integer range.
  if (!reference.trim() || (kind !== "wish" && kind !== "project")
      || !Number.isSafeInteger(baseKopecks) || baseKopecks <= 0
      || baseKopecks > Math.floor(Number.MAX_SAFE_INTEGER / 130)) {
    throw new RangeError("Укажите корректную стоимость в рублях.");
  }
  const markupKopecks = kind === "wish" ? Math.round(baseKopecks * 30 / 100) : 0;
  return Object.freeze({
    reference, kind, baseKopecks, markupKopecks,
    totalKopecks: baseKopecks + markupKopecks, currency: "RUB",
  });
}

export function formatRubles(kopecks: number): string {
  return new Intl.NumberFormat("ru-RU", {
    style: "currency", currency: "RUB",
    minimumFractionDigits: kopecks % 100 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(kopecks / 100);
}
