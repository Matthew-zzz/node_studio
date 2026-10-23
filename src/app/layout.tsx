import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { Notifications } from "@/components/ui/notifications";
import { createMetadata, siteOrigin } from "@/lib/metadata";
import "@/styles/tokens.css";
import "@/styles/base.css";
import "@/features/home/styles/experience.css";
import "@/features/projects/styles/screenshots.css";
import "@/features/home/styles/hero-atmosphere.css";
import "@/features/services/styles/services.css";
import "@/styles/responsive.css";
import "@/styles/responsive-layout.css";
import "@/features/projects/styles/project-stories.css";
import "@/styles/globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(siteOrigin),
  ...createMetadata(),
  icons: {
    icon: [{ url: "/assets/brand/favicon-32.png?v=transparent", type: "image/png", sizes: "32x32" }],
    apple: [{ url: "/assets/brand/apple-touch-icon.png?v=transparent", sizes: "180x180", type: "image/png" }],
  },
};

export const viewport: Viewport = { themeColor: "#060916", colorScheme: "dark", width: "device-width", initialScale: 1, viewportFit: "cover" };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ru">
      <body>
        {children}
        <Notifications />
      </body>
    </html>
  );
}
