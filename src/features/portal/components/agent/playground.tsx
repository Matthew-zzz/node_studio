"use client";

import { useState } from "react";
import type { FormEvent } from "react";
import type { AgentGateway } from "@/features/portal/lib/gateway";
import type { AgentPreferences, AgentTestMessage, AgentTestResult } from "@/features/portal/model/agent";
import { Empty, LongText } from "@/features/portal/components/ui";
import { TelegramText } from "@/features/portal/components/telegram-text";
import { notify } from "@/lib/notifications";
import portalStyles from "@/features/portal/components/portal.module.css";
import styles from "./agent.module.css";

export function AgentPlayground({ api, settings }: { api: AgentGateway; settings: AgentPreferences }) {
  const [messages, setMessages] = useState<(AgentTestMessage & { html?: string })[]>([]);
  const [query, setQuery] = useState("");
  const [result, setResult] = useState<AgentTestResult | null>(null);
  const [busy, setBusy] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || !query.trim()) return;
    const next = [...messages, { role: "client" as const, text: query.trim() }].slice(-19);
    setMessages(next); setQuery(""); setBusy(true);
    try {
      const response = await api.preview(settings, next.map(({ role, text }) => ({ role, text })));
      setResult(response); setMessages([...next, { role: "assistant", text: response.reply, html: response.html }]);
    } catch (error) { notify.error(error instanceof Error ? error.message : "Не удалось проверить агента."); }
    finally { setBusy(false); }
  }
  return (
    <div className={portalStyles.stack}>
      <section className={`${portalStyles.panel} ${styles.form}`} aria-label="Тестовый чат агента">
        <div className={styles.itemHeader}>
          <h2>Проверка агента</h2>
          <button className={portalStyles.textButton} type="button" disabled={busy || !messages.length} onClick={() => { setMessages([]); setResult(null); }}>Очистить</button>
        </div>
        <p className={portalStyles.small}>Используются текущие настройки формы, включая несохранённые изменения. Сообщения не отправляются в Telegram и не попадают в диалоги клиентов.</p>
        <div className={styles.log} role="log" aria-label="Тестовые сообщения" aria-live="polite">
          {!messages.length && <Empty title="Проверьте вопрос клиента" text="Можно проверить стиль ответа, базу знаний и передачу разработчику." icon="bot" />}
          {messages.map((message, index) => (
            <article key={index} className={styles.testMessage} data-role={message.role}>
              <small>{message.role === "client" ? "Вы" : settings.name}</small>
              {message.html ? <TelegramText html={message.html} /> : message.text}
            </article>
          ))}
        </div>
        <form className={styles.form} onSubmit={event => void submit(event)}>
          <label>
            Тестовое сообщение
            <textarea aria-label="Тестовое сообщение" rows={3} required maxLength={8000} value={query} disabled={busy} onChange={event => setQuery(event.target.value)} placeholder="Например: как начинается работа над проектом?" />
          </label>
          <div className={styles.actions}><button className={portalStyles.primary} type="submit" disabled={busy || !query.trim()}>{busy ? "Агент отвечает…" : "Проверить ответ"}</button></div>
        </form>
      </section>
      {result && (
        <section className={portalStyles.panel} aria-label="Источники тестового ответа">
          <div className={styles.toolbar}>
            <h2>Что использовал агент</h2>
            <span className={portalStyles.small}>{`${result.model} · ${result.durationMs} мс`}</span>
          </div>
          {result.handoff && <p className={portalStyles.small}>Агент запросил подключение разработчика. В тестовом чате заявка не создаётся.</p>}
          {result.warnings.map(warning => <p key={warning} className={portalStyles.small}>{warning}</p>)}
          {!result.sources.length && <p className={portalStyles.small}>Подходящих фрагментов базы знаний не использовано.</p>}
          {result.sources.map((source, index) => (
            <div className={styles.source} key={`${source.documentId}:${index}`}>
              <h3>{source.title}</h3>
              <LongText text={source.text} label="Посмотреть фрагмент" />
            </div>
          ))}
          <details>
            <summary>HTML ответа Telegram</summary>
            <pre className={styles.rawHtml}>{result.html}</pre>
          </details>
        </section>
      )}
    </div>
  );
}
