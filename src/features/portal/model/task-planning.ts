export type TaskProposalKind = "create" | "update" | "cancel";
export type TaskProposalStatus = "pending" | "approved" | "rejected" | "withdrawn";

export interface TaskRevision {
  readonly id: string;
  readonly draftId: string;
  readonly projectId: string;
  readonly revision: number;
  readonly title: string;
  readonly body: string;
  readonly status: TaskProposalStatus;
  readonly kind: TaskProposalKind;
  readonly reason: string;
  readonly changedBy: string;
  readonly createdAt: string;
}

export interface TaskAnalysis {
  readonly id: string;
  readonly threadId: string;
  readonly projectId: string;
  readonly targetMessageId: string;
  readonly analyzedMessageId?: string;
  readonly status: "queued" | "analyzing" | "retrying" | "failed" | "ready";
  readonly attempts: number;
  readonly updatedAt: string;
  readonly nextAttemptAt?: string;
}

export interface TaskPlanChange {
  operation: "create" | "update" | "withdraw" | "cancel";
  draftId: string;
  taskId: string;
  title: string;
  body: string;
  subprojectId: string;
  reason: string;
  sourceMessageIds: string[];
}

export interface TaskPlanningInput {
  project: { name: string; brief: string; subprojects: { id: string; name: string }[] };
  messages: { id: string; role: string; text: string }[];
  proposals: { id: string; kind: TaskProposalKind; status: TaskProposalStatus; title: string; body: string; taskId: string; subprojectId: string; revision: number }[];
  tasks: { id: string; title: string; body: string; kind: string; subprojectId: string; status: string }[];
}

export const proposalStatus = (draft: { status?: TaskProposalStatus; confirmed: boolean }): TaskProposalStatus => draft.status ?? (draft.confirmed ? "approved" : "pending");

/** Revisions and client-edited wording still require an explicit decision. */
export const proposalInEditing = (draft: { kind?: TaskProposalKind; editedAt?: string }) => Boolean(draft.editedAt || draft.kind === "update" || draft.kind === "cancel");

export function pendingTaskCount(drafts: readonly { projectId: string; subprojectId?: string; status?: TaskProposalStatus; confirmed: boolean }[], projectId: string, subprojectId?: string) {
  return drafts.filter(draft => draft.projectId === projectId && (!subprojectId || (draft.subprojectId ?? "main") === subprojectId) && proposalStatus(draft) === "pending").length;
}
