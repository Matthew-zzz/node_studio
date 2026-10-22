import type { Checkout, PortalAction, PortalSnapshot, Role } from "@/features/portal/model/types";
import type { EmailChallenge, LoginResult, RecoveryDetails } from "@/features/portal/model/auth";
import { EMPTY_SNAPSHOT } from "@/features/portal/model/types";
import type { AgentAdminState, AgentCommand, AgentPreferences, AgentSettings, AgentTestMessage, AgentTestResult, KnowledgeDocument } from "@/features/portal/model/agent";
import type { ErrorPage, ErrorQuery } from "@/features/portal/model/errors";
import { createRequestReporter } from "@/features/portal/lib/request-reporter";

export interface AgentGateway {
  state(): Promise<AgentAdminState>;
  command(command: AgentCommand): Promise<AgentAdminState>;
  preview(settings: AgentPreferences, messages: AgentTestMessage[]): Promise<AgentTestResult>;
  document(id: string): Promise<KnowledgeDocument>;
  export(): Promise<{ settings: AgentSettings; documents: KnowledgeDocument[] }>;
}

export interface PortalGateway {
  auth: {
    pending(): Promise<{ challenge: EmailChallenge | null }>;
    verify(code: string): Promise<PortalSnapshot>;
    resend(): Promise<EmailChallenge>;
    cancel(): Promise<void>;
    forgot(email: string, role: Role): Promise<void>;
    recovery(token: string): Promise<RecoveryDetails>;
    reset(token: string, replacement: string): Promise<void>;
  };
  agent: AgentGateway;
  errors: { list(query: ErrorQuery): Promise<ErrorPage>; resolve(id: string, resolved: boolean): Promise<void> };
  dispose(): void;
  activate(): void;
  snapshot(projectId?: string, pages?: number): Promise<PortalSnapshot>;
  action(action: PortalAction): Promise<void>;
  login(email: string, password: string, role?: Role): Promise<LoginResult>;
  addProfile(email: string, password: string, role?: Role): Promise<LoginResult>;
  switchProfile(userId: string): Promise<PortalSnapshot>;
  logout(): Promise<void>;
  password(current: string, replacement: string): Promise<PortalSnapshot>;
  checkout(token: string): Promise<Checkout>;
  payOrder(token: string, outcome: "succeeded" | "failed"): Promise<Checkout>;
}

export function createApiGateway(): PortalGateway {
  let csrf = "";
  let viewerId = ""; let identityReady = false;
  const reporter = createRequestReporter(() => ({ viewerId, csrf, ready: identityReady }), async () => { await request("session"); });
  let generation = 0; let sequence = 0; let csrfSequence = 0;
  async function request<T>(path: string, body?: unknown): Promise<T> {
    const authenticating = ["login", "logout", "password", "profiles/add", "profiles/switch", "auth/verify", "auth/reset"].includes(path);
    const requestId = ++sequence;
    const requestViewerId = viewerId;
    const requestGeneration = authenticating ? ++generation : generation;
    let response: Response;
    try {
      response = await fetch(`/api/portal/${path}`, {
        credentials: "same-origin", cache: "no-store", signal: AbortSignal.timeout(120_000),
        ...(body === undefined ? {} : { method: "POST", headers: { "Content-Type": "application/json", "X-CSRF-Token": csrf }, body: JSON.stringify(body) }),
      });
    } catch (error) {
      reporter.record(path, body === undefined ? "GET" : "POST", error instanceof Error && ["TimeoutError", "AbortError"].includes(error.name) ? "timeout" : "network", 0, requestViewerId);
      throw new Error("Не удалось связаться с сервером. Проверьте соединение и попробуйте снова.");
    }
    const value = await response.json().catch(() => null) as { error?: string; errorId?: string; viewer?: PortalSnapshot["viewer"] } | null;
    if (!response.ok && !value?.errorId) reporter.record(path, body === undefined ? "GET" : "POST", "http", response.status, requestViewerId);
    else if (response.ok && (!value || typeof value !== "object")) { reporter.record(path, body === undefined ? "GET" : "POST", "invalid_response", response.status, requestViewerId); throw new Error("Сервер вернул неожиданный ответ. Повторите попытку позже."); }
    if (!response.ok) {
      void reporter.flush();
      if (response.status === 401 && path.startsWith("snapshot")) return EMPTY_SNAPSHOT as T;
      throw new Error(value?.error || "Не удалось выполнить запрос.");
    }
    // A late snapshot from a previous profile must not replace the active CSRF token.
    if (requestGeneration === generation && requestId > csrfSequence && value && "csrf" in value && typeof value.csrf === "string") {
      csrf = value.csrf; csrfSequence = requestId;
      viewerId = value.viewer?.id ?? ""; identityReady = true;
    }
    if (authenticating && requestGeneration === generation) { generation++; if (path === "logout") csrf = ""; }
    void reporter.flush();
    return value as T;
  }
  return {
    auth: {
      pending() { return request("auth/challenge"); },
      verify(code) { return request("auth/verify", { code }); },
      resend() { return request("auth/resend", {}); },
      cancel() { return request("auth/cancel", {}); },
      forgot(email, role) { return request("auth/forgot", { email, role }); },
      recovery(token) { return request("auth/recovery", { token }); },
      reset(token, replacement) { return request("auth/reset", { token, replacement }); },
    },
    activate() { reporter.activate(); },
    dispose() { reporter.dispose(); },
    errors: {
      list(query) { return request(`admin/errors?${new URLSearchParams({ state: query.state, provider: query.provider, search: query.search, page: String(query.page) })}`); },
      resolve(id, resolved) { return request("admin/errors", { id, resolved }); },
    },
    agent: {
      state() { return request("admin/agent"); },
      command(command) { return request("admin/agent", command); },
      preview(settings, messages) { return request("admin/agent", { type: "preview", settings, messages }); },
      document(id) { return request(`admin/agent/document?id=${encodeURIComponent(id)}`); },
      export() { return request("admin/agent/export"); },
    },
    snapshot(projectId = "", pages = 1) { return request(`snapshot?project=${encodeURIComponent(projectId)}&pages=${pages}`); },
    action(action) { return request("action", action); },
    login(email, password, role) { return request("login", { email, password, role }); },
    addProfile(email, password, role) { return request("profiles/add", { email, password, role }); },
    switchProfile(userId) { return request("profiles/switch", { userId }); },
    logout() { return request("logout", {}); },
    password(current, replacement) { return request("password", { current, replacement }); },
    checkout(token) { return request("checkout", { token }); },
    payOrder(token, outcome) { return request("checkout/pay", { token, outcome }); },
  };
}
