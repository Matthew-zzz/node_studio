import { createHash } from "node:crypto";
import { PortalError, id, now } from "./store.ts";
import type { PortalStore } from "./store.ts";
import type { Integrations } from "./integrations.ts";
import type { ChatMessage, Conversation, PortalProject, TaskDraft, Viewer, WorkItem } from "../src/features/portal/model/types.ts";
import { proposalStatus } from "../src/features/portal/model/task-planning.ts";
import type { TaskPlanningInput, TaskPlanChange } from "../src/features/portal/model/task-planning.ts";
import { projectRepositories, repositoryKey, workItemId } from "../src/features/portal/model/project-repositories.ts";
import { integer, text } from "./validation.ts";
import { withErrorContext } from "./error-context.ts";
import type { ErrorContext } from "./error-context.ts";

type Lock = <T>(key: string, action: () => Promise<T>) => Promise<T>;
const normalized = (value: string) => value.toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
function budget<T>(items: T[], limit: number): T[] {
  const result: T[] = []; let used = 0;
  for (const item of items.toReversed()) { const size = JSON.stringify(item).length; if (used + size > limit) break; result.unshift(item); used += size; }
  return result;
}

/** Chat analysis produces versioned proposals. Only an authenticated client decision writes to GitHub. */
export class TaskPlanning {
  private store: PortalStore;
  private integrations: Integrations;
  private exclusive: Lock;
  private working = false;
  constructor(store: PortalStore, integrations: Integrations, exclusive: Lock) { this.store = store; this.integrations = integrations; this.exclusive = exclusive; }

  async workNext(model: string, report: (error: unknown, context: ErrorContext) => void) {
    if (this.working) return;
    const job = this.store.db.prepare("SELECT id,payload,attempts FROM jobs WHERE kind='tasks.analyze' AND running=0 AND attempts<8 AND available<=? ORDER BY available LIMIT 1").get(Date.now()) as { id: string; payload: string; attempts: number } | undefined;
    if (!job) return;
    const payload = JSON.parse(job.payload) as { projectId: string; threadId: string; messageId: string };
    this.working = true;
    const project = this.store.get("projects", payload.projectId);
    const client = project && this.store.user(project.clientId);
    const context: ErrorContext = { operation: "tasks.analyze", source: "background", projectId: payload.projectId, projectName: project?.name ?? "", actor: client ?? null };
    this.store.db.prepare("UPDATE jobs SET running=1 WHERE id=?").run(job.id);
    try {
      await withErrorContext({ ...context, report: (error, extra) => { report(error, { ...context, ...extra }); return null; } }, () => this.analyze(payload.threadId, payload.messageId, payload.projectId, model, job.attempts + 1));
      this.store.db.prepare("DELETE FROM jobs WHERE id=?").run(job.id);
    } catch (error) {
      report(error, context);
      const next = Date.now() + Math.min(300_000, 5000 * 2 ** job.attempts);
      this.store.transaction(() => {
        this.store.db.prepare("UPDATE jobs SET running=0,attempts=attempts+1,available=? WHERE id=?").run(next, job.id);
        this.failed(payload.threadId, payload.messageId, job.attempts + 1, next);
      });
    } finally { this.working = false; }
  }

  projectFor(thread: Conversation): PortalProject | undefined {
    const projectId = thread.kind === "project" ? thread.projectId : this.store.all("briefLinks").find(link => link.threadId === thread.id)?.projectId;
    const project = projectId ? this.store.get("projects", projectId) : undefined;
    return project?.status === "active" ? project : undefined;
  }

  private messages(threadId: string) {
    return this.store.db.prepare("SELECT payload FROM records WHERE kind='messages' AND json_extract(payload,'$.threadId')=? ORDER BY json_extract(payload,'$.createdAt'),rowid").all(threadId).map(row => JSON.parse(String(row.payload)) as ChatMessage);
  }

