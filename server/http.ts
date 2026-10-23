import { createHmac, timingSafeEqual } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { PortalService } from "./service.ts";
import type { PortalConfig } from "./config.ts";
import { PortalError, id } from "./store.ts";
import { object, optionalRole, text } from "./validation.ts";
import { EMPTY_SNAPSHOT } from "../src/features/portal/model/types.ts";
import { withErrorContext, updateErrorContext } from "./error-context.ts";
import type { ErrorProvider } from "../src/features/portal/model/errors.ts";
import { requestAuthContext } from "./telegram-auth-context.ts";
import type { RequestAuthContext } from "./telegram-auth-context.ts";

function requestAuthentication(request: IncomingMessage, service: PortalService, config: PortalConfig, verifiedContext?: RequestAuthContext) {
  let context: RequestAuthContext;
  try { context = verifiedContext ?? requestAuthContext(request.headers, config); } catch { return; }
  const name = context.sessionCookie;
  const cookieToken = request.headers.cookie?.split(";").map(part => part.trim()).find(part => part.startsWith(`${name}=`))?.slice(name.length + 1) ?? "";
  const native = context.scope.startsWith("telegram:") && request.headers["x-portal-secure-storage"] === "1" ? request.headers["x-portal-session"] : undefined;
  for (const token of [cookieToken, typeof native === "string" ? native : ""]) {
    const session = service.auth.session(token, context.scope);
    if (session) return { session, token, restored: token !== cookieToken };
  }
}

export function requestSession(request: IncomingMessage, service: PortalService, config: PortalConfig) { return requestAuthentication(request, service, config)?.session; }

export function equalSecret(actual: string, expected: string): boolean {
  const left = Buffer.from(actual); const right = Buffer.from(expected);
  return right.length > 0 && left.length === right.length && timingSafeEqual(left, right);
}

async function readBody(request: IncomingMessage, limit = 131_072): Promise<Buffer> {
  const parts: Buffer[] = []; let size = 0;
  for await (const part of request) {
    size += part.length;
    if (size > limit) throw new PortalError(413, "Слишком длинное сообщение.");
    parts.push(Buffer.from(part));
  }
  return Buffer.concat(parts);
}

