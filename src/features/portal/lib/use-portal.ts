"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { EMPTY_SNAPSHOT } from "@/features/portal/model/types";
import type { PortalAction, PortalSnapshot, Role } from "@/features/portal/model/types";
import type { EmailChallenge, LoginResult } from "@/features/portal/model/auth";
import { createApiGateway } from "@/features/portal/lib/gateway";
import { notify } from "@/lib/notifications";
import { BriefUpdates } from "@/features/portal/model/brief-updates";
import { PaymentUpdates } from "@/features/portal/model/payment-updates";

const successMessages: Partial<Record<PortalAction["type"], string>> = {
  "brief.generate": "Подготовка брифа запущена. Можно продолжать работу.",
  "project.request": "Проект создан и передан в общую очередь.", "project.repository.create": "Создание репозитория запущено. Можно продолжать работу.",
  "project.create": "Клиентский проект создан.", "project.repository.add": "Подпроект подключён.",
  "project.accept": "Проект добавлен в работу.",
  "project.delete": "Проект удалён из кабинетов.",
  "order.delete": "Оплата удалена. Ссылка больше недоступна.", "quote.delete": "Оплата удалена.",
  takeover: "Вы подключились к диалогу.", leave: "Диалог снова передан ИИ-помощнику.",
  "draft.confirm": "Задача отправлена разработчику.", "stage.save": "Этап сохранён.",
  "task.status": "Статус задачи обновлён.", "task.include": "Задача включена в оплаченное ТЗ.",
  "quote.create": "Оценка отправлена клиенту.", "order.create": "Ссылка на оплату подготовлена.",
  "order.provision": "Создание проекта запущено. Доступ придёт клиенту на почту.",
};

