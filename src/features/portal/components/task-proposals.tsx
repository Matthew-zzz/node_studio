"use client";

import { useState } from "react";
import type { PortalController } from "@/features/portal/lib/use-portal";
import type { TaskDraft } from "@/features/portal/model/types";
import { proposalStatus } from "@/features/portal/model/task-planning";
import { DetailDialog } from "./focus-dialog";
import { LongText } from "./ui";
import portal from "./portal.module.css";
import styles from "./task-proposals.module.css";

const labels = { pending: "Ожидает решения", approved: "Одобрено", rejected: "Отклонено", withdrawn: "Отозвано по переписке" };
const kinds = { create: "Новая задача", update: "Изменение задачи", cancel: "Отмена задачи" };

function ProposalText({ text, label }: { text: string; label: string }) {
  return (
    <div>
      <p className={styles.body}>{text.length > 600 ? `${text.slice(0, 600)}…` : text}</p>
      {text.length > 600 && <LongText text={text} label={label} />}
    </div>
  );
}

function EditProposal({ draft, controller }: { draft: TaskDraft; controller: PortalController }) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState(draft.title);
  const [body, setBody] = useState(draft.body);
  const [revision, setRevision] = useState(draft.revision ?? 0);
  return (
    <DetailDialog
      label="Уточнить формулировку"
      title="Уточнить задачу"
      open={open}
      busy={controller.busy}
      onOpenChange={value => {
    if (value && !open) { setTitle(draft.title); setBody(draft.body); setRevision(draft.revision ?? 0); }
    setOpen(value);
  }}
    >
      <form className={portal.form} onSubmit={event => { event.preventDefault(); void controller.run({ type: "draft.edit", draftId: draft.id, revision, title, body }).then(saved => { if (saved) setOpen(false); }); }}>
        <label>
          Название задачи
          <input aria-label="Название задачи" required maxLength={200} value={title} onChange={event => setTitle(event.target.value)} />
        </label>
        <label>
          Описание задачи
          <textarea aria-label="Описание задачи" required rows={8} maxLength={8000} value={body} onChange={event => setBody(event.target.value)} />
        </label>
        <p className={portal.small}>После сохранения одобрите задачу отдельно.</p>
        <button className={portal.primary} type="submit" disabled={controller.busy || !title.trim() || !body.trim()}>Сохранить формулировку</button>
      </form>
    </DetailDialog>
  );
}

function ProposalCard({ draft, controller, analyzing }: { draft: TaskDraft; controller: PortalController; analyzing: boolean }) {
  const status = proposalStatus(draft);
  const pending = status === "pending";
  const client = controller.snapshot.viewer?.role === "client";
  const project = controller.snapshot.projects.find(project => project.id === draft.projectId);
  const ready = client ? project?.repositoryReady !== false : Boolean(project?.repo);
  const approveLabel = draft.kind === "cancel" ? "Одобрить отмену" : draft.kind === "update" ? "Одобрить изменения" : draft.revision === undefined ? "Подтвердить и отправить задачу" : "Одобрить задачу";
  return (
    <article className={styles.card} data-status={status} aria-label={`${kinds[draft.kind ?? "create"]}: ${draft.title}`}>
      <div className={styles.meta}>
        <span>{kinds[draft.kind ?? "create"]}</span>
        {!pending && <span>{labels[status]}</span>}
      </div>
      <h3>{draft.title}</h3>
      <ProposalText text={draft.body} label="Показать формулировку" />
      {draft.kind === "update" && (
      <details className={styles.details}>
        <summary>Что изменится</summary>
        <div className={styles.comparison}>
          <div>
            <strong>Было</strong>
            <p>{draft.baseTitle}</p>
            <ProposalText text={draft.baseBody ?? ""} label="Прежнее описание" />
          </div>
          <div>
            <strong>Станет</strong>
            <p>{draft.title}</p>
            <ProposalText text={draft.body} label="Новое описание" />
          </div>
        </div>
      </details>
)}
      {pending && (client ? (
        <>
          <div className={styles.actions}>
            <button type="button" className={portal.primary} disabled={controller.busy || !ready || analyzing} onClick={() => void controller.run({ type: "draft.confirm", draftId: draft.id, revision: draft.revision ?? 0 })}>{approveLabel}</button>
            <button type="button" className={portal.secondary} disabled={controller.busy} onClick={() => void controller.run({ type: "draft.reject", draftId: draft.id, revision: draft.revision ?? 0 })}>Отклонить</button>
          </div>
          {draft.kind !== "cancel" && <EditProposal draft={draft} controller={controller} />}
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
              <ProposalText text={version.body} label="Описание этой версии" />
              {version.reason && <p className={portal.small}>{version.reason}</p>}
            </li>
))}
        </ol>
      </details>
)}
    </article>
  );
}

