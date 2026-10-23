import type { PortalConfig } from "./config.ts";
import type { Integrations } from "./integrations.ts";
import { PortalError, now } from "./store.ts";
import type { PortalStore } from "./store.ts";
import type { Conversation, PortalProject, PortalQuote, ProjectOrder } from "../src/features/portal/model/types.ts";
import { formatRubles } from "../src/features/payments/model/payment.ts";
import { escapeHtml } from "../src/features/portal/model/telegram-html.ts";

type PaymentEvent = "requested" | "succeeded";
type Channel = "mail" | "telegram";

export interface PaymentNotification {
  id: string;
  source: "order" | "quote";
  sourceId: string;
  event: PaymentEvent;
  projectId: string;
  projectName: string;
  title: string;
  email: string;
  username: string;
  telegramId: string;
  totalKopecks: number;
  test: boolean;
  createdAt: string;
  mailSentAt?: string;
  telegramSentAt?: string;
  cancelledAt?: string;
}

/** Payment changes and their two outbox jobs are saved in the caller's transaction. */
export class PaymentNotifications {
  private store: PortalStore;
  private integrations: Integrations;
  private config: PortalConfig;

  constructor(store: PortalStore, integrations: Integrations, config: PortalConfig) {
    this.store = store; this.integrations = integrations; this.config = config;
  }

  order(order: ProjectOrder, event: PaymentEvent) {
    this.enqueue({ source: "order", sourceId: order.id, event, projectId: order.projectId, projectName: order.projectName,
      title: "Основная работа", email: order.email, username: order.username, totalKopecks: order.totalKopecks });
  }

  quote(quote: PortalQuote, project: PortalProject, event: PaymentEvent) {
    const email = this.store.user(project.clientId)?.email ?? project.clientEmail;
    const link = this.store.all("briefLinks").find(link => link.projectId === project.id);
    const intake = link ? this.store.get("conversations", link.threadId) : undefined;
    const order = this.store.all("orders").find(order => order.projectId === project.id);
    const original = order ? this.store.get("paymentNotifications", `payment:order:${order.id}:requested`) : undefined;
    this.enqueue({ source: "quote", sourceId: quote.id, event, projectId: project.id, projectName: project.name,
      title: quote.title, email, username: order?.username ?? "", totalKopecks: quote.totalKopecks },
    original?.telegramId || (intake?.kind === "telegram" ? intake.telegramId : ""));
  }

  private enqueue(input: Omit<PaymentNotification, "id" | "telegramId" | "test" | "createdAt">, telegramId = "") {
    const notificationId = `payment:${input.source}:${input.sourceId}:${input.event}`;
    if (this.store.get("paymentNotifications", notificationId)) return;
    const requested = this.store.get("paymentNotifications", `payment:${input.source}:${input.sourceId}:requested`);
    const recipient = requested?.telegramId || telegramId || this.findTelegram(input.email, input.username)?.telegramId || "";
    this.store.put("paymentNotifications", { ...input, id: notificationId, telegramId: recipient, test: this.config.mockPayments, createdAt: now() });
    const payload = { notificationId, projectId: input.projectId, ...(input.source === "order" ? { orderId: input.sourceId } : {}) };
    this.store.enqueue("payment.notify.mail", payload, `${notificationId}:mail`);
    this.store.enqueue("payment.notify.telegram", payload, `${notificationId}:telegram`);
  }

  private findTelegram(email: string, username: string): Conversation | undefined {
    const threads = this.store.all("conversations").filter(thread => thread.kind === "telegram" && /^\d+$/.test(thread.telegramId));
    const normalized = username.replace(/^@/, "").toLowerCase();
    const byUsername = normalized ? threads.filter(thread => thread.username.toLowerCase() === normalized) : [];
    if (byUsername.length) return byUsername.length === 1 && (!byUsername[0]!.email || byUsername[0]!.email.toLowerCase() === email.toLowerCase()) ? byUsername[0] : undefined;
    const byEmail = threads.filter(thread => thread.email && thread.email.toLowerCase() === email.toLowerCase());
    return byEmail.length === 1 ? byEmail[0] : undefined;
  }

  async deliver(notificationId: string, channel: Channel, deliveryId: string) {
    let notification = this.store.get("paymentNotifications", notificationId);
    if (!notification || notification.cancelledAt || notification[channel === "mail" ? "mailSentAt" : "telegramSentAt"]) return;
    const source = notification.source === "order" ? this.store.get("orders", notification.sourceId) : this.store.get("quotes", notification.sourceId);
    if (!source || (notification.event === "requested" && source.status !== "pending")) {
      this.store.put("paymentNotifications", { ...notification, cancelledAt: now() }); return;
    }
    if (channel === "telegram" && !notification.telegramId) {
      const requested = this.store.get("paymentNotifications", `payment:${notification.source}:${notification.sourceId}:requested`);
      const recipient = requested?.telegramId || this.findTelegram(notification.email, notification.username)?.telegramId;
      if (!recipient) throw new PortalError(503, "Не найден однозначный Telegram-диалог клиента. Клиенту нужно написать @node_studio_bot; проверьте его username и почту.");
      notification = this.store.put("paymentNotifications", { ...notification, telegramId: recipient });
      if (requested && !requested.telegramId) this.store.put("paymentNotifications", { ...requested, telegramId: recipient });
    }
    const content = this.content(notification);
    if (channel === "mail") await this.integrations.mail(notification.email, content.text, deliveryId, content.subject);
    else await this.integrations.telegram(notification.telegramId, content.text, content.html);
    this.store.transaction(() => {
      const current = this.store.get("paymentNotifications", notificationId)!;
      this.store.put("paymentNotifications", { ...current, [channel === "mail" ? "mailSentAt" : "telegramSentAt"]: now() });
      if (channel === "telegram") {
        const thread = this.store.all("conversations").find(thread => thread.kind === "telegram" && thread.telegramId === notification.telegramId);
        if (thread) {
          this.store.put("messages", { id: notificationId, threadId: thread.id, author: "Node Studio", role: "system", text: content.text, html: content.html, createdAt: now() });
          this.store.put("conversations", { ...thread, updatedAt: now() });
        }
      }
    });
  }

  private content(notification: PaymentNotification) {
    const requested = notification.event === "requested";
    const heading = requested ? "Ссылка на оплату" : "Оплата прошла успешно";
    const project = `Проект: ${notification.projectName}`;
    const title = notification.source === "quote" ? `Пожелание: ${notification.title}` : "Основная работа по проекту";
    const amount = `${requested ? "К оплате" : "Оплачено"}: ${formatRubles(notification.totalKopecks)}`;
    const order = notification.source === "order" ? this.store.get("orders", notification.sourceId) : undefined;
    const url = requested && order ? `${this.config.origin}/checkout/#${order.checkoutToken}` : `${this.config.origin}/cabinet/`;
    const action = requested ? order ? "Перейти к оплате" : "Откройте проект и раздел «Чат», чтобы оплатить пожелание" : "Открыть личный кабинет";
    const test = notification.test ? requested ? "Тестовая оплата. Деньги не списываются." : "Тестовая оплата подтверждена. Деньги не списывались." : "";
    return {
      subject: `${heading} — Node Studio`,
      text: [heading, project, title, amount, test, `${action}: ${url}`].filter(Boolean).join("\n\n"),
      html: [`<b>${heading}</b>`, escapeHtml(project), escapeHtml(title), `<b>${escapeHtml(amount)}</b>`, test ? `<i>${test}</i>` : "", `<a href="${escapeHtml(url)}">${escapeHtml(action)}</a>`].filter(Boolean).join("\n\n"),
    };
  }
}
