import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { resolve } from "node:path";
import type { PortalConfig } from "./config.ts";
import type { PortalStore } from "./store.ts";
import type { Role } from "../src/features/portal/model/types.ts";

/** The named volume owns generated secrets and first-run access, never the image. */
export function initializeRuntime(store: PortalStore, config: PortalConfig) {
  if (!config.stateDirectory) return;
  mkdirSync(config.stateDirectory, { recursive: true, mode: 0o700 });
  const secretPath = resolve(config.stateDirectory, "runtime-secrets.json");
  const keys = ["encryptionKey", "githubWebhookSecret", "telegramWebhookSecret"] as const;
  if (!existsSync(secretPath)) {
    const secrets = Object.fromEntries(keys.map(key => [key, config[key] || randomBytes(32).toString("hex")]));
    writeFileSync(secretPath, JSON.stringify(secrets), { mode: 0o600, flag: "wx" });
  }
  const secrets = JSON.parse(readFileSync(secretPath, "utf8")) as Record<string, unknown>;
  for (const key of keys) {
    if (typeof secrets[key] !== "string" || !secrets[key] || secrets[key].length > 256
      || (key === "encryptionKey" && !/^[a-f0-9]{64}$/.test(secrets[key]))) throw new Error("Invalid persistent runtime secret");
    if (key === "encryptionKey" && config[key] && config[key] !== secrets[key]) throw new Error("The persistent encryption key differs from configuration; restore the original key before starting");
    config[key] ||= secrets[key];
  }
  if (!config.bootstrapEmployees || store.db.prepare("SELECT id FROM users WHERE role!='client' LIMIT 1").get()) return;
  const accessPath = resolve(config.stateDirectory, "initial-access.json");
  if (!existsSync(accessPath)) {
    const employees = ([['developer', 'Разработчик'], ['admin', 'Администратор']] as const)
      .map(([role, name]) => ({ role, name, email: `${role}@node-studio.local`, password: randomBytes(24).toString("base64url") }));
    writeFileSync(accessPath, JSON.stringify(employees, null, 2), { mode: 0o600, flag: "wx" });
  }
  const employees = (JSON.parse(readFileSync(accessPath, "utf8")) as { role: Role; name: string; email: string; password: string }[]).filter(user => ["developer", "admin"].includes(user.role));
  if (employees.length !== 2 || !["developer", "admin"].every(role => employees.some(user => user.role === role))) throw new Error("Invalid initial employee access file");
  store.transaction(() => { for (const user of employees) store.createUser(user.email, user.name, user.role, user.password); });
  console.log("Initial employee access saved in the data volume: initial-access.json");
}
