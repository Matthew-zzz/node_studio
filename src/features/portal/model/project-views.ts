export const PROJECT_VIEWS = ["overview", "tasks", "history", "chat"] as const;
export type ProjectView = typeof PROJECT_VIEWS[number];

export const PROJECT_VIEW_LABELS: Record<ProjectView, string> = {
  overview: "Обзор проекта", tasks: "Задачи", history: "История", chat: "Чат",
};

export function isProjectView(view: string): view is ProjectView {
  return PROJECT_VIEWS.some(value => value === view);
}
