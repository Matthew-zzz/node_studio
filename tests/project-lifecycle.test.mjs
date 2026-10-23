import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { backup } from "node:sqlite";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { PortalService } from "../server/service.ts";
import { PortalStore } from "../server/store.ts";
import { projectRepositories } from "../src/features/portal/model/project-repositories.ts";
import { portalFixture } from "./helpers/portal-fixture.mjs";
import { portalApi } from "./helpers/http.mjs";

const definition = () => ({ type: "project.request", requestId: randomUUID(), name: "Новый проект", clientEmail: "client@example.test", description: "Личный кабинет", brief: "Кабинет с каталогом и поиском. Подробное ТЗ клиента." });
async function request(f, input = definition()) {
  await f.service.action(f.login("developer").session, input);
  return f.store.get("projects", `project:${input.requestId}`);
}
const repositoryAction = project => ({ type: "project.repository.create", projectId: project.id });
const retryNow = f => f.store.db.prepare("UPDATE jobs SET available=0 WHERE kind='github.repository.create'").run();

test("project intake accepts an existing GitHub repository and loads its history without creating or changing remote resources", async () => {
  const f = portalFixture();
  try {
    const repo = "Matthew-zzz/Existing-project"; const issues = structuredClone(f.issues.get("Matthew-zzz/fixture-one"));
    f.issues.set(repo, issues); f.commits.set(repo, [{ sha: "e".repeat(40), title: "init: existing project", author: "Developer", createdAt: new Date().toISOString() }]);
    const input = { ...definition(), repository: "https://github.com/Matthew-zzz/Existing-project.git" }; const project = await request(f, input);
    assert.equal(project.repo, repo); assert.equal(project.subprojects[0].id, "main"); assert.equal(project.developerId, undefined);
    await request(f, input); assert.equal(f.store.all("conversations", project.id).length, 1);
    assert.equal(f.store.db.prepare("SELECT count(*) n FROM jobs WHERE kind='github.repository.create'").get().n, 0); assert.equal(f.repositories.length, 0);
    const snapshot = await f.service.snapshot(f.login("client").session, project.id);
    assert.ok(snapshot.tasks.some(task => task.projectId === project.id)); assert.ok(snapshot.commits.some(commit => commit.title === "init: existing project"));
    assert.equal(snapshot.projects.find(item => item.id === project.id).repositoryReady, true); assert.ok(!JSON.stringify(snapshot).includes(repo));
    assert.deepEqual(f.issues.get(repo), issues);
    await assert.rejects(request(f, { ...definition(), repository: "Matthew-zzz/existing-PROJECT" }), { status: 409 });
    await assert.rejects(request(f, { ...input, repository: "Matthew-zzz/different" }), { status: 409 });
  } finally { f.close(); }
});

test("existing repository intake validates ownership, availability, Issues and write access without leaving a partial project", async () => {
  const f = portalFixture();
  try {
    for (const repository of ["other-owner/repo", "https://example.test/repo", "Matthew-zzz/..", "Matthew-zzz/.", "Matthew-zzz/repo/issues", "Matthew-zzz/repo?token=bad", 123]) await assert.rejects(request(f, { ...definition(), repository }), { status: 400 });
    await assert.rejects(request(f, { ...definition(), repository: "Matthew-zzz/old", repositoryName: "new" }), { status: 400 });
    const input = { ...definition(), repository: "Matthew-zzz/Existing" }; const before = f.store.all("projects").length;
    const original = f.integrations.repository;
    f.integrations.repository = async () => ({ fullName: input.repository, issuesEnabled: false, writable: true }); await assert.rejects(request(f, input), { status: 409 });
    f.integrations.repository = async () => ({ fullName: input.repository, issuesEnabled: true, writable: false }); await assert.rejects(request(f, input), { status: 403 });
    f.integrations.repository = original; f.integrations.ready.github = false; await assert.rejects(request(f, input), { status: 503 });
    assert.equal(f.store.all("projects").length, before); assert.equal(f.store.get("projects", `project:${input.requestId}`), undefined);
  } finally { f.close(); }
});

