import { createHmac } from "node:crypto";

/** Telegram protocol fixture: no real bot credentials or messages. */
export function telegramLaunch(token, id, extra = {}) {
  const data = new URLSearchParams({ auth_date: String(Math.floor(Date.now() / 1000)), query_id: `fixture-${id}`, user: JSON.stringify({ id, first_name: `User ${id}` }), ...extra });
  const secret = createHmac("sha256", "WebAppData").update(token).digest();
  data.set("hash", createHmac("sha256", secret).update([...data.entries()].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([key, value]) => `${key}=${value}`).join("\n")).digest("hex"));
  return data.toString();
}
export const telegramHeaders = (token, id, extra) => ({ "x-portal-client": "miniapp", "x-telegram-context": "telegram", "x-telegram-init-data": telegramLaunch(token, id, extra) });

export async function browserTelegramHeaders(page) {
  const data = await page.evaluate(() => window.Telegram?.WebApp?.initData ?? "");
  return { "X-Portal-Client": "miniapp", "X-Telegram-Context": data ? "telegram" : "browser", ...(data ? { "X-Telegram-Init-Data": data } : {}) };
}
