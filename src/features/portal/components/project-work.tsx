"use client";

import { useState } from "react";
import type { FormEvent } from "react";
import { Icon } from "@/components/ui/icon";
import { Empty, shortDate, WorkBadge } from "@/features/portal/components/ui";
import type { PortalController } from "@/features/portal/lib/use-portal";
import { STATUS_LABELS } from "@/features/portal/model/types";
import type { PortalProject, WorkItem, WorkStatus } from "@/features/portal/model/types";
import { repositoryKey, sameTaskScope, sameWorkSource } from "@/features/portal/model/project-repositories";
import { formatRubles, parseRubles } from "@/features/payments/model/payment";
import styles from "./portal.module.css";
import { ActionsDialog, DetailDialog } from "@/features/portal/components/focus-dialog";
import { ProjectBriefContent } from "@/features/portal/components/client-brief";
import { TaskAnalysisNotice, TaskDecisionHistory, TaskProposals, TaskHistory } from "./task-proposals";
import taskStyles from "./task-proposals.module.css";
import { proposalInEditing, proposalStatus } from "@/features/portal/model/task-planning";
import { DeleteProject } from "@/features/portal/components/delete-confirmation";

function StatusSelect({ value, change }: { value: WorkStatus; change: (value: WorkStatus) => void }) {
  return <select aria-label="Статус" value={value} onChange={event => change(event.target.value as WorkStatus)}>{Object.entries(STATUS_LABELS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select>;
}

function StageEditor({ project, stage, controller, sourceId, embedded = false, onSaved }: { project: PortalProject; stage?: WorkItem; controller: PortalController; sourceId?: string; embedded?: boolean; onSaved?: () => void }) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState(stage?.title ?? ""); const [body, setBody] = useState(stage?.body ?? ""); const [status, setStatus] = useState<WorkStatus>(stage?.status ?? "new");
  const [subprojectId, setSubprojectId] = useState(stage?.subprojectId ?? sourceId ?? "main");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (await controller.run({ type: "stage.save", projectId: project.id, number: stage?.number ?? 0, title, body, status, ...(project.subprojects?.length ? { subprojectId } : {}) })) {
      if (!stage) { setTitle(""); setBody(""); setStatus("new"); }
      setOpen(false); onSaved?.();
    }
  }
  const form = (
    <form className={styles.form} onSubmit={event => void submit(event)}>
      {!stage && (project.subprojects?.length ?? 0) > 1 && (
      <label>
        Подпроект
        <select aria-label="Подпроект этапа" value={subprojectId} onChange={event => setSubprojectId(event.target.value)}>{project.subprojects?.filter(part => part.repo).map(part => <option key={part.id} value={part.id}>{part.name}</option>)}</select>
      </label>
        )}
      <label>
        Название
        <input required maxLength={200} value={title} onChange={event => setTitle(event.target.value)} />
      </label>
      <label>
        Описание
        <textarea maxLength={8000} value={body} onChange={event => setBody(event.target.value)} />
      </label>
      <label>
        Статус
        <StatusSelect value={status} change={setStatus} />
      </label>
      <button className={styles.primary} type="submit" disabled={controller.busy}>Сохранить этап</button>
    </form>
  );
  return embedded ? form : <DetailDialog label={stage ? "Изменить этап" : "Добавить этап"} open={open} onOpenChange={setOpen} busy={controller.busy}>{form}</DetailDialog>;
}

