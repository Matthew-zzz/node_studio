import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { PortalError, PortalStore, id, now } from "./store.ts";
import type { Session } from "./store.ts";
import { integer, object, status, text } from "./validation.ts";
import type { Integrations } from "./integrations.ts";
import type { PortalConfig } from "./config.ts";
import { EMPTY_SNAPSHOT } from "../src/features/portal/model/types.ts";
import type { Conversation, PortalProject, PortalSnapshot, ProjectOrder, Role, Viewer, WorkItem } from "../src/features/portal/model/types.ts";
import { visibleSnapshot } from "../src/features/portal/model/access.ts";
import { createPaymentQuote } from "../src/features/payments/model/payment.ts";
import { TelegramAgent } from "./agent/service.ts";
import { formatTelegramHtml } from "../src/features/portal/model/telegram-html.ts";

export const projectGreeting = "Я помогу разобраться по проекту и сформулировать задачу. Если захотите поговорить с разработчиком, просто попросите — я его позову.";
export const telegramGreeting = "Я помогу собрать пожелания по проекту. Если захотите поговорить с куратором, просто попросите — я его позову.";

interface SyncInfo { at: string; pages: number; more: boolean; error: string | null }
interface Job { id: string; kind: string; payload: string; attempts: number }

export class PortalService {
  readonly store: PortalStore;
  readonly integrations: Integrations;
  readonly config: PortalConfig;
  readonly agent: TelegramAgent;
  private locks = new Map<string, Promise<unknown>>();
  private synced = new Map<string, SyncInfo>();
  private working = false;

  constructor(store: PortalStore, integrations: Integrations, config: PortalConfig) {
    this.store = store; this.integrations = integrations; this.config = config;
    this.agent = new TelegramAgent(store, integrations, config);
  }

  private async exclusive<T>(key: string, action: () => Promise<T>): Promise<T> {
    const previous = this.locks.get(key) ?? Promise.resolve();
    const next = previous.catch(() => undefined).then(action);
    this.locks.set(key, next);
    try { return await next; } finally { if (this.locks.get(key) === next) this.locks.delete(key); }
  }

  private role(viewer: Viewer, roles: Role[]) {
    if (viewer.mustChangePassword) throw new PortalError(403, "Сначала смените временный пароль.");
    if (!roles.includes(viewer.role)) throw new PortalError(403, "Недостаточно прав.");
  }

  private project(viewer: Viewer, projectId: string): PortalProject {
    this.role(viewer, ["client", "developer"]);
    const project = this.store.get("projects", projectId);
    if (!project || (viewer.role === "client" && project.clientId !== viewer.id)) throw new PortalError(404, "Проект не найден.");
    return project;
  }

  private thread(viewer: Viewer, threadId: string): Conversation {
    const thread = this.store.get("conversations", threadId);
    if (!thread) throw new PortalError(404, "Диалог не найден.");
    if (thread.kind === "telegram") this.role(viewer, ["curator"]);
    else this.project(viewer, thread.projectId);
    return thread;
  }

  private work(project: PortalProject, number: number, kind: "tasks" | "stages" = "tasks"): WorkItem {
    const item = this.store.all(kind, project.id).find(item => item.number === number);
    if (!item) throw new PortalError(404, "Задача не найдена. Обновите данные из GitHub.");
    return item;
  }

  private saveWork(projectId: string, work: WorkItem) {
    return this.store.put(work.kind === "stage" ? "stages" : "tasks", { ...work, id: `${projectId}:${work.number}`, projectId });
  }

