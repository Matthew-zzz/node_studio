import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { backup } from 'node:sqlite';
import { portalFixture } from './helpers/portal-fixture.mjs';
import { PortalStore } from '../server/store.ts';
import { PortalService } from '../server/service.ts';
import { createIntegrations } from '../server/integrations.ts';
import { readConfig } from '../server/config.ts';
import { portalApi } from './helpers/http.mjs';

const repo = 'Matthew-zzz/fixture-one';
const plan = (input, overrides = {}) => ({ operation:'create',draftId:'',taskId:'',title:'Поиск товаров',body:'Добавить поиск товаров по названию.',subprojectId:'main',reason:'Клиент попросил поиск.',sourceMessageIds:[input.messages.filter(m=>m.role==='client').at(-1).id],...overrides });
const setup = () => {
  const f = portalFixture();
  f.integrations.planTasks = async input => [plan(input)];
  f.client = f.login('client').session; f.developer = f.login('developer').session;
  f.flush = async () => { for(let i=0;i<10 && f.store.db.prepare("SELECT 1 FROM jobs WHERE kind='tasks.analyze' AND attempts<8 AND available<=?").get(Date.now());i++) await f.service.workJobs(); };
  f.send = async text => { await f.service.action(f.client,{type:'message',threadId:'chat-one',text}); await f.flush(); };
  f.drafts = () => f.store.all('drafts','one');
  f.pending = () => f.drafts().filter(d=>d.status==='pending');
  f.decide = (draft,type='draft.confirm',extra={}) => f.service.action(f.client,{type,draftId:draft.id,revision:draft.revision,...extra});
  return f;
};

test('chat analysis splits independent wishes, grounds proposals and waits for client approval',async()=>{
  const f=setup();try{
    let input;
    f.integrations.planTasks=async data=>{input=data;return [plan(data),plan(data,{title:'Фильтр цены',body:'Фильтровать по цене.'})];};
    await f.send('Добавь поиск по названию и фильтр цены.');
    assert.equal(f.pending().length,2);assert.equal(f.issues.get(repo).length,2);
    assert.ok(input.messages.every(m=>!m.text.includes('переписка three')));
    for(const draft of f.pending()){assert.equal(draft.revision,1);assert.equal(draft.sourceText,'Добавь поиск по названию и фильтр цены.');}
    const draft=f.pending()[0];
    await Promise.all([f.decide(draft),f.decide(draft)]);
    assert.equal(f.issues.get(repo).length,3);assert.equal(f.store.get('drafts',draft.id).status,'approved');
    assert.ok(f.store.get('drafts',draft.id).taskNumber);
  }finally{f.close();}
});

test('clarifications revise a pending card and preserve earlier versions without duplicate Issues',async()=>{
  const f=setup();try{
    await f.send('Нужен поиск');const first=f.pending()[0];
    f.integrations.planTasks=async input=>[plan(input,{operation:'update',draftId:first.id,body:'Искать по названию и артикулу.',reason:'Клиент добавил артикул.'})];
    await f.send('И ещё по артикулу');
    assert.equal(f.drafts().length,1);const revised=f.pending()[0];
    assert.equal(revised.revision,2);assert.ok(revised.body.includes('артикулу'));
    assert.equal(f.store.all('draftRevisions').length,2);assert.equal(f.issues.get(repo).length,2);
    await assert.rejects(f.decide(first),{status:409});await f.decide(revised);
    assert.equal(f.issues.get(repo).at(-1).body,revised.body);
  }finally{f.close();}
});

