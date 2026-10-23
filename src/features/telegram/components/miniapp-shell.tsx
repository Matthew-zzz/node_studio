"use client";

import { useCallback, useRef, useState } from "react";
import type { ReactNode } from "react";
import { Icon } from "@/components/ui/icon";
import { Notifications } from "@/components/ui/notifications";
import { Empty, ThemeSwitch } from "@/features/portal/components/ui";
import { ProfileSwitcher } from "@/features/portal/components/profile-switcher";
import { ChatActions } from "@/features/portal/components/chat-actions";
import type { PortalController } from "@/features/portal/lib/use-portal";
import type { PortalTheme } from "@/features/portal/lib/use-portal-theme";
import { PORTAL_VIEWS, ROLE_VIEWS } from "@/features/portal/model/navigation";
import type { PortalView } from "@/features/portal/model/navigation";
import { isProjectView, PROJECT_VIEWS } from "@/features/portal/model/project-views";
import type { Conversation, PortalProject, Role } from "@/features/portal/model/types";
import { ROLE_LABELS } from "@/features/portal/model/types";
import { useTelegramBack } from "@/features/telegram/lib/use-telegram";
import portal from "@/features/portal/components/portal.module.css";
import styles from "./telegram.module.css";

interface MiniAppShellProps {
  controller: PortalController;
  theme: PortalTheme;
  setTheme: (theme: PortalTheme) => void;
  activeView: PortalView;
  project: PortalProject | undefined;
  onNavigate: (view: PortalView) => void;
  onOpenProject: (id: string) => Promise<boolean>;
  onProfileChange: () => void;
  telegramThread: Conversation | undefined;
  onCloseTelegramThread: () => void;
  children: ReactNode;
}
const tabs: Record<Role, readonly PortalView[]> = { client: PROJECT_VIEWS, developer: PROJECT_VIEWS, curator: ["inbox", "orders"], admin: ["agent", "agent-knowledge", "errors"] };
const shortLabels: Partial<Record<PortalView, string>> = { overview: "Обзор", orders: "Проекты", "agent-knowledge": "Знания", agent: "Агент" };

