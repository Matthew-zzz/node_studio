import type { Metadata } from "next";
import { Recovery } from "@/features/portal/components/recovery";

export const metadata: Metadata = { title: "Восстановление доступа — Node Studio", robots: { index: false, follow: false }, referrer: "no-referrer", alternates: { canonical: "/recover/" } };
export default function RecoveryPage() { return <Recovery />; }
