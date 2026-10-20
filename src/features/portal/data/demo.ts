import { EMPTY_SNAPSHOT } from "@/features/portal/model/types";
import type { PortalSnapshot, Role, Viewer, WorkItem } from "@/features/portal/model/types";

export const DEMO_USERS: Record<Role, Viewer> = {
  client: { id: "demo-client", name: "Александр", email: "alex@example.test", role: "client", mustChangePassword: false },
  developer: { id: "demo-developer", name: "Матвей", email: "developer@example.test", role: "developer", mustChangePassword: false },
  curator: { id: "demo-curator", name: "Анна", email: "support@example.test", role: "curator", mustChangePassword: false },
  admin: { id: "demo-admin", name: "Администратор", email: "admin@example.test", role: "admin", mustChangePassword: false },
};

type MutableSnapshot = { -readonly [K in keyof PortalSnapshot]: PortalSnapshot[K] };
export interface DemoState { version: 1; role: Role; data: MutableSnapshot }

export function createDemoState(): DemoState {
  const createdAt = "2026-10-20T08:30:00.000Z";
  const task = (projectId: string, number: number, title: string, kind: WorkItem["kind"], status: WorkItem["status"], body: string): WorkItem => ({ id: `${projectId}:${number}`, projectId, number, title, kind, status, body, included: kind === "initial", updatedAt: createdAt });
  return {
    version: 1, role: "client", data: {
      ...EMPTY_SNAPSHOT, syncedAt: createdAt,
      projects: [
        { id: "atelier", name: "Atelier", description: "Интернет-магазин предметов интерьера", clientId: "demo-client", clientName: "Александр", clientEmail: "alex@example.test", repo: "demo/atelier", brief: "Интернет-магазин предметов интерьера. Каталог с фильтрами, карточка товара, корзина и оформление заказа. Адаптивная версия и подключение системы управления контентом. Основная разработка оплачена полностью.", status: "active", createdAt },
        { id: "bot", name: "Atelier · Telegram", description: "Бот для сопровождения заказов", clientId: "demo-client", clientName: "Александр", clientEmail: "alex@example.test", repo: "demo/atelier-bot", brief: "Telegram-бот: статус заказа, ответы на частые вопросы и передача диалога оператору. Основная работа оплачена.", status: "active", createdAt },
        { id: "nova", name: "Nova", description: "Сайт архитектурного бюро", clientId: "another-client", clientName: "Мария", clientEmail: "maria@example.test", repo: "demo/nova", brief: "Сайт бюро: портфолио, описание услуг и форма заявки. Основная работа оплачена.", status: "active", createdAt },
      ],
      stages: [
        task("atelier", 2, "Знакомство и структура", "stage", "done", "Согласованы пользовательские сценарии и структура каталога."),
        task("atelier", 3, "Дизайн и прототип", "stage", "done", "Готовы основные экраны и визуальное направление."),
        task("atelier", 4, "Разработка", "stage", "in_progress", "Собираем каталог, карточки товаров и корзину."),
        task("atelier", 5, "Проверка и запуск", "stage", "new", "Проверим оформление заказа, мобильную версию и подготовим релиз."),
        task("bot", 2, "Сценарии бота", "stage", "in_progress", "Продумываем сообщения и передачу диалога оператору."),
        task("bot", 3, "Разработка бота", "stage", "new", "Подключение сценариев и статусов заказов."),
        task("nova", 2, "Дизайн", "stage", "in_progress", "Визуальное направление сайта бюро."),
      ],
      tasks: [
        task("atelier", 1, "Разработка интернет-магазина", "initial", "in_progress", "Каталог, фильтры, карточка товара, корзина, оформление заказа и мобильная версия. Первоначальное согласованное ТЗ."),
        task("atelier", 6, "Добавить избранное", "wish", "new", "Покупатель может сохранять товары в избранное и вернуться к ним позже. Кнопка в карточке товара и отдельный список сохранённых товаров."),
        task("bot", 1, "Бот сопровождения заказов", "initial", "new", "Проверка статуса заказа, FAQ и обращение к оператору."),
        task("nova", 1, "Сайт архитектурного бюро", "initial", "new", "Портфолио, услуги и форма заявки."),
      ],
      commits: [
        { sha: "e7a81c4d9759bfc4de73ab4c71ee8958be7aa5fd", projectId: "atelier", title: "feat: добавлены фильтры каталога", author: "Матвей", createdAt: "2026-10-20T07:45:00Z" },
        { sha: "c13f860bdf04293fe6f6b794fa4bb1b93f50e1d8", projectId: "atelier", title: "feat: карточка товара и галерея", author: "Матвей", createdAt: "2026-10-19T14:20:00Z" },
        { sha: "b49fd670a5a7e8dfb92e4aad619faa9fa3ef2d17", projectId: "atelier", title: "feat: структура страниц магазина", author: "Матвей", createdAt: "2026-10-18T11:00:00Z" },
        { sha: "a04d7907eef89e66a88e0ea1de6d41ae5ae653af", projectId: "atelier", title: "init: первоначальная версия проекта", author: "Матвей", createdAt: "2026-10-17T09:00:00Z" },
      ],
      conversations: [
        { id: "chat-atelier", kind: "project", projectId: "atelier", name: "Atelier", username: "alex_atelier", email: "alex@example.test", telegramId: "", ownerId: null, ownerName: null, handoffRequested: false, updatedAt: createdAt },
        { id: "chat-bot", kind: "project", projectId: "bot", name: "Atelier · Telegram", username: "alex_atelier", email: "alex@example.test", telegramId: "", ownerId: null, ownerName: null, handoffRequested: false, updatedAt: createdAt },
        { id: "chat-nova", kind: "project", projectId: "nova", name: "Nova", username: "maria_nova", email: "maria@example.test", telegramId: "", ownerId: null, ownerName: null, handoffRequested: true, updatedAt: createdAt },
        { id: "telegram-1", kind: "telegram", projectId: "", name: "Екатерина", username: "kate_studio", email: "kate@example.test", telegramId: "demo", ownerId: null, ownerName: null, handoffRequested: true, updatedAt: createdAt },
        { id: "telegram-2", kind: "telegram", projectId: "", name: "Дмитрий", username: "dmitry_product", email: "dmitry@example.test", telegramId: "demo-2", ownerId: null, ownerName: null, handoffRequested: false, updatedAt: createdAt },
      ],
      messages: [
        { id: "welcome", threadId: "chat-atelier", author: "NODO ИИ", role: "assistant", text: "Привет, Александр. Я помогу разобраться по проекту и сформулировать задачу. Если нужен разработчик, просто попросите — я его позову.", createdAt: "2026-10-20T08:30:00Z" },
        { id: "wish", threadId: "chat-atelier", author: "Александр", role: "client", text: "Хочу добавить возможность сохранять товары в избранное.", createdAt: "2026-10-20T08:31:00Z" },
        { id: "summary", threadId: "chat-atelier", author: "NODO ИИ", role: "assistant", text: "Пожелание передано разработчику. Оценка появится здесь, в чате.", createdAt: "2026-10-20T08:32:00Z" },
        { id: "bot-welcome", threadId: "chat-bot", author: "NODO ИИ", role: "assistant", text: "Здесь обсуждаем только Telegram-бота. Помогу сформулировать пожелание; по просьбе позову разработчика.", createdAt },
        { id: "nova-message", threadId: "chat-nova", author: "Мария", role: "client", text: "Позови, пожалуйста, разработчика.", createdAt },
        { id: "tg-welcome", threadId: "telegram-1", author: "NODO ИИ", role: "assistant", text: "Помогу собрать пожелания. Если захотите поговорить с куратором, просто попросите — я его позову.", createdAt: "2026-10-20T08:20:00Z" },
        { id: "tg-message", threadId: "telegram-1", author: "Екатерина", role: "client", text: "Здравствуйте! Нужен сайт для студии керамики. Хочу обсудить проект с куратором.", createdAt },
        { id: "tg-message-2", threadId: "telegram-2", author: "Дмитрий", role: "client", text: "Не могу войти в кабинет. Поможете восстановить доступ?", createdAt },
      ],
      quotes: [{ id: "quote-favorites", projectId: "atelier", taskNumber: 6, title: "Добавить избранное", baseKopecks: 1000000, markupKopecks: 300000, totalKopecks: 1300000, status: "pending", createdAt }],
    },
  };
}
