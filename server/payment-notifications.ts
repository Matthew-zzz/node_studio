import type { PortalConfig } from "./config.ts";
import type { Integrations } from "./integrations.ts";
import { PortalError, now } from "./store.ts";
import type { PortalStore } from "./store.ts";
import type { Conversation, PortalProject, PortalQuote, ProjectOrder } from "../src/features/portal/model/types.ts";
import { formatRubles } from "../src/features/payments/model/payment.ts";
import { escapeHtml } from "../src/features/portal/model/telegram-html.ts";
import type { Viewer } from "../src/features/portal/model/types.ts";
import type { PaymentChannel, ResendPaymentAction } from "../src/features/portal/model/payment-delivery.ts";
import { updateErrorContext } from "./error-context.ts";
import { paymentDeliveryState } from "./payment-delivery-state.ts";

type PaymentEvent = "requested" | "succeeded";
type Channel = PaymentChannel;
const CHANNELS: readonly Channel[] = ["mail", "telegram"];

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
  mailCancelledAt?: string;
  telegramCancelledAt?: string;
  channels?: readonly Channel[];
  requestId?: string;
  requestedBy?: string;
  sequence?: number;
}

/** Payment changes and their two outbox jobs are saved in the caller's transaction. */
export class PaymentNotifications {
  private store: PortalStore;
  private integrations: Integrations;
  private config: PortalConfig;

  constructor(store: PortalStore, integrations: Integrations, config: PortalConfig) {
    this.store = store; this.integrations = integrations; this.config = config;
  }

  order(order: ProjectOrder, event: PaymentEvent, resend?: ResendPaymentAction, requestedBy?: string) {
    this.enqueue({ source: "order", sourceId: order.id, event, projectId: order.projectId, projectName: order.projectName,
      title: "Основная работа", email: order.email, username: order.username, totalKopecks: order.totalKopecks }, "", resend, requestedBy);
  }

  quote(quote: PortalQuote, project: PortalProject, event: PaymentEvent, resend?: ResendPaymentAction, requestedBy?: string) {
    const email = this.store.user(project.clientId)?.email ?? project.clientEmail;
    const link = this.store.all("briefLinks").find(link => link.projectId === project.id);
    const intake = link ? this.store.get("conversations", link.threadId) : undefined;
    const order = this.store.all("orders").find(order => order.projectId === project.id);
    const original = order ? this.store.get("paymentNotifications", `payment:order:${order.id}:requested`) : undefined;
    this.enqueue({ source: "quote", sourceId: quote.id, event, projectId: project.id, projectName: project.name,
      title: quote.title, email, username: order?.username ?? "", totalKopecks: quote.totalKopecks },
    original?.telegramId || (intake?.kind === "telegram" ? intake.telegramId : ""), resend, requestedBy);
  }

  private enqueue(input: Pick<PaymentNotification, "source" | "sourceId" | "event" | "projectId" | "projectName" | "title" | "email" | "username" | "totalKopecks">, telegramId = "", resend?: ResendPaymentAction, requestedBy?: string) {
    const notificationId = `payment:${input.source}:${input.sourceId}:${input.event}${resend ? `:resend:${resend.requestId}` : ""}`;
    if (this.store.get("paymentNotifications", notificationId)) return;
    const requested = this.store.get("paymentNotifications", `payment:${input.source}:${input.sourceId}:requested`);
    const pinned = this.store.all("paymentNotifications").filter(item => item.source === input.source && item.sourceId === input.sourceId && item.telegramId).sort((a, b) => (b.sequence ?? 0) - (a.sequence ?? 0))[0]?.telegramId;
    const recipient = requested?.telegramId || pinned || telegramId || this.findTelegram(input.email, input.username)?.telegramId || "";
    const channels = resend ? resend.channel === "both" ? CHANNELS : [resend.channel] : CHANNELS;
    const sequence = resend ? Math.max(0, ...this.store.all("paymentNotifications").filter(item => item.source === input.source && item.sourceId === input.sourceId).map(item => item.sequence ?? 0)) + 1 : 0;
    this.store.put("paymentNotifications", { ...input, id: notificationId, telegramId: recipient, test: this.config.mockPayments, createdAt: now(), ...(resend ? { channels, sequence, requestId: resend.requestId, ...(requestedBy ? { requestedBy } : {}) } : {}) });
    const payload = { notificationId, projectId: input.projectId, ...(input.source === "order" ? { orderId: input.sourceId } : {}) };
    for (const channel of channels) this.store.enqueue(`payment.notify.${channel}`, payload, `${notificationId}:${channel}`);
  }

