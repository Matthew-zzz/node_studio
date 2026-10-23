import { PortalError, id, now } from "../store.ts";
import { reportHandledError } from "../error-context.ts";
import type { PortalStore } from "../store.ts";
import { integer, object, text } from "../validation.ts";
import type { Integrations } from "../integrations.ts";
import type { PortalConfig } from "../config.ts";
import type { ChatMessage, Viewer } from "../../src/features/portal/model/types.ts";
import { DEFAULT_AGENT } from "../../src/features/portal/model/agent.ts";
import type { AgentPreferences, AgentSettings, AgentAdminState, AgentTestResult, KnowledgeDocument, KnowledgeHit } from "../../src/features/portal/model/agent.ts";
import { formatTelegramHtml } from "../../src/features/portal/model/telegram-html.ts";
import { cosine, keywordScores, splitKnowledge } from "./knowledge.ts";
import type { KnowledgeChunk } from "./knowledge.ts";
import { developerTerminology } from "../developer-workflow-migration.ts";

function boolean(value: unknown): boolean {
  if (typeof value !== "boolean") throw new PortalError(400, "Проверьте переключатели настроек.");
  return value;
}
function model(value: unknown): string {
  const name = text(value, 120);
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._:/-]*$/.test(name)) throw new PortalError(400, "Проверьте название модели.");
  return name;
}
export function validateAgentPreferences(input: unknown): AgentPreferences {
  const value = object(input); const capabilities = object(value.capabilities); const rag = object(value.rag);
  for (const key of ["greeting", "fallbackMessage", "handoffMessage", "noKnowledgeMessage"] as const) {
    const template = text(value[key], key === "greeting" ? 12000 : 8000);
    if (!formatTelegramHtml(template).text.trim()) throw new PortalError(400, "Сообщения бота должны содержать видимый текст, а не только HTML-теги.");
  }
  const generation = object(value.generation);
  if (generation.temperature !== null && (typeof generation.temperature !== "number" || !Number.isFinite(generation.temperature) || generation.temperature < 0 || generation.temperature > 2)) throw new PortalError(400, "Температура должна быть от 0 до 2 или пустой.");
  if (!["default", "none", "minimal", "low", "medium", "high", "xhigh"].includes(String(generation.reasoningEffort)) || !["default", "low", "medium", "high"].includes(String(generation.verbosity))) throw new PortalError(400, "Проверьте параметры генерации.");
  if (!["keyword", "hybrid"].includes(String(rag.mode))) throw new PortalError(400, "Выберите режим поиска в базе знаний.");
  const chunkSize = integer(rag.chunkSize, 400, 2400); const overlap = integer(rag.overlap, 0, 600);
  if (overlap >= chunkSize / 2) throw new PortalError(400, "Перекрытие должно быть меньше половины фрагмента.");
  const minSimilarity = Number(rag.minSimilarity);
  if (typeof rag.minSimilarity !== "number" || !Number.isFinite(minSimilarity) || minSimilarity < 0 || minSimilarity > 1) throw new PortalError(400, "Порог сходства должен быть от 0 до 1.");
  return {
    enabled: boolean(value.enabled), name: text(value.name, 64), model: model(value.model),
    systemPrompt: developerTerminology(text(value.systemPrompt, 20000)), greeting: developerTerminology(text(value.greeting, 12000)),
    fallbackMessage: developerTerminology(text(value.fallbackMessage, 8000)), handoffMessage: developerTerminology(text(value.handoffMessage, 8000)),
    noKnowledgeMessage: developerTerminology(text(value.noKnowledgeMessage, 8000)), formattingPrompt: text(value.formattingPrompt, 8000),
    historyLimit: integer(value.historyLimit, 2, 80), maxOutputTokens: integer(value.maxOutputTokens, 256, 16000),
    maxReplyChars: integer(value.maxReplyChars, 100, 4000), repliesPerHour: integer(value.repliesPerHour, 1, 120),
    generation: { temperature: generation.temperature as number | null, reasoningEffort: generation.reasoningEffort as AgentPreferences["generation"]["reasoningEffort"], verbosity: generation.verbosity as AgentPreferences["generation"]["verbosity"] },
    capabilities: { knowledge: boolean(capabilities.knowledge), collectBrief: boolean(capabilities.collectBrief), collectContact: boolean(capabilities.collectContact), handoff: boolean(capabilities.handoff) },
    rag: { mode: rag.mode as "keyword" | "hybrid", embeddingModel: model(rag.embeddingModel), topK: integer(rag.topK, 1, 10), chunkSize, overlap, maxContextChars: integer(rag.maxContextChars, 1000, 24000), minSimilarity, strict: boolean(rag.strict) },
  };
}

