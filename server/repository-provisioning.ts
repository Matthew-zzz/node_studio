import { PortalError, now } from "./store.ts";
import type { PortalStore } from "./store.ts";
import type { ProjectRegistry } from "./projects.ts";
import type { PortalProject, RepositoryCreation, Viewer } from "../src/features/portal/model/types.ts";
import { repositoryRequestId } from "../src/features/portal/model/project-repositories.ts";

/** Durable orchestration; repository names and GitHub writes belong to ProjectRegistry. */
export class RepositoryProvisioner {
  private store: PortalStore;
  private projects: ProjectRegistry;

  constructor(store: PortalStore, projects: ProjectRegistry) { this.store = store; this.projects = projects; }

  request(viewer: Viewer, projectId: string, repositoryName?: unknown, subprojectId?: unknown, name?: unknown) {
    this.store.transaction(() => {
      const reservation = this.projects.prepareRepository(viewer, projectId, repositoryName, subprojectId, name);
      if (!reservation) return;
      const jobId = `repository:${reservation.id}`;
      const job = this.store.db.prepare("SELECT attempts FROM jobs WHERE id=?").get(jobId);
      // A duplicate click never resets an active job or bypasses its retry delay.
      if (job && Number(job.attempts) < 8) return;
      this.store.db.prepare("DELETE FROM jobs WHERE id=? AND running=0").run(jobId);
      const queued = { ...reservation, status: "queued" as const, attempts: 0, updatedAt: now() };
      delete queued.nextAttemptAt;
      this.store.put("repositoryRequests", queued);
      this.store.enqueue("github.repository.create", { projectId, ...(reservation.subprojectId ? { subprojectId: reservation.subprojectId } : {}), developerId: viewer.id, _actorId: viewer.id }, jobId);
    });
  }

  async run(projectId: string, developerId: string, attempts: number, subprojectId = "main") {
    const developer = this.store.user(developerId);
    if (!developer) throw new PortalError(403, "Разработчик проекта больше недоступен.");
    this.update(repositoryRequestId(projectId, subprojectId), "creating", attempts);
    await this.projects.createRepository(developer, projectId, subprojectId);
    this.update(repositoryRequestId(projectId, subprojectId), "ready", attempts);
  }

  failed(projectId: string, attempts: number, nextAttemptAt: number, subprojectId = "main") {
    const requestId = repositoryRequestId(projectId, subprojectId);
    if (!this.store.get("repositoryRequests", requestId)) return;
    this.update(requestId, attempts >= 8 ? "failed" : "retrying", attempts, attempts < 8 ? new Date(nextAttemptAt).toISOString() : undefined);
  }

  state(project: PortalProject, subprojectId = "main"): RepositoryCreation | undefined {
    if (subprojectId === "main" ? project.repo : project.subprojects?.find(part => part.id === subprojectId)?.repo) return undefined;
    const request = this.store.get("repositoryRequests", repositoryRequestId(project.id, subprojectId));
    if (!request?.status || request.status === "ready") return undefined;
    return { status: request.status, attempts: request.attempts ?? 0, updatedAt: request.updatedAt ?? request.createdAt, ...(request.nextAttemptAt ? { nextAttemptAt: request.nextAttemptAt } : {}) };
  }

  private update(projectId: string, status: RepositoryCreation["status"] | "ready", attempts: number, nextAttemptAt?: string) {
    const request = this.store.get("repositoryRequests", projectId);
    if (!request) throw new PortalError(409, "Не найдена заявка на создание репозитория.");
    const updated = { ...request, status, attempts, updatedAt: now() };
    delete updated.nextAttemptAt;
    this.store.put("repositoryRequests", { ...updated, ...(nextAttemptAt ? { nextAttemptAt } : {}) });
  }
}
