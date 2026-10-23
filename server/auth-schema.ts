import type { DatabaseSync } from "node:sqlite";
import { migrateDeveloperWorkflow } from "./developer-workflow-migration.ts";
import { initializeProfileProofs } from "./profile-policy.ts";

/** Keep account IDs and foreign keys while allowing one mailbox to own several roles. */
export function initializeAuthSchema(db: DatabaseSync) {
  const emailOnlyIndex = db.prepare("PRAGMA index_list(users)").all().some(index => {
    if (!index.unique) return false;
    const columns = db.prepare("SELECT name FROM pragma_index_info(?)").all(String(index.name));
    return columns.length === 1 && columns[0]?.name === "email";
  });
  const legacyStaff = String(db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='users'").get()?.sql).includes("'curator'")
    || Boolean(db.prepare("SELECT 1 FROM users WHERE role='curator'").get());
  if (emailOnlyIndex || legacyStaff) {
    db.exec("PRAGMA foreign_keys=OFF; BEGIN IMMEDIATE");
    try {
      const promotedId = legacyStaff ? migrateDeveloperWorkflow(db) : "";
      db.exec(`CREATE TABLE users_next (
        id TEXT PRIMARY KEY, email TEXT NOT NULL COLLATE NOCASE, name TEXT NOT NULL,
        role TEXT NOT NULL CHECK(role IN ('client','developer','admin')),
        password TEXT NOT NULL, must_change INTEGER NOT NULL DEFAULT 1, UNIQUE(email,role)
      );`);
      db.prepare("INSERT INTO users_next SELECT id,email,name,CASE WHEN role='curator' THEN 'developer' ELSE role END,password,must_change FROM users WHERE role<>'curator' OR id=?").run(promotedId);
      db.exec("DROP TABLE users; ALTER TABLE users_next RENAME TO users;");
      if (db.prepare("PRAGMA foreign_key_check").all().length) throw new Error("Account migration failed its foreign key check");
      db.exec("COMMIT");
    } catch (error) { db.exec("ROLLBACK"); throw error; }
    finally { db.exec("PRAGMA foreign_keys=ON"); }
  }
  db.exec(`
    CREATE TABLE IF NOT EXISTS auth_verifications (
      group_id TEXT NOT NULL, email TEXT NOT NULL COLLATE NOCASE, expires INTEGER NOT NULL,
      PRIMARY KEY(group_id,email)
    );
    CREATE TABLE IF NOT EXISTS auth_challenges (
      id TEXT PRIMARY KEY, user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
      email TEXT NOT NULL COLLATE NOCASE, credential_hash TEXT NOT NULL, code_hash TEXT NOT NULL,
      created_at INTEGER NOT NULL, expires INTEGER NOT NULL, attempts INTEGER NOT NULL DEFAULT 0,
      resend_at INTEGER NOT NULL, group_id TEXT NOT NULL DEFAULT '', parent_token TEXT NOT NULL DEFAULT '',
      requested_role TEXT NOT NULL DEFAULT 'client' CHECK(requested_role IN ('client','developer','admin'))
    );
    CREATE TABLE IF NOT EXISTS auth_recoveries (
      token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      email TEXT NOT NULL COLLATE NOCASE, credential_hash TEXT NOT NULL, expires INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS auth_limits (key TEXT PRIMARY KEY, attempts INTEGER NOT NULL, since INTEGER NOT NULL);
    CREATE INDEX IF NOT EXISTS auth_challenges_email ON auth_challenges(email);
    CREATE INDEX IF NOT EXISTS auth_recoveries_email ON auth_recoveries(email);
  `);
  const challengeColumns = db.prepare("PRAGMA table_info(auth_challenges)").all();
  if (challengeColumns.some(column => column.name === "user_id" && column.notnull) || !challengeColumns.some(column => column.name === "requested_role")) {
    db.exec("BEGIN IMMEDIATE");
    try {
      db.exec(`CREATE TABLE auth_challenges_next (
        id TEXT PRIMARY KEY, user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
        email TEXT NOT NULL COLLATE NOCASE, credential_hash TEXT NOT NULL, code_hash TEXT NOT NULL,
        created_at INTEGER NOT NULL, expires INTEGER NOT NULL, attempts INTEGER NOT NULL DEFAULT 0,
        resend_at INTEGER NOT NULL, group_id TEXT NOT NULL DEFAULT '', parent_token TEXT NOT NULL DEFAULT '',
        requested_role TEXT NOT NULL DEFAULT 'client' CHECK(requested_role IN ('client','developer','admin'))
      );
      INSERT INTO auth_challenges_next SELECT c.id,c.user_id,c.email,c.credential_hash,c.code_hash,c.created_at,c.expires,c.attempts,c.resend_at,c.group_id,c.parent_token,coalesce(u.role,'client') FROM auth_challenges c LEFT JOIN users u ON u.id=c.user_id;
      DROP TABLE auth_challenges;
      ALTER TABLE auth_challenges_next RENAME TO auth_challenges;
      CREATE INDEX auth_challenges_email ON auth_challenges(email);
      COMMIT;`);
    } catch (error) { db.exec("ROLLBACK"); throw error; }
  }
  db.exec("DROP INDEX IF EXISTS one_developer");
  initializeProfileProofs(db);
}
