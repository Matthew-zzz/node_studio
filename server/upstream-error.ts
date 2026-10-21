import { PortalError } from "./store.ts";
import type { ErrorProvider } from "../src/features/portal/model/errors.ts";

export interface ErrorDiagnosis {
  code: string; title: string; explanation: string; recommendation: string; documentation?: string;
  provider: ErrorProvider; upstreamStatus: number | null; upstreamPath: string; upstreamRequestId: string;
}
export class UpstreamError extends PortalError {
  readonly diagnosis: ErrorDiagnosis;
  constructor(diagnosis: ErrorDiagnosis) {
    super(502, "Внешний сервис временно недоступен. Администратор уведомлён."); this.diagnosis = diagnosis;
  }
}
export function providerFor(url: string): ErrorProvider {
  const host = new URL(url).hostname;
  return host === "api.github.com" ? "github" : host === "api.openai.com" ? "openai" : host === "api.telegram.org" ? "telegram" : host === "api.resend.com" ? "resend" : "application";
}
export function upstreamPath(url: string) {
  return new URL(url).pathname.replace(/\/bot[^/]+/g, "/bot[скрыто]").slice(0, 240);
}
export function transportError(url: string, error: unknown): UpstreamError {
  const timeout = error instanceof Error && ["TimeoutError", "AbortError"].includes(error.name);
  return new UpstreamError({ provider: providerFor(url), code: timeout ? "UPSTREAM_TIMEOUT" : "UPSTREAM_NETWORK", title: timeout ? "Внешний сервис не ответил вовремя" : "Не удалось соединиться с внешним сервисом", explanation: timeout ? "Запрос превысил допустимое время ожидания." : "Соединение завершилось до получения ответа. Возможны проблемы сети, DNS или TLS.", recommendation: "Проверьте доступность сервиса и сеть сервера, затем повторите операцию.", upstreamStatus: null, upstreamPath: upstreamPath(url), upstreamRequestId: "" });
}

