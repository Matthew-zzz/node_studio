import type { DatabaseSync } from "node:sqlite";
import { randomUUID } from "node:crypto";

/** Called within the auth-schema migration transaction, before retiring legacy accounts. */
export function migrateDeveloperWorkflow(db: DatabaseSync) {
  const retired = db.prepare("SELECT id,email,name,role FROM users WHERE role='curator'").all();
  const existingDeveloper = db.prepare("SELECT id,name FROM users WHERE role='developer'").get();
  const developer = existingDeveloper ?? retired[0];
  const retiredIds = new Set(retired.map(user => String(user.id)));
  const at = new Date().toISOString();
  db.exec("CREATE TABLE IF NOT EXISTS retired_accounts (id TEXT PRIMARY KEY,email TEXT NOT NULL,name TEXT NOT NULL,role TEXT NOT NULL,retired_at TEXT NOT NULL)");
  for (const user of retired) {
    db.prepare("INSERT OR IGNORE INTO retired_accounts(id,email,name,role,retired_at) VALUES(?,?,?,?,?)").run(user.id!, user.email!, user.name!, user.role!, at);
    // Revocation is limited to the retired role; existing client/developer sessions remain valid.
    for (const table of ["sessions", "auth_challenges", "auth_recoveries"]) {
      if (db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(table)) db.prepare(`DELETE FROM ${table} WHERE user_id=?`).run(user.id!);
    }
  }
  const update = db.prepare("UPDATE records SET payload=?,updated_at=? WHERE kind=? AND id=?");
  for (const row of db.prepare("SELECT kind,id,payload FROM records WHERE kind IN ('projects','conversations','briefLinks','briefRequests','agentSettings')").all()) {
    const record = JSON.parse(String(row.payload));
    const before = JSON.stringify(record);
    if (developer) {
      if (row.kind === "conversations" && retiredIds.has(record.ownerId)) {
        record.ownerId = developer.id; record.ownerName = developer.name; record.revision = (record.revision ?? 0) + 1;
      }
      if ((row.kind === "projects" || row.kind === "briefLinks") && record.curatorId) {
        record.createdBy = retiredIds.has(record.curatorId) ? developer.id : record.curatorId; delete record.curatorId;
      }
      if (row.kind === "briefRequests" && retiredIds.has(record.actorId)) record.actorId = developer.id;
    }
    if (row.kind === "projects" && record.origin === "curator") record.origin = "developer";
    if (row.kind === "agentSettings") {
      for (const key of ["systemPrompt", "greeting", "fallbackMessage", "handoffMessage", "noKnowledgeMessage"]) {
        if (typeof record[key] === "string") record[key] = developerTerminology(record[key]);
      }
      if (JSON.stringify(record) !== before) {
        const previous = JSON.parse(String(row.payload));
        const revision = { id: randomUUID(), settings: previous, createdAt: at, author: "До перехода к разработчику" };
        db.prepare("INSERT INTO records(kind,id,project_id,updated_at,payload) VALUES('agentRevisions',?,'',?,?)").run(revision.id, at, JSON.stringify(revision));
        record.version = (record.version ?? 0) + 1; record.updatedAt = at; record.updatedBy = "Переход к разработчику";
        const migrated = { id: randomUUID(), settings: record, createdAt: at, author: record.updatedBy };
        db.prepare("INSERT INTO records(kind,id,project_id,updated_at,payload) VALUES('agentRevisions',?,'',?,?)").run(migrated.id, at, JSON.stringify(migrated));
      }
    }
    if (JSON.stringify(record) !== before) update.run(JSON.stringify(record), at, row.kind!, row.id!);
  }
  if (developer) for (const row of db.prepare("SELECT id,payload FROM jobs").all()) {
    const payload = JSON.parse(String(row.payload));
    if (retiredIds.has(payload._actorId)) { payload._actorId = developer.id; db.prepare("UPDATE jobs SET payload=? WHERE id=?").run(JSON.stringify(payload), row.id!); }
  }
  // Without an existing developer, promote one legacy staff account instead of leaving clients without an owner.
  return existingDeveloper ? "" : String(developer?.id ?? "");
}

export function developerTerminology(text: string): string {
  const forms: Record<string, string> = { "куратор": "разработчик", "куратора": "разработчика", "куратору": "разработчику", "куратором": "разработчиком", "кураторе": "разработчике", "кураторы": "разработчики", "кураторов": "разработчиков", "кураторам": "разработчикам", "кураторами": "разработчиками", "кураторах": "разработчиках" };
  return text.replace(/куратор(?:ами|ов|ам|ом|ах|а|у|е|ы)?/gi, word => {
    const replacement = forms[word.toLowerCase()]!;
    return word[0] === word[0]!.toUpperCase() ? replacement[0]!.toUpperCase() + replacement.slice(1) : replacement;
  });
}