test('client can reject and edit proposals independently of GitHub readiness',async()=>{
  const f=setup();try{
    f.store.put('projects',{...f.store.get('projects','one'),repo:''});
    await f.send('Нужен поиск');let draft=f.pending()[0];
    await assert.rejects(f.decide(draft),{status:409});
    await f.decide(draft,'draft.edit',{title:'Поиск по артикулу',body:'Искать по полному артикулу.'});
    draft=f.pending()[0];assert.equal(draft.revision,2);assert.equal(draft.confirmed,false);
    await f.decide(draft,'draft.reject');assert.equal(f.store.get('drafts',draft.id).status,'rejected');
    await assert.rejects(f.decide(f.store.get('drafts',draft.id)),{status:409});assert.equal(f.issues.get(repo).length,2);
  }finally{f.close();}
});

test('an explicit change of mind withdraws an unapproved proposal and retains its history',async()=>{
  const f=setup();try{
    await f.send('Добавь поиск');const draft=f.pending()[0];
    f.integrations.planTasks=async input=>[plan(input,{operation:'withdraw',draftId:draft.id,reason:'Клиент отказался от поиска.'})];
    await f.send('Поиск больше не нужен');
    const current=f.store.get('drafts',draft.id);assert.equal(current.status,'withdrawn');assert.equal(current.revision,2);
    assert.equal(f.issues.get(repo).length,2);await assert.rejects(f.decide(current),{status:409});
  }finally{f.close();}
});

test('approved changes require separate consent and a new financial scope',async()=>{
  const f=setup();try{
    await f.send('Добавь поиск');await f.decide(f.pending()[0]);
    const original=f.issues.get(repo).at(-1);
    await f.service.action(f.developer,{type:'quote.create',projectId:'one',number:original.number,baseKopecks:100000});
    const paid=f.store.all('quotes').at(-1);
    await f.service.action(f.client,{type:'quote.pay',quoteId:paid.id,outcome:'succeeded'});
    f.integrations.planTasks=async input=>[plan(input,{operation:'update',taskId:`one:${original.number}`,body:'Искать по названию и артикулу.'})];
    await f.send('Теперь поиск ещё и по артикулу');const change=f.pending()[0];
    assert.equal(change.kind,'update');assert.equal(change.baseBody,original.body);
    assert.equal(f.issues.get(repo).at(-1).body,original.body);
    await f.decide(change);assert.equal(f.issues.get(repo).at(-1).body,change.body);
    const snapshot=await f.service.snapshot(f.client,'one');
    const task=snapshot.tasks.find(t=>t.number===original.number);assert.equal(task.scopeRevision,1);assert.equal(task.paid,false);
    assert.equal(f.store.get('quotes',paid.id).status,'paid','historical payment remains intact');
    await assert.rejects(f.service.action(f.developer,{type:'task.status',projectId:'one',number:task.number,status:'in_progress'}),{status:409});
    await f.service.action(f.developer,{type:'quote.create',projectId:'one',number:task.number,baseKopecks:200000});
    const next=f.store.all('quotes').find(q=>q.status==='pending');assert.equal(next.scopeRevision,1);
    await f.service.action(f.client,{type:'quote.pay',quoteId:next.id,outcome:'succeeded'});
    await f.service.action(f.developer,{type:'task.status',projectId:'one',number:task.number,status:'in_progress'});
  }finally{f.close();}
});

test('cancelling an approved task is proposed, may be rejected, and only closes GitHub after approval',async()=>{
  const f=setup();try{
    await f.send('Добавь поиск');await f.decide(f.pending()[0]);const original=f.issues.get(repo).at(-1);
    f.integrations.planTasks=async input=>[plan(input,{operation:'cancel',taskId:`one:${original.number}`,reason:'Клиент отменяет поиск.'})];
    await f.send('Отменяем поиск');let proposal=f.pending()[0];
    assert.equal(proposal.kind,'cancel');assert.equal(f.issues.get(repo).at(-1).status,'new');
    await f.decide(proposal,'draft.reject');assert.equal(f.issues.get(repo).at(-1).status,'new');
    await f.send('Всё-таки отменяем, подтверждаю');proposal=f.pending()[0];await f.decide(proposal);
    assert.equal(f.issues.get(repo).at(-1).status,'canceled');
  }finally{f.close();}
});

