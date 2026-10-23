"use client";

import { useEffect, useRef, useState } from "react";
import { Notifications } from "@/components/ui/notifications";
import { Icon } from "@/components/ui/icon";
import { BRIEF_SECTIONS, briefText } from "@/features/portal/model/client-brief";
import type { Conversation } from "@/features/portal/model/types";
import type { PortalController } from "@/features/portal/lib/use-portal";
import { notify } from "@/lib/notifications";
import portal from "./portal.module.css";
import styles from "./client-brief.module.css";

const statuses = { queued: "Бриф поставлен в очередь", generating: "ИИ составляет итоговое ТЗ", retrying: "ИИ временно недоступен. Повторим автоматически.", failed: "Не удалось подготовить бриф. Администратор получил подробности ошибки.", ready: "Бриф готов" };

export function ClientBriefButton({ thread, controller }: { thread: Conversation; controller: PortalController }) {
  const [open, setOpen] = useState(false); const [fullText, setFullText] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const text = useRef<HTMLTextAreaElement>(null);
  const brief = controller.snapshot.clientBriefs?.find(brief => brief.threadId === thread.id);
  const document = brief?.document;
  const clientLabel = thread.username ? `${thread.name} · @${thread.username.replace(/^@/, "")}` : thread.name;
  const pending = Boolean(brief && ["queued", "generating", "retrying"].includes(brief.status));
  useEffect(() => {
    if (open && !dialog.current?.open) dialog.current?.showModal();
    if (!open && dialog.current?.open) dialog.current.close();
  }, [open]);
  async function copy() {
    if (!document) return;
    try { await navigator.clipboard.writeText(briefText(document)); notify.success("ТЗ скопировано. Его можно вставить при создании проекта."); }
    catch { setFullText(true); notify.info("Откройте текст ТЗ и скопируйте его вручную."); }
  }
  function show() {
    setOpen(true);
    if (!brief || brief.status === "failed" || brief.stale && brief.status === "ready") void controller.run({ type: "brief.generate", threadId: thread.id });
  }
  return (
    <>
      <button type="button" className={`${portal.secondary} ${styles.trigger}`} aria-label={`Итоговый бриф: ${clientLabel}`} disabled={controller.busy} onClick={show}>
        <Icon name="document" />
        Итоговый бриф
      </button>
      <dialog ref={dialog} className={`${portal.dialog} ${styles.dialog}`} aria-label={`Итоговый бриф: ${clientLabel}`} onClose={() => setOpen(false)}>
        {open && (
        <>
          <Notifications modal />
          <div className={styles.header}>
            <div>
              <span className={portal.kicker}>{clientLabel}</span>
              <h2>Итоговый бриф</h2>
            </div>
            <button type="button" className={portal.iconButton} aria-label="Закрыть итоговый бриф" onClick={() => dialog.current?.close()}><Icon name="close" /></button>
          </div>
          <p className={portal.small} role="status">{brief ? statuses[brief.status] : "Подготовим ТЗ по всей сохранённой переписке этого клиента."}</p>
          {brief && <p className={portal.small}>{`Сообщений в переписке на момент запуска: ${brief.messageCount}.`}</p>}
          {brief?.stale && document && <p className={portal.small}>После предыдущего брифа появились новые сообщения.</p>}
          {document && (
          <div className={styles.document}>
            <h3>{document.name}</h3>
            {brief?.generatedAt && <p className={portal.small}>{`Черновик ТЗ · ${new Date(brief.generatedAt).toLocaleString("ru-RU", { timeZone: "Europe/Moscow" })}`}</p>}
            {BRIEF_SECTIONS.map(section => (
              <details key={section.key}>
                <summary>{section.label}</summary>
                <p>{document[section.key]}</p>
              </details>
))}
          </div>
        )}
          <div className={styles.actions}>
            {document && <button type="button" className={portal.primary} onClick={() => void copy()}>Скопировать ТЗ</button>}
            <button type="button" className={portal.secondary} disabled={pending || controller.busy} onClick={() => void controller.run({ type: "brief.generate", threadId: thread.id, refresh: true })}>{pending ? "Готовим бриф…" : document ? "Обновить бриф" : "Сформировать бриф"}</button>
          </div>
          {document && (
          <details open={fullText} onToggle={event => setFullText(event.currentTarget.open)}>
            <summary>ТЗ целиком</summary>
            <textarea ref={text} readOnly aria-label="Полный текст ТЗ" rows={12} value={briefText(document)} onFocus={() => text.current?.select()} />
          </details>
)}
        </>
)}
      </dialog>
    </>
  );
}
