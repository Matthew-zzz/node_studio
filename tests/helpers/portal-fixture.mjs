import { PortalStore } from "../../server/store.ts";
import { PortalService } from "../../server/service.ts";
import { readConfig } from "../../server/config.ts";
import { createPortalHandler } from "../../server/http.ts";

export const fixturePassword = "Fixture-password-2026";
const fixtures = new Map();
export const fixtureAt = origin => fixtures.get(origin);

export function portalFixture(origin = "http://localhost:3000") {
  const store = new PortalStore(":memory:");
  const config = readConfig({ PORTAL_ORIGIN: origin, PORTAL_MOCK_PAYMENTS: "true", PORTAL_MOCK_PROVISIONING: "true", PORTAL_ENCRYPTION_KEY: "ab".repeat(32), PORTAL_GITHUB_WEBHOOK_SECRET: "github-test-secret", PORTAL_TELEGRAM_WEBHOOK_SECRET: "telegram-test-secret" });
  const users = {};
  for (const role of ["client", "developer", "admin"]) users[role] = store.createUser(`${role}@example.test`, role, role, fixturePassword, false);
  users.other = store.createUser("other@example.test", "Другой клиент", "client", fixturePassword, false);
  users.temporary = store.createUser("temporary@example.test", "Новый клиент", "client", fixturePassword, true);
  const issues = new Map(); const commits = new Map(); const sent = []; const repositories = [];
  function work(repo, number, title, kind = "initial") { return { id: String(number), projectId: "", number, title, body: "Согласованный текст", kind, included: kind === "initial", status: "new", updatedAt: new Date().toISOString() }; }
  for (const [projectId, owner] of [["one", users.client], ["two", users.client], ["three", users.other]]) {
    const repo = `Matthew-zzz/fixture-${projectId}`;
    store.put("projects", { id: projectId, name: projectId, description: "Проект", clientId: owner.id, clientName: owner.name, clientEmail: owner.email, repo, brief: "Оплаченное ТЗ", status: "active", createdAt: new Date().toISOString() });
    store.put("conversations", { id: `chat-${projectId}`, kind: "project", projectId, name: projectId, username: "fixture", email: owner.email, telegramId: "", ownerId: null, ownerName: null, handoffRequested: false, updatedAt: new Date().toISOString() });
    store.put("messages", { id: `message-${projectId}`, threadId: `chat-${projectId}`, author: owner.name, role: "client", text: `Личная переписка ${projectId}`, createdAt: new Date().toISOString() });
    issues.set(repo, [work(repo, 1, "Основная работа"), work(repo, 2, "Пожелание", "wish")]);
    commits.set(repo, []);
  }
  const integrations = {
    ready: { github: true, telegram: true, ai: true, mail: true, payments: "mock" },
    async repository(repo) { return { fullName: repo, issuesEnabled: true, writable: true }; },
    async issues(repo) { return structuredClone(issues.get(repo) ?? []); },
    async commits(repo, page) { return structuredClone((commits.get(repo) ?? []).slice((page - 1) * 100, page * 100)); },
    async createRepository(name) { const repo = `Matthew-zzz/${name}`; if (!repositories.includes(repo)) repositories.push(repo); if (!issues.has(repo)) issues.set(repo, []); return repo; },
    async createIssue(repo, title, body, kind, marker) {
      const list = issues.get(repo) ?? []; const existing = list.find(issue => issue.marker === marker); if (existing) return existing;
      const issue = { ...work(repo, Math.max(0, ...list.map(issue => issue.number)) + 1, title, kind), body, marker };
      issues.set(repo, [...list, issue]); return issue;
    },
    async updateIssue(repo, number, changes) {
      const list = issues.get(repo); const existing = list?.find(issue => issue.number === number); if (!existing) throw new Error("Fixture issue missing");
      const updated = { ...existing, ...changes, updatedAt: new Date().toISOString() }; issues.set(repo, list.map(issue => issue.number === number ? updated : issue)); return updated;
    },
    async assistant(messages, kind) { return { reply: "Проверьте формулировку.", title: kind === "project" ? "Подготовленная задача" : "", body: kind === "project" ? messages.at(-1).text : "", handoff: false }; },
    async brief() { return { name: "Проект клиента", goal: "Каталог с поиском", audience: "Покупатели", features: "Поиск товаров", design: "Мобильный интерфейс", integrations: "Не указано", constraints: "Не указано", acceptance: "Требует согласования", questions: "Уточнить состав каталога" }; },
    async embed(inputs) { return inputs.map(() => [1, 0, 0]); },
    async telegram(chatId, text, html) { sent.push({ chatId, text, html }); },
    async mail(email, content, deliveryId, subject) { sent.push({ email, content, deliveryId, subject }); },
  };
  const service = new PortalService(store, integrations, config);
  // Business-domain tests create authenticated fixtures directly; HTTP/browser tests use real email challenges.
  const login = role => {
    const result = store.login(users[role].email, fixturePassword, "fixture");
    store.db.prepare("INSERT INTO auth_verifications(group_id,email,expires) VALUES(?,?,?)").run(result.session.groupId, result.session.viewer.email, store.sessionDeadline(result.session));
    return result;
  };
  const fixture = { store, config, integrations, service, users, login, issues, commits, sent, repositories, handler: createPortalHandler(service, config), close: () => { if (fixtures.get(origin) === fixture) fixtures.delete(origin); store.close(); } };
  fixtures.set(origin, fixture); return fixture;
}