export function Stages({ project, controller, subprojectId }: { project: PortalProject; controller: PortalController; subprojectId?: string }) {
  const stages = controller.snapshot.stages.filter(stage => stage.projectId === project.id).sort((a, b) => a.number - b.number);
  const done = stages.filter(stage => stage.status === "done").length;
  const developer = controller.snapshot.viewer?.role === "developer";
  return (
    <section className={styles.panel} aria-label="Этапы проекта">
      <div className={styles.panelHeader}>
        <h2>Путь проекта</h2>
        <span className={styles.small}>{stages.length ? `${done} из ${stages.length}` : ""}</span>
      </div>
      {stages.length > 0 ? (
        <>
          <div className={styles.progress} aria-hidden="true">{stages.map(stage => <span key={stage.id} data-done={stage.status === "done"} />)}</div>
          <div className={styles.stageList}>
            {stages.map((stage, index) => (
              <article key={stage.id} className={styles.stage}>
                <span className={styles.step} data-status={stage.status} aria-hidden="true">{stage.status === "done" ? <Icon name="check" /> : String(index + 1).padStart(2, "0")}</span>
                <div className={styles.stageBody}>
                  <div className={styles.stageTitle}>
                    <h3>{stage.title}</h3>
                    <WorkBadge status={stage.status} />
                  </div>
                  {developer && (project.subprojects?.length ?? 0) > 1 && <p className={styles.small}>{project.subprojects?.find(part => part.id === repositoryKey(stage.subprojectId))?.name}</p>}
                  <ActionsDialog
                    label={`Действия этапа: ${stage.title}`}
                    actions={[
                    { label: "Описание этапа", icon: "document", content: <p>{stage.body || "Описание пока не добавлено."}</p> },
                    ...(developer ? [{ label: "Изменить этап", icon: "service" as const, content: (close: () => void) => <StageEditor key={`${stage.id}:${stage.updatedAt}`} project={project} stage={stage} controller={controller} embedded onSaved={close} /> }] : []),
                  ]}
                  />
                </div>
              </article>
          ))}
          </div>
        </>
      ) : <p className={styles.small}>{developer ? "Добавьте первый этап." : "Этапы пока не добавлены."}</p>}
      {developer && Boolean(project.repo) && <StageEditor key={subprojectId ?? "all"} project={project} controller={controller} {...(subprojectId ? { sourceId: subprojectId } : {})} />}
    </section>
  );
}

function TaskControls({ task, controller, onSaved }: { task: WorkItem; controller: PortalController; onSaved: () => void }) {
  const [status, setStatus] = useState(task.status); const [price, setPrice] = useState(task.priceKopecks === undefined ? "" : (task.priceKopecks / 100).toString());
  const kopecks = parseRubles(price);
  const scope = task.subprojectId ? { subprojectId: task.subprojectId } : {};
  const quote = controller.snapshot.quotes.find(quote => quote.projectId === task.projectId && quote.taskNumber === task.number && sameTaskScope(quote, task) && quote.status !== "superseded");
  return (
    <div className={styles.stack}>
      <form className={styles.inlineForm} onSubmit={event => { event.preventDefault(); void controller.run({ type: "task.status", projectId: task.projectId, number: task.number, status, ...scope }).then(done => { if (done) onSaved(); }); }}>
        <label>
          Статус
          <StatusSelect value={status} change={setStatus} />
        </label>
        <button className={styles.secondary} type="submit" disabled={controller.busy}>Обновить</button>
      </form>
      <form className={styles.inlineForm} onSubmit={event => { event.preventDefault(); if (kopecks) void controller.run({ type: "task.price", projectId: task.projectId, number: task.number, priceKopecks: kopecks, ...scope }).then(done => { if (done) onSaved(); }); }}>
        <label>
          Стоимость задачи, ₽
          <input aria-label="Стоимость задачи, ₽" inputMode="decimal" required maxLength={12} value={price} onChange={event => setPrice(event.target.value)} placeholder="10 000" />
        </label>
        <button className={styles.secondary} type="submit" disabled={controller.busy || !kopecks}>Сохранить стоимость</button>
        {task.priceKopecks !== undefined && <button className={styles.textButton} type="button" disabled={controller.busy} onClick={() => void controller.run({ type: "task.price", projectId: task.projectId, number: task.number, priceKopecks: null, ...scope }).then(done => { if (done) onSaved(); })}>Убрать стоимость</button>}
      </form>
      {task.kind === "wish" && !task.included && !task.paid && quote?.status !== "paid" && (
        <>
          <form className={styles.inlineForm} onSubmit={event => { event.preventDefault(); if (kopecks) void controller.run({ type: "quote.create", projectId: task.projectId, number: task.number, baseKopecks: kopecks, ...scope }).then(done => { if (done) onSaved(); }); }}>
            <label>
              Ваша стоимость, ₽
              <input inputMode="decimal" required maxLength={12} value={price} onChange={event => setPrice(event.target.value)} placeholder="10 000" />
            </label>
            <button className={styles.primary} type="submit" disabled={controller.busy || !kopecks}>Выставить оценку</button>
          </form>
          <p className={styles.small} style={{ marginTop: 10 }}>{kopecks ? `Клиенту с наценкой 30%: ${formatRubles(kopecks + Math.round(kopecks * .3))}` : "К вашей стоимости добавится 30%."}</p>
          <button className={styles.textButton} type="button" aria-label="Эта задача входит в оплаченное ТЗ" disabled={controller.busy} onClick={() => void controller.run({ type: "task.include", projectId: task.projectId, number: task.number, ...scope }).then(done => { if (done) onSaved(); })}>Включить в ТЗ</button>
        </>
      )}
    </div>
  );
}

