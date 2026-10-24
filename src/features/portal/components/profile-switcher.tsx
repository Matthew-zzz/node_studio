"use client";

import { useEffect, useId, useRef, useState } from "react";
import type { FormEvent } from "react";
import { Icon } from "@/components/ui/icon";
import { Notifications } from "@/components/ui/notifications";
import type { IconName } from "@/components/ui/icon";
import type { PortalController } from "@/features/portal/lib/use-portal";
import { ROLE_LABELS } from "@/features/portal/model/types";
import type { Role } from "@/features/portal/model/types";
import portal from "./portal.module.css";
import styles from "./profile-switcher.module.css";
import { EmailVerification } from "@/features/portal/components/email-verification";
import { allowedProfileRoles } from "@/features/portal/model/profile-policy";

const profileRoles: Role[] = ["client", "developer", "admin"];
const roleIcons: Record<Role, IconName> = { client: "people", developer: "code", admin: "service" };

export function ProfileSwitcher({ controller, onChange, inline = false }: { controller: PortalController; onChange: () => void; inline?: boolean }) {
  const { viewer, profiles } = controller.snapshot;
  const [open, setOpen] = useState(false);
  const [role, setRole] = useState<Role | null>(null);
  const [email, setEmail] = useState("");
  const dialog = useRef<HTMLDialogElement>(null);
  const popover = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const popoverId = useId();

  const visible = open;
  useEffect(() => {
    if (visible && !dialog.current?.open) dialog.current?.showModal();
    if (!visible && dialog.current?.open) dialog.current.close();
  }, [visible]);

  if (!viewer) return null;
  const allowed = allowedProfileRoles(viewer.role);

  function addProfile(nextRole: Role | null = null) {
    popover.current?.hidePopover();
    setRole(nextRole ?? viewer?.role ?? "client"); setEmail(viewer?.email ?? ""); setOpen(true);
  }

  async function switchProfile(userId: string) {
    popover.current?.hidePopover();
    if (userId !== viewer?.id && await controller.switchProfile(userId)) onChange();
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const complete = await controller.addProfile(email, role ?? undefined);
    if (complete) { setOpen(false); onChange(); }
  }

  const list = (
    <div className={styles.list} role="group" aria-label="Переключение профилей">
      {!inline && <p className={styles.caption}>Профили</p>}
      {controller.challenge && <button type="button" className={styles.add} onClick={() => { setRole(controller.challenge!.role); setOpen(true); }}>Продолжить подтверждение профиля</button>}
      {profileRoles.map(itemRole => {
        const accounts = profiles.filter(profile => profile.role === itemRole);
        return accounts.length ? accounts.map(profile => (
          <button type="button" key={profile.id} className={styles.profile} data-role={itemRole} aria-label={`Переключиться: ${ROLE_LABELS[itemRole]}, ${profile.name}`} aria-pressed={profile.id === viewer.id} disabled={controller.busy} onClick={() => void switchProfile(profile.id)}>
            <span className={styles.avatar}><Icon name={roleIcons[itemRole]} /></span>
            <span className={styles.identity}>
              <strong>{ROLE_LABELS[itemRole]}</strong>
              <small title={profile.email}>{profile.name}</small>
            </span>
            {profile.id === viewer.id && <Icon name="check" className={styles.check} />}
          </button>
        )) : allowed.includes(itemRole) ? (
          <button type="button" key={itemRole} className={styles.profile} data-role={itemRole} aria-label={`Добавить профиль: ${ROLE_LABELS[itemRole]}`} disabled={controller.busy || profiles.length >= 8} onClick={() => addProfile(itemRole)}>
            <span className={styles.avatar}><Icon name={roleIcons[itemRole]} /></span>
            <span className={styles.identity}>
              <strong>{ROLE_LABELS[itemRole]}</strong>
              <small>Войти по коду</small>
            </span>
            <Icon name="plus" className={styles.plus} />
          </button>
        ) : null;
      })}
      <button type="button" className={styles.add} disabled={controller.busy || profiles.length >= 8} onClick={() => addProfile()}>
        <Icon name="plus" />
        Добавить аккаунт
      </button>
    </div>
  );

  return (
    <div className={styles.root}>
      <div className={inline ? styles.inline : styles.desktop}>{list}</div>
      {!inline && (
      <>
        <button type="button" className={styles.mobileTrigger} popoverTarget={popoverId} aria-label="Открыть профили" disabled={controller.busy}>
          <Icon name={roleIcons[viewer.role]} />
          <span>{ROLE_LABELS[viewer.role]}</span>
          <Icon name="people" />
        </button>
        <div ref={popover} popover="auto" id={popoverId} className={styles.mobilePopover}>{list}</div>
      </>
)}
      <dialog ref={dialog} className={portal.dialog} aria-labelledby={titleId} onCancel={event => { event.preventDefault(); if (!controller.busy) { if (controller.challenge) void controller.cancelCode(); setOpen(false); } }}>
        <Notifications modal />
        <span className={portal.kicker}>{role ? ROLE_LABELS[role] : "Рабочее пространство"}</span>
        <h2 id={titleId}>{controller.challenge ? "Подтвердите вход" : "Добавить профиль"}</h2>
        {open && controller.challenge ? <EmailVerification controller={controller} onComplete={() => { setOpen(false); dialog.current?.close(); onChange(); }} /> : (
          <>
            <p className={portal.subtitle}>Вход в существующий аккаунт. Новый доступ выдаёт администратор.</p>
            <form className={portal.form} onSubmit={event => void submit(event)}>
              <label>
                Роль профиля
                <select value={role ?? viewer.role} onChange={event => setRole(event.target.value as Role)}>{allowed.map(value => <option key={value} value={value}>{ROLE_LABELS[value]}</option>)}</select>
              </label>
              <label>
                Почта профиля
                <input type="email" autoComplete="email" required maxLength={254} value={email} onChange={event => setEmail(event.target.value)} />
              </label>
              <button type="submit" className={portal.primary} disabled={controller.busy}>{controller.busy ? "Входим…" : "Получить код и добавить"}</button>
              <button type="button" className={portal.textButton} disabled={controller.busy} onClick={() => { setOpen(false); }}>Отменить</button>
            </form>
          </>
)}
      </dialog>
    </div>
  );
}