  async sync(project: PortalProject, pages = 1, force = false): Promise<void> {
    return this.exclusive(`github:${project.id}`, async () => {
      const previous = this.synced.get(project.id);
      if (!force && previous && !previous.error && previous.pages >= pages && Date.now() - Date.parse(previous.at) < 15_000) return;
      try {
        const issues = await this.integrations.issues(project.repo);
        const commits = [];
        let more = false;
        for (let page = 1; page <= pages; page++) {
          const batch = await this.integrations.commits(project.repo, page);
          commits.push(...batch.map(commit => ({ ...commit, projectId: project.id, id: `${project.id}:${commit.sha}` })));
          more = batch.length === 100;
          if (!more) break;
        }
        this.store.replace("tasks", project.id, issues.filter(item => item.kind !== "stage").map(item => ({ ...item, id: `${project.id}:${item.number}`, projectId: project.id })));
        this.store.replace("stages", project.id, issues.filter(item => item.kind === "stage").map(item => ({ ...item, id: `${project.id}:${item.number}`, projectId: project.id })));
        this.store.replace("commits", project.id, commits);
        const initial = issues.find(issue => issue.kind === "initial");
        if (initial) this.store.put("projects", { ...this.store.get("projects", project.id)!, brief: initial.body });
        this.synced.set(project.id, { at: now(), pages, more, error: null });
      } catch (error) {
        this.synced.set(project.id, { at: previous?.at ?? "", pages: previous?.pages ?? 0, more: previous?.more ?? false, error: error instanceof PortalError ? error.message : "Не удалось обновить GitHub. Показаны последние полученные данные." });
        throw error;
      }
    });
  }

  async snapshot(session: Session, selectedId = "", pages = 1): Promise<PortalSnapshot> {
    const viewer = this.store.user(session.viewer.id);
    if (!viewer) throw new PortalError(401, "Войдите в кабинет.");
    const projects = this.store.all("projects").sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
    const allowed = projects.filter(project => viewer.role === "developer" || (viewer.role === "client" && project.clientId === viewer.id));
    const selected = allowed.find(project => project.id === selectedId) ?? allowed[0];
    if (!viewer.mustChangePassword && selected && ["developer", "client"].includes(viewer.role)) {
      await this.sync(selected, Math.min(Math.max(pages, 1), 1000)).catch(() => undefined);
      if (viewer.role === "developer") {
        for (const project of allowed.filter(project => project.id !== selected.id)) await this.sync(project).catch(() => undefined);
      }
    }
    const info = selected && this.synced.get(selected.id);
    const data: PortalSnapshot = {
      ...EMPTY_SNAPSHOT, viewer, profiles: this.store.profiles(session), csrf: session.csrf, projects: projects.map(project => this.store.get("projects", project.id)!),
      tasks: this.store.all("tasks"), stages: this.store.all("stages"), commits: this.store.all("commits").sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
      conversations: this.store.all("conversations"), messages: this.store.all("messages").sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
      drafts: this.store.all("drafts"), quotes: this.store.all("quotes"), orders: this.store.all("orders"),
      hasMoreCommits: info?.more ?? false, syncedAt: info?.at || null, syncError: info?.error ?? null, integrations: this.integrations.ready,
    };
    return visibleSnapshot(data, viewer, selected?.id);
  }

  private append(thread: Conversation, author: string, role: "client" | "developer" | "curator" | "assistant" | "system", message: string, messageId = id(), html?: string) {
    const result = this.store.put("messages", { id: messageId, threadId: thread.id, author, role, text: message, ...(html ? { html } : {}), createdAt: now() });
    if (thread.kind === "telegram" && role !== "client") this.store.enqueue("telegram.send", { chatId: thread.telegramId, text: message, ...(html ? { html } : {}) }, `send:${messageId}`);
    return result;
  }

  private administrator(session: Session): Viewer {
    const viewer = this.store.user(session.viewer.id);
    if (!viewer) throw new PortalError(401, "Войдите в кабинет.");
    this.role(viewer, ["admin"]); return viewer;
  }

