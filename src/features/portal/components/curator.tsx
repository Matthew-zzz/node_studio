"use client";

import { useState } from "react";
import type { FormEvent } from "react";
import { Chat } from "@/features/portal/components/chat";
import { Empty, LongText } from "@/features/portal/components/ui";
import type { PortalController } from "@/features/portal/lib/use-portal";
import { formatRubles, parseRubles } from "@/features/payments/model/payment";
import styles from "./portal.module.css";

export function TelegramInbox({ controller }: { controller: PortalController }) {
  const [selected, setSelected] = useState("");
  const threads = [...controller.snapshot.conversations].sort((a, b) => Number(b.handoffRequested) - Number(a.handoffRequested) || b.updatedAt.localeCompare(a.updatedAt));
  const thread = threads.find(thread => thread.id === selected) ?? threads[0];
  if (threads.length === 0) return <section className={styles.panel}><Empty title="Пока тихо" text="Здесь появятся обращения в Telegram-бот студии." icon="telegram" /></section>;
  return (
    <div className={styles.inbox}>
      <section className={`${styles.panel} ${styles.inboxList}`} aria-label="Очередь обращений">
        {threads.map(item => (
          <button type="button" className={styles.inboxItem} key={item.id} aria-current={item.id === thread?.id ? "true" : undefined} onClick={() => setSelected(item.id)}>
            <strong>{item.name}</strong>
            <p>{controller.snapshot.messages.filter(message => message.threadId === item.id).at(-1)?.text ?? "Новый диалог"}</p>
            {item.handoffRequested && !item.ownerId ? <span className={styles.badge} data-status="pending">Ждёт человека</span> : item.ownerId ? <span className={styles.badge}>{item.ownerName}</span> : <span className={styles.badge}>С ИИ-помощником</span>}
          </button>
        ))}
      </section>
      <Chat key={thread?.id} thread={thread} controller={controller} />
    </div>
  );
}

const orderStatus = { pending: "Ожидает оплаты", paid: "Оплачено · тест", provisioning: "Создаём проект…", ready: "Доступ выдан", needs_setup: "Нужна настройка подключений" };

export function ProjectOrders({ controller, demo }: { controller: PortalController; demo: boolean }) {
  const [name, setName] = useState(""); const [client, setClient] = useState(""); const [email, setEmail] = useState("");
  const [username, setUsername] = useState(""); const [brief, setBrief] = useState(""); const [amount, setAmount] = useState(""); const [validation, setValidation] = useState("");
  const kopecks = parseRubles(amount);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setValidation("");
    if (!kopecks) { setValidation("Введите корректную стоимость в рублях."); return; }
    if (await controller.run({ type: "order.create", order: { projectName: name, clientName: client, email, username, brief, totalKopecks: kopecks } })) {
      setName(""); setClient(""); setEmail(""); setUsername(""); setBrief(""); setAmount("");
    }
  }
  return (
    <div className={styles.stack}>
      <section className={styles.panel}>
        <h2>Новый проект</h2>
        <p className={styles.subtitle}>Данные клиента и согласованный объём основной работы.</p>
        <details style={{ marginTop: 16 }}>
          <summary>Подготовить проект</summary>
          <form className={styles.form} onSubmit={event => void submit(event)}>
            <label>
              Название проекта
              <input required maxLength={200} value={name} onChange={event => setName(event.target.value)} />
            </label>
            <div className={styles.formRow}>
              <label>
                Имя клиента
                <input required maxLength={100} autoComplete="off" value={client} onChange={event => setClient(event.target.value)} />
              </label>
              <label>
                Почта клиента
                <input type="email" required maxLength={254} autoComplete="off" value={email} onChange={event => setEmail(event.target.value)} />
              </label>
            </div>
            <div className={styles.formRow}>
              <label>
                Telegram username
                <input required maxLength={64} value={username} onChange={event => setUsername(event.target.value)} placeholder="@username" />
              </label>
              <label>
                Основная работа, ₽
                <input required inputMode="decimal" maxLength={12} value={amount} onChange={event => setAmount(event.target.value)} placeholder="50 000" />
              </label>
            </div>
            <label>
              Согласованное ТЗ
              <textarea required maxLength={16000} rows={5} value={brief} onChange={event => setBrief(event.target.value)} placeholder="Что входит в основной объём проекта" />
            </label>
            <p className={styles.small}>Основная работа оплачивается без наценки. После оплаты можно создать проект и выдать доступ клиенту.</p>
            {validation && <p className={styles.small} role="alert">{validation}</p>}
            <div className={styles.formActions}><button type="submit" className={styles.primary} disabled={controller.busy}>Подготовить ссылку на оплату</button></div>
          </form>
        </details>
      </section>
      <section className={styles.panel} aria-label="Создание проектов">
        <div className={styles.panelHeader}>
          <h2>Подготовленные проекты</h2>
          <span className={styles.small}>{controller.snapshot.orders.length}</span>
        </div>
        {controller.snapshot.orders.length === 0 && <Empty title="Первый проект впереди" text="Подготовьте данные клиента. Статус оплаты обновится автоматически." icon="document" />}
        {[...controller.snapshot.orders].reverse().map(order => (
          <article className={styles.order} key={order.id}>
            <div className={styles.taskTop}>
              <h3>{order.projectName}</h3>
              <span className={styles.badge} data-status={order.status}>{orderStatus[order.status]}</span>
            </div>
            <p className={styles.small}>
              {order.clientName}
              {' '}
              · 
              {' '}
              {order.email}
            </p>
            <p className={styles.small}>
              @
              {order.username.replace(/^@/, "")}
              {' '}
              ·
              {formatRubles(order.totalKopecks)}
            </p>
            <LongText text={order.brief} label="Согласованное ТЗ" />
            <div className={styles.formActions}>
              {order.status === "pending" && <a className={styles.orderLink} href={`/${demo ? "checkout-demo" : "checkout"}/#${encodeURIComponent(order.checkoutToken)}`} target="_blank" rel="noopener noreferrer">Открыть ссылку на оплату ↗</a>}
              {["paid", "needs_setup"].includes(order.status) && <button type="button" className={styles.primary} disabled={controller.busy} onClick={() => void controller.run({ type: "order.provision", orderId: order.id })}>Создать проект и выдать доступ</button>}
              {order.status === "ready" && <span className={styles.small}>{demo ? "Демонстрационный проект создан. Письмо не отправляется." : "Репозиторий создан, первое ТЗ передано разработчику, доступ отправлен на почту."}</span>}
            </div>
          </article>
        ))}
      </section>
    </div>
  );
}
