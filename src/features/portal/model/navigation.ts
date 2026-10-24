import type { IconName } from "@/components/ui/icon";
import type { AgentView } from "./agent";
import { PROJECT_VIEW_LABELS } from "./project-views";
import type { ProjectView } from "./project-views";
import type { Role } from "./types";

export type PortalView = ProjectView | AgentView | "errors" | "queue" | "inbox" | "orders" | "settings" | "staff";
export const PORTAL_VIEWS: Record<PortalView, { label: string; icon: IconName }> = {
  errors: { label: "Ошибки", icon: "document" },
  staff: { label: "Разработчики", icon: "people" },
  agent: { label: "ИИ-агент", icon: "bot" }, "agent-prompts": { label: "Промпты", icon: "document" }, "agent-knowledge": { label: "База знаний", icon: "database" }, "agent-playground": { label: "Проверка агента", icon: "spark" }, "agent-history": { label: "История настроек", icon: "clock" },
  overview: { label: PROJECT_VIEW_LABELS.overview, icon: "service" }, tasks: { label: PROJECT_VIEW_LABELS.tasks, icon: "document" }, history: { label: PROJECT_VIEW_LABELS.history, icon: "code" }, chat: { label: PROJECT_VIEW_LABELS.chat, icon: "bot" },
  queue: { label: "Общая очередь", icon: "flow" }, inbox: { label: "Диалоги", icon: "telegram" }, orders: { label: "Проекты и оплаты", icon: "plus" }, settings: { label: "Настройки", icon: "people" },
};
export const ROLE_VIEWS: Record<Role, readonly PortalView[]> = {
  client: ["overview", "tasks", "history", "chat", "settings"],
  developer: ["inbox", "queue", "orders", "overview", "tasks", "history", "chat", "settings"],
  admin: ["agent", "agent-prompts", "agent-knowledge", "agent-playground", "agent-history", "errors", "staff", "settings"],
};
