import type { PortalProject, ProjectRepository } from "./types.ts";

export const PRIMARY_REPOSITORY = "main";
export function projectRepositories(project: PortalProject): readonly ProjectRepository[] {
  return project.subprojects?.length ? project.subprojects.filter(part => Boolean(part.repo)) : project.repo ? [{ id: PRIMARY_REPOSITORY, name: "Основной", repo: project.repo, createdAt: project.createdAt }] : [];
}
export const repositoryKey = (value?: string) => value || PRIMARY_REPOSITORY;
export const repositoryRequestId = (projectId: string, subprojectId = PRIMARY_REPOSITORY) => subprojectId === PRIMARY_REPOSITORY ? projectId : `${projectId}:${subprojectId}`;
export function workItemId(projectId: string, subprojectId: string | undefined, number: number): string {
  return repositoryKey(subprojectId) === PRIMARY_REPOSITORY ? `${projectId}:${number}` : `${projectId}:${subprojectId}:${number}`;
}
export function sameWorkSource(left: { subprojectId?: string }, right: { subprojectId?: string }) { return repositoryKey(left.subprojectId) === repositoryKey(right.subprojectId); }
export function sameTaskScope(left: { subprojectId?: string; scopeRevision?: number }, right: { subprojectId?: string; scopeRevision?: number }) { return sameWorkSource(left, right) && (left.scopeRevision ?? 0) === (right.scopeRevision ?? 0); }
export const PROJECT_GREETING = "Я помогу разобраться по проекту и сформулировать задачу. Если захотите поговорить с разработчиком, просто попросите — я его позову.";
