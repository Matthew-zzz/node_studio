import { createDemoState, DEMO_USERS } from "@/features/portal/data/demo";
import type { DemoState } from "@/features/portal/data/demo";
import { visibleSnapshot } from "@/features/portal/model/access";
import type { Checkout, PortalAction, Role, WorkItem } from "@/features/portal/model/types";
import { createPaymentQuote } from "@/features/payments/model/payment";
import type { PortalGateway } from "@/features/portal/lib/gateway";

export const DEMO_STORAGE_KEY = "nodo.portal.demo.v1";
const uuid = () => crypto.randomUUID();
const now = () => new Date().toISOString();

/** A scenario engine for the public demo, independent of the live API and credentials. */
export function applyDemoAction(source: DemoState, action: PortalAction): DemoState {
  const state = structuredClone(source); const data = state.data; const viewer = DEMO_USERS[state.role];
  const requireRole = (...roles: Role[]) => { if (!roles.includes(viewer.role)) throw new Error("Это действие доступно другой роли."); };
  const project = (projectId: string) => {
    requireRole("client", "developer");
    const found = data.projects.find(project => project.id === projectId && (viewer.role === "developer" || project.clientId === viewer.id));
    if (!found) throw new Error("Проект не найден.");
    return found;
  };
  const append = (threadId: string, text: string, assistant = false) => {
    data.messages = [...data.messages, { id: uuid(), threadId, text, author: assistant ? "NODO ИИ" : viewer.name, role: assistant ? "assistant" : viewer.role, createdAt: now() }];
  };
  // Mutating the isolated clone keeps updates atomic and localStorage writes all-or-nothing.
  if (["message", "takeover", "leave"].includes(action.type) && "threadId" in action) {
    const thread = data.conversations.find(thread => thread.id === action.threadId);
    if (!thread) throw new Error("Диалог не найден.");
    if (thread.kind === "project") project(thread.projectId); else requireRole("curator");
    if (action.type === "message") {
      if (!action.text.trim() || action.text.length > 8000) throw new Error("Введите сообщение до 8000 символов.");
      if (viewer.role !== "client" && thread.ownerId !== viewer.id) throw new Error("Сначала подключитесь к диалогу.");
      append(thread.id, action.text.trim());
      if (viewer.role === "client" && !thread.ownerId) {
        const handoff = /(?:человек|разработчик|куратор|поддержк)/i.test(action.text);
        if (handoff) {
          data.conversations = data.conversations.map(item => item.id === thread.id ? { ...item, handoffRequested: true } : item);
          append(thread.id, "Разработчик приглашён. Он сможет подключиться к этому диалогу.", true);
        } else {
          const title = action.text.trim().split(/[.!?\n]/)[0]?.slice(0, 100) || "Новое пожелание";
          append(thread.id, "В деморежиме я собрал текст в черновик. Проверьте формулировку и подтвердите отправку разработчику.", true);
          data.drafts = [...data.drafts, { id: uuid(), threadId: thread.id, projectId: thread.projectId, title, body: action.text.trim(), confirmed: false, createdAt: now() }];
        }
      }
    } else {
      requireRole(thread.kind === "project" ? "developer" : "curator");
      if (thread.ownerId && thread.ownerId !== viewer.id) throw new Error("Диалог уже ведёт другой сотрудник.");
      data.conversations = data.conversations.map(item => item.id === thread.id ? { ...item, ownerId: action.type === "takeover" ? viewer.id : null, ownerName: action.type === "takeover" ? viewer.name : null, handoffRequested: false } : item);
      append(thread.id, action.type === "takeover" ? `${viewer.name} подключился к диалогу.` : "Управление возвращено ИИ-помощнику.", true);
    }
  } else if (action.type === "draft.confirm") {
    requireRole("client");
    const draft = data.drafts.find(draft => draft.id === action.draftId);
    if (!draft || draft.confirmed) return source;
    project(draft.projectId);
    const number = Math.max(0, ...[...data.tasks, ...data.stages].filter(task => task.projectId === draft.projectId).map(task => task.number)) + 1;
    data.tasks = [...data.tasks, { id: uuid(), projectId: draft.projectId, number, title: draft.title, body: draft.body, kind: "wish", included: false, status: "new", updatedAt: now() }];
    data.drafts = data.drafts.map(item => item.id === draft.id ? { ...item, confirmed: true } : item);
    append(draft.threadId, `Задача #${number} передана разработчику.`, true);
  } else if (action.type === "task.status" || action.type === "task.include" || action.type === "quote.create") {
    requireRole("developer"); project(action.projectId);
    const task = data.tasks.find(task => task.projectId === action.projectId && task.number === action.number);
    if (!task) throw new Error("Задача не найдена.");
    const quotes = data.quotes.filter(quote => quote.projectId === task.projectId && quote.taskNumber === task.number);
    const paid = quotes.some(quote => quote.status === "paid");
    if (action.type === "quote.create") {
      if (paid || task.included) throw new Error("Отдельная оценка не требуется или уже оплачена.");
      const quote = createPaymentQuote(uuid(), action.baseKopecks, "wish");
      data.quotes = [...data.quotes.map(item => quotes.includes(item) && item.status === "pending" ? { ...item, status: "superseded" as const } : item), { id: quote.reference, projectId: task.projectId, taskNumber: task.number, title: task.title, baseKopecks: quote.baseKopecks, markupKopecks: quote.markupKopecks, totalKopecks: quote.totalKopecks, status: "pending", createdAt: now() }];
    } else if (action.type === "task.include") {
      if (paid) throw new Error("Задача уже оплачена отдельно.");
      data.tasks = data.tasks.map(item => item.id === task.id ? { ...item, included: true } : item);
      data.quotes = data.quotes.map(item => quotes.includes(item) && item.status === "pending" ? { ...item, status: "superseded" } : item);
    } else {
      if (["in_progress", "done"].includes(action.status) && task.kind === "wish" && !task.included && !paid) throw new Error("Дождитесь оплаты или отметьте, что задача входит в ТЗ.");
      data.tasks = data.tasks.map(item => item.id === task.id ? { ...item, status: action.status } : item);
    }
  } else if (action.type === "stage.save") {
    requireRole("developer"); project(action.projectId);
    if (!action.title.trim()) throw new Error("Укажите название этапа.");
    const number = action.number || Math.max(0, ...[...data.tasks, ...data.stages].filter(item => item.projectId === action.projectId).map(item => item.number)) + 1;
    const work: WorkItem = { id: `${action.projectId}:${number}`, projectId: action.projectId, number, title: action.title, body: action.body, status: action.status, kind: "stage", included: true, updatedAt: now() };
    data.stages = [...data.stages.filter(stage => stage.id !== work.id), work];
  } else if (action.type === "quote.pay") {
    requireRole("client");
    const quote = data.quotes.find(item => item.id === action.quoteId);
    if (!quote) throw new Error("Оценка не найдена.");
    project(quote.projectId);
    if (quote.status === "superseded") throw new Error("Стоимость обновилась. Откройте новую оценку.");
    if (action.outcome === "succeeded") data.quotes = data.quotes.map(item => item.id === quote.id ? { ...item, status: "paid" } : item);
  } else if (action.type === "order.create") {
    requireRole("curator");
    const order = action.order;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(order.email) || !order.projectName.trim() || !order.brief.trim() || !Number.isSafeInteger(order.totalKopecks) || order.totalKopecks <= 0) throw new Error("Проверьте данные проекта.");
    data.orders = [...data.orders, { ...order, id: uuid(), checkoutToken: uuid(), status: "pending", projectId: "", createdAt: now() }];
  } else if (action.type === "order.provision") {
    requireRole("curator");
    const order = data.orders.find(order => order.id === action.orderId);
    if (!order || order.status === "pending") throw new Error("Сначала требуется оплата.");
    if (order.status === "ready") return source;
    const projectId = uuid();
    const clientId = order.email === DEMO_USERS.client.email ? DEMO_USERS.client.id : `demo:${order.email}`;
    data.projects = [...data.projects, { id: projectId, name: order.projectName, description: "Новый проект", clientId, clientName: order.clientName, clientEmail: order.email, repo: `demo/${projectId}`, brief: order.brief, status: "active", createdAt: now() }];
    data.tasks = [...data.tasks, { id: uuid(), projectId, number: 1, title: order.projectName, body: order.brief, kind: "initial", included: true, status: "new", updatedAt: now() }];
    data.conversations = [...data.conversations, { id: `chat:${projectId}`, kind: "project", projectId, name: order.projectName, username: order.username, email: order.email, telegramId: "", ownerId: null, ownerName: null, handoffRequested: false, updatedAt: now() }];
    append(`chat:${projectId}`, "Проект готов к работе. Помогу сформулировать пожелания; по просьбе позову разработчика.", true);
    data.orders = data.orders.map(item => item.id === order.id ? { ...item, projectId, status: "ready" } : item);
  }
  return state;
}

