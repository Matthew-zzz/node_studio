"use client";

import { useState } from "react";
import type { FormEvent } from "react";
import type { AgentGateway } from "@/features/portal/lib/gateway";
import type { AgentAdminState, AgentCommand, KnowledgeDocument } from "@/features/portal/model/agent";
import { DetailDialog, ActionsMenu } from "@/features/portal/components/focus-dialog";
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
  const [ragOpen, setRagOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [editing, setEditing] = useState(false);
  async function edit(documentId: string) {
    setLoading(true);
    try { setDraft(await api.document(documentId)); setEditing(true); }
    catch (error) { notify.error(error instanceof Error ? error.message : "Не удалось открыть материал."); }
    finally { setLoading(false); }
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (await command({ type: "document.save", document: draft })) { setDraft(emptyDocument); setEditing(false); }
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

      <section className={portalStyles.panel} aria-label="Материалы базы знаний">
        <DetailDialog label={draft.id ? "Редактировать материал" : "Добавить материал"} open={editing} onOpenChange={setEditing} busy={busy} renderTrigger={() => null}>
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
            <label className={styles.check}>
              <input type="checkbox" checked={draft.enabled} disabled={busy} onChange={event => setDraft({ ...draft, enabled: event.target.checked })} />
              <span>Использовать в ответах</span>
            </label>
            <button className={portalStyles.primary} type="submit" disabled={busy}>Сохранить материал</button>
          </form>
        </DetailDialog>
        <RagSettings {...editor} open={ragOpen} onOpenChange={setRagOpen} renderTrigger={() => null} />
        <div className={styles.toolbar}>
          <h2>{archive ? "Архив материалов" : "База знаний"}</h2>
          <ActionsMenu
            label="Управление базой знаний"
            disabled={busy}
            actions={[
            { label: "Добавить материал", icon: "plus", onSelect: () => { setDraft(emptyDocument); setEditing(true); } },
            { label: "Настройки RAG", icon: "service", onSelect: () => setRagOpen(true) },
            { label: "Переиндексировать", icon: "database", onSelect: () => void command({ type: "reindex" }) },
            { label: archive ? "Активные материалы" : "Показать архив", icon: "document", onSelect: () => setArchive(!archive) },
          ]}
          />
        </div>
        {!documents.length && <Empty title={archive ? "Архив пуст" : "Добавьте знания студии"} text={archive ? "Здесь появятся убранные из базы материалы." : "Услуги, процессы, ответы на вопросы и правила работы — бот найдёт подходящие фрагменты перед ответом."} icon="document" />}
        {documents.map(document => (
          <article key={document.id} className={styles.item}>
            <div className={styles.itemHeader}>
              <h3>{document.title}</h3>
              <span className={styles.pill} data-state={document.indexStatus}>{document.archived ? "В архиве" : !document.enabled ? "Выключен" : document.indexStatus === "pending" ? "Индексируется" : document.indexStatus === "error" ? "Ошибка индекса" : "Готов"}</span>
            </div>
            <ActionsMenu
              label={`Действия материала: ${document.title}`}
              disabled={busy}
              actions={[
              ...(!archive ? [{ label: "Редактировать", icon: "document" as const, onSelect: () => void edit(document.id) }] : []),
              { label: archive ? "Вернуть в базу" : "В архив", icon: "database", onSelect: () => void command({ type: "document.archive", documentId: document.id, version: document.version, archived: !document.archived }) },
            ]}
            />
          </article>
        ))}
      </section>
    </div>
  );
}
