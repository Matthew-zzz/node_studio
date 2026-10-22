"use client";

import { useEffect, useRef, useSyncExternalStore } from "react";
import { telegramWebApp } from "@/features/telegram/model/web-app";

export const TELEGRAM_READY_EVENT = "node-telegram-ready";
function subscribe(listener: () => void) {
  window.addEventListener(TELEGRAM_READY_EVENT, listener);
  return () => window.removeEventListener(TELEGRAM_READY_EVENT, listener);
}
export function useTelegram() { return useSyncExternalStore(subscribe, telegramWebApp, () => null); }

export function useTelegramBack(visible: boolean, onBack: () => void) {
  const app = useTelegram();
  const handler = useRef(onBack);
  useEffect(() => { handler.current = onBack; }, [onBack]);
  useEffect(() => {
    if (!app?.isVersionAtLeast("6.1")) return;
    const back = () => handler.current();
    app.BackButton.onClick(back);
    if (visible) app.BackButton.show(); else app.BackButton.hide();
    return () => { app.BackButton.offClick(back); app.BackButton.hide(); };
  }, [app, visible]);
}
