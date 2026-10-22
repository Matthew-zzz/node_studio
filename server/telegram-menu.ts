import type { PortalConfig } from "./config.ts";
import { PortalError } from "./store.ts";
import { responseError, transportError } from "./upstream-error.ts";

/** Operator-only configuration. This changes the menu and never sends chat messages. */
export async function configureTelegramMenu(config: PortalConfig, request: typeof fetch = fetch) {
  if (!config.telegramToken || !config.origin.startsWith("https://")) throw new PortalError(503, "Для Mini App нужны Telegram-токен и HTTPS-домен.");
  async function call<T>(method: string, body = {}): Promise<T> {
    const url = `https://api.telegram.org/bot${config.telegramToken}/${method}`;
    let response;
    try { response = await request(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), redirect: "error", signal: AbortSignal.timeout(45_000) }); }
    catch (error) { throw transportError(url, error); }
    if (!response.ok) throw await responseError(url, response);
    const value = await response.json() as { ok: boolean; result: T };
    if (!value.ok) throw new PortalError(502, "Telegram не подтвердил настройку меню.");
    return value.result;
  }
  const bot = await call<{ username: string; is_bot: boolean }>("getMe");
  if (!bot.is_bot || !bot.username) throw new PortalError(502, "Не удалось проверить Telegram-бота.");
  const menu = { type: "web_app", text: "Кабинет", web_app: { url: `${config.origin}/miniapp/` } };
  await call("setChatMenuButton", { menu_button: menu });
  const actual = await call<typeof menu>("getChatMenuButton");
  if (actual.type !== "web_app" || actual.web_app?.url !== menu.web_app.url || actual.text !== menu.text) throw new PortalError(502, "Telegram сохранил другое меню. Проверьте настройки бота.");
  return { bot: bot.username, menu: actual };
}