  agentState(session: Session) { this.administrator(session); return this.agent.state(); }
  agentDocument(session: Session, documentId: unknown) { this.administrator(session); return this.agent.document(documentId); }
  agentExport(session: Session) { this.administrator(session); return { settings: this.agent.settings(), documents: this.store.all("agentDocuments") }; }
  async agentAction(session: Session, body: Record<string, unknown>) {
    const viewer = this.administrator(session);
    switch (text(body.type, 40)) {
      case "settings.save": return this.agent.saveSettings(body.settings, body.version, viewer);
      case "settings.restore": return this.agent.restore(body.revisionId, body.version, viewer);
      case "document.save": return this.agent.saveDocument(body.document, viewer);
      case "document.archive": return this.agent.archiveDocument(body.documentId, body.version, body.archived, viewer);
      case "reindex": return this.agent.reindex();
      case "preview": return this.agent.preview(body);
      default: throw new PortalError(400, "Неизвестное действие агента.");
    }
  }

  async action(session: Session, value: unknown): Promise<void> {
    const action = object(value);
    const viewer = this.store.user(session.viewer.id);
    if (!viewer) throw new PortalError(401, "Войдите в кабинет.");
    this.role(viewer, ["client", "developer", "curator"]);
    const type = text(action.type, 40);
    if (type === "project.accept") {
      this.role(viewer, ["developer"]);
      this.store.transaction(() => {
        const project = this.project(viewer, text(action.projectId, 100));
        if (project.status !== "active") throw new PortalError(409, "Дождитесь создания проекта.");
        if (project.developerId && project.developerId !== viewer.id) throw new PortalError(409, "Проект уже взят другим разработчиком.");
        if (!project.developerId) this.store.put("projects", { ...project, developerId: viewer.id, acceptedAt: now() });
      });
      return;
    }
    if (["message", "takeover", "leave"].includes(type)) {
      const threadId = text(action.threadId, 100);
      const thread = this.thread(viewer, threadId);
      if (type === "message") {
        const message = text(action.text, thread.kind === "telegram" ? 4000 : 8000);
        if (viewer.role !== "client" && thread.ownerId !== viewer.id) throw new PortalError(409, "Сначала подключитесь к диалогу.");
        this.store.transaction(() => {
          const entry = this.append(thread, viewer.name, viewer.role as "client" | "developer" | "curator", message);
          const handoff = viewer.role === "client" && /(?:позови|пригласи|подключи|хочу|нужен|нужна|вызови).{0,45}(?:человека|человек|разработчик|куратор|поддержк)/i.test(message);
          this.store.put("conversations", { ...thread, handoffRequested: thread.handoffRequested || handoff, revision: (thread.revision ?? 0) + 1, updatedAt: now() });
          if (handoff && !thread.ownerId) this.append(thread, "Node", "system", "Запрос передан. Человек подключится к этому диалогу.");
          if (viewer.role === "client" && !thread.ownerId && !handoff) this.store.enqueue("assistant", { threadId, messageId: entry.id });
        });
      } else {
        this.role(viewer, thread.kind === "project" ? ["developer"] : ["curator"]);
        this.store.transaction(() => {
          const latest = this.thread(viewer, threadId);
          if (type === "takeover" && latest.ownerId && latest.ownerId !== viewer.id) throw new PortalError(409, "Диалог уже ведёт другой сотрудник.");
          if (type === "leave" && latest.ownerId !== viewer.id) throw new PortalError(409, "Этот диалог ведёт другой сотрудник.");
          this.store.put("conversations", { ...latest, ownerId: type === "takeover" ? viewer.id : null, ownerName: type === "takeover" ? viewer.name : null, handoffRequested: false, revision: (latest.revision ?? 0) + 1, updatedAt: now() });
          this.append(latest, "Node", "system", type === "takeover" ? `${viewer.name} подключился к диалогу.` : "Диалог снова передан ИИ-помощнику.");
        });
      }
      return;
    }
    if (type === "draft.confirm") {
      this.role(viewer, ["client"]);
      const draft = this.store.get("drafts", text(action.draftId, 100));
      if (!draft) throw new PortalError(404, "Черновик не найден.");
      const project = this.project(viewer, draft.projectId);
      await this.exclusive(`write:${project.id}`, async () => {
        if (this.store.get("drafts", draft.id)?.confirmed) return;
        const issue = await this.integrations.createIssue(project.repo, draft.title, draft.body, "wish", `draft:${draft.id}`);
        this.store.transaction(() => {
          this.saveWork(project.id, issue);
          this.store.put("drafts", { ...draft, confirmed: true });
          const thread = this.thread(viewer, draft.threadId);
          this.append(thread, "Node", "system", `Задача #${issue.number} передана разработчику: ${draft.title}`);
        });
      });
      return;
    }
    if (["stage.save", "task.status", "task.include", "quote.create"].includes(type)) {
      this.role(viewer, ["developer"]);
      const project = this.project(viewer, text(action.projectId, 100));
      await this.exclusive(`write:${project.id}`, async () => {
        await this.sync(project, 1, true);
        const number = integer(action.number, type === "stage.save" ? 0 : 1);
        if (type === "stage.save") {
          const title = text(action.title, 200); const body = text(action.body, 8000, 0); const nextStatus = status(action.status);
          if (number) this.work(project, number, "stages");
          const issue = number ? await this.integrations.updateIssue(project.repo, number, { title, body, status: nextStatus })
            : await this.integrations.createIssue(project.repo, title, body, "stage", `stage:${id()}`);
          this.saveWork(project.id, !number && nextStatus !== "new" ? await this.integrations.updateIssue(project.repo, issue.number, { status: nextStatus }) : issue);
        } else {
          const task = this.work(project, number);
          if (type === "quote.create") {
            if (task.kind !== "wish" || task.included) throw new PortalError(409, "Для этой задачи отдельная оплата не нужна.");
            const quotes = this.store.all("quotes", project.id).filter(quote => quote.taskNumber === number);
            if (quotes.some(quote => quote.status === "paid")) throw new PortalError(409, "Задача уже оплачена.");
            const price = createPaymentQuote(id(), integer(action.baseKopecks), "wish");
            this.store.transaction(() => {
              quotes.filter(quote => quote.status === "pending").forEach(quote => this.store.put("quotes", { ...quote, status: "superseded" }));
              this.store.put("quotes", { id: price.reference, projectId: project.id, taskNumber: number, title: task.title, baseKopecks: price.baseKopecks, markupKopecks: price.markupKopecks, totalKopecks: price.totalKopecks, status: "pending", createdAt: now() });
            });
          } else if (type === "task.include") {
            if (this.store.all("quotes", project.id).some(quote => quote.taskNumber === number && quote.status === "paid")) throw new PortalError(409, "У задачи уже есть оплаченная оценка.");
            this.saveWork(project.id, await this.integrations.updateIssue(project.repo, number, { included: true }));
            this.store.all("quotes", project.id).filter(quote => quote.taskNumber === number && quote.status === "pending").forEach(quote => this.store.put("quotes", { ...quote, status: "superseded" }));
          } else {
            const nextStatus = status(action.status);
            if (["in_progress", "done"].includes(nextStatus) && !task.included && task.kind === "wish"
              && !this.store.all("quotes", project.id).some(quote => quote.taskNumber === number && quote.status === "paid")) throw new PortalError(409, "Дождитесь оплаты или отметьте, что задача входит в оплаченное ТЗ.");
            this.saveWork(project.id, await this.integrations.updateIssue(project.repo, number, { status: nextStatus }));
          }
        }
        this.synced.delete(project.id);
      });
      return;
    }
    if (type === "quote.pay") {
      this.role(viewer, ["client"]);
      if (!this.config.mockPayments) throw new PortalError(503, "Тестовая оплата отключена.");
      const quote = this.store.get("quotes", text(action.quoteId, 100));
      if (!quote) throw new PortalError(404, "Оценка не найдена.");
      this.project(viewer, quote.projectId);
      if (quote.status === "superseded") throw new PortalError(409, "Стоимость обновилась. Откройте новую оценку.");
      if (!["succeeded", "failed"].includes(String(action.outcome))) throw new PortalError(400, "Неизвестный результат оплаты.");
      if (action.outcome === "succeeded" && quote.status === "pending") this.store.put("quotes", { ...quote, status: "paid" });
      return;
    }
    if (type === "order.create") {
      this.role(viewer, ["curator"]);
      const input = object(action.order);
      const email = text(input.email, 254).toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new PortalError(400, "Проверьте почту клиента.");
      const existing = this.store.findUser(email);
      if (existing && existing.role !== "client") throw new PortalError(409, "Эта почта принадлежит сотруднику студии.");
      this.store.put("orders", {
        id: id(), projectName: text(input.projectName, 200), clientName: text(input.clientName, 100), email,
        username: text(input.username, 64).replace(/^@/, ""), brief: text(input.brief, 16000), totalKopecks: integer(input.totalKopecks),
        status: "pending", checkoutToken: randomBytes(32).toString("hex"), projectId: "", createdAt: now(),
      });
      return;
    }
    if (type === "order.provision") {
      this.role(viewer, ["curator"]);
      const order = this.store.get("orders", text(action.orderId, 100));
      if (!order) throw new PortalError(404, "Заказ не найден.");
      if (order.status === "ready") return;
      if (order.status === "pending") throw new PortalError(409, "Сначала требуется подтверждение оплаты.");
      if (!this.config.mockProvisioning || !this.integrations.ready.github || !this.integrations.ready.mail) {
        this.store.put("orders", { ...order, status: "needs_setup" });
        throw new PortalError(503, "Для создания проекта нужны GitHub, почта и разрешение на тестовое создание репозиториев в настройках сервера.");
      }
      this.store.transaction(() => {
        this.store.put("orders", { ...order, status: "provisioning" });
        this.store.enqueue("provision", { orderId: order.id }, `provision:${order.id}`);
        this.store.db.prepare("UPDATE jobs SET attempts=0,available=?,running=0 WHERE id IN (?,?)").run(Date.now(), `provision:${order.id}`, `access:${order.id}`);
      });
      return;
    }
    throw new PortalError(400, "Неизвестное действие.");
  }

