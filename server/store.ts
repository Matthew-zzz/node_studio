import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { randomBytes, randomUUID, scryptSync, timingSafeEqual, createHash } from "node:crypto";
import type {
  Viewer, Role, PortalProject, WorkItem, PortalCommit, Conversation,
  ChatMessage, TaskDraft, PortalQuote, ProjectOrder,
} from "../src/features/portal/model/types.ts";
import type { AgentSettings, KnowledgeDocument, AgentRevision, AgentRun } from "../src/features/portal/model/agent.ts";

export interface Records {
  projects: PortalProject;
  tasks: WorkItem;
  stages: WorkItem;
  commits: PortalCommit & { id: string };
  conversations: Conversation;
  messages: ChatMessage;
  drafts: TaskDraft;
  quotes: PortalQuote;
  orders: ProjectOrder;
  agentSettings: AgentSettings;
  agentDocuments: KnowledgeDocument;
  agentRevisions: AgentRevision;
  agentRuns: AgentRun;
}

export class PortalError extends Error {
  readonly status: number;
  constructor(status: number, message: string) { super(message); this.status = status; }
}

type UserRow = { id: string; name: string; email: string; role: Role; password: string; must_change: number };
export interface Session { viewer: Viewer; csrf: string; tokenHash: string; groupId: string }
export const now = () => new Date().toISOString();
export const id = (): string => randomUUID();
export const tokenHash = (value: string) => createHash("sha256").update(value).digest("hex");

function hashPassword(password: string): string {
  if (password.length < 12 || password.length > 256) throw new PortalError(400, "Пароль должен содержать от 12 до 256 символов.");
  const salt = randomBytes(16).toString("hex");
  return `${salt}:${scryptSync(password, salt, 64).toString("hex")}`;
}

function verifyPassword(password: string, stored: string): boolean {
  const [salt, hash] = stored.split(":");
  if (!salt || !hash || password.length > 256) return false;
  const actual = scryptSync(password, salt, 64);
  const expected = Buffer.from(hash, "hex");
  return expected.length === actual.length && timingSafeEqual(actual, expected);
}

function viewer(row: UserRow): Viewer {
  return { id: row.id, name: row.name, email: row.email, role: row.role, mustChangePassword: Boolean(row.must_change) };
}

/** Typed repository boundary; records are separate indexed rows, not a shared JSON file. */
export class PortalStore {
  readonly db: DatabaseSync;
  constructor(path: string) {
    if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
    this.db = new DatabaseSync(path);
    this.db.exec(`
      PRAGMA journal_mode=WAL;
      PRAGMA foreign_keys=ON;
      PRAGMA busy_timeout=5000;
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY, email TEXT NOT NULL UNIQUE COLLATE NOCASE,
        name TEXT NOT NULL, role TEXT NOT NULL CHECK(role IN ('client','developer','curator','admin')),
        password TEXT NOT NULL, must_change INTEGER NOT NULL DEFAULT 1
      );
      CREATE UNIQUE INDEX IF NOT EXISTS one_developer ON users(role) WHERE role='developer';
      CREATE TABLE IF NOT EXISTS sessions (
        token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        csrf TEXT NOT NULL, expires INTEGER NOT NULL, group_id TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS records (
        kind TEXT NOT NULL, id TEXT NOT NULL, project_id TEXT NOT NULL DEFAULT '',
        updated_at TEXT NOT NULL, payload TEXT NOT NULL CHECK(json_valid(payload)), PRIMARY KEY(kind,id)
      );
      CREATE INDEX IF NOT EXISTS records_project ON records(kind,project_id);
      CREATE TABLE IF NOT EXISTS agent_chunks (
        id TEXT PRIMARY KEY, document_id TEXT NOT NULL, ordinal INTEGER NOT NULL,
        content TEXT NOT NULL, embedding TEXT, embedding_model TEXT NOT NULL DEFAULT ''
      );
      CREATE INDEX IF NOT EXISTS agent_chunks_document ON agent_chunks(document_id);
      CREATE TABLE IF NOT EXISTS login_limits (key TEXT PRIMARY KEY, attempts INTEGER NOT NULL, since INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS deliveries (id TEXT PRIMARY KEY, created_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS jobs (
        id TEXT PRIMARY KEY, kind TEXT NOT NULL, payload TEXT NOT NULL,
        attempts INTEGER NOT NULL DEFAULT 0, available INTEGER NOT NULL, running INTEGER NOT NULL DEFAULT 0
      );
    `);
    // Existing installations keep their sessions; each starts as a separate device group.
    if (!this.db.prepare("PRAGMA table_info(sessions)").all().some(column => column.name === "group_id")) {
      this.db.exec("ALTER TABLE sessions ADD COLUMN group_id TEXT NOT NULL DEFAULT ''");
    }
    this.db.exec("UPDATE sessions SET group_id=token_hash WHERE group_id=''; CREATE INDEX IF NOT EXISTS sessions_group ON sessions(group_id)");
    this.db.prepare("UPDATE jobs SET running=0").run();
  }

