"use client";

import { useState } from "react";
import type { FormEvent } from "react";
import { Chat } from "@/features/portal/components/chat";
import { Empty, LongText } from "@/features/portal/components/ui";
import type { PortalController } from "@/features/portal/lib/use-portal";
import type { Conversation } from "@/features/portal/model/types";
import { formatRubles, parseRubles } from "@/features/payments/model/payment";
import styles from "./portal.module.css";

type InboxFilter = "all" | "waiting" | "mine";

export function TelegramInbox({ controller }: { controller: PortalController }) {
  const [selected, setSelected] = useState("");
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<InboxFilter>("all");
  const conversations = controller.snapshot.conversations;
  const viewerId = controller.snapshot.viewer?.id;
  const waiting = conversations.filter(thread => thread.handoffRequested && !thread.ownerId);
  const mine = conversations.filter(thread => thread.ownerId === viewerId);
  const sorted = [...conversations].sort((a, b) => Number(b.handoffRequested && !b.ownerId) - Number(a.handoffRequested && !a.ownerId) || b.updatedAt.localeCompare(a.updatedAt));
  function matches(thread: Conversation, nextFilter: InboxFilter, nextSearch: string) {
    const query = nextSearch.trim().replace(/^@/, "").toLocaleLowerCase("ru");
    return (nextFilter === "all" || (nextFilter === "waiting" ? waiting : mine).includes(thread))
      && `${thread.name} ${thread.username} ${thread.email}`.toLocaleLowerCase("ru").includes(query);
  }
  function changeSelection(nextFilter: InboxFilter, nextSearch: string) {
    setFilter(nextFilter); setSearch(nextSearch);
    setSelected(sorted.find(thread => matches(thread, nextFilter, nextSearch))?.id ?? "");
  }
  const threads = sorted.filter(thread => matches(thread, filter, search));
  // Claiming a waiting conversation moves it to "mine" without interrupting the open chat.
  const thread = conversations.find(thread => thread.id === selected) ?? threads[0];
  return (
    <div className={styles.stack}>
      <section className={`${styles.panel} ${styles.inboxTools}`} aria-label="Поиск обращений">
        <div className={styles.filters} role="group" aria-label="Фильтр диалогов">
          <button type="button" aria-label="Все диалоги" aria-pressed={filter === "all"} onClick={() => changeSelection("all", search)}>
            Все
            <span>{conversations.length}</span>
          </button>
          <button type="button" aria-label="Ждут куратора" aria-pressed={filter === "waiting"} onClick={() => changeSelection("waiting", search)}>
            Ждут куратора
            <span>{waiting.length}</span>
          </button>
          <button type="button" aria-label="Мои диалоги" aria-pressed={filter === "mine"} onClick={() => changeSelection("mine", search)}>
            Мои
            <span>{mine.length}</span>
          </button>
        </div>
        <label className={styles.searchField}>
          Поиск диалогов
          <input type="search" value={search} onChange={event => changeSelection(filter, event.target.value)} placeholder="Имя, @username или почта" />
        </label>
      </section>
      {thread ? (
        <div className={styles.inbox}>
          <section className={`${styles.panel} ${styles.inboxList}`} aria-label="Очередь обращений">
            {threads.length === 0 && <p className={styles.inboxHint}>В этой очереди больше нет обращений. Открытый диалог остаётся у вас.</p>}
            {threads.map(item => (
              <button type="button" className={styles.inboxItem} key={item.id} aria-current={item.id === thread?.id ? "true" : undefined} onClick={() => setSelected(item.id)}>
                <strong>{item.name}</strong>
                <span className={styles.small}>
                  @
                  {item.username.replace(/^@/, "")}
                </span>
                <p>{controller.snapshot.messages.filter(message => message.threadId === item.id).at(-1)?.text ?? "Новый диалог"}</p>
                {item.handoffRequested && !item.ownerId ? <span className={styles.badge} data-status="pending">Ждёт человека</span> : item.ownerId ? <span className={styles.badge}>{item.ownerName}</span> : <span className={styles.badge}>С ИИ-помощником</span>}
              </button>
            ))}
          </section>
          <Chat key={thread?.id} thread={thread} controller={controller} />
        </div>
      ) : (
        <section className={styles.panel}>
          <Empty title={conversations.length ? "Диалоги не найдены" : "Пока тихо"} text={conversations.length ? "Измените запрос или выберите другую очередь." : "Здесь появятся обращения в Telegram-бот студии."} icon={conversations.length ? "search" : "telegram"} />
          {conversations.length > 0 && <button className={styles.secondary} type="button" onClick={() => changeSelection("all", "")}>Сбросить фильтры</button>}
        </section>
      )}
    </div>
  );
}

const orderStatus = { pending: "Ожидает оплаты", paid: "Оплачено · тест", provisioning: "Создаём проект…", ready: "Доступ выдан", needs_setup: "Нужна настройка подключений" };

export function ProjectOrders({ controller }: { controller: PortalController }) {
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
              {order.status === "pending" && <a className={styles.orderLink} href={`/checkout/#${encodeURIComponent(order.checkoutToken)}`} target="_blank" rel="noopener noreferrer">Открыть ссылку на оплату ↗</a>}
              {["paid", "needs_setup"].includes(order.status) && <button type="button" className={styles.primary} disabled={controller.busy} onClick={() => void controller.run({ type: "order.provision", orderId: order.id })}>Создать проект и выдать доступ</button>}
              {order.status === "ready" && <span className={styles.small}>Репозиторий создан, первое ТЗ передано разработчику, доступ отправлен на почту.</span>}
            </div>
          </article>
        ))}
      </section>
    </div>
  );
}
