"use client";

import { useEffect, useId, useRef, useState } from "react";
import { formatRubles } from "@/features/payments/model/payment";
import styles from "./portal.module.css";

interface Props {
  total: number;
  busy: boolean;
  onPay: (outcome: "succeeded" | "failed") => Promise<boolean>;
}

/** The callback identifies the server-owned quote; a browser never submits a price. */
export function PaymentButton({ total, busy, onPay }: Props) {
  const [open, setOpen] = useState(false);
  const [failed, setFailed] = useState(false);
  const [error, setError] = useState("");
  const dialog = useRef<HTMLDialogElement>(null);
  const title = useId();
  useEffect(() => {
    if (open && !dialog.current?.open) dialog.current?.showModal();
    if (!open && dialog.current?.open) dialog.current.close();
  }, [open]);
  async function pay(outcome: "succeeded" | "failed") {
    setError("");
    const accepted = await onPay(outcome);
    if (!accepted) setError("Не удалось подтвердить оплату. Закройте окно и проверьте сообщение в кабинете.");
    if (accepted && outcome === "succeeded") setOpen(false);
    if (accepted && outcome === "failed") setFailed(true);
  }
  return (
    <>
      <button className={styles.primary} type="button" disabled={busy} onClick={() => { setFailed(false); setOpen(true); }}>Оплатить · тест</button>
      <dialog ref={dialog} className={styles.dialog} aria-labelledby={title} onCancel={event => { event.preventDefault(); if (!busy) setOpen(false); }}>
        <span className={styles.badge} data-status="pending">Тестовая оплата</span>
        <h2 id={title}>Проверка оплаты</h2>
        <p className={styles.small}>Деньги не списываются. Выберите результат для проверки сценария.</p>
        <p className={styles.dialogTotal}>{formatRubles(total)}</p>
        {failed && <p className={styles.subtitle} role="status">Тестовая ошибка. Можно повторить оплату.</p>}
        {error && <p className={styles.subtitle} role="alert">{error}</p>}
        <div className={styles.formActions}>
          <button className={styles.primary} type="button" disabled={busy} onClick={() => void pay("succeeded")}>{busy ? "Подтверждаем…" : "Подтвердить тестовую оплату"}</button>
          <button className={styles.secondary} type="button" disabled={busy} onClick={() => void pay("failed")}>Имитировать ошибку</button>
          <button className={styles.textButton} type="button" disabled={busy} onClick={() => setOpen(false)}>Отменить</button>
        </div>
      </dialog>
    </>
  );
}