function EditApprovedTask({ task, controller, onSaved }: { task: WorkItem; controller: PortalController; onSaved: () => void }) {
  const [title, setTitle] = useState(task.title);
  const [body, setBody] = useState(task.body);
  const [base] = useState({ title: task.title, body: task.body });
  return (
    <form className={styles.form} onSubmit={event => { event.preventDefault(); void controller.run({ type: "task.edit.propose", projectId: task.projectId, number: task.number, ...(task.subprojectId ? { subprojectId: task.subprojectId } : {}), title, body, baseTitle: base.title, baseBody: base.body }).then(saved => { if (saved) onSaved(); }); }}>
      <label>
        Название задачи
        <input aria-label="Название задачи" required maxLength={200} value={title} onChange={event => setTitle(event.target.value)} />
      </label>
      <label>
        Описание задачи
        <textarea aria-label="Описание задачи" required rows={8} maxLength={8000} value={body} onChange={event => setBody(event.target.value)} />
      </label>
      <p className={styles.small}>Изменения появятся в разделе «В процессе редактирования». Прежняя задача сохранится до одобрения новой формулировки.</p>
      <button type="submit" className={styles.primary} disabled={controller.busy || !title.trim() || !body.trim() || title === base.title && body === base.body}>Сохранить изменения</button>
    </form>
  );
}

function TaskCard({ task, project, controller }: { task: WorkItem; project: PortalProject; controller: PortalController }) {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const developer = controller.snapshot.viewer?.role === "developer";
  const pendingEdit = controller.snapshot.drafts.some(draft => draft.projectId === task.projectId && draft.taskNumber === task.number && sameWorkSource(draft, task) && proposalStatus(draft) === "pending");
  const quote = controller.snapshot.quotes.find(quote => quote.projectId === project.id && quote.taskNumber === task.number && sameTaskScope(quote, task) && quote.status !== "superseded");
  return (
    <article className={taskStyles.rowWrap}>
      <DetailDialog
        label={`Действия задачи: ${task.title}`}
        title={developer ? "Управление задачей" : "Описание задачи"}
        open={open}
        onOpenChange={value => { setOpen(value); if (!value) setEditing(false); }}
        busy={controller.busy}
        buttonClassName={taskStyles.row}
        triggerLabel={<>
          <span className={taskStyles.symbol}><Icon name={task.status === "done" ? "check" : "document"} /></span>
          <span className={taskStyles.rowText}>
            <span role="heading" aria-level={3}>{task.title}</span>
            <span>
              {developer ? `#${task.number} · ` : ""}
              {task.kind === "initial" ? "Первоначальное ТЗ" : task.included ? "Входит в ТЗ" : "Задача"}
              {task.priceKopecks !== undefined ? ` · ${formatRubles(task.priceKopecks)}` : ""}
              {developer && (project.subprojects?.length ?? 0) > 1 ? ` · ${project.subprojects?.find(part => part.id === repositoryKey(task.subprojectId))?.name ?? ""}` : ""}
            </span>
          </span>
          <WorkBadge status={task.status} />
          <Icon name="arrow" />
        </>}
      >
        {editing ? <EditApprovedTask task={task} controller={controller} onSaved={() => { setEditing(false); setOpen(false); }} /> : (
          <div className={styles.stack}>
            <h3>{task.title}</h3>
            <p>{task.body || "Описание пока не добавлено."}</p>
            {task.priceKopecks !== undefined && (
              <p className={styles.small}>
                Стоимость задачи:
                {formatRubles(task.priceKopecks)}
              </p>
            )}
            {(task.paid || quote?.status === "paid") ? <p className={styles.small}>Оплачено · тест</p> : quote && <p className={styles.small}>{formatRubles(quote.totalKopecks)}</p>}
            {developer && <TaskControls key={`${task.id}:${task.status}:${task.included}:${task.priceKopecks ?? ""}`} task={task} controller={controller} onSaved={() => setOpen(false)} />}
            {controller.snapshot.viewer?.role === "client" && task.kind === "wish" && task.status !== "canceled" && (pendingEdit ? <p className={styles.small}>Изменения ждут решения в разделе «В процессе редактирования».</p> : <button className={styles.secondary} type="button" disabled={controller.busy} onClick={() => setEditing(true)}>Изменить</button>)}
            <TaskHistory task={task} controller={controller} />
          </div>
)}
      </DetailDialog>
    </article>
  );
}

