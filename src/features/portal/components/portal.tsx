"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Icon } from "@/components/ui/icon";
import { Notifications } from "@/components/ui/notifications";
import type { IconName } from "@/components/ui/icon";
import { Login, PasswordForm } from "@/features/portal/components/auth";
import { ProjectOrders, TelegramInbox } from "@/features/portal/components/curator";
import { DeveloperQueue } from "@/features/portal/components/developer";
import { ProfileSwitcher } from "@/features/portal/components/profile-switcher";
import { ProjectWorkspace } from "@/features/portal/components/project-workspace";
import { AgentAdmin } from "@/features/portal/components/agent/admin";
import { AdminErrors } from "@/features/portal/components/errors/admin-errors";
import { isAgentView } from "@/features/portal/model/agent";
import type { AgentView } from "@/features/portal/model/agent";
import { Empty, ThemeSwitch, WorkspaceBrand } from "@/features/portal/components/ui";
import { usePortal } from "@/features/portal/lib/use-portal";
import { usePortalTheme } from "@/features/portal/lib/use-portal-theme";
import { ROLE_LABELS } from "@/features/portal/model/types";
import type { Role } from "@/features/portal/model/types";
import { isProjectView, PROJECT_VIEWS, PROJECT_VIEW_LABELS } from "@/features/portal/model/project-views";
import type { ProjectView } from "@/features/portal/model/project-views";
import styles from "./portal.module.css";

type View = ProjectView | AgentView | "errors" | "queue" | "inbox" | "orders" | "settings";
const views: Record<View, { label: string; icon: IconName }> = {
  errors: { label: "Ошибки", icon: "document" },
  agent: { label: "ИИ-агент", icon: "bot" }, "agent-prompts": { label: "Промпты", icon: "document" }, "agent-knowledge": { label: "База знаний", icon: "database" }, "agent-playground": { label: "Проверка агента", icon: "spark" }, "agent-history": { label: "История настроек", icon: "clock" },
  overview: { label: PROJECT_VIEW_LABELS.overview, icon: "service" }, tasks: { label: PROJECT_VIEW_LABELS.tasks, icon: "document" }, history: { label: PROJECT_VIEW_LABELS.history, icon: "code" }, chat: { label: PROJECT_VIEW_LABELS.chat, icon: "bot" },
  queue: { label: "Общая очередь", icon: "flow" }, inbox: { label: "Диалоги", icon: "telegram" }, orders: { label: "Создание проектов", icon: "plus" }, settings: { label: "Настройки", icon: "people" },
};
const roleViews: Record<Role, View[]> = { client: ["overview", "tasks", "history", "chat", "settings"], developer: ["queue", "overview", "tasks", "history", "chat", "settings"], curator: ["inbox", "orders", "settings"], admin: ["agent", "agent-prompts", "agent-knowledge", "agent-playground", "agent-history", "errors", "settings"] };

