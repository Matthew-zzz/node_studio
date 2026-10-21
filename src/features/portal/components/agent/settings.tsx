"use client";

import type { AgentPreferences } from "@/features/portal/model/agent";
import styles from "./agent.module.css";
import portalStyles from "@/features/portal/components/portal.module.css";

export interface AgentEditorProps { value: AgentPreferences; onChange: (value: AgentPreferences) => void; busy: boolean }

export function GeneralSettings({ value, onChange, busy }: AgentEditorProps) {
  return (
    <div className={portalStyles.stack}>
      <section className={`${portalStyles.panel} ${styles.form}`}>
        <div className={portalStyles.panelHeader}>
          <h2>ИИ-агент Telegram</h2>
          <a className={styles.link} href="https://t.me/node_studio_bot" target="_blank" rel="noopener noreferrer">Открыть бота ↗</a>
        </div>
        <label className={styles.check}>
          <input type="checkbox" checked={value.enabled} disabled={busy} onChange={event => onChange({ ...value, enabled: event.target.checked })} />
          <span>Отвечать автоматически</span>
        </label>
        <div className={styles.fields}>
          <label>
            Имя агента
            <input value={value.name} maxLength={64} disabled={busy} onChange={event => onChange({ ...value, name: event.target.value })} />
          </label>
          <label>
            Модель OpenAI
            <input value={value.model} maxLength={120} disabled={busy} onChange={event => onChange({ ...value, model: event.target.value })} />
          </label>
        </div>
        <p className={portalStyles.small}>Настройки применяются после сохранения. Доступность выбранной модели можно проверить в разделе «Проверка агента».</p>
      </section>
      <section className={`${portalStyles.panel} ${styles.form}`}>
        <h2>Функции</h2>
        {([
          ["knowledge", "Использовать базу знаний"], ["collectBrief", "Помогать собирать пожелания и ТЗ"],
          ["collectContact", "Запрашивать и сохранять почту пользователя"], ["handoff", "Звать куратора по просьбе пользователя"],
        ] as const).map(([key, label]) => (
          <label key={key} className={styles.check}>
            <input type="checkbox" checked={value.capabilities[key]} disabled={busy} onChange={event => onChange({ ...value, capabilities: { ...value.capabilities, [key]: event.target.checked } })} />
            <span>{label}</span>
          </label>
        ))}
        <p className={portalStyles.small}>Куратор может подключиться к диалогу вручную. Пока он ведёт переписку, ИИ не отвечает.</p>
      </section>
      <details className={`${portalStyles.panel} ${styles.form}`}>
        <summary>Лимиты и контекст</summary>
        <div className={styles.fields}>
          {([
            ["historyLimit", "Сообщений в контексте", 2, 80], ["maxOutputTokens", "Максимум токенов ответа", 256, 16000],
            ["maxReplyChars", "Длина ответа в символах", 100, 4000], ["repliesPerHour", "Ответов в час на один диалог", 1, 120],
          ] as const).map(([key, label, min, max]) => (
            <label key={key}>
              {label}
              <input type="number" value={value[key]} min={min} max={max} disabled={busy} onChange={event => onChange({ ...value, [key]: Number(event.target.value) })} />
            </label>
          ))}
          <label>
            Температура
            <input type="number" min={0} max={2} step={0.1} placeholder="По умолчанию модели" value={value.generation.temperature ?? ""} disabled={busy} onChange={event => onChange({ ...value, generation: { ...value.generation, temperature: event.target.value === "" ? null : Number(event.target.value) } })} />
          </label>
          <label>
            Усилие рассуждения
            <select aria-label="Усилие рассуждения" value={value.generation.reasoningEffort} disabled={busy} onChange={event => onChange({ ...value, generation: { ...value.generation, reasoningEffort: event.target.value as AgentPreferences["generation"]["reasoningEffort"] } })}>
              <option value="default">По умолчанию модели</option>
              {["none", "minimal", "low", "medium", "high", "xhigh"].map(item => <option value={item} key={item}>{item}</option>)}
            </select>
          </label>
          <label>
            Подробность ответа
            <select aria-label="Подробность ответа" value={value.generation.verbosity} disabled={busy} onChange={event => onChange({ ...value, generation: { ...value.generation, verbosity: event.target.value as AgentPreferences["generation"]["verbosity"] } })}>
              <option value="default">По умолчанию модели</option>
              <option value="low">Кратко</option>
              <option value="medium">Умеренно</option>
              <option value="high">Подробно</option>
            </select>
          </label>
        </div>
        <p className={portalStyles.small}>Поддержка дополнительных параметров зависит от модели. «По умолчанию» оставляет выбор за ней.</p>
      </details>
    </div>
  );
}

