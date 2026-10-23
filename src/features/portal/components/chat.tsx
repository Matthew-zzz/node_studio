"use client";

import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import { Icon } from "@/components/ui/icon";
import { PaymentButton } from "@/features/portal/components/payment-button";
import { Empty, LongText } from "@/features/portal/components/ui";
import { TelegramText } from "@/features/portal/components/telegram-text";
import { ChatActions } from "@/features/portal/components/chat-actions";
import { formatRubles } from "@/features/payments/model/payment";
import type { Conversation } from "@/features/portal/model/types";
import type { PortalController } from "@/features/portal/lib/use-portal";
import styles from "./portal.module.css";
import { ActionsDialog } from "@/features/portal/components/focus-dialog";
import { DeletePayment } from "@/features/portal/components/delete-confirmation";

export function Chat({ thread, controller, draft, onDraftChange, showHeader = true }: { thread: Conversation | undefined; controller: PortalController; draft?: string; onDraftChange?: (value: string) => void; showHeader?: boolean }) {
  const [localText, setLocalText] = useState("");
  const text = draft ?? localText;
  const setText = onDraftChange ?? setLocalText;
  const log = useRef<HTMLDivElement>(null);
  const { snapshot, busy, run } = controller;
  const viewer = snapshot.viewer;
  const messages = snapshot.messages.filter(message => message.threadId === thread?.id);
  const drafts = snapshot.drafts.filter(draft => draft.threadId === thread?.id && !draft.confirmed);
  const quotes = snapshot.quotes.filter(quote => quote.projectId === thread?.projectId && quote.status !== "superseded");
  useEffect(() => { if (log.current) log.current.scrollTop = log.current.scrollHeight; }, [messages.length, drafts.length, quotes.length, thread?.id]);
  if (!thread || !viewer) return <section className={`${styles.panel} ${styles.chat}`}><Empty title="Диалог появится здесь" text="Выберите проект или обращение из очереди." icon="bot" /></section>;
  const human = viewer.role === "developer";
  const canWrite = viewer.role === "client" || thread.ownerId === viewer.id;
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (thread && text.trim() && await run({ type: "message", threadId: thread.id, text })) setText("");
  }
  return (
    <section className={`${styles.panel} ${styles.chat}`} aria-label={thread.kind === "project" ? "Чат проекта" : "Telegram-диалог"}>
      {showHeader && (
      <div className={styles.chatHeader}>
        <div className={styles.chatIdentity}>
          <span className={styles.chatSymbol}><Icon name={thread.kind === "telegram" ? "telegram" : thread.ownerId ? "people" : "spark"} /></span>
          <div>
            <h2>{thread.kind === "telegram" ? thread.name : "Диалог по проекту"}</h2>
            {thread.ownerName && <small>{`${thread.ownerName} · на связи`}</small>}
          </div>
        </div>
        <ChatActions key={thread.id} thread={thread} controller={controller} />
      </div>
)}
      {thread.handoffRequested && !thread.ownerId && (
      <p className={styles.handoff}>
        Ожидаем подключения
        разработчика
      </p>
)}

      <div ref={log} className={styles.chatLog} role="log" aria-label="Сообщения" aria-live="polite" aria-relevant="additions">
        {messages.length === 0 && <p className={styles.small}>Начните разговор. Здесь сохраняется переписка этого проекта.</p>}
        {messages.map(message => message.role === "system" ? <div key={message.id} className={styles.systemMessage}>{message.html ? <TelegramText html={message.html} /> : message.text}</div> : (
          <article key={message.id} className={styles.message} data-own={message.role === viewer.role && message.author === viewer.name}>
            <div className={styles.messageMeta}>
              <span>{message.author}</span>
              <time dateTime={message.createdAt}>{new Intl.DateTimeFormat("ru-RU", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Moscow" }).format(new Date(message.createdAt))}</time>
            </div>
            <div className={styles.bubble}>{message.html ? <TelegramText html={message.html} collapsible /> : message.text.length > 480 ? <LongText text={message.text} label={`${message.text.slice(0, 90)}… Читать`} /> : message.text}</div>
          </article>
        ))}
        {drafts.map(draft => (
          <article key={draft.id} className={styles.draft}>
            <span className={styles.small}>Черновик задачи · проверьте перед отправкой</span>
            <h3>{draft.title}</h3>
            <LongText text={draft.body} label="Показать формулировку" />
            {viewer.role === "client" ? (
              <>
                <button className={styles.primary} type="button" disabled={busy || snapshot.projects.find(project => project.id === draft.projectId)?.repositoryReady === false} onClick={() => void run({ type: "draft.confirm", draftId: draft.id })}>Подтвердить и отправить задачу</button>
                {snapshot.projects.find(project => project.id === draft.projectId)?.repositoryReady === false && <p className={styles.small}>Пожелание сохранено. Отправить его можно будет, когда разработчик подготовит проект.</p>}
              </>
) : <p className={styles.small}>Ожидает подтверждения клиента</p>}
          </article>
        ))}
        {quotes.map(quote => (
          <article key={quote.id} className={styles.quote}>
            <span className={styles.small}>{quote.status === "paid" ? "Тестовая оплата подтверждена" : "Оценка разработчика"}</span>
            <h3>{quote.title}</h3>
            <div className={styles.quoteTotal}>
              <span className={styles.small}>
                Задача #
                {quote.taskNumber}
              </span>
              <strong>{formatRubles(quote.totalKopecks)}</strong>
            </div>
            {human && <LongText text={`Стоимость разработчика: ${formatRubles(quote.baseKopecks)}\nНаценка 30%: ${formatRubles(quote.markupKopecks)}\nИтого клиенту: ${formatRubles(quote.totalKopecks)}`} label="Расчёт стоимости" />}
            {quote.status === "paid" ? <span className={styles.badge} data-status="paid">Оплачено · тест</span> : viewer.role === "client" ? snapshot.integrations.payments === "mock" ? <PaymentButton total={quote.totalKopecks} busy={busy} onPay={outcome => run({ type: "quote.pay", quoteId: quote.id, outcome })} /> : <p className={styles.small}>Оплата временно недоступна. Напишите в поддержку студии.</p> : <span className={styles.badge} data-status="pending">Ожидает оплаты</span>}
            {quote.status !== "paid" && <p className={styles.small} style={{ marginTop: 9 }}>Тестовый платёж без списания денег.</p>}
            {viewer.role === "developer" && <ActionsDialog label={`Действия оплаты: ${quote.title}`} busy={busy} actions={[{ label: "Удалить оплату", icon: "trash", danger: true, content: close => <DeletePayment kind="quote" payment={quote} controller={controller} onClose={close} /> }]} />}
          </article>
        ))}
      </div>
      {human && (
        <div className={styles.takeover}>
          <button className={styles.secondary} type="button" disabled={busy || Boolean(thread.ownerId && thread.ownerId !== viewer.id)} onClick={() => void run({ type: thread.ownerId === viewer.id ? "leave" : "takeover", threadId: thread.id })}>{thread.ownerId === viewer.id ? "Покинуть диалог" : "Подключиться к диалогу"}</button>
        </div>
      )}
      <form className={styles.compose} onSubmit={event => void submit(event)}>
        <div className={styles.composeField}>
          <textarea aria-label="Сообщение" placeholder={canWrite ? "Напишите сообщение…" : "Подключитесь, чтобы ответить"} maxLength={thread.kind === "telegram" ? 4000 : 8000} rows={2} disabled={!canWrite || busy} value={text} onChange={event => setText(event.target.value)} />
          <button className={styles.primary} type="submit" aria-label="Отправить сообщение" disabled={!canWrite || busy || !text.trim()}><Icon name="arrow" /></button>
        </div>
      </form>
    </section>
  );
}
