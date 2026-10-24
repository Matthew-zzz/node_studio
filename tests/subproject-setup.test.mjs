import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { backup } from "node:sqlite";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { portalFixture } from "./helpers/portal-fixture.mjs";
import { portalApi } from "./helpers/http.mjs";
import { PortalStore } from "../server/store.ts";
import { PortalService } from "../server/service.ts";
import { projectRepositories, repositoryRequestId } from "../src/features/portal/model/project-repositories.ts";

async function accepted(f, attach = true) {
  const dev = f.login("developer").session;
  const requestId = randomUUID();
  await f.service.action(dev, { type: "project.request", requestId, name: "Продукт", description: "Интерфейс и API", brief: "Согласованное ТЗ", clientEmail: f.users.client.email });
  const projectId = `project:${requestId}`;
  await f.service.action(dev, { type: "project.accept", projectId });
  if (attach) await f.service.action(dev, { type: "project.repository.attach", projectId, name: "Frontend", repo: "https://github.com/Matthew-zzz/Existing-frontend.git" });
  return { dev, projectId };
}
const create = (projectId, name = "Backend", repositoryName = "product-backend", subprojectId = randomUUID()) => ({ type: "project.repository.create", projectId, subprojectId, name, repositoryName });
const retry = f => f.store.db.prepare("UPDATE jobs SET available=0 WHERE kind='github.repository.create'").run();

test("the first new or attached repository preserves its chosen subproject name", async () => {
  for (const attach of [true, false]) {
    const f = portalFixture();
    try {
      const { dev, projectId } = await accepted(f, attach);
      if (!attach) {
        await f.service.action(dev, { type: "project.repository.create", projectId, name: "Интерфейс", repositoryName: "product-front" });
        const queued = await f.service.snapshot(dev, projectId);
        assert.equal(queued.projects.find(p => p.id === projectId).subprojects[0].name, "Интерфейс");
        await f.service.workJobs();
      }
      const project = f.store.get("projects", projectId);
      assert.equal(project.subprojects[0].name, attach ? "Frontend" : "Интерфейс");
      assert.equal(project.subprojects[0].id, "main");
      assert.equal(project.repo, project.subprojects[0].repo);
    } finally { f.close(); }
  }
});

test("each additional new repository gets its own durable job, source, task and client-safe projection", async () => {
  const f = portalFixture();
  try {
    const { dev, projectId } = await accepted(f);
    const action = create(projectId);
    await Promise.all([1, 2, 3].map(() => f.service.action(dev, action)));
    const key = repositoryRequestId(projectId, action.subprojectId);
    assert.equal(f.store.get("repositoryRequests", key).identity, `${projectId}:${action.subprojectId}`);
    assert.equal(f.store.db.prepare("SELECT count(*) n FROM jobs WHERE kind='github.repository.create'").get().n, 1);
    assert.equal(f.repositories.length, 0);
    assert.equal(projectRepositories(f.store.get("projects", projectId)).length, 1);
    const pending = (await f.service.snapshot(dev, projectId)).projects.find(p => p.id === projectId);
    assert.equal(pending.repositoryCreation, undefined);
    assert.equal(pending.subprojects[1].repositoryCreation.status, "queued");
    const identity = [];
    const original = f.integrations.createRepository;
    f.integrations.createRepository = async (...args) => { identity.push(args[1]); return original(...args); };
    await f.service.workJobs();
    assert.equal(f.repositories.length, 1); assert.deepEqual(identity, [`${projectId}:${action.subprojectId}`]);
    const project = f.store.get("projects", projectId);
    assert.equal(project.repo, "Matthew-zzz/Existing-frontend");
    assert.equal(project.subprojects[1].repo, "Matthew-zzz/product-backend");
    assert.equal(project.subprojects[1].name, "Backend");
    const tasks = f.store.all("tasks", projectId);
    assert.equal(tasks.length, 1); assert.equal(tasks[0].subprojectId, action.subprojectId);
    assert.equal(tasks[0].id, `${projectId}:${action.subprojectId}:1`);
    const client = await f.service.snapshot(f.login("client").session, projectId);
    assert.equal(client.projects.find(p => p.id === projectId).subprojects, undefined);
    assert.ok(!JSON.stringify(client).includes("product-backend"));
    assert.equal(client.conversations.filter(t => t.projectId === projectId).length, 1);
  } finally { f.close(); }
});

