"use client";

import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { Notifications } from "@/components/ui/notifications";
import { Icon } from "@/components/ui/icon";
import { BRIEF_SECTIONS, briefText } from "@/features/portal/model/client-brief";
import type { BriefDocument, ProjectClientBrief as SharedBrief } from "@/features/portal/model/client-brief";
import type { Conversation } from "@/features/portal/model/types";
import type { PortalController } from "@/features/portal/lib/use-portal";
import { notify } from "@/lib/notifications";
import { Empty } from "@/features/portal/components/ui";
import portal from "./portal.module.css";
import styles from "./client-brief.module.css";

const statuses = { queued: "Бриф поставлен в очередь", generating: "ИИ составляет итоговое ТЗ", retrying: "ИИ временно недоступен. Повторим автоматически.", failed: "Не удалось подготовить бриф. Администратор получил подробности ошибки.", ready: "Бриф готов" };

interface BriefTriggerProps {
  renderTrigger?: (show: () => void) => ReactNode;
  onClose?: () => void;
}

export function ClientBriefButton({ thread, controller, renderTrigger, onClose }: { thread: Conversation; controller: PortalController } & BriefTriggerProps) {
  const [open, setOpen] = useState(false); const [fullText, setFullText] = useState(false);
  const [selectedProject, setSelectedProject] = useState<string | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const text = useRef<HTMLTextAreaElement>(null);
  const brief = controller.snapshot.clientBriefs?.find(brief => brief.threadId === thread.id);
  const document = brief?.document;
  const clientLabel = thread.username ? `${thread.name} · @${thread.username.replace(/^@/, "")}` : thread.name;
  const pending = Boolean(brief && ["queued", "generating", "retrying"].includes(brief.status));
  const linkedProjectId = brief?.projectId ?? "";
  const projectId = selectedProject ?? linkedProjectId;
  useEffect(() => {
    if (open && !dialog.current?.open) dialog.current?.showModal();
    if (!open && dialog.current?.open) dialog.current.close();
  }, [open]);
  async function copy() {
    if (!document) return;
    try { await navigator.clipboard.writeText(briefText(document)); notify.success("ТЗ скопировано. Его можно вставить при создании проекта.", { scope: "active" }); }
    catch { setFullText(true); notify.info("Откройте текст ТЗ и скопируйте его вручную."); }
  }
  function show() {
    setSelectedProject(null);
    setOpen(true);
    if (!brief || brief.status === "failed" || brief.stale && brief.status === "ready") void controller.run({ type: "brief.generate", threadId: thread.id });
  }
  return (
    <>
      {renderTrigger ? renderTrigger(show) : (
        <button type="button" className={`${portal.secondary} ${styles.trigger}`} aria-label={`Итоговый бриф: ${clientLabel}`} disabled={controller.busy} onClick={show}>
          <Icon name="document" />
          Итоговый бриф
        </button>
)}
      <dialog ref={dialog} className={`${portal.dialog} ${styles.dialog}`} aria-label={`Итоговый бриф: ${clientLabel}`} onClose={() => { setOpen(false); onClose?.(); }}>
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
          {brief?.stale && document && <p className={portal.small}>После предыдущего брифа появились новые сообщения.</p>}
          {brief && (
          <form className={`${portal.form} ${styles.linkForm}`} aria-label="Привязка брифа к проекту" onSubmit={event => { event.preventDefault(); void controller.run({ type: "brief.link", threadId: thread.id, projectId }); }}>
            <label>
              Проект для брифа
              <select aria-label="Проект для брифа" value={projectId} onChange={event => setSelectedProject(event.target.value)} disabled={controller.busy}>
                <option value="">Не привязан к проекту</option>
                {linkedProjectId && !controller.snapshot.briefProjects?.some(project => project.id === linkedProjectId) && <option value={linkedProjectId}>Проект недоступен</option>}
                {controller.snapshot.briefProjects?.map(project => <option key={project.id} value={project.id}>{`${project.name} · ${project.clientName} · ${project.clientEmail}`}</option>)}
              </select>
            </label>
            <button type="submit" className={portal.secondary} disabled={controller.busy || projectId === linkedProjectId}>Сохранить привязку</button>
          </form>
          )}
          {document && !fullText && <BriefDocumentContent document={document} generatedAt={brief?.generatedAt} />}
          <div className={styles.actions}>
            {document && <button type="button" className={portal.primary} onClick={() => void copy()}>Скопировать ТЗ</button>}
            <button type="button" className={portal.secondary} disabled={pending || controller.busy} onClick={() => void controller.run({ type: "brief.generate", threadId: thread.id, refresh: true })}>{pending ? "Готовим бриф…" : document ? "Обновить бриф" : "Сформировать бриф"}</button>
          </div>
          {document && (
          <div>
            <button className={portal.textButton} type="button" onClick={() => setFullText(!fullText)}>{fullText ? "Разделы брифа" : "ТЗ целиком"}</button>
            {fullText && <textarea ref={text} readOnly aria-label="Полный текст ТЗ" rows={12} value={briefText(document)} onFocus={() => text.current?.select()} />}
          </div>
)}
        </>
)}
      </dialog>
    </>
  );
}