test("only the assigned developer can attach an existing primary repository; duplicate requests are safe and do not create new repositories", async () => {
  const f = portalFixture(); const { request: http, login } = portalApi(f);
  try {
    const project = await request(f, { ...definition(), repositoryName: "planned-new-name" }); const action = { type: "project.repository.attach", projectId: project.id, repo: "https://github.com/Matthew-zzz/Existing.git" };
    for (const role of ["client", "admin"]) assert.equal((await http("action", action, await login(role))).statusCode, 403);
    const developer = await login("developer"); assert.equal((await http("action", action, developer)).statusCode, 403);
    await http("action", { type: "project.accept", projectId: project.id }, developer);
    assert.equal((await http("action", action, developer, { "x-csrf-token": "bad" })).statusCode, 403);
    assert.equal((await http("action", action, developer, { origin: "https://attacker.test" })).statusCode, 403);
    assert.equal((await http("action", action, developer)).statusCode, 200); assert.equal((await http("action", action, developer)).statusCode, 200);
    const attached = f.store.get("projects", project.id); assert.equal(attached.repo, "Matthew-zzz/Existing"); assert.equal(attached.repositoryName, undefined);
    assert.equal(attached.subprojects.length, 1); assert.equal(f.store.get("repositoryRequests", project.id), undefined); assert.equal(f.repositories.length, 0);
    assert.equal((await http("action", { ...action, repo: "Matthew-zzz/different" }, developer)).statusCode, 409);
    const second = await request(f); await http("action", { type: "project.accept", projectId: second.id }, developer);
    assert.equal((await http("action", { ...action, projectId: second.id }, developer)).statusCode, 409);
  } finally { f.close(); }
});

test("attaching a repository rechecks archived projects and a competing new-repository job after the GitHub lookup", async () => {
  const f = portalFixture();
  try {
    const developer = f.login("developer").session; const original = f.integrations.repository;
    for (const change of ["archive", "queue"]) {
      const project = await request(f); await f.service.action(developer, { type: "project.accept", projectId: project.id });
      f.integrations.repository = async repo => {
        if (change === "archive") await f.service.action(developer, { type: "project.delete", projectId: project.id, confirmation: project.name });
        else await f.service.action(developer, repositoryAction(project));
        return original(repo);
      };
      await assert.rejects(f.service.action(developer, { type: "project.repository.attach", projectId: project.id, repo: "Matthew-zzz/Existing" }), { status: change === "archive" ? 404 : 409 });
      assert.equal(f.store.get("projects", project.id).repo, "");
    }
  } finally { f.close(); }
});

test("custom repository names are saved at project creation, reserved case-insensitively and hidden from the client", async () => {
  const f = portalFixture();
  try {
    const input = { ...definition(), repositoryName: "AnimeLove-frontend" };
    const project = await request(f, input); assert.equal(project.repositoryName, input.repositoryName); assert.equal(f.repositories.length, 0);
    await request(f, input);
    await assert.rejects(request(f, { ...input, repositoryName: "different-name" }), { status: 409 });
    await assert.rejects(request(f, { ...definition(), repositoryName: "animelove-FRONTEND" }), { status: 409 });
    const snapshot = await f.service.snapshot(f.login("client").session, project.id);
    assert.equal(snapshot.projects.find(item => item.id === project.id).repositoryName, undefined);
    const developer = f.login("developer").session;
    await f.service.action(developer, { type: "project.accept", projectId: project.id });
    await f.service.action(developer, repositoryAction(project));
    assert.equal(f.store.get("repositoryRequests", project.id).name, input.repositoryName);
    await f.service.workJobs(); assert.equal(f.store.get("projects", project.id).repo, "Matthew-zzz/AnimeLove-frontend");
  } finally { f.close(); }
});