export function TaskProposals({ controller, projectId, threadId, compact = false, summary = false, onOpenTasks }: { controller: PortalController; projectId?: string; threadId?: string; compact?: boolean; summary?: boolean; onOpenTasks?: () => void }) {
  const drafts = controller.snapshot.drafts.filter(draft => (projectId ? draft.projectId === projectId : draft.threadId === threadId));
  const pending = drafts.filter(draft => proposalStatus(draft) === "pending");
  const history = drafts.filter(draft => proposalStatus(draft) !== "pending").sort((a, b) => (b.updatedAt ?? b.createdAt).localeCompare(a.updatedAt ?? a.createdAt));
  const states = (controller.snapshot.taskAnalysis ?? []).filter(state => projectId ? state.projectId === projectId : state.threadId === threadId);
  const analyzing = states.some(state => ["queued", "analyzing", "retrying"].includes(state.status));
  const failed = states.some(state => state.status === "failed");
  const targetId = projectId ?? states[0]?.projectId ?? drafts[0]?.projectId;
  if (!pending.length && !analyzing && !failed && (compact || !history.length)) return null;
  if (summary && onOpenTasks) return (
    <div className={styles.summary}>
      <span>{analyzing ? "Обновляем задачи…" : failed ? "Не удалось обновить задачи" : `На согласовании: ${pending.length}`}</span>
      <button type="button" className={portal.textButton} onClick={onOpenTasks}>Проверить задачи</button>
    </div>
  );
  return (
    <section className={styles.root} aria-label="Согласование задач">
      <div className={styles.heading}>
        <div>
          <h3>{pending.length ? "На согласовании" : "Решения по задачам"}</h3>
        </div>
        {pending.length > 0 && <span className={styles.count}>{pending.length}</span>}
      </div>
      {analyzing && <p className={styles.notice} role="status">{states.some(state => state.status === "retrying") ? "Не удалось обновить задачи. Повторим автоматически." : "Учитываем последние сообщения…"}</p>}
      {failed && <p className={styles.notice} role="status">Не удалось обновить задачи. Попробуйте ещё раз.</p>}
      {pending.map(draft => <ProposalCard key={draft.id} draft={draft} controller={controller} analyzing={analyzing} />)}
      {!compact && history.length > 0 && (
      <details className={styles.details}>
        <summary>
          Принятые решения ·
          {history.length}
        </summary>
        <div className={styles.historyCards}>{history.map(draft => <ProposalCard key={draft.id} draft={draft} controller={controller} analyzing={false} />)}</div>
      </details>
)}
      {targetId && controller.snapshot.integrations.ai && !analyzing && !compact && <button className={portal.textButton} type="button" aria-label={failed ? "Повторить анализ" : "Обновить задачи из переписки"} disabled={controller.busy} onClick={() => void controller.run({ type: "tasks.analyze", projectId: targetId })}>{failed ? "Повторить анализ" : "Обновить"}</button>}
    </section>
  );
}
