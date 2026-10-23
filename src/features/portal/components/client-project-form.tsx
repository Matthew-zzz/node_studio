"use client";

import { useState } from "react";
import type { FormEvent } from "react";
import type { PortalController } from "@/features/portal/lib/use-portal";
import styles from "./portal.module.css";
import { RepositoryChoice } from "@/features/portal/components/repository-choice";
import type { RepositoryMode } from "@/features/portal/components/repository-choice";

export function ClientProjectForm({ controller, onCreated }: { controller: PortalController; onCreated: () => void }) {
  const [requestId, setRequestId] = useState(() => crypto.randomUUID());
  const [name, setName] = useState(""); const [clientEmail, setClientEmail] = useState("");
  const [description, setDescription] = useState(""); const [brief, setBrief] = useState("");
  const [repositoryName, setRepositoryName] = useState("");
  const [repositoryMode, setRepositoryMode] = useState<RepositoryMode>("new"); const [repository, setRepository] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (await controller.run({ type: "project.request", requestId, name, clientEmail, description, brief, ...(repositoryMode === "new" ? { repositoryName: repositoryName.trim() } : { repository: repository.trim() }) })) {
      setRequestId(crypto.randomUUID()); setName(""); setDescription(""); setBrief(""); setRepositoryName(""); setRepository(""); setRepositoryMode("new"); onCreated();
    }
  }
  return (
    <form className={styles.form} aria-label="Создание проекта разработчиком" onSubmit={event => void submit(event)}>
      <label>
        Название проекта
        <input required maxLength={160} value={name} onChange={event => setName(event.target.value)} />
      </label>
      <RepositoryChoice mode={repositoryMode} onModeChange={setRepositoryMode} name={repositoryName} onNameChange={setRepositoryName} repo={repository} onRepoChange={setRepository} disabled={controller.busy} />
      <label>
        Почта клиента
        <input type="email" required maxLength={254} value={clientEmail} onChange={event => setClientEmail(event.target.value)} />
      </label>
      <p className={styles.small}>Используйте почту существующего аккаунта клиента.</p>
      <label>
        Краткое описание
        <textarea maxLength={1000} rows={2} value={description} onChange={event => setDescription(event.target.value)} />
      </label>
      <label>
        ТЗ проекта
        <textarea required maxLength={16000} rows={5} value={brief} onChange={event => setBrief(event.target.value)} />
      </label>
      <div className={styles.formActions}><button type="submit" className={styles.primary} disabled={controller.busy}>Создать проект</button></div>
    </form>
  );
}
