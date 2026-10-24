"use client";

import { useCallback, useLayoutEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { Icon } from "@/components/ui/icon";
import { BrandMark } from "@/components/ui/brand";
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
const tabs: Record<Role, readonly PortalView[]> = { client: PROJECT_VIEWS, developer: ["inbox", "queue", "orders"], admin: ["agent", "agent-knowledge", "errors"] };
const shortLabels: Partial<Record<PortalView, string>> = { overview: "Обзор", orders: "Создать", "agent-knowledge": "Знания", agent: "Агент" };

export function MiniAppShell({ controller, theme, setTheme, activeView, project, onNavigate, onOpenProject, onProfileChange, telegramThread, onCloseTelegramThread, children }: MiniAppShellProps) {
  const viewer = controller.snapshot.viewer!;
  const hasProjects = viewer.role === "client" || viewer.role === "developer";
  const [showProjects, setShowProjects] = useState(viewer.role === "client");
  const [showMore, setShowMore] = useState(false);
  const previousScroll = useRef(0);
  const previousFocus = useRef<HTMLElement | null>(null);
  const restoreScroll = useRef(false);
  const scroll = useRef<HTMLElement>(null);
  useLayoutEffect(() => {
    if (showMore) {
      scroll.current?.scrollTo({ top: 0 });
      scroll.current?.querySelector("h1")?.focus({ preventScroll: true });
    } else if (restoreScroll.current) {
      restoreScroll.current = false;
      scroll.current?.scrollTo({ top: previousScroll.current });
      previousFocus.current?.focus({ preventScroll: true });
    }
  }, [showMore]);
  const projects = controller.snapshot.projects.filter(item => viewer.role === "client" || item.developerId === viewer.id);
  const projectVisible = !showProjects && isProjectView(activeView);
  const navigationTabs = viewer.role === "developer" && projectVisible ? PROJECT_VIEWS : tabs[viewer.role];
  const canBack = Boolean(telegramThread) || showMore || (!showProjects && (hasProjects || activeView !== ROLE_VIEWS[viewer.role][0]));
  const back = useCallback(() => {
    const dialogs = document.querySelectorAll<HTMLDialogElement>("dialog[open]");
    const active = dialogs.item(dialogs.length - 1);
    if (active) { if (active.dispatchEvent(new Event("cancel", { cancelable: true }))) active.close(); return; }
    if (showMore) { restoreScroll.current = true; setShowMore(false); return; }
    if (telegramThread) { onCloseTelegramThread(); return; }
    if (hasProjects) setShowProjects(true); else onNavigate(ROLE_VIEWS[viewer.role][0]!);
    scroll.current?.scrollTo({ top: 0 });
  }, [hasProjects, onNavigate, viewer.role, telegramThread, onCloseTelegramThread, showMore]);
  useTelegramBack(canBack, back);
  function navigate(view: PortalView) {
    onNavigate(view); setShowProjects(false); setShowMore(false); scroll.current?.scrollTo({ top: 0 });
  }
  function openProjects() {
    setShowProjects(true); setShowMore(false); scroll.current?.scrollTo({ top: 0 });
  }
  async function openProject(id: string) {
    if (await onOpenProject(id)) { setShowProjects(false); scroll.current?.scrollTo({ top: 0 }); }
  }
  function openMore() {
    if (showMore) return;
    previousScroll.current = scroll.current?.scrollTop ?? 0;
    previousFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setShowMore(true);
  }
  const visibleThread = showMore ? undefined : telegramThread;
  const title = showMore ? "Ещё" : viewer.mustChangePassword ? "Добро пожаловать" : showProjects ? viewer.role === "client" ? "Мои проекты" : "В работе" : projectVisible ? project?.name ?? "Мои проекты" : PORTAL_VIEWS[activeView].label;
  return (
    <div className={portal.root} data-theme={theme} data-presentation="miniapp" data-testid="portal" data-role={viewer.role}>
      <a className="skip-link" href="#main">Перейти к содержимому</a>
      <div className={styles.app}>
        <header className={styles.header}>
          {visibleThread ? (
            <div className={styles.dialogIdentity}>
              <button type="button" className={`${styles.moreButton} ${styles.dialogBack}`} aria-label="Вернуться к диалогам" onClick={onCloseTelegramThread}><Icon name="arrow" /></button>
              <div>
                <h1>{visibleThread.name}</h1>
                {visibleThread.ownerName && <p>{`${visibleThread.ownerName} · на связи`}</p>}
              </div>
            </div>
          ) : (
            <div className={styles.brand}>
              <BrandMark size={34} />
              <strong>Node</strong>
              <span>{ROLE_LABELS[viewer.role]}</span>
            </div>
          )}
          {visibleThread ? <ChatActions key={visibleThread.id} thread={visibleThread} controller={controller} /> : <button className={styles.moreButton} type="button" aria-label="Открыть раздел Ещё" aria-pressed={showMore} disabled={controller.busy} onClick={openMore}><Icon name="menu" /></button>}
        </header>
        <main id="main" ref={scroll} className={styles.main} aria-busy={controller.busy} data-chat={!showMore && (Boolean(telegramThread) || projectVisible && activeView === "chat")}>
          {!visibleThread && (
          <div className={styles.heading}>
            {(showMore || hasProjects && !showProjects) && !viewer.mustChangePassword && (
            <button type="button" className={styles.back} disabled={controller.busy} onClick={showMore ? back : openProjects}>
              <Icon name="arrow" />
              {showMore ? "Назад" : "Все проекты"}
            </button>
)}
            <h1 tabIndex={-1}>{title}</h1>
          </div>
          )}
          <div className={styles.content} hidden={showMore} data-chat={Boolean(telegramThread) || projectVisible && activeView === "chat"}>
            {!viewer.mustChangePassword && showProjects ? (
              <div className={styles.projects}>
                {viewer.role === "developer" && (
                <button type="button" className={styles.queue} disabled={controller.busy} onClick={() => navigate("queue")}>
                  <Icon name="flow" />
                  <span>
                    Очередь
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
                    {item.description && <span className={styles.description}>{item.description}</span>}
                    <span className={styles.projectLink}>
                      Открыть проект
                      <Icon name="arrow" />
                    </span>
                  </button>
              )) : <section className={portal.panel}><Empty title={viewer.role === "client" ? "Проект появится здесь" : "Пока нет проектов в работе"} text={viewer.role === "client" ? "Разработчик подготовит проект и привяжет его к вашему кабинету." : "Изучите ТЗ в очереди и возьмите проект в работу."} /></section>}
              </div>
          ) : children}
          </div>
          {showMore && (
            <section className={styles.moreScreen} aria-label="Ещё">
              <section className={portal.panel} aria-label="Аккаунт">
                <h2>Аккаунт</h2>
                <p className={styles.identity}>{viewer.email}</p>
                {!viewer.mustChangePassword && <ProfileSwitcher controller={controller} inline onChange={() => { setShowMore(false); onProfileChange(); }} />}
              </section>
              {!viewer.mustChangePassword && (
                <section className={portal.panel} aria-label="Разделы приложения">
                  <h2>Разделы</h2>
                  <div className={styles.menuLinks}>
                    {hasProjects && (
                    <button type="button" disabled={controller.busy} onClick={openProjects}>
                      <Icon name="site" />
                      Мои проекты
                    </button>
)}
                    {ROLE_VIEWS[viewer.role].filter(view => !isProjectView(view) && !navigationTabs.includes(view)).map(view => (
                      <button type="button" key={view} disabled={controller.busy} onClick={() => navigate(view)}>
                        <Icon name={PORTAL_VIEWS[view].icon} />
                        {PORTAL_VIEWS[view].label}
                      </button>
))}
                  </div>
                </section>
              )}
              <section className={portal.panel} aria-label="Оформление">
                <h2>Оформление</h2>
                <div className={styles.appearance}><ThemeSwitch theme={theme} onChange={setTheme} /></div>
              </section>
              <section className={portal.panel} aria-label="Поддержка и выход">
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
              </section>
            </section>
          )}
        </main>
        {!viewer.mustChangePassword && !visibleThread && (
          <nav className={styles.tabs} aria-label="Навигация приложения">
            {viewer.role === "developer" && !projectVisible && (
              <button type="button" disabled={controller.busy} aria-current={!showMore && showProjects ? "page" : undefined} onClick={openProjects}>
                <Icon name="site" />
                <span>Проекты</span>
              </button>
            )}
            {navigationTabs.map(view => (
              <button type="button" key={view} disabled={controller.busy || (isProjectView(view) && (!project || (viewer.role === "developer" && project.developerId !== viewer.id)))} aria-current={!showMore && !showProjects && activeView === view ? "page" : undefined} onClick={() => navigate(view)}>
                <Icon name={PORTAL_VIEWS[view].icon} />
                <span>{shortLabels[view] ?? PORTAL_VIEWS[view].label}</span>
              </button>
            ))}
            <button type="button" aria-label="Ещё" aria-current={showMore ? "page" : undefined} disabled={controller.busy} onClick={openMore}>
              <Icon name="menu" />
              <span>Ещё</span>
            </button>
          </nav>
        )}

      </div>
    </div>
  );
}
