"use client";

import { useState } from "react";
import type { FormEvent } from "react";
import { Icon } from "@/components/ui/icon";
import { Empty, LongText, shortDate, WorkBadge } from "@/features/portal/components/ui";
import type { PortalController } from "@/features/portal/lib/use-portal";
import { STATUS_LABELS } from "@/features/portal/model/types";
import type { PortalProject, WorkItem, WorkStatus } from "@/features/portal/model/types";
import { repositoryKey, sameWorkSource } from "@/features/portal/model/project-repositories";
import { formatRubles, parseRubles } from "@/features/payments/model/payment";
import styles from "./portal.module.css";

function StatusSelect({ value, change }: { value: WorkStatus; change: (value: WorkStatus) => void }) {
  return <select aria-label="Статус" value={value} onChange={event => change(event.target.value as WorkStatus)}>{Object.entries(STATUS_LABELS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select>;
}

function StageEditor({ project, stage, controller, sourceId }: { project: PortalProject; stage?: WorkItem; controller: PortalController; sourceId?: string }) {
  const [title, setTitle] = useState(stage?.title ?? ""); const [body, setBody] = useState(stage?.body ?? ""); const [status, setStatus] = useState<WorkStatus>(stage?.status ?? "new");
  const [subprojectId, setSubprojectId] = useState(stage?.subprojectId ?? sourceId ?? "main");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (await controller.run({ type: "stage.save", projectId: project.id, number: stage?.number ?? 0, title, body, status, ...(project.subprojects?.length ? { subprojectId } : {}) }) && !stage) { setTitle(""); setBody(""); setStatus("new"); }
  }
  return (
    <details style={{ marginTop: 12 }}>
      <summary>{stage ? "Изменить этап" : "Добавить этап"}</summary>
      <form className={styles.form} onSubmit={event => void submit(event)}>
        {!stage && (project.subprojects?.length ?? 0) > 1 && (
          <label>
            Подпроект
            <select aria-label="Подпроект этапа" value={subprojectId} onChange={event => setSubprojectId(event.target.value)}>{project.subprojects?.map(part => <option key={part.id} value={part.id}>{part.name}</option>)}</select>
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
    </details>
  );
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
          <div className={styles.progressHeader}>
            <span>Завершённые этапы</span>
            <span>
              {Math.round(done / stages.length * 100)}
              %
            </span>
          </div>
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
                  <LongText text={stage.body} />
                  {developer && (project.subprojects?.length ?? 0) > 1 && <p className={styles.small}>{project.subprojects?.find(part => part.id === repositoryKey(stage.subprojectId))?.name}</p>}
                  {developer && <StageEditor key={`${stage.id}:${stage.updatedAt}`} project={project} stage={stage} controller={controller} />}
                </div>
              </article>
          ))}
          </div>
        </>
      ) : <Empty title="Всё начинается здесь" text="Разработчик добавит этапы, и вы увидите, как движется работа." />}
      {developer && <StageEditor key={subprojectId ?? "all"} project={project} controller={controller} {...(subprojectId ? { sourceId: subprojectId } : {})} />}
    </section>
  );
}

function TaskControls({ task, controller }: { task: WorkItem; controller: PortalController }) {
  const [status, setStatus] = useState(task.status); const [price, setPrice] = useState("");
  const kopecks = parseRubles(price);
  const scope = task.subprojectId ? { subprojectId: task.subprojectId } : {};
  const quote = controller.snapshot.quotes.find(quote => quote.projectId === task.projectId && quote.taskNumber === task.number && sameWorkSource(quote, task) && quote.status !== "superseded");
  return (
    <details>
      <summary>Управление задачей</summary>
      <form className={styles.inlineForm} onSubmit={event => { event.preventDefault(); void controller.run({ type: "task.status", projectId: task.projectId, number: task.number, status, ...scope }); }}>
        <label>
          Статус
          <StatusSelect value={status} change={setStatus} />
        </label>
        <button className={styles.secondary} type="submit" disabled={controller.busy}>Обновить</button>
      </form>
      {task.kind === "wish" && !task.included && quote?.status !== "paid" && (
        <>
          <form className={styles.inlineForm} onSubmit={event => { event.preventDefault(); if (kopecks) void controller.run({ type: "quote.create", projectId: task.projectId, number: task.number, baseKopecks: kopecks, ...scope }); }}>
            <label>
              Ваша стоимость, ₽
              <input inputMode="decimal" required maxLength={12} value={price} onChange={event => setPrice(event.target.value)} placeholder="10 000" />
            </label>
            <button className={styles.primary} type="submit" disabled={controller.busy || !kopecks}>Выставить оценку</button>
          </form>
          <p className={styles.small} style={{ marginTop: 10 }}>{kopecks ? `Клиенту с наценкой 30%: ${formatRubles(kopecks + Math.round(kopecks * .3))}` : "К вашей стоимости добавится 30%."}</p>
          <button className={styles.textButton} style={{ marginTop: 13 }} type="button" disabled={controller.busy} onClick={() => void controller.run({ type: "task.include", projectId: task.projectId, number: task.number, ...scope })}>Эта задача входит в оплаченное ТЗ</button>
        </>
      )}
    </details>
  );
}