test("repository names are validated on the server, and only the assigned developer may override the name before starting", async () => {
  const f = portalFixture(); const { request: http, login } = portalApi(f);
  try {
    for (const repositoryName of ["Детали", "my repository", "owner/repo", "../repo", ".", "bad.git", "x".repeat(101), "<script>", 123]) await assert.rejects(request(f, { ...definition(), repositoryName }), { status: 400 });
    const project = await request(f); const developer = await login("developer");
    for (const role of ["client", "admin"]) assert.equal((await http("action", { ...repositoryAction(project), repositoryName: "chosen" }, await login(role))).statusCode, 403);
    assert.equal((await http("action", { ...repositoryAction(project), repositoryName: "chosen" }, developer)).statusCode, 403);
    await http("action", { type: "project.accept", projectId: project.id }, developer);
    assert.equal((await http("action", { ...repositoryAction(project), repositoryName: "owner/repo" }, developer)).statusCode, 400);
    assert.equal(f.store.get("repositoryRequests", project.id), undefined);
    assert.equal((await http("action", { ...repositoryAction(project), repositoryName: "Chosen.repo_2" }, developer, { "x-csrf-token": "bad" })).statusCode, 403);
    assert.equal((await http("action", { ...repositoryAction(project), repositoryName: "Chosen.repo_2" }, developer)).statusCode, 200);
    assert.equal(f.store.get("repositoryRequests", project.id).name, "Chosen.repo_2");
    assert.equal((await http("action", { ...repositoryAction(project), repositoryName: "second-repo" }, developer)).statusCode, 409);
    await f.service.workJobs(); assert.equal(f.store.get("projects", project.id).repo, "Matthew-zzz/Chosen.repo_2");
  } finally { f.close(); }
});

test("a named repository cannot take an imported repository or another project's planned name", async () => {
  const f = portalFixture();
  try {
    await assert.rejects(request(f, { ...definition(), repositoryName: "fixture-one" }), { status: 409 });
    const project = await request(f, { ...definition(), repositoryName: "reserved-name" });
    const developer = f.login("developer").session;
    await assert.rejects(f.service.action(developer, { type: "project.create", requestId: randomUUID(), name: "Imported", clientEmail: f.users.client.email, description: "", repositories: [{ name: "Main", repo: "Matthew-zzz/RESERVED-NAME" }] }), { status: 409 });
    assert.equal(f.store.get("projects", project.id).repo, "");
  } finally { f.close(); }
});

test("a custom name and its ownership marker survive lost GitHub replies and a process restart", async () => {
  const f = portalFixture(); const directory = await mkdtemp(join(tmpdir(), "node-named-repository-")); let store;
  try {
    const project = await request(f, { ...definition(), repositoryName: "StableName" }); const developer = f.login("developer").session;
    await f.service.action(developer, { type: "project.accept", projectId: project.id });
    await f.service.action(developer, repositoryAction(project));
    const create = f.integrations.createRepository; const calls = []; let lost = true;
    f.integrations.createRepository = async (name, identity) => { calls.push({ name, identity }); const repo = await create(name, identity); if (lost) { lost = false; throw new Error("Lost GitHub reply"); } return repo; };
    await f.service.workJobs(); assert.equal(f.repositories.length, 1);
    const path = join(directory, "portal.sqlite"); await backup(f.store.db, path); store = new PortalStore(path); store.db.exec("UPDATE jobs SET available=0");
    const service = new PortalService(store, f.integrations, f.config); await service.workJobs();
    assert.equal(store.get("projects", project.id).repo, "Matthew-zzz/StableName");
    assert.deepEqual(calls, [{ name: "StableName", identity: project.id }, { name: "StableName", identity: project.id }]);
    assert.equal(f.repositories.length, 1); assert.equal(f.issues.get("Matthew-zzz/StableName").length, 1);
  } finally { store?.close(); f.close(); await rm(directory, { recursive: true, force: true }); }
});

test("intake creates an idempotent client project without requiring GitHub", async () => {
  const f = portalFixture();
  try {
    const input = definition();
    for (const role of ["client", "admin", "temporary"]) await assert.rejects(f.service.action(f.login(role).session, input), { status: 403 });
    await assert.rejects(request(f, { ...input, clientEmail: "missing@example.test" }), { status: 404 });
    await assert.rejects(request(f, { ...input, clientEmail: "developer@example.test" }), { status: 404 });
    f.integrations.ready.github = false;
    f.integrations.createRepository = async () => { throw new Error("Must not call GitHub during intake creation"); };
    const project = await request(f, input); await request(f, input);
    assert.equal(project.repo, ""); assert.deepEqual(projectRepositories(project), []);
    assert.equal(project.developerId, undefined);
    assert.equal(f.store.all("conversations", project.id).length, 1);
    assert.equal(f.store.all("tasks", project.id).length, 0);
    const developer = await f.service.snapshot(f.login("developer").session, project.id);
    assert.equal(developer.projects.find(item => item.id === project.id).brief, input.brief);
    assert.equal(developer.syncError, null); assert.equal(developer.syncedAt, null); assert.deepEqual(developer.repositoryStatus, {});
    const client = await f.service.snapshot(f.login("client").session, project.id);
    assert.equal(client.projects.find(item => item.id === project.id).repositoryReady, false);
    assert.ok(!(await f.service.snapshot(f.login("other").session)).projects.some(item => item.id === project.id));
    const intake = await f.service.snapshot(f.login("developer").session);
    assert.ok(intake.projects.some(item => item.id === project.id));
    assert.ok(intake.conversations.some(thread => thread.projectId === project.id));
  } finally { f.close(); }
});

