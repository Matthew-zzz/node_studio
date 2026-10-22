"use client";

import { useState } from "react";
import type { FormEvent } from "react";
import { WorkspaceBrand, ThemeSwitch } from "@/features/portal/components/ui";
import type { PortalController } from "@/features/portal/lib/use-portal";
import type { PortalTheme } from "@/features/portal/lib/use-portal-theme";
import { notify } from "@/lib/notifications";
import styles from "./portal.module.css";
import { EmailVerification } from "@/features/portal/components/email-verification";
import { ROLE_LABELS } from "@/features/portal/model/types";
import type { Role } from "@/features/portal/model/types";

export function Login({ controller, theme, setTheme }: { controller: PortalController; theme: PortalTheme; setTheme: (theme: PortalTheme) => void }) {
  const [email, setEmail] = useState(""); const [password, setPassword] = useState("");
  const [role, setRole] = useState<Role>("client"); const [recover, setRecover] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (recover) { await controller.forgotPassword(email, role); return; }
    if (await controller.login(email, password, role)) setPassword("");
  }
  return (
    <main id="main" className={styles.authPage}>
      <div className={styles.authTop}>
        <WorkspaceBrand />
        <ThemeSwitch theme={theme} onChange={setTheme} />
      </div>
      <section className={`${styles.panel} ${styles.authCard}`}>
        <span className={styles.kicker}>Рабочее пространство студии</span>
        <h1>{controller.challenge ? "Подтвердите вход" : recover ? "Восстановление доступа" : "С возвращением"}</h1>
        {controller.challenge ? <EmailVerification controller={controller} /> : (
          <>
            <p>{recover ? "Отправим ссылку для смены пароля и завершения всех сеансов." : "Всё по вашему проекту — в одном месте."}</p>
            <form className={styles.form} onSubmit={event => void submit(event)}>
              <label>
                Профиль
                <select value={role} onChange={event => setRole(event.target.value as Role)}>{Object.entries(ROLE_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
              </label>
              <label>
                Почта
                <input type="email" autoComplete="username" required maxLength={254} value={email} onChange={event => setEmail(event.target.value)} placeholder="you@example.ru" />
              </label>
              {!recover && (
              <label>
                Пароль
                <input type="password" autoComplete="current-password" required maxLength={256} value={password} onChange={event => setPassword(event.target.value)} placeholder="Ваш пароль" />
              </label>
)}
              <button className={styles.primary} type="submit" disabled={controller.busy || controller.loading}>{controller.busy ? "Подождите…" : recover ? "Отправить ссылку" : "Войти в кабинет"}</button>
            </form>
            <button className={styles.textButton} type="button" disabled={controller.busy} onClick={() => { setRecover(!recover); setPassword(""); }}>{recover ? "Вернуться ко входу" : "Забыли пароль?"}</button>
          </>
)}
      </section>
      <div className={styles.authFooter}>
        <a href="https://t.me/node_studio_bot" target="_blank" rel="noopener noreferrer">Помощь со входом ↗</a>
        <details>
          <summary>Как получить доступ</summary>
          <p>После согласования и полной оплаты проекта студия отправит доступ на вашу почту. Если письмо не пришло, напишите в поддержку.</p>
        </details>
      </div>
    </main>
  );
}

export function PasswordForm({ controller, required = false }: { controller: PortalController; required?: boolean }) {
  const [current, setCurrent] = useState(""); const [replacement, setReplacement] = useState(""); const [repeat, setRepeat] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (repeat !== replacement) { notify.error("Пароли не совпадают."); return; }
    if (await controller.password(current, replacement)) { setCurrent(""); setReplacement(""); setRepeat(""); }
  }
  return (
    <section className={`${styles.panel} ${styles.settings}`}>
      <h2>{required ? "Задайте свой пароль" : "Смена пароля"}</h2>
      <p className={styles.subtitle}>{required ? "Временный пароль из письма нужно заменить перед началом работы." : "Пароль обновится у всех профилей на вашей почте. Сеансы на других устройствах завершатся."}</p>
      <form className={styles.form} onSubmit={event => void submit(event)} style={{ marginTop: 24 }}>
        <label>
          {required ? "Временный пароль" : "Текущий пароль"}
          <input type="password" autoComplete="current-password" required maxLength={256} value={current} onChange={event => setCurrent(event.target.value)} />
        </label>
        <label>
          Новый пароль · от 12 символов
          <input type="password" autoComplete="new-password" required minLength={12} maxLength={256} value={replacement} onChange={event => setReplacement(event.target.value)} />
        </label>
        <label>
          Повторите новый пароль
          <input type="password" autoComplete="new-password" required minLength={12} maxLength={256} value={repeat} onChange={event => setRepeat(event.target.value)} />
        </label>
        <button className={styles.primary} type="submit" disabled={controller.busy}>Сохранить пароль</button>
      </form>
    </section>
  );
}
