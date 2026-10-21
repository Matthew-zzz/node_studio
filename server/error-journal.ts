import { createHash } from "node:crypto";
import { PortalError, id, now } from "./store.ts";
import type { PortalStore, Session } from "./store.ts";
import { errorContext } from "./error-context.ts";
import type { ErrorContext } from "./error-context.ts";
import { UpstreamError } from "./upstream-error.ts";
import type { BrowserFailure, ErrorEvent, ErrorPage, ErrorProvider, ErrorQuery } from "../src/features/portal/model/errors.ts";
import { object, text, integer } from "./validation.ts";

const providers: (ErrorProvider | "all")[] = ["all", "application", "github", "openai", "telegram", "resend", "browser"];
const apiPaths = /^(snapshot|action|login|logout|password|profiles\/(add|switch)|checkout(?:\/pay)?|admin\/agent(?:\/(document|export))?|admin\/errors)$/;
export function safeApiPath(value: string): string {
  const path = (value.split("?")[0] ?? "").replace(/(.+)\/$/, "$1");
  if (/^\/api\/portal\/[a-z/-]{1,100}$/.test(path) || /^\/_next\/static\/[a-zA-Z0-9_./-]{1,200}$/.test(path)) return path;
  return ["/", "/cabinet", "/checkout"].includes(path) ? path : "/[неизвестный маршрут]";
}

export class ErrorJournal {
  private store: PortalStore;
  private revision: string;
  constructor(store: PortalStore, revision: string) { this.store = store; this.revision = revision; }

  capture(error: unknown, overrides: ErrorContext = {}): string | null {
    // Logging must never prevent the original response or background fallback.
    try {
      const context = { ...errorContext(), ...overrides };
      const status = error instanceof PortalError ? error.status : 500;
      const upstream = error instanceof UpstreamError ? error.diagnosis : null;
      const validation = status >= 400 && status < 500;
      const event: ErrorEvent = {
        id: id(), code: upstream?.code ?? `HTTP_${status}`,
        title: upstream?.title ?? ({ 400: "Некорректный запрос", 401: "Не выполнен вход", 403: "Запрос запрещён", 404: "Ресурс не найден", 409: "Данные изменились", 413: "Слишком большой запрос", 415: "Неподдерживаемый формат", 429: "Слишком много запросов", 503: "Сервис не настроен" }[status] ?? "Ошибка обработки запроса"),
        explanation: upstream?.explanation ?? (error instanceof PortalError ? error.message : "Сервер не смог завершить операцию. Содержимое запроса и внутренние данные исключены из журнала."),
        recommendation: upstream?.recommendation ?? (status === 401 ? "Повторите вход. При частых сбоях проверьте срок сессий и настройки cookie." : status === 403 ? "Проверьте роль пользователя, обязательную смену пароля, Origin и CSRF. Эти ограничения не следует отключать." : status === 409 ? "Обновите данные и повторите действие с актуальной версией." : validation ? "Проверьте параметры операции и права пользователя." : "Проверьте настройки сервиса и повторите запрос. Используйте идентификатор запроса для поиска в журнале."),
        ...(upstream?.documentation ? { documentation: upstream.documentation } : {}),
        source: upstream && context.source === "request" ? "integration" : context.source ?? (upstream ? "integration" : "request"), provider: upstream?.provider ?? "application", severity: validation ? "warning" : "error",
        status, upstreamStatus: upstream?.upstreamStatus ?? null,
        ...(context.requestStatus !== undefined ? { requestStatus: context.requestStatus } : {}),
        actor: context.actor ? { id: context.actor.id, name: context.actor.name, email: context.actor.email, role: context.actor.role } : null,
        projectId: context.projectId ?? "", projectName: context.projectName ?? "",
        requestId: context.requestId ?? id(), method: context.method ?? "", path: context.path ? safeApiPath(context.path) : "", operation: context.operation ?? "",
        upstreamPath: upstream?.upstreamPath ?? "", upstreamRequestId: upstream?.upstreamRequestId ?? "", revision: this.revision,
        ...(!(error instanceof PortalError) && error instanceof Error ? { trace: [...new Set(error.stack?.match(/server\/[a-zA-Z0-9_/.-]+\.ts:\d+:\d+/g) ?? [])].slice(0, 8) } : {}),
        firstSeen: now(), lastSeen: now(), count: 1, resolvedAt: null, resolvedBy: null,
      };
      return this.save(event);
    } catch { console.error("Error journal write failed."); return null; }
  }