test("only the assigned developer creates one exclusive repository and initial GitHub issue", async () => {
  const f = portalFixture();
  try {
    const project = await request(f); const action = repositoryAction(project);
    for (const role of ["client", "other", "admin", "temporary"]) await assert.rejects(f.service.action(f.login(role).session, action), { status: 403 });
    const developer = f.login("developer").session;
    await assert.rejects(f.service.action(developer, action), { status: 403 });
    assert.equal(f.repositories.length, 0);
    await f.service.action(developer, { type: "project.accept", projectId: project.id });
    const assigned = f.store.get("projects", project.id);
    f.store.put("projects", { ...assigned, developerId: "another-developer" });
    await assert.rejects(f.service.action(developer, { ...action, developerId: developer.viewer.id }), { status: 404 });
    f.store.put("projects", assigned);
    await Promise.all([1, 2, 3].map(() => f.service.action(developer, action)));
    assert.equal(f.repositories.length, 0, "the HTTP action only queues durable work");
    assert.equal(f.store.db.prepare("SELECT count(*) AS n FROM jobs WHERE kind='github.repository.create'").get().n, 1);
    const pending = await f.service.snapshot(developer, project.id);
    assert.equal(pending.projects.find(item => item.id === project.id).repositoryCreation.status, "queued");
    for (const role of ["client"]) {
      const snapshot = await f.service.snapshot(f.login(role).session, project.id);
      const visible = snapshot.projects.find(item => item.id === project.id);
      assert.equal(visible.repositoryCreation, undefined);
      assert.equal(visible.subprojects, undefined);
    }
    await f.service.workJobs();
    assert.equal(f.repositories.length, 1);
    const current = f.store.get("projects", project.id);
    assert.equal(current.repo, f.repositories[0]); assert.equal(current.subprojects.length, 1);
    const issues = f.issues.get(current.repo); assert.equal(issues.length, 1);
    assert.equal(issues[0].kind, "initial"); assert.equal(issues[0].body, project.brief);
    const client = await f.service.snapshot(f.login("client").session, project.id);
    const visible = client.projects.find(item => item.id === project.id);
    assert.equal(visible.repo, ""); assert.equal(visible.subprojects, undefined); assert.equal(visible.repositoryReady, true);
    assert.equal(client.tasks.find(item => item.projectId === project.id).body, project.brief);
    await assert.rejects(f.service.action(developer, { type: "project.create", requestId: randomUUID(), name: "Duplicate", clientEmail: f.users.other.email, description: "", repositories: [{ name: "Main", repo: current.repo }] }), { status: 409 });
  } finally { f.close(); }
});

