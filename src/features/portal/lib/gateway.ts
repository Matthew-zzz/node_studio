import type { Checkout, PortalAction, PortalSnapshot } from "@/features/portal/model/types";
import { EMPTY_SNAPSHOT } from "@/features/portal/model/types";

export interface PortalGateway {
  snapshot(projectId?: string, pages?: number): Promise<PortalSnapshot>;
  action(action: PortalAction): Promise<void>;
  login(email: string, password: string): Promise<PortalSnapshot>;
  logout(): Promise<void>;
  password(current: string, replacement: string): Promise<PortalSnapshot>;
  checkout(token: string): Promise<Checkout>;
  payOrder(token: string, outcome: "succeeded" | "failed"): Promise<Checkout>;
}

export function createApiGateway(): PortalGateway {
  let csrf = "";
  async function request<T>(path: string, body?: unknown): Promise<T> {
    let response: Response;
    try {
      response = await fetch(`/api/portal/${path}`, {
        credentials: "same-origin", cache: "no-store", signal: AbortSignal.timeout(120_000),
        ...(body === undefined ? {} : { method: "POST", headers: { "Content-Type": "application/json", "X-CSRF-Token": csrf }, body: JSON.stringify(body) }),
      });
    } catch { throw new Error("Не удалось связаться с сервером. Проверьте соединение и попробуйте снова."); }
    if (response.status === 404 || response.status === 502 || response.status === 503) {
      const value = await response.json().catch(() => null) as { error?: string } | null;
      throw new Error(value?.error || "Сервис временно недоступен. Повторите попытку позже или напишите в поддержку.");
    }
    const value = await response.json().catch(() => null) as { error?: string } | null;
    if (!response.ok) {
      if (response.status === 401 && path.startsWith("snapshot")) return EMPTY_SNAPSHOT as T;
      throw new Error(value?.error || "Не удалось выполнить запрос.");
    }
    if (value && "csrf" in value && typeof value.csrf === "string") csrf = value.csrf;
    return value as T;
  }
  return {
    snapshot(projectId = "", pages = 1) { return request(`snapshot?project=${encodeURIComponent(projectId)}&pages=${pages}`); },
    action(action) { return request("action", action); },
    login(email, password) { return request("login", { email, password }); },
    logout() { return request("logout", {}); },
    password(current, replacement) { return request("password", { current, replacement }); },
    checkout(token) { return request("checkout", { token }); },
    payOrder(token, outcome) { return request("checkout/pay", { token, outcome }); },
  };
}
