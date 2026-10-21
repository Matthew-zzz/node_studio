"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Icon } from "@/components/ui/icon";
import type { IconName } from "@/components/ui/icon";
import { Login, PasswordForm } from "@/features/portal/components/auth";
import { Chat } from "@/features/portal/components/chat";
import { ProjectOrders, TelegramInbox } from "@/features/portal/components/curator";
import { DeveloperQueue } from "@/features/portal/components/developer";
import { ProfileSwitcher } from "@/features/portal/components/profile-switcher";
import { CommitHistory, ProjectBrief, Stages, Tasks } from "@/features/portal/components/project-work";
import { Empty, ThemeSwitch, WorkspaceBrand } from "@/features/portal/components/ui";
import { usePortal } from "@/features/portal/lib/use-portal";
import { usePortalTheme } from "@/features/portal/lib/use-portal-theme";
import { ROLE_LABELS } from "@/features/portal/model/types";
import type { Role } from "@/features/portal/model/types";
import styles from "./portal.module.css";

type View = "overview" | "tasks" | "history" | "chat" | "queue" | "inbox" | "orders" | "settings";
const views: Record<View, { label: string; icon: IconName }> = {
  overview: { label: "Обзор проекта", icon: "service" }, tasks: { label: "Задачи", icon: "document" }, history: { label: "История", icon: "code" }, chat: { label: "Чат", icon: "bot" },
  queue: { label: "Общая очередь", icon: "flow" }, inbox: { label: "Диалоги", icon: "telegram" }, orders: { label: "Создание проектов", icon: "plus" }, settings: { label: "Настройки", icon: "people" },
};
const roleViews: Record<Role, View[]> = { client: ["overview", "tasks", "history", "chat", "settings"], developer: ["queue", "overview", "tasks", "history", "chat", "settings"], curator: ["inbox", "orders", "settings"], admin: [] };

