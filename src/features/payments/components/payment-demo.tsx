"use client";

import { useId, useState } from "react";
import type { FormEvent } from "react";
import { createPaymentQuote, formatRubles, parseRubles } from "@/features/payments/model/payment";
import type { PaymentKind } from "@/features/payments/model/payment";
import { MockPaymentCard } from "@/features/payments/components/mock-payment-card";
import styles from "./payment.module.css";

export function PaymentDemo() {
  const [theme, setTheme] = useState<"light" | "dark">("dark");
  const [quote, setQuote] = useState(() => createPaymentQuote("demo-wish", 1_000_000, "wish"));
  const [error, setError] = useState("");
  const amountId = useId();
  const kindId = useId();
  const errorId = useId();

  function updateQuote(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const amount = parseRubles(String(form.get("amount") ?? ""));
    const kind: PaymentKind = form.get("kind") === "project" ? "project" : "wish";
    try {
      if (amount === null) throw new RangeError();
      setQuote(createPaymentQuote(`demo-${kind}`, amount, kind));
      setError("");
    } catch {
      setError("Укажите положительную сумму в рублях, не более двух знаков после запятой.");
    }
  }

  return (
    <section className={styles.demo} data-payment-theme={theme}>
      <div className={styles.demoHeader}>
        <span className={styles.testBadge}>Тестовый режим</span>
        <button
          className={styles.themeButton}
          type="button"
          aria-label={`Включить ${theme === "dark" ? "светлую" : "тёмную"} тему`}
          onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
        >
          <span className={styles.themeDot} aria-hidden="true" />
          {theme === "dark" ? "Светлая тема" : "Тёмная тема"}
        </button>
      </div>
      <div className={styles.intro}>
        <p className={styles.eyebrow}>NODO · тестовый проект</p>
        <h1>Всё готово к оплате</h1>
        <p>Одна задача. Понятная стоимость.</p>
      </div>
      <div className={styles.preview}>
        <MockPaymentCard
          quote={quote}
          title={quote.kind === "wish" ? "Добавить страницу услуг" : "Разработка сайта"}
          description={quote.kind === "wish"
            ? "Подготовить отдельную страницу услуг: описание направлений, блок ответов на вопросы и переход к обсуждению проекта. Сохранить оформление сайта и адаптировать страницу для телефона."
            : "Разработать сайт по согласованному техническому заданию. Подготовить адаптивные страницы и опубликовать результат."}
        />
        <details className={styles.settings}>
          <summary>Параметры теста</summary>
          <form className={styles.form} onSubmit={updateQuote}>
            <label htmlFor={kindId}>Что оплачиваем</label>
            <select id={kindId} name="kind" defaultValue="wish">
              <option value="wish">Дополнительное пожелание · +30%</option>
              <option value="project">Основной проект · без наценки</option>
            </select>
            <label htmlFor={amountId}>Цена разработчика, ₽</label>
            <input
              id={amountId}
              name="amount"
              inputMode="decimal"
              autoComplete="off"
              defaultValue="10000"
              aria-describedby={error ? errorId : undefined}
              aria-invalid={Boolean(error)}
            />
            {error && <p id={errorId} className={styles.error} role="alert">{error}</p>}
            <button className={styles.secondaryButton} type="submit">Обновить сумму</button>
            <dl className={styles.breakdown}>
              <div>
                <dt>Базовая цена</dt>
                <dd>{formatRubles(quote.baseKopecks)}</dd>
              </div>
              <div>
                <dt>{quote.kind === "wish" ? "Наценка · 30%" : "Наценка"}</dt>
                <dd>{formatRubles(quote.markupKopecks)}</dd>
              </div>
            </dl>
            <p className={styles.caption}>Состояние хранится только до обновления страницы.</p>
          </form>
        </details>
      </div>
      <noscript><p className={styles.caption}>Для проверки тестовой оплаты включите JavaScript.</p></noscript>
    </section>
  );
}
