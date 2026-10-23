import type { PortalStore } from "./store.ts";
import { now, PortalError } from "./store.ts";
import type { PaymentNotifications } from "./payment-notifications.ts";
import type { Viewer } from "../src/features/portal/model/types.ts";
import { updateErrorContext } from "./error-context.ts";

/** Removing a card revokes its payment entry points while retaining immutable payment facts. */
export class PaymentDeletion {
  private store: PortalStore;
  private notifications: PaymentNotifications;

  constructor(store: PortalStore, notifications: PaymentNotifications) { this.store = store; this.notifications = notifications; }

  remove(viewer: Viewer, kind: "orders" | "quotes", recordId: string) {
    if (viewer.role !== "developer" || viewer.mustChangePassword) throw new PortalError(403, "Недостаточно прав.");
    this.store.transaction(() => {
      const payment = this.store.get(kind, recordId);
      if (!payment) throw new PortalError(404, "Оплата не найдена.");
      const project = payment.projectId ? this.store.get("projects", payment.projectId) : undefined;
      updateErrorContext({ projectId: project?.id ?? "", projectName: project?.name ?? ("projectName" in payment ? payment.projectName : "") });
      if (project?.developerId && project.developerId !== viewer.id) throw new PortalError(403, "Проект принадлежит другому разработчику.");
      if (!payment.deletedAt) {
        this.store.put(kind, { ...payment, deletedAt: now(), deletedBy: viewer.id });
      }
      this.notifications.cancel(kind === "orders" ? "order" : "quote", payment.id);
      if (kind === "orders") this.store.db.prepare("DELETE FROM jobs WHERE json_extract(payload,'$.orderId')=?").run(payment.id);
    });
  }
}
