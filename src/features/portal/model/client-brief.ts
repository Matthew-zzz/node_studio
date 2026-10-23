export const BRIEF_SECTIONS = [
  { key: "goal", label: "Цель проекта", limit: 1000 },
  { key: "audience", label: "Пользователи и сценарии", limit: 1000 },
  { key: "features", label: "Функциональные требования", limit: 4000 },
  { key: "design", label: "Дизайн и платформы", limit: 1000 },
  { key: "integrations", label: "Интеграции и данные", limit: 1000 },
  { key: "constraints", label: "Ограничения, бюджет и сроки", limit: 1600 },
  { key: "acceptance", label: "Критерии готовности", limit: 1600 },
  { key: "questions", label: "Открытые вопросы и противоречия", limit: 2000 },
] as const;
export type BriefDocument = { readonly name: string } & { readonly [K in typeof BRIEF_SECTIONS[number]["key"]]: string };
export interface ClientBrief {
  readonly id: string;
  readonly threadId: string;
  readonly requestId: string;
  readonly status: "queued" | "generating" | "retrying" | "ready" | "failed";
  readonly messageCount: number;
  readonly sourceHash: string;
  readonly stale: boolean;
  readonly document?: BriefDocument;
  readonly documentHash?: string;
  readonly generatedAt?: string;
  readonly updatedAt: string;
}
export function briefText(document: BriefDocument): string {
  return [`Техническое задание: ${document.name}`, ...BRIEF_SECTIONS.map(section => `${section.label}\n${document[section.key]}`)].join("\n\n");
}
