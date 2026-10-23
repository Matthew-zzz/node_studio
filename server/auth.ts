import { createHmac, randomBytes, randomInt, timingSafeEqual } from "node:crypto";
import { PortalError, tokenHash, SESSION_LIFETIME } from "./store.ts";
import type { PortalStore, Session } from "./store.ts";
import type { PortalConfig } from "./config.ts";
import type { Integrations } from "./integrations.ts";
import type { Role, Viewer } from "../src/features/portal/model/types.ts";
import { ROLE_LABELS } from "../src/features/portal/model/types.ts";
import type { EmailChallenge, RecoveryDetails } from "../src/features/portal/model/auth.ts";
import { seal, unseal } from "./secret-box.ts";
import { updateErrorContext } from "./error-context.ts";
import { allowedProfileRoles } from "../src/features/portal/model/profile-policy.ts";

const CODE_TTL = 10 * 60_000;
const RESEND_DELAY = 60_000;
const SECURITY_LINK_TTL = 24 * 60 * 60_000;
const opaque = (value: string) => /^[a-f0-9]{64}$/.test(value);
const masked = (email: string) => { const [name, domain] = email.split("@"); return `${name!.slice(0, 2)}***@${domain}`; };
export interface LoginMetadata { address: string; agent: string }
interface ChallengeRow { id: string; user_id: string | null; email: string; credential_hash: string; code_hash: string; created_at: number; expires: number; attempts: number; resend_at: number; group_id: string; parent_token: string; requested_role: Role; context: string }
interface RecoveryRow { token_hash: string; user_id: string; email: string; credential_hash: string; expires: number }
type Authenticated = { token: string; session: Session };
type Started = Authenticated | { token: string; challenge: EmailChallenge };

/** A mailbox code is the sole HTTP login credential; unknown accounts get an indistinguishable challenge. */
export class PortalAuth {
  private store: PortalStore;
  private integrations: Integrations;
  private config: PortalConfig;
  private cleanedAt = 0;
  constructor(store: PortalStore, integrations: Integrations, config: PortalConfig) { this.store = store; this.integrations = integrations; this.config = config; }

  cleanup() {
    const epoch = Date.now(); if (epoch - this.cleanedAt < 300_000) return;
    this.store.transaction(() => {
      this.store.db.prepare("DELETE FROM sessions WHERE expires<=?").run(epoch);
      this.store.db.prepare("DELETE FROM auth_verifications WHERE expires<=? OR group_id NOT IN (SELECT group_id FROM sessions)").run(epoch);
      this.store.db.prepare("DELETE FROM auth_profile_verifications WHERE expires<=? OR group_id NOT IN (SELECT group_id FROM sessions)").run(epoch);
      this.store.db.prepare("DELETE FROM auth_session_contexts WHERE group_id NOT IN (SELECT group_id FROM sessions)").run();
      this.store.db.prepare("DELETE FROM auth_challenges WHERE expires<=?").run(epoch);
      this.store.db.prepare("DELETE FROM auth_recoveries WHERE expires<=?").run(epoch);
      this.store.db.prepare("DELETE FROM auth_limits WHERE since<?").run(epoch - 86_400_000);
      this.store.db.prepare("DELETE FROM login_limits WHERE since<?").run(epoch - 900_000);
    });
    this.cleanedAt = epoch;
  }

  private limit(key: string, max: number, window: number) {
    const epoch = Date.now(); const digest = tokenHash(key);
    const row = this.store.db.prepare("SELECT attempts,since FROM auth_limits WHERE key=?").get(digest);
    if (row && epoch - Number(row.since) < window && Number(row.attempts) >= max) throw new PortalError(429, "Слишком много попыток. Попробуйте позже.");
    this.store.db.prepare(`INSERT INTO auth_limits(key,attempts,since) VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET
      attempts=CASE WHEN ?-since>=? THEN 1 ELSE attempts+1 END,since=CASE WHEN ?-since>=? THEN ? ELSE since END`).run(digest, epoch, epoch, window, epoch, window, epoch);
  }

  private codeHash(challengeId: string, code: string) { return createHmac("sha256", this.config.encryptionKey).update(`${challengeId}:${code}`).digest("hex"); }
  private mailReady() { if (!this.integrations.ready.mail || !/^[a-f0-9]{64}$/.test(this.config.encryptionKey)) throw new PortalError(503, "Подтверждение входа временно недоступно. Обратитесь в поддержку."); }
  private verified(session: Session, email: string): boolean {
    return Boolean(this.store.db.prepare("SELECT 1 FROM auth_verifications WHERE group_id=? AND email=? AND expires>?").get(session.groupId, email, Date.now()));
  }

