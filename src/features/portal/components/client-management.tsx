"use client";

import { useLayoutEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import { Chat } from "@/features/portal/components/chat";
import { ActionsDialog, ActionsMenu, FocusDialog } from "@/features/portal/components/focus-dialog";
import { CreateProject } from "@/features/portal/components/project-manager";
import { ClientProjectForm } from "@/features/portal/components/client-project-form";
import { ClientBriefButton } from "@/features/portal/components/client-brief";
import { DeletePayment } from "@/features/portal/components/delete-confirmation";
import { ResendPayment } from "@/features/portal/components/resend-payment";
import { ProjectInfo } from "@/features/portal/components/project-work";
import { Empty } from "@/features/portal/components/ui";
import type { PortalController } from "@/features/portal/lib/use-portal";
import type { Conversation } from "@/features/portal/model/types";
import { formatRubles, parseRubles } from "@/features/payments/model/payment";
import { notify } from "@/lib/notifications";
import styles from "./portal.module.css";

type InboxFilter = "all" | "waiting" | "mine";

interface TelegramInboxProps {
  controller: PortalController;
  presentation?: "web" | "miniapp";
  selectedThreadId?: string;
  onSelectThread?: (id: string | null) => void;
}

export function TelegramInbox({ controller, presentation = "web", selectedThreadId = "", onSelectThread }: TelegramInboxProps) {
  const [selected, setSelected] = useState("");
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<InboxFilter>("all");
  const list = useRef<HTMLDivElement>(null);
  const listScroll = useRef(0);
  const miniapp = presentation === "miniapp";
  useLayoutEffect(() => {
    if (miniapp && !selectedThreadId) list.current?.closest("main")?.scrollTo({ top: listScroll.current });
  }, [miniapp, selectedThreadId]);
  const conversations = controller.snapshot.conversations.filter(thread => thread.kind === "telegram");
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
    if (!miniapp) setSelected(sorted.find(thread => matches(thread, nextFilter, nextSearch))?.id ?? "");
  }
  const threads = sorted.filter(thread => matches(thread, filter, search));
  // Claiming a waiting conversation moves it to "mine" without interrupting the open chat.
  const thread = miniapp ? conversations.find(thread => thread.id === selectedThreadId) : conversations.find(thread => thread.id === selected) ?? threads[0];
  function selectThread(id: string) {
    if (miniapp) {
      listScroll.current = list.current?.closest("main")?.scrollTop ?? 0;
      onSelectThread?.(id);
    } else setSelected(id);
  }
  if (miniapp && thread) return (
    <section className={styles.telegramScreen} aria-label="Открытый Telegram-диалог">
      <Chat key={thread.id} thread={thread} controller={controller} showHeader={false} draft={drafts[thread.id] ?? ""} onDraftChange={value => setDrafts(previous => ({ ...previous, [thread.id]: value }))} />
    </section>
  );
  return (
    <div ref={list} className={`${styles.stack} ${miniapp ? styles.telegramList : ""}`}>
      <section className={`${styles.panel} ${styles.inboxTools}`} aria-label="Поиск обращений">
        <div className={styles.filters} role="group" aria-label="Фильтр диалогов">
          <button type="button" aria-label="Все диалоги" aria-pressed={filter === "all"} onClick={() => changeSelection("all", search)}>
            Все

          </button>
          <button type="button" aria-label="Ждут разработчика" aria-pressed={filter === "waiting"} onClick={() => changeSelection("waiting", search)}>
            Ждут ответа

          </button>
          <button type="button" aria-label="Мои диалоги" aria-pressed={filter === "mine"} onClick={() => changeSelection("mine", search)}>
            Мои

          </button>
        </div>
        <div className={styles.searchField}>
          <input type="search" aria-label="Поиск диалогов" value={search} onChange={event => changeSelection(filter, event.target.value)} placeholder="Имя, @username или почта" />
        </div>
      </section>
      {(miniapp ? threads.length > 0 : Boolean(thread)) ? (
        <div className={styles.inbox}>
          <section className={`${styles.panel} ${styles.inboxList}`} aria-label="Очередь обращений">
            {threads.length === 0 && <p className={styles.inboxHint}>В этой очереди больше нет обращений. Открытый диалог остаётся у вас.</p>}
            {threads.map(item => (
              <div className={styles.inboxCard} key={item.id}>
                <button type="button" className={styles.inboxItem} aria-label={`Открыть диалог: ${item.name}`} aria-current={item.id === thread?.id ? "true" : undefined} onClick={() => selectThread(item.id)}>
                  <strong>{item.name}</strong>
                  <span className={styles.small}>
                    @
                    {item.username.replace(/^@/, "")}
                  </span>
                  <p>{controller.snapshot.messages.filter(message => message.threadId === item.id).at(-1)?.text ?? "Новый диалог"}</p>
                  {item.handoffRequested && !item.ownerId ? <span className={styles.badge} data-status="pending">Ждёт человека</span> : item.ownerId ? <span className={styles.badge}>{item.ownerName}</span> : <span className={styles.badge}>С ИИ-помощником</span>}
                </button>
                {!miniapp && <ClientBriefButton thread={item} controller={controller} />}
              </div>
            ))}
          </section>
          {!miniapp && <Chat key={thread?.id} thread={thread} controller={controller} />}
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

export function ProjectOrders({ controller, checkoutPath = "/checkout/", onOpenProject }: { controller: PortalController; checkoutPath?: string; onOpenProject: (id: string) => void }) {
  const [mode, setMode] = useState<"client" | "payment" | "import" | null>(null);
  const [name, setName] = useState(""); const [client, setClient] = useState(""); const [email, setEmail] = useState("");
  const [username, setUsername] = useState(""); const [brief, setBrief] = useState(""); const [amount, setAmount] = useState("");
  const kopecks = parseRubles(amount);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!kopecks) { notify.error("Введите корректную стоимость в рублях."); return; }
    if (await controller.run({ type: "order.create", order: { projectName: name, clientName: client, email, username, brief, totalKopecks: kopecks } })) {
      setName(""); setClient(""); setEmail(""); setUsername(""); setBrief(""); setAmount(""); setMode(null);
    }
  }
  const projects = controller.snapshot.projects.filter(project => project.origin === "developer");
  return (
    <section className={styles.panel} aria-label="Проекты клиентов">
      <div className={styles.panelHeader}>
        <h2>Проекты клиентов</h2>
        <ActionsMenu
          label="Создать проект"
          triggerLabel="Создать проект"
          actions={[
          { label: "Создать для существующего клиента", icon: "people", onSelect: () => setMode("client") },
          { label: "Подготовить ссылку на оплату", icon: "document", onSelect: () => setMode("payment") },
          { label: "Создать проект из репозиториев", icon: "code", onSelect: () => setMode("import") },
        ]}
        />
      </div>
      <FocusDialog open={mode !== null} title={mode === "client" ? "Создать для существующего клиента" : mode === "import" ? "Создать проект из репозиториев" : "Оплата и выдача доступа"} busy={controller.busy} onClose={() => setMode(null)}>
        {mode === "client" && <ClientProjectForm controller={controller} onCreated={() => setMode(null)} />}
        {mode === "import" && <CreateProject controller={controller} embedded onCreated={id => { setMode(null); onOpenProject(id); }} />}
        {mode === "payment" && (
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
            <div className={styles.formActions}><button type="submit" className={styles.primary} disabled={controller.busy}>Подготовить ссылку на оплату</button></div>
          </form>
        )}
      </FocusDialog>
      {projects.length === 0 && controller.snapshot.orders.length === 0 && <Empty title="Пока нет проектов" text="Создайте проект или подготовьте ссылку на оплату." icon="document" />}
      {[...projects].reverse().map(project => (
        <article key={project.id} className={styles.order}>
          <div className={styles.taskTop}>
            <h3>{project.name}</h3>
            <span className={styles.badge}>{project.developerId ? "В работе" : "В общей очереди"}</span>
          </div>
          <p className={styles.small}>{project.clientEmail}</p>
          <div className={styles.formActions}>
            <button className={styles.secondary} type="button" onClick={() => onOpenProject(project.id)}>Открыть проект</button>
            <ProjectInfo project={project} controller={controller} />
          </div>
        </article>
      ))}
      {[...controller.snapshot.orders].reverse().map(order => (
        <article className={styles.order} key={order.id}>
          <div className={styles.taskTop}>
            <h3>{order.projectName}</h3>
            <span className={styles.badge} data-status={order.status}>{orderStatus[order.status]}</span>
          </div>
          <p className={styles.small}>{`${order.email} · ${formatRubles(order.totalKopecks)}`}</p>
          <div className={styles.formActions}>
            {order.status === "pending" && <a className={styles.orderLink} href={`${checkoutPath}#${encodeURIComponent(order.checkoutToken)}`} target="_blank" rel="noopener noreferrer">Открыть ссылку на оплату ↗</a>}
            {["paid", "needs_setup"].includes(order.status) && <button type="button" className={styles.primary} disabled={controller.busy} onClick={() => void controller.run({ type: "order.provision", orderId: order.id })}>Создать проект и выдать доступ</button>}
            {order.status === "ready" && <button type="button" className={styles.secondary} onClick={() => onOpenProject(order.projectId)}>Открыть проект</button>}
            <ActionsDialog
              label={`Действия заказа: ${order.projectName}`}
              busy={controller.busy}
              actions={[
              ...(order.status === "pending" ? [{ label: "Повторно отправить ссылку", icon: "telegram" as const, content: <ResendPayment source="order" sourceId={order.id} controller={controller} /> }] : []),
              { label: "Согласованное ТЗ", icon: "document", content: <p>{order.brief}</p> },
              { label: "Контакты клиента", icon: "people", content: <p>{`${order.clientName}\n${order.email}\n@${order.username.replace(/^@/, "")}`}</p> },
              { label: "Удалить оплату", icon: "trash", danger: true, content: close => <DeletePayment kind="order" payment={order} controller={controller} onClose={close} /> },
            ]}
            />
          </div>
        </article>
      ))}
    </section>
  );
}
