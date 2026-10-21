"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { EMPTY_SNAPSHOT } from "@/features/portal/model/types";
import type { PortalAction } from "@/features/portal/model/types";
import { createApiGateway } from "@/features/portal/lib/gateway";

export function usePortal() {
  const gateway = useMemo(() => createApiGateway(), []);
  const [snapshot, setSnapshot] = useState(EMPTY_SNAPSHOT);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const selected = useRef(""); const pages = useRef(1); const sequence = useRef(0); const pending = useRef(false);
  const channel = useRef<BroadcastChannel | null>(null);
  const viewerId = useRef("");
  const invalidate = useCallback(() => { sequence.current++; }, []);
  const refresh = useCallback(async () => {
    const requestId = ++sequence.current;
    try {
      const next = await gateway.snapshot(selected.current, pages.current);
      if (sequence.current !== requestId) return;
      if (viewerId.current !== (next.viewer?.id ?? "")) pages.current = 1;
      viewerId.current = next.viewer?.id ?? "";
      setSnapshot(next.viewer ? next : EMPTY_SNAPSHOT);
      if (next.viewer) selected.current = next.selectedProjectId;
    } catch (error) {
      if (sequence.current === requestId) setError(error instanceof Error ? error.message : "Не удалось обновить данные.");
    } finally { if (sequence.current === requestId) setLoading(false); }
  }, [gateway]);
  useEffect(() => {
    void refresh();
    const timer = setInterval(() => { if (!document.hidden && !pending.current) void refresh(); }, 5000);
    const visible = () => { if (!document.hidden && !pending.current) void refresh(); };
    window.addEventListener("focus", visible);
    return () => { invalidate(); clearInterval(timer); window.removeEventListener("focus", visible); };
  }, [refresh, invalidate]);
  useEffect(() => {
    if (typeof BroadcastChannel === "undefined") return;
    const connection = new BroadcastChannel("nodo-portal-profiles");
    channel.current = connection;
    connection.onmessage = () => {
      invalidate(); selected.current = ""; pages.current = 1;
      setSnapshot(EMPTY_SNAPSHOT); setLoading(true); setError("");
      void refresh();
    };
    return () => { connection.close(); channel.current = null; };
  }, [refresh, invalidate]);

  async function perform(action: () => Promise<void>): Promise<boolean> {
    if (pending.current) return false;
    pending.current = true; setBusy(true); setError(""); sequence.current++;
    try { await action(); await refresh(); return true; }
    catch (error) { setError(error instanceof Error ? error.message : "Не удалось выполнить действие."); return false; }
    finally { pending.current = false; setBusy(false); }
  }
  async function authenticate(action: () => Promise<typeof snapshot>): Promise<void> {
    const next = await action();
    selected.current = ""; pages.current = 1;
    viewerId.current = next.viewer?.id ?? "";
    setSnapshot(next); channel.current?.postMessage("changed");
  }
  return {
    snapshot, loading, busy, error, clearError: () => setError(""), refresh,
    run: (action: PortalAction) => perform(() => gateway.action(action)),
    select: async (projectId: string) => { selected.current = projectId; pages.current = 1; await refresh(); },
    more: async () => { pages.current++; await refresh(); },
    login: (email: string, password: string) => perform(() => authenticate(() => gateway.login(email, password))),
    addProfile: (email: string, password: string) => perform(() => authenticate(() => gateway.addProfile(email, password))),
    switchProfile: (userId: string) => perform(() => authenticate(() => gateway.switchProfile(userId))),
    password: (current: string, replacement: string) => perform(() => authenticate(() => gateway.password(current, replacement))),
    logout: () => perform(async () => { await gateway.logout(); selected.current = ""; pages.current = 1; viewerId.current = ""; setSnapshot(EMPTY_SNAPSHOT); channel.current?.postMessage("changed"); }),
  };
}

export type PortalController = ReturnType<typeof usePortal>;
