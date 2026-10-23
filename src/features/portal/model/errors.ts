import type { Role } from "./types.ts";

export type ErrorSource = "request" | "integration" | "background" | "browser" | "runtime";
export type ErrorProvider = "application" | "github" | "openai" | "telegram" | "resend" | "browser";
export interface ErrorActor { id: string; name: string; email: string; role: Role | "telegram" | "curator" }
export interface ErrorEvent {
  id: string; code: string; title: string; explanation: string; recommendation: string; documentation?: string;
  source: ErrorSource; provider: ErrorProvider; severity: "error" | "warning";
  status: number | null; upstreamStatus: number | null;
  requestStatus?: number;
  actor: ErrorActor | null; projectId: string; projectName: string;
  subprojectId?: string; subprojectName?: string;
  requestId: string; method: string; path: string; operation: string;
  upstreamPath: string; upstreamRequestId: string; revision: string;
  trace?: string[]; clientOccurredAt?: string;
  firstSeen: string; lastSeen: string; count: number; resolvedAt: string | null; resolvedBy: string | null;
}
export interface ErrorQuery { state: "open" | "resolved" | "all"; search: string; provider: ErrorProvider | "all"; page: number }
export interface ErrorPage { events: ErrorEvent[]; total: number; open: number; page: number; pageSize: number }
export interface BrowserFailure {
  id: string; kind: "network" | "timeout" | "http" | "invalid_response";
  path: string; method: "GET" | "POST"; status: number; viewerId: string; occurredAt: string;
}
export const ERROR_PROVIDER_LABELS: Record<ErrorProvider, string> = { application: "Приложение", github: "GitHub", openai: "OpenAI", telegram: "Telegram", resend: "Почта", browser: "Браузер" };
export const ERROR_SOURCE_LABELS: Record<ErrorSource, string> = { request: "Запрос к серверу", integration: "Внешний сервис", background: "Фоновая задача", browser: "Запрос из браузера", runtime: "Сервер" };