  private save(event: ErrorEvent): string {
    const fingerprint = createHash("sha256").update(JSON.stringify([event.code, event.provider, event.status, event.upstreamStatus, event.source, event.actor?.id, event.projectId, event.path, event.method, event.operation, event.upstreamPath, event.explanation])).digest("hex");
    const previous = this.store.db.prepare("SELECT payload FROM error_events WHERE fingerprint=? AND resolved=0 ORDER BY last_seen DESC LIMIT 1").get(fingerprint);
    if (previous) {
      const existing = JSON.parse(String(previous.payload)) as ErrorEvent;
      event = { ...event, id: existing.id, firstSeen: existing.firstSeen, count: existing.count + 1 };
    }
    const search = [event.title, event.actor?.name, event.actor?.email, event.actor?.role, event.code, event.projectName, event.requestId, event.path, event.upstreamStatus, event.status].join(" ").toLowerCase();
    this.store.db.prepare("INSERT INTO error_events(id,fingerprint,last_seen,resolved,payload,search_text) VALUES(?,?,?,0,?,?) ON CONFLICT(id) DO UPDATE SET last_seen=excluded.last_seen,payload=excluded.payload,search_text=excluded.search_text")
      .run(event.id, fingerprint, event.lastSeen, JSON.stringify(event), search);
    this.store.db.prepare("DELETE FROM error_events WHERE id IN (SELECT id FROM error_events ORDER BY last_seen DESC,id DESC LIMIT -1 OFFSET 2000)").run();
    return event.id;
  }

  query(input: Partial<ErrorQuery>): ErrorPage {
    const state = input.state ?? "open"; const provider = input.provider ?? "all";
    if (!["open", "resolved", "all"].includes(state) || !providers.includes(provider)) throw new PortalError(400, "Проверьте фильтры журнала.");
    const page = integer(input.page ?? 1, 1, 10000); const search = text(input.search ?? "", 200, 0).toLowerCase();
    const conditions: string[] = []; const args: (string | number)[] = [];
    if (state !== "all") { conditions.push("resolved=?"); args.push(state === "resolved" ? 1 : 0); }
    if (provider !== "all") { conditions.push("json_extract(payload,'$.provider')=?"); args.push(provider); }
    // Search selected fields only, with instr rather than SQL wildcard syntax.
    if (search) {
      conditions.push("instr(search_text,?)>0"); args.push(search);
    }
    const where = conditions.length ? ` WHERE ${conditions.join(" AND ")}` : "";
    const total = Number(this.store.db.prepare(`SELECT count(*) AS n FROM error_events${where}`).get(...args)!.n);
    const open = Number(this.store.db.prepare("SELECT count(*) AS n FROM error_events WHERE resolved=0").get()!.n);
    const currentPage = Math.min(page, Math.max(1, Math.ceil(total / 30)));
    const rows = this.store.db.prepare(`SELECT payload FROM error_events${where} ORDER BY last_seen DESC,id DESC LIMIT 30 OFFSET ?`).all(...args, (currentPage - 1) * 30);
    return { events: rows.map(row => JSON.parse(String(row.payload)) as ErrorEvent), total, open, page: currentPage, pageSize: 30 };
  }