export function ProjectBriefButton({ brief, projectName, renderTrigger, onClose }: { brief: SharedBrief | undefined; projectName: string; renderTrigger: (show: () => void) => ReactNode } & Pick<BriefTriggerProps, "onClose">) {
  const [open, setOpen] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => { if (open && !dialog.current?.open) dialog.current?.showModal(); }, [open]);
  return (
    <>
      {renderTrigger(() => setOpen(true))}
      <dialog ref={dialog} className={`${portal.dialog} ${styles.dialog}`} aria-label={`Итоговый бриф проекта: ${projectName}`} onClose={() => { setOpen(false); onClose?.(); }}>
        {open && (
          <>
            <Notifications modal />
            <div className={styles.header}>
              <div>
                <span className={portal.kicker}>{projectName}</span>
                <h2>Итоговый бриф</h2>
              </div>
              <button type="button" className={portal.iconButton} aria-label="Закрыть итоговый бриф" onClick={() => dialog.current?.close()}><Icon name="close" /></button>
            </div>
            <ProjectBriefContent brief={brief} />
          </>
        )}
      </dialog>
    </>
  );
}

function BriefDocumentContent({ document, generatedAt }: { document: BriefDocument; generatedAt?: string | undefined }) {
  return (
    <div className={styles.document}>
      <h3>{document.name}</h3>
      {generatedAt && <p className={portal.small}>{`Обновлён · ${new Date(generatedAt).toLocaleString("ru-RU", { timeZone: "Europe/Moscow" })}`}</p>}
      {BRIEF_SECTIONS.filter(section => document[section.key].trim() && !/^Не указано[.]?$/i.test(document[section.key].trim())).map(section => (
        <section key={section.key}>
          <h4>{section.label}</h4>
          <p>{document[section.key]}</p>
        </section>
      ))}
    </div>
  );
}

export function ProjectBriefContent({ brief }: { brief: SharedBrief | undefined }) {
  const [fullText, setFullText] = useState(false);
  if (!brief) return <Empty title="Бриф ещё не добавлен" text="Готовый документ появится здесь после привязки к проекту." icon="document" />;
  return (
    <section aria-label="Итоговый бриф проекта">
      {fullText ? <textarea className={styles.fullText} readOnly aria-label="Полный текст итогового брифа" rows={16} value={briefText(brief.document)} onFocus={event => event.currentTarget.select()} /> : <BriefDocumentContent document={brief.document} generatedAt={brief.generatedAt} />}
      <button type="button" className={portal.textButton} onClick={() => setFullText(!fullText)}>{fullText ? "Разделы брифа" : "ТЗ целиком"}</button>
    </section>
  );
}