  checkout(checkoutToken: string) {
    const order = this.store.all("orders").find(order => order.checkoutToken === checkoutToken);
    if (!order || !/^[a-f0-9]{64}$/.test(checkoutToken)) throw new PortalError(404, "Ссылка на оплату не найдена.");
    return order;
  }

  payOrder(checkoutToken: string, outcome: unknown) {
    if (!this.config.mockPayments) throw new PortalError(503, "Тестовая оплата отключена.");
    const order = this.checkout(checkoutToken);
    if (!["succeeded", "failed"].includes(String(outcome))) throw new PortalError(400, "Некорректный результат оплаты.");
    if (outcome === "succeeded" && order.status === "pending") this.store.put("orders", { ...order, status: "paid" });
  }

  receiveTelegram(value: unknown) {
    const update = object(value);
    const updateId = integer(update.update_id, 0, Number.MAX_SAFE_INTEGER);
    this.store.transaction(() => {
      if (this.store.delivered(`telegram:${updateId}`)) this.store.enqueue("telegram.inbound", { update: JSON.stringify(update) }, `telegram:${updateId}`);
    });
  }

  receiveGitHub(delivery: string, value: unknown) {
    const event = object(value); const repo = object(event.repository).full_name;
    const project = this.store.all("projects").find(project => project.repo === repo);
    if (!project) return;
    this.store.transaction(() => {
      if (this.store.delivered(`github:${delivery}`)) this.store.enqueue("github.sync", { projectId: project.id });
    });
  }