  queue(thread: Conversation, force = false) {
    if (!this.integrations.planTasks) return;
    const project = this.projectFor(thread);
    if (!project) return;
    const last = this.messages(thread.id).filter(message => message.role === "client").at(-1);
    if (!last) return;
    const previous = this.store.get("taskAnalysis", thread.id);
    if (previous?.projectId === project.id && previous.targetMessageId === last.id && (!force || ["queued", "analyzing", "retrying"].includes(previous.status))) {
      const job = this.store.db.prepare("SELECT 1 FROM jobs WHERE kind='tasks.analyze' AND json_extract(payload,'$.threadId')=? AND json_extract(payload,'$.messageId')=? AND attempts<8 LIMIT 1").get(thread.id, last.id);
      if (previous.status === "ready" || previous.status === "failed" || job) return;
    }
    const enqueue = () => {
      this.store.db.prepare("DELETE FROM jobs WHERE kind='tasks.analyze' AND running=0 AND json_extract(payload,'$.threadId')=?").run(thread.id);
      this.store.put("taskAnalysis", { id: thread.id, threadId: thread.id, projectId: project.id, targetMessageId: last.id, ...(previous?.analyzedMessageId ? { analyzedMessageId: previous.analyzedMessageId } : {}), status: "queued", attempts: 0, updatedAt: now() });
      this.store.enqueue("tasks.analyze", { projectId: project.id, threadId: thread.id, messageId: last.id }, `tasks:${thread.id}:${last.id}${force ? `:${id()}` : ""}`);
    };
    if (this.store.db.isTransaction) enqueue(); else this.store.transaction(enqueue);
  }

  ensure(projectId: string, force = false) {
    for (const thread of this.store.all("conversations")) if (this.projectFor(thread)?.id === projectId) this.queue(thread, force);
  }

  private input(project: PortalProject, threadId: string): TaskPlanningInput {
    const drafts = this.store.all("drafts", project.id);
    const tasks = this.store.all("tasks", project.id);
    return {
      project: { name: project.name, brief: project.brief.slice(0, 16000), subprojects: projectRepositories(project).map(part => ({ id: part.id, name: part.name })) },
      messages: budget(this.messages(threadId).filter(message => message.role !== "system").slice(-80).map(message => ({ id: message.id, role: message.role, text: message.text.slice(0, 8000) })), 50000),
      proposals: budget(drafts.slice(-150).map(draft => ({ id: draft.id, title: draft.title, body: draft.body, kind: draft.kind ?? "create", status: proposalStatus(draft), taskId: draft.taskNumber ? workItemId(project.id, draft.subprojectId, draft.taskNumber) : "", subprojectId: repositoryKey(draft.subprojectId), revision: draft.revision ?? 0 })), 40000),
      tasks: budget(tasks.slice(-150).map(task => ({ id: task.id, title: task.title, body: task.body, kind: task.kind, status: task.status, subprojectId: repositoryKey(task.subprojectId) })), 40000),
    };
  }

  private signature(input: TaskPlanningInput) {
    return createHash("sha256").update(JSON.stringify({ ...input, messages: input.messages.filter(message => message.role === "client") })).digest("hex");
  }

  async analyze(threadId: string, messageId: string, projectId: string, model: string, attempts: number) {
    const thread = this.store.get("conversations", threadId);
    const project = thread && this.projectFor(thread);
    const state = this.store.get("taskAnalysis", threadId);
    if (!project || project.id !== projectId || state?.targetMessageId !== messageId || state.projectId !== projectId) return;
    const input = this.input(project, threadId);
    if (input.messages.filter(message => message.role === "client").at(-1)?.id !== messageId) return;
    const signature = this.signature(input);
    this.store.put("taskAnalysis", { ...state, status: "analyzing", attempts, updatedAt: now() });
    const changes = await this.integrations.planTasks(input, model);
    await this.exclusive(`write:${projectId}`, async () => {
      const currentThread = this.store.get("conversations", threadId);
      const currentProject = currentThread && this.projectFor(currentThread);
      const current = this.store.get("taskAnalysis", threadId);
      if (!currentProject || currentProject.id !== projectId || current?.targetMessageId !== messageId || current.projectId !== projectId) return;
      if (this.signature(this.input(currentProject, threadId)) !== signature) {
        this.store.put("taskAnalysis", { ...current, status: "ready", analyzedMessageId: messageId, updatedAt: now() });
        this.queue(currentThread!, true);
        return;
      }
      this.store.transaction(() => {
        if (!Array.isArray(changes) || changes.length > 8) throw new PortalError(502, "ИИ вернул слишком много изменений задач.");
        const touched = new Set<string>();
        for (const change of changes) this.applyChange(currentProject, threadId, input, change, touched);
        this.store.put("taskAnalysis", { ...current, status: "ready", analyzedMessageId: messageId, updatedAt: now() });
      });
    });
  }

