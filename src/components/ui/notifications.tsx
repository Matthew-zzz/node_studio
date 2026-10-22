"use client";

import { useEffect, useId, useRef } from "react";
import type { CSSProperties } from "react";
import { usePathname } from "next/navigation";
import { Toaster } from "sonner";
import { DEFAULT_NOTIFICATION_SCOPE, notify } from "@/lib/notifications";
import { useTheme } from "@/lib/use-theme";
import styles from "./notifications.module.css";

export function Notifications({ modal = false }: { modal?: boolean }) {
  const id = useId();
  const scope = modal ? id : DEFAULT_NOTIFICATION_SCOPE;
  const host = useRef<HTMLDivElement>(null);
  const path = usePathname();
  const { theme } = useTheme();
  const miniapp = path === "/miniapp" || path.startsWith("/miniapp/");
  const workspace = miniapp || path === "/cabinet" || path === "/cabinet/" || path === "/checkout" || path === "/checkout/" || path.startsWith("/recover");
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
        theme={workspace ? theme : "dark"}
        position="top-center"
        offset={miniapp ? "calc(16px + var(--tg-safe-area-inset-top, 0px) + var(--tg-content-safe-area-inset-top, 0px))" : "max(20px, env(safe-area-inset-top))"}
        mobileOffset={{ top: miniapp ? "calc(72px + var(--tg-safe-area-inset-top, 0px) + var(--tg-content-safe-area-inset-top, 0px))" : "calc(72px + env(safe-area-inset-top))", left: 16, right: 16 }}
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
