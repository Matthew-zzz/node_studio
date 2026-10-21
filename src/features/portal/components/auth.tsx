"use client";

import { useState } from "react";
import type { FormEvent } from "react";
import { WorkspaceBrand, ThemeSwitch } from "@/features/portal/components/ui";
import type { PortalController } from "@/features/portal/lib/use-portal";
import type { PortalTheme } from "@/features/portal/lib/use-portal-theme";
import styles from "./portal.module.css";

export function Login({ controller, theme, setTheme }: { controller: PortalController; theme: PortalTheme; setTheme: (theme: PortalTheme) => void }) {
  const [email, setEmail] = useState(""); const [password, setPassword] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (await controller.login(email, password)) setPassword("");
  }
  return (
    <main id="main" className={styles.authPage}>
      <div className={styles.authTop}>
        <WorkspaceBrand />
        <ThemeSwitch theme={theme} onChange={setTheme} />
      </div>
      <section className={`${styles.panel} ${styles.authCard}`}>
        <span className={styles.kicker}>Рабочее пространство студии</span>
        <h1>С возвращением</h1>
        <p>Всё по вашему проекту — в одном месте.</p>
        {controller.error && <p className={styles.notice} role="alert">{controller.error}</p>}
        <form className={styles.form} onSubmit={event => void submit(event)}>
          <label>
            Почта
            <input type="email" autoComplete="username" required maxLength={254} value={email} onChange={event => setEmail(event.target.value)} placeholder="you@example.ru" />
          </label>
          <label>
            Пароль
            <input type="password" autoComplete="current-password" required maxLength={256} value={password} onChange={event => setPassword(event.target.value)} placeholder="Ваш пароль" />
          </label>
          <button className={styles.primary} type="submit" disabled={controller.busy || controller.loading}>{controller.busy ? "Входим…" : "Войти в кабинет"}</button>
        </form>
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
  const [message, setMessage] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setMessage("");
    if (repeat !== replacement) { setMessage("Пароли не совпадают."); return; }
    if (await controller.password(current, replacement)) { setCurrent(""); setReplacement(""); setRepeat(""); setMessage("Пароль сохранён."); }
  }
  return (
    <section className={`${styles.panel} ${styles.settings}`}>
      <h2>{required ? "Задайте свой пароль" : "Смена пароля"}</h2>
      <p className={styles.subtitle}>{required ? "Временный пароль из письма нужно заменить перед началом работы." : "Один пароль для всех ваших проектов."}</p>
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
        {message && <p className={styles.small} role="status">{message}</p>}
      </form>
    </section>
  );
}
