"use client";

import { useEffect, useRef, useState } from "react";
import { Icon } from "@/components/ui/icon";

export function CopyContact({ value }: { value: string }) {
  const [message, setMessage] = useState("");
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);

  async function copy() {
    clearTimeout(timer.current);
    try {
      await navigator.clipboard.writeText(value);
      setMessage("Telegram-аккаунт скопирован");
    } catch {
      setMessage(`Не удалось скопировать. Напишите нам: ${value}`);
    }
    timer.current = setTimeout(() => setMessage(""), 3200);
  }

  return (
    <>
      <button
        type="button"
        className="copy-contact"
        onClick={copy}
        aria-label="Скопировать Telegram-аккаунт"
      >
        <Icon name="copy" />
        <span>Скопировать</span>
      </button>
      <span className={`toast${message ? " visible" : ""}`} role="status" aria-live="polite">{message}</span>
    </>
  );
}
