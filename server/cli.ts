import { readFileSync } from "node:fs";
import { readConfig } from "./config.ts";
import { PortalStore } from "./store.ts";
import type { Role } from "../src/features/portal/model/types.ts";

const [command, role, email, name] = process.argv.slice(2);
if (command !== "bootstrap" && (command !== "create-user" || !["developer", "curator", "admin"].includes(role ?? "") || !email || !name)) {
  console.error('Usage: node server/cli.ts create-user <developer|curator|admin> <email> "Name" < password-file');
  process.exit(1);
}
process.umask(0o077);
const store = new PortalStore(readConfig().database);
try {
  const input = readFileSync(0, "utf8").replace(/\r?\n$/, "");
  if (command === "bootstrap") {
    const users = JSON.parse(input) as { email: string; name: string; role: Role; password: string }[];
    store.transaction(() => {
      for (const user of users) {
        if (!["developer", "curator", "admin"].includes(user.role)) throw new Error("Invalid employee role");
        const existing = store.findUser(user.email);
        if (existing && existing.role !== user.role) throw new Error("Existing employee has another role");
        if (!existing) store.createUser(user.email, user.name, user.role, user.password);
      }
    });
    console.log("Employee accounts prepared; password change required on first login.");
  } else {
    const user = store.createUser(email!, name!, role as Role, input);
    console.log(`Created ${user.role} ${user.email}; password change required on first login.`);
  }
} finally { store.close(); }
