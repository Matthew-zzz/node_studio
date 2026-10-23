import { randomBytes } from "node:crypto";
import { PortalError, now } from "./store.ts";
import type { PortalStore } from "./store.ts";
import type { PortalConfig } from "./config.ts";
import type { Viewer } from "../src/features/portal/model/types.ts";
import type { StaffState } from "../src/features/portal/model/staff.ts";
import { text } from "./validation.ts";
import { seal } from "./secret-box.ts";

/** Account roles are assigned here by an authenticated administrator, never during login. */
export class StaffAccounts {
  private store: PortalStore;
  private config: PortalConfig;
  constructor(store: PortalStore, config: PortalConfig) { this.store = store; this.config = config; }

  state(): StaffState {
    const audit = this.store.all("staffAccounts");
    return { developers: this.store.db.prepare("SELECT id,name,email FROM users WHERE role='developer' ORDER BY name,id").all().map(row => {
      const created = audit.find(item => item.userId === row.id);
      return { id: String(row.id), name: String(row.name), email: String(row.email), createdAt: created?.createdAt ?? null, createdBy: created ? this.store.user(created.createdBy)?.name ?? "Администратор" : null };
    }) };
  }

  create(viewer: Viewer, input: Record<string, unknown>) {
    if (viewer.role !== "admin" || viewer.mustChangePassword) throw new PortalError(403, "Создавать разработчиков может только администратор.");
    if (input.type !== "developer.create" || (input.role !== undefined && input.role !== "developer")) throw new PortalError(400, "Доступно только создание разработчика.");
    const requestId = text(input.requestId, 100); const email = text(input.email, 254).toLowerCase(); const name = text(input.name, 100);
    if (!/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i.test(requestId)) throw new PortalError(400, "Обновите форму создания разработчика.");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new PortalError(400, "Проверьте почту разработчика.");
    this.store.transaction(() => {
      const existing = this.store.get("staffAccounts", requestId);
      if (existing) {
        if (existing.createdBy !== viewer.id || existing.email !== email || existing.name !== name) throw new PortalError(409, "Запрос уже использован для другого аккаунта.");
        return;
      }
      if (this.store.findUser(email, "developer")) throw new PortalError(409, "Разработчик с этой почтой уже существует.");
      const user = this.store.createUser(email, name, "developer", randomBytes(32).toString("base64url"), false);
      this.store.put("staffAccounts", { id: requestId, userId: user.id, email, name, createdBy: viewer.id, createdAt: now() });
      const content = `Администратор создал для вас аккаунт разработчика Node Studio.\n\n${this.config.origin}/cabinet/\n\nНажмите «Вход для сотрудников», выберите профиль «Разработчик» и запросите код на ${email}. Пароль не нужен.\n\nПоддержка: https://t.me/node_studio_bot`;
      this.store.enqueue("auth.mail", { email, content: seal(content, this.config.encryptionKey), subject: "Доступ разработчика — Node Studio", staffUserId: user.id }, `staff-invite:${requestId}`);
    });
    return this.state();
  }
}
