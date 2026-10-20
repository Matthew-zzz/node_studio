import type { Metadata } from "next";
import { PaymentDemo } from "@/features/payments/components/payment-demo";

export const metadata: Metadata = {
  title: "Тестовая оплата — NODO Studio",
  description: "Демонстрация оплаты в рублях: успешный платёж, ошибка и отмена.",
  robots: { index: false, follow: false },
  alternates: { canonical: "/payment-demo/" },
};

export default function PaymentDemoPage() {
  return <PaymentDemo />;
}