  session(token: string, context = "web"): Session | undefined {
    const session = this.store.session(token);
    if (!session || !this.matchesContext(session, context) || !this.verified(session, session.viewer.email) || !this.profileVerified(session, session.viewer)) return;
    if (session.viewer.mustChangePassword) this.store.transaction(() => this.store.confirmProfile(session));
    return session;
  }

  private matchesContext(session: Session, context: string) {
    const bound = this.store.db.prepare("SELECT context FROM auth_session_contexts WHERE group_id=?").get(session.groupId);
    return bound ? bound.context === context : context === "web";
  }

  private bindContext(session: Session, context: string) {
    const bound = this.store.db.prepare("SELECT context FROM auth_session_contexts WHERE group_id=?").get(session.groupId);
    if (bound && bound.context !== context) throw new PortalError(401, "Подтвердите вход в текущем профиле.");
    this.store.db.prepare("INSERT OR IGNORE INTO auth_session_contexts(group_id,context) VALUES(?,?)").run(session.groupId, context);
  }

  private profileVerified(session: Session, user: Viewer) {
    return Boolean(this.store.db.prepare("SELECT 1 FROM auth_profile_verifications WHERE group_id=? AND user_id=? AND role=? AND expires>?").get(session.groupId, user.id, user.role, Date.now()));
  }

  profiles(session: Session) { return this.store.profiles(session).filter(user => this.verified(session, user.email) && this.profileVerified(session, user)); }

  switchProfile(session: Session, userId: string) {
    const user = this.profiles(session).find(user => user.id === userId);
    if (!user) throw new PortalError(404, "Профиль не подтверждён в этой сессии.");
    return this.store.switchProfile(session, user.id);
  }

  private describe(row: ChallengeRow): EmailChallenge {
    return { kind: "verification", email: masked(row.email), role: row.requested_role, expiresAt: row.expires, resendAt: row.resend_at };
  }

  private validIdentity(row: ChallengeRow) {
    const user = row.user_id ? this.store.user(row.user_id) : undefined;
    return !row.user_id || (row.credential_hash === this.store.credentialHash(row.user_id) && user?.email === row.email && user.role === row.requested_role);
  }

  private challenge(token: string, current?: Session, context = "web"): ChallengeRow {
    const row = opaque(token) ? this.store.db.prepare("SELECT * FROM auth_challenges WHERE id=?").get(tokenHash(token)) as unknown as ChallengeRow | undefined : undefined;
    if (!row || row.context !== context || row.expires <= Date.now() || row.attempts >= 5 || !this.validIdentity(row)
      || (row.group_id && (!current || current.groupId !== row.group_id || row.parent_token !== current.tokenHash
        || !allowedProfileRoles(current.viewer.role).includes(row.requested_role)
        || !this.store.db.prepare("SELECT 1 FROM sessions WHERE token_hash=? AND expires>?").get(row.parent_token, Date.now())))) {
      throw new PortalError(401, "Подтверждение истекло. Запросите новый код на странице входа.");
    }
    return row;
  }

  pending(token: string, current?: Session, context = "web") { return this.describe(this.challenge(token, current, context)); }

  cancel(token: string, current?: Session, context = "web") {
    try { const row = this.challenge(token, current, context); this.store.db.prepare("DELETE FROM auth_challenges WHERE id=?").run(row.id); }
    catch (error) { if (!(error instanceof PortalError) || error.status !== 401) throw error; }
  }

