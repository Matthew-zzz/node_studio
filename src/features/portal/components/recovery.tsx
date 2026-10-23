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

export function Recovery({ presentation = "web" }: { presentation?: "web" | "miniapp" }) {
  const gateway = useMemo(() => createApiGateway(presentation), [presentation]);
  const { theme, setTheme } = usePortalTheme();
  const [token, setToken] = useState(""); const [email, setEmail] = useState(""); const [error, setError] = useState("");
  const [busy, setBusy] = useState(false); const [done, setDone] = useState(false);
  useEffect(() => {
    gateway.activate(); let active = true;
    const input = location.hash.slice(1);
    void gateway.auth.recovery(input).then(details => { if (active) { setToken(input); setEmail(details.email); } }).catch(error => { if (active) setError(error instanceof Error ? error.message : "Ссылка недействительна."); });
    return () => { active = false; gateway.dispose(); };
  }, [gateway]);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true);
    try {
      await gateway.auth.revoke(token); setDone(true); setToken(""); history.replaceState(null, "", location.pathname);
      if (typeof BroadcastChannel !== "undefined") { const channel = new BroadcastChannel(gateway.profileChannel); channel.postMessage("changed"); channel.close(); }
    } catch (error) { notify.error(error instanceof Error ? error.message : "Не удалось завершить сеансы."); }
    finally { setBusy(false); }
  }
  return (
    <div className={styles.root} data-theme={theme} data-presentation={presentation}>
      <Notifications />
      <main id="main" className={styles.authPage}>
        <div className={styles.authTop}>
          <WorkspaceBrand />
          <ThemeSwitch theme={theme} onChange={setTheme} />
        </div>
        <section className={`${styles.panel} ${styles.authCard}`}>
          <h1>{done ? "Все сеансы завершены" : "Защита аккаунта"}</h1>
          {done ? <p>Для входа запросите новый код из письма. Если вход выполнили не вы, проверьте безопасность вашей почты.</p> : error ? <p>{error}</p> : !token ? <p role="status">Проверяем ссылку…</p> : (
            <>
              <p>{`Завершить все сеансы профилей на ${email}? Для повторного входа потребуется новый код.`}</p>
              <form className={styles.form} onSubmit={event => void submit(event)}>
                <button className={styles.primary} type="submit" disabled={busy}>{busy ? "Завершаем…" : "Завершить все сеансы"}</button>
              </form>
            </>
          )}
          <Link className={styles.textButton} href={presentation === "miniapp" ? "/miniapp/" : "/cabinet/"}>Перейти ко входу</Link>
        </section>
      </main>
    </div>
  );
}
