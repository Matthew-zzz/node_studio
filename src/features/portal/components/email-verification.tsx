"use client";

import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import type { PortalController } from "@/features/portal/lib/use-portal";
import styles from "./portal.module.css";

export function EmailVerification({ controller, onComplete }: { controller: PortalController; onComplete?: () => void }) {
  const [code, setCode] = useState(""); const [epoch, setEpoch] = useState(() => Date.now());
  useEffect(() => { const timer = setInterval(() => setEpoch(Date.now()), 1000); return () => clearInterval(timer); }, []);
  const challenge = controller.challenge;
  if (!challenge) return null;
  const seconds = Math.max(0, Math.ceil((challenge.resendAt - epoch) / 1000));
  const expired = epoch >= challenge.expiresAt;
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (await controller.verifyCode(code)) { setCode(""); onComplete?.(); }
  }
  return (
    <div className={styles.stack}>
      <p>
        Код отправлен на
        {" "}
        <strong>{challenge.email}</strong>
        . Он действует 10 минут.
      </p>
      {expired ? <p>Время подтверждения истекло. Вернитесь ко входу и запросите новый код.</p> : (
        <form className={styles.form} aria-label="Подтверждение входа" onSubmit={event => void submit(event)}>
          <label>
            Код из письма
            <input type="text" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" required minLength={6} maxLength={6} value={code} onChange={event => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))} />
          </label>
          <button className={styles.primary} type="submit" disabled={controller.busy || code.length !== 6}>Подтвердить и войти</button>
          <button className={styles.secondary} type="button" disabled={controller.busy || seconds > 0} onClick={() => void controller.resendCode()}>{seconds ? `Отправить снова через ${seconds} с` : "Отправить код повторно"}</button>
        </form>
      )}
      <button className={styles.textButton} type="button" disabled={controller.busy} onClick={() => void controller.cancelCode().then(done => { if (done) onComplete?.(); })}>Вернуться ко входу</button>
    </div>
  );
}