  async begin(inputEmail: string, role: Role | undefined, metadata: LoginMetadata, current?: Session, context = "web"): Promise<Started> {
    this.cleanup(); this.mailReady();
    if (current && !this.matchesContext(current, context)) throw new PortalError(401, "Подтвердите вход в текущем профиле.");
    const email = inputEmail.trim().toLowerCase(); const requestedRole = role ?? "client";
    if (current && !allowedProfileRoles(current.viewer.role).includes(requestedRole)) throw new PortalError(403, "Вход в эту роль недоступен из текущего профиля.");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new PortalError(400, "Проверьте почту.");
    this.limit(`login-ip:${metadata.address}`, 30, 900_000);
    const user = this.store.findUser(email, requestedRole);
    if (user) updateErrorContext({ actor: user });
    if (user && current && current.viewer.role === user.role && this.verified(current, email)) return this.store.loginVerified(user.id, current, result => { this.bindContext(result.session, context); this.store.confirmProfile(result.session); });
    const token = randomBytes(32).toString("hex"); const epoch = Date.now(); const code = randomInt(0, 1_000_000).toString().padStart(6, "0");
    const row: ChallengeRow = { id: tokenHash(token), user_id: user?.id ?? null, email, credential_hash: user ? this.store.credentialHash(user.id) : "", code_hash: this.codeHash(tokenHash(token), code), created_at: epoch, expires: epoch + CODE_TTL, attempts: 0, resend_at: epoch + RESEND_DELAY, group_id: current?.groupId ?? "", parent_token: current?.tokenHash ?? "", requested_role: requestedRole, context };
    this.store.transaction(() => {
      this.limit(`send:${email}`, 10, 3_600_000);
      if (this.store.db.prepare("SELECT 1 FROM auth_challenges WHERE email=? AND resend_at>? LIMIT 1").get(email, epoch)) throw new PortalError(429, "Код уже запрошен. Подождите минуту перед новым запросом.");
      this.store.db.prepare("INSERT INTO auth_challenges(id,user_id,email,credential_hash,code_hash,created_at,expires,resend_at,group_id,parent_token,requested_role,context) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)")
        .run(row.id, row.user_id, row.email, row.credential_hash, row.code_hash, row.created_at, row.expires, row.resend_at, row.group_id, row.parent_token, row.requested_role, row.context);
      if (user) this.queueCode(row, code);
    });
    return { token, challenge: this.describe(row) };
  }

  private queueCode(row: ChallengeRow, code: string) {
    const content = `Код для входа в Node Studio: ${code}\nПрофиль: ${ROLE_LABELS[row.requested_role]}\n\nДействует 10 минут и используется один раз. Никому не сообщайте код.\nЕсли вы не входили в кабинет, проигнорируйте письмо и проверьте безопасность вашей почты.`;
    this.store.enqueue("auth.mail", { email: row.email, content: seal(content, this.config.encryptionKey), subject: "Код для входа — Node Studio", challengeId: row.id, codeHash: row.code_hash }, `code:${row.id}:${row.code_hash}`);
  }

  async resend(token: string, current?: Session, context = "web"): Promise<EmailChallenge> {
    const row = this.challenge(token, current, context); this.mailReady();
    if (row.resend_at > Date.now()) throw new PortalError(429, "Повторный код можно запросить через минуту.");
    let code: string; do { code = randomInt(0, 1_000_000).toString().padStart(6, "0"); } while (this.codeHash(row.id, code) === row.code_hash);
    const epoch = Date.now();
    this.store.transaction(() => {
      this.limit(`send:${row.email}`, 10, 3_600_000);
      const next = { ...row, code_hash: this.codeHash(row.id, code), expires: epoch + CODE_TTL, resend_at: epoch + RESEND_DELAY };
      this.store.db.prepare("UPDATE auth_challenges SET code_hash=?,expires=?,resend_at=? WHERE id=?").run(next.code_hash, next.expires, next.resend_at, row.id);
      if (row.user_id) this.queueCode(next, code);
    });
    return this.pending(token, current, context);
  }

  verify(token: string, code: string, metadata: LoginMetadata, current?: Session, context = "web"): Authenticated {
    const row = this.challenge(token, current, context);
    this.limit(`verify:${row.email}`, 20, 900_000);
    this.limit(`verify-ip:${metadata.address}`, 50, 900_000);
    this.store.db.prepare("UPDATE auth_challenges SET attempts=attempts+1 WHERE id=?").run(row.id);
    const supplied = this.codeHash(row.id, code);
    if (!/^\d{6}$/.test(code) || !timingSafeEqual(Buffer.from(row.code_hash), Buffer.from(supplied)) || !row.user_id) throw new PortalError(400, "Код указан неверно. Проверьте последнее письмо.");
    const user = this.store.user(row.user_id)!; updateErrorContext({ actor: user });
    return this.store.loginVerified(user.id, row.group_id ? current : undefined, result => {
      if (!this.store.db.prepare("DELETE FROM auth_challenges WHERE id=?").run(row.id).changes) throw new PortalError(401, "Код уже использован.");
      this.bindContext(result.session, context);
      this.store.db.prepare("INSERT INTO auth_verifications(group_id,email,expires) VALUES(?,?,?) ON CONFLICT(group_id,email) DO UPDATE SET expires=excluded.expires").run(result.session.groupId, user.email, this.store.sessionDeadline(result.session));
      this.store.confirmProfile(result.session);
      this.loginNotice(result.session.viewer, metadata);
    }, context.startsWith("telegram:") ? 30 * 24 * 60 * 60_000 : SESSION_LIFETIME);
  }

