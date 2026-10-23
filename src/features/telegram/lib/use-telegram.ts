"use client";

import { useEffect, useRef, useSyncExternalStore } from "react";
import { telegramWebApp } from "@/features/telegram/model/web-app";
import { miniappContextVersion } from "@/features/telegram/lib/auth-context";

export const TELEGRAM_READY_EVENT = "node-telegram-ready";
function subscribe(listener: () => void) {
  window.addEventListener(TELEGRAM_READY_EVENT, listener);
  return () => window.removeEventListener(TELEGRAM_READY_EVENT, listener);
}
export function useTelegram() { return useSyncExternalStore(subscribe, telegramWebApp, () => null); }

function subscribeContext(listener: () => void) {
  window.addEventListener(TELEGRAM_READY_EVENT, listener); window.addEventListener("focus", listener); window.addEventListener("pageshow", listener);
  document.addEventListener("visibilitychange", listener);
  const timer = setInterval(listener, 1000);
  return () => { clearInterval(timer); window.removeEventListener(TELEGRAM_READY_EVENT, listener); window.removeEventListener("focus", listener); window.removeEventListener("pageshow", listener); document.removeEventListener("visibilitychange", listener); };
}
export function useTelegramContext() { return useSyncExternalStore(subscribeContext, miniappContextVersion, () => "pending"); }

export function useTelegramBack(visible: boolean, onBack: () => void) {
  const app = useTelegram();
  const handler = useRef(onBack);
  useEffect(() => { handler.current = onBack; }, [onBack]);
  useEffect(() => {
    if (!app?.isVersionAtLeast("6.1")) return;
    const back = () => handler.current();
    app.BackButton.onClick(back);
    const update = () => { if (visible || document.querySelector("dialog[open]")) app.BackButton.show(); else app.BackButton.hide(); };
    const observer = new MutationObserver(update);
    observer.observe(document.body, { attributes: true, subtree: true, attributeFilter: ["open"] });
    update();
    return () => { observer.disconnect(); app.BackButton.offClick(back); app.BackButton.hide(); };
  }, [app, visible]);
}
