"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { PortalController } from "@/features/portal/lib/use-portal";
import type { ErrorEvent, ErrorPage, ErrorProvider, ErrorQuery } from "@/features/portal/model/errors";
import { ERROR_PROVIDER_LABELS, ERROR_SOURCE_LABELS } from "@/features/portal/model/errors";
import { ROLE_LABELS } from "@/features/portal/model/types";
import { Empty } from "@/features/portal/components/ui";
import { notify } from "@/lib/notifications";
import portal from "@/features/portal/components/portal.module.css";
import styles from "./errors.module.css";
import { FocusDialog } from "@/features/portal/components/focus-dialog";

const date = (value: string) => new Date(value).toLocaleString("ru-RU");
const role = (event: ErrorEvent) => event.actor ? event.actor.role === "telegram" ? "Пользователь Telegram" : event.actor.role === "curator" ? "Бывший сотрудник" : ROLE_LABELS[event.actor.role] : "Без авторизации / не определён";

function ErrorDetails({ event, busy, onResolve }: { event: ErrorEvent; busy: boolean; onResolve: () => void }) {
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  return (
    <article className={styles.event}>
      <button ref={trigger} type="button" className={styles.open} aria-label={`Открыть ошибку: ${event.title}`} aria-haspopup="dialog" onClick={() => setOpen(true)}>
        <span className={styles.heading}>
          <span className={styles.indicator} data-severity={event.resolvedAt ? "resolved" : event.severity} aria-hidden="true" />
          <strong>{event.title}</strong>
          <span className={styles.badge}>{event.count > 1 ? `×${event.count}` : ERROR_PROVIDER_LABELS[event.provider]}</span>
        </span>
        <span className={styles.meta}>{`${event.actor?.name ?? "Пользователь не определён"}${event.projectName ? ` · ${event.projectName}` : ""}`}</span>
      </button>
      <FocusDialog open={open} title={event.title} returnFocus={trigger} onClose={() => setOpen(false)}>
        <div className={styles.details}>
          <p>{event.explanation}</p>
          <div className={styles.advice}>
            <strong>Что сделать</strong>
            <p>{event.recommendation}</p>
            {event.documentation && <a href={event.documentation} target="_blank" rel="noreferrer">Инструкция сервиса ↗</a>}
          </div>
          <dl className={styles.data}>
            <div>
              <dt>Пользователь</dt>
              <dd>{event.actor ? `${event.actor.name}${event.actor.email ? ` · ${event.actor.email}` : ""}` : "Сессия пользователя не определена"}</dd>
            </div>
            {event.actor && (
            <div>
              <dt>Роль и ID</dt>
              <dd>{`${role(event)} · ${event.actor.id}`}</dd>
            </div>
          )}
            {event.projectId && (
            <div>
              <dt>Проект</dt>
              <dd>{`${event.projectName} · ${event.projectId}`}</dd>
            </div>
          )}
            <div>
              <dt>Источник</dt>
              <dd>{ERROR_SOURCE_LABELS[event.source]}</dd>
            </div>
            {event.subprojectName && (
            <div>
              <dt>Подпроект</dt>
              <dd>{event.subprojectName}</dd>
            </div>
          )}
            <div>
              <dt>Запрос</dt>
              <dd><code>{`${event.method} ${event.path || event.operation}`}</code></dd>
            </div>
            {event.operation && event.path && (
            <div>
              <dt>Действие</dt>
              <dd>{event.operation}</dd>
            </div>
          )}
            <div>
              <dt>Код ошибки</dt>
              <dd><code>{event.code}</code></dd>
            </div>
            <div>
              <dt>Код ошибки / сервис</dt>
              <dd>{`${event.status ?? "нет ответа"} / ${event.upstreamStatus ?? "—"}`}</dd>
            </div>
            {event.requestStatus !== undefined && (
            <div>
              <dt>HTTP запроса кабинета</dt>
              <dd>{event.requestStatus === 200 ? "200 · данные получены, ошибка фоновой синхронизации" : event.requestStatus}</dd>
            </div>
          )}
            {event.upstreamPath && (
            <div>
              <dt>Запрос к сервису</dt>
              <dd><code>{event.upstreamPath}</code></dd>
            </div>
          )}
            <div>
              <dt>ID запроса</dt>
              <dd><code>{event.requestId}</code></dd>
            </div>
            {event.upstreamRequestId && (
            <div>
              <dt>ID запроса сервиса</dt>
              <dd><code>{event.upstreamRequestId}</code></dd>
            </div>
          )}
            <div>
              <dt>Первый / последний сбой</dt>
              <dd>{`${date(event.firstSeen)} / ${date(event.lastSeen)}`}</dd>
            </div>
            <div>
              <dt>Повторений</dt>
              <dd>{event.count}</dd>
            </div>
            {event.clientOccurredAt && (
            <div>
              <dt>Время на устройстве</dt>
              <dd>{date(event.clientOccurredAt)}</dd>
            </div>
          )}
            {Boolean(event.trace?.length) && (
            <div>
              <dt>Место ошибки</dt>
              <dd><code>{event.trace?.join("\n")}</code></dd>
            </div>
          )}
            <div>
              <dt>Версия приложения</dt>
              <dd><code>{event.revision}</code></dd>
            </div>
            {event.resolvedAt && (
            <div>
              <dt>Отмечена решённой</dt>
              <dd>{`${date(event.resolvedAt)} · ${event.resolvedBy}`}</dd>
            </div>
          )}
          </dl>
          <button className={portal.secondary} type="button" disabled={busy} onClick={onResolve}>{event.resolvedAt ? "Вернуть в открытые" : "Отметить решённой"}</button>
          <p className={portal.small}>Отметка меняет статус записи в журнале. Повторный сбой появится как новая открытая ошибка.</p>
        </div>
      </FocusDialog>
    </article>
  );
}