export function createPortalHandler(service: PortalService, config: PortalConfig) {
  const publicLimits = new Map<string, { count: number; since: number }>();
  function challengeCookie(request: IncomingMessage, challengeName: string) {
    return request.headers.cookie?.split(";").map(part => part.trim()).find(part => part.startsWith(`${challengeName}=`))?.slice(challengeName.length + 1) ?? "";
  }
  return async function handle(request: IncomingMessage, response: ServerResponse): Promise<void> {
    const requestId = id();
    function cookie(name: string, value: string, age: number) {
      const embedded = config.secureCookies && request.headers["x-portal-client"] === "miniapp";
      return `${name}=${value}; Path=/; HttpOnly; SameSite=${embedded ? "None" : "Lax"}; Max-Age=${age}${config.secureCookies ? "; Secure" : ""}${embedded ? "; Partitioned" : ""}`;
    }
    return withErrorContext({ requestId, method: request.method ?? "", source: "request", report: (error, context) => service.errors.capture(error, context) }, async () => {
      response.setHeader("X-Request-Id", requestId);
      response.setHeader("Cache-Control", "no-store");
      response.setHeader("Content-Type", "application/json; charset=utf-8");
      response.setHeader("X-Content-Type-Options", "nosniff");
      response.setHeader("Referrer-Policy", "no-referrer");
      function send(status: number, value: unknown) { response.statusCode = status; response.end(JSON.stringify(value)); }
      try {
        const url = new URL(request.url ?? "/", config.origin);
        const path = url.pathname.replace(/\/$/, "");
        updateErrorContext({ path });
        if (request.method === "GET" && path === "/api/portal/health") { send(200, { status: "ok", service: "node-studio-portal", version: 1, revision: config.revision }); return; }
        const context = requestAuthContext(request.headers, config);
        const cookieName = context.sessionCookie; const challengeName = context.challengeCookie;
        const authentication = requestAuthentication(request, service, config, context);
        const session = authentication?.session;
        const nativeStorage = context.scope.startsWith("telegram:") && request.headers["x-portal-secure-storage"] === "1";
        function sessionPayload<T>(value: T, current = session, token = authentication?.token ?? "") {
          return nativeStorage && current && token ? { ...value, nativeSession: { token, expiresAt: service.store.sessionDeadline(current) } } : value;
        }
        if (authentication?.restored) response.setHeader("Set-Cookie", cookie(cookieName, authentication.token, Math.max(0, Math.floor((service.store.sessionDeadline(authentication.session) - Date.now()) / 1000))));
        const challengeToken = challengeCookie(request, challengeName);
        updateErrorContext({ actor: session?.viewer ?? null });
        if (!["GET", "POST"].includes(request.method ?? "")) throw new PortalError(405, "Метод не поддерживается.");
        const isWebhook = ["/api/portal/webhooks/github", "/api/portal/webhooks/telegram"].includes(path);
        if (request.method === "POST" && !isWebhook && request.headers.origin !== config.origin) throw new PortalError(403, "Проверьте адрес сайта и повторите запрос.");
        let raw: Buffer = Buffer.alloc(0); let body: Record<string, unknown> = {};
        if (request.method === "POST") {
          if (!request.headers["content-type"]?.startsWith("application/json")) throw new PortalError(415, "Ожидался JSON.");
          raw = await readBody(request, path.startsWith("/api/portal/admin/agent") ? 524_288 : 131_072);
          try { body = object(JSON.parse(raw.toString("utf8"))); } catch { throw new PortalError(400, "Некорректный JSON."); }
          if (typeof body.type === "string" && /^[a-z.]{1,40}$/.test(body.type)) updateErrorContext({ operation: body.type });
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
        // Enable only behind the domain proxy, which overwrites X-Real-IP.
        const address = String((config.trustProxy ? request.headers["x-real-ip"] : undefined) ?? request.socket.remoteAddress ?? "unknown");
        if (request.method === "POST" && (["/api/portal/login", "/api/portal/profiles/add", "/api/portal/checkout", "/api/portal/checkout/pay", "/api/portal/errors/report"].includes(path) || path.startsWith("/api/portal/auth/"))) {
          const key = `${address}:${path}`; const epoch = Date.now(); const limit = publicLimits.get(key);
          if (limit && epoch - limit.since < 60_000 && limit.count >= 30) throw new PortalError(429, "Слишком много запросов. Повторите через минуту.");
          publicLimits.set(key, { count: limit && epoch - limit.since < 60_000 ? limit.count + 1 : 1, since: limit && epoch - limit.since < 60_000 ? limit.since : epoch });
          if (publicLimits.size > 10000) for (const [key, limit] of publicLimits) if (epoch - limit.since > 60_000) publicLimits.delete(key);
        }
        const metadata = { address, agent: String(request.headers["user-agent"] ?? "Неизвестное устройство").slice(0, 300) };
        async function authenticated(result: { token: string; session: NonNullable<typeof session> }) {
          const age = Math.max(0, Math.floor((service.store.sessionDeadline(result.session) - Date.now()) / 1000));
          response.setHeader("Set-Cookie", [cookie(cookieName, result.token, age), cookie(challengeName, "", 0)]);
          updateErrorContext({ actor: result.session.viewer });
          send(200, sessionPayload(await service.snapshot(result.session), result.session, result.token));
        }
        if (request.method === "GET" && path === "/api/portal/auth/challenge") {
          if (!challengeToken) { send(200, { challenge: null }); return; }
          try { send(200, { challenge: service.auth.pending(challengeToken, session, context.scope) }); }
          catch (error) { if (!(error instanceof PortalError)) throw error; response.setHeader("Set-Cookie", cookie(challengeName, "", 0)); send(200, { challenge: null }); }
          return;
        }
        if (request.method === "POST" && path === "/api/portal/auth/verify") {
          await authenticated(service.auth.verify(challengeToken, text(body.code, 6), metadata, session, context.scope)); return;
        }
        if (request.method === "POST" && path === "/api/portal/auth/resend") { const challenge = await service.auth.resend(challengeToken, session, context.scope); response.setHeader("Set-Cookie", cookie(challengeName, challengeToken, 600)); send(200, challenge); return; }
        if (request.method === "POST" && path === "/api/portal/auth/cancel") {
          if (challengeToken) service.auth.cancel(challengeToken, session, context.scope);
          response.setHeader("Set-Cookie", cookie(challengeName, "", 0)); send(200, { ok: true }); return;
        }
        if (request.method === "POST" && path === "/api/portal/auth/forgot") {
          throw new PortalError(410, "Для входа запросите код на почту.");
        }
        if (request.method === "POST" && path === "/api/portal/auth/recovery") { send(200, service.auth.recoveryDetails(text(body.token, 64))); return; }
        if (request.method === "POST" && path === "/api/portal/auth/revoke") {
          service.auth.revoke(text(body.token, 64));
          response.setHeader("Set-Cookie", [cookie(cookieName, "", 0), cookie(challengeName, "", 0)]); send(200, { ok: true }); return;
        }
        if (request.method === "POST" && path === "/api/portal/auth/reset") throw new PortalError(410, "Смена пароля отключена. Для входа используется код из письма.");
        if (request.method === "POST" && ["/api/portal/login", "/api/portal/checkout", "/api/portal/checkout/pay"].includes(path)) {
          if (path === "/api/portal/login") {
            const result = await service.auth.begin(text(body.email, 254), optionalRole(body.role), metadata, undefined, context.scope);
            if ("challenge" in result) { response.setHeader("Set-Cookie", cookie(challengeName, result.token, 600)); send(200, result.challenge); }
            else await authenticated(result);
            return;
          }
          const token = text(body.token, 64);
          if (path.endsWith("/pay")) service.payOrder(token, body.outcome);
          const order = service.checkout(token);
          send(200, { projectName: order.projectName, totalKopecks: order.totalKopecks, status: order.status, provider: config.mockPayments ? "mock" : "disabled" }); return;
        }
        if (request.method === "POST" && path === "/api/portal/errors/report") {
          if (session && !equalSecret(String(request.headers["x-csrf-token"] ?? ""), session.csrf)) throw new PortalError(403, "Обновите страницу и повторите запрос.");
          service.errors.browserReports(body.reports, session ?? null); send(202, { accepted: true }); return;
        }
        if (request.method === "GET" && path === "/api/portal/session") { send(200, sessionPayload({ viewer: session?.viewer ?? null, csrf: session?.csrf ?? "" })); return; }
        if (!session && request.method === "GET" && path === "/api/portal/snapshot") { send(200, EMPTY_SNAPSHOT); return; }
        if (!session) throw new PortalError(401, "Войдите в кабинет.");
        if (request.method === "GET" && path === "/api/portal/admin/staff") { send(200, service.staffState(session)); return; }
        if (request.method === "GET" && path === "/api/portal/admin/errors") { send(200, service.errorState(session, { state: (url.searchParams.get("state") ?? "open") as "open" | "resolved" | "all", provider: (url.searchParams.get("provider") ?? "all") as ErrorProvider | "all", search: url.searchParams.get("search") ?? "", page: Number(url.searchParams.get("page") ?? 1) })); return; }
        if (request.method === "GET" && path === "/api/portal/admin/agent") { send(200, service.agentState(session)); return; }
        if (request.method === "GET" && path === "/api/portal/admin/agent/document") { send(200, service.agentDocument(session, url.searchParams.get("id"))); return; }
        if (request.method === "GET" && path === "/api/portal/admin/agent/export") { send(200, service.agentExport(session)); return; }
        if (request.method === "GET" && path === "/api/portal/snapshot") {
          const pages = Number(url.searchParams.get("pages") || 1);
          if (!Number.isInteger(pages) || pages < 1 || pages > 1000) throw new PortalError(400, "Некорректная страница истории.");
          send(200, sessionPayload(await service.snapshot(session, url.searchParams.get("project") || "", pages))); return;
        }
        if (request.method !== "POST") throw new PortalError(404, "Страница не найдена.");
        if (!equalSecret(String(request.headers["x-csrf-token"] ?? ""), session.csrf)) throw new PortalError(403, "Обновите страницу и повторите запрос.");
        if (path === "/api/portal/admin/staff") { send(200, service.staffAction(session, body)); return; }
        if (path === "/api/portal/admin/errors") { service.errorAction(session, body); send(200, { ok: true }); return; }
        if (path === "/api/portal/admin/agent") { send(200, await service.agentAction(session, body)); return; }
        if (path === "/api/portal/profiles/add" || path === "/api/portal/profiles/switch") {
          const result = path.endsWith("/add")
            ? await service.auth.begin(text(body.email, 254), optionalRole(body.role), metadata, session, context.scope)
            : service.auth.switchProfile(session, text(body.userId, 100));
          if ("challenge" in result) { response.setHeader("Set-Cookie", cookie(challengeName, result.token, 600)); send(200, result.challenge); }
          else await authenticated(result);
          return;
        }
        if (path === "/api/portal/logout") {
          service.store.logout(session); response.setHeader("Set-Cookie", [cookie(cookieName, "", 0), cookie(challengeName, "", 0)]); send(200, { ok: true }); return;
        }
        if (path === "/api/portal/password") throw new PortalError(410, "Для входа используется код из письма.");
        if (path === "/api/portal/auth/logout-all") {
          service.auth.logoutAll(session);
          response.setHeader("Set-Cookie", [cookie(cookieName, "", 0), cookie(challengeName, "", 0)]); send(200, { ok: true }); return;
        }
        if (path === "/api/portal/action") { await service.action(session, body); send(200, { ok: true }); return; }
        throw new PortalError(404, "Страница не найдена.");
      } catch (error) {
        const errorId = service.errors.capture(error, { requestStatus: error instanceof PortalError ? error.status : 500 });
        if (errorId) response.setHeader("X-Error-Id", errorId);
        send(error instanceof PortalError ? error.status : 500, { error: error instanceof PortalError ? error.message : "Не удалось выполнить запрос. Попробуйте ещё раз.", errorId, requestId });
      }
    });
  };
}
