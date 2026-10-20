import type { Metadata } from "next";
import { Portal } from "@/features/portal/components/portal";

export const metadata: Metadata = { title: "Демонстрация кабинета — NODO Studio", robots: { index: false, follow: false }, alternates: { canonical: "/cabinet-demo/" } };
export default function CabinetDemoPage() { return <Portal demo />; }
