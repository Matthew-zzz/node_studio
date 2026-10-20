import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { Header } from "@/components/layout/header";
import { Footer } from "@/components/layout/footer";
import { SiteEffects } from "@/components/layout/site-effects";
import { site } from "@/config/site";
import { createMetadata, siteOrigin } from "@/lib/metadata";
import "@/styles/tokens.css";
import "@/styles/base.css";
import "@/features/home/styles/experience.css";
import "@/features/projects/styles/screenshots.css";
import "@/features/home/styles/hero-atmosphere.css";
import "@/features/services/styles/services.css";
import "@/features/home/styles/marquees.css";
import "@/styles/responsive.css";
import "@/styles/responsive-layout.css";
import "@/features/projects/styles/project-stories.css";
import "@/styles/globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(siteOrigin),
  ...createMetadata(),
  icons: { icon: [{ url: "/assets/favicon.svg", type: "image/svg+xml" }] },
};

export const viewport: Viewport = { themeColor: "#10121b", colorScheme: "dark", width: "device-width", initialScale: 1, viewportFit: "cover" };

export default function RootLayout({ children }: { children: ReactNode }) {
  const schema = { "@context": "https://schema.org", "@type": "ProfessionalService", name: "NODO Studio", description: site.description, url: siteOrigin, areaServed: { "@type": "Country", name: "Россия" }, sameAs: [site.contact], knowsAbout: ["Веб-разработка", "Автоматизация процессов", "Telegram-боты", "RAG"] };

  return (
    <html lang="ru">
      <body>
        <Header />
        <main id="main">{children}</main>
        <Footer />
        <SiteEffects />
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(schema).replaceAll("<", "\\u003c") }} />
      </body>
    </html>
  );
}