export function Portal() {
  const controller = usePortal(); const { theme, setTheme } = usePortalTheme();
  const [view, setView] = useState<View | null>(null);
  const [layout, setLayout] = useState<{ viewerId: string; projectId: string; secondary: ProjectView } | null>(null);
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
  const project = snapshot.projects.find(project => project.id === snapshot.selectedProjectId);
  const developer = viewer.role === "developer";
  const requestedView = view && available.includes(view) ? view : available[0] ?? "overview";
  const activeView = developer && isProjectView(requestedView) && project?.developerId !== viewer.id ? "queue" : requestedView;
  const projectView = isProjectView(activeView) && viewer.role !== "admin";
  const globalViews = available.filter(key => !isProjectView(key));
  const sidebarProjects = developer ? snapshot.projects.filter(item => item.developerId === viewer.id) : snapshot.projects;
  const secondaryView = layout?.viewerId === viewer.id && layout.projectId === project?.id && layout.secondary !== activeView ? layout.secondary : null;
  const navigate = (next: View) => {
    if (!isProjectView(next)) setLayout(null);
    setView(next); mobileMenu.current?.close();
  };
  const selectSecondary = (next: ProjectView | null) => {
    if (secondaryView && next === activeView) navigate(secondaryView);
    setLayout(next && project ? { viewerId: viewer.id, projectId: project.id, secondary: next } : null);
  };
  const selectPrimary = (next: ProjectView) => {
    if (next === secondaryView && isProjectView(activeView)) setLayout({ viewerId: viewer.id, projectId: project!.id, secondary: activeView });
    navigate(next);
  };
  const openSecondary = () => {
    if (activeView === "chat") { selectSecondary("chat"); navigate("overview"); }
    else selectSecondary("chat");
  };
  const openProject = async (id: string, tab: ProjectView = "overview") => {
    if (id === project?.id) selectPrimary(tab);
    else if (await controller.select(id)) { setLayout(null); navigate(tab); }
  };
  const acceptProject = async (id: string, tab: "overview" | "chat") => {
    if (await controller.acceptProject(id)) { setLayout(null); navigate(tab); }
  };
  const pageTitle = viewer.mustChangePassword ? "Добро пожаловать" : projectView ? project?.name ?? "Мои проекты" : views[activeView].label;
  const navigation = (
    <>
      <WorkspaceBrand />
      {!viewer.mustChangePassword && (
      <div>
        <p className={styles.sideCaption}>Рабочее пространство</p>
        <nav className={styles.nav} aria-label="Разделы кабинета">
          {globalViews.map(key => (
            <button type="button" key={key} disabled={busy} aria-current={activeView === key ? "page" : undefined} onClick={() => navigate(key)}>
              <Icon name={views[key].icon} />
              {views[key].label}
            </button>
))}
        </nav>
      </div>
)}
      {sidebarProjects.length > 0 && (
      <div>
        <p className={styles.sideCaption}>{developer ? "В работе" : "Мои проекты"}</p>
        <nav className={`${styles.nav} ${styles.projectTree}`} aria-label={developer ? "Проекты в работе" : "Мои проекты"}>
          {sidebarProjects.map(item => (
            <details key={item.id} className={styles.projectBranch} open={item.id === project?.id && projectView}>
              <summary>
                <Icon name="site" />
                <span>{item.name}</span>
                <span className={styles.projectChevron} aria-hidden="true">›</span>
              </summary>
              <div className={styles.projectSections} role="group" aria-label={`Разделы проекта ${item.name}`}>
                {PROJECT_VIEWS.map(key => (
                  <button type="button" key={key} disabled={busy} aria-current={item.id === project?.id && activeView === key ? "page" : undefined} data-secondary={item.id === project?.id && secondaryView === key} onClick={() => void openProject(item.id, key)}>
                    <Icon name={views[key].icon} />
                    {views[key].label}
                  </button>
                ))}
              </div>
            </details>
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
          <Notifications modal />
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
            <div className={styles.pageHeader}>
              <div>
                <span className={styles.kicker}>{projectView ? views[activeView].label : viewer.role === "client" ? "Ваше рабочее пространство" : viewer.role === "curator" ? "Сопровождение и поддержка" : "Рабочее пространство студии"}</span>
                <h1>{pageTitle}</h1>
                <p className={styles.subtitle}>{projectView ? project?.description : viewer.role === "curator" ? "Переписка с клиентами и подготовка новых проектов" : viewer.role === "developer" ? "Все проекты и задачи в одном месте" : ""}</p>
              </div>
              {projectView && project && <span className={styles.sync}>{snapshot.syncError ? "Нет свежих данных" : snapshot.syncedAt ? "Синхронизировано с GitHub" : "Ожидаем GitHub"}</span>}
            </div>
            {viewer.mustChangePassword ? <PasswordForm controller={controller} required /> : (
              <>
                {isAgentView(activeView) ? <AgentAdmin controller={controller} view={activeView} /> : activeView === "errors" ? <AdminErrors controller={controller} /> : activeView === "settings" ? <PasswordForm controller={controller} /> : activeView === "inbox" ? <TelegramInbox controller={controller} /> : activeView === "orders" ? <ProjectOrders controller={controller} /> : activeView === "queue" ? <DeveloperQueue controller={controller} onAcceptProject={(id, tab) => void acceptProject(id, tab)} onOpenChat={id => void openProject(id, "chat")} /> : !project ? <section className={styles.panel}><Empty title="Проект появится здесь" text="После создания проекта вы увидите этапы, задачи и отдельный чат." /></section> : (
                  <ProjectWorkspace
                    key={`${viewer.id}:${project.id}`}
                    project={project}
                    controller={controller}
                    primary={isProjectView(activeView) ? activeView : "overview"}
                    secondary={secondaryView}
                    onSelectPrimary={selectPrimary}
                    onSelectSecondary={selectSecondary}
                    onOpenSecondary={openSecondary}
                    onCloseSecondary={() => setLayout(null)}
                  />
                )}
              </>
            )}
          </main>
        </div>
      </div>
    </div>
  );
}
