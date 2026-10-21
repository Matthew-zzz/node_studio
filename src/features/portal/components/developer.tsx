"use client";

import { useState } from "react";
import { Empty } from "@/features/portal/components/ui";
import type { PortalController } from "@/features/portal/lib/use-portal";
import styles from "./portal.module.css";

interface DeveloperQueueProps {
  controller: PortalController;
  onAcceptProject: (projectId: string, tab: "overview" | "chat") => void;
  onOpenChat: (projectId: string) => void;
}

export function DeveloperQueue({ controller, onAcceptProject, onOpenChat }: DeveloperQueueProps) {
  const [search, setSearch] = useState("");
  const { snapshot, busy } = controller;
  const projects = snapshot.projects.filter(project => project.status === "active" && !project.developerId);
  const query = search.trim().toLocaleLowerCase("ru");
  const visible = projects.filter(project => `${project.name} ${project.clientName} ${project.clientEmail}`.toLocaleLowerCase("ru").includes(query));
  const handoffs = snapshot.conversations.filter(thread => thread.handoffRequested && !thread.ownerId);

  return (
    <div className={styles.stack}>
      {handoffs.length > 0 && (
        <section className={styles.panel} aria-label="Ожидают разработчика">
          <div className={styles.panelHeader}>
            <h2>Клиенты ждут ответа</h2>
          </div>
          {handoffs.map(thread => {
            const accepted = snapshot.projects.some(project => project.id === thread.projectId && project.developerId === snapshot.viewer?.id);
            return (
              <div className={styles.queueItem} key={thread.id}>
                <div>
                  <h3>{thread.name}</h3>
                  <p className={styles.small}>Запрошено подключение разработчика</p>
                </div>
                <button className={styles.secondary} type="button" disabled={busy} onClick={() => accepted ? onOpenChat(thread.projectId) : onAcceptProject(thread.projectId, "chat")}>
                  {accepted ? "Открыть диалог" : "Взять проект и открыть чат"}
                </button>
              </div>
            );
          })}
        </section>
      )}
      <section className={styles.panel} aria-label="Общая очередь проектов">
        <div className={`${styles.panelHeader} ${styles.projectQueueHeader}`}>
          <h2>Доступные проекты</h2>
          <div className={styles.searchField}>
            <input type="search" aria-label="Поиск проектов" value={search} onChange={event => setSearch(event.target.value)} placeholder="Проект или клиент" />
          </div>
        </div>
        {visible.length === 0 && <Empty title={projects.length ? "Ничего не найдено" : "Очередь свободна"} text={projects.length ? "Попробуйте другой запрос." : "Новые проекты появятся после оплаты и создания. Взятые в работу доступны в боковом меню."} icon={projects.length ? "search" : "check"} />}
        {visible.length === 0 && projects.length > 0 && <button className={styles.secondary} type="button" onClick={() => setSearch("")}>Сбросить поиск</button>}
        {visible.map(project => (
          <article className={styles.queueItem} key={project.id}>
            <div className={styles.queueDescription}>
              <span className={styles.small}>{project.clientName}</span>
              <h3>{project.name}</h3>
              <p className={styles.projectDescription}>{project.description}</p>
            </div>
            <button type="button" className={styles.primary} disabled={busy} onClick={() => onAcceptProject(project.id, "overview")}>Взять в работу</button>
          </article>
        ))}
      </section>
    </div>
  );
}
