import type { BrowserFailure } from "@/features/portal/model/errors";

const routes = /^(snapshot|action|login|logout|password|profiles\/(add|switch)|checkout(?:\/pay)?|admin\/agent(?:\/(document|export))?|admin\/errors)$/;
export function createRequestReporter(identity: () => { viewerId: string; csrf: string; ready: boolean }, initialize: () => Promise<void>, presentation: "web" | "miniapp" = "web") {
  const key = presentation === "miniapp" ? "node-request-errors-miniapp-v1" : "node-request-errors-v1";
  let pending: BrowserFailure[] = []; let loaded = false; let sending = false; let disposed = false; let preparing = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  function load() {
    if (loaded || typeof window === "undefined") return;
    loaded = true;
    try { const saved: unknown = JSON.parse(localStorage.getItem(key) ?? "[]"); if (Array.isArray(saved)) pending = saved.filter(item => item && typeof item.id === "string" && typeof item.path === "string" && routes.test(item.path)).slice(-40); } catch { /* Storage is optional. */ }
  }
  function persist() { try { if (pending.length) localStorage.setItem(key, JSON.stringify(pending)); else localStorage.removeItem(key); } catch { /* A memory queue still works. */ } }
  function schedule() { if (!disposed && pending.length && !timer) timer = setTimeout(() => { timer = undefined; void flush(); }, 30_000); }
  async function flush() {
    load(); let current = identity();
    if (disposed || sending || preparing || !pending.length) return;
    if (typeof navigator !== "undefined" && !navigator.onLine) { schedule(); return; }
    if (!current.ready) {
      preparing = true;
      try { await initialize(); } catch { schedule(); return; }
      finally { preparing = false; }
      current = identity();
      if (disposed || !current.ready) { schedule(); return; }
    }
    const batch = pending.slice(0, 10); sending = true;
    try {
      const response = await fetch("/api/portal/errors/report", { method: "POST", credentials: "same-origin", cache: "no-store", signal: AbortSignal.timeout(10_000), headers: { "Content-Type": "application/json", "X-CSRF-Token": current.csrf, ...(presentation === "miniapp" ? { "X-Portal-Client": "miniapp" } : {}) }, body: JSON.stringify({ reports: batch }) });
      if (response.ok) { const ids = new Set(batch.map(item => item.id)); pending = pending.filter(item => !ids.has(item.id)); persist(); }
    } catch { /* Never report failure to send an error report recursively. */ }
    finally { sending = false; schedule(); }
  }
  return {
    record(path: string, method: "GET" | "POST", kind: BrowserFailure["kind"], status = 0, viewerId = identity().viewerId) {
      load(); const route = path.split("?")[0] ?? "";
      if (!routes.test(route) || typeof window === "undefined") return;
      pending.push({ id: crypto.randomUUID(), kind, path: route, method, status, viewerId, occurredAt: new Date().toISOString() });
      pending = pending.slice(-40); persist(); schedule();
    },
    flush,
    activate() { disposed = false; void initialize().catch(() => undefined); void flush(); },
    dispose() { disposed = true; if (timer) clearTimeout(timer); },
  };
}