  private recovery(user: Viewer): string {
    const token = randomBytes(32).toString("hex");
    this.store.db.prepare("INSERT INTO auth_recoveries(token_hash,user_id,email,credential_hash,expires) VALUES(?,?,?,?,?)")
      .run(tokenHash(token), user.id, user.email, this.store.credentialHash(user.id), Date.now() + SECURITY_LINK_TTL);
    return token;
  }

  private queueMail(user: Viewer, content: string, subject: string, recoveryHash = "") {
    this.store.enqueue("auth.mail", { email: user.email, content: seal(content, this.config.encryptionKey), subject, recoveryHash });
  }

  private loginNotice(user: Viewer, metadata: LoginMetadata) {
    const token = this.recovery(user);
    const time = new Date().toLocaleString("ru-RU", { timeZone: "Europe/Moscow" });
    this.queueMail(user, `Выполнен вход в Node Studio.\n\nВремя: ${time} (Москва)\nПрофиль: ${ROLE_LABELS[user.role]}\nIP: ${metadata.address.slice(0, 100)}\nУстройство: ${metadata.agent.slice(0, 300)}\n\nЕсли это были не вы, перейдите по ссылке и завершите все сеансы:\n${this.config.origin}/recover/#${token}\n\nСсылка действует 24 часа. Открытие ссылки само по себе не завершает сеансы. Для повторного входа понадобится новый код из письма. Если почта скомпрометирована, сначала защитите свой почтовый аккаунт.`, "Новый вход — Node Studio", tokenHash(token));
  }

  private recoveryRow(token: string): RecoveryRow {
    const row = opaque(token) ? this.store.db.prepare("SELECT * FROM auth_recoveries WHERE token_hash=?").get(tokenHash(token)) as unknown as RecoveryRow | undefined : undefined;
    if (!row || row.expires <= Date.now() || row.credential_hash !== this.store.credentialHash(row.user_id)) throw new PortalError(400, "Ссылка недействительна или уже использована. Войдите по коду из письма.");
    return row;
  }

  recoveryDetails(token: string): RecoveryDetails { const row = this.recoveryRow(token); return { email: masked(row.email), expiresAt: row.expires }; }

  revoke(token: string) { this.store.transaction(() => this.revokeIdentity(this.recoveryRow(token).user_id)); }

  logoutAll(session: Session) { this.store.transaction(() => this.revokeIdentity(session.viewer.id)); }

  private revokeIdentity(userId: string) {
    const user = this.store.user(userId); if (!user) throw new PortalError(401, "Войдите в кабинет.");
    this.store.revokeIdentitySessions(user.email);
    this.queueMail(user, `Все сеансы Node Studio на вашей почте завершены. Коды и ссылки, выданные до завершения сеансов, больше не действуют.\n\nДля входа запросите новый код:\n${this.config.origin}/cabinet/\n\nЕсли действие выполнили не вы, проверьте безопасность своей почты и обратитесь в поддержку: https://t.me/node_studio_bot`, "Все сеансы завершены — Node Studio");
  }

  async deliverMail(payload: Record<string, string>, deliveryId: string) {
    if (payload.staffUserId && this.store.user(payload.staffUserId)?.role !== "developer") return;
    if (payload.challengeId) {
      const row = this.store.db.prepare("SELECT * FROM auth_challenges WHERE id=?").get(payload.challengeId) as unknown as ChallengeRow | undefined;
      if (!row || !row.user_id || row.expires <= Date.now() || row.attempts >= 5 || row.code_hash !== payload.codeHash || !this.validIdentity(row)
        || (row.group_id && !this.store.db.prepare("SELECT 1 FROM sessions WHERE token_hash=? AND expires>?").get(row.parent_token, Date.now()))) return;
    }
    if (payload.recoveryHash) {
      const row = this.store.db.prepare("SELECT * FROM auth_recoveries WHERE token_hash=?").get(payload.recoveryHash) as unknown as RecoveryRow | undefined;
      if (!row || row.expires <= Date.now() || row.credential_hash !== this.store.credentialHash(row.user_id)) return;
    }
    await this.integrations.mail(payload.email!, unseal(payload.content!, this.config.encryptionKey), deliveryId, payload.subject);
  }
}
