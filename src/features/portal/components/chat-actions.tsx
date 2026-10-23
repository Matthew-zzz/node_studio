"use client";

import { useId, useRef, useState } from "react";
import { Icon } from "@/components/ui/icon";
import { ClientBriefButton, ProjectBriefButton } from "@/features/portal/components/client-brief";
import type { PortalController } from "@/features/portal/lib/use-portal";
import type { Conversation } from "@/features/portal/model/types";
import portal from "./portal.module.css";
import styles from "./chat-actions.module.css";

export function ChatActions({ thread, controller }: { thread: Conversation; controller: PortalController }) {
  const [open, setOpen] = useState(false);
  const menu = useRef<HTMLDialogElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const id = useId();
  const renderTrigger = (showBrief: () => void) => (
    <>
      <button ref={trigger} type="button" className={styles.trigger} aria-label="Открыть действия диалога" aria-controls={id} aria-haspopup="dialog" aria-expanded={open} onClick={() => { menu.current?.showModal(); setOpen(true); }}><Icon name="more" /></button>
      <dialog ref={menu} id={id} className={`${portal.dialog} ${styles.menu}`} aria-label="Действия диалога" onClose={() => setOpen(false)} onClick={event => { if (event.target === event.currentTarget) menu.current?.close(); }}>
        <div className={styles.header}>
          <h2>Действия</h2>
          <button type="button" className={styles.trigger} aria-label="Закрыть действия диалога" onClick={() => menu.current?.close()}><Icon name="close" /></button>
        </div>
        <button type="button" className={styles.item} disabled={controller.busy} onClick={() => { menu.current?.close(); showBrief(); }}>
          <Icon name="document" />
          Итоговый бриф
        </button>
      </dialog>
    </>
  );
  const restoreFocus = () => trigger.current?.focus();
  if (thread.kind === "telegram") return <ClientBriefButton thread={thread} controller={controller} renderTrigger={renderTrigger} onClose={restoreFocus} />;
  const project = controller.snapshot.projects.find(project => project.id === thread.projectId);
  return <ProjectBriefButton brief={controller.snapshot.projectBriefs.find(brief => brief.projectId === thread.projectId)} projectName={project?.name ?? thread.name} renderTrigger={renderTrigger} onClose={restoreFocus} />;
}
