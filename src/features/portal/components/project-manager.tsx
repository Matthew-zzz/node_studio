"use client";

import { useState } from "react";
import type { FormEvent } from "react";
import type { PortalController } from "@/features/portal/lib/use-portal";
import type { PortalProject } from "@/features/portal/model/types";
import { projectRepositories } from "@/features/portal/model/project-repositories";
import styles from "./portal.module.css";
import management from "./project-manager.module.css";

export function CreateProject({ controller, onCreated }: { controller: PortalController; onCreated: (id: string) => void }) {
  const [requestId, setRequestId] = useState(() => crypto.randomUUID());
  const [name, setName] = useState(""); const [clientEmail, setClientEmail] = useState(""); const [description, setDescription] = useState("");
  const [repositories, setRepositories] = useState([{ key: crypto.randomUUID(), name: "Основной", repo: "" }]);
  const [submitting, setSubmitting] = useState(false);
  const disabled = controller.busy || submitting;
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (disabled) return; setSubmitting(true);
    try {
      if (await controller.run({ type: "project.create", requestId, name, clientEmail, description, repositories: repositories.map(({ name, repo }) => ({ name, repo })) })) {
        const id = `project:${requestId}`;
        setName(""); setDescription(""); setRequestId(crypto.randomUUID()); setRepositories([{ key: crypto.randomUUID(), name: "Основной", repo: "" }]);
        onCreated(id);
      }
    } finally { setSubmitting(false); }
  }
  return (
    <details className={styles.panel}>
      <summary>Создать проект из репозиториев</summary>
      <form className={styles.form} onSubmit={event => void submit(event)} aria-label="Создание клиентского проекта">
        <p className={styles.small}>У клиента будет один проект и общий чат. Репозитории доступны вам как подпроекты.</p>
        <label>
          Название проекта
          <input aria-label="Название клиентского проекта" required maxLength={160} value={name} onChange={event => setName(event.target.value)} />
        </label>
        <label>
          Почта клиента
          <input aria-label="Почта клиента проекта" type="email" required maxLength={254} value={clientEmail} onChange={event => setClientEmail(event.target.value)} />
        </label>
        <p className={styles.small}>Клиент должен иметь аккаунт в студии. Проект появится в его существующем кабинете.</p>
        <label>
          Описание
          <textarea aria-label="Описание клиентского проекта" maxLength={1000} value={description} onChange={event => setDescription(event.target.value)} />
        </label>
        {repositories.map((part, index) => (
          <fieldset className={management.repository} key={part.key}>
            <legend>{`Подпроект ${index + 1}${index === 0 ? " · основной" : ""}`}</legend>
            <label>
              Название подпроекта
              <input aria-label={`Название подпроекта ${index + 1}`} required maxLength={80} value={part.name} onChange={event => setRepositories(parts => parts.map(row => row.key === part.key ? { ...row, name: event.target.value } : row))} />
            </label>
            <label>
              Репозиторий GitHub
              <input aria-label={`Репозиторий подпроекта ${index + 1}`} required maxLength={200} placeholder="owner/repository или ссылка" value={part.repo} onChange={event => setRepositories(parts => parts.map(row => row.key === part.key ? { ...row, repo: event.target.value } : row))} />
            </label>
            {repositories.length > 1 && <button className={styles.textButton} type="button" disabled={disabled} onClick={() => setRepositories(parts => parts.filter(row => row.key !== part.key))}>Убрать подпроект</button>}
          </fieldset>
        ))}
        <div className={styles.formActions}>
          {repositories.length < 8 && <button className={styles.secondary} type="button" disabled={disabled} onClick={() => setRepositories(parts => [...parts, { key: crypto.randomUUID(), name: "", repo: "" }])}>Добавить подпроект</button>}
          <button className={styles.primary} type="submit" disabled={disabled}>Создать клиентский проект</button>
        </div>
        <p className={styles.small}>Первый репозиторий принимает подтверждённые пожелания из общего чата. Данные остальных объединяются с ним в кабинете клиента.</p>
      </form>
    </details>
  );
}

export function RepositoryManager({ project, controller }: { project: PortalProject; controller: PortalController }) {
  const [name, setName] = useState(""); const [repo, setRepo] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (await controller.run({ type: "project.repository.add", projectId: project.id, name, repo })) { setName(""); setRepo(""); }
  }
  if (project.developerId !== controller.snapshot.viewer?.id) return null;
  if (!projectRepositories(project).length) return (
    <section className={styles.panel} aria-label="Репозиторий проекта">
      <h2>Подготовить разработку</h2>
      <p className={styles.subtitle}>Создайте закрытый GitHub-репозиторий для этого проекта. ТЗ станет первой задачей, история и этапы будут обновляться из GitHub.</p>
      <div className={styles.formActions}>
        <button type="button" className={styles.primary} disabled={controller.busy} onClick={() => void controller.run({ type: "project.repository.create", projectId: project.id })}>{controller.busy ? "Создаём репозиторий…" : "Создать GitHub-репозиторий"}</button>
      </div>
    </section>
  );
  return (
    <details className={`${styles.panel} ${management.manager}`}>
      <summary>Управление подпроектами</summary>
      <div className={styles.stack}>
        {projectRepositories(project).map(part => (
          <div className={management.source} key={part.id}>
            <strong>{part.name}</strong>
            <a href={`https://github.com/${part.repo}`} target="_blank" rel="noreferrer">{part.repo}</a>
          </div>
        ))}
        {(project.subprojects?.length ?? 1) < 8 && (
          <form className={styles.form} onSubmit={event => void submit(event)} aria-label="Добавление подпроекта">
            <label>
              Название нового подпроекта
              <input aria-label="Название нового подпроекта" required maxLength={80} value={name} onChange={event => setName(event.target.value)} />
            </label>
            <label>
              Репозиторий GitHub
              <input aria-label="Репозиторий нового подпроекта" required maxLength={200} placeholder="owner/repository" value={repo} onChange={event => setRepo(event.target.value)} />
            </label>
            <button className={styles.secondary} type="submit" disabled={controller.busy}>Подключить подпроект</button>
          </form>
        )}
      </div>
    </details>
  );
}
