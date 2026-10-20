import { createHmac, timingSafeEqual } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { PortalService } from "./service.ts";
import type { PortalConfig } from "./config.ts";
import { PortalError } from "./store.ts";
import { object, passwordInput, text } from "./validation.ts";
import { EMPTY_SNAPSHOT } from "../src/features/portal/model/types.ts";

export function equalSecret(actual: string, expected: string): boolean {
  const left = Buffer.from(actual); const right = Buffer.from(expected);
  return right.length > 0 && left.length === right.length && timingSafeEqual(left, right);
}

async function readBody(request: IncomingMessage): Promise<Buffer> {
  const parts: Buffer[] = []; let size = 0;
  for await (const part of request) {
    size += part.length;
    if (size > 131_072) throw new PortalError(413, "Слишком длинное сообщение.");
    parts.push(Buffer.from(part));
  }
  return Buffer.concat(parts);
}

export function createPortalHandler(service: PortalService, config: PortalConfig) {
  const publicLimits = new Map<string, { count: number; since: number }>();
  const cookieName = config.secureCookies ? "__Host-nodo_session" : "nodo_session";
  function cookie(value: string, age: number) {
    return `${cookieName}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${age}${config.secureCookies ? "; Secure" : ""}`;
  }
  return async function handle(request: IncomingMessage, response: ServerResponse): Promise<void> {
    response.setHeader("Cache-Control", "no-store");
    response.setHeader("Content-Type", "application/json; charset=utf-8");
    response.setHeader("X-Content-Type-Options", "nosniff");
    response.setHeader("Referrer-Policy", "no-referrer");
    function send(status: number, value: unknown) { response.statusCode = status; response.end(JSON.stringify(value)); }
    try {
      const url = new URL(request.url ?? "/", config.origin);
      const path = url.pathname.replace(/\/$/, "");
      if (request.method === "GET" && path === "/api/portal/health") { send(200, { status: "ok", service: "node-studio-portal", version: 1 }); return; }
      if (!["GET", "POST"].includes(request.method ?? "")) throw new PortalError(405, "Метод не поддерживается.");
      const isWebhook = ["/api/portal/webhooks/github", "/api/portal/webhooks/telegram"].includes(path);
      if (request.method === "POST" && !isWebhook && request.headers.origin !== config.origin) throw new PortalError(403, "Проверьте адрес сайта и повторите запрос.");
      let raw: Buffer = Buffer.alloc(0); let body: Record<string, unknown> = {};
      if (request.method === "POST") {
        if (!request.headers["content-type"]?.startsWith("application/json")) throw new PortalError(415, "Ожидался JSON.");
        raw = await readBody(request);
        try { body = object(JSON.parse(raw.toString("utf8"))); } catch { throw new PortalError(400, "Некорректный JSON."); }
      }
      if (isWebhook && request.method === "POST") {
        if (path.endsWith("/github")) {
          const signature = `sha256=${createHmac("sha256", config.githubWebhookSecret).update(raw).digest("hex")}`;
          if (!config.githubWebhookSecret || !equalSecret(String(request.headers["x-hub-signature-256"] ?? ""), signature)) throw new PortalError(403, "Неверная подпись.");
          if (request.headers["x-github-event"] !== "ping") service.receiveGitHub(text(request.headers["x-github-delivery"], 200), body);
        } else {
          if (!equalSecret(String(request.headers["x-telegram-bot-api-secret-token"] ?? ""), config.telegramWebhookSecret)) throw new PortalError(403, "Неверная подпись.");
          service.receiveTelegram(body);
        }
        send(202, { accepted: true }); return;
      }
      if (request.method === "POST" && ["/api/portal/login", "/api/portal/checkout", "/api/portal/checkout/pay"].includes(path)) {
        // Only a loopback proxy can reach this listener; Nginx overwrites this header.
        const address = String(request.headers["x-real-ip"] ?? request.socket.remoteAddress ?? "unknown");
        const key = `${address}:${path}`; const epoch = Date.now(); const limit = publicLimits.get(key);
        if (limit && epoch - limit.since < 60_000 && limit.count >= 30) throw new PortalError(429, "Слишком много запросов. Повторите через минуту.");
        publicLimits.set(key, { count: limit && epoch - limit.since < 60_000 ? limit.count + 1 : 1, since: limit && epoch - limit.since < 60_000 ? limit.since : epoch });
        if (publicLimits.size > 10000) for (const [key, limit] of publicLimits) if (epoch - limit.since > 60_000) publicLimits.delete(key);
        if (path === "/api/portal/login") {
          const result = service.store.login(text(body.email, 254), passwordInput(body.password), address);
          response.setHeader("Set-Cookie", cookie(result.token, 604800));
          send(200, await service.snapshot(result.session)); return;
        }
        const token = text(body.token, 64);
        if (path.endsWith("/pay")) service.payOrder(token, body.outcome);
        const order = service.checkout(token);
        send(200, { projectName: order.projectName, totalKopecks: order.totalKopecks, status: order.status, provider: "mock" }); return;
      }
      const sessionToken = request.headers.cookie?.split(";").map(part => part.trim()).find(part => part.startsWith(`${cookieName}=`))?.slice(cookieName.length + 1) ?? "";
      const session = service.store.session(sessionToken);
      if (!session && request.method === "GET" && path === "/api/portal/snapshot") { send(200, EMPTY_SNAPSHOT); return; }
      if (!session) throw new PortalError(401, "Войдите в кабинет.");
      if (request.method === "GET" && path === "/api/portal/snapshot") {
        const pages = Number(url.searchParams.get("pages") || 1);
        if (!Number.isInteger(pages) || pages < 1 || pages > 1000) throw new PortalError(400, "Некорректная страница истории.");
        send(200, await service.snapshot(session, url.searchParams.get("project") || "", pages)); return;
      }
      if (request.method !== "POST") throw new PortalError(404, "Страница не найдена.");
      if (!equalSecret(String(request.headers["x-csrf-token"] ?? ""), session.csrf)) throw new PortalError(403, "Обновите страницу и повторите запрос.");
      if (path === "/api/portal/logout") {
        service.store.logout(session); response.setHeader("Set-Cookie", cookie("", 0)); send(200, { ok: true }); return;
      }
      if (path === "/api/portal/password") {
        service.store.changePassword(session, passwordInput(body.current), passwordInput(body.replacement));
        send(200, await service.snapshot(session)); return;
      }
      if (path === "/api/portal/action") { await service.action(session, body); send(200, { ok: true }); return; }
      throw new PortalError(404, "Страница не найдена.");
    } catch (error) {
      send(error instanceof PortalError ? error.status : 500, { error: error instanceof PortalError ? error.message : "Не удалось выполнить запрос. Попробуйте ещё раз." });
    }
  };
}
