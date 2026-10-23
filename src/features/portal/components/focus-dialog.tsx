"use client";

import { useEffect, useId, useRef, useState } from "react";
import type { ReactNode, RefObject } from "react";
import { Icon } from "@/components/ui/icon";
import type { IconName } from "@/components/ui/icon";
import { Notifications } from "@/components/ui/notifications";
import styles from "./focus-dialog.module.css";

interface FocusDialogProps {
  open: boolean;
  title: string;
  children: ReactNode;
  onClose: () => void;
  busy?: boolean;
  returnFocus?: RefObject<HTMLButtonElement | null>;
  compact?: boolean;
}

/** Native focus trapping and Telegram Back share the same dialog lifecycle. */
export function FocusDialog({ open, title, children, onClose, busy = false, returnFocus, compact = false }: FocusDialogProps) {
  const dialog = useRef<HTMLDialogElement>(null);
  const heading = useId();
  useEffect(() => {
    const element = dialog.current;
    if (!element) return;
    if (open && !element.open) {
      document.querySelectorAll<HTMLDialogElement>("dialog[data-focus-dialog][open]").forEach(other => { if (other !== element) other.close(); });
      element.showModal();
    } else if (!open && element.open) element.close();
  }, [open]);
  return (
    <dialog
      ref={dialog}
      className={styles.dialog}
      data-focus-dialog="true"
      data-compact={compact}
      aria-labelledby={heading}
      onClose={() => { onClose(); returnFocus?.current?.focus({ preventScroll: true }); }}
      onCancel={event => { if (busy) event.preventDefault(); }}
      onClick={event => {
        if (busy || event.target !== event.currentTarget) return;
        const bounds = event.currentTarget.getBoundingClientRect();
        if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) event.currentTarget.close();
      }}
    >
      {open && (
        <>
          <Notifications modal />
          <header className={styles.header}>
            <h2 id={heading}>{title}</h2>
            <button type="button" className={styles.close} aria-label={`Закрыть: ${title}`} disabled={busy} onClick={() => dialog.current?.close()}><Icon name="close" /></button>
          </header>
          <div className={styles.body}>{children}</div>
        </>
      )}
    </dialog>
  );
}

interface DetailDialogProps {
  label: string;
  title?: string;
  children: ReactNode;
  className?: string | undefined;
  buttonClassName?: string;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  busy?: boolean;
  renderTrigger?: (show: () => void) => ReactNode;
}

export function DetailDialog({ label, title = label, children, className, buttonClassName, open, onOpenChange, busy = false, renderTrigger }: DetailDialogProps) {
  const [localOpen, setLocalOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const visible = open ?? localOpen;
  const change = (next: boolean) => { setLocalOpen(next); onOpenChange?.(next); };
  return (
    <div className={className}>
      {renderTrigger ? renderTrigger(() => change(true)) : <button ref={trigger} type="button" className={buttonClassName ?? styles.detail} aria-haspopup="dialog" aria-expanded={visible} onClick={() => change(true)}>{label}</button>}
      <FocusDialog open={visible} title={title} busy={busy} returnFocus={trigger} onClose={() => change(false)}>{children}</FocusDialog>
    </div>
  );
}

export interface MenuAction { label: string; icon?: IconName; disabled?: boolean; onSelect: () => void }

export function ActionsMenu({ label = "Действия", triggerLabel = "Действия", actions, buttonRef, disabled = false }: { label?: string; triggerLabel?: string; actions: readonly MenuAction[]; buttonRef?: RefObject<HTMLButtonElement | null>; disabled?: boolean }) {
  const [open, setOpen] = useState(false);
  const pending = useRef<(() => void) | null>(null);
  const localTrigger = useRef<HTMLButtonElement>(null);
  const trigger = buttonRef ?? localTrigger;
  return (
    <>
      <button ref={trigger} type="button" className={styles.menuTrigger} aria-label={label} aria-haspopup="dialog" aria-expanded={open} disabled={disabled} onClick={() => setOpen(true)}>
        <Icon name="more" />
        <span>{triggerLabel}</span>
      </button>
      <FocusDialog open={open} title={label} returnFocus={trigger} compact onClose={() => { setOpen(false); const action = pending.current; pending.current = null; action?.(); }}>
        <div className={styles.menu}>
          {actions.map(action => (
            <button key={action.label} type="button" disabled={action.disabled} onClick={() => { pending.current = action.onSelect; setOpen(false); }}>
              <Icon name={action.icon ?? "diagonal"} />
              <span>{action.label}</span>
            </button>
))}
        </div>
      </FocusDialog>
    </>
  );
}

export function ActionsDialog({ label, triggerLabel, actions }: { label: string; triggerLabel?: string; actions: readonly { label: string; icon?: IconName; content: ReactNode | ((close: () => void) => ReactNode) }[] }) {
  const [selected, setSelected] = useState<string | null>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const action = actions.find(action => action.label === selected);
  return (
    <>
      <ActionsMenu label={label} {...(triggerLabel ? { triggerLabel } : {})} buttonRef={trigger} actions={actions.map(action => ({ label: action.label, ...(action.icon ? { icon: action.icon } : {}), onSelect: () => setSelected(action.label) }))} />
      <FocusDialog open={Boolean(action)} title={action?.label ?? label} returnFocus={trigger} onClose={() => setSelected(null)}>{typeof action?.content === "function" ? action.content(() => setSelected(null)) : action?.content}</FocusDialog>
    </>
  );
}