  resend(viewer: Viewer, action: ResendPaymentAction) {
    if (viewer.role !== "developer" || viewer.mustChangePassword) throw new PortalError(403, "Недостаточно прав.");
    if (!["order", "quote"].includes(action.source) || !["mail", "telegram", "both"].includes(action.channel) || !/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i.test(action.requestId)) throw new PortalError(400, "Обновите окно отправки ссылки.");
    this.store.transaction(() => {
      const payment = action.source === "order" ? this.store.get("orders", action.sourceId) : this.store.get("quotes", action.sourceId);
      if (!payment || payment.deletedAt) throw new PortalError(404, "Оплата не найдена.");
      const project = payment.projectId ? this.store.get("projects", payment.projectId) : undefined;
      updateErrorContext({ projectId: project?.id ?? "", projectName: project?.name ?? ("projectName" in payment ? payment.projectName : "") });
      if ((payment.projectId || action.source === "quote") && (!project || project.status === "archived")) throw new PortalError(404, "Проект не найден.");
      if (project?.developerId && project.developerId !== viewer.id) throw new PortalError(403, "Проект принадлежит другому разработчику.");
      if (payment.status !== "pending") throw new PortalError(409, "Повторно отправить можно только актуальную неоплаченную ссылку.");
      const channels = action.channel === "both" ? CHANNELS : [action.channel];
      const previous = this.store.all("paymentNotifications").filter(item => item.source === action.source && item.sourceId === payment.id && item.event === "requested");
      const duplicate = previous.find(item => item.requestId === action.requestId);
      if (duplicate) {
        if (JSON.stringify(duplicate.channels) !== JSON.stringify(channels)) throw new PortalError(409, "Эта отправка уже запущена с другими каналами.");
        return;
      }
      for (const channel of channels) {
        if (!this.integrations.ready[channel === "mail" ? "mail" : "telegram"]) throw new PortalError(503, channel === "mail" ? "Почта студии не подключена." : "Telegram-бот студии не подключён.");
        if (previous.some(item => item.requestId && (item.channels ?? CHANNELS).includes(channel) && Date.now() - Date.parse(item.createdAt) < 30_000)) throw new PortalError(429, "Повторная отправка доступна через 30 секунд после предыдущей.");
        for (const item of previous) {
          const job = this.store.db.prepare("SELECT running FROM jobs WHERE id=?").get(`${item.id}:${channel}`);
          if (job?.running) throw new PortalError(409, "Отправка ссылки уже выполняется. Дождитесь результата.");
        }
      }
      // Replace only queued deliveries in the chosen channels. A completed delivery is immutable.
      for (const item of previous) {
        let current = item;
        for (const channel of channels) {
          if (!(item.channels ?? CHANNELS).includes(channel) || item[channel === "mail" ? "mailSentAt" : "telegramSentAt"]) continue;
          current = { ...current, [channel === "mail" ? "mailCancelledAt" : "telegramCancelledAt"]: now() };
          this.store.db.prepare("DELETE FROM jobs WHERE id=?").run(`${item.id}:${channel}`);
        }
        if (current !== item) this.store.put("paymentNotifications", current);
      }
      if ("projectName" in payment) this.order(payment, "requested", action, viewer.id);
      else if (project) this.quote(payment, project, "requested", action, viewer.id);
    });
  }

  state() { return paymentDeliveryState(this.store); }

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
    if (!notification || notification.cancelledAt || notification[channel === "mail" ? "mailCancelledAt" : "telegramCancelledAt"] || !(notification.channels ?? CHANNELS).includes(channel) || notification[channel === "mail" ? "mailSentAt" : "telegramSentAt"]) return;
    const source = notification.source === "order" ? this.store.get("orders", notification.sourceId) : this.store.get("quotes", notification.sourceId);
    const projectId = source?.projectId || notification.projectId;
    if (!source || source.deletedAt || (projectId && this.store.get("projects", projectId)?.status === "archived") || (notification.event === "requested" && source.status !== "pending")) {
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

  /** Called in the payment deletion transaction; completed deliveries stay in the audit history. */
  cancel(source: PaymentNotification["source"], sourceId: string) {
    for (const notification of this.store.all("paymentNotifications").filter(item => item.source === source && item.sourceId === sourceId)) {
      if (!notification.cancelledAt) this.store.put("paymentNotifications", { ...notification, cancelledAt: now() });
      this.store.db.prepare("DELETE FROM jobs WHERE json_extract(payload,'$.notificationId')=?").run(notification.id);
    }
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
