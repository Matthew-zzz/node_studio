import assert from 'node:assert/strict';
import test from 'node:test';
import {randomUUID} from 'node:crypto';
import {mkdtemp,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {portalFixture,fixturePassword} from './helpers/portal-fixture.mjs';
import {PortalStore,PortalError} from '../server/store.ts';
import {PortalService} from '../server/service.ts';
import {createIntegrations} from '../server/integrations.ts';
import {readConfig} from '../server/config.ts';

const definition=f=>({type:'project.create',requestId:randomUUID(),name:'AnimeLove',clientEmail:f.users.client.email,description:'Общий проект приложения',repositories:[{name:'Frontend',repo:'Matthew-zzz/AnimeLove-frontend'},{name:'Backend',repo:'Matthew-zzz/AnimeLove-backend'}]});
const issue=(number,title,extra={})=>({id:String(number),projectId:'',number,title,body:'Описание',kind:'wish',included:false,status:'new',updatedAt:new Date().toISOString(),...extra});
async function create(f,input=definition(f)){
  await f.service.action(f.login('developer').session,input);const project=f.store.get('projects',`project:${input.requestId}`);
  return {project,input,front:project.subprojects[0],back:project.subprojects[1]};
}

test('developer imports existing repositories into one real client project; authorization, retries, duplicate bindings and remote validation are enforced',async()=>{
  const f=portalFixture();try{
    const input=definition(f);
    for(const role of ['client','curator','admin','temporary'])await assert.rejects(f.service.action(f.login(role).session,input),{status:403});
    await assert.rejects(f.service.action(f.login('developer').session,{...input,clientEmail:f.users.admin.email}),{status:404});
    await assert.rejects(f.service.action(f.login('developer').session,{...input,repositories:[{name:'Outside',repo:'another-owner/private'}]}),{status:400});
    await Promise.all([f.service.action(f.login('developer').session,input),f.service.action(f.login('developer').session,input)]);
    const p=f.store.get('projects',`project:${input.requestId}`);assert.equal(p.subprojects.length,2);assert.equal(p.developerId,f.users.developer.id);assert.equal(p.clientId,f.users.client.id);assert.equal(p.origin,'import');assert.equal(f.store.all('conversations').filter(t=>t.projectId===p.id).length,1);
    assert.equal(f.repositories.length,0,'grouping existing repositories never creates or copies a GitHub repository');
    await assert.rejects(f.service.action(f.login('developer').session,{...input,requestId:randomUUID()}),{status:409});
    f.integrations.repository=async repo=>({fullName:repo,issuesEnabled:false,writable:true});
    await assert.rejects(f.service.action(f.login('developer').session,{...input,requestId:randomUUID(),repositories:[{name:'Disabled',repo:'Matthew-zzz/disabled'}]}),{status:409});
  }finally{f.close();}
});

test('same issue numbers and commit SHAs stay distinct across repositories; clients receive one combined project without repository structure',async()=>{
  const f=portalFixture();try{
    const {project,front,back}=await create(f);
    f.issues.set(front.repo,[issue(1,'Интерфейс',{included:true})]);f.issues.set(back.repo,[issue(1,'API',{included:true})]);
    for(const part of [front,back])f.commits.set(part.repo,[{sha:'same-sha',title:part.name+' коммит',author:'Разработчик',createdAt:new Date().toISOString(),projectId:''}]);
    const client=await f.service.snapshot(f.login('client').session,project.id);const developer=await f.service.snapshot(f.login('developer').session,project.id);
    assert.equal(client.projects.filter(p=>p.id===project.id).length,1);assert.equal(client.projects.find(p=>p.id===project.id).repo,'');assert.equal(client.projects.find(p=>p.id===project.id).subprojects,undefined);
    assert.equal(client.tasks.filter(t=>t.projectId===project.id).length,2);assert.equal(new Set(client.tasks.filter(t=>t.projectId===project.id).map(t=>t.id)).size,2);assert.equal(client.commits.length,2);assert.equal(new Set(client.commits.map(c=>c.id)).size,2);
    assert.equal(developer.projects.find(p=>p.id===project.id).subprojects.length,2);assert.ok(!JSON.stringify(client).includes('Matthew-zzz/AnimeLove'));
    assert.equal((await f.service.snapshot(f.login('other').session,project.id)).projects.some(p=>p.id===project.id),false);
    await f.service.action(f.login('developer').session,{type:'task.status',projectId:project.id,subprojectId:back.id,number:1,status:'done'});
    assert.equal(f.issues.get(front.repo)[0].status,'new');assert.equal(f.issues.get(back.repo)[0].status,'done');
    await assert.rejects(f.service.action(f.login('developer').session,{type:'task.status',projectId:project.id,subprojectId:'foreign',number:1,status:'done'}),{status:404});
  }finally{f.close();}
});

test('quotes and payment gates cannot collide when both subprojects contain issue number 1',async()=>{
  const f=portalFixture();try{
    const {project,front,back}=await create(f);for(const part of [front,back])f.issues.set(part.repo,[issue(1,part.name)]);
    const dev=f.login('developer').session;const client=f.login('client').session;
    for(const part of [front,back])await f.service.action(dev,{type:'quote.create',projectId:project.id,subprojectId:part.id,number:1,baseKopecks:10000});
    const quotes=f.store.all('quotes',project.id);assert.equal(quotes.length,2);assert.ok(quotes.every(q=>q.status==='pending'));
    const paid=quotes.find(q=>q.subprojectId===front.id);await f.service.action(client,{type:'quote.pay',quoteId:paid.id,outcome:'succeeded'});
    await f.service.action(dev,{type:'task.status',projectId:project.id,subprojectId:front.id,number:1,status:'done'});
    await assert.rejects(f.service.action(dev,{type:'task.status',projectId:project.id,subprojectId:back.id,number:1,status:'done'}),{status:409});
    await f.service.action(dev,{type:'task.include',projectId:project.id,subprojectId:back.id,number:1});assert.equal(f.store.get('quotes',paid.id).status,'paid');assert.equal(f.issues.get(back.repo)[0].included,true);
  }finally{f.close();}
});

test('one failing repository preserves its cache while healthy sources update; all failures reach the admin with subproject names',async()=>{
  const f=portalFixture();try{
    const {project,front,back}=await create(f);for(const part of [front,back])f.issues.set(part.repo,[issue(1,part.name)]);
    await f.service.sync(project,1,true);const previous=f.integrations.issues;
    f.issues.set(front.repo,[issue(1,'Обновлённый frontend')]);f.integrations.issues=async repo=>{if(repo===back.repo)throw new PortalError(502,'GitHub временно недоступен');return previous(repo);};
    await assert.rejects(f.service.sync(project,1,true));
    const snapshot=await f.service.snapshot(f.login('client').session,project.id);assert.ok(snapshot.tasks.some(t=>t.title==='Обновлённый frontend'));assert.ok(snapshot.tasks.some(t=>t.title==='Backend'));assert.ok(snapshot.syncError);
    assert.equal(f.service.errors.query({state:'all'}).events.find(e=>e.projectId===project.id).subprojectName,'Backend');
    f.integrations.issues=async()=>{throw new PortalError(502,'GitHub временно недоступен');};await assert.rejects(f.service.sync(project,1,true));await f.service.snapshot(f.login('client').session,project.id);
    assert.deepEqual(new Set(f.service.errors.query({state:'all'}).events.filter(e=>e.projectId===project.id).map(e=>e.subprojectName)),new Set(['Frontend','Backend']));
  }finally{f.close();}
});

test('adding a subproject preserves legacy task IDs and quotes; stages and webhooks target the correct repository',async()=>{
  const f=portalFixture();try{
    const dev=f.login('developer').session;await f.service.action(dev,{type:'project.accept',projectId:'one'});await f.service.sync(f.store.get('projects','one'),1,true);
    await f.service.action(dev,{type:'quote.create',projectId:'one',number:2,baseKopecks:10000});const old=f.store.all('quotes','one')[0];
    await f.service.action(dev,{type:'project.repository.add',projectId:'one',name:'API',repo:'Matthew-zzz/new-api'});
    const project=f.store.get('projects','one');const back=project.subprojects[1];assert.equal(project.subprojects[0].id,'main');assert.ok(f.store.get('tasks','one:2'));assert.equal(f.store.get('quotes',old.id).status,'pending');
    await f.service.action(dev,{type:'stage.save',projectId:'one',subprojectId:back.id,number:0,title:'Сервер',body:'Разработка API',status:'in_progress'});assert.equal(f.issues.get(back.repo)[0].kind,'stage');assert.equal(f.store.all('stages','one')[0].subprojectId,back.id);
    await assert.rejects(f.service.action(f.login('client').session,{type:'project.repository.add',projectId:'one',name:'X',repo:'Matthew-zzz/x'}),{status:403});
    const payloads=[];const previous=f.integrations.issues;f.integrations.issues=async repo=>{payloads.push(repo);return previous(repo);};
    f.service.receiveGitHub('back-delivery',{repository:{full_name:back.repo}});await f.service.workJobs();assert.deepEqual(payloads,[back.repo]);
  }finally{f.close();}
});

test('repository bindings and cached history survive reopening; administrative CLI connections do not reset active jobs',async()=>{
  const f=portalFixture();const directory=await mkdtemp(join(tmpdir(),'node-subprojects-'));let store=new PortalStore(join(directory,'portal.sqlite'));
  try{
    const client=store.createUser('client@example.test','Клиент','client',fixturePassword,false);const developer=store.createUser('developer@example.test','Разработчик','developer',fixturePassword,false);
    let service=new PortalService(store,f.integrations,f.config);const input={...definition(f),clientEmail:client.email};const project=await service.projects.create(developer,input);
    store.enqueue('assistant',{threadId:'test',messageId:'test'},'active-job');store.db.prepare("UPDATE jobs SET running=1 WHERE id='active-job'").run();
    const side=new PortalStore(join(directory,'portal.sqlite'),{recoverJobs:false});assert.equal(side.db.prepare("SELECT running FROM jobs WHERE id='active-job'").get().running,1);side.close();
    store.close();store=new PortalStore(join(directory,'portal.sqlite'));service=new PortalService(store,f.integrations,f.config);assert.equal(store.get('projects',project.id).subprojects.length,2);assert.equal(store.db.prepare("SELECT running FROM jobs WHERE id='active-job'").get().running,0);
    assert.equal((await service.projects.create(developer,input)).id,project.id);
  }finally{store.close();f.close();await rm(directory,{recursive:true,force:true});}
});

test('GitHub repository validation uses the configured owner and reports writable Issues capability',async()=>{
  const adapter=createIntegrations(readConfig({PORTAL_GITHUB_TOKEN:'test'}),async(url,init)=>{assert.equal(url,'https://api.github.com/repos/Matthew-zzz/AnimeLove');assert.equal(init.method,'GET');return new Response(JSON.stringify({full_name:'Matthew-zzz/AnimeLove',has_issues:true,permissions:{push:true}}));});
  assert.deepEqual(await adapter.repository('Matthew-zzz/AnimeLove'),{fullName:'Matthew-zzz/AnimeLove',issuesEnabled:true,writable:true});await assert.rejects(adapter.repository('other/private'),{status:400});
});
