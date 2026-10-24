import { PortalError, id, now } from "./store.ts";
import type { PortalStore } from "./store.ts";
import type { Integrations } from "./integrations.ts";
import type { PortalProject, ProjectRepository, Viewer } from "../src/features/portal/model/types.ts";
import { PROJECT_GREETING, projectRepositories, repositoryRequestId, workItemId } from "../src/features/portal/model/project-repositories.ts";
import { object, text } from "./validation.ts";
import type { ErrorContext } from "./error-context.ts";
import { defaultRepositoryName, validRepositoryName, REPOSITORY_NAME_HELP } from "../src/features/portal/model/repository-name.ts";

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

  private active(projectId: string): PortalProject {
    const project = this.store.get("projects", projectId);
    if (!project || project.status === "archived") throw new PortalError(404, "Проект не найден.");
    return project;
  }

  private repositoryName(value: unknown): string {
    if (value === undefined) return "";
    const name = text(value, 100, 0);
    if (name && !validRepositoryName(name)) throw new PortalError(400, `Проверьте название репозитория. ${REPOSITORY_NAME_HELP}`);
    return name;
  }

  private availableName(name: string, projectId: string, sourceId = "main") {
    this.uniqueRepositories([{ id: sourceId, name: "", repo: `${this.owner}/${name}`, createdAt: now() }], projectId);
    if (sourceId !== "main" && this.store.get("projects", projectId)?.repositoryName?.toLowerCase() === name.toLowerCase()) throw new PortalError(409, "Название уже используется основным репозиторием проекта.");
  }

  private sourceId(value: unknown = "main") {
    if (value === "main") return value;
    const sourceId = text(value, 100);
    if (!/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i.test(sourceId)) throw new PortalError(400, "Обновите форму подпроекта.");
    return sourceId;
  }

  async request(viewer: Viewer, input: Record<string, unknown>): Promise<PortalProject> {
    if (viewer.mustChangePassword || viewer.role !== "developer") throw new PortalError(403, "Создать проект для клиента может только разработчик.");
    const requestId = text(input.requestId, 100);
    if (!/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i.test(requestId)) throw new PortalError(400, "Обновите форму создания проекта.");
    const client = this.store.findUser(text(input.clientEmail, 254).toLowerCase(), "client");
    if (!client || client.role !== "client") throw new PortalError(404, "Клиент с этой почтой не найден. Для нового клиента подготовьте проект с оплатой и выдачей доступа.");
    const name = text(input.name, 160); const description = text(input.description, 1000, 0); const brief = text(input.brief, 16000);
    const repositoryName = this.repositoryName(input.repositoryName);
    const reference = input.repository === undefined || input.repository === "" ? "" : this.repositoryReference(input.repository);
    if (reference && repositoryName) throw new PortalError(400, "Выберите новый или существующий репозиторий.");
    const existing = this.store.get("projects", `project:${requestId}`);
    const checkExisting = (project: PortalProject) => {
      if (project.status === "archived" || project.clientId !== client.id || project.createdBy !== viewer.id) throw new PortalError(409, "Проект с этим идентификатором уже существует.");
      if ((project.repositoryName ?? "") !== repositoryName || reference && project.repo.toLowerCase() !== reference.toLowerCase()) throw new PortalError(409, "Проект уже создан с другим репозиторием. Обновите страницу.");
      return project;
    };
    if (existing) return checkExisting(existing);
    const part = reference ? await this.repository({ name: "Основной", repo: reference }, "main") : undefined;
    return this.store.transaction(() => {
      const existing = this.store.get("projects", `project:${requestId}`);
      if (existing) return checkExisting(existing);
      if (repositoryName) this.availableName(repositoryName, `project:${requestId}`);
      if (part) this.uniqueRepositories([part]);
      const project = this.store.put("projects", { id: `project:${requestId}`, name, description, brief, ...(repositoryName ? { repositoryName } : {}), clientId: client.id, clientName: client.name, clientEmail: client.email, repo: part?.repo ?? "", ...(part ? { subprojects: [part] } : {}), origin: "developer", createdBy: viewer.id, status: "active", createdAt: now() });
      const thread = this.store.put("conversations", { id: `chat:${project.id}`, projectId: project.id, kind: "project", name, username: "", email: client.email, telegramId: "", ownerId: null, ownerName: null, handoffRequested: false, updatedAt: now() });
      this.store.put("messages", { id: id(), threadId: thread.id, author: "Node ИИ", role: "assistant", text: PROJECT_GREETING, createdAt: now() });
      return project;
    });
  }

  /** Keep the remote code and local history; archived projects cannot be reopened by jobs. */
  archive(projectId: string, archivedBy?: string): PortalProject {
    return this.store.transaction(() => {
      const project = this.store.get("projects", projectId);
      if (!project) throw new PortalError(404, "Проект не найден.");
      return project.status === "archived" ? project : this.store.put("projects", { ...project, status: "archived", archivedAt: now(), ...(archivedBy ? { archivedBy } : {}) });
    });
  }

  prepareRepository(viewer: Viewer, projectId: string, inputName?: unknown, inputSourceId?: unknown, inputPartName?: unknown) {
    this.developer(viewer);
    const sourceId = this.sourceId(inputSourceId);
    const project = this.active(projectId);
    if (project.developerId !== viewer.id) throw new PortalError(403, "Сначала возьмите проект в работу.");
    if (project.status !== "active") throw new PortalError(409, "Дождитесь создания проекта.");
    const parts = project.subprojects ?? projectRepositories(project);
    const existingPart = parts.find(part => part.id === sourceId);
    if (existingPart?.repo || sourceId === "main" && project.repo) return undefined;
    if (sourceId !== "main" && !project.repo) throw new PortalError(409, "Сначала подключите основной подпроект.");
    if (!existingPart && parts.length >= 8) throw new PortalError(409, "В проекте допускается до 8 репозиториев.");
    if (!this.integrations.ready.github) throw new PortalError(503, "Подключите GitHub в настройках сервера.");
    const chosen = this.repositoryName(inputName);
    const requestId = repositoryRequestId(projectId, sourceId);
    let request = this.store.get("repositoryRequests", requestId);
    if (request && chosen && chosen !== request.name) throw new PortalError(409, "Создание уже запущено с другим названием. При повторе используется исходный репозиторий.");
    if (!request) {
      const name = chosen || (sourceId === "main" ? project.repositoryName : undefined) || `${defaultRepositoryName(project.id)}${sourceId === "main" ? "" : `-${sourceId.replaceAll("-", "")}`}`;
      const partName = inputPartName === undefined ? existingPart?.name ?? "Основной" : text(inputPartName, 80);
      this.availableName(name, project.id, sourceId);
      request = this.store.put("repositoryRequests", { id: requestId, projectId: project.id, ...(sourceId !== "main" ? { subprojectId: sourceId } : {}), subprojectName: partName, owner: this.owner, name, identity: sourceId === "main" ? project.id : `${project.id}:${sourceId}`, createdAt: now() });
      const part: ProjectRepository = { id: sourceId, name: partName, repo: "", repositoryName: name, createdAt: now() };
      this.store.put("projects", { ...project, ...(sourceId === "main" ? { repositoryName: name } : {}), subprojects: existingPart ? parts.map(value => value.id === sourceId ? part : value) : [...parts, part] });
    }
    if (request.owner.toLowerCase() !== this.owner.toLowerCase()) throw new PortalError(409, "GitHub-аккаунт изменился во время создания. Администратору нужно проверить незавершённое подключение.");
    return request;
  }

  async createRepository(viewer: Viewer, projectId: string, sourceId = "main"): Promise<PortalProject> {
    const request = this.prepareRepository(viewer, projectId, undefined, sourceId);
    const project = this.active(projectId);
    if (!request) return project;
    const repo = await this.integrations.createRepository(request.name, request.identity);
    if (this.active(projectId).developerId !== viewer.id) throw new PortalError(403, "Проект принадлежит другому разработчику.");
    const partName = project.subprojects?.find(part => part.id === sourceId)?.name ?? request.subprojectName ?? "Основной";
    const part: ProjectRepository = { id: sourceId, name: partName, repo, createdAt: now() };
    this.uniqueRepositories([part], project.id);
    const issue = await this.integrations.createIssue(repo, `Разработка: ${project.name}${sourceId === "main" ? "" : ` · ${partName}`}`, project.brief, "initial", `project:${project.id}${sourceId === "main" ? "" : `:${sourceId}`}:initial`);
    return this.store.transaction(() => {
      const current = this.active(projectId);
      if (current.developerId !== viewer.id) throw new PortalError(403, "Проект принадлежит другому разработчику.");
      const parts = current.subprojects ?? projectRepositories(current);
      if (parts.find(value => value.id === sourceId)?.repo) return current;
      const latest = { ...part, name: parts.find(value => value.id === sourceId)?.name ?? part.name };
      const next = parts.some(value => value.id === sourceId) ? parts.map(value => value.id === sourceId ? latest : value) : [...parts, latest];
      this.uniqueRepositories(next, current.id);
      const result = this.store.put("projects", { ...current, ...(sourceId === "main" ? { repo } : {}), subprojects: next });
      this.store.put("tasks", { ...issue, id: workItemId(current.id, sourceId, issue.number), projectId: current.id, subprojectId: sourceId });
      return result;
    });
  }

  private repositoryReference(input: unknown) {
    const repo = text(input, 200).replace(/^https:\/\/github\.com\//, "").replace(/\.git\/?$/, "").replace(/\/$/, "");
    const [owner, repository, extra] = repo.split("/");
    if (!owner || !repository || repository === "." || repository === ".." || extra || owner.toLowerCase() !== this.owner.toLowerCase() || !/^[a-zA-Z0-9_.-]+$/.test(repository)) throw new PortalError(400, "Укажите репозиторий подключённого GitHub-аккаунта в формате владелец/репозиторий.");
    return `${this.owner}/${repository}`;
  }

  private async repository(input: unknown, sourceId: string): Promise<ProjectRepository> {
    const value = object(input); const name = text(value.name, 80);
    if (!this.integrations.ready.github) throw new PortalError(503, "Подключите GitHub в настройках сервера.");
    const checked = await this.integrations.repository(this.repositoryReference(value.repo));
    if (!checked.issuesEnabled) throw new PortalError(409, "Включите Issues в настройках подключаемого репозитория.");
    if (!checked.writable) throw new PortalError(403, "У подключения нет прав записи в этот репозиторий.");
    return { id: sourceId, name, repo: checked.fullName, createdAt: now() };
  }

  async attach(viewer: Viewer, projectId: string, input: unknown, inputName?: unknown): Promise<PortalProject> {
    this.developer(viewer);
    const reference = this.repositoryReference(input);
    const check = () => {
      const project = this.active(projectId);
      if (project.developerId !== viewer.id) throw new PortalError(403, "Сначала возьмите проект в работу.");
      if (project.status !== "active") throw new PortalError(409, "Дождитесь создания проекта.");
      if (project.repo) {
        if (project.repo.toLowerCase() === reference.toLowerCase()) return project;
        throw new PortalError(409, "У проекта уже есть основной репозиторий. Добавьте другой как подпроект.");
      }
      if (this.store.get("repositoryRequests", projectId)) throw new PortalError(409, "Создание нового репозитория уже запущено. Дождитесь его завершения.");
    };
    const existing = check(); if (existing) return existing;
    const part = await this.repository({ name: inputName === undefined ? "Основной" : inputName, repo: reference }, "main");
    return this.store.transaction(() => {
      const existing = check(); if (existing) return existing;
      this.uniqueRepositories([part], projectId);
      const project = { ...this.active(projectId), repo: part.repo, subprojects: [part] };
      delete project.repositoryName;
      return this.store.put("projects", project);
    });
  }

  private uniqueRepositories(repositories: readonly ProjectRepository[], exceptId = "") {
    const names = repositories.filter(part => part.repo).map(part => part.repo.toLowerCase());
    if (new Set(names).size !== names.length) throw new PortalError(409, "Один репозиторий нельзя добавить в проект дважды.");
    const current = this.store.get("projects", exceptId);
    if (current && projectRepositories(current).some(existing => repositories.some(part => part.id !== existing.id && part.repo.toLowerCase() === existing.repo.toLowerCase()))) throw new PortalError(409, "Этот репозиторий уже используется другим подпроектом.");
    if (this.store.all("projects").some(project => project.id !== exceptId && projectRepositories(project).some(part => names.includes(part.repo.toLowerCase())))) throw new PortalError(409, "Один из репозиториев уже привязан к другому клиентскому проекту.");
    if (this.store.all("repositoryRequests").some(request => repositories.some(part => part.repo.toLowerCase() === `${request.owner}/${request.name}`.toLowerCase() && (request.projectId !== exceptId || (request.subprojectId ?? "main") !== part.id)))) throw new PortalError(409, "Репозиторий зарезервирован для другого клиентского проекта.");
    if (this.store.all("projects").some(project => project.id !== exceptId && project.repositoryName && names.includes(`${this.owner}/${project.repositoryName}`.toLowerCase()))) throw new PortalError(409, "Название репозитория зарезервировано для другого клиентского проекта.");
  }

  async create(viewer: Viewer, input: Record<string, unknown>): Promise<PortalProject> {
    this.developer(viewer);
    const requestId = text(input.requestId, 100);
    if (!/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i.test(requestId)) throw new PortalError(400, "Обновите форму создания проекта.");
    const projectId = `project:${requestId}`;
    const existing = this.store.get("projects", projectId);
    const client = this.store.findUser(text(input.clientEmail, 254).toLowerCase(), "client");
    if (!client || client.role !== "client") throw new PortalError(404, "Клиент с этой почтой не найден. Используйте существующий клиентский аккаунт.");
    if (existing) { if (existing.status === "archived" || existing.clientId !== client.id || existing.developerId !== viewer.id) throw new PortalError(409, "Проект с этим идентификатором уже существует."); return existing; }
    const name = text(input.name, 160); const description = text(input.description, 1000, 0);
    if (!Array.isArray(input.repositories) || input.repositories.length < 1 || input.repositories.length > 8) throw new PortalError(400, "Добавьте от 1 до 8 репозиториев.");
    const repositories = await Promise.all(input.repositories.map((part, index) => this.repository(part, index === 0 ? "main" : id())));
    return this.store.transaction(() => {
      const concurrent = this.store.get("projects", projectId);
      if (concurrent) { if (concurrent.status === "archived" || concurrent.clientId !== client.id || concurrent.developerId !== viewer.id) throw new PortalError(409, "Проект уже существует."); return concurrent; }
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
      const current = this.active(project.id); const parts = current.subprojects ?? projectRepositories(current);
      if (!current.repo) throw new PortalError(409, "Сначала создайте основной репозиторий проекта.");
      if (current.developerId !== viewer.id) throw new PortalError(403, "Проект принадлежит другому разработчику.");
      if (parts.length >= 8) throw new PortalError(409, "В проекте допускается до 8 репозиториев.");
      this.uniqueRepositories([...parts, part], current.id);
      return this.store.put("projects", { ...current, subprojects: [...parts, part] });
    });
  }

  rename(viewer: Viewer, projectId: string, sourceId: unknown, inputName: unknown): PortalProject {
    this.developer(viewer);
    const name = text(inputName, 80);
    const key = text(sourceId, 100);
    return this.store.transaction(() => {
      const project = this.active(projectId);
      if (project.developerId !== viewer.id) throw new PortalError(403, "Сначала возьмите проект в работу.");
      const parts = project.subprojects ?? projectRepositories(project);
      if (!parts.some(part => part.id === key)) throw new PortalError(404, "Подпроект не найден.");
      return this.store.put("projects", { ...project, subprojects: parts.map(part => part.id === key ? { ...part, name } : part) });
    });
  }

}