  private async telegramInbound(raw: string) {
    const update = object(JSON.parse(raw));
    if (!update.message) return;
    const message = object(update.message); const chat = object(message.chat);
    const messageId = `telegram-message:${String(update.update_id)}`;
    if (this.store.get("messages", messageId)) return;
    if (chat.type !== "private") return;
    const telegramId = String(chat.id); const threadId = `telegram:${telegramId}`;
    let thread = this.store.get("conversations", threadId); const firstMessage = !thread;
    const settings = this.agent.settings();
    if (!thread) {
      const sender = object(message.from);
      thread = this.store.put("conversations", { id: threadId, kind: "telegram", projectId: "", name: typeof sender.first_name === "string" ? sender.first_name.slice(0, 100) : "Клиент", username: typeof sender.username === "string" ? sender.username : "", email: "", telegramId, ownerId: null, ownerName: null, handoffRequested: false, updatedAt: now() });
    }
    if (typeof message.text !== "string") {
      if (!thread.ownerId) this.append(thread, settings.name, "system", "Пока я принимаю только текст. Опишите пожелания сообщением.");
      return;
    }
    const content = text(message.text, 8000);
    const entry = this.append(thread, thread.name, "client", content, messageId);
    const handoff = !settings.enabled || (settings.capabilities.handoff && (/^\/human(?:\s|$)|^(?:куратор|оператор|человек)[.!?\s]*$/i.test(content) || /(?:позови|пригласи|подключи|хочу|нужен|нужна|вызови|свяжи|поговорить).{0,60}(?:человек|разработчик|куратор|оператор|поддержк)/i.test(content)));
    if ((firstMessage || /^\/start(?:\s|$)/i.test(content)) && !thread.ownerId && !handoff) {
      const greeting = formatTelegramHtml(settings.greeting, settings.maxReplyChars);
      this.append(thread, settings.name, "assistant", greeting.text, `greeting:${messageId}`, greeting.html);
    }
    this.store.put("conversations", { ...thread, handoffRequested: thread.handoffRequested || handoff, revision: (thread.revision ?? 0) + 1, updatedAt: now() });
    if (handoff && !thread.ownerId) {
      const reply = formatTelegramHtml(settings.enabled ? settings.handoffMessage : settings.fallbackMessage, settings.maxReplyChars);
      this.append(thread, settings.name, "system", reply.text, `handoff:${messageId}`, reply.html);
    }
    if (!thread.ownerId && !handoff && !/^\/start(?:\s|$)/i.test(content)) this.store.enqueue("assistant", { threadId, messageId: entry.id });
  }

