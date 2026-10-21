"use client";

import { useState } from "react";
import { Empty, WorkBadge } from "@/features/portal/components/ui";
import type { PortalController } from "@/features/portal/lib/use-portal";
import styles from "./portal.module.css";

type QueueFilter = "all" | "estimate" | "in_progress" | "payment";
const filters: { id: QueueFilter; label: string }[] = [
  { id: "all", label: "Все задачи" },
  { id: "estimate", label: "Нужна оценка" },
  { id: "in_progress", label: "В работе" },
  { id: "payment", label: "Ждём оплату" },
];

interface DeveloperQueueProps {
  controller: PortalController;
  onOpenTask: (projectId: string) => void;
  onOpenChat: (projectId: string) => void;
}

export function DeveloperQueue({ controller, onOpenTask, onOpenChat }: DeveloperQueueProps) {
  const [filter, setFilter] = useState<QueueFilter>("all");
  const [search, setSearch] = useState("");
  const { snapshot } = controller;
  const tasks = snapshot.tasks.filter(task => !["done", "canceled"].includes(task.status)).map(task => {
    const project = snapshot.projects.find(project => project.id === task.projectId);
    const quote = snapshot.quotes.find(quote => quote.projectId === task.projectId && quote.taskNumber === task.number && quote.status !== "superseded");
    return { task, project, quote, needsEstimate: task.kind === "wish" && !task.included && !quote, needsPayment: !task.included && quote?.status === "pending" };
  });
  const matchesFilter = (row: typeof tasks[number], selected: QueueFilter) => selected === "all" || (selected === "estimate" ? row.needsEstimate : selected === "payment" ? row.needsPayment : row.task.status === "in_progress");
  const query = search.trim().toLocaleLowerCase("ru");
  const visible = tasks.filter(row => matchesFilter(row, filter) && `${row.task.title} ${row.task.number} ${row.project?.name ?? ""} ${row.project?.clientName ?? ""}`.toLocaleLowerCase("ru").includes(query));
  const handoffs = snapshot.conversations.filter(thread => thread.handoffRequested && !thread.ownerId);

  return (
    <div className={styles.stack}>
      {handoffs.length > 0 && (
        <section className={styles.panel} aria-label="Ожидают разработчика">
          <div className={styles.panelHeader}>
            <h2>Клиенты ждут ответа</h2>
            <span className={styles.small}>{handoffs.length}</span>
          </div>
          {handoffs.map(thread => (
            <div className={styles.queueItem} key={thread.id}>
              <div>
                <h3>{thread.name}</h3>
                <p className={styles.small}>Запрошено подключение разработчика</p>
              </div>
              <button className={styles.secondary} type="button" onClick={() => onOpenChat(thread.projectId)}>Открыть диалог</button>
            </div>
          ))}
        </section>
      )}
      <section className={styles.panel} aria-label="Общая очередь задач">
        <div className={styles.panelHeader}>
          <h2>Задачи всех проектов</h2>
        </div>
        <div className={styles.queueTools}>
          <div className={styles.filters} role="group" aria-label="Фильтр задач">
            {filters.map(item => (
              <button key={item.id} type="button" aria-label={item.label} aria-pressed={filter === item.id} onClick={() => setFilter(item.id)}>
                {item.label}
                <span>{tasks.filter(row => matchesFilter(row, item.id)).length}</span>
              </button>
            ))}
          </div>
          <div className={styles.searchField}>
            <input type="search" aria-label="Поиск задач" value={search} onChange={event => setSearch(event.target.value)} placeholder="Задача, проект или клиент" />
          </div>
        </div>
        {visible.length === 0 && <Empty title={tasks.length ? "Ничего не найдено" : "Очередь свободна"} text={tasks.length ? "Попробуйте другой запрос или сбросьте фильтры." : "Новые задачи появятся после подтверждения клиентом."} icon={tasks.length ? "search" : "check"} />}
        {visible.length === 0 && tasks.length > 0 && <button className={styles.secondary} type="button" onClick={() => { setSearch(""); setFilter("all"); }}>Сбросить фильтры</button>}
        {visible.map(({ task, project, quote, needsEstimate }) => (
          <article className={styles.queueItem} key={task.id}>
            <div>
              <span className={styles.small}>
                {project?.name}
                {' '}
                · #
                {task.number}
              </span>
              <h3>{task.title}</h3>
              <div className={styles.meta}>
                <WorkBadge status={task.status} />
                <span>{task.included ? "В оплаченном ТЗ" : quote?.status === "paid" ? "Оплачено · тест" : needsEstimate ? "Нужна оценка" : "Ожидает оплаты"}</span>
              </div>
            </div>
            <button type="button" className={styles.secondary} onClick={() => onOpenTask(task.projectId)}>Открыть</button>
          </article>
        ))}
      </section>
    </div>
  );
}