  close() { this.db.close(); }

  transaction<T>(action: () => T): T {
    this.db.exec("BEGIN IMMEDIATE");
    try { const result = action(); this.db.exec("COMMIT"); return result; }
    catch (error) { this.db.exec("ROLLBACK"); throw error; }
  }

  all<K extends keyof Records>(kind: K, projectId?: string): Records[K][] {
    const rows = projectId === undefined
      ? this.db.prepare("SELECT payload FROM records WHERE kind=? ORDER BY updated_at,id").all(kind)
      : this.db.prepare("SELECT payload FROM records WHERE kind=? AND project_id=? ORDER BY updated_at,id").all(kind, projectId);
    return rows.map(row => JSON.parse(String(row.payload)) as Records[K]);
  }

  get<K extends keyof Records>(kind: K, recordId: string): Records[K] | undefined {
    const row = this.db.prepare("SELECT payload FROM records WHERE kind=? AND id=?").get(kind, recordId);
    return row ? JSON.parse(String(row.payload)) as Records[K] : undefined;
  }

  put<K extends keyof Records>(kind: K, record: Records[K]): Records[K] {
    const projectId = "projectId" in record ? record.projectId : kind === "projects" ? record.id : "";
    this.db.prepare(`INSERT INTO records(kind,id,project_id,updated_at,payload) VALUES(?,?,?,?,?)
      ON CONFLICT(kind,id) DO UPDATE SET project_id=excluded.project_id,updated_at=excluded.updated_at,payload=excluded.payload`)
      .run(kind, record.id, projectId, now(), JSON.stringify(record));
    return record;
  }

  replace<K extends "tasks" | "stages" | "commits">(kind: K, projectId: string, records: Records[K][]) {
    this.transaction(() => {
      this.db.prepare("DELETE FROM records WHERE kind=? AND project_id=?").run(kind, projectId);
      records.forEach(record => this.put(kind, record));
    });
  }