export class TelegramAgent {
  private store: PortalStore;
  private integrations: Integrations;
  private config: PortalConfig;
  constructor(store: PortalStore, integrations: Integrations, config: PortalConfig) {
    this.store = store; this.integrations = integrations; this.config = config;
  }

  settings(): AgentSettings {
    return this.store.get("agentSettings", "telegram") ?? { ...structuredClone(DEFAULT_AGENT), model: this.config.aiModel || DEFAULT_AGENT.model, id: "telegram", version: 0, updatedAt: "", updatedBy: "" };
  }

  fingerprint(): string {
    return `${this.settings().version}:${this.store.all("agentDocuments").map(document => `${document.id}:${document.version}`).join(";")}`;
  }

  state(): AgentAdminState {
    return {
      settings: this.settings(),
      documents: this.store.all("agentDocuments").map(({ id, title, enabled, archived, version, chunkCount, indexStatus, updatedAt, updatedBy }) => ({ id, title, enabled, archived, version, chunkCount, indexStatus, updatedAt, updatedBy })).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
      revisions: this.store.all("agentRevisions").reverse().slice(0, 30).map(revision => ({ id: revision.id, version: revision.settings.version, createdAt: revision.createdAt, author: revision.author })),
      runs: this.store.all("agentRuns").reverse().slice(0, 30),
      connected: { ai: this.integrations.ready.ai, telegram: this.integrations.ready.telegram },
    };
  }

  saveSettings(input: unknown, expected: unknown, viewer: Viewer): AgentAdminState {
    const preferences = validateAgentPreferences(input);
    const current = this.settings();
    if (integer(expected, 0) !== current.version) throw new PortalError(409, "Настройки изменились в другой вкладке. Обновите их перед сохранением.");
    const next: AgentSettings = { ...preferences, id: "telegram", version: current.version + 1, updatedAt: now(), updatedBy: viewer.name };
    this.store.transaction(() => {
      if (!this.store.all("agentRevisions").length) this.store.put("agentRevisions", { id: id(), settings: current, createdAt: now(), author: "Исходные настройки" });
      this.store.put("agentSettings", next);
      this.store.put("agentRevisions", { id: id(), settings: next, createdAt: next.updatedAt, author: viewer.name });
    });
    if (current.rag.chunkSize !== next.rag.chunkSize || current.rag.overlap !== next.rag.overlap || current.rag.mode !== next.rag.mode || current.rag.embeddingModel !== next.rag.embeddingModel) this.reindex();
    return this.state();
  }

  restore(revisionId: unknown, expected: unknown, viewer: Viewer): AgentAdminState {
    const revision = this.store.get("agentRevisions", text(revisionId, 100));
    if (!revision) throw new PortalError(404, "Версия настроек не найдена.");
    return this.saveSettings(revision.settings, expected, viewer);
  }

  document(documentId: unknown): KnowledgeDocument {
    const document = this.store.get("agentDocuments", text(documentId, 100));
    if (!document) throw new PortalError(404, "Материал не найден.");
    return document;
  }

