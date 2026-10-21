export type Role = "client" | "developer" | "curator" | "admin";
export type WorkStatus = "new" | "in_progress" | "done" | "canceled";

export interface Viewer {
  readonly id: string;
  readonly name: string;
  readonly email: string;
  readonly role: Role;
  readonly mustChangePassword: boolean;
}

export interface PortalProject {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly clientId: string;
  readonly clientName: string;
  readonly clientEmail: string;
  readonly repo: string;
  readonly brief: string;
  readonly status: "active" | "provisioning";
  readonly developerId?: string;
  readonly acceptedAt?: string;
  readonly createdAt: string;
}

export interface WorkItem {
  readonly id: string;
  readonly projectId: string;
  readonly number: number;
  readonly title: string;
  readonly body: string;
  readonly status: WorkStatus;
  readonly kind: "initial" | "wish" | "stage";
  readonly included: boolean;
  readonly updatedAt: string;
}

export interface PortalCommit {
  readonly sha: string;
  readonly projectId: string;
  readonly title: string;
  readonly author: string;
  readonly createdAt: string;
}

export interface Conversation {
  readonly id: string;
  readonly kind: "project" | "telegram";
  readonly projectId: string;
  readonly name: string;
  readonly username: string;
  readonly email: string;
  readonly telegramId: string;
  readonly ownerId: string | null;
  readonly ownerName: string | null;
  readonly handoffRequested: boolean;
  readonly updatedAt: string;
  readonly revision?: number;
}

export interface ChatMessage {
  readonly id: string;
  readonly threadId: string;
  readonly author: string;
  readonly role: Role | "assistant" | "system";
  readonly text: string;
  readonly createdAt: string;
}

export interface TaskDraft {
  readonly id: string;
  readonly threadId: string;
  readonly projectId: string;
  readonly title: string;
  readonly body: string;
  readonly confirmed: boolean;
  readonly createdAt: string;
}

export interface PortalQuote {
  readonly id: string;
  readonly projectId: string;
  readonly taskNumber: number;
  readonly title: string;
  readonly baseKopecks: number;
  readonly markupKopecks: number;
  readonly totalKopecks: number;
  readonly status: "pending" | "paid" | "superseded";
  readonly createdAt: string;
}

export interface ProjectOrder {
  readonly id: string;
  readonly projectName: string;
  readonly clientName: string;
  readonly email: string;
  readonly username: string;
  readonly brief: string;
  readonly totalKopecks: number;
  readonly status: "pending" | "paid" | "provisioning" | "ready" | "needs_setup";
  readonly checkoutToken: string;
  readonly projectId: string;
  readonly createdAt: string;
}

export interface PortalSnapshot {
  readonly viewer: Viewer | null;
  readonly profiles: readonly Viewer[];
  readonly csrf: string;
  readonly selectedProjectId: string;
  readonly projects: readonly PortalProject[];
  readonly tasks: readonly WorkItem[];
  readonly stages: readonly WorkItem[];
  readonly commits: readonly PortalCommit[];
  readonly conversations: readonly Conversation[];
  readonly messages: readonly ChatMessage[];
  readonly drafts: readonly TaskDraft[];
  readonly quotes: readonly PortalQuote[];
  readonly orders: readonly ProjectOrder[];
  readonly hasMoreCommits: boolean;
  readonly syncedAt: string | null;
  readonly syncError: string | null;
  readonly integrations: {
    readonly github: boolean;
    readonly telegram: boolean;
    readonly ai: boolean;
    readonly mail: boolean;
    readonly payments: "mock" | "disabled";
  };
}

export interface NewOrder {
  readonly projectName: string;
  readonly clientName: string;
  readonly email: string;
  readonly username: string;
  readonly brief: string;
  readonly totalKopecks: number;
}

export const EMPTY_SNAPSHOT: PortalSnapshot = {
  viewer: null, profiles: [], csrf: "", selectedProjectId: "", projects: [], tasks: [], stages: [], commits: [],
  conversations: [], messages: [], drafts: [], quotes: [], orders: [], hasMoreCommits: false, syncedAt: null,
  syncError: null, integrations: { github: false, telegram: false, ai: false, mail: false, payments: "disabled" },
};

export type PortalAction =
  | { type: "project.accept"; projectId: string }
  | { type: "message"; threadId: string; text: string }
  | { type: "takeover" | "leave"; threadId: string }
  | { type: "draft.confirm"; draftId: string }
  | { type: "stage.save"; projectId: string; number: number; title: string; body: string; status: WorkStatus }
  | { type: "task.status"; projectId: string; number: number; status: WorkStatus }
  | { type: "task.include"; projectId: string; number: number }
  | { type: "quote.create"; projectId: string; number: number; baseKopecks: number }
  | { type: "quote.pay"; quoteId: string; outcome: "succeeded" | "failed" }
  | { type: "order.create"; order: NewOrder }
  | { type: "order.provision"; orderId: string };

export interface Checkout {
  readonly projectName: string;
  readonly totalKopecks: number;
  readonly status: ProjectOrder["status"];
  readonly provider: "mock" | "disabled";
}

export const ROLE_LABELS: Record<Role, string> = {
  client: "Клиент", developer: "Разработчик", curator: "Куратор", admin: "Администратор",
};

export const STATUS_LABELS: Record<WorkStatus, string> = {
  new: "Не начато", in_progress: "В работе", done: "Завершено", canceled: "Закрыто",
};
