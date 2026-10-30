import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { Notifications } from "@/components/ui/notifications";
import { createMetadata, siteOrigin } from "@/lib/metadata";
import "@/styles/fonts.css";
import "@/styles/tokens.css";
import "@/styles/base.css";
import "@/styles/responsive.css";
import "@/styles/responsive-layout.css";
import "@/styles/globals.css";
import "@/styles/marketing-theme.css";
import "@/styles/errors.css";

export const metadata: Metadata = {
  metadataBase: new URL(siteOrigin),
  ...createMetadata(),
  icons: {
    icon: [
      { url: "/favicon.ico", type: "image/x-icon", sizes: "16x16 32x32 48x48" },
      { url: "/favicon-32x32.png", type: "image/png", sizes: "32x32" },
      { url: "/favicon-96x96.png", type: "image/png", sizes: "96x96" },
    ],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
};

export const viewport: Viewport = { themeColor: "#060916", colorScheme: "dark", width: "device-width", initialScale: 1, viewportFit: "cover" };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ru">
      <head>
        <link rel="preload" href="/assets/fonts/manrope-v20/cyrillic.woff2" as="font" type="font/woff2" crossOrigin="anonymous" />
        <link rel="preload" href="/assets/fonts/manrope-v20/latin.woff2" as="font" type="font/woff2" crossOrigin="anonymous" />
      </head>
      <body>
        {children}
        <Notifications />
      </body>
    </html>
  );
}