  private seal(content: string) {
    if (!/^[a-f0-9]{64}$/.test(this.config.encryptionKey)) throw new PortalError(503, "Не настроен ключ шифрования писем.");
    const iv = randomBytes(12); const cipher = createCipheriv("aes-256-gcm", Buffer.from(this.config.encryptionKey, "hex"), iv);
    const encrypted = Buffer.concat([cipher.update(content, "utf8"), cipher.final()]);
    return Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString("base64");
  }

  private unseal(content: string) {
    const data = Buffer.from(content, "base64"); const decipher = createDecipheriv("aes-256-gcm", Buffer.from(this.config.encryptionKey, "hex"), data.subarray(0, 12));
    decipher.setAuthTag(data.subarray(12, 28));
    return Buffer.concat([decipher.update(data.subarray(28)), decipher.final()]).toString("utf8");
  }

  private async provision(order: ProjectOrder) {
    const repo = await this.integrations.createRepository(`nodo-${order.id.replaceAll("-", "")}`);
    const issue = await this.integrations.createIssue(repo, `Разработка: ${order.projectName}`, order.brief, "initial", `order:${order.id}`);
    const projectId = `project:${order.id}`;
    this.store.transaction(() => {
      let client = this.store.findUser(order.email); let access = "Войдите с вашей почтой и текущим паролем.";
      if (!client) {
        const password = randomBytes(18).toString("base64url");
        client = this.store.createUser(order.email, order.clientName, "client", password);
        access = `Логин: ${order.email}\nВременный пароль: ${password}\nПри первом входе смените пароль.`;
      }
      if (client.role !== "client") throw new PortalError(409, "Почта уже занята сотрудником.");
      this.store.put("projects", { id: projectId, name: order.projectName, description: "Разработка проекта", clientId: client.id, clientName: client.name, clientEmail: client.email, repo, brief: order.brief, status: "active", createdAt: now() });
      this.saveWork(projectId, issue);
      const threadId = `chat:${projectId}`;
      if (!this.store.get("conversations", threadId)) {
        const thread = this.store.put("conversations", { id: threadId, kind: "project", projectId, name: order.projectName, username: order.username, email: order.email, telegramId: "", ownerId: null, ownerName: null, handoffRequested: false, updatedAt: now() });
        this.append(thread, "Node ИИ", "assistant", projectGreeting);
      }
      this.store.put("orders", { ...order, projectId, status: "provisioning" });
      this.store.enqueue("mail", { email: order.email, orderId: order.id, content: this.seal(`Ваш проект «${order.projectName}» доступен в кабинете Node Studio.\n${this.config.origin}/cabinet/\n\n${access}\n\nПоддержка: https://t.me/node_studio_bot`) }, `access:${order.id}`);
    });
  }

