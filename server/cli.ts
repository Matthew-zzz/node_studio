import { readFileSync } from "node:fs";
import { readConfig } from "./config.ts";
import { PortalStore } from "./store.ts";
import type { Role } from "../src/features/portal/model/types.ts";
import { PortalService } from "./service.ts";
import { createIntegrations } from "./integrations.ts";
import { object, text } from "./validation.ts";
import { withErrorContext } from "./error-context.ts";
import { PortalError } from "./store.ts";
import { configureOwnerAccounts } from "./accounts.ts";
import { initializeRuntime } from "./runtime.ts";
import { configureTelegramMenu } from "./telegram-menu.ts";

const [command, role, email, name] = process.argv.slice(2);
if (!["bootstrap", "import-project", "archive-project", "configure-owner", "telegram-menu"].includes(command ?? "") && (command !== "create-user" || !["developer", "curator", "admin"].includes(role ?? "") || !email || !name)) {
  console.error('Usage: node server/cli.ts create-user <developer|curator|admin> <email> "Name" < password-file');
  process.exit(1);
}
process.umask(0o077);
const config = readConfig();
const store = new PortalStore(config.database, { recoverJobs: false });
try {
  const input = readFileSync(0, "utf8").replace(/\r?\n$/, "");
  if (command === "telegram-menu") {
    console.log(JSON.stringify(await configureTelegramMenu(config)));
  } else if (command === "configure-owner") {
    initializeRuntime(store, config);
    const definition = object(JSON.parse(input));
    const accounts = configureOwnerAccounts(store, text(definition.email, 254));
    const service = new PortalService(store, createIntegrations(config), config);
    const recoveryEmailQueued = service.auth.requestRecovery(accounts[0]!.email, "client", "operator");
    console.log(JSON.stringify({ email: accounts[0]!.email, roles: accounts.map(account => account.role), password: "Use the existing client password or the recovery email", recoveryEmailQueued }));
  } else if (command === "archive-project") {
    const definition = object(JSON.parse(input));
    const service = new PortalService(store, createIntegrations(config), config);
    const project = service.projects.archive(text(definition.projectId, 100));
    console.log(JSON.stringify({ id: project.id, name: project.name, status: project.status, archivedAt: project.archivedAt }));
  } else if (command === "import-project") {
    if (Buffer.byteLength(input) > 65536) throw new PortalError(413, "Слишком большое описание проекта.");
    const definition = object(JSON.parse(input));
    const developer = store.findUser(text(definition.developerEmail, 254), "developer");
    if (!developer || developer.role !== "developer") throw new PortalError(404, "Разработчик не найден.");
    const service = new PortalService(store, createIntegrations(config), config);
    await withErrorContext({ actor: developer, method: "CLI", source: "runtime", operation: "project.create" }, async () => {
      try {
        const project = await service.projects.create(developer, definition);
        await service.sync(project, 1, true);
        console.log(JSON.stringify({ id: project.id, name: project.name, clientEmail: project.clientEmail, subprojects: project.subprojects, tasks: store.all("tasks", project.id).length, commits: store.all("commits", project.id).length }));
      } catch (error) { service.errors.capture(error); throw error; }
    });
  } else if (command === "bootstrap") {
    const users = JSON.parse(input) as { email: string; name: string; role: Role; password: string }[];
    store.transaction(() => {
      for (const user of users) {
        if (!["developer", "curator", "admin"].includes(user.role)) throw new Error("Invalid employee role");
        const existing = store.findUser(user.email, user.role);
        if (existing && existing.role !== user.role) throw new Error("Existing employee has another role");
        if (!existing) store.createUser(user.email, user.name, user.role, user.password);
      }
    });
    console.log("Employee accounts prepared; password change required on first login.");
  } else {
    const user = store.createUser(email!, name!, role as Role, input);
    console.log(`Created ${user.role} ${user.email}; password change required on first login.`);
  }
} catch (error) { console.error(error instanceof PortalError ? error.message : "Не удалось выполнить команду. Проверьте входные данные и подключение."); process.exitCode = 1; }
finally { store.close(); }
