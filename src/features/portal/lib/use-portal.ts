"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { EMPTY_SNAPSHOT } from "@/features/portal/model/types";
import type { PortalAction } from "@/features/portal/model/types";
import { createApiGateway } from "@/features/portal/lib/gateway";
import { notify } from "@/lib/notifications";

const successMessages: Partial<Record<PortalAction["type"], string>> = {
  takeover: "Вы подключились к диалогу.", leave: "Диалог снова передан ИИ-помощнику.",
  "draft.confirm": "Задача отправлена разработчику.", "stage.save": "Этап сохранён.",
  "task.status": "Статус задачи обновлён.", "task.include": "Задача включена в оплаченное ТЗ.",
  "quote.create": "Оценка отправлена клиенту.", "order.create": "Ссылка на оплату подготовлена.",
  "order.provision": "Создание проекта запущено. Доступ придёт клиенту на почту.",
};

export function usePortal() {
  const gateway = useMemo(() => createApiGateway(), []);
  const [snapshot, setSnapshot] = useState(EMPTY_SNAPSHOT);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const backgroundError = useRef("");
  const backgroundNotification = useRef<string | number | undefined>(undefined);
  const actionNotification = useRef<string | number | undefined>(undefined);
  const selected = useRef(""); const pages = useRef(1); const sequence = useRef(0); const pending = useRef(false);
  const channel = useRef<BroadcastChannel | null>(null);
  const viewerId = useRef("");
  const invalidate = useCallback(() => { sequence.current++; }, []);
  const refresh = useCallback(async function refreshSnapshot(): Promise<void> {
    const requestId = ++sequence.current;
    try {
      const next = await gateway.snapshot(selected.current, pages.current);
      if (sequence.current !== requestId) return;
      const issue = next.syncError ?? "";
      const issueKey = issue ? `${next.selectedProjectId}:${issue}` : "";
      if (issueKey && issueKey !== backgroundError.current) backgroundNotification.current = notify.error(issue, { action: { label: "Повторить", onClick: event => { event.preventDefault(); backgroundError.current = ""; void refreshSnapshot(); } } });
      if (!issueKey && backgroundNotification.current !== undefined) { notify.dismiss(backgroundNotification.current); backgroundNotification.current = undefined; }
      backgroundError.current = issueKey;
      if (!next.viewer && viewerId.current) { notify.clear(); notify.info("Сессия завершена. Войдите снова."); }
      if (viewerId.current !== (next.viewer?.id ?? "")) pages.current = 1;
      viewerId.current = next.viewer?.id ?? "";
      setSnapshot(next.viewer ? next : EMPTY_SNAPSHOT);
      if (next.viewer) selected.current = next.selectedProjectId;
    } catch (error) {
      if (sequence.current === requestId) {
        const message = error instanceof Error ? error.message : "Не удалось обновить данные.";
        if (backgroundError.current !== message) backgroundNotification.current = notify.error(message, { action: { label: "Повторить", onClick: event => { event.preventDefault(); backgroundError.current = ""; void refreshSnapshot(); } } });
        backgroundError.current = message;
      }
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
      setSnapshot(EMPTY_SNAPSHOT); setLoading(true); backgroundError.current = ""; notify.clear();
      void refresh();
    };
    return () => { connection.close(); channel.current = null; };
  }, [refresh, invalidate]);

  async function perform(action: () => Promise<void>, success?: string): Promise<boolean> {
    if (pending.current) return false;
    pending.current = true; setBusy(true); sequence.current++;
    try {
      await action(); await refresh();
      if (actionNotification.current !== undefined) { notify.dismiss(actionNotification.current); actionNotification.current = undefined; }
      if (success) notify.success(success);
      return true;
    }
    catch (error) { actionNotification.current = notify.error(error instanceof Error ? error.message : "Не удалось выполнить действие."); return false; }
    finally { pending.current = false; setBusy(false); }
  }
  async function authenticate(action: () => Promise<typeof snapshot>): Promise<void> {
    const next = await action();
    notify.clear(); backgroundError.current = "";
    selected.current = ""; pages.current = 1;
    viewerId.current = next.viewer?.id ?? "";
    setSnapshot(next); channel.current?.postMessage("changed");
  }
  return {
    snapshot, loading, busy, refresh,
    run: (action: PortalAction) => perform(() => gateway.action(action), successMessages[action.type]),
    select: async (projectId: string) => { selected.current = projectId; pages.current = 1; await refresh(); },
    more: async () => { pages.current++; await refresh(); },
    login: (email: string, password: string) => perform(() => authenticate(() => gateway.login(email, password))),
    addProfile: (email: string, password: string) => perform(() => authenticate(() => gateway.addProfile(email, password)), "Профиль добавлен."),
    switchProfile: (userId: string) => perform(() => authenticate(() => gateway.switchProfile(userId))),
    password: (current: string, replacement: string) => perform(() => authenticate(() => gateway.password(current, replacement)), "Пароль сохранён."),
    logout: () => perform(async () => { await gateway.logout(); notify.clear(); backgroundError.current = ""; selected.current = ""; pages.current = 1; viewerId.current = ""; setSnapshot(EMPTY_SNAPSHOT); channel.current?.postMessage("changed"); }, "Вы вышли из всех профилей на этом устройстве."),
  };
}

export type PortalController = ReturnType<typeof usePortal>;