  saveDocument(input: unknown, viewer: Viewer): AgentAdminState {
    const value = object(input);
    const current = value.id ? this.document(value.id) : undefined;
    if (current && integer(value.version, 1) !== current.version) throw new PortalError(409, "Материал изменён в другой вкладке. Откройте его заново.");
    const content = text(value.content, 50000); const title = text(value.title, 200);
    const others = this.store.all("agentDocuments").filter(document => document.id !== current?.id);
    if ((!current && others.length >= 200) || others.reduce((sum, document) => sum + document.content.length, 0) + content.length > 2_000_000) throw new PortalError(400, "База знаний заполнена: до 200 материалов и 2 млн символов.");
    const document: KnowledgeDocument = { id: current?.id ?? id(), title, content, enabled: boolean(value.enabled), archived: false, version: (current?.version ?? 0) + 1, chunkCount: 0, indexStatus: "ready", updatedAt: now(), updatedBy: viewer.name };
    this.indexLocal(document);
    return this.state();
  }

  archiveDocument(documentId: unknown, version: unknown, archived: unknown, viewer: Viewer): AgentAdminState {
    const document = this.document(documentId);
    if (integer(version, 1) !== document.version) throw new PortalError(409, "Материал изменился. Откройте его заново.");
    this.indexLocal({ ...document, archived: boolean(archived), version: document.version + 1, updatedAt: now(), updatedBy: viewer.name });
    return this.state();
  }

  private indexLocal(document: KnowledgeDocument): void {
    const settings = this.settings();
    const chunks = splitKnowledge(document.content, settings.rag.chunkSize, settings.rag.overlap);
    const semantic = document.enabled && !document.archived && settings.rag.mode === "hybrid";
    this.store.transaction(() => {
      this.store.db.prepare("DELETE FROM agent_chunks WHERE document_id=?").run(document.id);
      for (let index = 0; index < chunks.length; index++) this.store.db.prepare("INSERT INTO agent_chunks(id,document_id,ordinal,content) VALUES(?,?,?,?)").run(`${document.id}:${index}`, document.id, index, chunks[index]!);
      this.store.put("agentDocuments", { ...document, chunkCount: chunks.length, indexStatus: semantic ? "pending" : "ready" });
      if (semantic) this.store.enqueue("agent.index", { documentId: document.id }, `agent-index:${document.id}:${document.version}:${settings.version}:${id()}`);
    });
  }

  reindex(): AgentAdminState {
    for (const document of this.store.all("agentDocuments")) this.indexLocal(document);
    return this.state();
  }

  async index(documentId: string): Promise<void> {
    const document = this.store.get("agentDocuments", documentId); const settings = this.settings();
    if (!document || !document.enabled || document.archived || settings.rag.mode !== "hybrid") return;
    const chunks = this.chunks(documentId);
    const compatible = () => {
      const current = this.settings();
      return this.store.get("agentDocuments", documentId)?.version === document.version && current.rag.mode === "hybrid" && current.rag.embeddingModel === settings.rag.embeddingModel && current.rag.chunkSize === settings.rag.chunkSize && current.rag.overlap === settings.rag.overlap;
    };
    try {
      const vectors: number[][] = [];
      for (let offset = 0; offset < chunks.length; offset += 32) vectors.push(...await this.integrations.embed(chunks.slice(offset, offset + 32).map(chunk => chunk.content), settings.rag.embeddingModel));
      if (!compatible()) return;
      this.store.transaction(() => {
        chunks.forEach((chunk, index) => this.store.db.prepare("UPDATE agent_chunks SET embedding=?,embedding_model=? WHERE id=?").run(JSON.stringify(vectors[index]), settings.rag.embeddingModel, chunk.id));
        this.store.put("agentDocuments", { ...document, indexStatus: "ready" });
      });
    } catch (error) {
      const latest = this.store.get("agentDocuments", documentId);
      if (latest && compatible()) this.store.put("agentDocuments", { ...latest, indexStatus: "error" });
      throw error;
    }
  }

  private chunks(documentId?: string): KnowledgeChunk[] {
    const statement = this.store.db.prepare(`SELECT c.*,json_extract(r.payload,'$.title') AS title FROM agent_chunks c JOIN records r ON r.kind='agentDocuments' AND r.id=c.document_id WHERE json_extract(r.payload,'$.enabled')=1 AND json_extract(r.payload,'$.archived')=0${documentId ? " AND c.document_id=?" : ""} ORDER BY c.document_id,c.ordinal`);
    return (documentId ? statement.all(documentId) : statement.all()) as unknown as KnowledgeChunk[];
  }

