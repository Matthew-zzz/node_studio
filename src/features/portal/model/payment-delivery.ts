export type PaymentChannel = "mail" | "telegram";
export type PaymentSource = "order" | "quote";
export type PaymentDeliveryState = "queued" | "sending" | "sent" | "retrying" | "failed" | "cancelled";
export interface ChannelDelivery {
  readonly state: PaymentDeliveryState;
  readonly at: string;
  readonly requestId?: string;
  readonly retryAfter?: string;
  readonly hint?: string;
}
export interface PaymentDelivery {
  readonly source: PaymentSource;
  readonly sourceId: string;
  readonly mail?: ChannelDelivery;
  readonly telegram?: ChannelDelivery;
}
export interface ResendPaymentAction {
  readonly type: "payment.resend";
  readonly source: PaymentSource;
  readonly sourceId: string;
  readonly channel: PaymentChannel | "both";
  readonly requestId: string;
}