test("pending source names and retry identities survive SQLite reopening after a lost GitHub response", async () => {
  const f = portalFixture(); const directory = await mkdtemp(join(tmpdir(), "node-part-setup-")); let reopened;
  try {
    const { dev, projectId } = await accepted(f); const action = create(projectId);
    const original = f.integrations.createRepository; let lost = true;
    f.integrations.createRepository = async (...args) => { const repo = await original(...args); if (lost) { lost = false; throw new Error("Lost response"); } return repo; };
    await f.service.action(dev, action); await f.service.workJobs();
    const job = f.store.db.prepare("SELECT * FROM jobs WHERE kind='github.repository.create'").get();
    assert.equal(f.repositories.length, 1);
    await f.service.action(dev, action);
    assert.deepEqual(f.store.db.prepare("SELECT * FROM jobs WHERE kind='github.repository.create'").get(), job);
    await f.service.action(dev, { type: "project.repository.rename", projectId, subprojectId: action.subprojectId, name: "API сервиса" });
    const file = join(directory, "portal.sqlite"); await backup(f.store.db, file);
    reopened = new PortalStore(file); const service = new PortalService(reopened, f.integrations, f.config);
    reopened.db.prepare("UPDATE jobs SET available=0 WHERE kind='github.repository.create'").run();
    await service.workJobs();
    const project = reopened.get("projects", projectId);
    assert.equal(project.subprojects[1].name, "API сервиса");
    assert.equal(project.subprojects[1].repo, "Matthew-zzz/product-backend");
    assert.equal(f.repositories.length, 1); assert.equal(f.issues.get(project.subprojects[1].repo).length, 1);
    assert.equal(reopened.get("repositoryRequests", repositoryRequestId(projectId, action.subprojectId)).status, "ready");
    assert.equal(reopened.db.prepare("SELECT count(*) n FROM jobs WHERE kind='github.repository.create'").get().n, 0);
  } finally { reopened?.close(); f.close(); await rm(directory, { recursive: true, force: true }); }
});

test("a lost initial task response is retried in its own repository and cannot replace the main source", async () => {
  const f = portalFixture();
  try {
    const { dev, projectId } = await accepted(f); const action = create(projectId);
    const original = f.integrations.createIssue; let lost = true;
    f.integrations.createIssue = async (...args) => { const issue = await original(...args); if (lost) { lost = false; throw new Error("Lost issue response"); } return issue; };
    await f.service.action(dev, action); await f.service.workJobs();
    assert.equal(f.store.get("projects", projectId).subprojects[1].repo, "");
    retry(f); await f.service.workJobs();
    assert.equal(f.issues.get("Matthew-zzz/product-backend").length, 1);
    assert.equal(f.store.get("projects", projectId).repo, "Matthew-zzz/Existing-frontend");
    assert.equal(f.store.all("tasks", projectId).length, 1);
  } finally { f.close(); }
});

test("repository reservations reject duplicates within a project and across pending sources", async () => {
  const f = portalFixture();
  try {
    const { dev, projectId } = await accepted(f);
    await assert.rejects(f.service.action(dev, create(projectId, "Duplicate main", "existing-FRONTEND")), { status: 409 });
    const action = create(projectId);
    await f.service.action(dev, action);
    await assert.rejects(f.service.action(dev, create(projectId, "Duplicate pending", "PRODUCT-backend")), { status: 409 });
    await assert.rejects(f.service.action(dev, { type: "project.repository.add", projectId, name: "Alias", repo: "Matthew-zzz/product-backend" }), { status: 409 });
    assert.equal(f.store.get("projects", projectId).subprojects.length, 2);
    assert.equal(f.store.all("repositoryRequests").length, 1);
    assert.equal(f.repositories.length, 0);
    await assert.rejects(f.service.action(dev, { ...action, repositoryName: "different" }), { status: 409 });
  } finally { f.close(); }
});

