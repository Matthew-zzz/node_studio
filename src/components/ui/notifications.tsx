"use client";

import { useEffect, useId, useRef } from "react";
import type { CSSProperties } from "react";
import { Toaster } from "sonner";
import { DEFAULT_NOTIFICATION_SCOPE, notify } from "@/lib/notifications";
import styles from "./notifications.module.css";

export function Notifications({ modal = false }: { modal?: boolean }) {
  const id = useId();
  const scope = modal ? id : DEFAULT_NOTIFICATION_SCOPE;
  const host = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!modal) return;
    const dialog = host.current?.closest("dialog");
    const clear = () => notify.clearScope(scope);
    dialog?.addEventListener("close", clear);
    return () => { dialog?.removeEventListener("close", clear); clear(); };
  }, [modal, scope]);
  return (
    <div ref={host} className={styles.host} data-notification-scope={scope}>
      <Toaster
        id={scope}
        theme="system"
        position="top-center"
        offset="max(20px, env(safe-area-inset-top))"
        mobileOffset={{ top: "calc(72px + env(safe-area-inset-top))", left: 16, right: 16 }}
        visibleToasts={3}
        closeButton
        gap={10}
        containerAriaLabel="Уведомления"
        className={styles.viewport!}
        style={{ "--width": "min(400px, calc(100vw - 32px))" } as CSSProperties}
        toastOptions={{ closeButtonAriaLabel: "Закрыть уведомление", classNames: { toast: styles.notification!, title: styles.title!, description: styles.description!, closeButton: styles.close!, actionButton: styles.action! } }}
      />
    </div>
  );
}