export function AdminErrors({ controller }: { controller: PortalController }) {
  const [query, setQuery] = useState<ErrorQuery>({ state: "open", search: "", provider: "all", page: 1 });
  const [data, setData] = useState<ErrorPage | null>(null); const [busy, setBusy] = useState(false); const [failure, setFailure] = useState("");
  const sequence = useRef(0); const alive = useRef(true); const currentQuery = useRef(query);
  const lastFailure = useRef(""); const notification = useRef<string | number | undefined>(undefined);
  const invalidate = useCallback(() => { sequence.current++; }, []);
  const api = controller.errors;
  const refresh = useCallback(async (filter = currentQuery.current) => {
    const request = ++sequence.current;
    try { const next = await api.list(filter); if (alive.current && request === sequence.current) { setData(next); setFailure(""); lastFailure.current = ""; if (notification.current !== undefined) notify.dismiss(notification.current); } }
    catch (error) {
      if (alive.current && request === sequence.current) {
        const message = error instanceof Error ? error.message : "Не удалось открыть журнал.";
        setFailure(message);
        if (lastFailure.current !== message) { notification.current = notify.error(message); lastFailure.current = message; }
      }
    }
  }, [api]);
  useEffect(() => { alive.current = true; return () => { alive.current = false; invalidate(); }; }, [invalidate]);
  useEffect(() => {
    currentQuery.current = query;
    const delay = setTimeout(() => void refresh(query), 250);
    const timer = setInterval(() => { if (!document.hidden) void refresh(query); }, 10_000);
    return () => { invalidate(); clearTimeout(delay); clearInterval(timer); };
  }, [query, refresh, invalidate]);
  async function resolve(event: ErrorEvent) {
    setBusy(true);
    try { await api.resolve(event.id, !event.resolvedAt); if (!alive.current) return; notify.success(event.resolvedAt ? "Ошибка снова открыта." : "Ошибка отмечена решённой."); await refresh(); }
    catch (error) { if (alive.current) notify.error(error instanceof Error ? error.message : "Не удалось изменить статус."); }
    finally { if (alive.current) setBusy(false); }
  }
  return (
    <div className={styles.root}>
      <div className={styles.toolbar}>
        <p className={portal.small}>{failure ? "Журнал временно недоступен" : data ? `Открытых ошибок: ${data.open} · Найдено: ${data.total}` : "Загружаем журнал…"}</p>
        <button className={portal.textButton} type="button" onClick={() => void refresh()}>Обновить журнал</button>
      </div>
      <section className={`${portal.panel} ${styles.filters}`} aria-label="Фильтры ошибок">
        <label>
          Поиск
          <input aria-label="Поиск ошибок" placeholder="Имя, почта, проект или код" value={query.search} maxLength={200} onChange={event => setQuery({ ...query, search: event.target.value, page: 1 })} />
        </label>
        <label>
          Статус
          <select aria-label="Статус ошибок" value={query.state} onChange={event => setQuery({ ...query, state: event.target.value as ErrorQuery["state"], page: 1 })}>
            <option value="open">Открытые</option>
            <option value="resolved">Решённые</option>
            <option value="all">Все</option>
          </select>
        </label>
        <label>
          Сервис
          <select aria-label="Сервис ошибок" value={query.provider} onChange={event => setQuery({ ...query, provider: event.target.value as ErrorProvider | "all", page: 1 })}>
            <option value="all">Все сервисы</option>
            {Object.entries(ERROR_PROVIDER_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </label>
      </section>
      {data && (
        <section className={portal.panel} aria-label="Журнал ошибок">
          {!data.events.length && <Empty title="Ошибок не найдено" text="Ошибки запросов будут появляться здесь автоматически. Повторения объединяются для каждого пользователя и проекта." icon="check" />}
          {data.events.map(event => <ErrorDetails key={event.id} event={event} busy={busy} onResolve={() => void resolve(event)} />)}
          {data.total > data.pageSize && (
          <div className={styles.pagination}>
            <button className={portal.secondary} type="button" disabled={data.page === 1} onClick={() => setQuery({ ...query, page: data.page - 1 })}>Назад</button>
            <span className={portal.small}>{`${data.page} / ${Math.ceil(data.total / data.pageSize)}`}</span>
            <button className={portal.secondary} type="button" disabled={data.page * data.pageSize >= data.total} onClick={() => setQuery({ ...query, page: data.page + 1 })}>Далее</button>
          </div>
      )}
        </section>
)}
      <p className={`${portal.small} ${styles.note}`}>Обновляется автоматически. Журнал хранит до 2 000 записей. При полной потере связи сообщения браузера передаются после её восстановления.</p>
    </div>
  );
}