test("pending sources count toward the eight-subproject limit without orphan reservations", async () => {
  const f = portalFixture();
  try {
    const { dev, projectId } = await accepted(f);
    for (let index = 0; index < 7; index++) await f.service.action(dev, create(projectId, `Часть ${index}`, `part-${index}`));
    await assert.rejects(f.service.action(dev, create(projectId, "Overflow", "part-8")), { status: 409 });
    assert.equal(f.store.get("projects", projectId).subprojects.length, 8);
    assert.equal(f.store.all("repositoryRequests").length, 7);
    await f.service.workJobs();
    assert.equal(projectRepositories(f.store.get("projects", projectId)).length, 8);
    assert.equal(f.repositories.length, 7);
  } finally { f.close(); }
});

test("renaming legacy main repositories preserves task IDs, quotations and remote contents", async () => {
  const f = portalFixture();
  try {
    const dev = f.login("developer").session;
    await f.service.action(dev, { type: "project.accept", projectId: "one" });
    await f.service.sync(f.store.get("projects", "one"));
    const before = f.store.all("tasks", "one"); const remote = structuredClone(f.issues.get("Matthew-zzz/fixture-one"));
    await f.service.action(dev, { type: "project.repository.rename", projectId: "one", subprojectId: "main", name: "Frontend" });
    assert.equal(f.store.get("projects", "one").subprojects[0].name, "Frontend");
    assert.equal(f.store.get("projects", "one").repo, "Matthew-zzz/fixture-one");
    assert.deepEqual(f.store.all("tasks", "one"), before); assert.deepEqual(f.issues.get("Matthew-zzz/fixture-one"), remote);
    await assert.rejects(f.service.action(dev, { type: "project.repository.rename", projectId: "one", subprojectId: "foreign", name: "Wrong" }), { status: 404 });
  } finally { f.close(); }
});

test("new repository operations retain role, ownership, input and CSRF checks", async () => {
  const f = portalFixture(); const http = portalApi(f);
  try {
    const { dev, projectId } = await accepted(f); const action = create(projectId);
    for (const role of ["client", "admin", "other", "temporary"]) await assert.rejects(f.service.action(f.login(role).session, action), { status: 403 });
    await assert.rejects(f.service.action(dev, { ...action, subprojectId: "../forged" }), { status: 400 });
    await assert.rejects(f.service.action(dev, { ...action, name: " " }), { status: 400 });
    const developer = await http.login("developer");
    assert.equal((await http.request("action", action, developer, { "x-csrf-token": "" })).statusCode, 403);
    const client = await http.login("client");
    assert.equal((await http.request("action", { type: "project.repository.rename", projectId, subprojectId: "main", name: "Hijack" }, client)).statusCode, 403);
    const project = f.store.get("projects", projectId); f.store.put("projects", { ...project, developerId: "different-developer" });
    await assert.rejects(f.service.action(dev, action), { status: 404 });
    assert.equal(f.store.all("repositoryRequests").length, 0);
  } finally { f.close(); }
});

test("one failed creation does not block another subproject and diagnostics identify the failed source", async () => {
  const f = portalFixture();
  try {
    const { dev, projectId } = await accepted(f);
    const bad = create(projectId, "Backend", "failing-backend"); const good = create(projectId, "Worker", "healthy-worker");
    const original = f.integrations.createRepository;
    f.integrations.createRepository = async (...args) => { if (args[0] === "failing-backend") throw new Error("Temporary source error"); return original(...args); };
    await f.service.action(dev, bad); await f.service.action(dev, good); await f.service.workJobs();
    const project = (await f.service.snapshot(dev, projectId)).projects.find(p => p.id === projectId);
    assert.equal(project.repo, "Matthew-zzz/Existing-frontend");
    assert.equal(project.subprojects.find(p => p.id === bad.subprojectId).repositoryCreation.status, "retrying");
    assert.equal(project.subprojects.find(p => p.id === good.subprojectId).repo, "Matthew-zzz/healthy-worker");
    assert.equal(project.subprojects.find(p => p.id === good.subprojectId).repositoryCreation, undefined);
    const error = f.service.errors.query({ state: "all" }).events.find(e => e.operation === "github.repository.create");
    assert.equal(error.subprojectId, bad.subprojectId); assert.equal(error.subprojectName, "Backend");
  } finally { f.close(); }
});