export function createDemoGateway(): PortalGateway {
  let state: DemoState | undefined;
  function load() {
    // Read again for changes from a checkout opened in another tab.
    try {
      const raw = localStorage.getItem(DEMO_STORAGE_KEY);
      const parsed = raw ? JSON.parse(raw) as DemoState : null;
      if (parsed?.version === 1 && parsed.data?.projects && DEMO_USERS[parsed.role]) state = parsed;
    } catch { /* A private browser can deny storage. The in-memory demo still works. */ }
    return state ??= createDemoState();
  }
  function save(next: DemoState) { state = next; try { localStorage.setItem(DEMO_STORAGE_KEY, JSON.stringify(next)); } catch { /* Session-only fallback. */ } }
  function checkout(token: string): Checkout {
    const order = load().data.orders.find(order => order.checkoutToken === token);
    if (!order) throw new Error("Ссылка на оплату не найдена.");
    return { projectName: order.projectName, totalKopecks: order.totalKopecks, status: order.status, provider: "mock" };
  }
  return {
    async snapshot(projectId) { const current = load(); return visibleSnapshot(current.data, DEMO_USERS[current.role], projectId); },
    async action(action) { save(applyDemoAction(load(), action)); },
    async login() { throw new Error("Используйте переключатель ролей деморежима."); },
    async logout() { save({ ...load(), role: "client" }); },
    async password() { throw new Error("Смена пароля доступна в настоящем кабинете."); },
    async role(role) { save({ ...load(), role }); },
    async reset() { save(createDemoState()); },
    async checkout(token) { return checkout(token); },
    async payOrder(token, outcome) {
      const current = structuredClone(load()); checkout(token);
      if (outcome === "succeeded") current.data.orders = current.data.orders.map(order => order.checkoutToken === token && order.status === "pending" ? { ...order, status: "paid" } : order);
      save(current); return checkout(token);
    },
  };
}
