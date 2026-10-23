import type { PortalSnapshot } from "./types";
import type { ResendPaymentAction } from "./payment-delivery";

/** A queue acknowledgement never counts as delivery; only this session's completed work emits a toast. */
export class PaymentUpdates {
  private pending = new Map<string, { action: ResendPaymentAction; viewerId: string; csrf: string }>();

  track(snapshot: PortalSnapshot, action: ResendPaymentAction) {
    if (snapshot.viewer?.role === "developer") this.pending.set(action.requestId, { action, viewerId: snapshot.viewer.id, csrf: snapshot.csrf });
  }

  cancel(requestId: string) { this.pending.delete(requestId); }

  observe(snapshot: PortalSnapshot): { success: boolean; message: string }[] {
    const notifications: { success: boolean; message: string }[] = [];
    for (const { action, viewerId, csrf } of this.pending.values()) {
      if (snapshot.viewer?.id !== viewerId || snapshot.csrf !== csrf) { this.cancel(action.requestId); continue; }
      const delivery = snapshot.paymentDeliveries.find(item => item.source === action.source && item.sourceId === action.sourceId);
      const payment = (action.source === "order" ? snapshot.orders : snapshot.quotes).find(item => item.id === action.sourceId);
      if (!payment) { this.cancel(action.requestId); continue; }
      const channels = action.channel === "both" ? ["mail", "telegram"] as const : [action.channel];
      const results = channels.map(channel => delivery?.[channel]);
      if (results.some(result => !result)) continue;
      if (results.some(result => result?.requestId !== action.requestId)) { this.cancel(action.requestId); continue; }
      if (results.every(result => result?.state === "sent")) {
        notifications.push({ success: true, message: action.channel === "both" ? "Ссылка на оплату повторно отправлена на почту и в Telegram." : action.channel === "mail" ? "Ссылка на оплату повторно отправлена на почту." : "Ссылка на оплату повторно отправлена в Telegram." });
        this.cancel(action.requestId);
      } else if (results.every(result => result && ["sent", "failed", "cancelled"].includes(result.state))) {
        notifications.push({ success: false, message: "Отправка завершилась не во всех каналах. Подробности — в окне повторной отправки." });
        this.cancel(action.requestId);
      }
    }
    return notifications;
  }
}
