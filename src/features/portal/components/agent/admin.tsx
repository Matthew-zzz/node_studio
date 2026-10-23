"use client";

import type { ChangeEvent } from "react";
import type { PortalController } from "@/features/portal/lib/use-portal";
import { useAgentAdmin } from "@/features/portal/lib/use-agent-admin";
import { DEFAULT_AGENT, editableAgentSettings } from "@/features/portal/model/agent";
import type { AgentPreferences, AgentView } from "@/features/portal/model/agent";
import { GeneralSettings, PromptSettings } from "@/features/portal/components/agent/settings";
import { KnowledgeManager } from "@/features/portal/components/agent/knowledge";
import { AgentPlayground } from "@/features/portal/components/agent/playground";
import { Empty } from "@/features/portal/components/ui";
import { notify } from "@/lib/notifications";
import portalStyles from "@/features/portal/components/portal.module.css";
import styles from "./agent.module.css";

function importShape(template: unknown, value: unknown): unknown {
  if (template === null && (value === null || (typeof value === "number" && Number.isFinite(value)))) return value;
  if (typeof template === "object" && template !== null) {
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Проверьте структуру JSON настроек.");
    return Object.fromEntries(Object.entries(template).map(([key, item]) => [key, importShape(item, (value as Record<string, unknown>)[key] ?? item)]));
  }
  if (typeof value !== typeof template || (typeof value === "number" && !Number.isFinite(value))) throw new Error("Некорректный тип поля в JSON настроек.");
  return value;
}
function download(value: unknown) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(value, null, 2)], { type: "application/json" }));
  const link = document.createElement("a"); link.href = url; link.download = "node-telegram-agent.json"; link.click(); URL.revokeObjectURL(url);
}

export function AgentAdmin({ controller, view }: { controller: PortalController; view: AgentView }) {
  const { state, draft, draftVersion, setDraft, resetDraft, busy, command, refresh } = useAgentAdmin(controller.agent);
  if (!state || !draft) return (
    <section className={portalStyles.panel}>
      <p role="status">Открываем настройки агента…</p>
      <button className={portalStyles.textButton} type="button" onClick={() => void refresh(true)}>Повторить загрузку</button>
    </section>
  );
  const dirty = JSON.stringify(editableAgentSettings(draft)) !== JSON.stringify(editableAgentSettings(state.settings));
  const editor = { value: draft, onChange: setDraft, busy };
  async function importSettings(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]; event.target.value = "";
    if (!file) return;
    try {
      if (file.size > 8_000_000) throw new Error("Файл настроек должен быть меньше 8 МБ.");
      const value = JSON.parse(await file.text()) as Record<string, unknown>;
      setDraft(importShape(DEFAULT_AGENT, value.settings ?? value) as AgentPreferences);
      notify.info("Настройки загружены в форму. Проверьте их и сохраните.");
    } catch (error) { notify.error(error instanceof Error ? error.message : "Не удалось прочитать настройки."); }
  }
  return (
    <div className={styles.root}>
      <div className={styles.toolbar}>
        <span className={portalStyles.small}>{`OpenAI: ${state.connected.ai ? "ключ настроен" : "не настроен"} · Telegram: ${state.connected.telegram ? "подключён" : "не подключён"}`}</span>
        <button className={portalStyles.textButton} type="button" disabled={busy} onClick={() => void refresh()}>Обновить данные</button>
      </div>
      {view === "agent" && <GeneralSettings {...editor} />}
      {view === "agent-prompts" && <PromptSettings {...editor} />}
      {view === "agent-knowledge" && <KnowledgeManager {...editor} state={state} api={controller.agent} command={command} />}
      {view === "agent-playground" && <AgentPlayground api={controller.agent} settings={draft} />}
      {view === "agent-history" && (
        <div className={portalStyles.stack}>
          <section className={portalStyles.panel}>
            <h2>Версии настроек</h2>
            {!state.revisions.length && <Empty title="Первая версия впереди" text="После сохранения здесь появятся версии настроек и возможность восстановить предыдущую." icon="document" />}
            {state.revisions.map(revision => (
              <article className={styles.item} key={revision.id}>
                <div className={styles.itemHeader}>
                  <div>
                    <h3>{`Версия ${revision.version}`}</h3>
                    <p className={portalStyles.small}>{`${revision.author} · ${new Date(revision.createdAt).toLocaleString("ru-RU")}`}</p>
                  </div>
                  <button className={portalStyles.secondary} type="button" disabled={busy || revision.version === state.settings.version} onClick={() => void command({ type: "settings.restore", revisionId: revision.id, version: state.settings.version })}>Восстановить</button>
                </div>
              </article>
            ))}
          </section>
          <section className={portalStyles.panel}>
            <h2>Последние ответы бота</h2>
            <p className={portalStyles.small}>Результаты работы без текста переписки клиентов.</p>
            {!state.runs.length && <Empty title="Ответов пока нет" text="Здесь появятся модель, время ответа и результат обработки сообщений Telegram." icon="bot" />}
            {state.runs.map(run => (
              <article className={styles.item} key={run.id}>
                <div className={styles.itemHeader}>
                  <h3>{run.model}</h3>
                  <span className={styles.pill} data-state={run.status === "error" ? "error" : "ready"}>{({ answered: "Отвечено", handoff: "Передан разработчику", paused: "На паузе", limited: "Лимит ответов", error: "Резервный ответ" })[run.status]}</span>
                </div>
                <p className={portalStyles.small}>{`${run.durationMs} мс · источников: ${run.sourceIds.length} · ${new Date(run.createdAt).toLocaleString("ru-RU")}`}</p>
              </article>
            ))}
          </section>
          <details className={`${portalStyles.panel} ${styles.form}`}>
            <summary>Экспорт и импорт</summary>
            <button className={portalStyles.secondary} type="button" disabled={busy} onClick={() => void controller.agent.export().then(download).catch(error => notify.error(error instanceof Error ? error.message : "Не удалось экспортировать настройки."))}>Экспорт настроек и материалов</button>
            <label>
              Импорт настроек JSON
              <input className={styles.file} type="file" accept=".json" disabled={busy} onChange={event => void importSettings(event)} />
            </label>
            <p className={portalStyles.small}>Импорт загружает параметры агента в форму. Материалы добавляются отдельно в базе знаний. Ключи API в экспорт не включаются.</p>
          </details>
        </div>
      )}
      <div className={styles.saveBar} data-dirty={dirty}>
        <div>
          <span className={portalStyles.small}>{dirty ? "Есть несохранённые изменения" : "Настройки сохранены"}</span>
          <p>{`Версия ${state.settings.version}${state.settings.updatedBy ? ` · ${state.settings.updatedBy}` : ""}`}</p>
        </div>
        <div className={styles.actions}>
          {dirty && <button className={portalStyles.secondary} type="button" disabled={busy} onClick={resetDraft}>Отменить изменения</button>}
          <button className={portalStyles.primary} type="button" disabled={busy || !dirty} onClick={() => void command({ type: "settings.save", settings: draft, version: draftVersion })}>{busy ? "Сохраняем…" : "Сохранить настройки"}</button>
        </div>
      </div>
    </div>
  );
}
