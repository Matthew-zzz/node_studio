"use client";

import Link from "next/link";
import { Icon } from "@/components/ui/icon";
import type { IconName } from "@/components/ui/icon";
import { STATUS_LABELS } from "@/features/portal/model/types";
import type { WorkStatus } from "@/features/portal/model/types";
import styles from "./portal.module.css";

export function WorkspaceBrand() {
  return (
    <Link className={styles.logo} href="/" aria-label="NODO Studio — на главную">
      <span className={styles.logoMark}><Icon name="service" /></span>
      NODO
      <small>workspace</small>
    </Link>
  );
}

export function ThemeButton({ theme, toggle }: { theme: string; toggle: () => void }) {
  return <button className={styles.iconButton} type="button" aria-label={theme === "light" ? "Включить тёмную тему" : "Включить светлую тему"} onClick={toggle}><span aria-hidden="true">{theme === "light" ? "☾" : "☼"}</span></button>;
}

export function Empty({ title, text, icon = "flow" }: { title: string; text: string; icon?: IconName }) {
  return (
    <div className={styles.empty}>
      <Icon name={icon} />
      <h2>{title}</h2>
      <p>{text}</p>
    </div>
  );
}

export function WorkBadge({ status }: { status: WorkStatus }) {
  return <span className={styles.badge} data-status={status}>{STATUS_LABELS[status]}</span>;
}

export function LongText({ text, label = "Подробнее" }: { text: string; label?: string }) {
  return (
    <details>
      <summary>{label}</summary>
      <p>{text || "Описание пока не добавлено."}</p>
    </details>
  );
}

export function shortDate(date: string) {
  return new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "short", timeZone: "Europe/Moscow" }).format(new Date(date));
}
