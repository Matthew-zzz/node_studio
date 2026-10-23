import { createHmac, timingSafeEqual } from "node:crypto";
import type { IncomingHttpHeaders } from "node:http";
import type { PortalConfig } from "./config.ts";
import { PortalError } from "./store.ts";

export interface RequestAuthContext { scope: string; sessionCookie: string; challengeCookie: string }
const MAX_AGE = 12 * 60 * 60;

/** Telegram's signed launch identifies a cookie namespace; email verification still grants access. */
export function requestAuthContext(headers: IncomingHttpHeaders, config: PortalConfig): RequestAuthContext {
  const prefix = config.secureCookies ? "__Host-" : "";
  if (headers["x-portal-client"] !== "miniapp") return { scope: "web", sessionCookie: `${prefix}nodo_session`, challengeCookie: `${prefix}node_challenge` };
  const raw = headers["x-telegram-init-data"];
  if (raw === undefined && headers["x-telegram-context"] !== "browser" && headers["x-telegram-context"] !== "telegram") throw new PortalError(401, "Обновите приложение: закройте и откройте миниапп заново.");
  let scope = "miniapp:browser"; let suffix = "browser";
  if (raw !== undefined || headers["x-telegram-context"] === "telegram") {
    if (!config.telegramToken) throw new PortalError(503, "Подтверждение профиля Telegram временно недоступно.");
    if (typeof raw !== "string" || !raw || raw.length > 8192) throw new PortalError(401, "Откройте миниапп заново из Telegram.");
    const data = new URLSearchParams(raw);
    if (data.size > 64 || [...data.keys()].some(key => data.getAll(key).length !== 1)) throw new PortalError(401, "Не удалось подтвердить профиль Telegram.");
    const hash = data.get("hash") ?? ""; data.delete("hash");
    const secret = createHmac("sha256", "WebAppData").update(config.telegramToken).digest();
    const check = [...data.entries()].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([key, value]) => `${key}=${value}`).join("\n");
    const expected = createHmac("sha256", secret).update(check).digest();
    if (!/^[a-f0-9]{64}$/i.test(hash) || !timingSafeEqual(expected, Buffer.from(hash, "hex"))) throw new PortalError(401, "Не удалось подтвердить профиль Telegram.");
    const date = Number(data.get("auth_date")); const epoch = Math.floor(Date.now() / 1000);
    if (!Number.isSafeInteger(date) || date <= 0 || date > epoch + 60 || epoch - date > MAX_AGE) throw new PortalError(401, "Сеанс Telegram истёк. Откройте миниапп заново.");
    let user: { id?: unknown } | null;
    try { user = JSON.parse(data.get("user") ?? "null"); } catch { throw new PortalError(401, "Не удалось подтвердить профиль Telegram."); }
    if (!user || typeof user.id !== "number" || !Number.isSafeInteger(user.id) || user.id <= 0) throw new PortalError(401, "Не удалось подтвердить профиль Telegram.");
    suffix = createHmac("sha256", secret).update(`node-miniapp-user:${user.id}`).digest("hex");
    scope = `telegram:${suffix}`;
  }
  return { scope, sessionCookie: `${prefix}node_miniapp_session_v2_${suffix}`, challengeCookie: `${prefix}node_miniapp_challenge_v2_${suffix}` };
}
