"use client";

import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import type { PortalController } from "@/features/portal/lib/use-portal";
import type { PaymentChannel, PaymentDeliveryState, PaymentSource } from "@/features/portal/model/payment-delivery";
import styles from "./portal.module.css";

const labels: Record<PaymentDeliveryState, string> = { queued: "В очереди", sending: "Отправляем…", sent: "Отправлено", retrying: "Повторим автоматически", failed: "Не удалось отправить", cancelled: "Отправка отменена" };

export function ResendPayment({ source, sourceId, controller }: { source: PaymentSource; sourceId: string; controller: PortalController }) {
  const [channel, setChannel] = useState<PaymentChannel | "both">("both");
  const [queued, setQueued] = useState(false);
  const [epoch, setEpoch] = useState(() => Date.now());
  useEffect(() => { const timer = setInterval(() => setEpoch(Date.now()), 1000); return () => clearInterval(timer); }, []);
  const requestId = useRef<string | null>(null);
  const delivery = controller.snapshot.paymentDeliveries.find(item => item.source === source && item.sourceId === sourceId);
  const selected = channel === "both" ? ["mail", "telegram"] as const : [channel];
  const wait = Math.max(0, ...selected.map(key => Math.ceil((Date.parse(delivery?.[key]?.retryAfter ?? "") - epoch) / 1000) || 0));
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    requestId.current ??= crypto.randomUUID();
    if (await controller.run({ type: "payment.resend", source, sourceId, channel, requestId: requestId.current })) setQueued(true);
  }
  return (
    <form className={styles.form} onSubmit={event => void submit(event)}>
      <p>Клиент получит актуальную ссылку с прежней суммой. Новый счёт не создаётся.</p>
      <label>
        Куда отправить
        <select value={channel} disabled={controller.busy || queued} onChange={event => { setChannel(event.target.value as PaymentChannel | "both"); requestId.current = null; }}>
          <option value="both">На почту и в Telegram</option>
          <option value="telegram">В Telegram</option>
          <option value="mail">На почту</option>
        </select>
      </label>
      <div className={styles.stack} role="status" aria-label="Статус отправки ссылки">
        {(["mail", "telegram"] as const).map(key => {
          const status = delivery?.[key];
          return (
            <div key={key}>
              <strong>{`${key === "mail" ? "Почта" : "Telegram"}: ${status ? labels[status.state] : "Ещё не отправляли"}`}</strong>
              {status?.state === "sent" && <p className={styles.small}>{new Date(status.at).toLocaleString("ru-RU")}</p>}
              {status?.hint && status.state !== "sent" && <p className={styles.small}>{status.hint}</p>}
            </div>
          );
        })}
      </div>
      {queued ? <p className={styles.small}>Запрос принят. Статусы обновляются автоматически; окно можно закрыть.</p> : <button className={styles.primary} type="submit" disabled={controller.busy || wait > 0}>{controller.busy ? "Отправляем…" : wait > 0 ? `Повторить через ${wait} с` : "Отправить ссылку повторно"}</button>}
    </form>
  );
}
