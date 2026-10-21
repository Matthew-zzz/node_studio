import type { ReactNode } from "react";
import { Header } from "@/components/layout/header";
import { Footer } from "@/components/layout/footer";
import { SiteEffects } from "@/components/layout/site-effects";
import { site } from "@/config/site";
import { siteOrigin } from "@/lib/metadata";

export default function MarketingLayout({ children }: { children: ReactNode }) {
  const schema = { "@context": "https://schema.org", "@type": "ProfessionalService", name: "Node Studio", description: site.description, url: siteOrigin, areaServed: { "@type": "Country", name: "Россия" }, sameAs: [site.contact], knowsAbout: ["Веб-разработка", "Автоматизация процессов", "Telegram-боты", "RAG"] };
  return (
    <>
      <Header />
      <main id="main">{children}</main>
      <Footer />
      <SiteEffects />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(schema).replaceAll("<", "\\u003c") }} />
    </>
  );
}
