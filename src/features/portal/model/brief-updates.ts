import type { PortalSnapshot } from "./types";

interface BriefUpdate {
  readonly viewerId: string;
  readonly csrf: string;
  readonly threadId: string;
  readonly requestId: string | undefined;
  readonly generatedAt: string | undefined;
  readonly wasReady: boolean;
  readonly refresh: boolean;
}

/** Observe only work requested in this session; cached documents never produce success toasts. */
export class BriefUpdates {
  private pending = new Map<string, BriefUpdate>();

  track(snapshot: PortalSnapshot, threadId: string, refresh: boolean): BriefUpdate | undefined {
    if (snapshot.viewer?.role !== "developer") return;
    const brief = snapshot.clientBriefs.find(item => item.threadId === threadId);
    if (!refresh && brief?.status === "ready" && !brief.stale) return;
    const update = { viewerId: snapshot.viewer.id, csrf: snapshot.csrf, threadId, requestId: brief?.requestId, generatedAt: brief?.generatedAt, wasReady: brief?.status === "ready", refresh };
    this.pending.set(threadId, update);
    return update;
  }

  cancel(update: BriefUpdate | undefined) {
    if (update && this.pending.get(update.threadId) === update) this.pending.delete(update.threadId);
  }

  observe(snapshot: PortalSnapshot): { success: boolean; message: string }[] {
    const notifications: { success: boolean; message: string }[] = [];
    for (const update of this.pending.values()) {
      if (snapshot.viewer?.id !== update.viewerId || snapshot.csrf !== update.csrf) { this.cancel(update); continue; }
      const brief = snapshot.clientBriefs.find(item => item.threadId === update.threadId);
      if (brief?.status === "failed") {
        notifications.push({ success: false, message: "Не удалось обновить бриф. Администратор получил подробности ошибки." });
        this.cancel(update);
      } else if (brief?.status === "ready" && (!update.wasReady || brief.requestId !== update.requestId || brief.generatedAt !== update.generatedAt)) {
        notifications.push({ success: true, message: update.refresh ? "Бриф успешно обновлён." : "Итоговый бриф готов." });
        this.cancel(update);
      }
    }
    return notifications;
  }
}
