import type { PortalStore } from "./store.ts";
import type { PaymentNotification } from "./payment-notifications.ts";
import type { ChannelDelivery, PaymentChannel, PaymentDelivery } from "../src/features/portal/model/payment-delivery.ts";

/** Only delivery metadata reaches developers; notification payloads and outbox jobs remain private. */
export function paymentDeliveryState(store: PortalStore): PaymentDelivery[] {
  const latest = new Map<string, { source: PaymentDelivery["source"]; sourceId: string; mail?: PaymentNotification; telegram?: PaymentNotification }>();
  const channels: readonly PaymentChannel[] = ["mail", "telegram"];
  for (const item of store.all("paymentNotifications").filter(item => item.event === "requested")) {
    const key = `${item.source}:${item.sourceId}`;
    const delivery = latest.get(key) ?? { source: item.source, sourceId: item.sourceId };
    for (const channel of item.channels ?? channels) {
      const previous = delivery[channel];
      if (!previous || (item.sequence ?? 0) > (previous.sequence ?? 0)) delivery[channel] = item;
    }
    latest.set(key, delivery);
  }
  function state(item: PaymentNotification, channel: PaymentChannel): ChannelDelivery {
    const sent = item[channel === "mail" ? "mailSentAt" : "telegramSentAt"];
    const job = store.db.prepare("SELECT running,attempts FROM jobs WHERE id=?").get(`${item.id}:${channel}`);
    const source = item.source === "order" ? store.get("orders", item.sourceId) : store.get("quotes", item.sourceId);
    const project = source?.projectId ? store.get("projects", source.projectId) : undefined;
    const cancelled = item.cancelledAt || item[channel === "mail" ? "mailCancelledAt" : "telegramCancelledAt"] || !source || source.deletedAt || source.status !== "pending" || project?.status === "archived";
    return {
      state: sent ? "sent" : cancelled ? "cancelled" : !job || Number(job.attempts) >= 8 ? "failed" : job.running ? "sending" : Number(job.attempts) > 0 ? "retrying" : "queued",
      at: sent ?? item.createdAt,
      ...(item.requestId ? { requestId: item.requestId, retryAfter: new Date(Date.parse(item.createdAt) + 30_000).toISOString() } : {}),
      ...(channel === "telegram" && !item.telegramId ? { hint: "Клиенту нужно написать @node_studio_bot. Проверьте его username и почту." } : {}),
    };
  }
  return [...latest.values()].map(item => ({ source: item.source, sourceId: item.sourceId, ...(item.mail ? { mail: state(item.mail, "mail") } : {}), ...(item.telegram ? { telegram: state(item.telegram, "telegram") } : {}) }));
}