test("a GitHub timeout reuses its durable reservation after service restart", async () => {
  const f = portalFixture();
  try {
    const project = await request(f); const developer = f.login("developer").session;
    await f.service.action(developer, { type: "project.accept", projectId: project.id });
    const create = f.integrations.createRepository; let failed = false;
    f.integrations.createRepository = async name => { const repo = await create(name); if (!failed) { failed = true; throw new Error("GitHub response lost"); } return repo; };
    await f.service.action(developer, repositoryAction(project)); await f.service.workJobs();
    assert.equal(f.store.get("projects", project.id).repo, ""); assert.equal(f.repositories.length, 1);
    const reservation = f.store.get("repositoryRequests", project.id);
    assert.ok(reservation); assert.equal(`${reservation.owner}/${reservation.name}`, f.repositories[0]);
    assert.equal(reservation.status, "retrying"); assert.equal(reservation.attempts, 1);
    const jobBefore = f.store.db.prepare("SELECT * FROM jobs WHERE kind='github.repository.create'").get();
    await f.service.action(developer, repositoryAction(project));
    assert.deepEqual(f.store.db.prepare("SELECT * FROM jobs WHERE kind='github.repository.create'").get(), jobBefore, "duplicate clicks preserve the retry delay and attempt count");
    const restarted = new PortalService(f.store, f.integrations, f.config);
    retryNow(f); await restarted.workJobs();
    await restarted.action(developer, repositoryAction(project));
    assert.equal(f.repositories.length, 1); assert.equal(f.issues.get(f.repositories[0]).length, 1);
    assert.equal(f.store.get("projects", project.id).repo, f.repositories[0]);
  } finally { f.close(); }
});

test("a lost initial-issue response is retried once and reserved repositories cannot be taken by another project", async () => {
  const f = portalFixture();
  try {
    const project = await request(f); const developer = f.login("developer").session;
    await f.service.action(developer, { type: "project.accept", projectId: project.id });
    const createIssue = f.integrations.createIssue; let failed = false;
    f.integrations.createIssue = async (...args) => { const issue = await createIssue(...args); if (!failed) { failed = true; throw new Error("Issue response lost"); } return issue; };
    await f.service.action(developer, repositoryAction(project)); await f.service.workJobs();
    assert.equal(f.store.get("projects", project.id).repo, ""); assert.equal(f.store.all("tasks", project.id).length, 0);
    await assert.rejects(f.service.action(developer, { type: "project.create", requestId: randomUUID(), name: "Other", clientEmail: f.users.other.email, description: "", repositories: [{ name: "Main", repo: f.repositories[0] }] }), { status: 409 });
    retryNow(f); await f.service.workJobs();
    assert.equal(f.issues.get(f.repositories[0]).length, 1); assert.equal(f.store.all("tasks", project.id).length, 1);
  } finally { f.close(); }
});

test("unavailable GitHub leaves the project usable; switching owners cannot create a second repository", async () => {
  const f = portalFixture();
  try {
    const project = await request(f); const developer = f.login("developer").session;
    await f.service.action(developer, { type: "project.accept", projectId: project.id });
    f.integrations.ready.github = false;
    await assert.rejects(f.service.action(developer, repositoryAction(project)), { status: 503 });
    assert.equal(f.store.get("repositoryRequests", project.id), undefined);
    f.integrations.ready.github = true;
    f.integrations.createIssue = async () => { throw new Error("Unavailable"); };
    await f.service.action(developer, repositoryAction(project)); await f.service.workJobs();
    const changed = new PortalService(f.store, f.integrations, { ...f.config, githubOwner: "another-owner" });
    await assert.rejects(changed.action(developer, repositoryAction(project)), { status: 409 });
    assert.equal(f.repositories.length, 1);
    await f.service.action(f.login("client").session, { type: "message", threadId: `chat:${project.id}`, text: "Хочу поиск" });
    await f.service.workJobs();
    const draft = f.store.all("drafts", project.id)[0]; assert.ok(draft);
    await assert.rejects(f.service.action(f.login("client").session, { type: "draft.confirm", draftId: draft.id }), { status: 409 });
    assert.equal(f.store.get("drafts", draft.id).confirmed, false);
  } finally { f.close(); }
});

test("paid project and client access can be provisioned while GitHub is disconnected", async () => {
  const f = portalFixture();
  try {
    f.integrations.ready.github = false;
    const intake = f.login("developer").session;
    await f.service.action(intake, { type: "order.create", order: { projectName: "Paid", clientName: "New", email: "new@example.test", username: "new", brief: "Paid brief", totalKopecks: 10000 } });
    const order = f.store.all("orders")[0]; f.service.payOrder(order.checkoutToken, "succeeded");
    await f.service.action(intake, { type: "order.provision", orderId: order.id }); await f.service.workJobs();
    const project = f.store.get("projects", `project:${order.id}`);
    assert.ok(project); assert.equal(project.repo, ""); assert.equal(f.repositories.length, 0);
    assert.equal(f.store.get("orders", order.id).status, "ready"); assert.equal(f.sent.filter(item => item.deliveryId === `access:${order.id}`).length, 1);
    await f.service.action(f.login("developer").session, { type: "project.accept", projectId: project.id });
    // A delayed duplicate provisioning job must preserve acceptance and cannot reset the project.
    f.store.enqueue("provision", { orderId: order.id }, "delayed-provision"); await f.service.workJobs();
    assert.equal(f.store.get("projects", project.id).developerId, f.users.developer.id);
  } finally { f.close(); }
});

