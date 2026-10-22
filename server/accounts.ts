import { randomBytes } from "node:crypto";
import { PortalError } from "./store.ts";
import type { PortalStore } from "./store.ts";
import type { Role } from "../src/features/portal/model/types.ts";

/** Explicit operator action for this installation, preserving IDs and client ownership. */
export function configureOwnerAccounts(store: PortalStore, email: string) {
  email = email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new PortalError(400, "Проверьте почту владельца.");
  const roles: Role[] = ["client", "curator", "developer", "admin"];
  for (const role of roles) if (Number(store.db.prepare("SELECT count(*) AS count FROM users WHERE role=?").get(role)!.count) > 1) throw new PortalError(409, "Нельзя объединить несколько аккаунтов одной роли. Нужен явный выбор аккаунтов.");
  return store.transaction(() => {
    for (const role of roles) if (!store.db.prepare("SELECT 1 FROM users WHERE role=?").get(role)) {
      const names = { client: "Клиент", curator: "Куратор", developer: "Разработчик", admin: "Администратор" };
      store.createUser(email, names[role], role, randomBytes(24).toString("base64url"));
    }
    const client = store.db.prepare("SELECT * FROM users WHERE role='client'").get()!;
    store.db.exec("DELETE FROM sessions; DELETE FROM auth_verifications; DELETE FROM auth_challenges; DELETE FROM auth_recoveries; DELETE FROM jobs WHERE kind='auth.mail'");
    store.db.prepare("UPDATE users SET email=?,password=?,must_change=?").run(email, client.password!, client.must_change!);
    for (const project of store.all("projects")) if (project.clientId === client.id) {
      store.put("projects", { ...project, clientEmail: email });
      for (const thread of store.all("conversations", project.id)) store.put("conversations", { ...thread, email });
    }
    return roles.map(role => store.findUser(email, role)!);
  });
}
