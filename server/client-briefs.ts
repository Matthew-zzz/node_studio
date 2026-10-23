import { createHash } from "node:crypto";
import { PortalError, id, now } from "./store.ts";
import type { PortalStore, Records } from "./store.ts";
import type { Integrations } from "./integrations.ts";
import type { ErrorJournal } from "./error-journal.ts";
import { withErrorContext } from "./error-context.ts";
import type { ChatMessage, Viewer } from "../src/features/portal/model/types.ts";
import type { ClientBrief, ProjectClientBrief } from "../src/features/portal/model/client-brief.ts";

export function briefSource(messages: readonly ChatMessage[]) {
  return createHash("sha256").update(JSON.stringify(messages.map(({ id, role, author, text, createdAt }) => ({ id, role, author, text, createdAt })))).digest("hex");
}

/** Every character is included. Oversized messages are split with their role and time retained. */
export function briefChunks(messages: readonly ChatMessage[]): string[] {
  const chunks: string[] = []; let chunk = "";
  for (const message of messages) {
    for (let offset = 0; offset < message.text.length;) {
      let end = Math.min(offset + 3000, message.text.length);
      if (end < message.text.length && /[\uD800-\uDBFF]/.test(message.text[end - 1]!)) end--;
      const line = JSON.stringify({ id: message.id, role: message.role, author: message.author, at: message.createdAt, offset, text: message.text.slice(offset, end) }) + "\n";
      if (chunk && chunk.length + line.length > 24_000) { chunks.push(chunk); chunk = ""; }
      chunk += line; offset = end;
    }
  }
  if (chunk) chunks.push(chunk);
  return chunks;
}

/** Independent, single-concurrency worker: long briefs never block Telegram replies or mail. */
export class ClientBriefs {
  private store: PortalStore;
  private integrations: Integrations;
  private errors: ErrorJournal;
  private working = false;
  constructor(store: PortalStore, integrations: Integrations, errors: ErrorJournal) { this.store = store; this.integrations = integrations; this.errors = errors; }

  private messages(threadId: string): ChatMessage[] {
    return this.store.db.prepare("SELECT payload FROM records WHERE kind='messages' AND json_extract(payload,'$.threadId')=? ORDER BY json_extract(payload,'$.createdAt'),rowid").all(threadId).map(row => JSON.parse(String(row.payload)) as ChatMessage);
  }

  request(viewer: Viewer, threadId: string, model: string, refresh: boolean) {
    if (viewer.role !== "developer" || viewer.mustChangePassword) throw new PortalError(403, "Итоговый бриф доступен только разработчику.");
    const thread = this.store.get("conversations", threadId);
    if (!thread || thread.kind !== "telegram") throw new PortalError(404, "Telegram-диалог не найден.");
    if (!this.integrations.ready.ai || !model) throw new PortalError(503, "Подключите ИИ для создания брифа.");
    this.store.transaction(() => {
      const previous = this.store.get("clientBriefs", threadId);
      if (previous && ["queued", "generating", "retrying"].includes(previous.status)) return;
      const messages = this.messages(threadId);
      if (!messages.some(message => message.role === "client" && message.text.trim() && !message.text.startsWith("/"))) throw new PortalError(409, "Пока нет ответов клиента для итогового брифа.");
      const sourceHash = briefSource(messages);
      if (!refresh && previous?.status === "ready" && previous.documentHash === sourceHash) return;
      const failed = previous ? this.store.get("briefRequests", previous.requestId) : undefined;
      const resume = previous?.status === "failed" && failed?.sourceHash === sourceHash && failed.model === model;
      const request = resume ? failed : this.store.put("briefRequests", { id: id(), threadId, actorId: viewer.id, sourceHash, model, inputs: briefChunks(messages), results: [], round: 0, step: 0 });
      if (previous && !resume) {
        this.store.db.prepare("DELETE FROM records WHERE kind='briefRequests' AND id=?").run(previous.requestId);
        this.store.db.prepare("DELETE FROM jobs WHERE kind='brief.generate' AND json_extract(payload,'$.requestId')=?").run(previous.requestId);
      }
      this.store.put("clientBriefs", { ...previous, id: threadId, threadId, requestId: request.id, sourceHash, messageCount: messages.length, status: "queued", stale: previous?.documentHash !== sourceHash, updatedAt: now() });
      const jobId = this.enqueue(request);
      if (resume) this.store.db.prepare("UPDATE jobs SET attempts=0,available=?,running=0 WHERE id=?").run(Date.now(), jobId);
    });
  }

  state(): ClientBrief[] {
    return this.store.all("clientBriefs").map(brief => {
      const link = this.store.get("briefLinks", brief.threadId);
      return { ...brief, ...(link ? { projectId: link.projectId } : {}), stale: Boolean(brief.document && brief.documentHash !== briefSource(this.messages(brief.threadId))) };
    });
  }