test('subprojects route approved proposals to the selected repository with isolated issue numbers',async()=>{
  const f=setup();try{
    const backend='Matthew-zzz/backend';
    f.store.put('projects',{...f.store.get('projects','one'),subprojects:[{id:'main',name:'Frontend',repo,createdAt:new Date().toISOString()},{id:'backend',name:'Backend',repo:backend,createdAt:new Date().toISOString()}]});
    f.issues.set(backend,[]);f.integrations.planTasks=async input=>[plan(input,{subprojectId:'backend'})];
    await f.send('Нужен поиск на сервере');await f.decide(f.pending()[0]);
    assert.equal(f.issues.get(repo).length,2);assert.equal(f.issues.get(backend).length,1);
    assert.equal(f.store.get('tasks','one:backend:1').subprojectId,'backend');
  }finally{f.close();}
});

test('task analysis continues while a developer owns the conversation',async()=>{
  const f=setup();try{
    await f.service.action(f.developer,{type:'takeover',threadId:'chat-one'});
    const before=f.store.all('messages').filter(m=>m.role==='assistant').length;
    await f.send('Нужен поиск');assert.equal(f.pending().length,1);
    assert.equal(f.store.all('messages').filter(m=>m.role==='assistant').length,before);
  }finally{f.close();}
});

test('a stale AI result cannot overwrite a client edit or rejection',async()=>{
  const f=setup();try{
    await f.send('Нужен поиск');const original=f.pending()[0];let release;let started;
    const ready=new Promise(resolve=>{started=resolve;});
    f.integrations.planTasks=async input=>{started();await new Promise(resolve=>{release=resolve;});return [plan(input,{operation:'update',draftId:original.id,body:'Устаревшая версия.'})];};
    await f.service.action(f.client,{type:'message',threadId:'chat-one',text:'Уточни поиск'});
    const work=f.service.workJobs();await ready;
    await f.decide(original,'draft.reject');release();await work;
    assert.equal(f.store.get('drafts',original.id).status,'rejected');assert.equal(f.store.get('drafts',original.id).body,original.body);
  }finally{f.close();}
});

test('new client messages invalidate in-flight analysis and are processed by the next durable job',async()=>{
  const f=setup();try{
    let release;let started;const ready=new Promise(resolve=>{started=resolve;});
    f.integrations.planTasks=async input=>{started();await new Promise(resolve=>{release=resolve;});return [plan(input)];};
    await f.service.action(f.client,{type:'message',threadId:'chat-one',text:'Поиск по названию'});
    const work=f.service.workJobs();await ready;
    await f.service.action(f.client,{type:'message',threadId:'chat-one',text:'Только по артикулу'});
    release();await work;assert.equal(f.drafts().length,0);
    f.integrations.planTasks=async input=>[plan(input,{body:'Искать только по артикулу.'})];await f.flush();
    assert.equal(f.pending().length,1);assert.equal(f.pending()[0].body,'Искать только по артикулу.');
  }finally{f.close();}
});

test('ownership, roles and revision checks apply to all proposal decisions',async()=>{
  const f=setup();try{
    await f.send('Добавь поиск');const draft=f.pending()[0];
    for(const type of ['draft.confirm','draft.reject','draft.edit']){
      const action={type,draftId:draft.id,revision:draft.revision,title:'Forged',body:'Forged'};
      await assert.rejects(f.service.action(f.developer,action),{status:403});
      await assert.rejects(f.service.action(f.login('other').session,action),{status:404});
      await assert.rejects(f.service.action(f.client,{...action,revision:999}),{status:409});
    }
    const other=await f.service.snapshot(f.login('other').session);assert.equal(other.drafts.length,0);assert.ok(other.taskAnalysis.every(state=>state.projectId!=='one'));
    const admin=await f.service.snapshot(f.login('admin').session);assert.equal(admin.drafts.length,0);assert.equal(admin.taskAnalysis.length,0);
  }finally{f.close();}
});

