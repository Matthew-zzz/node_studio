"use client";

import { useState } from "react";
import { Icon } from "@/components/ui/icon";
import type { PortalController } from "@/features/portal/lib/use-portal";
import type { TaskDraft, WorkItem } from "@/features/portal/model/types";
import { sameWorkSource } from "@/features/portal/model/project-repositories";
import { proposalInEditing, proposalStatus } from "@/features/portal/model/task-planning";
import { DetailDialog } from "./focus-dialog";
import portal from "./portal.module.css";
import styles from "./task-proposals.module.css";

const labels = { pending: "Ожидает решения", approved: "Одобрено", rejected: "Отклонено", withdrawn: "Отозвано по переписке" };
const kinds = { create: "Новая задача", update: "Изменение задачи", cancel: "Отмена задачи" };

function ProposalText({ text }: { text: string }) {
  return <p className={styles.body}>{text}</p>;
}

function EditProposal({ draft, controller, onClose }: { draft: TaskDraft; controller: PortalController; onClose: () => void }) {
  const [title, setTitle] = useState(draft.title);
  const [body, setBody] = useState(draft.body);
  const [revision] = useState(draft.revision ?? 0);
  return (
    <form className={portal.form} onSubmit={event => { event.preventDefault(); void controller.run({ type: "draft.edit", draftId: draft.id, revision, title, body }).then(saved => { if (saved) onClose(); }); }}>
      <label>
        Название задачи
        <input aria-label="Название задачи" required maxLength={200} value={title} onChange={event => setTitle(event.target.value)} />
      </label>
      <label>
        Описание задачи
        <textarea aria-label="Описание задачи" required rows={8} maxLength={8000} value={body} onChange={event => setBody(event.target.value)} />
      </label>
      {revision !== (draft.revision ?? 0) && <p role="status" className={styles.notice}>Появилась новая версия. Закройте редактор и проверьте изменения.</p>}
      <p className={portal.small}>Сохранённая формулировка появится в разделе «В процессе редактирования» и будет ждать вашего решения.</p>
      <div className={styles.actions}>
        <button className={portal.primary} type="submit" disabled={controller.busy || revision !== (draft.revision ?? 0) || !title.trim() || !body.trim()}>Сохранить формулировку</button>
        <button className={portal.secondary} type="button" disabled={controller.busy} onClick={onClose}>Отменить редактирование</button>
      </div>
    </form>
  );
}

function ProposalCard({ draft, controller, analyzing, onClose }: { draft: TaskDraft; controller: PortalController; analyzing: boolean; onClose: () => void }) {
  const [editing, setEditing] = useState(false);
  const status = proposalStatus(draft);
  const pending = status === "pending";
  const client = controller.snapshot.viewer?.role === "client";
  const project = controller.snapshot.projects.find(project => project.id === draft.projectId);
  const ready = client ? project?.repositoryReady !== false : Boolean(project?.repo);
  const approveLabel = draft.kind === "cancel" ? "Одобрить отмену" : draft.kind === "update" ? "Одобрить изменения" : "Одобрить задачу";
  if (editing) return <EditProposal draft={draft} controller={controller} onClose={() => setEditing(false)} />;
  return (
    <article className={styles.card} data-status={status} aria-label={`${kinds[draft.kind ?? "create"]}: ${draft.title}`}>
      <div className={styles.meta}>
        <span>{kinds[draft.kind ?? "create"]}</span>
        {!pending && <span>{labels[status]}</span>}
      </div>
      <ProposalText text={draft.body} />
      {draft.kind === "update" && (
      <details className={styles.details}>
        <summary>{pending ? "Что изменится" : "Что изменилось"}</summary>
        <div className={styles.comparison}>
          <div>
            <strong>Было</strong>
            <p>{draft.baseTitle}</p>
            <ProposalText text={draft.baseBody ?? ""} />
          </div>
          <div>
            <strong>Станет</strong>
            <p>{draft.title}</p>
            <ProposalText text={draft.body} />
          </div>
        </div>
      </details>
)}
      {pending && (client ? (
        <>
          <div className={styles.actions}>
            <button type="button" className={portal.primary} disabled={controller.busy || !ready || analyzing} onClick={() => void controller.run({ type: "draft.confirm", draftId: draft.id, revision: draft.revision ?? 0 }).then(saved => { if (saved) onClose(); })}>{approveLabel}</button>
            <button type="button" className={portal.secondary} disabled={controller.busy} onClick={() => void controller.run({ type: "draft.reject", draftId: draft.id, revision: draft.revision ?? 0 }).then(saved => { if (saved) onClose(); })}>Отклонить</button>
          </div>
          {draft.kind !== "cancel" && <button type="button" className={portal.textButton} disabled={controller.busy} onClick={() => setEditing(true)}>Изменить</button>}
          {!ready && <p className={portal.small}>Одобрение станет доступно после подготовки проекта.</p>}
        </>
) : <p className={portal.small}>Ожидает решения клиента</p>)}
      {(Boolean(draft.sourceText) || (draft.history?.length ?? 0) > 1) && (
      <details className={styles.details}>
        <summary>История изменений</summary>
        {draft.reason && <p className={styles.reason}>{draft.reason}</p>}
        {draft.sourceText && <p className={styles.source}>{draft.sourceText}</p>}
        <ol className={styles.history}>
          {draft.history?.map(version => (
            <li key={version.id}>
              <div className={styles.meta}>
                <span>
                  Версия
                  {version.revision}
                  {' '}
                  ·
                  {labels[version.status]}
                </span>
                <span>{version.changedBy}</span>
              </div>
              <strong>{version.title}</strong>
              <ProposalText text={version.body} />
              {version.reason && <p className={portal.small}>{version.reason}</p>}
            </li>
))}
        </ol>
      </details>
)}
    </article>
  );
}

