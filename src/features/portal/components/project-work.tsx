"use client";

import { useState } from "react";
import type { FormEvent } from "react";
import { Icon } from "@/components/ui/icon";
import { Empty, shortDate, WorkBadge } from "@/features/portal/components/ui";
import type { PortalController } from "@/features/portal/lib/use-portal";
import { STATUS_LABELS } from "@/features/portal/model/types";
import type { PortalProject, WorkItem, WorkStatus } from "@/features/portal/model/types";
import { repositoryKey, sameTaskScope } from "@/features/portal/model/project-repositories";
import { formatRubles, parseRubles } from "@/features/payments/model/payment";
import styles from "./portal.module.css";
import { ActionsDialog, DetailDialog } from "@/features/portal/components/focus-dialog";
import { ProjectBriefContent } from "@/features/portal/components/client-brief";
import { TaskProposals } from "./task-proposals";
import { proposalStatus } from "@/features/portal/model/task-planning";
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
  const [status, setStatus] = useState(task.status); const [price, setPrice] = useState("");
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

function TaskCard({ task, project, controller }: { task: WorkItem; project: PortalProject; controller: PortalController }) {
  const [open, setOpen] = useState(false);
  const developer = controller.snapshot.viewer?.role === "developer";
  const quote = controller.snapshot.quotes.find(quote => quote.projectId === project.id && quote.taskNumber === task.number && sameTaskScope(quote, task) && quote.status !== "superseded");
  return (
    <article className={styles.task}>
      <div className={styles.taskTop}>
        <div>
          <h3>
            {developer && <span className={styles.taskNumber}>{`#${task.number}`}</span>}
            {task.title}
          </h3>
          <div className={styles.meta}>
            {developer && (project.subprojects?.length ?? 0) > 1 && <span>{project.subprojects?.find(part => part.id === repositoryKey(task.subprojectId))?.name}</span>}
            {task.kind === "initial" ? <span>Первоначальное ТЗ</span> : task.included && <span>Входит в ТЗ</span>}
            {task.paid || quote?.status === "paid" ? <span>Оплачено · тест</span> : quote && <span>{formatRubles(quote.totalKopecks)}</span>}
          </div>
        </div>
        <WorkBadge status={task.status} />
      </div>
      <DetailDialog label={`Действия задачи: ${task.title}`} triggerLabel={developer ? "Управление" : "Подробнее"} title={developer ? "Управление задачей" : "Описание задачи"} open={open} onOpenChange={setOpen} busy={controller.busy}>
        <div className={styles.stack}>
          <h3>{task.title}</h3>
          <p>{task.body || "Описание пока не добавлено."}</p>
          {developer && <TaskControls key={`${task.id}:${task.status}:${task.included}`} task={task} controller={controller} onSaved={() => setOpen(false)} />}
        </div>
      </DetailDialog>
    </article>
  );
}

export function Tasks({ project, controller, compact = false, onOpenTasks }: { project: PortalProject; controller: PortalController; compact?: boolean; onOpenTasks?: () => void }) {
  const [filter, setFilter] = useState<"active" | "closed" | "all">("active");
  const [search, setSearch] = useState("");
  const tasks = controller.snapshot.tasks.filter(task => task.projectId === project.id).sort((a, b) => Number(b.status === "in_progress") - Number(a.status === "in_progress") || b.number - a.number);
  const active = tasks.filter(task => task.status === "new" || task.status === "in_progress");
  const closed = tasks.filter(task => task.status === "done" || task.status === "canceled");
  const query = search.trim().toLocaleLowerCase("ru");
  const pendingMatches = controller.snapshot.drafts.some(draft => draft.projectId === project.id && proposalStatus(draft) === "pending" && (!query || `${draft.title} ${draft.body}`.toLocaleLowerCase("ru").includes(query)));
  const visible = (compact || filter === "active" ? active : filter === "closed" ? closed : tasks).filter(task => !query || `${task.title} ${task.body}`.toLocaleLowerCase("ru").includes(query));
  return (
    <section className={styles.panel} aria-label="Задачи проекта">
      <div className={styles.panelHeader}>
        <h2>Задачи</h2>
        {compact && onOpenTasks && <button className={styles.textButton} type="button" onClick={onOpenTasks}>Все задачи</button>}
      </div>
      {!compact && tasks.length > 0 && (
        <div className={styles.listTools}>
          <div className={styles.filters} role="group" aria-label="Фильтр задач">
            {([["active", "Текущие", active.length], ["closed", "Завершённые", closed.length], ["all", "Все", tasks.length]] as const).map(([value, label, count]) => (
              <button key={value} type="button" aria-label={label} aria-pressed={filter === value} onClick={() => setFilter(value)}>
                {label}
                <span className={styles.filterCount}>{count}</span>
              </button>
))}
          </div>
          <input type="search" aria-label="Поиск задач" placeholder="Найти задачу" value={search} onChange={event => setSearch(event.target.value)} />
        </div>
      )}
      {(compact || filter !== "closed") && <TaskProposals controller={query ? { ...controller, snapshot: { ...controller.snapshot, drafts: controller.snapshot.drafts.filter(draft => `${draft.title} ${draft.body}`.toLocaleLowerCase("ru").includes(query)) } } : controller} projectId={project.id} compact={compact} summary={compact} {...(onOpenTasks ? { onOpenTasks } : {})} />}
      {visible.slice(0, compact ? 3 : undefined).map(task => <TaskCard key={task.id} task={task} project={project} controller={controller} />)}
      {!visible.length && ((filter === "closed" && !compact) || !pendingMatches) && <p className={styles.small}>{query ? "Задачи не найдены." : filter === "closed" && !compact ? "Завершённых задач пока нет." : tasks.length ? "Текущих задач нет." : "Новых задач пока нет. Напишите пожелание в чате."}</p>}
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
