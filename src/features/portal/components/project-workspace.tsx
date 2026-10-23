"use client";

import { Icon } from "@/components/ui/icon";
import { Chat } from "@/features/portal/components/chat";
import { CommitHistory, ProjectInfo, Stages, Tasks } from "@/features/portal/components/project-work";
import type { PortalController } from "@/features/portal/lib/use-portal";
import type { PortalProject } from "@/features/portal/model/types";
import { isProjectView, PROJECT_VIEWS, PROJECT_VIEW_LABELS } from "@/features/portal/model/project-views";
import type { ProjectView } from "@/features/portal/model/project-views";
import portalStyles from "./portal.module.css";
import styles from "./project-workspace.module.css";
import { RepositoryManager } from "@/features/portal/components/project-manager";
import { repositoryKey } from "@/features/portal/model/project-repositories";
import management from "./project-manager.module.css";

interface ProjectWorkspaceProps {
  project: PortalProject;
  controller: PortalController;
  primary: ProjectView;
  secondary: ProjectView | null;
  allowSplit?: boolean;
  onSelectPrimary: (view: ProjectView) => void;
  onSelectSecondary: (view: ProjectView) => void;
  onOpenSecondary: () => void;
  onCloseSecondary: () => void;
  subprojectId: string | null;
  onSelectSubproject: (id: string | null) => void;
}

function ProjectSection({ project, controller, view, companion, subprojectId }: {
  project: PortalProject;
  controller: PortalController;
  view: ProjectView;
  companion: ProjectView | null;
  subprojectId: string | null;
}) {
  if (view === "chat") {
    const thread = controller.snapshot.conversations.find(thread => thread.kind === "project" && thread.projectId === project.id);
    return <Chat key={thread?.id} thread={thread} controller={controller} />;
  }
  if (view === "history") return <CommitHistory controller={controller} />;
  if (view === "tasks") return <Tasks project={project} controller={controller} />;
  return (
    <div className={portalStyles.stack}>
      <ProjectInfo project={project} controller={controller} />
      <Stages project={project} controller={controller} {...(subprojectId ? { subprojectId } : {})} />
      {companion !== "tasks" && <Tasks project={project} controller={controller} compact />}
    </div>
  );
}

export function ProjectWorkspace({ project, controller, primary, secondary: requestedSecondary, allowSplit = true, onSelectPrimary, onSelectSecondary, onOpenSecondary, onCloseSecondary, subprojectId, onSelectSubproject }: ProjectWorkspaceProps) {
  const { busy } = controller;
  const secondary = allowSplit ? requestedSecondary : null;
  const panes = secondary ? [primary, secondary] : [primary];
  const developer = controller.snapshot.viewer?.role === "developer";
  const scoped = developer && subprojectId ? { ...controller, snapshot: { ...controller.snapshot, tasks: controller.snapshot.tasks.filter(item => repositoryKey(item.subprojectId) === subprojectId), stages: controller.snapshot.stages.filter(item => repositoryKey(item.subprojectId) === subprojectId), commits: controller.snapshot.commits.filter(item => repositoryKey(item.subprojectId) === subprojectId), hasMoreCommits: controller.snapshot.repositoryStatus?.[subprojectId]?.hasMore ?? false } } : controller;
  const expandSecondary = () => {
    if (secondary) { onSelectPrimary(secondary); onCloseSecondary(); }
  };
  return (
    <section className={styles.root} data-split={Boolean(secondary)} aria-label="Рабочая область проекта">
      <div className={styles.tools}>
        <div className={management.selector}>
          {developer && Boolean(project.subprojects?.length) && (
            <label>
              Область
              <select aria-label="Подпроект" value={subprojectId ?? "all"} disabled={busy} onChange={event => onSelectSubproject(event.target.value === "all" ? null : event.target.value)}>
                <option value="all">Весь проект</option>
                {project.subprojects?.map(part => <option key={part.id} value={part.id}>{part.name}</option>)}
              </select>
            </label>
          )}
        </div>
        {allowSplit && (
          <div className={styles.actions}>
            {secondary ? (
              <>
                <button type="button" className={portalStyles.iconButton} disabled={busy} aria-label="Поменять разделы местами" title="Поменять разделы местами" onClick={() => onSelectPrimary(secondary)}><Icon name="swap" /></button>
                <button type="button" className={portalStyles.secondary} disabled={busy} onClick={onCloseSecondary}>Один раздел</button>
              </>
            ) : (
              <button type="button" className={portalStyles.secondary} disabled={busy} onClick={onOpenSecondary}>
                <Icon name="columns" />
                Открыть рядом
              </button>
            )}
          </div>
        )}
      </div>
      {developer && primary === "overview" && !project.repo && <RepositoryManager key={project.id} project={project} controller={controller} />}
      <div className={styles.grid}>
        {panes.map((view, index) => (
          <section key={view} className={styles.pane} aria-label={secondary ? index === 0 ? "Левая область проекта" : "Правая область проекта" : "Основная область проекта"}>
            {secondary && (
              <div className={styles.paneHeader}>
                <label>
                  <span>{index === 0 ? "Слева" : "Справа"}</span>
                  <select
                    aria-label={index === 0 ? "Раздел слева" : "Раздел справа"}
                    value={view}
                    disabled={busy}
                    onChange={event => {
                    if (isProjectView(event.target.value)) (index === 0 ? onSelectPrimary : onSelectSecondary)(event.target.value);
                  }}
                  >
                    {PROJECT_VIEWS.map(item => <option key={item} value={item}>{PROJECT_VIEW_LABELS[item]}</option>)}
                  </select>
                </label>
                <button type="button" className={portalStyles.iconButton} disabled={busy} aria-label={index === 0 ? "Развернуть левый раздел" : "Развернуть правый раздел"} title="Развернуть раздел" onClick={index === 0 ? onCloseSecondary : expandSecondary}><Icon name="diagonal" /></button>
                {index === 1 && <button type="button" className={portalStyles.iconButton} disabled={busy} aria-label="Закрыть правый раздел" title="Закрыть раздел" onClick={onCloseSecondary}><Icon name="close" /></button>}
              </div>
            )}
            <ProjectSection project={project} controller={view === "chat" ? controller : scoped} view={view} companion={secondary ? index === 0 ? secondary : primary : null} subprojectId={subprojectId} />
          </section>
        ))}
      </div>
    </section>
  );
}
