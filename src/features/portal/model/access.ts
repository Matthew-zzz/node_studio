import type { PortalSnapshot, Viewer } from "./types";

/** The API applies this projection before serializing; hidden data never reaches a client. */
export function visibleSnapshot(source: PortalSnapshot, viewer: Viewer, selectedId = ""): PortalSnapshot {
  source = { ...source, projects: source.projects.filter(project => project.status !== "archived") };
  const blank = { ...source, viewer, projects: [], tasks: [], stages: [], commits: [], conversations: [], messages: [], drafts: [], quotes: [], orders: [], clientBriefs: [], selectedProjectId: "", repositoryStatus: {} };
  if (viewer.mustChangePassword || viewer.role === "admin") return blank;
  if (viewer.role === "curator") {
    const conversations = source.conversations.filter(thread => thread.kind === "telegram");
    const ids = new Set(conversations.map(thread => thread.id));
    const projects = source.projects.filter(project => project.origin === "curator").map(project => { const visible = { ...project, repo: "", repositoryReady: Boolean(project.repo) }; delete visible.subprojects; delete visible.repositoryCreation; return visible; });
    return { ...blank, projects, conversations, clientBriefs: (source.clientBriefs ?? []).filter(brief => ids.has(brief.threadId)), messages: source.messages.filter(message => ids.has(message.threadId)), orders: source.orders.filter(order => !order.projectId || source.projects.some(project => project.id === order.projectId)) };
  }
  const projects = source.projects.filter(project => viewer.role === "developer" || project.clientId === viewer.id).map(project => {
    if (viewer.role !== "client") return project;
    const publicProject = { ...project, repo: "", repositoryReady: Boolean(project.repo) };
    delete publicProject.subprojects;
    delete publicProject.repositoryCreation;
    return publicProject;
  });
  const ids = new Set(projects.map(project => project.id));
  const selectedProjectId = projects.find(project => project.id === selectedId)?.id ?? projects[0]?.id ?? "";
  const conversations = source.conversations.filter(thread => thread.kind === "project" && ids.has(thread.projectId));
  const threads = new Set(conversations.map(thread => thread.id));
  return {
    ...source, viewer, projects, selectedProjectId, orders: [], conversations, clientBriefs: [],
    repositoryStatus: viewer.role === "developer" ? source.repositoryStatus ?? {} : {},
    tasks: source.tasks.filter(task => ids.has(task.projectId)),
    stages: source.stages.filter(stage => ids.has(stage.projectId)),
    commits: source.commits.filter(commit => commit.projectId === selectedProjectId),
    messages: source.messages.filter(message => threads.has(message.threadId)),
    drafts: source.drafts.filter(draft => ids.has(draft.projectId)),
    quotes: source.quotes.filter(quote => ids.has(quote.projectId)).map(quote => viewer.role === "client" ? { ...quote, baseKopecks: 0, markupKopecks: 0 } : quote),
  };
}
