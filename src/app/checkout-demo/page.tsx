import type { Metadata } from "next";
import { CheckoutPage } from "@/features/portal/components/checkout";

export const metadata: Metadata = { title: "Демонстрация оплаты проекта — NODO Studio", robots: { index: false, follow: false }, referrer: "no-referrer", alternates: { canonical: "/checkout-demo/" } };
export default function Page() { return <CheckoutPage demo />; }
