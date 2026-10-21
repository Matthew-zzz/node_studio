import { PortalError, id, now } from "./store.ts";
import type { PortalStore } from "./store.ts";
import type { Integrations } from "./integrations.ts";
import type { PortalProject, ProjectRepository, Viewer } from "../src/features/portal/model/types.ts";
import { PROJECT_GREETING, projectRepositories } from "../src/features/portal/model/project-repositories.ts";
import { object, text } from "./validation.ts";
import type { ErrorContext } from "./error-context.ts";

export class ProjectSyncError extends PortalError {
  readonly failures: { error: unknown; context: ErrorContext }[];
  constructor(failures: { error: unknown; context: ErrorContext }[]) { super(502, "Не удалось обновить данные проекта. Администратор уведомлён."); this.failures = failures; }
}

export class ProjectRegistry {
  private store: PortalStore;
  private integrations: Integrations;
  private owner: string;
  constructor(store: PortalStore, integrations: Integrations, owner: string) { this.store = store; this.integrations = integrations; this.owner = owner; }

  private developer(viewer: Viewer) {
    if (viewer.mustChangePassword || viewer.role !== "developer") throw new PortalError(403, "Управлять репозиториями может только разработчик.");
  }

  private async repository(input: unknown, sourceId: string): Promise<ProjectRepository> {
    const value = object(input); const name = text(value.name, 80);
    const repo = text(value.repo, 200).replace(/^https:\/\/github\.com\//, "").replace(/\.git\/?$/, "").replace(/\/$/, "");
    const [owner, repository, extra] = repo.split("/");
    if (!owner || !repository || extra || owner.toLowerCase() !== this.owner.toLowerCase() || !/^[a-zA-Z0-9_.-]+$/.test(repository)) throw new PortalError(400, "Укажите репозиторий подключённого GitHub-аккаунта в формате владелец/репозиторий.");
    const checked = await this.integrations.repository(`${this.owner}/${repository}`);
    if (!checked.issuesEnabled) throw new PortalError(409, "Включите Issues в настройках подключаемого репозитория.");
    if (!checked.writable) throw new PortalError(403, "У подключения нет прав записи в этот репозиторий.");
    return { id: sourceId, name, repo: checked.fullName, createdAt: now() };
  }

  private uniqueRepositories(repositories: readonly ProjectRepository[], exceptId = "") {
    const names = repositories.map(part => part.repo.toLowerCase());
    if (new Set(names).size !== names.length) throw new PortalError(409, "Один репозиторий нельзя добавить в проект дважды.");
    if (this.store.all("projects").some(project => project.id !== exceptId && projectRepositories(project).some(part => names.includes(part.repo.toLowerCase())))) throw new PortalError(409, "Один из репозиториев уже привязан к другому клиентскому проекту.");
  }

  async create(viewer: Viewer, input: Record<string, unknown>): Promise<PortalProject> {
    this.developer(viewer);
    const requestId = text(input.requestId, 100);
    if (!/^[a-f0-9-]{36}$/i.test(requestId)) throw new PortalError(400, "Обновите форму создания проекта.");
    const projectId = `project:${requestId}`;
    const existing = this.store.get("projects", projectId);
    const client = this.store.findUser(text(input.clientEmail, 254).toLowerCase());
    if (!client || client.role !== "client") throw new PortalError(404, "Клиент с этой почтой не найден. Используйте существующий клиентский аккаунт.");
    if (existing) { if (existing.clientId !== client.id || existing.developerId !== viewer.id) throw new PortalError(409, "Проект с этим идентификатором уже существует."); return existing; }
    const name = text(input.name, 160); const description = text(input.description, 1000, 0);
    if (!Array.isArray(input.repositories) || input.repositories.length < 1 || input.repositories.length > 8) throw new PortalError(400, "Добавьте от 1 до 8 репозиториев.");
    const repositories = await Promise.all(input.repositories.map((part, index) => this.repository(part, index === 0 ? "main" : id())));
    return this.store.transaction(() => {
      const concurrent = this.store.get("projects", projectId);
      if (concurrent) { if (concurrent.clientId !== client.id || concurrent.developerId !== viewer.id) throw new PortalError(409, "Проект уже существует."); return concurrent; }
      this.uniqueRepositories(repositories);
      const project: PortalProject = { id: projectId, name, description, clientId: client.id, clientName: client.name, clientEmail: client.email, repo: repositories[0]!.repo, subprojects: repositories, origin: "import", brief: description, status: "active", developerId: viewer.id, acceptedAt: now(), createdAt: now() };
      this.store.put("projects", project);
      const thread = this.store.put("conversations", { id: `chat:${projectId}`, projectId, kind: "project", name, username: "", email: client.email, telegramId: "", ownerId: null, ownerName: null, handoffRequested: false, updatedAt: now() });
      this.store.put("messages", { id: id(), threadId: thread.id, author: "Node ИИ", role: "assistant", text: PROJECT_GREETING, createdAt: now() });
      return project;
    });
  }

  async add(viewer: Viewer, project: PortalProject, input: Record<string, unknown>): Promise<PortalProject> {
    this.developer(viewer);
    if (project.developerId !== viewer.id) throw new PortalError(403, "Сначала возьмите проект в работу.");
    const part = await this.repository(input, id());
    return this.store.transaction(() => {
      const current = this.store.get("projects", project.id)!; const parts = projectRepositories(current);
      if (current.developerId !== viewer.id) throw new PortalError(403, "Проект принадлежит другому разработчику.");
      if (parts.length >= 8) throw new PortalError(409, "В проекте допускается до 8 репозиториев.");
      this.uniqueRepositories([...parts, part], current.id);
      return this.store.put("projects", { ...current, subprojects: [...parts, part] });
    });
  }
}
