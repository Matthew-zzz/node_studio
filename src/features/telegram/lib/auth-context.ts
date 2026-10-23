import { telegramWebApp } from "@/features/telegram/model/web-app";

/** Presentation keys reset the UI only; the server verifies initData before trusting the ID. */
export function miniappContext() {
  const app = telegramWebApp(); const raw = app?.initData ?? "";
  let identity = "browser";
  if (app) {
    identity = "telegram-unverified";
    try { const user = JSON.parse(new URLSearchParams(raw).get("user") ?? "null") as { id?: unknown } | null; if (user && Number.isSafeInteger(user.id)) identity = `telegram-${user.id}`; } catch { /* Invalid launches are rejected by the server. */ }
  }
  const headers: Record<string, string> = { "X-Portal-Client": "miniapp", "X-Telegram-Context": app ? "telegram" : "browser" };
  if (app) { headers["X-Telegram-Context"] = "telegram"; if (raw) headers["X-Telegram-Init-Data"] = raw; }
  return { identity, version: app ? `telegram:${raw}` : "browser", headers, available: !app || Boolean(raw) };
}

export function miniappContextVersion() { return miniappContext().version; }
