"use client";

import { useState } from "react";
import type { FormEvent } from "react";
import { LongText } from "@/features/portal/components/ui";
import type { PortalController } from "@/features/portal/lib/use-portal";
import styles from "./portal.module.css";

export function CuratorProject({ controller }: { controller: PortalController }) {
  const [requestId, setRequestId] = useState(() => crypto.randomUUID());
  const [name, setName] = useState(""); const [clientEmail, setClientEmail] = useState("");
  const [description, setDescription] = useState(""); const [brief, setBrief] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (await controller.run({ type: "project.request", requestId, name, clientEmail, description, brief })) {
      setRequestId(crypto.randomUUID()); setName(""); setDescription(""); setBrief("");
    }
  }
  const projects = controller.snapshot.projects.filter(project => project.origin === "curator");
  return (
    <section className={styles.panel} aria-label="Проекты клиентов">
      <h2>Создать проект для клиента</h2>
      <p className={styles.subtitle}>Проект появится в кабинете клиента и в общей очереди разработчика.</p>
      <details style={{ marginTop: 16 }}>
        <summary>Создать для существующего клиента</summary>
        <form className={styles.form} aria-label="Создание проекта куратором" onSubmit={event => void submit(event)}>
          <label>
            Название проекта
            <input required maxLength={160} value={name} onChange={event => setName(event.target.value)} />
          </label>
          <label>
            Почта клиента
            <input type="email" required maxLength={254} value={clientEmail} onChange={event => setClientEmail(event.target.value)} />
          </label>
          <p className={styles.small}>Используйте почту существующего клиентского аккаунта. Для нового клиента подготовьте оплату и выдачу доступа ниже.</p>
          <label>
            Краткое описание
            <textarea maxLength={1000} rows={2} value={description} onChange={event => setDescription(event.target.value)} />
          </label>
          <label>
            ТЗ проекта
            <textarea required maxLength={16000} rows={5} value={brief} onChange={event => setBrief(event.target.value)} />
          </label>
          <p className={styles.small}>Разработчик изучит ТЗ, примет проект и создаст для него GitHub-репозиторий.</p>
          <div className={styles.formActions}><button type="submit" className={styles.primary} disabled={controller.busy}>Создать проект</button></div>
        </form>
      </details>
      {[...projects].reverse().map(project => (
        <article key={project.id} className={styles.order}>
          <div className={styles.taskTop}>
            <h3>{project.name}</h3>
            <span className={styles.badge}>{project.developerId ? "Принят разработчиком" : "В общей очереди"}</span>
          </div>
          <p className={styles.small}>{project.clientEmail}</p>
          <LongText text={project.brief} label="ТЗ проекта" />
        </article>
      ))}
    </section>
  );
}
