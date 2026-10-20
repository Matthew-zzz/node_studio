import type { PortalSnapshot, Viewer } from "./types";

/** The API applies this projection before serializing; hidden data never reaches a client. */
export function visibleSnapshot(source: PortalSnapshot, viewer: Viewer, selectedId = ""): PortalSnapshot {
  const blank = { ...source, viewer, projects: [], tasks: [], stages: [], commits: [], conversations: [], messages: [], drafts: [], quotes: [], orders: [], selectedProjectId: "" };
  if (viewer.mustChangePassword || viewer.role === "admin") return blank;
  if (viewer.role === "curator") {
    const conversations = source.conversations.filter(thread => thread.kind === "telegram");
    const ids = new Set(conversations.map(thread => thread.id));
    return { ...blank, conversations, messages: source.messages.filter(message => ids.has(message.threadId)), orders: source.orders };
  }
  const projects = source.projects.filter(project => viewer.role === "developer" || project.clientId === viewer.id);
  const ids = new Set(projects.map(project => project.id));
  const selectedProjectId = projects.find(project => project.id === selectedId)?.id ?? projects[0]?.id ?? "";
  const conversations = source.conversations.filter(thread => thread.kind === "project" && ids.has(thread.projectId));
  const threads = new Set(conversations.map(thread => thread.id));
  return {
    ...source, viewer, projects, selectedProjectId, orders: [], conversations,
    tasks: source.tasks.filter(task => ids.has(task.projectId)),
    stages: source.stages.filter(stage => ids.has(stage.projectId)),
    commits: source.commits.filter(commit => commit.projectId === selectedProjectId),
    messages: source.messages.filter(message => threads.has(message.threadId)),
    drafts: source.drafts.filter(draft => ids.has(draft.projectId)),
    quotes: source.quotes.filter(quote => ids.has(quote.projectId)).map(quote => viewer.role === "client" ? { ...quote, baseKopecks: 0, markupKopecks: 0 } : quote),
  };
}
