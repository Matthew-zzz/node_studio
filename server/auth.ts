import { createHmac, randomBytes, randomInt, timingSafeEqual } from "node:crypto";
import { PortalError, tokenHash } from "./store.ts";
import type { PortalStore, Session } from "./store.ts";
import type { PortalConfig } from "./config.ts";
import type { Integrations } from "./integrations.ts";
import type { Role, Viewer } from "../src/features/portal/model/types.ts";
import { ROLE_LABELS } from "../src/features/portal/model/types.ts";
import type { EmailChallenge, RecoveryDetails } from "../src/features/portal/model/auth.ts";
import { seal, unseal } from "./secret-box.ts";
import { updateErrorContext } from "./error-context.ts";

const CODE_TTL = 10 * 60_000;
const RESEND_DELAY = 60_000;
const RESET_TTL = 30 * 60_000;
const SECURITY_LINK_TTL = 24 * 60 * 60_000;
const opaque = (value: string) => /^[a-f0-9]{64}$/.test(value);
const masked = (email: string) => { const [name, domain] = email.split("@"); return `${name!.slice(0, 2)}***@${domain}`; };
export interface LoginMetadata { address: string; agent: string }
interface ChallengeRow { id: string; user_id: string; email: string; credential_hash: string; code_hash: string; created_at: number; expires: number; attempts: number; resend_at: number; group_id: string; parent_token: string }
interface RecoveryRow { token_hash: string; user_id: string; email: string; credential_hash: string; expires: number }
type Authenticated = { token: string; session: Session };
type Started = Authenticated | { token: string; challenge: EmailChallenge };

