"use client";

import { useState } from "react";
import type { FormEvent, ReactNode } from "react";
import type { PortalController } from "@/features/portal/lib/use-portal";
import type { PortalProject, PortalQuote, ProjectOrder } from "@/features/portal/model/types";
import { formatRubles } from "@/features/payments/model/payment";
import styles from "./portal.module.css";

function DeleteConfirmation({ name, children, confirmation, busy, onDelete, onClose }: {
  name: string;
  children: ReactNode;
  confirmation?: string;
  busy: boolean;
  onDelete: (confirmation: string) => Promise<boolean>;
  onClose: () => void;
}) {
  const [value, setValue] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if ((!confirmation || value === confirmation) && await onDelete(value)) onClose();
  }
  return (
    <form className={styles.form} onSubmit={event => void submit(event)}>
      <strong>{name}</strong>
      {children}
      {confirmation && (
        <label>
          Введите название проекта для подтверждения
          <input autoComplete="off" spellCheck={false} required maxLength={200} disabled={busy} value={value} onChange={event => setValue(event.target.value)} />
        </label>
      )}
      <div className={styles.formActions}>
        <button type="button" className={styles.secondary} disabled={busy} onClick={onClose}>Отмена</button>
        <button type="submit" className={`${styles.secondary} ${styles.danger}`} disabled={busy || Boolean(confirmation && value !== confirmation)}>{busy ? "Удаляем…" : "Подтвердить удаление"}</button>
      </div>
    </form>
  );
}

export function DeleteProject({ project, controller, onClose }: { project: PortalProject; controller: PortalController; onClose: () => void }) {
  return (
    <DeleteConfirmation name={project.name} confirmation={project.name} busy={controller.busy} onClose={onClose} onDelete={confirmation => controller.run({ type: "project.delete", projectId: project.id, confirmation })}>
      <p>Проект исчезнет из кабинетов разработчика и клиента. Связанные ссылки на оплату перестанут работать. Репозитории GitHub и история сохранятся.</p>
    </DeleteConfirmation>
  );
}

type DeletePaymentProps = { controller: PortalController; onClose: () => void } & ({ kind: "order"; payment: ProjectOrder } | { kind: "quote"; payment: PortalQuote });

export function DeletePayment(props: DeletePaymentProps) {
  const { payment, controller, onClose } = props;
  const paid = payment.status !== "pending" && payment.status !== "superseded";
  return (
    <DeleteConfirmation name={`${props.kind === "order" ? props.payment.projectName : props.payment.title} · ${formatRubles(payment.totalKopecks)}`} busy={controller.busy} onClose={onClose} onDelete={() => controller.run(props.kind === "order" ? { type: "order.delete", orderId: payment.id } : { type: "quote.delete", quoteId: payment.id })}>
      <p>Запись исчезнет из кабинетов. Оплатить её и отправить новые уведомления по ней будет нельзя.</p>
      {paid && <p>Факт оплаты сохранится. Это действие не возвращает деньги и не отменяет уже выданный доступ.</p>}
      {props.kind === "order" && !payment.projectId && <p>Проект и доступ по этой оплате создаваться не будут.</p>}
    </DeleteConfirmation>
  );
}
