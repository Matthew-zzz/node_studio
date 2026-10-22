import type { DatabaseSync } from "node:sqlite";

/** Keep account IDs and foreign keys while allowing one mailbox to own several roles. */
export function initializeAuthSchema(db: DatabaseSync) {
  const emailOnlyIndex = db.prepare("PRAGMA index_list(users)").all().some(index => {
    if (!index.unique) return false;
    const columns = db.prepare("SELECT name FROM pragma_index_info(?)").all(String(index.name));
    return columns.length === 1 && columns[0]?.name === "email";
  });
  if (emailOnlyIndex) {
    db.exec("PRAGMA foreign_keys=OFF; BEGIN IMMEDIATE");
    try {
      db.exec(`CREATE TABLE users_next (
        id TEXT PRIMARY KEY, email TEXT NOT NULL COLLATE NOCASE, name TEXT NOT NULL,
        role TEXT NOT NULL CHECK(role IN ('client','developer','curator','admin')),
        password TEXT NOT NULL, must_change INTEGER NOT NULL DEFAULT 1, UNIQUE(email,role)
      ); INSERT INTO users_next SELECT id,email,name,role,password,must_change FROM users;
      DROP TABLE users; ALTER TABLE users_next RENAME TO users;
      CREATE UNIQUE INDEX one_developer ON users(role) WHERE role='developer';`);
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
      id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      email TEXT NOT NULL COLLATE NOCASE, credential_hash TEXT NOT NULL, code_hash TEXT NOT NULL,
      created_at INTEGER NOT NULL, expires INTEGER NOT NULL, attempts INTEGER NOT NULL DEFAULT 0,
      resend_at INTEGER NOT NULL, group_id TEXT NOT NULL DEFAULT '', parent_token TEXT NOT NULL DEFAULT ''
    );
    CREATE TABLE IF NOT EXISTS auth_recoveries (
      token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      email TEXT NOT NULL COLLATE NOCASE, credential_hash TEXT NOT NULL, expires INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS auth_limits (key TEXT PRIMARY KEY, attempts INTEGER NOT NULL, since INTEGER NOT NULL);
    CREATE INDEX IF NOT EXISTS auth_challenges_email ON auth_challenges(email);
    CREATE INDEX IF NOT EXISTS auth_recoveries_email ON auth_recoveries(email);
  `);
}
