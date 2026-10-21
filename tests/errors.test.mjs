import assert from 'node:assert/strict';
import test from 'node:test';
import { Readable } from 'node:stream';
import { randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { portalFixture, fixturePassword } from './helpers/portal-fixture.mjs';
import { PortalStore, PortalError } from '../server/store.ts';
import { ErrorJournal } from '../server/error-journal.ts';
import { responseError, transportError } from '../server/upstream-error.ts';
import { createIntegrations } from '../server/integrations.ts';
import { readConfig } from '../server/config.ts';
import { withErrorContext } from '../server/error-context.ts';
import { createRequestReporter } from '../src/features/portal/lib/request-reporter.ts';

const query = { state: 'all', provider: 'all', search: '', page: 1 };
function api(f) {
  return async (path, body, account, headers = {}) => {
    const request = Readable.from(body === undefined ? [] : [Buffer.from(JSON.stringify(body))]);
    Object.assign(request, {url: `/api/portal/${path}`, method: body === undefined ? 'GET' : 'POST', socket: {remoteAddress: '127.0.0.1'}, headers: {origin:f.config.origin, 'content-type':'application/json', ...(account ? {cookie:account.cookie,'x-csrf-token':account.body.csrf} : {}), ...headers}});
    const response = {statusCode:200,headers:{},setHeader(k,v){this.headers[k]=v;},end(v){this.body=JSON.parse(v);}};
    await f.handler(request,response);response.cookie=response.headers['Set-Cookie']?.split(';')[0];return response;
  };
}
const suspended = () => responseError('https://api.github.com/repos/owner/repo/issues?token=NEVER_EXPOSE', new Response(JSON.stringify({message:'Sorry. Your account was suspended', secret:'NEVER_EXPOSE'}),{status:403,headers:{'x-github-request-id':'GITHUB-123'}}));

test('upstream diagnostics distinguish suspension, permissions, quota, rate limits and transport without retaining bodies or secrets',async()=>{
  const cases = [
    ['https://api.github.com/repos/a/b',403,{message:'Sorry. Your account was suspended'},'GITHUB_ACCOUNT_SUSPENDED'],
    ['https://api.github.com/repos/a/b',403,{message:'Resource not accessible by personal access token'},'UPSTREAM_PERMISSIONS'],
    ['https://api.github.com/repos/a/b',403,{message:'API rate limit exceeded'},'UPSTREAM_RATE_LIMIT'],
    ['https://api.openai.com/v1/responses',429,{error:{code:'insufficient_quota'}},'OPENAI_QUOTA'],
    ['https://api.telegram.org/botVERY_SECRET/sendMessage',403,{description:'Forbidden: bot was blocked by the user'},'TELEGRAM_CHAT_UNAVAILABLE'],
    ['https://api.resend.com/emails',403,{message:'The domain is not verified'},'MAIL_DOMAIN'],
  ];
  for(const [url,status,body,code] of cases){const error=await responseError(url,new Response(JSON.stringify({...body,password:'VERY_SECRET'}),{status}));assert.equal(error.diagnosis.code,code);assert.ok(!JSON.stringify(error).includes('VERY_SECRET'));}
  assert.equal(transportError('https://api.openai.com/v1/responses',new DOMException('VERY_SECRET','TimeoutError')).diagnosis.code,'UPSTREAM_TIMEOUT');
  const f=portalFixture();try {const id=f.service.errors.capture(await suspended());const entry=f.service.errors.query(query).events.find(e=>e.id===id);assert.equal(entry.upstreamStatus,403);assert.equal(entry.upstreamRequestId,'GITHUB-123');assert.ok(!JSON.stringify(entry).includes('NEVER_EXPOSE'));}finally{f.close();}
});

test('all failed HTTP requests are attributed by server session, protected from other roles and correlated with response IDs',async()=>{
  const f=portalFixture();const request=api(f);
  try{
    const client=await request('login',{email:f.users.client.email,password:fixturePassword});
    const admin=await request('login',{email:f.users.admin.email,password:fixturePassword});
    const rejected=await request('admin/errors',undefined,client);
    assert.equal(rejected.statusCode,403);assert.ok(rejected.body.errorId);assert.equal(rejected.headers['X-Request-Id'],rejected.body.requestId);
    const origin=await request('action',{type:'task.status',password:'DO_NOT_LOG',token:'DO_NOT_LOG',role:'admin'},client,{origin:'https://wrong.test'});
    assert.equal(origin.statusCode,403);
    assert.equal((await request('admin/errors',{id:rejected.body.errorId,resolved:true},client)).statusCode,403);
    assert.equal((await request('admin/errors',{id:rejected.body.errorId,resolved:true},admin,{'x-csrf-token':''})).statusCode,403);
    const events=(await request('admin/errors?state=all',undefined,admin)).body.events;
    const entry=events.find(e=>e.id===rejected.body.errorId);assert.equal(entry.actor.id,f.users.client.id);assert.equal(entry.actor.role,'client');
    assert.ok(events.some(e=>e.path==='/api/portal/action'&&e.actor.id===f.users.client.id));
    assert.ok(!JSON.stringify(events).includes('DO_NOT_LOG'));assert.ok(!JSON.stringify(client.body).includes('error_events'));
    assert.equal((await request('admin/errors',{id:entry.id,resolved:true},admin)).statusCode,200);
    assert.ok(f.service.errors.query({...query,state:'resolved'}).events.some(e=>e.id===entry.id));
    assert.equal((await request('admin/errors?state=all')).statusCode,401);
  }finally{f.close();}
});

test('silent GitHub sync failures are reported for each affected user and project, preserve cached data and back off requests',async()=>{
  const f=portalFixture();const request=api(f);
  try{
    const client=await request('login',{email:f.users.client.email,password:fixturePassword});
    const dev=await request('login',{email:f.users.developer.email,password:fixturePassword});
    const error=await suspended();let calls=0;
    f.integrations.issues=async()=>{calls++;throw error;};
    const project=f.store.get('projects','one');await assert.rejects(f.service.sync(project,1,true));
    const a=await request('snapshot?project=one',undefined,client);const b=await request('snapshot?project=one',undefined,dev);
    assert.equal(a.statusCode,200);assert.ok(a.body.syncError.includes('Администратор уведомлён'));assert.ok(a.body.tasks.length>0);
    const events=f.service.errors.query(query).events.filter(e=>e.projectId==='one');
    assert.deepEqual(new Set(events.map(e=>e.actor.id)),new Set([f.users.client.id,f.users.developer.id]));
    assert.ok(events.every(e=>e.code==='GITHUB_ACCOUNT_SUSPENDED'&&e.upstreamStatus===403&&e.requestStatus===200));
    const before=calls;await request('snapshot?project=one',undefined,client);assert.equal(calls,before);
    assert.equal(f.service.errors.query(query).events.find(e=>e.projectId==='one'&&e.actor.id===f.users.client.id).count,2);
    assert.ok(!JSON.stringify(b.body).includes('GITHUB_ACCOUNT_SUSPENDED'));
  }finally{f.close();}
});

test('journal aggregates repeats, supports Cyrillic search, preserves resolved history and survives database reopening',async()=>{
  const directory=await mkdtemp(join(tmpdir(),'node-errors-'));const path=join(directory,'portal.sqlite');let store=new PortalStore(path);
  try{
    let journal=new ErrorJournal(store,'revision-one');const actor=store.createUser('client@example.test','Матвей','client','Long-password-2026',false);
    const error=await suspended();const context={actor,projectId:'one',projectName:'Сайт студии',path:'/api/portal/snapshot?token=SECRET',requestId:randomUUID()};
    const id=journal.capture(error,context);assert.equal(journal.capture(error,context),id);assert.equal(journal.query(query).events[0].count,2);
    assert.equal(journal.query({...query,search:'МАТВЕЙ'}).total,1);assert.equal(journal.query({...query,search:'403'}).total,1);
    journal.resolve(id,true,'Администратор');const next=journal.capture(error,context);assert.notEqual(next,id);assert.equal(journal.query({state:'open'}).total,1);assert.equal(journal.query({state:'resolved'}).total,1);
    assert.throws(()=>journal.resolve(id,false,'Администратор'),{status:409});
    store.close();store=new PortalStore(path);journal=new ErrorJournal(store,'revision-two');assert.equal(journal.query(query).total,2);assert.ok(!JSON.stringify(journal.query(query)).includes('SECRET'));
    assert.throws(()=>journal.query({...query,provider:'injected'}),{status:400});
    for(let i=0;i<36;i++)journal.capture(new PortalError(400,'Некорректный запрос'),{actor,operation:`op${i}`});
    assert.equal(journal.query(query).events.length,30);assert.equal(journal.query({...query,page:2}).events.length,8);
  }finally{store.close();await rm(directory,{recursive:true,force:true});}
});

test('background and recovered AI failures retain actor and project context without logging chat contents',async()=>{
  const f=portalFixture();
  try{
    const error=await suspended();f.integrations.issues=async()=>{throw error;};
    withErrorContext({actor:f.users.developer,requestId:randomUUID()},()=>f.store.enqueue('github.sync',{projectId:'one'}));
    await f.service.workJobs();const event=f.service.errors.query(query).events[0];assert.equal(event.source,'background');assert.equal(event.actor.id,f.users.developer.id);assert.equal(event.projectId,'one');
    f.integrations.assistant=async()=>{throw new Error('PRIVATE_CHAT_SECRET');};
    f.service.receiveTelegram({update_id:99,message:{text:'PRIVATE_CHAT_CONTENT',chat:{id:111,type:'private'},from:{first_name:'Алексей'}}});await f.service.workJobs();
    const telegram=f.service.errors.query(query).events.find(e=>e.operation==='telegram.assistant');assert.equal(telegram.actor.role,'telegram');assert.equal(telegram.actor.id,'telegram:111');assert.ok(!JSON.stringify(f.service.errors.query(query)).includes('PRIVATE_CHAT'));
  }finally{f.close();}
});

test('browser reports are bounded, deduplicated, session-attributed, query-free and reject attribution to another profile',async()=>{
  const f=portalFixture();const request=api(f);
  try{
    const client=await request('login',{email:f.users.client.email,password:fixturePassword});
    assert.equal((await request('session',undefined,client)).body.viewer.id,f.users.client.id);
    assert.equal((await request('session')).body.viewer,null);
    const report={id:randomUUID(),kind:'network',path:'snapshot',method:'GET',status:0,viewerId:f.users.client.id,occurredAt:new Date().toISOString(),password:'NEVER_EXPOSE'};
    assert.equal((await request('errors/report',{reports:[report]},client)).statusCode,202);await request('errors/report',{reports:[report]},client);
    const entry=f.service.errors.query(query).events.find(e=>e.code==='BROWSER_NETWORK');assert.equal(entry.count,1);assert.equal(entry.actor.id,f.users.client.id);assert.ok(!JSON.stringify(entry).includes('NEVER_EXPOSE'));
    await request('errors/report',{reports:[{...report,id:randomUUID(),viewerId:f.users.developer.id}]},client);assert.equal(f.service.errors.query({provider:'browser'}).total,1);
    assert.equal((await request('errors/report',{reports:[{...report,id:randomUUID(),path:'snapshot?token=SECRET'}]},client)).statusCode,400);
    assert.equal((await request('errors/report',{reports:[report]},client,{'x-csrf-token':''})).statusCode,403);
    assert.equal((await request('errors/report',{reports:Array(11).fill(report)},client)).statusCode,400);
  }finally{f.close();}
});

test('browser queue captures the profile at request start and initializes reporting without a project snapshot',async()=>{
  const originalFetch=globalThis.fetch;const windowDescriptor=Object.getOwnPropertyDescriptor(globalThis,'window');const storageDescriptor=Object.getOwnPropertyDescriptor(globalThis,'localStorage');const navigatorDescriptor=Object.getOwnPropertyDescriptor(globalThis,'navigator');
  const values=new Map();let sent;let ready=false;
  Object.defineProperty(globalThis,'window',{value:{},configurable:true});Object.defineProperty(globalThis,'navigator',{value:{onLine:true},configurable:true});Object.defineProperty(globalThis,'localStorage',{value:{getItem:k=>values.get(k)??null,setItem:(k,v)=>values.set(k,v),removeItem:k=>values.delete(k)},configurable:true});
  globalThis.fetch=async(_url,init)=>{sent=JSON.parse(init.body);return new Response('{}',{status:202});};
  const reporter=createRequestReporter(()=>({viewerId:'new-profile',csrf:'current-csrf',ready}),async()=>{ready=true;});
  try{
    reporter.record('snapshot?project=one&token=NEVER_EXPOSE','GET','network',0,'original-profile');await reporter.flush();
    assert.equal(sent.reports[0].viewerId,'original-profile');assert.equal(sent.reports[0].path,'snapshot');assert.ok(!JSON.stringify(sent).includes('NEVER_EXPOSE'));assert.equal(values.size,0);
  }finally{reporter.dispose();globalThis.fetch=originalFetch;if(windowDescriptor)Object.defineProperty(globalThis,'window',windowDescriptor);else delete globalThis.window;if(storageDescriptor)Object.defineProperty(globalThis,'localStorage',storageDescriptor);else delete globalThis.localStorage;if(navigatorDescriptor)Object.defineProperty(globalThis,'navigator',navigatorDescriptor);else delete globalThis.navigator;}
});

test('all integration HTTP and network failures carry safe diagnostics including commits and repository checks',async()=>{
  const config=readConfig({PORTAL_GITHUB_TOKEN:'NEVER_EXPOSE',PORTAL_OPENAI_KEY:'NEVER_EXPOSE',PORTAL_OPENAI_MODEL:'test-model'});
  const adapter=createIntegrations(config,async()=>new Response(JSON.stringify({message:'Sorry. Your account was suspended',details:'NEVER_EXPOSE'}),{status:403}));
  for(const call of [()=>adapter.issues('Matthew-zzz/project'),()=>adapter.commits('Matthew-zzz/project',1),()=>adapter.createRepository('project')])await assert.rejects(call,error=>error.diagnosis.code==='GITHUB_ACCOUNT_SUSPENDED'&&!JSON.stringify(error).includes('NEVER_EXPOSE'));
  const unavailable=createIntegrations(config,async()=>{throw new TypeError('request with NEVER_EXPOSE failed');});await assert.rejects(()=>unavailable.issues('Matthew-zzz/project'),error=>error.diagnosis.code==='UPSTREAM_NETWORK'&&!JSON.stringify(error).includes('NEVER_EXPOSE'));
});
