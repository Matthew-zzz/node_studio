import type { DatabaseSync } from "node:sqlite";

/** Retire ambiguous sessions issued by automatic mailbox-wide role linking, once. */
export function initializeProfileProofs(db: DatabaseSync) {
  if (db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='auth_profile_verifications'").get()) return;
  db.exec("BEGIN IMMEDIATE");
  try {
    db.exec(`
      CREATE TABLE auth_profile_verifications (
        group_id TEXT NOT NULL,user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        role TEXT NOT NULL CHECK(role IN ('client','developer','admin')),expires INTEGER NOT NULL,
        PRIMARY KEY(group_id,user_id)
      );
      CREATE TEMP TABLE mixed_role_groups AS SELECT group_id FROM sessions JOIN users ON users.id=sessions.user_id GROUP BY group_id HAVING count(DISTINCT role)>1;
      DELETE FROM auth_challenges WHERE group_id IN (SELECT group_id FROM mixed_role_groups);
      DELETE FROM auth_verifications WHERE group_id IN (SELECT group_id FROM mixed_role_groups);
      DELETE FROM sessions WHERE group_id IN (SELECT group_id FROM mixed_role_groups);
      DROP TABLE mixed_role_groups;
      INSERT INTO auth_profile_verifications(group_id,user_id,role,expires)
        SELECT s.group_id,u.id,u.role,min(s.expires,v.expires) FROM sessions s JOIN users u ON u.id=s.user_id
        JOIN auth_verifications v ON v.group_id=s.group_id AND v.email=u.email WHERE s.expires>strftime('%s','now')*1000 AND v.expires>strftime('%s','now')*1000;
      COMMIT;
    `);
  } catch (error) { db.exec("ROLLBACK"); throw error; }
}