test("archived projects disappear for every role and queued jobs cannot recreate or contact them", async () => {
  const f = portalFixture();
  try {
    const input = definition(); const project = await request(f, input);
    const developer = f.login("developer").session;
    await f.service.action(developer, { type: "project.accept", projectId: project.id });
    await f.service.action(developer, repositoryAction(project));
    await f.service.workJobs();
    await f.service.action(f.login("client").session, { type: "message", threadId: `chat:${project.id}`, text: "Сделать поиск" });
    const token = "ab".repeat(32);
    const order = f.store.put("orders", { id: input.requestId, projectName: project.name, clientName: "Client", email: input.clientEmail, username: "client", brief: input.brief, totalKopecks: 100, status: "provisioning", checkoutToken: token, projectId: project.id, createdAt: project.createdAt });
    f.store.enqueue("provision", { orderId: order.id });
    f.store.enqueue("mail", { orderId: order.id, email: input.clientEmail, content: "Must not decrypt or send" });
    f.store.enqueue("github.sync", { projectId: project.id });
    const archived = f.service.projects.archive(project.id); f.service.projects.archive(project.id);
    assert.equal(archived.status, "archived"); assert.ok(archived.archivedAt);
    await f.service.workJobs();
    assert.equal(f.sent.length, 0); assert.equal(f.store.db.prepare("SELECT count(*) AS count FROM jobs").get().count, 0);
    for (const role of ["client", "developer", "admin"]) {
      const snapshot = await f.service.snapshot(f.login(role).session, project.id);
      for (const kind of ["projects", "tasks", "stages", "commits", "drafts", "quotes"]) assert.ok(!snapshot[kind].some(item => item.id === project.id || item.projectId === project.id), `${role}: ${kind}`);
      assert.ok(!snapshot.orders.some(item => item.id === order.id));
      assert.ok(!snapshot.messages.some(item => item.threadId === `chat:${project.id}`));
    }
    await assert.rejects(f.service.action(developer, repositoryAction(project)), { status: 404 });
    await assert.rejects(f.service.action(developer, { type: "project.accept", projectId: project.id }), { status: 404 });
    await assert.rejects(request(f, input), { status: 409 });
    await assert.rejects(f.service.action(f.login("client").session, { type: "message", threadId: `chat:${project.id}`, text: "Hidden" }), { status: 404 });
    assert.throws(() => f.service.checkout(token), { status: 404 });
    const repo = f.store.get("projects", project.id).repo;
    f.service.receiveGitHub(randomUUID(), { repository: { full_name: repo } });
    assert.equal(f.store.db.prepare("SELECT count(*) AS count FROM jobs").get().count, 0);
    assert.equal(f.repositories.length, 1); assert.equal(f.issues.get(repo).length, 1, "remote code and issues remain intact");
    assert.equal(f.store.all("tasks", project.id).length, 1, "archiving preserves the local history");
    assert.equal(f.store.get("projects", "one").status, "active");
  } finally { f.close(); }
});

test("archiving during repository creation prevents a late response from binding or reopening it", async () => {
  const f = portalFixture();
  try {
    const project = await request(f); const developer = f.login("developer").session;
    await f.service.action(developer, { type: "project.accept", projectId: project.id });
    let release; let started;
    const ready = new Promise(resolve => { started = resolve; });
    f.integrations.createRepository = async name => { started(); await new Promise(resolve => { release = resolve; }); return `Matthew-zzz/${name}`; };
    await f.service.action(developer, repositoryAction(project));
    const pending = f.service.workJobs(); await ready;
    f.service.projects.archive(project.id); release();
    await pending;
    assert.equal(f.store.get("projects", project.id).status, "archived"); assert.equal(f.store.get("projects", project.id).repo, "");
    assert.equal(f.store.all("tasks", project.id).length, 0);
    retryNow(f); await f.service.workJobs();
    assert.equal(f.store.db.prepare("SELECT count(*) AS n FROM jobs WHERE kind='github.repository.create'").get().n, 0);
  } finally { f.close(); }
});