  /** Durable outbox: webhook handlers acknowledge only after saving work to SQLite. */
  async workJobs(): Promise<void> {
    if (this.working) return;
    this.working = true;
    try {
      for (let count = 0; count < 20; count++) {
        const job = this.store.db.prepare("SELECT id,kind,payload,attempts FROM jobs WHERE running=0 AND available<=? AND attempts<8 ORDER BY available LIMIT 1").get(Date.now()) as Job | undefined;
        if (!job) break;
        this.store.db.prepare("UPDATE jobs SET running=1 WHERE id=?").run(job.id);
        const payload = JSON.parse(job.payload) as Record<string, string>;
        try {
          if (job.kind === "telegram.inbound") await this.telegramInbound(payload.update!);
          if (job.kind === "telegram.send") await this.integrations.telegram(payload.chatId!, payload.text!, payload.html);
          if (job.kind === "agent.index") await this.agent.index(payload.documentId!);
          if (job.kind === "github.sync") {
            const project = this.store.get("projects", payload.projectId!); if (project) await this.sync(project, 1, true);
          }
          if (job.kind === "provision") {
            const order = this.store.get("orders", payload.orderId!); if (order && order.status !== "ready") await this.provision(order);
          }
          if (job.kind === "mail") {
            await this.integrations.mail(payload.email!, this.unseal(payload.content!), job.id);
            const order = this.store.get("orders", payload.orderId!); if (order) this.store.put("orders", { ...order, status: "ready" });
          }
          if (job.kind === "assistant") await this.answer(payload.threadId!, payload.messageId!);
          this.store.db.prepare("DELETE FROM jobs WHERE id=?").run(job.id);
        } catch {
          this.store.db.prepare("UPDATE jobs SET running=0,attempts=attempts+1,available=? WHERE id=?").run(Date.now() + Math.min(3_600_000, 5000 * 2 ** job.attempts), job.id);
          if (job.attempts >= 7 && ["provision", "mail"].includes(job.kind)) {
            const order = this.store.get("orders", payload.orderId!);
            if (order) this.store.put("orders", { ...order, status: "needs_setup" });
          }
          if (job.attempts >= 7 && job.kind === "assistant") {
            const thread = this.store.get("conversations", payload.threadId!);
            if (thread && !thread.ownerId) {
              this.store.put("conversations", { ...thread, handoffRequested: true });
              this.append(thread, "Node", "system", "ИИ временно недоступен. Передали запрос человеку.");
            }
          }
          console.error(`Portal job ${job.kind} will retry (${job.attempts + 1}/8).`);
        }
      }
    } finally { this.working = false; }
  }

