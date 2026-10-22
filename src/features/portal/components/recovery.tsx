"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import { createApiGateway } from "@/features/portal/lib/gateway";
import { usePortalTheme } from "@/features/portal/lib/use-portal-theme";
import { ThemeSwitch, WorkspaceBrand } from "@/features/portal/components/ui";
import { Notifications } from "@/components/ui/notifications";
import { notify } from "@/lib/notifications";
import styles from "./portal.module.css";

export function Recovery() {
  const gateway = useMemo(() => createApiGateway(), []);
  const { theme, setTheme } = usePortalTheme();
  const [token, setToken] = useState(""); const [email, setEmail] = useState(""); const [error, setError] = useState("");
  const [replacement, setReplacement] = useState(""); const [repeat, setRepeat] = useState("");
  const [busy, setBusy] = useState(false); const [done, setDone] = useState(false);
  useEffect(() => {
    gateway.activate(); let active = true;
    const input = location.hash.slice(1);
    void gateway.auth.recovery(input).then(details => { if (active) { setToken(input); setEmail(details.email); } }).catch(error => { if (active) setError(error instanceof Error ? error.message : "Ссылка недействительна."); });
    return () => { active = false; gateway.dispose(); };
  }, [gateway]);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (replacement !== repeat) { notify.error("Пароли не совпадают."); return; }
    setBusy(true);
    try {
      await gateway.auth.reset(token, replacement); setDone(true); setReplacement(""); setRepeat(""); setToken("");
      history.replaceState(null, "", location.pathname);
      if (typeof BroadcastChannel !== "undefined") { const channel = new BroadcastChannel("nodo-portal-profiles"); channel.postMessage("changed"); channel.close(); }
    } catch (error) { notify.error(error instanceof Error ? error.message : "Не удалось сменить пароль."); }
    finally { setBusy(false); }
  }
  return (
    <div className={styles.root} data-theme={theme}>
      <Notifications />
      <main id="main" className={styles.authPage}>
        <div className={styles.authTop}>
          <WorkspaceBrand />
          <ThemeSwitch theme={theme} onChange={setTheme} />
        </div>
        <section className={`${styles.panel} ${styles.authCard}`}>
          <h1>{done ? "Доступ защищён" : "Смена пароля"}</h1>
          {done ? <p>Пароль изменён. Все сеансы ваших профилей завершены. Войдите с новым паролем и подтвердите вход кодом из письма.</p> : error ? <p>{error}</p> : !token ? <p role="status">Проверяем ссылку…</p> : (
            <>
              <p>
                Новым паролем будут пользоваться все профили на
                {" "}
                <strong>{email}</strong>
                . Все текущие сеансы завершатся.
              </p>
              <form className={styles.form} onSubmit={event => void submit(event)}>
                <label>
                  Новый пароль · от 12 символов
                  <input type="password" autoComplete="new-password" minLength={12} maxLength={256} required value={replacement} onChange={event => setReplacement(event.target.value)} />
                </label>
                <label>
                  Повторите новый пароль
                  <input type="password" autoComplete="new-password" minLength={12} maxLength={256} required value={repeat} onChange={event => setRepeat(event.target.value)} />
                </label>
                <button className={styles.primary} type="submit" disabled={busy}>{busy ? "Сохраняем…" : "Сменить пароль и завершить все сеансы"}</button>
              </form>
            </>
)}
          <Link className={styles.textButton} href="/cabinet/">Перейти ко входу</Link>
        </section>
      </main>
    </div>
  );
}