  failed(threadId: string, messageId: string, attempts: number, nextAttemptAt: number) {
    const state = this.store.get("taskAnalysis", threadId);
    if (state?.targetMessageId !== messageId) return;
    this.store.put("taskAnalysis", { ...state, attempts, status: attempts >= 8 ? "failed" : "retrying", updatedAt: now(), nextAttemptAt: new Date(nextAttemptAt).toISOString() });
  }

  save(draft: TaskDraft, changedBy: string): TaskDraft {
    const previous = this.store.get("drafts", draft.id);
    if (previous && !this.store.get("draftRevisions", `${draft.id}:${previous.revision ?? 0}`)) this.revision(previous, "Исходная версия");
    const next = { ...draft, revision: (previous?.revision ?? 0) + 1, updatedAt: now() };
    delete next.history;
    this.store.put("drafts", next);
    this.revision(next, changedBy);
    return next;
  }

  private revision(draft: TaskDraft, changedBy: string) {
    this.store.put("draftRevisions", { id: `${draft.id}:${draft.revision ?? 0}`, draftId: draft.id, projectId: draft.projectId, revision: draft.revision ?? 0, title: draft.title, body: draft.body, status: proposalStatus(draft), kind: draft.kind ?? "create", reason: draft.reason ?? "", changedBy, createdAt: draft.updatedAt ?? draft.createdAt });
  }

