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
async function fetchApplication(path, options = {}) {
  // Replacing a container invalidates TCP connections retained by the test process.
  try { return await fetch(origin + path, { ...options, headers: { ...options.headers, Connection: "close" }, signal: AbortSignal.timeout(15000) }); }
  catch (cause) { throw new Error(`Container request failed: ${options.method || "GET"} ${path}`, { cause }); }
}
async function login(email, current) {
  // The disposable container has no SMTP credentials. Exercise the production email-proof
  // service with an in-memory mail adapter through operator access, never a public bypass.
  const source = `
    import {readFileSync} from 'node:fs';
    import {readConfig} from './server/config.ts';
    import {PortalStore} from './server/store.ts';
    import {initializeRuntime} from './server/runtime.ts';
    import {createIntegrations} from './server/integrations.ts';
    import {PortalAuth} from './server/auth.ts';
    const input=JSON.parse(readFileSync(0,'utf8'));const config=readConfig();
    const store=new PortalStore(config.database,{recoverJobs:false});initializeRuntime(store,config);
    const base=createIntegrations(config);let code;
    const integrations={...base,ready:{...base.ready,mail:true},mail:async(email,content)=>{code=content.match(/\\b\\d{6}\\b/)[0];}};
    const auth=new PortalAuth(store,integrations,config);
    const current=input.current?auth.session(input.current.split('=')[1]):undefined;
    const metadata={address:'container-test',agent:'Isolated container test'};
    const begun=await auth.begin(input.email,store.findUser(input.email)?.role,metadata,current);
    if('challenge' in begun)for(const row of store.db.prepare("SELECT id,payload FROM jobs WHERE kind='auth.mail'").all()){await auth.deliverMail(JSON.parse(row.payload),row.id);store.db.prepare('DELETE FROM jobs WHERE id=?').run(row.id);}
    const result='challenge' in begun?auth.verify(begun.token,code,metadata,current):begun;
    store.db.exec("DELETE FROM jobs WHERE kind='auth.mail'");
    console.log(JSON.stringify({token:result.token}));store.close();
  `;
  const generated = execFileSync("docker", [...docker, "exec", "--no-TTY", "app", "node", "--input-type=module", "-e", source], { env: environment, input: JSON.stringify({ email, current }), encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] });
  const cookie = `nodo_session=${JSON.parse(generated).token}`;
  const response = await fetchApplication("/api/portal/snapshot", { headers: { Cookie: cookie } });
  assert.equal(response.status, 200);
  const snapshot = await response.json();assert.ok(snapshot.viewer);
  return { snapshot, cookie };
}

try {
  compose("up", "--detach", "--no-build", "--wait", "--wait-timeout", "90");
  for (const route of ["/", "/projects/autoparts/", "/cabinet/", "/checkout/"]) {
    const response = await fetchApplication(route); assert.equal(response.status, 200, route); assert.ok((await response.text()).includes("<html"));
  }
  for (const route of ["/cabinet-demo/", "/checkout-demo/", "/payment-demo/"]) {
    const response = await fetchApplication(route); assert.equal(response.status, 404, route); await response.arrayBuffer();
  }
  const health = await fetchApplication("/api/portal/health").then(response => response.json());
  assert.equal(health.status, "ok"); assert.equal(health.revision, process.env.SOURCE_REVISION || "local");
  assert.equal(compose("exec", "--no-TTY", "app", "node", "-p", "process.getuid()").trim(), "1000", "application runs without root");
  for (const path of ["/.env", "/server/main.ts", "/data/initial-access.json"]) {
    const response = await fetchApplication(path); assert.ok([403, 404].includes(response.status)); await response.arrayBuffer();
  }
  console.log("Docker frontend, API health and runtime isolation verified.");

  // Generated test credentials stay in process memory and never enter CI logs.
  const access = JSON.parse(compose("exec", "--no-TTY", "app", "node", "-e", "process.stdout.write(require('node:fs').readFileSync('/data/initial-access.json','utf8'))"));
  const developer = access.find(user => user.role === "developer");
  const unconfiguredMail = await fetchApplication("/api/portal/login", { method: "POST", headers: { Origin: origin, "Content-Type": "application/json" }, body: JSON.stringify({ email: developer.email, role: "developer" }) });
  assert.equal(unconfiguredMail.status, 503, "an isolated server without mail never falls back to password-only login");
  await unconfiguredMail.arrayBuffer();
  const intake = access.find(user => user.role === "admin");
  const owner = await login(intake.email);
  let first = await login(developer.email, owner.cookie);
  assert.equal(first.snapshot.viewer.mustChangePassword, false);
  const changed = await fetchApplication("/api/portal/password", { method: "POST", headers: { Origin: origin, "Content-Type": "application/json", Cookie: first.cookie, "X-CSRF-Token": first.snapshot.csrf }, body: "{}" });
  assert.equal(changed.status, 410); await changed.arrayBuffer();
  const account = await fetchApplication("/api/portal/snapshot", { headers: { Cookie: first.cookie } }).then(response => response.json());
  assert.equal(account.projects.length, 0, "a fresh installation does not seed customer projects");
  assert.equal(account.messages.length, 0, "a fresh installation does not seed customer messages");
  const added = owner;
  const profiles = await fetchApplication("/api/portal/snapshot", { headers: { Cookie: added.cookie } }).then(response => response.json());
  assert.equal(profiles.viewer.role, "admin"); assert.equal(profiles.profiles.length, 2);
  const back = await fetchApplication("/api/portal/profiles/switch", {
    method: "POST", headers: { Origin: origin, "Content-Type": "application/json", Cookie: added.cookie, "X-CSRF-Token": profiles.csrf },
    body: JSON.stringify({ userId: account.viewer.id }),
  });
  assert.equal(back.status, 200);
  first = { snapshot: await back.json(), cookie: back.headers.get("set-cookie").split(";")[0] };
  compose("up", "--detach", "--no-build", "--force-recreate", "--wait", "--wait-timeout", "90");
  console.log("Docker container replaced; checking persistent account and session.");
  assert.equal((await login(developer.email)).snapshot.viewer.mustChangePassword, false, "recreating the container preserves the account");
  const restored = await fetchApplication("/api/portal/snapshot", { headers: { Cookie: first.cookie } }).then(response => response.json());
  assert.equal(restored.viewer.role, "developer", "session survives a container replacement");
  assert.equal(restored.profiles.length, 2, "remembered profiles survive a container replacement");
  const switched = await fetchApplication("/api/portal/profiles/switch", {
    method: "POST", headers: { Origin: origin, "Content-Type": "application/json", Cookie: first.cookie, "X-CSRF-Token": restored.csrf },
    body: JSON.stringify({ userId: profiles.viewer.id }),
  });
  assert.equal(switched.status, 200); assert.equal((await switched.json()).viewer.role, "admin");
  console.log("Docker verified: frontend + API, health, non-root runtime, code-only login and persistent accounts, sessions and profile switching across recreation.");
} catch (error) {
  // Application logs contain no bootstrap credentials or incoming request bodies.
  spawnSync("docker", [...docker, "logs", "--tail", "40"], { env: environment, stdio: "inherit" });
  throw error;
} finally {
  // Cleanup is deliberately scoped to the uniquely named disposable test project.
  compose("down", "--volumes", "--remove-orphans");
}
