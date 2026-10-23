import assert from "node:assert/strict";
import test from "node:test";
import { DatabaseSync, backup } from "node:sqlite";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PortalStore } from "../server/store.ts";
import { PortalService } from "../server/service.ts";
import { DEFAULT_AGENT } from "../src/features/portal/model/agent.ts";
import { ROLE_LABELS } from "../src/features/portal/model/types.ts";
import { portalFixture, fixturePassword } from "./helpers/portal-fixture.mjs";
import { portalApi } from "./helpers/http.mjs";

async function legacyDatabase(f, path, withDeveloper = true) {
  await backup(f.store.db, path);
  const db = new DatabaseSync(path);
  db.exec(`PRAGMA foreign_keys=OFF;
    CREATE TABLE users_legacy (id TEXT PRIMARY KEY,email TEXT NOT NULL COLLATE NOCASE,name TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('client','developer','curator','admin')),password TEXT NOT NULL,must_change INTEGER NOT NULL DEFAULT 1,UNIQUE(email,role));
    INSERT INTO users_legacy SELECT * FROM users;
    DROP TABLE users; ALTER TABLE users_legacy RENAME TO users;
    CREATE UNIQUE INDEX one_developer ON users(role) WHERE role='developer';
    INSERT INTO users SELECT 'legacy-curator',email,'Прежний сотрудник','curator',password,0 FROM users WHERE role='admin';
    INSERT INTO sessions VALUES('retired-session','legacy-curator','csrf',9999999999999,'legacy-group');
    INSERT INTO auth_challenges(id,user_id,email,credential_hash,code_hash,created_at,expires,resend_at) VALUES('legacy-challenge','legacy-curator','admin@example.test','hash','hash',1,9999999999999,1);
    INSERT INTO auth_recoveries VALUES('legacy-recovery','legacy-curator','admin@example.test','hash',9999999999999);
  `);
  if (!withDeveloper) db.exec("DELETE FROM users WHERE role='developer'");
  const record = (kind, value) => db.prepare("INSERT OR REPLACE INTO records(kind,id,project_id,updated_at,payload) VALUES(?,?,?,?,?)").run(kind,value.id,value.projectId ?? "",new Date().toISOString(),JSON.stringify(value));
  record("projects",{...f.store.get("projects","one"),origin:"curator",curatorId:"legacy-curator"});
  record("conversations",{id:"telegram:123",kind:"telegram",projectId:"",name:"Клиент",username:"client",email:f.users.client.email,telegramId:"123",ownerId:"legacy-curator",ownerName:"Прежний сотрудник",handoffRequested:false,revision:4,updatedAt:"2026-10-01T00:00:00Z"});
  record("messages",{id:"historical",threadId:"telegram:123",role:"curator",author:"Прежний сотрудник",text:"Согласовали требования с куратором",createdAt:"2026-10-01T00:00:00Z"});
  record("briefLinks",{id:"telegram:123",threadId:"telegram:123",projectId:"one",curatorId:"legacy-curator",updatedAt:"2026-10-01T00:00:00Z"});
  record("briefRequests",{id:"pending-brief",threadId:"telegram:123",actorId:"legacy-curator",sourceHash:"source",model:"fixture",inputs:["Требования клиента"],results:[],round:0,step:0});
  record("clientBriefs",{id:"telegram:123",threadId:"telegram:123",requestId:"pending-brief",sourceHash:"source",messageCount:1,status:"queued",updatedAt:"2026-10-01T00:00:00Z"});
  record("agentSettings",{...structuredClone(DEFAULT_AGENT),id:"telegram",version:7,greeting:"Можно позвать куратора",systemPrompt:"Передай куратору. Сохрани моё правило.",updatedAt:"2026-10-01T00:00:00Z",updatedBy:"Администратор"});
  db.prepare("INSERT INTO jobs(id,kind,payload,attempts,available,running) VALUES(?,?,?,2,0,0)").run("brief:pending-brief:0","brief.generate",JSON.stringify({requestId:"pending-brief",step:"0",threadId:"telegram:123",_actorId:"legacy-curator"}));
  db.close();
}