test('untrusted cross-project targets and absent client evidence roll back the entire proposal batch',async()=>{
  for(const invalid of [{operation:'update',taskId:'three:2'}, {sourceMessageIds:['not-a-client-message']}]){
    const f=setup();try{
      await f.service.sync(f.store.get('projects','three'));
      f.integrations.planTasks=async input=>[plan(input),plan(input,{title:'Injected',...invalid})];
      await f.send('Нужен поиск');assert.equal(f.drafts().length,0);
      assert.equal(f.store.get('taskAnalysis','chat-one').status,'retrying');assert.equal(f.issues.get(repo).length,2);
    }finally{f.close();}
  }
});

test('AI failures stop after eight attempts and can be retried without losing proposals',async()=>{
  const f=setup();try{
    f.integrations.planTasks=async()=>{throw new Error('Unavailable');};
    await f.service.action(f.client,{type:'message',threadId:'chat-one',text:'Нужен поиск'});
    f.store.db.prepare("UPDATE jobs SET attempts=7,available=0 WHERE kind='tasks.analyze'").run();await f.flush();
    assert.equal(f.store.get('taskAnalysis','chat-one').status,'failed');
    f.integrations.planTasks=async input=>[plan(input)];
    await f.service.action(f.client,{type:'tasks.analyze',projectId:'one'});await f.flush();
    assert.equal(f.pending().length,1);assert.equal(f.store.get('taskAnalysis','chat-one').status,'ready');
  }finally{f.close();}
});

test('durable analysis resumes after SQLite and service restart',async()=>{
  const f=setup();const directory=await mkdtemp(join(tmpdir(),'node-task-analysis-'));let reopened;
  try{
    await f.service.action(f.client,{type:'message',threadId:'chat-one',text:'Нужен поиск'});
    const path=join(directory,'portal.sqlite');await backup(f.store.db,path);
    reopened=new PortalStore(path);const service=new PortalService(reopened,f.integrations,f.config);await service.workJobs();
    assert.equal(reopened.all('drafts','one').length,1);assert.equal(reopened.get('taskAnalysis','chat-one').status,'ready');
    assert.equal(f.issues.get(repo).length,2);
  }finally{reopened?.close();f.close();await rm(directory,{recursive:true,force:true});}
});

test('a lost GitHub response can be retried without creating another Issue',async()=>{
  const f=setup();try{
    await f.send('Добавь поиск');const draft=f.pending()[0];const create=f.integrations.createIssue;let once=true;
    f.integrations.createIssue=async(...args)=>{const result=await create(...args);if(once){once=false;throw new Error('Lost response');}return result;};
    await assert.rejects(f.decide(draft));assert.equal(f.issues.get(repo).length,3);
    await f.decide(draft);assert.equal(f.issues.get(repo).length,3);assert.equal(f.store.get('drafts',draft.id).status,'approved');
  }finally{f.close();}
});

test('manual GitHub edits prevent approval of an outdated change proposal',async()=>{
  const f=setup();try{
    await f.send('Добавь поиск');await f.decide(f.pending()[0]);const task=f.issues.get(repo).at(-1);
    f.integrations.planTasks=async input=>[plan(input,{operation:'update',taskId:`one:${task.number}`,body:'Новые требования.'})];
    await f.send('Измени поиск');const draft=f.pending()[0];
    await f.integrations.updateIssue(repo,task.number,{body:'Правка разработчика.'});
    await assert.rejects(f.decide(draft),{status:409});assert.equal(f.issues.get(repo).at(-1).body,'Правка разработчика.');
  }finally{f.close();}
});