export function Tasks({ project, controller, compact = false }: { project: PortalProject; controller: PortalController; compact?: boolean }) {
  const tasks = controller.snapshot.tasks.filter(task => task.projectId === project.id).sort((a, b) => b.number - a.number);
  return (
    <section className={styles.panel} aria-label="Задачи проекта">
      <div className={styles.panelHeader}>
        <h2>{compact ? "Сейчас в работе" : "Задачи"}</h2>
        <span className={styles.small}>{tasks.length ? `${tasks.length} всего` : ""}</span>
      </div>
      {tasks.length === 0 && <Empty title="Задач пока нет" text="Опишите пожелание в чате. После подтверждения оно появится здесь." icon="document" />}
      {tasks.slice(0, compact ? 3 : undefined).map(task => {
        const quote = controller.snapshot.quotes.find(quote => quote.projectId === project.id && quote.taskNumber === task.number && sameWorkSource(quote, task) && quote.status !== "superseded");
        return (
          <article key={task.id} className={styles.task}>
            <div className={styles.taskTop}>
              <div>
                <h3>
                  {controller.snapshot.viewer?.role === "developer" && (
                  <span className={styles.taskNumber}>
                    #
                    {task.number}
                  </span>
)}
                  {task.title}
                </h3>
                <div className={styles.meta}>
                  {controller.snapshot.viewer?.role === "developer" && (project.subprojects?.length ?? 0) > 1 && <span>{project.subprojects?.find(part => part.id === repositoryKey(task.subprojectId))?.name}</span>}
                  <span>{task.kind === "initial" ? "Первоначальное ТЗ" : task.included ? "Входит в ТЗ" : "Пожелание"}</span>
                  {quote && <span>{quote.status === "paid" ? "Оплачено · тест" : `${formatRubles(quote.totalKopecks)} · в чате`}</span>}
                </div>
              </div>
              <WorkBadge status={task.status} />
            </div>
            <LongText text={task.body} label="Описание задачи" />
            {controller.snapshot.viewer?.role === "developer" && <TaskControls key={`${task.id}:${task.status}:${task.included}`} task={task} controller={controller} />}
          </article>
        );
      })}
    </section>
  );
}

export function ProjectBrief({ project }: { project: PortalProject }) {
  return (
    <section className={`${styles.panel} ${styles.brief}`}>
      <Icon name="document" />
      <div>
        <h2>{project.origin === "import" ? "Описание проекта" : "Согласованное ТЗ"}</h2>
        {project.origin !== "import" && <p className={styles.subtitle}>Основная разработка оплачена</p>}
        <LongText text={project.brief} label="Открыть описание проекта" />
      </div>
    </section>
  );
}

export function CommitHistory({ controller }: { controller: PortalController }) {
  return (
    <section className={styles.panel} aria-label="История коммитов">
      <div className={styles.panelHeader}>
        <h2>История изменений</h2>
        <span className={styles.small}>GitHub</span>
      </div>
      {controller.snapshot.commits.length === 0 && <Empty title="Первый шаг впереди" text="Когда разработчик добавит код, здесь появится история с первого коммита." icon="code" />}
      {controller.snapshot.commits.map(commit => (
        <article className={styles.commit} key={`${repositoryKey(commit.subprojectId)}:${commit.sha}`}>
          <Icon name="code" />
          <div>
            <h3>{commit.title}</h3>
            <div className={styles.meta}>
              {controller.snapshot.viewer?.role === "developer" && <span>{controller.snapshot.projects.find(project => project.id === commit.projectId)?.subprojects?.find(part => part.id === repositoryKey(commit.subprojectId))?.name}</span>}
              <code>{commit.sha.slice(0, 7)}</code>
              <span>{commit.author}</span>
              <time dateTime={commit.createdAt}>{shortDate(commit.createdAt)}</time>
            </div>
          </div>
        </article>
      ))}
      {controller.snapshot.hasMoreCommits && <button className={styles.secondary} type="button" style={{ marginTop: 23 }} disabled={controller.busy} onClick={() => void controller.more()}>Загрузить более ранние коммиты</button>}
    </section>
  );
}
