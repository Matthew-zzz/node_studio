"use client";

import { useEffect, useId, useRef, useState } from "react";
import { formatRubles } from "@/features/payments/model/payment";
import type { PaymentQuote } from "@/features/payments/model/payment";
import { simulatePayment } from "@/features/payments/lib/mock-payment";
import type { MockPaymentOutcome } from "@/features/payments/lib/mock-payment";
import styles from "./payment.module.css";

type Status = "idle" | "pending" | "succeeded" | "failed" | "canceled";

interface Props {
  readonly quote: PaymentQuote;
  readonly title: string;
  readonly description: string;
}

const statusText: Record<Status, string> = {
  idle: "Ожидает оплаты",
  pending: "Подтверждаем тестовую оплату…",
  succeeded: "Тестовая оплата подтверждена",
  failed: "Оплата не прошла. Можно попробовать ещё раз.",
  canceled: "Оплата отменена",
};

/** Each quote owns its own session; changing the quote cancels the old attempt. */
export function MockPaymentCard(props: Props) {
  return (
    <PaymentSession
      key={`${props.quote.reference}:${props.quote.kind}:${props.quote.baseKopecks}`}
      {...props}
    />
  );
}

function PaymentSession({ quote, title, description }: Props) {
  const [status, setStatus] = useState<Status>("idle");
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const request = useRef<AbortController | null>(null);
  const resetButton = useRef<HTMLButtonElement>(null);
  const checkoutTitleId = useId();
  const checkoutDescriptionId = useId();
  const paymentTitleId = useId();

  useEffect(() => () => request.current?.abort(), []);

  useEffect(() => {
    const element = dialog.current;
    if (!element) return;
    if (checkoutOpen && !element.open) element.showModal();
    if (!checkoutOpen && element.open) element.close();
  }, [checkoutOpen]);

  useEffect(() => {
    if (status === "succeeded") resetButton.current?.focus();
  }, [status]);

  function cancel() {
    request.current?.abort();
    request.current = null;
    setStatus("canceled");
    setCheckoutOpen(false);
  }

  async function confirm(outcome: MockPaymentOutcome) {
    if (request.current) return;
    const controller = new AbortController();
    request.current = controller;
    setStatus("pending");
    try {
      const result = await simulatePayment(quote, outcome, controller.signal);
      if (controller.signal.aborted) return;
      setStatus(result.status);
      setCheckoutOpen(false);
    } catch {
      if (!controller.signal.aborted) {
        setStatus("failed");
        setCheckoutOpen(false);
      }
    } finally {
      if (request.current === controller) request.current = null;
    }
  }

  return (
    <>
      <article
        className={styles.card}
        aria-labelledby={paymentTitleId}
        data-payment-status={status}
      >
        <div className={styles.cardTop}>
          <span className={styles.eyebrow}>
            {quote.kind === "wish" ? "Оценка пожелания" : "Основная разработка"}
          </span>
          <span className={styles.currency}>RUB</span>
        </div>
        <h2 id={paymentTitleId}>{title}</h2>
        <details className={styles.details}>
          <summary>Подробнее о задаче</summary>
          <p>{description}</p>
        </details>
        <div className={styles.total}>
          <span>К оплате</span>
          <strong data-testid="payment-total">{formatRubles(quote.totalKopecks)}</strong>
        </div>
        <p
          className={styles.status}
          role="status"
          aria-atomic="true"
          data-state={status}
        >
          <span className={styles.statusDot} aria-hidden="true" />
          {statusText[status]}
        </p>
        {status === "succeeded" ? (
          <button
            ref={resetButton}
            className={styles.secondaryButton}
            type="button"
            onClick={() => setStatus("idle")}
          >
            Повторить проверку
          </button>
        ) : (
          <button
            className={styles.primaryButton}
            type="button"
            disabled={status === "pending"}
            onClick={() => setCheckoutOpen(true)}
          >
            {status === "failed" ? "Попробовать ещё раз" : "Проверить оплату"}
            <span aria-hidden="true">↗</span>
          </button>
        )}
        <p className={styles.caption}>Тестовый платёж. Деньги не списываются.</p>
      </article>

      <dialog
        ref={dialog}
        className={styles.checkout}
        aria-labelledby={checkoutTitleId}
        aria-describedby={checkoutDescriptionId}
        onCancel={(event) => { event.preventDefault(); cancel(); }}
      >
        <div className={styles.checkoutContent}>
          <span className={styles.testBadge}>Тестовый режим</span>
          <h2 id={checkoutTitleId}>Тестовая оплата</h2>
          <p id={checkoutDescriptionId}>Выберите результат для проверки сценария.</p>
          <strong className={styles.checkoutTotal}>{formatRubles(quote.totalKopecks)}</strong>
          <div className={styles.checkoutActions}>
            <button
              className={styles.primaryButton}
              type="button"
              disabled={status === "pending"}
              onClick={() => void confirm("succeeded")}
            >
              {status === "pending" ? "Обрабатываем…" : "Подтвердить тестовую оплату"}
            </button>
            <button
              className={styles.secondaryButton}
              type="button"
              disabled={status === "pending"}
              onClick={() => void confirm("failed")}
            >
              Имитировать ошибку
            </button>
            <button className={styles.textButton} type="button" onClick={cancel}>
              Отменить оплату
            </button>
          </div>
          <p className={styles.caption}>Без ввода карты и реального списания.</p>
        </div>
      </dialog>
    </>
  );
}
