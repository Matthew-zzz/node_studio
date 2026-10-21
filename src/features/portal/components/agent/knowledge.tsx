"use client";

import { useRef, useState } from "react";
import type { FormEvent } from "react";
import type { AgentGateway } from "@/features/portal/lib/gateway";
import type { AgentAdminState, AgentCommand, KnowledgeDocument } from "@/features/portal/model/agent";
import { Empty } from "@/features/portal/components/ui";
import { RagSettings } from "@/features/portal/components/agent/settings";
import type { AgentEditorProps } from "@/features/portal/components/agent/settings";
import { notify } from "@/lib/notifications";
import portalStyles from "@/features/portal/components/portal.module.css";
import styles from "./agent.module.css";

type DocumentDraft = Pick<KnowledgeDocument, "title" | "content" | "enabled"> & Partial<Pick<KnowledgeDocument, "id" | "version">>;
const emptyDocument: DocumentDraft = { title: "", content: "", enabled: true };

export function KnowledgeManager({ state, api, command, ...editor }: AgentEditorProps & {
  state: AgentAdminState; api: AgentGateway; command: (value: AgentCommand) => Promise<AgentAdminState | null>;
}) {
  const [draft, setDraft] = useState<DocumentDraft>(emptyDocument);
  const [archive, setArchive] = useState(false);
  const [loading, setLoading] = useState(false);
  const form = useRef<HTMLDetailsElement>(null);
  async function edit(documentId: string) {
    setLoading(true);
    try { setDraft(await api.document(documentId)); if (form.current) { form.current.open = true; form.current.scrollIntoView({ block: "start", behavior: "smooth" }); } }
    catch (error) { notify.error(error instanceof Error ? error.message : "Не удалось открыть материал."); }
    finally { setLoading(false); }
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (await command({ type: "document.save", document: draft })) { setDraft(emptyDocument); if (form.current) form.current.open = false; }
  }
  async function importText(file?: File) {
    if (!file) return;
    if (file.size > 200000 || !/\.(txt|md|markdown|csv|json)$/i.test(file.name)) { notify.error("Выберите текстовый файл TXT, MD, CSV или JSON до 200 КБ."); return; }
    const content = await file.text();
    if (content.length > 50000) { notify.error("В одном материале может быть до 50 000 символов."); return; }
    setDraft(current => ({ ...current, title: current.title || file.name.replace(/\.[^.]+$/, ""), content }));
  }
  const busy = editor.busy || loading;
  const documents = state.documents.filter(document => document.archived === archive);
  return (
    <div className={portalStyles.stack}>
      <RagSettings {...editor} />
      <details ref={form} className={`${portalStyles.panel} ${styles.form}`}>
        <summary>{draft.id ? "Редактировать материал" : "Добавить материал"}</summary>
        <form className={styles.form} onSubmit={event => void submit(event)}>
          <label>
            Название материала
            <input required maxLength={200} value={draft.title} disabled={busy} onChange={event => setDraft({ ...draft, title: event.target.value })} />
          </label>
          <label>
            Импорт материала
            <input className={styles.file} type="file" accept=".txt,.md,.markdown,.csv,.json" disabled={busy} onChange={event => { void importText(event.target.files?.[0]).catch(() => notify.error("Не удалось прочитать файл.")); event.target.value = ""; }} />
          </label>
          <label>
            Текст материала
            <textarea aria-label="Текст материала" required rows={12} maxLength={50000} value={draft.content} disabled={busy} onChange={event => setDraft({ ...draft, content: event.target.value })} />
          </label>
          <p className={portalStyles.small}>До 50 000 символов. Материал используется ботом в ответах пользователям Telegram.</p>
          <label className={styles.check}>
            <input type="checkbox" checked={draft.enabled} disabled={busy} onChange={event => setDraft({ ...draft, enabled: event.target.checked })} />
            <span>Использовать в ответах</span>
          </label>
          <div className={styles.actions}>
            <button className={portalStyles.primary} type="submit" disabled={busy}>Сохранить материал</button>
            {draft.id && <button className={portalStyles.secondary} type="button" disabled={busy} onClick={() => setDraft(emptyDocument)}>Новый материал</button>}
          </div>
        </form>
      </details>
      <section className={portalStyles.panel} aria-label="Материалы базы знаний">
        <div className={styles.toolbar}>
          <h2>{archive ? "Архив материалов" : "База знаний"}</h2>
          <div className={styles.actions}>
            <button className={portalStyles.secondary} type="button" disabled={busy} onClick={() => void command({ type: "reindex" })}>Переиндексировать</button>
            <button className={portalStyles.textButton} type="button" onClick={() => setArchive(!archive)}>{archive ? "Активные материалы" : "Показать архив"}</button>
          </div>
        </div>
        {!documents.length && <Empty title={archive ? "Архив пуст" : "Добавьте знания студии"} text={archive ? "Здесь появятся убранные из базы материалы." : "Услуги, процессы, ответы на вопросы и правила работы — бот найдёт подходящие фрагменты перед ответом."} icon="document" />}
        {documents.map(document => (
          <article key={document.id} className={styles.item}>
            <div className={styles.itemHeader}>
              <h3>{document.title}</h3>
              <span className={styles.pill} data-state={document.indexStatus}>{document.archived ? "В архиве" : !document.enabled ? "Выключен" : document.indexStatus === "pending" ? "Индексируется" : document.indexStatus === "error" ? "Ошибка индекса" : "Готов"}</span>
            </div>
            <p className={portalStyles.small}>{`${document.chunkCount} фрагм. · версия ${document.version}`}</p>
            <div className={styles.actions}>
              {!archive && <button className={portalStyles.secondary} type="button" disabled={busy} onClick={() => void edit(document.id)}>Редактировать</button>}
              <button className={portalStyles.textButton} type="button" disabled={busy} onClick={() => void command({ type: "document.archive", documentId: document.id, version: document.version, archived: !document.archived })}>{archive ? "Вернуть в базу" : "В архив"}</button>
            </div>
          </article>
        ))}
      </section>
    </div>
  );
}
