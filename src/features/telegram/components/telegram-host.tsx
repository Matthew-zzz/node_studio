"use client";

import Script from "next/script";
import { useEffect, useRef } from "react";
import type { MouseEvent as ReactMouseEvent, ReactNode } from "react";
import { setHostTheme, useTheme } from "@/lib/use-theme";
import { TELEGRAM_READY_EVENT, useTelegram } from "@/features/telegram/lib/use-telegram";
import styles from "./telegram.module.css";

export function TelegramHost({ children }: { children: ReactNode }) {
  const app = useTelegram();
  const { theme } = useTheme();
  const viewport = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!app) return;
    const updateTheme = () => setHostTheme(app.colorScheme);
    updateTheme(); app.onEvent("themeChanged", updateTheme);
    app.ready(); app.expand();
    return () => { app.offEvent("themeChanged", updateTheme); setHostTheme(undefined); };
  }, [app]);
  useEffect(() => {
    let focusFrame: number | undefined;
    const resize = () => {
      const heights = [window.innerHeight, window.visualViewport?.height, app?.viewportStableHeight].filter((height): height is number => typeof height === "number" && Number.isFinite(height) && height > 0);
      viewport.current?.style.setProperty("--node-viewport-height", `${Math.min(...heights)}px`);
      const keyboard = Boolean(document.activeElement?.matches("input, textarea, select") && Math.min(...heights) < 500);
      if (viewport.current) viewport.current.dataset.keyboard = String(keyboard);
      if (focusFrame !== undefined) cancelAnimationFrame(focusFrame);
      if (keyboard) focusFrame = requestAnimationFrame(() => { if (document.activeElement instanceof HTMLElement) document.activeElement.scrollIntoView({ block: "nearest", inline: "nearest" }); });
    };
    resize(); window.addEventListener("resize", resize); window.visualViewport?.addEventListener("resize", resize);
    document.addEventListener("focusin", resize); document.addEventListener("focusout", resize);
    app?.onEvent("viewportChanged", resize);
    return () => { if (focusFrame !== undefined) cancelAnimationFrame(focusFrame); window.removeEventListener("resize", resize); window.visualViewport?.removeEventListener("resize", resize); document.removeEventListener("focusin", resize); document.removeEventListener("focusout", resize); app?.offEvent("viewportChanged", resize); };
  }, [app]);
  useEffect(() => {
    if (!app?.isVersionAtLeast("6.1")) return;
    const background = theme === "dark" ? "#14141b" : "#f6f6f9";
    app.setHeaderColor(background); app.setBackgroundColor(background);
    if (app.isVersionAtLeast("7.10")) app.setBottomBarColor(theme === "dark" ? "#1c1c26" : "#ffffff");
  }, [app, theme]);
  function openLink(event: ReactMouseEvent<HTMLDivElement>) {
    if (!app?.isVersionAtLeast("6.1") || event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const link = event.target instanceof Element ? event.target.closest<HTMLAnchorElement>("a[href]") : null;
    if (!link || link.download) return;
    const url = new URL(link.href);
    if (!["https:", "http:"].includes(url.protocol) || url.origin === location.origin) return;
    event.preventDefault();
    if (url.protocol === "https:" && url.hostname === "t.me") app.openTelegramLink(url.href); else app.openLink(url.href);
  }
  return (
    <div ref={viewport} className={styles.viewport} onClick={openLink}>
      <Script src="https://telegram.org/js/telegram-web-app.js?64" strategy="afterInteractive" onReady={() => { window.dispatchEvent(new Event(TELEGRAM_READY_EVENT)); }} />
      {children}
    </div>
  );
}
