import type { Metadata } from "next";
import { site } from "@/config/site";

const configuredOrigin = new URL(process.env.SITE_ORIGIN || "https://node-studio.ru");
if (!["https:", "http:"].includes(configuredOrigin.protocol)) {
  throw new Error("SITE_ORIGIN must be an HTTP(S) URL");
}
export const siteOrigin = configuredOrigin.origin;

export function createMetadata({ title = site.title, description = site.description, path = "/" }: { title?: string; description?: string; path?: string } = {}): Metadata {
  return {
    title,
    description,
    alternates: { canonical: path },
    openGraph: {
      type: "website",
      locale: "ru_RU",
      siteName: "Node Studio",
      title,
      description,
      url: path,
      images: [{ url: "/assets/og-cover.svg", width: 1200, height: 630, alt: "Node Studio — разработка, автоматизация и ИИ" }],
    },
    twitter: { card: "summary_large_image", title, description, images: ["/assets/og-cover.svg"] },
  };
}