  link(viewer: Viewer, threadId: string, projectId: string) {
    if (viewer.role !== "developer" || viewer.mustChangePassword) throw new PortalError(403, "Привязать бриф к проекту может только разработчик.");
    const thread = this.store.get("conversations", threadId);
    if (!thread || thread.kind !== "telegram" || !this.store.get("clientBriefs", threadId)) throw new PortalError(404, "Бриф клиента не найден.");
    this.store.transaction(() => {
      if (!projectId) { this.store.db.prepare("DELETE FROM records WHERE kind='briefLinks' AND id=?").run(threadId); return; }
      const project = this.store.get("projects", projectId);
      if (!project || project.status === "archived") throw new PortalError(404, "Проект не найден.");
      if (this.store.all("briefLinks").some(link => link.projectId === projectId && link.threadId !== threadId)) throw new PortalError(409, "У проекта уже есть другой бриф. Сначала снимите его привязку.");
      this.store.put("briefLinks", { id: threadId, threadId, projectId, createdBy: viewer.id, updatedAt: now() });
    });
  }

  projects(): ProjectClientBrief[] {
    return this.store.all("briefLinks").flatMap(link => {
      const brief = this.store.get("clientBriefs", link.threadId);
      const project = this.store.get("projects", link.projectId);
      return brief?.document && brief.generatedAt && project && project.status !== "archived" ? [{ projectId: project.id, document: brief.document, generatedAt: brief.generatedAt }] : [];
    });
  }

  private enqueue(request: Records["briefRequests"]) {
    const jobId = `brief:${request.id}:${request.step}`;
    this.store.enqueue("brief.generate", { requestId: request.id, step: String(request.step), threadId: request.threadId, _actorId: request.actorId }, jobId);
    return jobId;
  }

  private async run(request: Records["briefRequests"]) {
    const current = this.store.get("clientBriefs", request.threadId);
    if (current?.requestId !== request.id) return;
    const actor = this.store.user(request.actorId);
    if (!actor || actor.role !== "developer" || actor.mustChangePassword) throw new PortalError(403, "Разработчик брифа больше недоступен.");
    this.store.put("clientBriefs", { ...current, status: "generating", updatedAt: now() });
    const result = await this.integrations.brief(request.inputs[request.results.length]!, request.model, request.round === 0 ? "extract" : "merge");
    this.store.transaction(() => {
      const active = this.store.get("clientBriefs", request.threadId);
      if (active?.requestId !== request.id || this.store.get("briefRequests", request.id)?.step !== request.step) return;
      const results = [...request.results, result];
      if (results.length === request.inputs.length && results.length === 1) {
        this.store.put("clientBriefs", { ...active, status: "ready", document: result, documentHash: request.sourceHash, generatedAt: now(), updatedAt: now() });
        this.store.db.prepare("DELETE FROM records WHERE kind='briefRequests' AND id=?").run(request.id);
        return;
      }
      const inputs: string[] = [];
      if (results.length === request.inputs.length) for (let i = 0; i < results.length; i += 3) inputs.push(JSON.stringify(results.slice(i, i + 3)));
      const next = this.store.put("briefRequests", { ...request, step: request.step + 1, ...(inputs.length ? { round: request.round + 1, inputs, results: [] } : { results }) });
      this.enqueue(next);
    });
  }

  async workNext(): Promise<void> {
    if (this.working) return;
    this.working = true;
    try {
      const job = this.store.db.prepare("SELECT id,payload,attempts FROM jobs WHERE kind='brief.generate' AND running=0 AND available<=? AND attempts<8 ORDER BY available,id LIMIT 1").get(Date.now());
      if (!job) return;
      this.store.db.prepare("UPDATE jobs SET running=1 WHERE id=?").run(job.id!);
      const payload = JSON.parse(String(job.payload)) as { requestId: string; step: string };
      const request = this.store.get("briefRequests", payload.requestId);
      if (!request || String(request.step) !== payload.step) { this.store.db.prepare("DELETE FROM jobs WHERE id=?").run(job.id!); return; }
      const actor = this.store.user(request.actorId);
      await withErrorContext({ actor: actor ?? null, requestId: request.id, method: "JOB", operation: "brief.generate", source: "background" }, async () => {
        try { await this.run(request); this.store.db.prepare("DELETE FROM jobs WHERE id=?").run(job.id!); }
        catch (error) {
          this.errors.capture(error);
          this.store.transaction(() => {
            const attempts = Number(job.attempts) + 1;
            this.store.db.prepare("UPDATE jobs SET running=0,attempts=?,available=? WHERE id=?").run(attempts, Date.now() + Math.min(3_600_000, 5000 * 2 ** (attempts - 1)), job.id!);
            const brief = this.store.get("clientBriefs", request.threadId);
            if (brief?.requestId === request.id) this.store.put("clientBriefs", { ...brief, status: attempts >= 8 ? "failed" : "retrying", updatedAt: now() });
          });
        }
      });
    } finally { this.working = false; }
  }
}