  async retrieve(query: string, settings: AgentPreferences): Promise<{ sources: KnowledgeHit[]; warnings: string[] }> {
    if (!settings.capabilities.knowledge) return { sources: [], warnings: [] };
    const chunks = this.chunks(); const scores = keywordScores(chunks, query); const warnings: string[] = [];
    if (settings.rag.mode === "hybrid" && chunks.some(chunk => chunk.embedding && chunk.embedding_model === settings.rag.embeddingModel)) {
      try {
        const [vector] = await this.integrations.embed([query.slice(0, 8000)], settings.rag.embeddingModel);
        for (const chunk of chunks) {
          if (!chunk.embedding || chunk.embedding_model !== settings.rag.embeddingModel) continue;
          const similarity = cosine(vector!, JSON.parse(chunk.embedding) as number[]);
          if (similarity >= settings.rag.minSimilarity) scores.set(chunk.id, (scores.get(chunk.id) ?? 0) * 0.35 + similarity * 0.65);
        }
      } catch (error) { reportHandledError(error, { operation: "agent.rag", source: "integration" }); warnings.push("Смысловой поиск недоступен; использован поиск по словам."); }
    } else if (settings.rag.mode === "hybrid" && chunks.length) warnings.push("Смысловой индекс ещё не готов; использован поиск по словам.");
    let remaining = settings.rag.maxContextChars;
    const sources: KnowledgeHit[] = [];
    for (const chunk of chunks.filter(chunk => (scores.get(chunk.id) ?? 0) > 0).sort((a, b) => scores.get(b.id)! - scores.get(a.id)!).slice(0, settings.rag.topK)) {
      if (remaining < 100) break;
      const content = chunk.content.slice(0, remaining); remaining -= content.length;
      sources.push({ documentId: chunk.document_id, title: chunk.title, text: content, score: Math.round(scores.get(chunk.id)! * 1000) / 1000 });
    }
    return { sources, warnings };
  }

  async generate(messages: ChatMessage[], settings: AgentPreferences): Promise<AgentTestResult> {
    const started = Date.now();
    const query = messages.filter(message => message.role === "client").slice(-2).reverse().map(message => message.text).join("\n");
    const { sources, warnings } = settings.enabled ? await this.retrieve(query, settings) : { sources: [], warnings: [] };
    const result = !settings.enabled ? { reply: settings.fallbackMessage, handoff: true }
      : settings.capabilities.knowledge && settings.rag.strict && !sources.length ? { reply: settings.noKnowledgeMessage, handoff: false }
        : await this.integrations.assistant(messages, "telegram", { preferences: settings, knowledge: sources });
    const formatted = formatTelegramHtml(result.reply, settings.maxReplyChars);
    if (!formatted.text.trim()) throw new PortalError(502, "ИИ вернул пустой ответ. Проверьте настройки и повторите попытку.");
    return { reply: formatted.text, html: formatted.html, handoff: settings.capabilities.handoff && result.handoff, sources, warnings, durationMs: Date.now() - started, model: settings.model };
  }

  async preview(input: unknown): Promise<AgentTestResult> {
    const value = object(input); const settings = validateAgentPreferences(value.settings);
    if (!Array.isArray(value.messages) || !value.messages.length || value.messages.length > 20) throw new PortalError(400, "В тестовом диалоге должно быть от 1 до 20 сообщений.");
    const messages = value.messages.map((item, index) => {
      const message = object(item);
      if (!["client", "assistant"].includes(String(message.role))) throw new PortalError(400, "Некорректная роль тестового сообщения.");
      return { id: `preview:${index}`, threadId: "preview", author: message.role === "client" ? "Администратор" : settings.name, role: message.role as "client" | "assistant", text: text(message.text, 8000), createdAt: now() };
    });
    if (messages.reduce((sum, message) => sum + message.text.length, 0) > 40000) throw new PortalError(400, "Сократите тестовый диалог до 40 000 символов.");
    return this.generate(messages, settings);
  }
}
