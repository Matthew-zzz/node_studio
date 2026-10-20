import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";

// This project name owns only ephemeral CI resources. Never use the production project here.
const project = `node-studio-check-${randomUUID().slice(0, 8)}`;
const port = "3187";
const origin = `http://127.0.0.1:${port}`;
const environment = { ...process.env, IMAGE_TAG: process.env.IMAGE_TAG || "ci", HTTP_PORT: port, BIND_ADDRESS: "127.0.0.1", PORTAL_ORIGIN: origin, PORTAL_TRUST_PROXY: "false" };
for (const name of ["DOCKER_HOST", "DOCKER_CONTEXT", "DOCKER_TLS", "DOCKER_TLS_VERIFY", "DOCKER_CERT_PATH"]) delete environment[name];
const docker = ["--host=unix:///var/run/docker.sock", "compose", "--project-name", project, "--file", "compose.yaml"];

function compose(...args) {
  try { return execFileSync("docker", [...docker, ...args], { env: environment, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"], timeout: 180000 }); }
  catch { throw new Error(`Docker Compose failed: ${args.slice(0, 3).join(" ")}`); }
}
async function login(email, password) {
  const response = await fetch(`${origin}/api/portal/login`, { method: "POST", headers: { Origin: origin, "Content-Type": "application/json" }, body: JSON.stringify({ email, password }) });
  assert.equal(response.status, 200, "container authentication succeeds");
  return { snapshot: await response.json(), cookie: response.headers.get("set-cookie").split(";")[0] };
}

try {
  compose("up", "--detach", "--no-build", "--wait", "--wait-timeout", "90");
  for (const route of ["/", "/projects/autoparts/", "/cabinet/", "/cabinet-demo/", "/checkout/"]) {
    const response = await fetch(origin + route); assert.equal(response.status, 200, route); assert.ok((await response.text()).includes("<html"));
  }
  const health = await fetch(origin + "/api/portal/health").then(response => response.json());
  assert.equal(health.status, "ok"); assert.equal(health.revision, process.env.SOURCE_REVISION || "local");
  assert.equal(compose("exec", "--no-TTY", "app", "node", "-p", "process.getuid()").trim(), "1000", "application runs without root");
  for (const path of ["/.env", "/server/main.ts", "/data/initial-access.json"]) assert.ok([403, 404].includes((await fetch(origin + path)).status));

  // Generated test credentials stay in process memory and never enter CI logs.
  const access = JSON.parse(compose("exec", "--no-TTY", "app", "node", "-e", "process.stdout.write(require('node:fs').readFileSync('/data/initial-access.json','utf8'))"));
  const developer = access.find(user => user.role === "developer");
  const first = await login(developer.email, developer.password);
  assert.equal(first.snapshot.viewer.mustChangePassword, true);
  const password = "Container-verified-password-2026";
  const changed = await fetch(origin + "/api/portal/password", {
    method: "POST", headers: { Origin: origin, "Content-Type": "application/json", Cookie: first.cookie, "X-CSRF-Token": first.snapshot.csrf },
    body: JSON.stringify({ current: developer.password, replacement: password }),
  });
  assert.equal(changed.status, 200);
  assert.equal((await changed.json()).viewer.mustChangePassword, false);
  compose("up", "--detach", "--no-build", "--force-recreate", "--wait", "--wait-timeout", "90");
  assert.equal((await login(developer.email, password)).snapshot.viewer.mustChangePassword, false, "recreating the container preserves the account");
  assert.equal((await fetch(origin + "/api/portal/snapshot", { headers: { Cookie: first.cookie } }).then(response => response.json())).viewer.role, "developer", "session survives a container replacement");
  console.log("Docker verified: frontend + API, health, non-root runtime, first login, password change and persistent volume across recreation.");
} catch (error) {
  // Application logs contain no bootstrap credentials or incoming request bodies.
  spawnSync("docker", [...docker, "logs", "--tail", "40"], { env: environment, stdio: "inherit" });
  throw error;
} finally {
  // Cleanup is deliberately scoped to the uniquely named disposable test project.
  compose("down", "--volumes", "--remove-orphans");
}