test('planning adapter uses a strict schema, bounded operations and rejects malformed results',async()=>{
  const input={project:{name:'One',brief:'Brief',subprojects:[]},messages:[{id:'m',role:'client',text:'Добавь поиск'}],proposals:[],tasks:[]};let payload;
  const adapter=createIntegrations(readConfig({PORTAL_OPENAI_KEY:'fixture-key',PORTAL_OPENAI_MODEL:'fixture-model'}),async(url,init)=>{
    assert.equal(url,'https://api.openai.com/v1/responses');payload=JSON.parse(init.body);
    return Response.json({status:'completed',output:[{content:[{type:'output_text',text:JSON.stringify({changes:[plan(input)]})}]}]});
  });
  assert.equal((await adapter.planTasks(input,'configured-model')).length,1);assert.equal(payload.model,'configured-model');assert.equal(payload.store,false);assert.equal(payload.tools,undefined);assert.equal(payload.text.format.strict,true);
  assert.deepEqual(JSON.parse(payload.input[0].content),input);
  const malformed=createIntegrations(readConfig({PORTAL_OPENAI_KEY:'fixture-key'}),async()=>Response.json({output:[{content:[{type:'output_text',text:'{"changes":[{"operation":"delete-project"}]}'}]}]}));
  await assert.rejects(malformed.planTasks(input,'configured-model'),{status:502});
});

test('a developer-linked Telegram conversation produces proposals visible to its project client',async()=>{
  const f=setup();try{
    const thread={id:'telegram:fixture',kind:'telegram',projectId:'',name:'Client',username:'fixture',email:'client@example.test',telegramId:'123',ownerId:f.developer.viewer.id,ownerName:'Developer',handoffRequested:false,updatedAt:new Date().toISOString()};
    f.store.put('conversations',thread);
    f.store.put('briefLinks',{id:thread.id,threadId:thread.id,projectId:'one',createdBy:f.developer.viewer.id,updatedAt:new Date().toISOString()});
    f.store.put('messages',{id:'telegram-wish',threadId:thread.id,author:'Client',role:'client',text:'Нужен поиск в каталоге',createdAt:new Date().toISOString()});
    f.service.taskPlanning.queue(thread);await f.flush();
    const draft=f.pending()[0];assert.equal(draft.threadId,thread.id);assert.equal(draft.projectId,'one');
    const snapshot=await f.service.snapshot(f.client,'one');assert.ok(snapshot.drafts.some(d=>d.id===draft.id));
    assert.ok(!snapshot.conversations.some(t=>t.id===thread.id),'the intake conversation remains developer-only');
    await f.flush();
    await f.decide(draft);assert.equal(f.issues.get(repo).length,3);
  }finally{f.close();}
});

test('new messages coalesce queued analysis and a slow model does not block other outbox jobs',async()=>{
  const f=setup();let release;try{
    for(let i=0;i<5;i++)await f.service.action(f.client,{type:'message',threadId:'chat-one',text:`Пожелание ${i}`});
    assert.equal(f.store.db.prepare("SELECT count(*) AS n FROM jobs WHERE kind='tasks.analyze'").get().n,1);
    let started;const ready=new Promise(resolve=>{started=resolve;});
    f.integrations.planTasks=async input=>{started();await new Promise(resolve=>{release=resolve;});return [plan(input)];};
    f.store.enqueue('telegram.send',{chatId:'fixture',text:'Parallel fixture message'});
    const work=f.service.workJobs();await ready;await new Promise(resolve=>setImmediate(resolve));
    assert.ok(f.sent.some(item=>item.text==='Parallel fixture message'));
    release();await work;assert.equal(f.pending().length,1);
  }finally{release?.();f.close();}
});

test('archive during analysis discards the model response',async()=>{
  const f=setup();let release;try{
    let started;const ready=new Promise(resolve=>{started=resolve;});
    f.integrations.planTasks=async input=>{started();await new Promise(resolve=>{release=resolve;});return [plan(input)];};
    await f.service.action(f.client,{type:'message',threadId:'chat-one',text:'Нужен поиск'});
    const work=f.service.workJobs();await ready;
    await f.service.action(f.developer,{type:'project.delete',projectId:'one',confirmation:'one'});
    release();await work;assert.equal(f.drafts().length,0);
  }finally{release?.();f.close();}
});