  private applyChange(project: PortalProject, threadId: string, input: TaskPlanningInput, change: TaskPlanChange, touched: Set<string>) {
    const sources = Array.isArray(change.sourceMessageIds) ? input.messages.filter(message => message.role === "client" && change.sourceMessageIds.includes(message.id)) : [];
    if (!sources.length || sources.length !== new Set(change.sourceMessageIds).size || sources.length > 8) throw new PortalError(502, "ИИ не указал сообщения клиента для изменения задачи.");
    const sourceText = sources.map(message => message.text).join("\n\n").slice(0, 4000);
    const title = text(change.title, 200); const body = text(change.body, 8000); const reason = text(change.reason, 1000);
    if (!["create", "update", "withdraw", "cancel"].includes(change.operation)) throw new PortalError(502, "ИИ вернул неизвестное действие.");
    const target = change.draftId ? this.store.get("drafts", change.draftId) : undefined;
    if (change.draftId && (!target || target.projectId !== project.id)) throw new PortalError(502, "ИИ указал недоступную задачу.");
    let task = change.taskId ? this.store.get("tasks", change.taskId) : target?.taskNumber ? this.store.get("tasks", workItemId(project.id, target.subprojectId, target.taskNumber)) : undefined;
    if (change.taskId && (!task || task.projectId !== project.id)) throw new PortalError(502, "ИИ указал недоступную задачу.");
    if (change.draftId && change.taskId) throw new PortalError(502, "ИИ указал неоднозначную задачу.");
    const key = change.draftId || change.taskId || `${repositoryKey(change.subprojectId)}:${normalized(title)}`;
    if (touched.has(key)) throw new PortalError(502, "ИИ несколько раз изменил одну задачу.");
    touched.add(key);
    const provenance = { reason, sourceMessageIds: sources.map(source => source.id), sourceText };
    if (change.operation === "withdraw") {
      if (!target || proposalStatus(target) !== "pending") return;
      this.save({ ...target, ...provenance, status: "withdrawn", confirmed: false }, "ИИ по переписке");
      return;
    }
    if (target && ["rejected", "withdrawn"].includes(proposalStatus(target))) return;
    if (target && proposalStatus(target) === "pending") {
      if (change.operation !== "update") throw new PortalError(502, "ИИ неверно изменил предложение.");
      if (target.editedAt && !this.messages(threadId).some(message => sources.some(source => source.id === message.id) && message.createdAt > target.editedAt!)) return;
      if (target.kind !== "cancel" && normalized(target.title) === normalized(title) && target.body === body) return;
      this.save({ ...target, ...provenance, title, body, ...(target.kind === "cancel" ? { kind: "update" } : {}) }, "ИИ по переписке");
      return;
    }
    const drafts = this.store.all("drafts", project.id);
    if (change.operation === "create") {
      if (target || task || change.draftId || change.taskId) throw new PortalError(502, "ИИ неверно указал новую задачу.");
      const sourceId = repositoryKey(change.subprojectId);
      if (sourceId !== "main" && !projectRepositories(project).some(part => part.id === sourceId)) throw new PortalError(502, "ИИ указал неизвестный подпроект.");
      const sourceMessages = this.messages(threadId).filter(message => sources.some(source => source.id === message.id));
      if (drafts.some(draft => repositoryKey(draft.subprojectId) === sourceId && normalized(draft.title) === normalized(title) && (["pending", "approved"].includes(proposalStatus(draft)) || !sourceMessages.some(message => !draft.sourceMessageIds?.includes(message.id) && message.createdAt >= (draft.updatedAt ?? draft.createdAt)))) || this.store.all("tasks", project.id).some(item => repositoryKey(item.subprojectId) === sourceId && normalized(item.title) === normalized(title))) return;
      this.save({ id: `draft:ai:${id()}`, projectId: project.id, threadId, kind: "create", status: "pending", confirmed: false, title, body, subprojectId: sourceId, ...provenance, createdAt: now() }, "ИИ по переписке");
      return;
    }
    if (!task && target?.confirmed) {
      task = this.store.all("tasks", project.id).find(item => item.kind === "wish" && item.title === target.title && item.body === target.body && repositoryKey(item.subprojectId) === repositoryKey(target.subprojectId));
    }
    if (!task || !["update", "cancel"].includes(change.operation)) throw new PortalError(502, "ИИ не связал изменение с существующей задачей.");
    if (task.kind !== "wish") throw new PortalError(502, "Изменение общего ТЗ нужно оформить отдельной задачей.");
    const kind = change.operation;
    if (kind === "update" && task.title === title && task.body === body && task.status !== "canceled" || kind === "cancel" && task.status === "canceled") return;
    const pending = drafts.find(draft => proposalStatus(draft) === "pending" && draft.taskNumber === task!.number && repositoryKey(draft.subprojectId) === repositoryKey(task!.subprojectId));
    if (pending) {
      this.save({ ...pending, kind, title: kind === "cancel" ? task.title : title, body: kind === "cancel" ? task.body : body, ...provenance }, "ИИ по переписке");
      return;
    }
    this.save({ id: `draft:ai:${id()}`, projectId: project.id, threadId, kind, status: "pending", confirmed: false, title: kind === "cancel" ? task.title : title, body: kind === "cancel" ? task.body : body, taskNumber: task.number, subprojectId: repositoryKey(task.subprojectId), baseTitle: task.title, baseBody: task.body, ...provenance, createdAt: now() }, "ИИ по переписке");
  }

  checked(draftId: string, expected: unknown, projectId: string) {
    const draft = this.store.get("drafts", draftId);
    if (!draft || draft.projectId !== projectId) throw new PortalError(404, "Предложение не найдено.");
    if (expected === undefined && draft.revision === undefined) return draft;
    if (integer(expected, 0) !== (draft.revision ?? 0)) throw new PortalError(409, "Задача изменилась. Обновите страницу и проверьте новую версию.");
    return draft;
  }