export function usePortal(presentation: "web" | "miniapp" = "web") {
  const gateway = useMemo(() => createApiGateway(presentation), [presentation]);
  useEffect(() => { gateway.activate(); return () => gateway.dispose(); }, [gateway]);
  const [snapshot, setSnapshot] = useState(EMPTY_SNAPSHOT);
  const [briefUpdates] = useState(() => new BriefUpdates());
  const [paymentUpdates] = useState(() => new PaymentUpdates());
  useEffect(() => {
    for (const event of [...briefUpdates.observe(snapshot), ...paymentUpdates.observe(snapshot)]) {
      if (event.success) notify.success(event.message, { scope: "active" });
      else notify.error(event.message);
    }
  }, [snapshot, briefUpdates, paymentUpdates]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [challenge, setChallenge] = useState<EmailChallenge | null>(null);
  const authSequence = useRef(0);
  const backgroundError = useRef("");
  const backgroundNotification = useRef<string | number | undefined>(undefined);
  const actionNotification = useRef<string | number | undefined>(undefined);
  const selected = useRef(""); const pages = useRef(1); const sequence = useRef(0); const pending = useRef(false);
  const channel = useRef<BroadcastChannel | null>(null);
  const viewerId = useRef("");
  const invalidate = useCallback(() => { sequence.current++; }, []);
  const refresh = useCallback(async function refreshSnapshot(): Promise<PortalSnapshot | null> {
    const requestId = ++sequence.current;
    try {
      const next = await gateway.snapshot(selected.current, pages.current);
      if (sequence.current !== requestId) return null;
      const issue = next.syncError ?? "";
      const issueKey = issue ? `${next.selectedProjectId}:${issue}` : "";
      if (issueKey && issueKey !== backgroundError.current) backgroundNotification.current = notify.error(issue, { action: { label: "Повторить", onClick: event => { event.preventDefault(); backgroundError.current = ""; void refreshSnapshot(); } } });
      if (!issueKey && backgroundNotification.current !== undefined) { notify.dismiss(backgroundNotification.current); backgroundNotification.current = undefined; }
      backgroundError.current = issueKey;
      if (!next.viewer && viewerId.current) { authSequence.current++; setChallenge(null); notify.clear(); notify.info("Сессия завершена. Войдите снова."); }
      if (viewerId.current !== (next.viewer?.id ?? "")) pages.current = 1;
      viewerId.current = next.viewer?.id ?? "";
      setSnapshot(next.viewer ? next : EMPTY_SNAPSHOT);
      if (next.viewer) selected.current = next.selectedProjectId;
      return next;
    } catch (error) {
      if (sequence.current === requestId) {
        const message = error instanceof Error ? error.message : "Не удалось обновить данные.";
        if (backgroundError.current !== message) backgroundNotification.current = notify.error(message, { action: { label: "Повторить", onClick: event => { event.preventDefault(); backgroundError.current = ""; void refreshSnapshot(); } } });
        backgroundError.current = message;
      }
      return null;
    } finally { if (sequence.current === requestId) setLoading(false); }
  }, [gateway]);
  useEffect(() => {
    void refresh();
    let active = true;
    const authRequest = authSequence.current;
    void gateway.auth.pending().then(result => { if (active && authRequest === authSequence.current && !pending.current) setChallenge(result.challenge); }).catch(() => undefined);
    const timer = setInterval(() => { if (!document.hidden && !pending.current) void refresh(); }, 5000);
    const visible = () => { if (!document.hidden && !pending.current) void refresh(); };
    window.addEventListener("focus", visible);
    return () => { active = false; invalidate(); clearInterval(timer); window.removeEventListener("focus", visible); };
  }, [refresh, invalidate, gateway]);
  useEffect(() => {
    if (typeof BroadcastChannel === "undefined") return;
    const connection = new BroadcastChannel("nodo-portal-profiles");
    channel.current = connection;
    connection.onmessage = () => {
      authSequence.current++;
      invalidate(); selected.current = ""; pages.current = 1;
      setSnapshot(EMPTY_SNAPSHOT); setChallenge(null); setLoading(true); backgroundError.current = ""; notify.clear();
      void refresh();
    };
    return () => { connection.close(); channel.current = null; };
  }, [refresh, invalidate]);

  async function perform(action: () => Promise<void>, success?: string, projectId?: string, activeNotification = false): Promise<boolean> {
    if (pending.current) return false;
    pending.current = true; setBusy(true); sequence.current++;
    try {
      await action();
      const next = await refresh();
      if (projectId && next?.selectedProjectId !== projectId) return false;
      if (actionNotification.current !== undefined) { notify.dismiss(actionNotification.current); actionNotification.current = undefined; }
      if (success) notify.success(success, activeNotification ? { scope: "active" } : {});
      return true;
    }
    catch (error) { actionNotification.current = notify.error(error instanceof Error ? error.message : "Не удалось выполнить действие."); return false; }
    finally { pending.current = false; setBusy(false); }
  }
  async function run(action: PortalAction): Promise<boolean> {
    if (pending.current) return false;
    const tracked = action.type === "brief.generate" ? briefUpdates.track(snapshot, action.threadId, action.refresh === true) : undefined;
    if (action.type === "payment.resend") paymentUpdates.track(snapshot, action);
    const success = action.type === "brief.link" ? action.projectId ? "Бриф добавлен в обзор проекта." : "Привязка брифа к проекту снята." : successMessages[action.type];
    const result = await perform(() => gateway.action(action), success, undefined, action.type === "brief.generate" || action.type === "brief.link");
    if (!result) briefUpdates.cancel(tracked);
    if (!result && action.type === "payment.resend") paymentUpdates.cancel(action.requestId);
    return result;
  }
  async function authenticate(action: () => Promise<LoginResult>): Promise<void> {
    const authRequest = ++authSequence.current;
    const next = await action();
    if (authRequest !== authSequence.current) return;
    if ("kind" in next && next.kind === "verification") { setChallenge(next); return; }
    if (!("viewer" in next)) return;
    setChallenge(null);
    notify.clear(); backgroundError.current = "";
    selected.current = ""; pages.current = 1;
    viewerId.current = next.viewer?.id ?? "";
    setSnapshot(next); channel.current?.postMessage("changed");
  }
  return {
    snapshot, loading, busy, challenge, refresh, agent: gateway.agent, errors: gateway.errors, staff: gateway.staff,
    run,
    select: (projectId: string) => perform(async () => { selected.current = projectId; pages.current = 1; }, undefined, projectId),
    acceptProject: (projectId: string) => perform(async () => {
      await gateway.action({ type: "project.accept", projectId });
      selected.current = projectId; pages.current = 1;
    }, successMessages["project.accept"], projectId),
    more: async () => { pages.current++; await refresh(); },
    login: (email: string, role?: Role) => perform(() => authenticate(() => gateway.login(email, role))),
    addProfile: async (email: string, role?: Role) => {
      let awaitingCode = false;
      const success = await perform(async () => {
        const result = await gateway.addProfile(email, role);
        awaitingCode = "kind" in result;
        await authenticate(() => Promise.resolve(result));
      });
      return success && !awaitingCode;
    },
    verifyCode: (code: string) => perform(() => authenticate(() => gateway.auth.verify(code))),
    resendCode: () => perform(async () => { setChallenge(await gateway.auth.resend()); }, "Новый код запрошен."),
    cancelCode: () => perform(async () => { authSequence.current++; await gateway.auth.cancel(); setChallenge(null); }),
    switchProfile: (userId: string) => perform(() => authenticate(() => gateway.switchProfile(userId))),
    logout: () => perform(async () => { authSequence.current++; await gateway.logout(); notify.clear(); setChallenge(null); backgroundError.current = ""; selected.current = ""; pages.current = 1; viewerId.current = ""; setSnapshot(EMPTY_SNAPSHOT); channel.current?.postMessage("changed"); }, "Вы вышли из всех профилей на этом устройстве."),
    logoutAll: () => perform(async () => { authSequence.current++; await gateway.auth.logoutAll(); notify.clear(); setChallenge(null); backgroundError.current = ""; selected.current = ""; pages.current = 1; viewerId.current = ""; setSnapshot(EMPTY_SNAPSHOT); channel.current?.postMessage("changed"); }, "Все сеансы завершены. Для входа запросите новый код."),
  };
}

export type PortalController = ReturnType<typeof usePortal>;