/** Classify allowlisted facts only. Provider bodies may contain credentials or customer input. */
export async function responseError(url: string, response: Response): Promise<UpstreamError> {
  const provider = providerFor(url); const status = response.status;
  let data: { message?: string; description?: string; name?: string; error?: { message?: string; code?: string; type?: string } } = {};
  // Bound error bodies even when the provider or a proxy returns an unexpected stream.
  const reader = response.body?.getReader(); const parts: Uint8Array[] = []; let length = 0;
  if (reader) {
    try { while (length < 16384) { const chunk = await reader.read(); if (chunk.done) break; parts.push(chunk.value.slice(0, 16384 - length)); length += chunk.value.length; } }
    catch { /* The status alone still provides useful diagnostics. */ }
    finally { await reader.cancel().catch(() => undefined); }
    try { data = JSON.parse(Buffer.concat(parts).toString("utf8")); } catch { /* Non-JSON upstream response. */ }
  }
  const hint = [data?.message, data?.description, data?.name, data?.error?.message, data?.error?.code, data?.error?.type].filter(value => typeof value === "string").join(" ").toLowerCase();
  let code = "UPSTREAM_HTTP"; let title = "Внешний сервис отклонил запрос";
  let explanation = `Сервис вернул HTTP ${status}. Точная причина не установлена.`;
  let recommendation = "Проверьте состояние сервиса, настройки подключения и повторите запрос.";
  let documentation: string | undefined;
  if (provider === "github" && status === 403 && /account.*suspend|suspend.*account/.test(hint)) {
    code = "GITHUB_ACCOUNT_SUSPENDED"; title = "Аккаунт GitHub заблокирован";
    explanation = "GitHub сообщил о блокировке аккаунта, которому принадлежит настроенный токен. Загрузка задач, коммитов и создание проектов недоступны.";
    recommendation = "Войдите в аккаунт владельца репозиториев на GitHub и отправьте обращение о восстановлении доступа. После восстановления повторите синхронизацию.";
    documentation = "https://docs.github.com/en/site-policy/acceptable-use-policies/github-appeal-and-reinstatement";
  } else if (status === 429 || (status === 403 && (response.headers.get("x-ratelimit-remaining") === "0" || /rate limit|abuse detection|secondary rate/.test(hint)))) {
    code = "UPSTREAM_RATE_LIMIT"; title = "Исчерпан лимит запросов"; explanation = "Сервис ограничил частоту обращений."; recommendation = "Дождитесь сброса лимита и уменьшите частоту повторов. Проверьте квоты подключения.";
    if (/insufficient_quota|billing|credit/.test(hint)) { code = "OPENAI_QUOTA"; title = "Недостаточно квоты OpenAI"; explanation = "OpenAI сообщил о нехватке доступной квоты или средств."; recommendation = "Проверьте биллинг и лимиты проекта OpenAI."; }
  } else if (status === 401) {
    code = "UPSTREAM_CREDENTIALS"; title = "Сервис не принял ключ доступа"; explanation = "Ключ отсутствует, отозван, истёк или не подходит для этого сервиса."; recommendation = "Проверьте серверный ключ соответствующего сервиса и срок его действия.";
  } else if (provider === "telegram" && status === 403 && /blocked|deactivated/.test(hint)) {
    code = "TELEGRAM_CHAT_UNAVAILABLE"; title = "Бот не может написать пользователю"; explanation = "Пользователь заблокировал бота или его Telegram-аккаунт недоступен."; recommendation = "Попросите пользователя открыть бота и снова запустить диалог. Автоматические повторы не снимут блокировку.";
  } else if (provider === "telegram" && /parse entities|unsupported start tag|can't find end/.test(hint)) {
    code = "TELEGRAM_FORMAT"; title = "Telegram не принял оформление"; explanation = "Telegram отклонил HTML-разметку сообщения. Приложение пробует отправить текст без выделений."; recommendation = "Проверьте промпт оформления и используйте поддерживаемые Telegram HTML-теги.";
  } else if (provider === "resend" && /domain|verify|verification/.test(hint)) {
    code = "MAIL_DOMAIN"; title = "Не подтверждён отправитель почты"; explanation = "Почтовый сервис отклонил домен или адрес отправителя."; recommendation = "Проверьте верификацию домена и адрес отправителя в Resend.";
  } else if (status === 403) {
    code = "UPSTREAM_PERMISSIONS"; title = "Недостаточно прав во внешнем сервисе"; explanation = "Сервис запретил операцию. Возможны недостаточные разрешения токена или ограничения аккаунта."; recommendation = provider === "github" ? "Проверьте доступ токена к репозиторию, разрешения Issues и Contents, а также состояние аккаунта GitHub." : "Проверьте разрешения ключа и ограничения аккаунта в соответствующем сервисе.";
  } else if (status === 404) {
    code = "UPSTREAM_NOT_FOUND"; title = "Ресурс внешнего сервиса недоступен"; explanation = "Ресурс отсутствует либо сервис скрывает его из-за недостаточного доступа."; recommendation = "Проверьте адрес ресурса и права подключения. Для OpenAI также проверьте доступность выбранной модели.";
  } else if (status === 400 || status === 422) {
    code = "UPSTREAM_PARAMETERS"; title = "Внешний сервис не принял параметры"; explanation = "Параметры операции не соответствуют требованиям сервиса."; recommendation = "Проверьте настройки операции и совместимость параметров с выбранной моделью или сервисом.";
  } else if (status >= 500) {
    code = "UPSTREAM_UNAVAILABLE"; title = "Сбой внешнего сервиса"; explanation = "Сервис или промежуточный сервер вернул внутреннюю ошибку.";
  }
  const externalId = response.headers.get("x-github-request-id") ?? response.headers.get("x-request-id") ?? "";
  return new UpstreamError({ provider, code, title, explanation, recommendation, ...(documentation ? { documentation } : {}), upstreamStatus: status, upstreamPath: upstreamPath(url), upstreamRequestId: /^[a-zA-Z0-9:_-]{1,120}$/.test(externalId) ? externalId : "" });
}
