"use client";

import { useState } from "react";
import type { FormEvent } from "react";
import type { PortalController } from "@/features/portal/lib/use-portal";
import type { PortalProject, ProjectRepository } from "@/features/portal/model/types";
import { projectRepositories } from "@/features/portal/model/project-repositories";
import styles from "./portal.module.css";
import management from "./project-manager.module.css";
import { DetailDialog } from "@/features/portal/components/focus-dialog";
import { LongText } from "@/features/portal/components/ui";
import { Icon } from "@/components/ui/icon";
import { RepositoryChoice } from "@/features/portal/components/repository-choice";
import type { RepositoryMode } from "@/features/portal/components/repository-choice";

export function CreateProject({ controller, onCreated, embedded = false }: { controller: PortalController; onCreated: (id: string) => void; embedded?: boolean }) {
  const [open, setOpen] = useState(false);
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
        setOpen(false); onCreated(id);
      }
    } finally { setSubmitting(false); }
  }
  const form = (
    <form className={styles.form} onSubmit={event => void submit(event)} aria-label="Создание клиентского проекта">
      <label>
        Название проекта
        <input aria-label="Название клиентского проекта" required maxLength={160} value={name} onChange={event => setName(event.target.value)} />
      </label>
      <label>
        Почта клиента
        <input aria-label="Почта клиента проекта" type="email" required maxLength={254} value={clientEmail} onChange={event => setClientEmail(event.target.value)} />
      </label>
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
    </form>
  );
  return embedded ? form : <DetailDialog label="Создать проект из репозиториев" open={open} onOpenChange={setOpen} busy={disabled}>{form}</DetailDialog>;
}

const repositoryMessages = {
  idle: { title: "Подготовить разработку", description: "Подключите существующий или создайте закрытый GitHub-репозиторий. Задачи и история будут обновляться из GitHub." },
  queued: { title: "Создаём репозиторий", description: "Заявка сохранена. Подготовка начнётся в фоне — можно продолжать работу." },
  creating: { title: "Создаём репозиторий", description: "Подготавливаем закрытый репозиторий и первую задачу с ТЗ. Можно покинуть страницу — создание продолжится в фоне." },
  retrying: { title: "Повторим создание автоматически", description: "GitHub не завершил операцию. Заявка сохранена, можно продолжать работу." },
  failed: { title: "Создание приостановлено", description: "Создание не завершилось после 8 попыток. Администратор получил подробности ошибки. После исправления подключения можно повторить." },
};

function RepositorySetup({ project, controller }: { project: PortalProject; controller: PortalController }) {
  const [repositoryName, setRepositoryName] = useState(project.repositoryName ?? "");
  const [name, setName] = useState(project.subprojects?.find(part => part.id === "main")?.name ?? "Основной");
  const [repositoryMode, setRepositoryMode] = useState<RepositoryMode>("new"); const [repo, setRepo] = useState("");
  const creation = project.repositoryCreation;
  const pending = creation && creation.status !== "failed";
  const content = repositoryMessages[creation?.status ?? "idle"];
  return (
    <section className={styles.panel} aria-label="Репозиторий проекта">
      <div role="status" aria-live="polite">
        <h2>{content.title}</h2>
        {creation && <p className={styles.small}>{content.description}</p>}
        {creation?.nextAttemptAt && <p className={styles.small}>{`Следующая попытка после ${new Date(creation.nextAttemptAt).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })}`}</p>}
      </div>
      {creation && project.repositoryName && <p className={styles.small}>{project.repositoryName}</p>}
      {!pending && (
      <form className={styles.form} onSubmit={event => { event.preventDefault(); void controller.run(!creation && repositoryMode === "existing" ? { type: "project.repository.attach", projectId: project.id, repo: repo.trim(), name: name.trim() } : { type: "project.repository.create", projectId: project.id, ...(!creation ? { repositoryName: repositoryName.trim(), name: name.trim() } : {}) }); }}>
        {!creation && (
        <label>
          Название подпроекта
          <input aria-label="Название подпроекта" required maxLength={80} value={name} onChange={event => setName(event.target.value)} disabled={controller.busy} />
        </label>
)}
        {!creation && <RepositoryChoice mode={repositoryMode} onModeChange={setRepositoryMode} name={repositoryName} onNameChange={setRepositoryName} repo={repo} onRepoChange={setRepo} disabled={controller.busy} />}
        <div className={styles.formActions}><button type="submit" className={styles.primary} disabled={controller.busy}>{creation ? "Повторить создание" : repositoryMode === "existing" ? "Подключить репозиторий" : "Создать GitHub-репозиторий"}</button></div>
      </form>
)}
    </section>
  );
}