  resolve(eventId: unknown, resolved: unknown, author: string): void {
    if (typeof resolved !== "boolean") throw new PortalError(400, "Проверьте статус ошибки.");
    const recordId = text(eventId, 100); const row = this.store.db.prepare("SELECT payload FROM error_events WHERE id=?").get(recordId);
    if (!row) throw new PortalError(404, "Запись журнала не найдена.");
    const event = JSON.parse(String(row.payload)) as ErrorEvent;
    if (Boolean(event.resolvedAt) === resolved) return;
    if (!resolved && this.store.db.prepare("SELECT id FROM error_events WHERE resolved=0 AND fingerprint=(SELECT fingerprint FROM error_events WHERE id=?) AND id!=?").get(recordId, recordId)) throw new PortalError(409, "Эта ошибка уже повторилась. Откройте её новую запись.");
    this.store.db.prepare("UPDATE error_events SET resolved=?,payload=? WHERE id=?").run(Number(resolved), JSON.stringify({ ...event, resolvedAt: resolved ? now() : null, resolvedBy: resolved ? author : null }), recordId);
  }

  browserReports(input: unknown, session: Session | null): void {
    if (!Array.isArray(input) || input.length > 10) throw new PortalError(400, "Допускается до 10 сообщений об ошибках.");
    for (const entry of input) {
      const report = object(entry) as unknown as BrowserFailure;
      if (!/^[a-f0-9-]{36}$/.test(report.id) || !["network", "timeout", "http", "invalid_response"].includes(report.kind) || !["GET", "POST"].includes(report.method) || !apiPaths.test(report.path) || !Number.isInteger(report.status) || report.status < 0 || report.status > 599 || typeof report.viewerId !== "string" || report.viewerId.length > 100) throw new PortalError(400, "Некорректное сообщение об ошибке.");
      // Queued requests from a previous profile must never be attributed to the current one.
      if (report.viewerId && report.viewerId !== (session?.viewer.id ?? "")) continue;
      if (this.store.db.prepare("SELECT id FROM error_receipts WHERE id=?").get(report.id)) continue;
      const event: ErrorEvent = {
        id: id(), code: `BROWSER_${report.kind.toUpperCase()}`, title: report.kind === "timeout" ? "Браузер не дождался ответа" : report.kind === "network" ? "Браузер не смог связаться с сервером" : report.kind === "invalid_response" ? "Сервер вернул неожиданный ответ" : "Ошибка запроса из браузера",
        explanation: report.kind === "network" ? "Запрос не получил HTTP-ответ. Возможны потеря связи, DNS, TLS или блокировка запроса. Точную причину браузер не раскрывает." : report.kind === "timeout" ? "Истекло время ожидания ответа на запрос." : report.kind === "invalid_response" ? "Ответ не соответствует ожидаемому JSON-формату. Возможен ответ промежуточного сервера." : `Получен HTTP ${report.status} без записи об ошибке от приложения. Возможен сбой прокси.`,
        recommendation: "Проверьте соединение пользователя, доступность домена, Nginx и состояние контейнера. Сообщение доставлено после восстановления связи; личность проверена по серверной сессии.",
        source: "browser", provider: "browser", severity: "error", status: report.status || null, upstreamStatus: null,
        actor: report.viewerId && session ? { id: session.viewer.id, name: session.viewer.name, email: session.viewer.email, role: session.viewer.role } : null, projectId: "", projectName: "", requestId: report.id, method: report.method, path: `/api/portal/${report.path}`, operation: "",
        upstreamPath: "", upstreamRequestId: "", revision: this.revision, firstSeen: now(), lastSeen: now(), count: 1, resolvedAt: null, resolvedBy: null,
        ...(typeof report.occurredAt === "string" && Number.isFinite(Date.parse(report.occurredAt)) && Math.abs(Date.now() - Date.parse(report.occurredAt)) < 7 * 86400_000 ? { clientOccurredAt: new Date(report.occurredAt).toISOString() } : {}),
      };
      this.store.transaction(() => { this.save(event); this.store.db.prepare("INSERT INTO error_receipts(id,created_at) VALUES(?,?)").run(report.id, now()); });
    }
    this.store.db.prepare("DELETE FROM error_receipts WHERE id IN (SELECT id FROM error_receipts ORDER BY created_at DESC,id DESC LIMIT -1 OFFSET 10000)").run();
  }
}
