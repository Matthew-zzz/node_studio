"use client";

import Link from "next/link";
import { Icon } from "@/components/ui/icon";
import type { IconName } from "@/components/ui/icon";
import { STATUS_LABELS } from "@/features/portal/model/types";
import type { WorkStatus } from "@/features/portal/model/types";
import type { PortalTheme } from "@/features/portal/lib/use-portal-theme";
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

export function ThemeSwitch({ theme, onChange }: { theme: PortalTheme; onChange: (theme: PortalTheme) => void }) {
  return (
    <div className={styles.themeSwitch} role="group" aria-label="Оформление кабинета">
      <button type="button" aria-label="Включить светлую тему" aria-pressed={theme === "light"} onClick={() => onChange("light")}>
        <span aria-hidden="true">☼</span>
        <span>Светлая</span>
      </button>
      <button type="button" aria-label="Включить тёмную тему" aria-pressed={theme === "dark"} onClick={() => onChange("dark")}>
        <span aria-hidden="true">☾</span>
        <span>Тёмная</span>
      </button>
    </div>
  );
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
