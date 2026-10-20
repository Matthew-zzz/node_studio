import type { Metadata } from "next";
import { Portal } from "@/features/portal/components/portal";

export const metadata: Metadata = { title: "Личный кабинет — NODO Studio", robots: { index: false, follow: false }, alternates: { canonical: "/cabinet/" } };
export default function CabinetPage() { return <Portal />; }