export function MiniAppShell({ controller, theme, setTheme, activeView, project, onNavigate, onOpenProject, onProfileChange, telegramThread, onCloseTelegramThread, children }: MiniAppShellProps) {
  const viewer = controller.snapshot.viewer!;
  const hasProjects = viewer.role === "client" || viewer.role === "developer";
  const [showProjects, setShowProjects] = useState(hasProjects);
  const [menuOpen, setMenuOpen] = useState(false);
  const menu = useRef<HTMLDialogElement>(null);
  const scroll = useRef<HTMLElement>(null);
  const projects = controller.snapshot.projects.filter(item => viewer.role === "client" || item.developerId === viewer.id);
  const projectVisible = !showProjects && isProjectView(activeView);
  const canBack = Boolean(telegramThread) || menuOpen || (!showProjects && (hasProjects || activeView !== ROLE_VIEWS[viewer.role][0]));
  const back = useCallback(() => {
    const dialogs = document.querySelectorAll<HTMLDialogElement>("dialog[open]");
    const active = dialogs.item(dialogs.length - 1);
    if (active) { if (active.dispatchEvent(new Event("cancel", { cancelable: true }))) active.close(); return; }
    if (telegramThread) { onCloseTelegramThread(); return; }
    if (hasProjects) setShowProjects(true); else onNavigate(ROLE_VIEWS[viewer.role][0]!);
    scroll.current?.scrollTo({ top: 0 });
  }, [hasProjects, onNavigate, viewer.role, telegramThread, onCloseTelegramThread]);
  useTelegramBack(canBack, back);
  function navigate(view: PortalView) {
    onNavigate(view); setShowProjects(false); menu.current?.close(); scroll.current?.scrollTo({ top: 0 });
  }
  async function openProject(id: string) {
    if (await onOpenProject(id)) { setShowProjects(false); scroll.current?.scrollTo({ top: 0 }); }
  }
  const title = viewer.mustChangePassword ? "Добро пожаловать" : showProjects ? viewer.role === "client" ? "Мои проекты" : "В работе" : projectVisible ? project?.name ?? "Мои проекты" : PORTAL_VIEWS[activeView].label;
  return (
    <div className={portal.root} data-theme={theme} data-presentation="miniapp" data-testid="portal" data-role={viewer.role}>
      <a className="skip-link" href="#main">Перейти к содержимому</a>
      <div className={styles.app}>
        <header className={styles.header}>
          {telegramThread ? (
            <div className={styles.dialogIdentity}>
              <button type="button" className={`${styles.moreButton} ${styles.dialogBack}`} aria-label="Вернуться к диалогам" onClick={onCloseTelegramThread}><Icon name="arrow" /></button>
              <div>
                <h1>{telegramThread.name}</h1>
                {telegramThread.ownerName && <p>{`${telegramThread.ownerName} · на связи`}</p>}
              </div>
            </div>
          ) : (
            <div className={styles.brand}>
              <span className={styles.mark}><Icon name="service" /></span>
              <strong>Node</strong>
              <span>{ROLE_LABELS[viewer.role]}</span>
            </div>
          )}
          {telegramThread ? <ChatActions key={telegramThread.id} thread={telegramThread} controller={controller} /> : <button className={styles.moreButton} type="button" aria-label="Открыть меню приложения" aria-haspopup="dialog" aria-expanded={menuOpen} onClick={() => { menu.current?.showModal(); setMenuOpen(true); }}><Icon name="menu" /></button>}
        </header>
        <main id="main" ref={scroll} className={styles.main} aria-busy={controller.busy} data-chat={Boolean(telegramThread) || projectVisible && activeView === "chat"}>
          {!telegramThread && (
          <div className={styles.heading}>
            {hasProjects && !showProjects && !viewer.mustChangePassword && (
            <button type="button" className={styles.back} disabled={controller.busy} onClick={() => { setShowProjects(true); scroll.current?.scrollTo({ top: 0 }); }}>
              <Icon name="arrow" />
              Все проекты
            </button>
)}
            <h1>{title}</h1>
            {showProjects && <p>{viewer.role === "client" ? "Всё по вашим проектам в одном месте" : "Выберите проект или откройте общую очередь"}</p>}
          </div>
          )}
          {!viewer.mustChangePassword && showProjects ? (
            <div className={styles.projects}>
              {viewer.role === "developer" && (
              <button type="button" className={styles.queue} disabled={controller.busy} onClick={() => navigate("queue")}>
                <Icon name="flow" />
                <span>
                  Общая очередь
                  <small>Новые проекты студии</small>
                </span>
                <Icon name="arrow" />
              </button>
)}
              {projects.length ? projects.map(item => (
                <button type="button" key={item.id} aria-label={`Открыть проект ${item.name}`} className={styles.project} disabled={controller.busy} onClick={() => void openProject(item.id)}>
                  <span className={styles.projectTop}>
                    <span className={styles.mark}><Icon name="site" /></span>
                    <span className={styles.status}>{item.developerId ? "В работе" : "В очереди"}</span>
                  </span>
                  <strong>{item.name}</strong>
                  <span className={styles.description}>{item.description || "Этапы, задачи и переписка"}</span>
                  <span className={styles.projectLink}>
                    Открыть проект
                    <Icon name="arrow" />
                  </span>
                </button>
              )) : <section className={portal.panel}><Empty title={viewer.role === "client" ? "Проект появится здесь" : "Пока нет проектов в работе"} text={viewer.role === "client" ? "Куратор подготовит проект и привяжет его к вашему кабинету." : "Изучите ТЗ в общей очереди и возьмите проект в работу."} /></section>}
            </div>
          ) : children}
        </main>
        {!viewer.mustChangePassword && !telegramThread && (
          <nav className={styles.tabs} aria-label="Навигация приложения">
            {tabs[viewer.role].map(view => (
              <button type="button" key={view} disabled={controller.busy || (isProjectView(view) && (!project || (viewer.role === "developer" && project.developerId !== viewer.id)))} aria-current={!showProjects && activeView === view ? "page" : undefined} onClick={() => navigate(view)}>
                <Icon name={PORTAL_VIEWS[view].icon} />
                <span>{shortLabels[view] ?? PORTAL_VIEWS[view].label}</span>
              </button>
            ))}
            <button type="button" aria-label="Ещё — меню приложения" aria-haspopup="dialog" aria-expanded={menuOpen} onClick={() => { menu.current?.showModal(); setMenuOpen(true); }}>
              <Icon name="menu" />
              <span>Ещё</span>
            </button>
          </nav>
        )}
        <dialog ref={menu} className={`${portal.dialog} ${styles.sheet}`} aria-label="Меню приложения" onClose={() => setMenuOpen(false)}>
          <Notifications modal />
          <div className={styles.sheetTitle}>
            <h2>Рабочее пространство</h2>
            <button type="button" className={styles.moreButton} aria-label="Закрыть меню приложения" onClick={() => menu.current?.close()}><Icon name="close" /></button>
          </div>
          <p className={styles.identity}>{viewer.email}</p>
          <div className={styles.menuLinks}>
            {!viewer.mustChangePassword && hasProjects && (
            <button type="button" onClick={() => { setShowProjects(true); menu.current?.close(); }}>
              <Icon name="site" />
              Мои проекты
            </button>
)}
            {!viewer.mustChangePassword && ROLE_VIEWS[viewer.role].filter(view => !isProjectView(view) && !tabs[viewer.role].includes(view)).map(view => (
              <button type="button" key={view} disabled={controller.busy} onClick={() => navigate(view)}>
                <Icon name={PORTAL_VIEWS[view].icon} />
                {PORTAL_VIEWS[view].label}
              </button>
))}
          </div>
          <div className={styles.appearance}>
            <span>Оформление</span>
            <ThemeSwitch theme={theme} onChange={setTheme} />
          </div>
          {!viewer.mustChangePassword && <ProfileSwitcher controller={controller} inline onChange={() => { menu.current?.close(); onProfileChange(); }} />}
          <div className={styles.menuLinks}>
            <a href="https://t.me/node_studio_bot" target="_blank" rel="noopener noreferrer">
              <Icon name="telegram" />
              Поддержка студии
            </a>
            <button type="button" disabled={controller.busy} onClick={() => void controller.logout()}>
              <Icon name="people" />
              Выйти из аккаунтов
            </button>
          </div>
        </dialog>
      </div>
    </div>
  );
}
