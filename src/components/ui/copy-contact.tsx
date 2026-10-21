"use client";

import { Icon } from "@/components/ui/icon";
import { notify } from "@/lib/notifications";

export function CopyContact({ value }: { value: string }) {
  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      notify.success("Telegram-аккаунт скопирован");
    } catch {
      notify.error(`Не удалось скопировать. Напишите нам: ${value}`);
    }
  }

  return (
    <button
      type="button"
      className="copy-contact"
      onClick={copy}
      aria-label="Скопировать Telegram-аккаунт"
    >
      <Icon name="copy" />
      <span>Скопировать</span>
    </button>
  );
}
