"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { EMPTY_SNAPSHOT } from "@/features/portal/model/types";
import type { PortalAction, Role } from "@/features/portal/model/types";
import { createApiGateway } from "@/features/portal/lib/gateway";
import { createDemoGateway } from "@/features/portal/lib/demo-gateway";

export function usePortal(demo: boolean) {
  const gateway = useMemo(() => demo ? createDemoGateway() : createApiGateway(), [demo]);
  const [snapshot, setSnapshot] = useState(EMPTY_SNAPSHOT);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const selected = useRef(""); const pages = useRef(1); const sequence = useRef(0); const pending = useRef(false);
  const invalidate = useCallback(() => { sequence.current++; }, []);
  const refresh = useCallback(async () => {
    const requestId = ++sequence.current;
    try {
      const next = await gateway.snapshot(selected.current, pages.current);
      if (sequence.current !== requestId) return;
      setSnapshot(next.viewer ? next : EMPTY_SNAPSHOT);
      if (next.viewer) selected.current = next.selectedProjectId;
    } catch (error) {
      if (sequence.current === requestId) setError(error instanceof Error ? error.message : "Не удалось обновить данные.");
    } finally { if (sequence.current === requestId) setLoading(false); }
  }, [gateway]);
  useEffect(() => {
    void refresh();
    const timer = setInterval(() => { if (!document.hidden && !pending.current) void refresh(); }, 15000);
    const visible = () => { if (!document.hidden && !pending.current) void refresh(); };
    window.addEventListener("focus", visible);
    return () => { invalidate(); clearInterval(timer); window.removeEventListener("focus", visible); };
  }, [refresh, invalidate]);

  async function perform(action: () => Promise<void>): Promise<boolean> {
    if (pending.current) return false;
    pending.current = true; setBusy(true); setError(""); sequence.current++;
    try { await action(); await refresh(); return true; }
    catch (error) { setError(error instanceof Error ? error.message : "Не удалось выполнить действие."); return false; }
    finally { pending.current = false; setBusy(false); }
  }
  return {
    snapshot, loading, busy, error, clearError: () => setError(""), refresh,
    run: (action: PortalAction) => perform(() => gateway.action(action)),
    select: async (projectId: string) => { selected.current = projectId; pages.current = 1; await refresh(); },
    more: async () => { pages.current++; await refresh(); },
    login: (email: string, password: string) => perform(async () => { setSnapshot(await gateway.login(email, password)); }),
    password: (current: string, replacement: string) => perform(async () => { setSnapshot(await gateway.password(current, replacement)); }),
    logout: () => perform(async () => { await gateway.logout(); selected.current = ""; setSnapshot(EMPTY_SNAPSHOT); }),
    role: (role: Role) => perform(async () => { await gateway.role?.(role); selected.current = ""; pages.current = 1; }),
    reset: () => perform(async () => { await gateway.reset?.(); selected.current = ""; pages.current = 1; }),
  };
}

export type PortalController = ReturnType<typeof usePortal>;
