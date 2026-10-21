import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { PortalService } from "../server/service.ts";
import { projectRepositories } from "../src/features/portal/model/project-repositories.ts";
import { portalFixture } from "./helpers/portal-fixture.mjs";

const definition = () => ({ type: "project.request", requestId: randomUUID(), name: "Новый проект", clientEmail: "client@example.test", description: "Личный кабинет", brief: "Кабинет с каталогом и поиском. Подробное ТЗ клиента." });
async function request(f, input = definition()) {
  await f.service.action(f.login("curator").session, input);
  return f.store.get("projects", `project:${input.requestId}`);
}
const repositoryAction = project => ({ type: "project.repository.create", projectId: project.id });

test("curator creates an idempotent client project without GitHub or access to private chats", async () => {
  const f = portalFixture();
  try {
    const input = definition();
    for (const role of ["client", "developer", "admin", "temporary"]) await assert.rejects(f.service.action(f.login(role).session, input), { status: 403 });
    await assert.rejects(request(f, { ...input, clientEmail: "missing@example.test" }), { status: 404 });
    await assert.rejects(request(f, { ...input, clientEmail: "developer@example.test" }), { status: 404 });
    f.integrations.ready.github = false;
    f.integrations.createRepository = async () => { throw new Error("Must not call GitHub during curator creation"); };
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
    const curator = await f.service.snapshot(f.login("curator").session);
    assert.ok(curator.projects.some(item => item.id === project.id));
    assert.equal(curator.messages.length, 0); assert.equal(curator.conversations.length, 0);
  } finally { f.close(); }
});

test("only the assigned developer creates one exclusive repository and initial GitHub issue", async () => {
  const f = portalFixture();
  try {
    const project = await request(f); const action = repositoryAction(project);
    for (const role of ["client", "other", "curator", "admin", "temporary"]) await assert.rejects(f.service.action(f.login(role).session, action), { status: 403 });
    const developer = f.login("developer").session;
    await assert.rejects(f.service.action(developer, action), { status: 403 });
    assert.equal(f.repositories.length, 0);
    await f.service.action(developer, { type: "project.accept", projectId: project.id });
    const assigned = f.store.get("projects", project.id);
    f.store.put("projects", { ...assigned, developerId: "another-developer" });
    await assert.rejects(f.service.action(developer, { ...action, developerId: developer.viewer.id }), { status: 403 });
    f.store.put("projects", assigned);
    await Promise.all([1, 2, 3].map(() => f.service.action(developer, action)));
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
    await assert.rejects(f.service.action(developer, repositoryAction(project)), /response lost/);
    assert.equal(f.store.get("projects", project.id).repo, ""); assert.equal(f.repositories.length, 1);
    const reservation = f.store.get("repositoryRequests", project.id);
    assert.ok(reservation); assert.equal(`${reservation.owner}/${reservation.name}`, f.repositories[0]);
    const restarted = new PortalService(f.store, f.integrations, f.config);
    await restarted.action(developer, repositoryAction(project));
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
    await assert.rejects(f.service.action(developer, repositoryAction(project)), /Issue response lost/);
    assert.equal(f.store.get("projects", project.id).repo, ""); assert.equal(f.store.all("tasks", project.id).length, 0);
    await assert.rejects(f.service.action(developer, { type: "project.create", requestId: randomUUID(), name: "Other", clientEmail: f.users.other.email, description: "", repositories: [{ name: "Main", repo: f.repositories[0] }] }), { status: 409 });
    await f.service.action(developer, repositoryAction(project));
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
    await assert.rejects(f.service.action(developer, repositoryAction(project)), /Unavailable/);
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
    const curator = f.login("curator").session;
    await f.service.action(curator, { type: "order.create", order: { projectName: "Paid", clientName: "New", email: "new@example.test", username: "new", brief: "Paid brief", totalKopecks: 10000 } });
    const order = f.store.all("orders")[0]; f.service.payOrder(order.checkoutToken, "succeeded");
    await f.service.action(curator, { type: "order.provision", orderId: order.id }); await f.service.workJobs();
    const project = f.store.get("projects", `project:${order.id}`);
    assert.ok(project); assert.equal(project.repo, ""); assert.equal(f.repositories.length, 0);
    assert.equal(f.store.get("orders", order.id).status, "ready"); assert.equal(f.sent.filter(item => item.email).length, 1);
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
    for (const role of ["client", "developer", "curator", "admin"]) {
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
    const pending = f.service.action(developer, repositoryAction(project)); await ready;
    f.service.projects.archive(project.id); release();
    await assert.rejects(pending, { status: 404 });
    assert.equal(f.store.get("projects", project.id).status, "archived"); assert.equal(f.store.get("projects", project.id).repo, "");
    assert.equal(f.store.all("tasks", project.id).length, 0);
  } finally { f.close(); }
});
