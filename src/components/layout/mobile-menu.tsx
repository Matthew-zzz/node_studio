"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Brand } from "@/components/ui/brand";
import { Icon } from "@/components/ui/icon";
import { ExternalLink } from "@/components/ui/external-link";
import { navigation } from "@/config/navigation";
import { site } from "@/config/site";

export function MobileMenu() {
  const dialog = useRef<HTMLDialogElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const touchStart = useRef<{ x: number; y: number } | null>(null);
  const [open, setOpen] = useState(false);

  function close(restoreFocus = true) {
    dialog.current?.close();
    setOpen(false);
    if (restoreFocus) trigger.current?.focus();
  }

  useEffect(() => {
    if (!open) return;
    const desktop = window.matchMedia("(min-width: 901px)");
    function onResize() { if (desktop.matches) dialog.current?.close(); }
    document.body.classList.add("menu-open");
    desktop.addEventListener("change", onResize);
    return () => {
      document.body.classList.remove("menu-open");
      desktop.removeEventListener("change", onResize);
    };
  }, [open]);

  return (
    <>
      <button
        ref={trigger}
        type="button"
        className="menu-toggle"
        aria-label={open ? "Закрыть меню" : "Открыть меню"}
        aria-expanded={open}
        aria-controls="mobile-nav"
        aria-haspopup="dialog"
        onClick={() => {
          dialog.current?.showModal();
          closeButton.current?.focus();
          setOpen(true);
        }}
      >
        <span className="menu-toggle-line" />
        <span className="menu-toggle-line" />
      </button>
      <dialog
        ref={dialog}
        id="mobile-nav"
        className="mobile-drawer"
        aria-labelledby="drawer-title"
        onClose={() => setOpen(false)}
        onCancel={() => close()}
        onClick={(event) => {
          if (event.target !== event.currentTarget) return;
          const bounds = event.currentTarget.getBoundingClientRect();
          if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) close();
        }}
      >
        <div
          className="drawer-heading"
          onTouchStart={(event) => {
            const touch = event.touches[0];
            if (event.touches.length === 1 && touch) touchStart.current = { x: touch.clientX, y: touch.clientY };
          }}
          onTouchEnd={(event) => {
            const start = touchStart.current;
            const end = event.changedTouches[0];
            if (start && end && end.clientX - start.x > 70 && Math.abs(end.clientY - start.y) < 45) close();
            touchStart.current = null;
          }}
        >
          <Brand onNavigate={() => close(false)} />
          <button
            ref={closeButton}
            type="button"
            className="drawer-close"
            aria-label="Закрыть меню"
            onClick={() => close()}
          >
            <Icon name="close" />
          </button>
        </div>
        <h2 id="drawer-title" className="sr-only">Навигация по сайту</h2>
        <nav className="drawer-nav" aria-label="Мобильная навигация">
          {[{ href: "/", label: "Главная", icon: "code" } as const, ...navigation].map((item) => (
            <Link key={item.href} href={item.href} onClick={() => close(false)}>
              <Icon name={item.icon} />
              <span>{item.label}</span>
              <Icon name="arrow" />
            </Link>
          ))}
        </nav>
        <div className="drawer-contact">
          <p>
            <span className="status-dot" />
            {site.hours}
          </p>
          <ExternalLink className="button button-primary" href={site.contact} onClick={() => close(false)}>
            Обсудить задачу
            <Icon name="diagonal" />
          </ExternalLink>
          <span>Общаемся в Telegram.</span>
        </div>
      </dialog>
    </>
  );
}