function RenameRepository({ project, part, controller }: { project: PortalProject; part: ProjectRepository; controller: PortalController }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(part.name);
  return (
    <DetailDialog label={`Изменить название подпроекта ${part.name}`} title="Название подпроекта" triggerLabel={<Icon name="edit" />} buttonClassName={management.rename} open={open} onOpenChange={value => { if (value) setName(part.name); setOpen(value); }} busy={controller.busy}>
      <form className={styles.form} onSubmit={event => { event.preventDefault(); void controller.run({ type: "project.repository.rename", projectId: project.id, subprojectId: part.id, name: name.trim() }).then(saved => { if (saved) setOpen(false); }); }}>
        <label>
          Название подпроекта
          <input aria-label="Новое название подпроекта" value={name} onChange={event => setName(event.target.value)} required maxLength={80} disabled={controller.busy} />
        </label>
        <button type="submit" className={styles.primary} disabled={controller.busy}>Сохранить название</button>
      </form>
    </DetailDialog>
  );
}

export function RepositoryManager({ project, controller }: { project: PortalProject; controller: PortalController }) {
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState(""); const [repo, setRepo] = useState("");
  const [mode, setMode] = useState<RepositoryMode>("existing");
  const [repositoryName, setRepositoryName] = useState("");
  const [sourceId, setSourceId] = useState(() => crypto.randomUUID());
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const saved = await controller.run(mode === "existing"
      ? { type: "project.repository.add", projectId: project.id, name: name.trim(), repo: repo.trim() }
      : { type: "project.repository.create", projectId: project.id, subprojectId: sourceId, name: name.trim(), repositoryName: repositoryName.trim() });
    if (saved) { setName(""); setRepo(""); setRepositoryName(""); setSourceId(crypto.randomUUID()); setAdding(false); }
  }
  if (project.developerId !== controller.snapshot.viewer?.id) return null;
  if (!project.repo) return <RepositorySetup project={project} controller={controller} />;
  const parts = project.subprojects ?? projectRepositories(project);
  const content = (
    <div className={styles.stack}>
      {parts.map(part => (
        <div className={management.repositoryRow} key={part.id}>
          <div className={management.source}>
            <strong>{part.name}</strong>
            {part.repo ? <a href={`https://github.com/${part.repo}`} target="_blank" rel="noreferrer">{part.repo}</a> : (
              <>
                <p className={styles.small}>{part.repositoryName}</p>
                <div role="status" aria-live="polite">
                  <h3>{repositoryMessages[part.repositoryCreation?.status ?? "queued"].title}</h3>
                  <LongText text={repositoryMessages[part.repositoryCreation?.status ?? "queued"].description} label="Подробнее о создании подпроекта" />
                </div>
                {part.repositoryCreation?.nextAttemptAt && <p className={styles.small}>{`Следующая попытка после ${new Date(part.repositoryCreation.nextAttemptAt).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })}`}</p>}
                {part.repositoryCreation?.status === "failed" && <button type="button" disabled={controller.busy} className={styles.secondary} onClick={() => void controller.run({ type: "project.repository.create", projectId: project.id, subprojectId: part.id })}>Повторить создание подпроекта</button>}
              </>
)}
          </div>
          <RenameRepository project={project} part={part} controller={controller} />
        </div>
      ))}
      {parts.length < 8 && (
        <DetailDialog label="Добавить подпроект" open={adding} onOpenChange={setAdding} busy={controller.busy} buttonClassName={styles.secondary}>
          <form className={styles.form} onSubmit={event => void submit(event)} aria-label="Добавление подпроекта">
            <label>
              Название нового подпроекта
              <input aria-label="Название нового подпроекта" required maxLength={80} value={name} onChange={event => setName(event.target.value)} placeholder="Например, Backend" />
            </label>
            <RepositoryChoice mode={mode} onModeChange={setMode} name={repositoryName} onNameChange={setRepositoryName} repo={repo} onRepoChange={setRepo} disabled={controller.busy} modeLabel="Способ подключения подпроекта" existingLabel="Репозиторий нового подпроекта" />
            <button className={styles.primary} type="submit" disabled={controller.busy}>{mode === "existing" ? "Подключить подпроект" : "Создать репозиторий подпроекта"}</button>
          </form>
        </DetailDialog>
      )}
    </div>
  );
  return (
    <section className={styles.panel} aria-label="Подготовить разработку">
      <div className={styles.panelHeader}>
        <h2>Подпроекты</h2>
        <span className={styles.small}>{`${parts.length} / 8`}</span>
      </div>
      {content}
    </section>
  );
}