test('an approved cancellation invalidates pending payment requests but preserves paid history',async()=>{
  const f=setup();try{
    await f.send('Добавь поиск');await f.decide(f.pending()[0]);const task=f.issues.get(repo).at(-1);
    await f.service.action(f.developer,{type:'quote.create',projectId:'one',number:task.number,baseKopecks:100000});const quote=f.store.all('quotes').at(-1);
    f.integrations.planTasks=async input=>[plan(input,{operation:'cancel',taskId:`one:${task.number}`})];
    await f.send('Поиск не нужен');await f.decide(f.pending()[0]);
    assert.equal(f.store.get('quotes',quote.id).status,'superseded');
    await assert.rejects(f.service.action(f.client,{type:'quote.pay',quoteId:quote.id,outcome:'succeeded'}),{status:409});
  }finally{f.close();}
});

test('changing an intended update to cancellation and back keeps a single pending proposal',async()=>{
  const f=setup();try{
    await f.send('Добавь поиск');await f.decide(f.pending()[0]);const task=f.issues.get(repo).at(-1);
    f.integrations.planTasks=async input=>[plan(input,{operation:'update',taskId:`one:${task.number}`,body:'Искать по артикулу.'})];
    await f.send('Добавь артикул');const proposal=f.pending()[0];
    f.integrations.planTasks=async input=>[plan(input,{operation:'cancel',taskId:`one:${task.number}`})];await f.send('Вообще отменяем');
    assert.equal(f.pending().length,1);assert.equal(f.pending()[0].id,proposal.id);assert.equal(f.pending()[0].kind,'cancel');
    f.integrations.planTasks=async input=>[plan(input,{operation:'update',taskId:`one:${task.number}`,body:'Искать по артикулу, без отмены.'})];await f.send('Не отменяем, только меняем поиск');
    assert.equal(f.pending().length,1);assert.equal(f.pending()[0].id,proposal.id);assert.equal(f.pending()[0].kind,'update');
  }finally{f.close();}
});

test('proposal decisions require a valid session, origin and CSRF at the HTTP boundary',async()=>{
  const f=setup();try{
    await f.send('Добавь поиск');const draft=f.pending()[0];const api=portalApi(f,true);const client=await api.login('client');
    for(const type of ['draft.confirm','draft.reject','draft.edit','task.edit.propose']){
      const body={type,draftId:draft.id,revision:draft.revision,title:'Поиск',body:'Описание',projectId:'one',number:2,baseTitle:'Пожелание',baseBody:'Согласованный текст'};
      assert.equal((await api.request('action',body)).statusCode,401);
      assert.equal((await api.request('action',body,client,{'x-csrf-token':''})).statusCode,403);
      assert.equal((await api.request('action',body,client,{origin:'https://other.example.test'})).statusCode,403);
    }
    assert.equal(f.store.get('drafts',draft.id).status,'pending');
  }finally{f.close();}
});

test('rejected proposals stay rejected during rescan, while a new explicit request can create a new proposal',async()=>{
  const f=setup();try{
    await f.send('Добавь поиск');const first=f.pending()[0];await f.decide(first,'draft.reject');
    await f.service.action(f.client,{type:'tasks.analyze',projectId:'one'});await f.flush();
    assert.equal(f.pending().length,0);assert.equal(f.drafts().length,1);
    await f.send('Всё-таки добавь поиск, я передумал');
    assert.equal(f.pending().length,1);assert.notEqual(f.pending()[0].id,first.id);
    assert.equal(f.store.get('drafts',first.id).status,'rejected');
  }finally{f.close();}
});