type TaskSection = "pending" | "approved" | "editing";

export function Tasks({ project, controller, compact = false, onOpenTasks }: { project: PortalProject; controller: PortalController; compact?: boolean; onOpenTasks?: () => void }) {
  const [section, setSection] = useState<TaskSection>(() => {
    const pending = controller.snapshot.drafts.filter(draft => draft.projectId === project.id && proposalStatus(draft) === "pending");
    return pending.some(draft => !proposalInEditing(draft)) ? "pending" : pending.length ? "editing" : "approved";
  });
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");
  const tasks = controller.snapshot.tasks.filter(task => task.projectId === project.id).sort((a, b) => Number(b.status === "in_progress") - Number(a.status === "in_progress") || b.number - a.number);
  const pending = controller.snapshot.drafts.filter(draft => draft.projectId === project.id && proposalStatus(draft) === "pending");
  const waiting = pending.filter(draft => !proposalInEditing(draft));
  const editing = pending.filter(proposalInEditing);
  const query = search.trim().toLocaleLowerCase("ru");
  const visible = tasks.filter(task => (!compact || ["new", "in_progress"].includes(task.status)) && (filter === "all" || task.status === filter) && (!query || `${task.title} ${task.body}`.toLocaleLowerCase("ru").includes(query)));
  const matching = (section === "editing" ? editing : waiting).filter(draft => !query || `${draft.title} ${draft.body}`.toLocaleLowerCase("ru").includes(query));
  return (
    <section className={styles.panel} aria-label="Задачи проекта">
      <div className={styles.panelHeader}>
        <h2>Задачи</h2>
        {compact && onOpenTasks && <button className={styles.textButton} type="button" onClick={onOpenTasks}>Все задачи</button>}
      </div>
      {compact ? (
        <>
          {pending.length > 0 && (
          <div className={taskStyles.summary}>
            <span>{`Ждут решения: ${pending.length}`}</span>
            <button className={styles.textButton} type="button" onClick={onOpenTasks}>Открыть задачи</button>
          </div>
)}
          <div className={taskStyles.list}>{visible.slice(0, 3).map(task => <TaskCard key={task.id} task={task} project={project} controller={controller} />)}</div>
          {!visible.length && !pending.length && <p className={styles.small}>Новых задач пока нет.</p>}
        </>
) : (
  <>
    <div className={taskStyles.sections} role="group" aria-label="Подразделы задач">
      {([["pending", "Ждут одобрения", waiting.length], ["approved", "Одобренные", tasks.length], ["editing", "В процессе редактирования", editing.length]] as const).map(([value, label, count]) => (
        <button key={value} type="button" aria-label={label} aria-pressed={section === value} onClick={() => setSection(value)}>
          <span>{label}</span>
          <span className={taskStyles.sectionCount}>{count}</span>
        </button>
))}
    </div>
    <div className={taskStyles.tools}>
      <input type="search" aria-label="Поиск задач" placeholder="Найти задачу" value={search} onChange={event => setSearch(event.target.value)} />
      {section === "approved" && (
      <select aria-label="Статус задач" value={filter} onChange={event => setFilter(event.target.value)}>
        <option value="all">Все статусы</option>
        {Object.entries(STATUS_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
      </select>
)}
    </div>
    <TaskAnalysisNotice controller={controller} projectId={project.id} />
    <div role="region" aria-label={section === "pending" ? "Ждут одобрения" : section === "approved" ? "Одобренные" : "В процессе редактирования"}>
      {section === "approved" ? <div className={taskStyles.list}>{visible.map(task => <TaskCard key={task.id} task={task} project={project} controller={controller} />)}</div> : <TaskProposals controller={controller} projectId={project.id} group={section} query={query} />}
      {!(section === "approved" ? visible.length : matching.length) && <p className={taskStyles.empty}>{query ? "Задачи не найдены." : section === "pending" ? "Все решения приняты. Новые пожелания появятся здесь." : section === "editing" ? "Задач на редактировании нет." : "Одобренных задач пока нет."}</p>}
    </div>
    <TaskDecisionHistory controller={controller} projectId={project.id} query={query} />
  </>
)}
    </section>
  );
}

export function ProjectInfo({ project, controller }: { project: PortalProject; controller: PortalController }) {
  return (
    <ActionsDialog
      label="О проекте"
      triggerLabel="О проекте"
      busy={controller.busy}
      actions={[
      { label: "Открыть описание проекта", icon: "document", content: <p>{project.brief || project.description || "Описание пока не добавлено."}</p> },
      ...(controller.snapshot.projectBriefs.some(brief => brief.projectId === project.id) ? [{ label: "Итоговый бриф", icon: "document" as const, content: <ProjectBriefContent brief={controller.snapshot.projectBriefs.find(brief => brief.projectId === project.id)} /> }] : []),
      ...(controller.snapshot.viewer?.role === "developer" && (!project.developerId || project.developerId === controller.snapshot.viewer.id) ? [{ label: "Удалить проект", icon: "trash" as const, danger: true, content: (close: () => void) => <DeleteProject project={project} controller={controller} onClose={close} /> }] : []),
    ]}
    />
  );
}

export function CommitHistory({ controller }: { controller: PortalController }) {
  return (
    <section className={styles.panel} aria-label="История коммитов">
      <div className={styles.panelHeader}>
        <h2>История изменений</h2>
      </div>
      {controller.snapshot.commits.length === 0 && <Empty title="Первый шаг впереди" text="Здесь появятся изменения проекта." icon="code" />}
      {controller.snapshot.commits.map(commit => (
        <article className={styles.commit} key={`${repositoryKey(commit.subprojectId)}:${commit.sha}`}>
          <Icon name="code" />
          <div>
            <h3>{commit.title}</h3>
            <div className={styles.meta}>
              {controller.snapshot.viewer?.role === "developer" && <span>{controller.snapshot.projects.find(project => project.id === commit.projectId)?.subprojects?.find(part => part.id === repositoryKey(commit.subprojectId))?.name}</span>}
              <time dateTime={commit.createdAt}>{shortDate(commit.createdAt)}</time>
            </div>
            <DetailDialog label="Подробности коммита" triggerLabel="Подробнее" title={commit.title}>
              <p>{`${commit.author}\n${new Date(commit.createdAt).toLocaleString("ru-RU")}\n\n${commit.sha}`}</p>
            </DetailDialog>
          </div>
        </article>
      ))}
      {controller.snapshot.hasMoreCommits && <button className={styles.secondary} type="button" style={{ marginTop: 23 }} disabled={controller.busy} onClick={() => void controller.more()}>Загрузить более ранние коммиты</button>}
    </section>
  );
}