export function Portal() {
  const controller = usePortal(); const { theme, setTheme } = usePortalTheme();
  const [view, setView] = useState<View | null>(null);
  const mobileMenu = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const desktop = window.matchMedia("(min-width: 651px)");
    const close = () => { if (desktop.matches) mobileMenu.current?.close(); };
    desktop.addEventListener("change", close);
    return () => desktop.removeEventListener("change", close);
  }, []);
  const { snapshot, busy } = controller; const viewer = snapshot.viewer;
  if (!viewer && controller.loading) return (
    <div className={styles.root} data-theme={theme}>
      <main id="main" className={styles.loadingPage}>
        <WorkspaceBrand />
        <h1>Личный кабинет</h1>
        <p role="status">Открываем рабочее пространство…</p>
      </main>
    </div>
  );
  if (!viewer) return <div className={styles.root} data-theme={theme}><Login controller={controller} theme={theme} setTheme={setTheme} /></div>;
  const available = roleViews[viewer.role];
  const activeView = view && available.includes(view) ? view : available[0] ?? "overview";
  const project = snapshot.projects.find(project => project.id === snapshot.selectedProjectId);
  const projectView = ["overview", "tasks", "history", "chat"].includes(activeView) && viewer.role !== "admin";
  const thread = snapshot.conversations.find(thread => thread.kind === "project" && thread.projectId === project?.id);
  const navigate = (next: View) => { setView(next); mobileMenu.current?.close(); };
  const openProject = (id: string, tab: View = "tasks") => { navigate(tab); void controller.select(id); };
  const pageTitle = viewer.mustChangePassword ? "Добро пожаловать" : viewer.role === "admin" ? "Администратор" : projectView ? project?.name ?? "Мои проекты" : views[activeView].label;
  const navigation = (
    <>
      <WorkspaceBrand />
      {viewer.role !== "admin" && !viewer.mustChangePassword && (
      <div>
        <p className={styles.sideCaption}>Рабочее пространство</p>
        <nav className={styles.nav} aria-label="Разделы кабинета">
          {available.map(key => (
            <button type="button" key={key} aria-current={activeView === key ? "page" : undefined} onClick={() => navigate(key)}>
              <Icon name={views[key].icon} />
              {views[key].label}
            </button>
))}
        </nav>
      </div>
)}
      {snapshot.projects.length > 0 && (
      <div>
        <p className={styles.sideCaption}>
          Проекты ·
          {snapshot.projects.length}
        </p>
        <nav className={`${styles.nav} ${styles.projectNav}`} aria-label="Выбор проекта">
          {snapshot.projects.map(item => (
            <button type="button" key={item.id} aria-current={item.id === project?.id && projectView ? "page" : undefined} onClick={() => openProject(item.id, "overview")}>
              <span className={styles.projectDot} />
              <span>{item.name}</span>
            </button>
))}
        </nav>
      </div>
)}
    </>
  );
  const support = (
    <a className={styles.supportLink} href="https://t.me/node_studio_bot" target="_blank" rel="noopener noreferrer">
      <Icon name="telegram" />
      Поддержка студии ↗
    </a>
  );
  return (
    <div className={styles.root} data-theme={theme} data-testid="portal" data-role={viewer.role}>
      <a className="skip-link" href="#main">Перейти к содержимому</a>
      <div className={styles.shell} key={viewer.id}>
        <aside className={styles.sidebar} aria-label="Рабочее пространство">
          {navigation}
          <div className={styles.sidebarBottom}>
            {support}
            <ProfileSwitcher controller={controller} onChange={() => setView(null)} />
          </div>
        </aside>
        <dialog ref={mobileMenu} className={styles.mobileMenu} aria-label="Меню кабинета">
          <button type="button" className={styles.closeMenu} aria-label="Закрыть меню кабинета" onClick={() => mobileMenu.current?.close()}><Icon name="close" /></button>
          {navigation}
          <div className={styles.sidebarBottom}>{support}</div>
        </dialog>
        <div className={styles.mobileProfiles}><ProfileSwitcher controller={controller} onChange={() => setView(null)} /></div>
        <div className={styles.workspace}>
          <header className={styles.topbar}>
            <button type="button" className={`${styles.iconButton} ${styles.openMenu}`} aria-label="Открыть меню кабинета" aria-haspopup="dialog" onClick={() => mobileMenu.current?.showModal()}><Icon name="menu" /></button>
            <div className={styles.breadcrumb}>
              <Link href="/">Node Studio</Link>
              <span>/</span>
              <span title={ROLE_LABELS[viewer.role]}>{ROLE_LABELS[viewer.role]}</span>
            </div>
            <div className={styles.topActions}>
              <ThemeSwitch theme={theme} onChange={setTheme} />
              <button type="button" className={styles.textButton} title="Выйти из всех профилей на этом устройстве" disabled={busy} onClick={() => void controller.logout().then(done => { if (done) setView(null); })}>Выйти</button>
            </div>
          </header>
          <main id="main" className={styles.content} aria-busy={busy}>
            {controller.error && (
            <div className={styles.notice} role="alert">
              <span>{controller.error}</span>
              <button className={styles.textButton} type="button" aria-label="Скрыть сообщение" onClick={controller.clearError}>×</button>
            </div>
)}
            <div className={styles.pageHeader}>
              <div>
                <span className={styles.kicker}>{viewer.role === "client" ? "Ваше рабочее пространство" : viewer.role === "curator" ? "Сопровождение и поддержка" : "Рабочее пространство студии"}</span>
                <h1>{pageTitle}</h1>
                <p className={styles.subtitle}>{projectView ? project?.description : viewer.role === "curator" ? "Переписка с клиентами и подготовка новых проектов" : viewer.role === "developer" ? "Все проекты и задачи в одном месте" : ""}</p>
              </div>
              {projectView && project && <span className={styles.sync}>{snapshot.syncError ? "Нет свежих данных" : snapshot.syncedAt ? "Синхронизировано с GitHub" : "Ожидаем GitHub"}</span>}
            </div>
            {viewer.mustChangePassword ? <PasswordForm controller={controller} required /> : viewer.role === "admin" ? <section className={styles.panel}><Empty title="Здесь будет управление студией" text="Раздел администратора подготовлен. Возможности добавим на следующем этапе." icon="service" /></section> : (
              <>
                {activeView === "settings" ? <PasswordForm controller={controller} /> : activeView === "inbox" ? <TelegramInbox controller={controller} /> : activeView === "orders" ? <ProjectOrders controller={controller} /> : activeView === "queue" ? <DeveloperQueue controller={controller} onOpenTask={id => openProject(id)} onOpenChat={id => openProject(id, "chat")} /> : !project ? <section className={styles.panel}><Empty title="Проект появится здесь" text="После создания проекта вы увидите этапы, задачи и отдельный чат." /></section> : (
                  <>
                    {snapshot.syncError && (
                    <div className={styles.notice} role="status">
                      <span>{snapshot.syncError}</span>
                      <button className={styles.textButton} type="button" onClick={() => void controller.refresh()}>Обновить</button>
                    </div>
)}
                    <div className={styles.columns} data-chat={activeView === "chat"}>
                      <div className={styles.stack}>
                        {activeView === "history" ? <CommitHistory controller={controller} /> : activeView === "tasks" ? (
                          <>
                            <ProjectBrief project={project} />
                            <Tasks project={project} controller={controller} />
                          </>
) : (
  <>
    <Stages project={project} controller={controller} />
    <Tasks project={project} controller={controller} compact />
    <ProjectBrief project={project} />
  </>
)}
                      </div>
                      <Chat key={thread?.id} thread={thread} controller={controller} />
                    </div>
                  </>
                )}
              </>
            )}
          </main>
        </div>
      </div>
    </div>
  );
}
