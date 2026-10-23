import type { PortalSnapshot, Viewer } from "./types";

/** The API applies this projection before serializing; hidden data never reaches a client. */
export function visibleSnapshot(source: PortalSnapshot, viewer: Viewer, selectedId = ""): PortalSnapshot {
  source = { ...source, projects: source.projects.filter(project => project.status !== "archived") };
  const blank = { ...source, viewer, projects: [], tasks: [], stages: [], commits: [], conversations: [], messages: [], drafts: [], quotes: [], orders: [], clientBriefs: [], projectBriefs: [], briefProjects: [], selectedProjectId: "", repositoryStatus: {} };
  if (viewer.mustChangePassword || viewer.role === "admin") return blank;
  const projects = source.projects.filter(project => viewer.role === "developer" || project.clientId === viewer.id).map(project => {
    if (viewer.role !== "client") return project;
    const publicProject = { ...project, repo: "", repositoryReady: Boolean(project.repo) };
    delete publicProject.subprojects;
    delete publicProject.repositoryCreation;
    return publicProject;
  });
  const ids = new Set(projects.map(project => project.id));
  const selectedProjectId = projects.find(project => project.id === selectedId)?.id ?? projects[0]?.id ?? "";
  const developer = viewer.role === "developer";
  const conversations = source.conversations.filter(thread => developer && thread.kind === "telegram" || thread.kind === "project" && ids.has(thread.projectId));
  const threads = new Set(conversations.map(thread => thread.id));
  return {
    ...source, viewer, projects, selectedProjectId, conversations,
    orders: developer ? source.orders.filter(order => !order.projectId || ids.has(order.projectId)) : [],
    clientBriefs: developer ? (source.clientBriefs ?? []).filter(brief => threads.has(brief.threadId)) : [],
    briefProjects: developer ? source.briefProjects ?? [] : [],
    projectBriefs: (source.projectBriefs ?? []).filter(brief => ids.has(brief.projectId)),
    repositoryStatus: viewer.role === "developer" ? source.repositoryStatus ?? {} : {},
    tasks: source.tasks.filter(task => ids.has(task.projectId)),
    stages: source.stages.filter(stage => ids.has(stage.projectId)),
    commits: source.commits.filter(commit => commit.projectId === selectedProjectId),
    messages: source.messages.filter(message => threads.has(message.threadId)),
    drafts: source.drafts.filter(draft => ids.has(draft.projectId)),
    quotes: source.quotes.filter(quote => ids.has(quote.projectId)).map(quote => viewer.role === "client" ? { ...quote, baseKopecks: 0, markupKopecks: 0 } : quote),
  };
}