  createUser(email: string, name: string, role: Role, password: string, mustChange = true): Viewer {
    const user = { id: id(), name, email: email.toLowerCase().trim(), role, password: hashPassword(password), must_change: Number(mustChange) };
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(user.email)) throw new PortalError(400, "Проверьте почту клиента.");
    if (this.findUser(user.email)) throw new PortalError(409, "Пользователь с этой почтой уже существует.");
    this.db.prepare("INSERT INTO users(id,name,email,role,password,must_change) VALUES(?,?,?,?,?,?)")
      .run(user.id, user.name, user.email, user.role, user.password, user.must_change);
    return viewer(user);
  }

  findUser(email: string): Viewer | undefined {
    const row = this.db.prepare("SELECT * FROM users WHERE email=?").get(email.toLowerCase().trim()) as UserRow | undefined;
    return row && viewer(row);
  }

  user(userId: string): Viewer | undefined {
    const row = this.db.prepare("SELECT * FROM users WHERE id=?").get(userId) as UserRow | undefined;
    return row && viewer(row);
  }

  login(email: string, password: string, address: string, current?: Session): { token: string; session: Session } {
    const key = tokenHash(`${address}:${email.trim().toLowerCase()}`);
    const limit = this.db.prepare("SELECT attempts,since FROM login_limits WHERE key=?").get(key);
    const epoch = Date.now();
    if (limit && epoch - Number(limit.since) < 900_000 && Number(limit.attempts) >= 8) {
      throw new PortalError(429, "Слишком много попыток. Попробуйте через 15 минут.");
    }
    const row = this.db.prepare("SELECT * FROM users WHERE email=?").get(email.trim().toLowerCase()) as UserRow | undefined;
    const valid = row ? verifyPassword(password, row.password) : (scryptSync(password.slice(0, 256), "missing-user", 64), false);
    if (!row || !valid) {
      this.db.prepare(`INSERT INTO login_limits(key,attempts,since) VALUES(?,1,?)
        ON CONFLICT(key) DO UPDATE SET attempts=CASE WHEN ?-since>=900000 THEN 1 ELSE attempts+1 END,
        since=CASE WHEN ?-since>=900000 THEN ? ELSE since END`).run(key, epoch, epoch, epoch, epoch);
      throw new PortalError(401, "Проверьте почту и пароль.");
    }
    this.db.prepare("DELETE FROM login_limits WHERE key=?").run(key);
    this.db.prepare("DELETE FROM sessions WHERE expires<?").run(epoch);
    if (current && !this.db.prepare("SELECT 1 FROM sessions WHERE token_hash=? AND expires>?").get(current.tokenHash, epoch)) {
      throw new PortalError(401, "Войдите в кабинет.");
    }
    const groupId = current?.groupId ?? id();
    const profiles = current ? this.profiles(current) : [];
    if (profiles.length >= 8 && !profiles.some(profile => profile.id === row.id)) throw new PortalError(409, "Можно добавить до 8 профилей на одном устройстве.");
    return this.transaction(() => {
      this.db.prepare("DELETE FROM sessions WHERE group_id=? AND user_id=?").run(groupId, row.id);
      return this.createSession(viewer(row), groupId, epoch + 604_800_000);
    });
  }

  private createSession(user: Viewer, groupId: string, expires: number): { token: string; session: Session } {
    const token = randomBytes(32).toString("hex");
    const csrf = randomBytes(24).toString("hex");
    this.db.prepare("INSERT INTO sessions(token_hash,user_id,csrf,expires,group_id) VALUES(?,?,?,?,?)")
      .run(tokenHash(token), user.id, csrf, expires, groupId);
    return { token, session: { viewer: user, csrf, tokenHash: tokenHash(token), groupId } };
  }

  session(token: string): Session | undefined {
    if (!/^[a-f0-9]{64}$/.test(token)) return;
    const hash = tokenHash(token);
    const row = this.db.prepare(`SELECT users.*,sessions.csrf,sessions.group_id FROM sessions JOIN users ON users.id=sessions.user_id
      WHERE token_hash=? AND expires>?`).get(hash, Date.now()) as (UserRow & { csrf: string; group_id: string }) | undefined;
    return row && { viewer: viewer(row), csrf: row.csrf, tokenHash: hash, groupId: row.group_id };
  }

  profiles(session: Session): Viewer[] {
    return (this.db.prepare(`SELECT users.* FROM sessions JOIN users ON users.id=sessions.user_id
      WHERE group_id=? AND expires>? ORDER BY users.role,users.name,users.id`).all(session.groupId, Date.now()) as UserRow[]).map(viewer);
  }

  switchProfile(session: Session, userId: string): { token: string; session: Session } {
    const row = this.db.prepare(`SELECT users.*,sessions.token_hash,sessions.expires FROM sessions JOIN users ON users.id=sessions.user_id
      WHERE group_id=? AND user_id=? AND expires>?`).get(session.groupId, userId, Date.now()) as (UserRow & { token_hash: string; expires: number }) | undefined;
    if (!row) throw new PortalError(404, "Сессия профиля завершена. Добавьте его заново с почтой и паролем.");
    return this.transaction(() => {
      this.db.prepare("DELETE FROM sessions WHERE token_hash=?").run(row.token_hash);
      // Switching rotates the token and CSRF but never extends the original login lifetime.
      return this.createSession(viewer(row), session.groupId, row.expires);
    });
  }

  logout(session: Session) { this.db.prepare("DELETE FROM sessions WHERE group_id=?").run(session.groupId); }

  changePassword(session: Session, current: string, replacement: string) {
    const row = this.db.prepare("SELECT * FROM users WHERE id=?").get(session.viewer.id) as UserRow;
    if (!verifyPassword(current, row.password)) throw new PortalError(400, "Текущий пароль указан неверно.");
    if (current === replacement) throw new PortalError(400, "Новый пароль должен отличаться от временного.");
    const password = hashPassword(replacement);
    this.transaction(() => {
      this.db.prepare("UPDATE users SET password=?,must_change=0 WHERE id=?").run(password, row.id);
      this.db.prepare("DELETE FROM sessions WHERE user_id=? AND token_hash!=?").run(row.id, session.tokenHash);
    });
  }

  delivered(deliveryId: string): boolean {
    return this.db.prepare("INSERT OR IGNORE INTO deliveries(id,created_at) VALUES(?,?)").run(deliveryId, now()).changes > 0;
  }

  enqueue(kind: string, payload: Record<string, string>, jobId = id()) {
    this.db.prepare("INSERT OR IGNORE INTO jobs(id,kind,payload,available) VALUES(?,?,?,?)").run(jobId, kind, JSON.stringify(payload), Date.now());
  }
}