  private async answer(threadId: string, messageId: string) {
    const thread = this.store.get("conversations", threadId);
    if (!thread || thread.ownerId || thread.handoffRequested || this.store.get("messages", `reply:${messageId}`)) return;
    if (thread.kind === "telegram") { await this.answerTelegram(thread, messageId); return; }
    if (!this.integrations.ready.ai) {
      this.append(thread, "Node", "system", "ИИ пока не подключён. Сообщение сохранено; можно попросить подключить человека.", `reply:${messageId}`);
      return;
    }
    const messages = this.store.all("messages").filter(message => message.threadId === threadId).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    const lastClient = messages.filter(message => message.role === "client").at(-1);
    if (lastClient?.id !== messageId) return;
    const reply = await this.integrations.assistant(messages, thread.kind);
    const latest = this.store.get("conversations", threadId);
    if (!latest || latest.ownerId || latest.handoffRequested || latest.revision !== thread.revision) return;
    this.store.transaction(() => {
      this.append(thread, "Node ИИ", "assistant", reply.reply, `reply:${messageId}`);
      if (reply.handoff) this.store.put("conversations", { ...latest, handoffRequested: true, updatedAt: now() });
      if (thread.kind === "project" && reply.title && reply.body) this.store.put("drafts", { id: `draft:${messageId}`, threadId, projectId: thread.projectId, title: reply.title, body: reply.body, confirmed: false, createdAt: now() });
    });
  }

  private async answerTelegram(thread: Conversation, messageId: string) {
    const settings = this.agent.settings(); const fingerprint = this.agent.fingerprint(); const started = Date.now();
    const messages = this.store.all("messages").filter(message => message.threadId === thread.id).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    const lastClient = messages.filter(message => message.role === "client").at(-1);
    if (lastClient?.id !== messageId) return;
    const replies = messages.filter(message => message.role === "assistant" && !message.id.startsWith("greeting:") && Date.parse(message.createdAt) >= Date.now() - 3_600_000).length;
    let status: "answered" | "handoff" | "paused" | "limited" | "error" = "answered";
    let result: { reply: string; html: string; handoff: boolean; sources: { documentId: string }[] };
    if (!settings.enabled || replies >= settings.repliesPerHour || !this.integrations.ready.ai) {
      status = !settings.enabled ? "paused" : replies >= settings.repliesPerHour ? "limited" : "error";
      const formatted = formatTelegramHtml(settings.fallbackMessage, settings.maxReplyChars);
      result = { reply: formatted.text, html: formatted.html, handoff: true, sources: [] };
    } else {
      try { result = await this.agent.generate(messages.filter(message => !message.id.startsWith("greeting:")), settings); if (result.handoff) status = "handoff"; }
      catch {
        status = "error"; const formatted = formatTelegramHtml(settings.fallbackMessage, settings.maxReplyChars);
        result = { reply: formatted.text, html: formatted.html, handoff: true, sources: [] };
      }
    }
    const latest = this.store.get("conversations", thread.id);
    if (!latest || latest.ownerId || latest.handoffRequested || latest.revision !== thread.revision) return;
    if (fingerprint !== this.agent.fingerprint()) { this.store.enqueue("assistant", { threadId: thread.id, messageId }); return; }
    this.store.transaction(() => {
      this.append(latest, settings.name, "assistant", result.reply, `reply:${messageId}`, result.html);
      const email = settings.capabilities.collectContact ? lastClient.text.match(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i)?.[0] : undefined;
      this.store.put("conversations", { ...latest, ...(email ? { email: email.toLowerCase() } : {}), handoffRequested: result.handoff, updatedAt: now() });
      this.store.put("agentRuns", { id: `run:${messageId}`, model: settings.model, status, durationMs: Date.now() - started, sourceIds: [...new Set(result.sources.map(source => source.documentId))], createdAt: now() });
      this.store.db.prepare("DELETE FROM records WHERE kind='agentRuns' AND id NOT IN (SELECT id FROM records WHERE kind='agentRuns' ORDER BY updated_at DESC,id DESC LIMIT 200)").run();
    });
  }
}
