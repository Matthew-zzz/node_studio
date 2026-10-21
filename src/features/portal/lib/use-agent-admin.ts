"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { AgentGateway } from "@/features/portal/lib/gateway";
import type { AgentAdminState, AgentCommand, AgentPreferences } from "@/features/portal/model/agent";
import { editableAgentSettings } from "@/features/portal/model/agent";
import { notify } from "@/lib/notifications";

export function useAgentAdmin(api: AgentGateway) {
  const [state, setState] = useState<AgentAdminState | null>(null);
  const [draft, setDraftState] = useState<AgentPreferences | null>(null);
  const [draftVersion, setDraftVersion] = useState(0);
  const [busy, setBusy] = useState(false);
  const mounted = useRef(false); const pending = useRef(false);
  const dirty = useRef(false); const base = useRef("");
  const applyState = useCallback((next: AgentAdminState, replaceDraft: boolean) => {
    if (!mounted.current) return;
    setState(next);
    if (replaceDraft || !dirty.current) {
      const preferences = editableAgentSettings(next.settings);
      setDraftState(preferences); setDraftVersion(next.settings.version);
      base.current = JSON.stringify(preferences); dirty.current = false;
    }
  }, []);
  function setDraft(next: AgentPreferences) {
    const preferences = editableAgentSettings(next);
    dirty.current = JSON.stringify(preferences) !== base.current; setDraftState(preferences);
  }
  const refresh = useCallback(async (replaceDraft = false) => {
    try {
      const next = await api.state();
      applyState(next, replaceDraft);
    } catch (error) { if (mounted.current) notify.error(error instanceof Error ? error.message : "Не удалось загрузить настройки агента."); }
  }, [api, applyState]);
  useEffect(() => {
    mounted.current = true; let current = true;
    void api.state().then(next => { if (current) applyState(next, true); }).catch(error => { if (current && mounted.current) notify.error(error instanceof Error ? error.message : "Не удалось загрузить настройки агента."); });
    return () => { current = false; mounted.current = false; };
  }, [api, applyState]);
  const indexing = state?.documents.some(document => document.indexStatus === "pending") ?? false;
  useEffect(() => {
    if (!indexing) return;
    const timer = setInterval(() => { if (!pending.current) void refresh(); }, 5000);
    return () => clearInterval(timer);
  }, [indexing, refresh]);

  async function command(value: AgentCommand): Promise<AgentAdminState | null> {
    if (pending.current) return null;
    pending.current = true; setBusy(true);
    try {
      const next = await api.command(value);
      if (!mounted.current) return null;
      applyState(next, value.type.startsWith("settings."));
      notify.success(value.type === "settings.save" ? "Настройки агента применены." : value.type === "settings.restore" ? "Версия настроек восстановлена." : value.type === "reindex" ? "Индекс базы знаний обновляется." : "База знаний обновлена.");
      return next;
    } catch (error) { if (mounted.current) notify.error(error instanceof Error ? error.message : "Не удалось сохранить изменения."); return null; }
    finally { pending.current = false; if (mounted.current) setBusy(false); }
  }
  return { state, draft, draftVersion, setDraft, resetDraft: () => { if (state) applyState(state, true); }, busy, command, refresh };
}