export function PromptSettings({ value, onChange, busy }: AgentEditorProps) {
  return (
    <div className={portalStyles.stack}>
      {([
        ["systemPrompt", "Системный промпт", 20000, 12], ["formattingPrompt", "Оформление Telegram", 8000, 7],
        ["greeting", "Приветствие", 12000, 5], ["handoffMessage", "Передача куратору", 8000, 4],
        ["fallbackMessage", "Ошибка или пауза агента", 8000, 4], ["noKnowledgeMessage", "Ответ не найден в базе знаний", 8000, 4],
      ] as const).map(([key, label, maxLength, rows], index) => (
        <details key={key} className={`${portalStyles.panel} ${styles.form}`} open={index === 0}>
          <summary>{label}</summary>
          <label>
            {label}
            <textarea aria-label={label} value={value[key]} rows={rows} maxLength={maxLength} disabled={busy} onChange={event => onChange({ ...value, [key]: event.target.value })} />
          </label>
          {key !== "systemPrompt" && <p className={portalStyles.small}>Для выделения текста: &lt;b&gt;важное&lt;/b&gt;, &lt;i&gt;уточнение&lt;/i&gt;, &lt;code&gt;код&lt;/code&gt;. Абзацы разделяются пустой строкой.</p>}
        </details>
      ))}
    </div>
  );
}

export function RagSettings({ value, onChange, busy }: AgentEditorProps) {
  const set = (patch: Partial<AgentPreferences["rag"]>) => onChange({ ...value, rag: { ...value.rag, ...patch } });
  return (
    <details className={`${portalStyles.panel} ${styles.form}`}>
      <summary>Настройки RAG</summary>
      <div className={styles.fields}>
        <label>
          Поиск по базе знаний
          <select aria-label="Поиск по базе знаний" value={value.rag.mode} disabled={busy} onChange={event => set({ mode: event.target.value as "keyword" | "hybrid" })}>
            <option value="keyword">По словам · локально</option>
            <option value="hybrid">Гибридный · слова и смысл</option>
          </select>
        </label>
        <label>
          Модель embeddings
          <input value={value.rag.embeddingModel} maxLength={120} disabled={busy || value.rag.mode !== "hybrid"} onChange={event => set({ embeddingModel: event.target.value })} />
        </label>
        {([
          ["topK", "Фрагментов на ответ", 1, 10, 1], ["chunkSize", "Размер фрагмента", 400, 2400, 1],
          ["overlap", "Перекрытие фрагментов", 0, 600, 1], ["maxContextChars", "Лимит контекста базы знаний", 1000, 24000, 1],
          ["minSimilarity", "Минимальное смысловое сходство", 0, 1, 0.05],
        ] as const).map(([key, label, min, max, step]) => (
          <label key={key}>
            {label}
            <input type="number" value={value.rag[key]} min={min} max={max} step={step} disabled={busy} onChange={event => set({ [key]: Number(event.target.value) })} />
          </label>
        ))}
      </div>
      <label className={styles.check}>
        <input type="checkbox" checked={value.rag.strict} disabled={busy} onChange={event => set({ strict: event.target.checked })} />
        <span>Отвечать только при наличии подходящих материалов</span>
      </label>
      <p className={portalStyles.small}>Гибридный поиск строит смысловой индекс через OpenAI. Пока он не готов, бот использует поиск по словам. Изменение размера фрагментов или модели обновляет индекс после сохранения.</p>
    </details>
  );
}