test("repository jobs stop after eight failures, report the developer and can safely resume after a fix", async () => {
  const f = portalFixture();
  try {
    const project = await request(f); const developer = f.login("developer").session;
    await f.service.action(developer, { type: "project.accept", projectId: project.id });
    const create = f.integrations.createRepository; const names = [];
    f.integrations.createRepository = async name => { names.push(name); throw new Error("GitHub unavailable"); };
    await f.service.action(developer, repositoryAction(project));
    for (let i = 0; i < 8; i++) { retryNow(f); await f.service.workJobs(); }
    assert.equal(names.length, 8); assert.equal(new Set(names).size, 1);
    assert.equal(f.store.get("repositoryRequests", project.id).status, "failed");
    const failed = (await f.service.snapshot(developer, project.id)).projects.find(item => item.id === project.id).repositoryCreation;
    assert.equal(failed.status, "failed"); assert.equal(failed.attempts, 8); assert.equal(failed.nextAttemptAt, undefined);
    retryNow(f); await f.service.workJobs(); assert.equal(names.length, 8);
    const event = f.service.errors.query({}).events.find(item => item.operation === "github.repository.create");
    assert.equal(event.actor.id, developer.viewer.id); assert.equal(event.actor.role, "developer");
    assert.equal(event.projectId, project.id); assert.equal(event.count, 8);
    f.integrations.createRepository = create;
    await f.service.action(developer, repositoryAction(project));
    assert.equal(f.store.get("repositoryRequests", project.id).status, "queued");
    await f.service.workJobs();
    assert.equal(f.store.get("projects", project.id).repo, `Matthew-zzz/${names[0]}`);
    assert.equal(f.repositories.length, 1); assert.equal(f.issues.get(f.repositories[0]).length, 1);
    assert.equal(f.store.db.prepare("SELECT count(*) AS n FROM jobs WHERE kind='github.repository.create'").get().n, 0);
  } finally { f.close(); }
});

test("a restarted store recovers an interrupted repository job without another click", async () => {
  const f = portalFixture(); const directory = await mkdtemp(join(tmpdir(), "node-repository-restart-")); let recovered;
  try {
    const project = await request(f); const developer = f.login("developer").session;
    await f.service.action(developer, { type: "project.accept", projectId: project.id });
    await f.service.action(developer, repositoryAction(project));
    f.store.db.prepare("UPDATE jobs SET running=1 WHERE kind='github.repository.create'").run();
    const path = join(directory, "portal.sqlite"); await backup(f.store.db, path);
    recovered = new PortalStore(path);
    const restarted = new PortalService(recovered, f.integrations, f.config);
    await restarted.workJobs();
    assert.equal(f.repositories.length, 1);
    assert.equal(recovered.get("projects", project.id).repo, f.repositories[0]);
    assert.equal(recovered.db.prepare("SELECT count(*) AS n FROM jobs").get().n, 0);
  } finally { recovered?.close(); f.close(); await rm(directory, { recursive: true, force: true }); }
});

test("queued creation rechecks ownership and skips archived projects before contacting GitHub", async () => {
  const f = portalFixture();
  try {
    const project = await request(f); const developer = f.login("developer").session;
    await f.service.action(developer, { type: "project.accept", projectId: project.id });
    await f.service.action(developer, repositoryAction(project));
    const assigned = f.store.get("projects", project.id);
    f.store.put("projects", { ...assigned, developerId: "another-developer" });
    await f.service.workJobs(); assert.equal(f.repositories.length, 0);
    assert.equal(f.store.get("repositoryRequests", project.id).status, "retrying");
    f.store.put("projects", assigned); f.service.projects.archive(project.id);
    retryNow(f); await f.service.workJobs();
    assert.equal(f.repositories.length, 0);
    assert.equal(f.store.db.prepare("SELECT count(*) AS n FROM jobs").get().n, 0);
  } finally { f.close(); }
});
