"use client";

import Link from "next/link";
import { Icon } from "@/components/ui/icon";
import type { IconName } from "@/components/ui/icon";
import type { Role } from "@/features/portal/model/types";
import styles from "./portal.module.css";

const workspaces: { role: Role; label: string; description: string; icon: IconName }[] = [
  { role: "client", label: "Клиент", description: "Проект и пожелания", icon: "people" },
  { role: "developer", label: "Разработчик", description: "Задачи и разработка", icon: "code" },
  { role: "curator", label: "Куратор", description: "Диалоги и запуск", icon: "telegram" },
];

interface WorkspaceSwitcherProps {
  role: Role;
  busy: boolean;
  onChange: (role: Role) => void;
  onReset: () => void;
}

/** Scenario roles are intentionally available only inside the isolated demo. */
export function WorkspaceSwitcher({ role, busy, onChange, onReset }: WorkspaceSwitcherProps) {
  return (
    <section className={styles.demoBar} aria-label="Демонстрация кабинетов">
      <div className={styles.demoIntro}>
        <strong>
          <span className={styles.demoDot} />
          Тестовое пространство
        </strong>
        <span>Общий сценарий · данные в вашем браузере</span>
      </div>
      <div className={styles.workspaceSwitch} role="group" aria-label="Быстрое переключение кабинетов">
        {workspaces.map(workspace => (
          <button key={workspace.role} type="button" aria-label={workspace.label} aria-pressed={role === workspace.role} disabled={busy} onClick={() => { if (role !== workspace.role) onChange(workspace.role); }}>
            <Icon name={workspace.icon} />
            <span>
              <strong>{workspace.label}</strong>
              <small>{workspace.description}</small>
            </span>
          </button>
        ))}
      </div>
      <div className={styles.demoControls}>
        <details className={styles.demoMenu}>
          <summary>Ещё</summary>
          <div>
            <button type="button" className={styles.textButton} disabled={busy} onClick={event => { onChange("admin"); event.currentTarget.closest("details")?.removeAttribute("open"); }}>Администратор</button>
            <button type="button" className={styles.textButton} disabled={busy} onClick={event => { onReset(); event.currentTarget.closest("details")?.removeAttribute("open"); }}>Сбросить демо</button>
          </div>
        </details>
        <Link href="/cabinet/">Рабочий вход ↗</Link>
      </div>
    </section>
  );
}
