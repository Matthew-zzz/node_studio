import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { TelegramHost } from "@/features/telegram/components/telegram-host";

export const metadata: Metadata = { title: "Node — Telegram", robots: { index: false, follow: false }, referrer: "no-referrer", alternates: { canonical: "/miniapp/" } };
export const viewport: Viewport = { width: "device-width", initialScale: 1, viewportFit: "cover", interactiveWidget: "resizes-content", colorScheme: "light dark", themeColor: [{ media: "(prefers-color-scheme: light)", color: "#f6f6f9" }, { media: "(prefers-color-scheme: dark)", color: "#14141b" }] };
export default function MiniAppLayout({ children }: { children: ReactNode }) { return <TelegramHost>{children}</TelegramHost>; }
