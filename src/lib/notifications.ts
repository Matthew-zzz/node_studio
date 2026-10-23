"use client";

import { toast } from "sonner";
import type { ExternalToast } from "sonner";

export const DEFAULT_NOTIFICATION_SCOPE = "studio";
type Options = Pick<ExternalToast, "action" | "description">;

function activeScope() {
  if (typeof document === "undefined") return DEFAULT_NOTIFICATION_SCOPE;
  const dialogs = document.querySelectorAll<HTMLDialogElement>("dialog[open]");
  return dialogs.item(dialogs.length - 1)?.querySelector<HTMLElement>("[data-notification-scope]")?.dataset.notificationScope ?? DEFAULT_NOTIFICATION_SCOPE;
}

function existingToast(scope: string, type: "error" | "success" | "info", message: string): Pick<ExternalToast, "id"> {
  const id = toast.getToasts().find(item => "type" in item && item.type === type && item.title === message && item.toasterId === scope)?.id;
  return id === undefined ? {} : { id };
}

function release({ id }: { id: string | number }) {
  // Sonner keeps the exit animation mounted briefly; a new message gets a fresh id.
  if (toast.getToasts().some(item => item.id === id)) toast.dismiss(id);
}

/** One notification API; modal errors stay in the native dialog's accessible top layer. */
export const notify = {
  error(message: string, options: Options = {}) {
    const scope = activeScope();
    return toast.error(message, { duration: 8000, onDismiss: release, onAutoClose: release, ...existingToast(scope, "error", message), ...options, toasterId: scope });
  },
  success(message: string, { scope, ...options }: Options & { scope?: "active" } = {}) {
    const target = scope === "active" ? activeScope() : DEFAULT_NOTIFICATION_SCOPE;
    return toast.success(message, { duration: 4000, onDismiss: release, onAutoClose: release, ...existingToast(target, "success", message), ...options, toasterId: target });
  },
  info(message: string, options: Options = {}) {
    return toast.info(message, { duration: 5000, onDismiss: release, onAutoClose: release, ...existingToast(DEFAULT_NOTIFICATION_SCOPE, "info", message), ...options, toasterId: DEFAULT_NOTIFICATION_SCOPE });
  },
  dismiss: toast.dismiss,
  clear() { toast.dismiss(); },
  clearScope(scope: string) {
    for (const item of toast.getToasts()) if ("toasterId" in item && item.toasterId === scope) toast.dismiss(item.id);
  },
};