test("retiring the curator preserves identities and history, transfers open work and revokes only the removed role", async () => {
  const f=portalFixture(); const directory=await mkdtemp(join(tmpdir(),"node-developer-migration-")); let store;
  try {
    const login=f.login("client");const developer=f.login("developer");const path=join(directory,"portal.sqlite");
    await legacyDatabase(f,path);
    const before=new DatabaseSync(path,{readOnly:true});
    const historical=before.prepare("SELECT payload FROM records WHERE kind='messages' AND id='historical'").get().payload;
    const credentials=before.prepare("SELECT id,email,password FROM users WHERE role<>'curator' ORDER BY id").all();before.close();
    store=new PortalStore(path);
    assert.deepEqual(store.db.prepare("SELECT id,email,password FROM users ORDER BY id").all(),credentials);
    assert.equal(store.db.prepare("SELECT count(*) AS n FROM users WHERE role='curator'").get().n,0);
    assert.equal(store.db.prepare("SELECT count(*) AS n FROM retired_accounts").get().n,1);
    assert.equal(store.session(login.token).viewer.id,f.users.client.id);assert.equal(store.session(developer.token).viewer.id,f.users.developer.id);
    assert.equal(store.session("retired-session"),undefined);
    assert.equal(store.db.prepare("SELECT count(*) AS n FROM sessions WHERE user_id='legacy-curator'").get().n,0);
    assert.equal(store.db.prepare("SELECT count(*) AS n FROM auth_challenges WHERE user_id='legacy-curator'").get().n,0);
    assert.equal(store.db.prepare("SELECT count(*) AS n FROM auth_recoveries WHERE user_id='legacy-curator'").get().n,0);
    assert.equal(store.get("conversations","telegram:123").ownerId,f.users.developer.id);assert.equal(store.get("conversations","telegram:123").revision,5);
    assert.equal(store.get("projects","one").createdBy,f.users.developer.id);assert.equal(store.get("projects","one").origin,"developer");
    assert.equal(store.get("briefLinks","telegram:123").createdBy,f.users.developer.id);
    assert.equal(store.get("briefRequests","pending-brief").actorId,f.users.developer.id);
    const job=store.db.prepare("SELECT * FROM jobs WHERE id='brief:pending-brief:0'").get();assert.equal(job.attempts,2);assert.equal(JSON.parse(job.payload)._actorId,f.users.developer.id);
    assert.equal(store.db.prepare("SELECT payload FROM records WHERE kind='messages' AND id='historical'").get().payload,historical);
    assert.equal(store.get("agentSettings","telegram").version,8);assert.equal(store.get("agentSettings","telegram").systemPrompt,"Передай разработчику. Сохрани моё правило.");
    assert.ok(store.all("agentRevisions").some(revision=>revision.settings.greeting.includes("куратора")));
    assert.deepEqual(store.db.prepare("PRAGMA foreign_key_check").all(),[]);
    const service=new PortalService(store,f.integrations,f.config);await service.workJobs();assert.equal(store.get("clientBriefs","telegram:123").status,"ready");
    store.close();store=new PortalStore(path);
    assert.equal(store.get("agentSettings","telegram").version,8);assert.equal(store.db.prepare("SELECT count(*) AS n FROM retired_accounts").get().n,1);
    assert.throws(()=>store.createUser("removed@example.test","Removed","curator",fixturePassword));
  } finally {store?.close();f.close();await rm(directory,{recursive:true,force:true});}
});

test("an installation with only a legacy curator promotes it to developer and can still serve clients", async () => {
  const f=portalFixture();const directory=await mkdtemp(join(tmpdir(),"node-developer-promote-"));let store;
  try {
    const path=join(directory,"portal.sqlite");await legacyDatabase(f,path,false);store=new PortalStore(path);
    const developer=store.findUser(f.users.admin.email,"developer");assert.equal(developer.id,"legacy-curator");
    assert.equal(store.authenticatePassword(developer.email,fixturePassword,"test","developer").id,developer.id);
    assert.equal(store.get("conversations","telegram:123").ownerId,developer.id);
    assert.deepEqual(store.db.prepare("PRAGMA foreign_key_check").all(),[]);
  } finally {store?.close();f.close();await rm(directory,{recursive:true,force:true});}
});

test("only three active roles exist; the developer owns intake, briefing and project work while clients stay isolated", async () => {
  const f=portalFixture();const {request}=portalApi(f);
  try {
    assert.deepEqual(Object.keys(ROLE_LABELS).sort(),["admin","client","developer"]);
    assert.equal((await request("login",{role:"curator",email:f.users.developer.email,password:fixturePassword})).statusCode,400);
    f.store.put("conversations",{id:"telegram:123",kind:"telegram",projectId:"",name:"Новый клиент",username:"new",email:"",telegramId:"123",ownerId:null,ownerName:null,handoffRequested:true,updatedAt:new Date().toISOString()});
    f.store.put("messages",{id:"intake-private",threadId:"telegram:123",role:"client",author:"Клиент",text:"Личные данные нового клиента",createdAt:new Date().toISOString()});
    const developer=f.login("developer").session;
    await f.service.action(developer,{type:"takeover",threadId:"telegram:123"});
    await f.service.action(developer,{type:"message",threadId:"telegram:123",text:"Я веду ваш проект от начала до конца"});
    await f.service.action(developer,{type:"brief.generate",threadId:"telegram:123"});await f.service.workJobs();
    const state=await f.service.snapshot(developer);assert.ok(state.conversations.some(thread=>thread.kind==="telegram"));assert.ok(state.conversations.some(thread=>thread.kind==="project"));assert.equal(state.clientBriefs[0].status,"ready");
    for(const role of ["client","other","admin","temporary"]){const snapshot=await f.service.snapshot(f.login(role).session);assert.ok(!snapshot.messages.some(message=>message.id==="intake-private"));assert.deepEqual(snapshot.clientBriefs,[]);assert.deepEqual(snapshot.orders,[]);}
    await f.service.action(developer,{type:"leave",threadId:"telegram:123"});assert.equal(f.store.get("conversations","telegram:123").ownerId,null);
  } finally {f.close();}
});