  decide(viewer: Viewer, draftId: string, expected: unknown, projectId: string, edit?: { title: unknown; body: unknown }) {
    const draft = this.checked(draftId, expected, projectId);
    if (proposalStatus(draft) !== "pending") throw new PortalError(409, "Решение по этой версии уже принято.");
    if (edit && draft.kind === "cancel") throw new PortalError(409, "Для отмены задачи редактирование не требуется.");
    return this.store.transaction(() => this.save(edit ? { ...draft, title: text(edit.title, 200), body: text(edit.body, 8000), editedAt: now(), reason: "Формулировка изменена клиентом." } : { ...draft, confirmed: false, status: "rejected", reason: "Клиент отклонил предложение." }, viewer.name));
  }

  async approve(viewer: Viewer, draftId: string, expected: unknown, project: PortalProject) {
    const completed = this.store.get("drafts", draftId);
    if (completed?.projectId === project.id && proposalStatus(completed) === "approved") return;
    const draft = this.checked(draftId, expected, project.id);
    if (proposalStatus(draft) === "approved") return;
    if (proposalStatus(draft) !== "pending") throw new PortalError(409, "Предложение больше не ожидает согласования.");
    if (draft.revision !== undefined && this.store.all("taskAnalysis", project.id).some(state => ["queued", "analyzing", "retrying"].includes(state.status))) throw new PortalError(409, "Дождитесь анализа последних сообщений и проверьте актуальную версию задачи.");
    const part = projectRepositories(project).find(part => part.id === repositoryKey(draft.subprojectId));
    if (!part) throw new PortalError(409, "Сначала разработчик должен подключить репозиторий. Предложение сохранено.");
    let issue: WorkItem;
    if (!draft.kind || draft.kind === "create") {
      issue = await this.integrations.createIssue(part.repo, draft.title, draft.body, "wish", `draft:${draft.id}`);
      if (issue.title !== draft.title || issue.body !== draft.body) issue = await this.integrations.updateIssue(part.repo, issue.number, { title: draft.title, body: draft.body });
    } else {
      const issues = await this.integrations.issues(part.repo);
      const current = issues.find(item => item.number === draft.taskNumber && item.kind === "wish");
      if (!current) throw new PortalError(409, "Исходная задача больше недоступна. Обновите задачи.");
      const matchesBase = current.title === draft.baseTitle && current.body === draft.baseBody;
      const matchesResult = draft.kind === "update" ? current.title === draft.title && current.body === draft.body : current.status === "canceled";
      if (!matchesBase && !matchesResult) throw new PortalError(409, "Разработчик уже изменил исходную задачу. Уточните пожелание в чате для новой версии.");
      issue = await this.integrations.updateIssue(part.repo, current.number, draft.kind === "cancel" ? { status: "canceled" } : { title: draft.title, body: draft.body, included: false, status: "new" });
    }
    const latestProject = this.store.get("projects", project.id);
    if (!latestProject || latestProject.status === "archived" || latestProject.clientId !== viewer.id || !projectRepositories(latestProject).some(value => value.id === part.id && value.repo === part.repo)) throw new PortalError(409, "Проект изменился во время сохранения задачи.");
    this.store.transaction(() => {
      const workId = workItemId(project.id, part.id, issue.number);
      if (draft.kind === "update") {
        const scope = this.store.get("taskScopes", workId);
        this.store.put("taskScopes", { id: workId, projectId: project.id, revision: (scope?.revision ?? 0) + 1 });
      }
      if (draft.kind === "update" || draft.kind === "cancel") this.store.all("quotes", project.id).filter(quote => quote.taskNumber === issue.number && repositoryKey(quote.subprojectId) === part.id && quote.status === "pending").forEach(quote => this.store.put("quotes", { ...quote, status: "superseded" }));
      this.store.put("tasks", { ...issue, id: workId, projectId: project.id, subprojectId: part.id });
      this.save({ ...draft, confirmed: true, status: "approved", taskNumber: issue.number, subprojectId: part.id }, viewer.name);
    });
  }
}