test('manual wording is not overwritten by reanalysis of earlier messages',async()=>{
  const f=setup();try{
    await f.send('Нужен поиск');const first=f.pending()[0];
    await f.decide(first,'draft.edit',{title:first.title,body:'Точная ручная формулировка клиента.'});
    f.integrations.planTasks=async input=>[plan(input,{operation:'update',draftId:first.id,body:'Старая автоматическая формулировка.'})];
    await f.service.action(f.client,{type:'tasks.analyze',projectId:'one'});await f.flush();
    assert.equal(f.pending()[0].body,'Точная ручная формулировка клиента.');assert.equal(f.pending()[0].revision,2);
  }finally{f.close();}
});

test('queue status and its durable job commit atomically',async()=>{
  const f=setup();try{
    const enqueue=f.store.enqueue.bind(f.store);
    f.store.enqueue=()=>{throw new Error('Simulated queue write failure');};
    assert.throws(()=>f.service.taskPlanning.queue(f.store.get('conversations','chat-one')));
    assert.equal(f.store.get('taskAnalysis','chat-one'),undefined);
    assert.equal(f.store.db.prepare("SELECT count(*) AS n FROM jobs WHERE kind='tasks.analyze'").get().n,0);
    f.store.enqueue=enqueue;f.service.taskPlanning.queue(f.store.get('conversations','chat-one'));await f.flush();
    assert.equal(f.pending().length,1);
  }finally{f.close();}
});

test('opening a project repairs a queued analysis state whose job was lost',async()=>{
  const f=setup();try{
    const thread=f.store.get('conversations','chat-one');f.service.taskPlanning.queue(thread);
    f.store.db.prepare("DELETE FROM jobs WHERE kind='tasks.analyze'").run();
    f.service.taskPlanning.ensure('one');
    assert.equal(f.store.db.prepare("SELECT count(*) AS n FROM jobs WHERE kind='tasks.analyze'").get().n,1);
    await f.flush();assert.equal(f.pending().length,1);assert.equal(f.store.get('taskAnalysis','chat-one').status,'ready');
  }finally{f.close();}
});

test('a client can reinstate a cancelled task through a new approval without duplicating the Issue',async()=>{
  const f=setup();try{
    await f.send('Добавь поиск');await f.decide(f.pending()[0]);const task=f.issues.get(repo).at(-1);
    f.integrations.planTasks=async input=>[plan(input,{operation:'cancel',taskId:`one:${task.number}`})];
    await f.send('Отменяем поиск');await f.decide(f.pending()[0]);assert.equal(f.issues.get(repo).at(-1).status,'canceled');
    f.integrations.planTasks=async input=>[plan(input,{operation:'update',taskId:`one:${task.number}`,title:task.title,body:task.body,reason:'Клиент хочет возобновить отменённую задачу.'})];
    await f.send('Передумал, верни поиск');const proposal=f.pending()[0];assert.ok(proposal);assert.equal(proposal.kind,'update');
    assert.equal(f.issues.get(repo).at(-1).status,'canceled');await f.decide(proposal);
    assert.equal(f.issues.get(repo).length,3);assert.equal(f.issues.get(repo).at(-1).status,'new');
  }finally{f.close();}
});

test('a pending cancellation can become an update through its own proposal ID',async()=>{
  const f=setup();try{
    await f.send('Добавь поиск');await f.decide(f.pending()[0]);const task=f.issues.get(repo).at(-1);
    f.integrations.planTasks=async input=>[plan(input,{operation:'cancel',taskId:`one:${task.number}`})];
    await f.send('Отменяем поиск');const cancellation=f.pending()[0];
    f.integrations.planTasks=async input=>[plan(input,{operation:'update',draftId:cancellation.id,body:'Поиск по артикулу.'})];
    await f.send('Не отменяем, меняем на поиск по артикулу');const change=f.pending()[0];
    assert.equal(change.id,cancellation.id);assert.equal(change.kind,'update');assert.equal(change.body,'Поиск по артикулу.');
    await f.decide(change);assert.equal(f.issues.get(repo).at(-1).body,'Поиск по артикулу.');
  }finally{f.close();}
});