function ProposalRow({ draft, controller, analyzing }: { draft: TaskDraft; controller: PortalController; analyzing: boolean }) {
  const [open, setOpen] = useState(false);
  const status = proposalStatus(draft);
  const project = controller.snapshot.projects.find(project => project.id === draft.projectId);
  const source = project?.subprojects?.find(part => part.id === (draft.subprojectId ?? "main"));
  return (
    <DetailDialog
      label={`Действия предложения: ${draft.title}`}
      title={draft.title}
      open={open}
      onOpenChange={setOpen}
      busy={controller.busy}
      className={styles.rowWrap}
      buttonClassName={styles.row}
      triggerLabel={<>
        <span className={styles.symbol}><Icon name={draft.kind === "cancel" ? "close" : proposalInEditing(draft) ? "service" : "document"} /></span>
        <span className={styles.rowText}>
          <strong>{draft.title}</strong>
          <span>
            {status === "pending" ? kinds[draft.kind ?? "create"] : labels[status]}
            {source && (project?.subprojects?.length ?? 0) > 1 ? ` · ${source.name}` : ""}
          </span>
        </span>
        <Icon name="arrow" />
      </>}
    >
      <ProposalCard key={String(open)} draft={draft} controller={controller} analyzing={analyzing} onClose={() => setOpen(false)} />
    </DetailDialog>
  );
}

export function TaskAnalysisNotice({ controller, projectId }: { controller: PortalController; projectId: string }) {
  const states = (controller.snapshot.taskAnalysis ?? []).filter(state => state.projectId === projectId);
  const analyzing = states.some(state => ["queued", "analyzing", "retrying"].includes(state.status));
  const failed = states.some(state => state.status === "failed");
  return (
    <>
      {analyzing && <p className={styles.notice} role="status">{states.some(state => state.status === "retrying") ? "Не удалось обновить задачи. Повторим автоматически." : "Учитываем последние сообщения…"}</p>}
      {failed && (
      <p className={styles.notice} role="status">
        Не удалось обновить задачи.
        <button className={portal.textButton} type="button" disabled={controller.busy} onClick={() => void controller.run({ type: "tasks.analyze", projectId })}>Повторить анализ</button>
      </p>
)}
    </>
  );
}

export function TaskProposals({ controller, projectId, group = "pending", query = "" }: { controller: PortalController; projectId: string; group?: "pending" | "editing" | "history"; query?: string }) {
  const drafts = controller.snapshot.drafts.filter(draft => draft.projectId === projectId && (group === "history" ? ["rejected", "withdrawn"].includes(proposalStatus(draft)) : proposalStatus(draft) === "pending" && proposalInEditing(draft) === (group === "editing")) && (!query || `${draft.title} ${draft.body}`.toLocaleLowerCase("ru").includes(query))).sort((a, b) => (b.updatedAt ?? b.createdAt).localeCompare(a.updatedAt ?? a.createdAt));
  const analyzing = (controller.snapshot.taskAnalysis ?? []).some(state => state.projectId === projectId && ["queued", "analyzing", "retrying"].includes(state.status));
  return <div className={styles.list}>{drafts.map(draft => <ProposalRow key={draft.id} draft={draft} controller={controller} analyzing={analyzing} />)}</div>;
}

export function TaskDecisionHistory({ controller, projectId, query = "" }: { controller: PortalController; projectId: string; query?: string }) {
  const drafts = controller.snapshot.drafts.filter(draft => draft.projectId === projectId);
  if (!drafts.some(draft => ["rejected", "withdrawn"].includes(proposalStatus(draft)) && (!query || `${draft.title} ${draft.body}`.toLocaleLowerCase("ru").includes(query)))) return null;
  return (
    <details className={styles.decisionHistory}>
      <summary>История решений</summary>
      <TaskProposals controller={controller} projectId={projectId} group="history" query={query} />
    </details>
  );
}

export function TaskHistory({ task, controller }: { task: WorkItem; controller: PortalController }) {
  const drafts = controller.snapshot.drafts.filter(draft => draft.projectId === task.projectId && draft.taskNumber === task.number && sameWorkSource(draft, task) && proposalStatus(draft) !== "pending");
  if (!drafts.length) return null;
  return (
    <details className={styles.details}>
      <summary>История изменений</summary>
      <div className={styles.historyCards}>{drafts.map(draft => <ProposalCard key={draft.id} draft={draft} controller={controller} analyzing={false} onClose={() => {}} />)}</div>
    </details>
  );
}
