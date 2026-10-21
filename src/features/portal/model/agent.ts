export interface AgentPreferences {
  enabled: boolean;
  name: string;
  model: string;
  systemPrompt: string;
  greeting: string;
  fallbackMessage: string;
  handoffMessage: string;
  noKnowledgeMessage: string;
  formattingPrompt: string;
  historyLimit: number;
  maxOutputTokens: number;
  maxReplyChars: number;
  repliesPerHour: number;
  generation: { temperature: number | null; reasoningEffort: "default" | "none" | "minimal" | "low" | "medium" | "high" | "xhigh"; verbosity: "default" | "low" | "medium" | "high" };
  capabilities: { knowledge: boolean; collectBrief: boolean; collectContact: boolean; handoff: boolean };
  rag: { mode: "keyword" | "hybrid"; embeddingModel: string; topK: number; chunkSize: number; overlap: number; maxContextChars: number; minSimilarity: number; strict: boolean };
}

export interface AgentSettings extends AgentPreferences {
  id: string;
  version: number;
  updatedAt: string;
  updatedBy: string;
}

export interface KnowledgeDocument {
  id: string; title: string; content: string; enabled: boolean; archived: boolean;
  version: number; chunkCount: number; indexStatus: "ready" | "pending" | "error";
  updatedAt: string; updatedBy: string;
}
export type KnowledgeSummary = Omit<KnowledgeDocument, "content">;
export interface KnowledgeHit { documentId: string; title: string; text: string; score: number }
export interface AgentRevision { id: string; settings: AgentSettings; createdAt: string; author: string }
export interface AgentRun {
  id: string; model: string; status: "answered" | "handoff" | "paused" | "limited" | "error";
  durationMs: number; sourceIds: string[]; createdAt: string;
}
export interface AgentAdminState {
  settings: AgentSettings;
  documents: KnowledgeSummary[];
  revisions: { id: string; version: number; createdAt: string; author: string }[];
  runs: AgentRun[];
  connected: { ai: boolean; telegram: boolean };
}
export interface AgentTestMessage { role: "client" | "assistant"; text: string }
export interface AgentTestResult {
  reply: string; html: string; handoff: boolean; sources: KnowledgeHit[];
  warnings: string[]; durationMs: number; model: string;
}
export type AgentView = "agent" | "agent-prompts" | "agent-knowledge" | "agent-playground" | "agent-history";
export function isAgentView(value: string): value is AgentView {
  return ["agent", "agent-prompts", "agent-knowledge", "agent-playground", "agent-history"].includes(value);
}
export type AgentCommand =
  | { type: "settings.save"; settings: AgentPreferences; version: number }
  | { type: "settings.restore"; revisionId: string; version: number }
  | { type: "document.save"; document: { id?: string; version?: number; title: string; content: string; enabled: boolean } }
  | { type: "document.archive"; documentId: string; version: number; archived: boolean }
  | { type: "reindex" };

export const DEFAULT_AGENT: AgentPreferences = {
  enabled: true, name: "Node", model: "gpt-6-luna",
  systemPrompt: "Ты — помощник студии разработки Node Studio. Общайся по-русски, спокойно и по делу. Помогай разобраться в услугах и собрать пожелания к новому проекту. Задавай по одному уточняющему вопросу. Не придумывай факты, цены и сроки: используй сведения из базы знаний, а если данных нет, уточни вопрос или предложи куратора. Не обещай выполнение работ и не подтверждай оплату. При первом общении объясни, что по просьбе пользователя позовёшь человека.",
  greeting: "<b>Здравствуйте! Я — Node.</b>\n\nПомогу разобраться с проектом и собрать ваши пожелания. Расскажите, что хотите создать.\n\nЕсли нужен <b>куратор</b>, просто попросите — я его позову.",
  fallbackMessage: "Сейчас я не могу подготовить ответ. <b>Передал запрос куратору</b> — он сможет подключиться к этому диалогу.",
  handoffMessage: "<b>Запрос передан куратору.</b> Он подключится к этому диалогу.",
  noKnowledgeMessage: "В базе знаний пока нет точного ответа. Уточните вопрос или попросите позвать куратора.",
  formattingPrompt: "Оформляй reply в Telegram HTML. Выделяй короткие заголовки и важные мысли тегом <b>, уточнения — <i>. Используй абзацы с пустой строкой и короткие списки с символом •. Для кода — <code> или <pre>, для цитат — <blockquote>, для ссылок — <a href=\"https://...\">. Экранируй &, < и > в обычном тексте. Не используй Markdown, таблицы, теги div, p, ul или заголовки h1–h6. Не перегружай сообщение выделениями и эмодзи.",
  historyLimit: 30, maxOutputTokens: 2500, maxReplyChars: 3500, repliesPerHour: 40,
  generation: { temperature: null, reasoningEffort: "default", verbosity: "default" },
  capabilities: { knowledge: true, collectBrief: true, collectContact: true, handoff: true },
  rag: { mode: "keyword", embeddingModel: "text-embedding-3-small", topK: 4, chunkSize: 1400, overlap: 180, maxContextChars: 8000, minSimilarity: 0.25, strict: false },
};

export function editableAgentSettings(settings: AgentPreferences): AgentPreferences {
  return Object.fromEntries(Object.keys(DEFAULT_AGENT).map(key => [key, settings[key as keyof AgentPreferences]])) as unknown as AgentPreferences;
}