test('an edited proposal after a lost creation response updates the recovered Issue to the approved wording',async()=>{
  const f=setup();try{
    await f.send('Добавь поиск');const first=f.pending()[0];const create=f.integrations.createIssue;let once=true;
    f.integrations.createIssue=async(...args)=>{const result=await create(...args);if(once){once=false;throw new Error('Lost creation response');}return result;};
    await assert.rejects(f.decide(first));
    await f.decide(first,'draft.edit',{title:'Поиск по артикулу',body:'Поиск только по точному артикулу.'});
    const edited=f.pending()[0];await f.decide(edited);
    assert.equal(f.issues.get(repo).length,3);assert.equal(f.issues.get(repo).at(-1).title,edited.title);assert.equal(f.issues.get(repo).at(-1).body,edited.body);
    assert.equal(f.store.get('drafts',edited.id).status,'approved');
  }finally{f.close();}
});

test('task-section counters include legacy, revised and client-edited pending proposals without mixing projects', async () => {
  const { pendingTaskCount, proposalInEditing } = await import('../src/features/portal/model/task-planning.ts');
  const drafts=[
    {projectId:'one',confirmed:false},
    {projectId:'one',confirmed:false,kind:'update',status:'pending',subprojectId:'backend'},
    {projectId:'one',confirmed:false,editedAt:new Date().toISOString(),status:'pending'},
    {projectId:'one',confirmed:true,status:'approved'},
    {projectId:'one',confirmed:false,status:'rejected'},
    {projectId:'one',confirmed:false,status:'withdrawn'},
    {projectId:'two',confirmed:false,status:'pending'},
  ];
  assert.equal(pendingTaskCount(drafts,'one'),3);
  assert.equal(pendingTaskCount(drafts,'one','main'),2);
  assert.equal(pendingTaskCount(drafts,'one','backend'),1);
  assert.equal(proposalInEditing(drafts[0]),false);
  assert.equal(proposalInEditing(drafts[1]),true);
  assert.equal(proposalInEditing(drafts[2]),true);
});

test('editing an approved task in its dialog proposes a revision without changing GitHub until approved', async()=>{
  const f=setup();try{
    await f.send('Добавь поиск');await f.decide(f.pending()[0]);
    const task=f.store.all('tasks','one').find(item=>item.title==='Поиск товаров');
    const action={type:'task.edit.propose',projectId:'one',number:task.number,title:'Поиск по артикулу',body:'Искать по полному артикулу.',baseTitle:task.title,baseBody:task.body};
    const issueCount=f.issues.get(repo).length;
    await assert.rejects(f.service.action(f.developer,action),{status:403});
    await assert.rejects(f.service.action(f.login('other').session,action),{status:404});
    await assert.rejects(f.service.action(f.client,{...action,baseBody:'Устаревшее описание'}),{status:409});
    await f.service.action(f.client,action);
    const proposal=f.pending()[0];assert.equal(proposal.kind,'update');assert.ok(proposal.editedAt);assert.equal(proposal.baseBody,task.body);
    assert.equal(f.issues.get(repo).length,issueCount);assert.equal(f.issues.get(repo).at(-1).body,task.body);
    await assert.rejects(f.service.action(f.client,action),{status:409});assert.equal(f.pending().length,1);
    await f.decide(proposal);assert.equal(f.issues.get(repo).length,issueCount);assert.equal(f.issues.get(repo).at(-1).body,action.body);
    assert.equal(f.store.get('tasks',task.id).scopeRevision,undefined);assert.equal(f.store.get('taskScopes',task.id).revision,1);
    await f.service.snapshot(f.client,'one');
    await assert.rejects(f.service.action(f.client,{...action,number:1,baseTitle:'Основная работа',baseBody:'Согласованный текст'}),{status:409});
  }finally{f.close();}
});