/** Passwords and mailbox proof are separate steps; no authenticated cookie exists before both. */
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

  session(token: string): Session | undefined {
    const session = this.store.session(token);
    return session && this.verified(session, session.viewer.email) ? session : undefined;
  }

  private describe(row: ChallengeRow): EmailChallenge {
    const user = this.store.user(row.user_id)!;
    return { kind: "verification", email: masked(row.email), role: user.role, expiresAt: row.expires, resendAt: row.resend_at };
  }

  private challenge(token: string, current?: Session): ChallengeRow {
    const row = opaque(token) ? this.store.db.prepare("SELECT * FROM auth_challenges WHERE id=?").get(tokenHash(token)) as unknown as ChallengeRow | undefined : undefined;
    if (!row || row.expires <= Date.now() || row.attempts >= 5 || row.credential_hash !== this.store.credentialHash(row.user_id)
      || (row.group_id && (!current || current.groupId !== row.group_id || row.parent_token !== current.tokenHash
        || !this.store.db.prepare("SELECT 1 FROM sessions WHERE token_hash=? AND expires>?").get(row.parent_token, Date.now())))) {
      throw new PortalError(401, "Подтверждение истекло. Введите почту и пароль заново.");
    }
    return row;
  }

  pending(token: string, current?: Session) { return this.describe(this.challenge(token, current)); }

  async begin(email: string, password: string, role: Role | undefined, metadata: LoginMetadata, current?: Session): Promise<Started> {
    this.cleanup();
    const user = this.store.authenticatePassword(email, password, metadata.address, role);
    updateErrorContext({ actor: user }); this.mailReady();
    if (current && this.verified(current, user.email)) {
      return this.store.loginVerified(user.id, current, result => this.store.grantIdentityProfiles(result.session));
    }
    this.limit(`send:${user.email}`, 10, 3_600_000);
    const recent = this.store.db.prepare("SELECT resend_at FROM auth_challenges WHERE email=? AND resend_at>? LIMIT 1").get(user.email, Date.now());
    if (recent) throw new PortalError(429, "Код уже отправлен. Подождите минуту перед новым запросом.");
    const token = randomBytes(32).toString("hex"); const epoch = Date.now(); const code = randomInt(0, 1_000_000).toString().padStart(6, "0");
    const row: ChallengeRow = { id: tokenHash(token), user_id: user.id, email: user.email, credential_hash: this.store.credentialHash(user.id), code_hash: this.codeHash(tokenHash(token), code), created_at: epoch, expires: epoch + CODE_TTL, attempts: 0, resend_at: epoch + RESEND_DELAY, group_id: current?.groupId ?? "", parent_token: current?.tokenHash ?? "" };
    this.store.db.prepare("INSERT INTO auth_challenges(id,user_id,email,credential_hash,code_hash,created_at,expires,resend_at,group_id,parent_token) VALUES(?,?,?,?,?,?,?,?,?,?)").run(row.id, row.user_id, row.email, row.credential_hash, row.code_hash, row.created_at, row.expires, row.resend_at, row.group_id, row.parent_token);
    try { await this.sendCode(user.email, code, row.id); }
    catch (error) { this.store.db.prepare("DELETE FROM auth_challenges WHERE id=?").run(row.id); throw error; }
    return { token, challenge: this.describe(row) };
  }

  private async sendCode(email: string, code: string, deliveryId: string) {
    await this.integrations.mail(email, `Код для входа в Node Studio: ${code}\n\nДействует 10 минут. Никому не сообщайте код.\nЕсли вы не входили в кабинет, не передавайте код и проверьте безопасность вашей почты.`, `code:${deliveryId}`, "Код для входа — Node Studio");
  }

  async resend(token: string, current?: Session): Promise<EmailChallenge> {
    const row = this.challenge(token, current); this.mailReady();
    if (row.resend_at > Date.now()) throw new PortalError(429, "Повторный код можно запросить через минуту.");
    this.limit(`send:${row.email}`, 10, 3_600_000);
    const code = randomInt(0, 1_000_000).toString().padStart(6, "0"); const epoch = Date.now();
    this.store.db.prepare("UPDATE auth_challenges SET code_hash=?,expires=?,resend_at=? WHERE id=?").run(this.codeHash(row.id, code), epoch + CODE_TTL, epoch + RESEND_DELAY, row.id);
    await this.sendCode(row.email, code, `${row.id}:${epoch}`);
    return this.pending(token, current);
  }

  verify(token: string, code: string, metadata: LoginMetadata, current?: Session): Authenticated {
    const row = this.challenge(token, current);
    this.limit(`verify:${row.email}`, 20, 900_000);
    this.store.db.prepare("UPDATE auth_challenges SET attempts=attempts+1 WHERE id=?").run(row.id);
    const supplied = this.codeHash(row.id, code);
    if (!/^\d{6}$/.test(code) || !timingSafeEqual(Buffer.from(row.code_hash), Buffer.from(supplied))) throw new PortalError(400, "Код указан неверно. Проверьте последнее письмо.");
    const user = this.store.user(row.user_id)!; updateErrorContext({ actor: user });
    return this.store.loginVerified(user.id, row.group_id ? current : undefined, result => {
      if (!this.store.db.prepare("DELETE FROM auth_challenges WHERE id=?").run(row.id).changes) throw new PortalError(401, "Код уже использован.");
      this.store.db.prepare("INSERT INTO auth_verifications(group_id,email,expires) VALUES(?,?,?) ON CONFLICT(group_id,email) DO UPDATE SET expires=excluded.expires").run(result.session.groupId, user.email, this.store.sessionDeadline(result.session));
      this.store.grantIdentityProfiles(result.session);
      this.loginNotice(user, metadata);
    });
  }

  private recovery(user: Viewer, ttl: number): string {
    const token = randomBytes(32).toString("hex");
    this.store.db.prepare("INSERT INTO auth_recoveries(token_hash,user_id,email,credential_hash,expires) VALUES(?,?,?,?,?)").run(tokenHash(token), user.id, user.email, this.store.credentialHash(user.id), Date.now() + ttl);
    return token;
  }

  private queueMail(user: Viewer, content: string, subject: string, recoveryHash = "") {
    this.store.enqueue("auth.mail", { email: user.email, content: seal(content, this.config.encryptionKey), subject, recoveryHash });
  }

  private loginNotice(user: Viewer, metadata: LoginMetadata) {
    const token = this.recovery(user, SECURITY_LINK_TTL);
    const time = new Date().toLocaleString("ru-RU", { timeZone: "Europe/Moscow" });
    this.queueMail(user, `Выполнен вход в Node Studio.\n\nВремя: ${time} (Москва)\nПрофиль: ${ROLE_LABELS[user.role]}\nIP: ${metadata.address.slice(0, 100)}\nУстройство: ${metadata.agent.slice(0, 300)}\n\nЕсли это были не вы, перейдите по ссылке, задайте новый пароль и завершите все сеансы:\n${this.config.origin}/recover/#${token}\n\nСсылка действует 24 часа. Открытие ссылки само по себе не меняет пароль.`, "Новый вход — Node Studio", tokenHash(token));
  }

  requestRecovery(email: string, role: Role | undefined, address: string) {
    this.cleanup();
    this.mailReady(); this.limit(`recovery-ip:${address}`, 10, 3_600_000);
    // Identical response and no upstream request here, regardless of account existence.
    try { this.limit(`recovery-email:${email.toLowerCase()}`, 3, 3_600_000); } catch (error) { if (error instanceof PortalError && error.status === 429) return false; throw error; }
    const user = this.store.findUser(email, role); if (!user) return false;
    this.store.transaction(() => {
      const token = this.recovery(user, RESET_TTL);
      this.queueMail(user, `Вы запросили смену пароля Node Studio.\n\nОткройте ссылку и задайте новый пароль:\n${this.config.origin}/recover/#${token}\n\nСсылка действует 30 минут и используется один раз. После смены пароля все сеансы профилей на этой почте будут завершены. Если вы не отправляли запрос, просто проигнорируйте письмо.`, "Восстановление доступа — Node Studio", tokenHash(token));
    });
    return true;
  }

  private recoveryRow(token: string): RecoveryRow {
    const row = opaque(token) ? this.store.db.prepare("SELECT * FROM auth_recoveries WHERE token_hash=?").get(tokenHash(token)) as unknown as RecoveryRow | undefined : undefined;
    if (!row || row.expires <= Date.now() || row.credential_hash !== this.store.credentialHash(row.user_id)) throw new PortalError(400, "Ссылка недействительна или уже использована. Запросите новую на странице входа.");
    return row;
  }

  recoveryDetails(token: string): RecoveryDetails { const row = this.recoveryRow(token); return { email: masked(row.email), expiresAt: row.expires }; }

  reset(token: string, replacement: string) {
    this.store.transaction(() => {
      const row = this.recoveryRow(token); const user = this.store.user(row.user_id)!;
      this.store.resetIdentityPassword(row.email, replacement);
      this.queueMail(user, `Пароль Node Studio изменён.\nВсе сеансы профилей на вашей почте завершены. Для входа используйте новый пароль и новый код из письма.\n\n${this.config.origin}/cabinet/\n\nЕсли вы не меняли пароль, обратитесь в поддержку: https://t.me/node_studio_bot`, "Пароль изменён — Node Studio");
    });
  }

  async deliverMail(payload: Record<string, string>, deliveryId: string) {
    if (payload.recoveryHash) {
      const row = this.store.db.prepare("SELECT * FROM auth_recoveries WHERE token_hash=?").get(payload.recoveryHash) as unknown as RecoveryRow | undefined;
      if (!row || row.expires <= Date.now() || row.credential_hash !== this.store.credentialHash(row.user_id)) return;
    }
    await this.integrations.mail(payload.email!, unseal(payload.content!, this.config.encryptionKey), deliveryId, payload.subject);
  }
}
