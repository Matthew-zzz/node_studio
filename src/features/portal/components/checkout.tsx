"use client";

import { useEffect, useMemo, useState } from "react";
import { PaymentButton } from "@/features/portal/components/payment-button";
import { ThemeSwitch, WorkspaceBrand } from "@/features/portal/components/ui";
import { createApiGateway } from "@/features/portal/lib/gateway";
import { usePortalTheme } from "@/features/portal/lib/use-portal-theme";
import { formatRubles } from "@/features/payments/model/payment";
import type { Checkout } from "@/features/portal/model/types";
import { notify } from "@/lib/notifications";
import styles from "./portal.module.css";

export function CheckoutPage() {
  const gateway = useMemo(() => createApiGateway(), []);
  const { theme, setTheme } = usePortalTheme();
  const [checkout, setCheckout] = useState<Checkout | null>(null); const [error, setError] = useState(""); const [busy, setBusy] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    async function load() {
      try { const result = await gateway.checkout(decodeURIComponent(window.location.hash.slice(1))); if (active) setCheckout(result); }
      catch (error) {
        if (active) {
          const message = error instanceof Error ? error.message : "Не удалось открыть оплату.";
          setError(message); notify.error(message);
        }
      }
    }
    void load();
    return () => { active = false; };
  }, [gateway, attempt]);
  async function pay(outcome: "succeeded" | "failed") {
    if (busy) return false;
    setBusy(true); setError("");
    try { setCheckout(await gateway.payOrder(decodeURIComponent(window.location.hash.slice(1)), outcome)); return true; }
    catch (error) { notify.error(error instanceof Error ? error.message : "Не удалось подтвердить оплату."); return false; }
    finally { setBusy(false); }
  }
  return (
    <div className={styles.root} data-theme={theme}>
      <main id="main" className={styles.authPage}>
        <div className={styles.authTop}>
          <WorkspaceBrand />
          <ThemeSwitch theme={theme} onChange={setTheme} />
        </div>
        <section className={`${styles.panel} ${styles.authCard}`}>
          <span className={styles.kicker}>Основная разработка</span>
          <h1>{checkout?.projectName ?? "Оплата проекта"}</h1>
          <p>Тестовая оплата без списания денег.</p>
          {error && (
          <div>
            <p className={styles.subtitle}>Не удалось загрузить данные оплаты. Проверьте ссылку или повторите попытку.</p>
            <button type="button" className={styles.secondary} onClick={() => { setError(""); setAttempt(value => value + 1); }}>Повторить загрузку</button>
          </div>
)}
          {checkout && (
          <>
            <p className={styles.dialogTotal}>{formatRubles(checkout.totalKopecks)}</p>
            <p className={styles.subtitle}>Согласованная стоимость проекта</p>
            {checkout.status !== "pending" ? <p className={styles.subtitle} role="status">Тестовая оплата подтверждена. Студия подготовит доступ к проекту.</p> : checkout.provider === "mock" ? <div style={{ marginTop: 25 }}><PaymentButton total={checkout.totalKopecks} busy={busy} onPay={pay} /></div> : <p className={styles.subtitle} role="status">Оплата временно недоступна. Напишите в поддержку студии.</p>}
          </>
)}
          {!checkout && !error && <p className={styles.small} role="status">Загружаем оплату…</p>}
        </section>
        <div className={styles.authFooter}><a href="https://t.me/node_studio_bot" target="_blank" rel="noopener noreferrer">Связаться с поддержкой ↗</a></div>
      </main>
    </div>
  );
}
