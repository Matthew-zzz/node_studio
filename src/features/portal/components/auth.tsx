"use client";

import { useState } from "react";
import type { FormEvent } from "react";
import { WorkspaceBrand, ThemeSwitch } from "@/features/portal/components/ui";
import type { PortalController } from "@/features/portal/lib/use-portal";
import type { PortalTheme } from "@/features/portal/lib/use-portal-theme";
import styles from "./portal.module.css";
import { EmailVerification } from "@/features/portal/components/email-verification";
import { ActionsDialog, DetailDialog } from "@/features/portal/components/focus-dialog";
import { ROLE_LABELS } from "@/features/portal/model/types";
import type { Role } from "@/features/portal/model/types";

export function Login({ controller, theme, setTheme }: { controller: PortalController; theme: PortalTheme; setTheme: (theme: PortalTheme) => void }) {
  const [email, setEmail] = useState(""); const [role, setRole] = useState<Role>("client");
  const staff = role !== "client";
  async function submit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); await controller.login(email, role); }
  return (
    <main id="main" className={styles.authPage}>
      <div className={styles.authTop}>
        <WorkspaceBrand />
        <ThemeSwitch theme={theme} onChange={setTheme} />
      </div>
      <section className={`${styles.panel} ${styles.authCard}`}>
        <h1>{controller.challenge ? "Подтвердите вход" : "С возвращением"}</h1>
        {controller.challenge ? <EmailVerification controller={controller} /> : (
          <>
            <p>Укажите почту — пришлём код для входа.</p>
            <form className={styles.form} onSubmit={event => void submit(event)}>
              {staff && (
              <label>
                Профиль
                <select value={role} onChange={event => setRole(event.target.value as Role)}>{(["developer", "admin"] as const).map(value => <option key={value} value={value}>{ROLE_LABELS[value]}</option>)}</select>
              </label>
)}
              <label>
                Почта
                <input type="email" autoComplete="email" required maxLength={254} value={email} onChange={event => setEmail(event.target.value)} placeholder="you@example.ru" />
              </label>
              <button className={styles.primary} type="submit" disabled={controller.busy || controller.loading}>{controller.busy ? "Подождите…" : "Получить код"}</button>
            </form>
            {staff && <p className={styles.small}>Доступ сотрудника выдаёт администратор.</p>}
            <button type="button" className={styles.textButton} disabled={controller.busy} onClick={() => setRole(staff ? "client" : "developer")}>{staff ? "Вход для клиентов" : "Вход для сотрудников"}</button>
          </>
        )}
      </section>
      <div className={styles.authFooter}>
        <a href="https://t.me/node_studio_bot" target="_blank" rel="noopener noreferrer">Помощь со входом ↗</a>
        <DetailDialog label="Как получить доступ"><p>После согласования и полной оплаты проекта студия создаст доступ для вашей почты. Для входа достаточно кода из письма.</p></DetailDialog>
      </div>
    </main>
  );
}

export function AccountSettings({ controller }: { controller: PortalController }) {
  return (
    <section className={`${styles.panel} ${styles.settings}`}>
      <h2>Аккаунт</h2>
      <p>{controller.snapshot.viewer?.email}</p>
      <p className={styles.small}>Вход по коду из письма. Подтверждение действует до завершения сессии.</p>
      <ActionsDialog
        label="Безопасность аккаунта"
        triggerLabel="Безопасность"
        busy={controller.busy}
        actions={[
        { label: "Завершить все сеансы", icon: "people", danger: true, content: close => (
          <div className={styles.form}>
            <p>Все профили на вашей почте выйдут из кабинета на всех устройствах. Для входа потребуется новый код.</p>
            <div className={styles.formActions}>
              <button type="button" className={styles.secondary} disabled={controller.busy} onClick={close}>Отмена</button>
              <button type="button" className={`${styles.secondary} ${styles.danger}`} disabled={controller.busy} onClick={() => void controller.logoutAll()}>Подтвердить завершение сеансов</button>
            </div>
          </div>
        ) },
      ]}
      />
    </section>
  );
}
