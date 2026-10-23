"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import type { PortalController } from "@/features/portal/lib/use-portal";
import type { StaffState } from "@/features/portal/model/staff";
import { DetailDialog, FocusDialog } from "@/features/portal/components/focus-dialog";
import { Empty } from "@/features/portal/components/ui";
import { notify } from "@/lib/notifications";
import portal from "./portal.module.css";
import styles from "./admin-staff.module.css";

export function AdminStaff({ controller }: { controller: PortalController }) {
  const api = controller.staff;
  const [data, setData] = useState<StaffState | null>(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const [name, setName] = useState(""); const [email, setEmail] = useState("");
  const trigger = useRef<HTMLButtonElement>(null);
  const intent = useRef(""); const alive = useRef(true); const sequence = useRef(0);
  const invalidate = useCallback(() => { sequence.current++; }, []);
  const refresh = useCallback(async () => {
    const current = ++sequence.current;
    try { const next = await api.state(); if (alive.current && current === sequence.current) { setData(next); setFailed(false); } }
    catch (error) { if (alive.current && current === sequence.current) { setFailed(true); notify.error(error instanceof Error ? error.message : "Не удалось загрузить разработчиков."); } }
  }, [api]);
  useEffect(() => { alive.current = true; const timer = setTimeout(() => void refresh(), 0); return () => { alive.current = false; clearTimeout(timer); invalidate(); }; }, [refresh, invalidate]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (busy) return;
    setBusy(true); sequence.current++;
    try {
      const next = await api.create({ type: "developer.create", requestId: intent.current, name, email });
      if (!alive.current) return;
      setData(next); setFailed(false); setOpen(false); notify.success("Аккаунт разработчика создан.");
    } catch (error) { if (alive.current) notify.error(error instanceof Error ? error.message : "Не удалось создать разработчика."); }
    finally { if (alive.current) setBusy(false); }
  }

  return (
    <section className={`${portal.panel} ${styles.root}`} aria-label="Аккаунты разработчиков">
      <div className={styles.toolbar}>
        <button ref={trigger} type="button" className={portal.primary} onClick={() => { intent.current = crypto.randomUUID(); setName(""); setEmail(""); setOpen(true); }}>Создать разработчика</button>
        <button type="button" className={portal.textButton} disabled={busy} onClick={() => void refresh()}>Обновить список</button>
      </div>
      {failed ? <p role="status">Не удалось загрузить список. Повторите обновление.</p> : !data ? <p role="status">Загружаем разработчиков…</p> : !data.developers.length ? <Empty title="Разработчиков пока нет" text="Создайте аккаунт для участника команды." /> : (
        <ul className={styles.list}>
          {data.developers.map(account => (
            <li key={account.id}>
              <div>
                <strong>{account.name}</strong>
                <p>{account.email}</p>
              </div>
              <DetailDialog label="Подробнее" title={account.name}>
                <p>{account.email}</p>
                <p>{account.createdAt ? `Создан ${new Date(account.createdAt).toLocaleString("ru-RU")}. ${account.createdBy}.` : "Аккаунт создан ранее."}</p>
              </DetailDialog>
            </li>
))}
        </ul>
      )}
      <FocusDialog open={open} title="Создать разработчика" onClose={() => setOpen(false)} busy={busy} returnFocus={trigger}>
        <form className={portal.form} onSubmit={event => void submit(event)}>
          <label>
            Имя разработчика
            <input disabled={busy} required maxLength={100} autoComplete="name" value={name} onChange={event => { setName(event.target.value); intent.current = crypto.randomUUID(); }} />
          </label>
          <label>
            Почта разработчика
            <input type="email" disabled={busy} required maxLength={254} autoComplete="email" value={email} onChange={event => { setEmail(event.target.value); intent.current = crypto.randomUUID(); }} />
          </label>
          <p className={portal.small}>Отправим приглашение на почту. Вход — по коду из письма.</p>
          <button type="submit" className={portal.primary} disabled={busy}>{busy ? "Создаём…" : "Создать аккаунт"}</button>
        </form>
      </FocusDialog>
    </section>
  );
}
