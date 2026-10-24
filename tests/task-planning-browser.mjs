import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium } from 'playwright';
import { createStaticServer } from '../scripts/lib/static-server.mjs';
import { portalFixture } from './helpers/portal-fixture.mjs';
import { login, openProject, completeEmailCode } from './browser/portal.mjs';

const screenshots=resolve('test-results/screenshots/task-planning');await mkdir(screenshots,{recursive:true});
const server=createStaticServer(resolve(process.env.SITE_OUTPUT_DIR||'dist'));const frontend=server.listeners('request')[0];server.removeAllListeners('request');
let fixture;let worker;let browser;
server.on('request',(request,response)=>void(request.url.startsWith('/api/portal/')?fixture.handler(request,response):frontend(request,response)));
try{
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const origin=`http://127.0.0.1:${server.address().port}`;
  browser=await chromium.launch({headless:true});
  for(const [presentation,width] of [['web',1440],['web',320],['miniapp',320]]){
    fixture=portalFixture(origin);const mini=presentation==='miniapp';
    fixture.store.put('drafts',{id:'other-project',threadId:'chat-two',projectId:'two',title:'Чужой счётчик',body:'Задача другого проекта.',confirmed:false,status:'pending',revision:1,createdAt:new Date().toISOString()});
    fixture.integrations.planTasks=async input=>{
      const last=input.messages.filter(message=>message.role==='client').at(-1);
      const base={operation:'create',draftId:'',taskId:'',title:'Поиск товаров',body:'Поиск по названию.',subprojectId:'main',reason:'Пожелание клиента.',sourceMessageIds:[last.id]};
      if(last.text==='Добавь поиск и фильтр')return [base,{...base,title:'Фильтр цены',body:'Фильтрация по диапазону цены.'}];
      if(last.text==='Поиск только по артикулу')return [{...base,operation:'update',draftId:input.proposals.find(p=>p.title==='Поиск товаров').id,body:'Поиск только по точному артикулу.'}];
      if(last.text==='Добавь поиск по части артикула')return [{...base,operation:'update',taskId:input.tasks.find(t=>t.title.startsWith('Поиск')).id,title:'Поиск по артикулу',body:'Поиск по точному артикулу и по части артикула с сохранением ведущих нулей.'}];
      if(last.text==='Отменить поиск')return [{...base,operation:'cancel',taskId:input.tasks.find(t=>t.title.startsWith('Поиск')).id,reason:'Клиент отменяет поиск.'}];
      if(last.text==='Добавь избранное')return [{...base,title:'Избранное',body:'Сохранение товаров в избранное.'}];
      if(last.text==='Избранное не нужно')return [{...base,operation:'withdraw',draftId:input.proposals.find(p=>p.title==='Избранное').id,title:'Избранное',body:'Сохранение товаров в избранное.',reason:'Клиент передумал.'}];
      return [];
    };
    worker=setInterval(()=>void fixture.service.workJobs(),100);
    const context=await browser.newContext({viewport:{width,height:900},reducedMotion:'reduce'});
    await context.route('https://telegram.org/js/telegram-web-app.js*',route=>route.fulfill({contentType:'application/javascript',body:'/* standalone Mini App fixture */'}));
    const page=await context.newPage();page.setDefaultTimeout(30000);const errors=[];page.on('pageerror',error=>errors.push(error.message));
    const tasks=page.getByRole('region',{name:'Задачи проекта',exact:true});
    const tabs=()=>tasks.getByRole('group',{name:'Подразделы задач',exact:true});
    async function section(name){if(mini)await page.getByRole('navigation',{name:'Навигация приложения',exact:true}).getByRole('button',{name,exact:true}).click();else await openProject(page,width,'one',name);}
    async function subsection(name){await tabs().getByRole('button',{name,exact:true}).click();}
    async function send(text){await section('Чат');const chat=page.getByRole('region',{name:'Чат проекта',exact:true});await chat.getByLabel('Сообщение',{exact:true}).fill(text);await chat.getByRole('button',{name:'Отправить сообщение',exact:true}).click();assert.equal(await chat.getByRole('button',{name:/Одобрить|Отклонить|Подтвердить.*задачу/}).count(),0);assert.equal(await chat.getByRole('article',{name:/Новая задача:|Изменение задачи:/}).count(),0);}
    async function badge(count){await page.waitForFunction(count=>{const button=document.querySelector('[aria-label="Разделы проекта one"] button[aria-label="Задачи"]')||document.querySelector('nav[aria-label="Навигация приложения"] button[aria-label="Задачи"]');return Boolean(button)&&(count?button.querySelector(`[aria-label="Ждут решения: ${count}"]`):!button.querySelector('[title^="Ждут решения:"]'));},count);}
    async function openProposal(title,group='Ждут одобрения'){await subsection(group);await tasks.getByRole('button',{name:`Действия предложения: ${title}`,exact:true}).click();const dialog=page.getByRole('dialog',{name:title,exact:true});await dialog.waitFor();return dialog;}
    async function decide(title,label,group='Ждут одобрения'){const dialog=await openProposal(title,group);await dialog.getByRole('button',{name:label,exact:true}).click();await dialog.waitFor({state:'hidden'});}
    async function fits(){assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));assert.ok(await page.evaluate(()=>[...document.querySelectorAll('main,dialog[open]')].every(el=>el.scrollWidth<=el.clientWidth+1)));}
    try{
      if(mini){await page.goto(origin+'/miniapp/');await page.getByLabel('Почта',{exact:true}).fill('client@example.test');await page.getByRole('button',{name:'Получить код',exact:true}).click();await page.getByLabel('Код из письма',{exact:true}).waitFor();await completeEmailCode(page,origin,'client@example.test');await page.getByRole('button',{name:'Открыть проект one',exact:true}).click();}else await login(page,origin,'client');
      await send('Добавь поиск и фильтр');await badge(2);assert.equal(fixture.issues.get('Matthew-zzz/fixture-one').length,2);
      await section('Задачи');assert.equal(await tabs().getByRole('button').count(),3);assert.equal(await tasks.getByRole('button',{name:'Одобрить задачу',exact:true}).count(),0,'actions stay inside a modal');
      await fits();await page.screenshot({path:resolve(screenshots,`${presentation}-${width}-pending.png`),fullPage:true});
      await decide('Фильтр цены','Отклонить');await badge(1);
      await send('Поиск только по артикулу');await badge(1);await section('Задачи');
      let dialog=await openProposal('Поиск товаров');await dialog.getByText('Поиск только по точному артикулу.',{exact:true}).first().waitFor();
      await dialog.getByRole('button',{name:'Изменить',exact:true}).click();await dialog.getByLabel('Название задачи',{exact:true}).fill('Поиск по артикулу');await dialog.getByLabel('Описание задачи',{exact:true}).fill('Поиск по точному артикулу с сохранением ведущих нулей.');await dialog.getByRole('button',{name:'Сохранить формулировку',exact:true}).click();await dialog.waitFor({state:'hidden'});await badge(1);
      await page.reload();await page.getByTestId('portal').waitFor();if(mini)await page.getByRole('button',{name:'Открыть проект one',exact:true}).click();await section('Задачи');
      await decide('Поиск по артикулу','Одобрить задачу','В процессе редактирования');await badge(0);assert.equal(fixture.issues.get('Matthew-zzz/fixture-one').length,3);
      await subsection('Одобренные');await tasks.getByRole('button',{name:'Действия задачи: Поиск по артикулу',exact:true}).click();dialog=page.getByRole('dialog',{name:'Описание задачи',exact:true});await dialog.getByRole('button',{name:'Изменить',exact:true}).click();await dialog.getByLabel('Описание задачи',{exact:true}).fill('Поиск по точному артикулу, ведущие нули сохраняются.');await dialog.getByRole('button',{name:'Сохранить изменения',exact:true}).click();await dialog.waitFor({state:'hidden'});await badge(1);
      assert.equal(fixture.issues.get('Matthew-zzz/fixture-one').at(-1).body,'Поиск по точному артикулу с сохранением ведущих нулей.');
      await decide('Поиск по артикулу','Одобрить изменения','В процессе редактирования');await badge(0);assert.equal(fixture.issues.get('Matthew-zzz/fixture-one').length,3);
      await send('Добавь поиск по части артикула');await badge(1);await section('Задачи');dialog=await openProposal('Поиск по артикулу','В процессе редактирования');await dialog.locator('summary').filter({hasText:'Что изменится'}).click();await fits();await page.screenshot({path:resolve(screenshots,`${presentation}-${width}-review.png`),fullPage:true});await dialog.getByRole('button',{name:'Одобрить изменения',exact:true}).click();await dialog.waitFor({state:'hidden'});await badge(0);assert.ok(fixture.issues.get('Matthew-zzz/fixture-one').at(-1).body.includes('части артикула'));
      await send('Отменить поиск');await badge(1);await section('Задачи');await decide('Поиск по артикулу','Одобрить отмену','В процессе редактирования');await badge(0);assert.equal(fixture.issues.get('Matthew-zzz/fixture-one').at(-1).status,'canceled');
      await send('Добавь избранное');await badge(1);await send('Избранное не нужно');await badge(0);await section('Задачи');await tasks.locator('summary').filter({hasText:'История решений'}).click();await tasks.getByRole('button',{name:'Действия предложения: Избранное',exact:true}).click();dialog=page.getByRole('dialog',{name:'Избранное',exact:true});await dialog.getByText('Отозвано по переписке',{exact:true}).first().waitFor();await page.keyboard.press('Escape');
      await subsection('Одобренные');await tasks.getByRole('button',{name:'Действия задачи: Поиск по артикулу',exact:true}).click();dialog=page.getByRole('dialog',{name:'Описание задачи',exact:true});await dialog.locator('summary').filter({hasText:'История изменений'}).first().click();await dialog.locator('summary').filter({hasText:'История изменений'}).nth(1).click();await dialog.getByText('Поиск только по точному артикулу.',{exact:true}).first().waitFor();await fits();await page.screenshot({path:resolve(screenshots,`${presentation}-${width}-history.png`),fullPage:true});await page.keyboard.press('Escape');
      if(!mini)await page.getByRole('button',{name:'Включить тёмную тему',exact:true}).click();else{await page.getByRole('button',{name:'Открыть раздел Ещё',exact:true}).click();await page.getByRole('button',{name:'Включить тёмную тему',exact:true}).click();await page.getByRole('button',{name:'Назад',exact:true}).click();}
      await fits();await page.screenshot({path:resolve(screenshots,`${presentation}-${width}-approved-dark.png`),fullPage:true});assert.deepEqual(errors,[]);
      console.log(`Task planning ${presentation} ${width}px: no chat approvals, three task sections, project-scoped live badges, modal decisions/editing, persisted revisions, same-Issue updates, cancellation, history, themes and layout passed.`);
    }catch(error){console.log(JSON.stringify({presentation,width,body:(await page.locator('body').innerText()).slice(-2500),proposals:fixture.store.all('drafts').map(item=>({id:item.id,title:item.title,status:item.status,revision:item.revision}))}));try{await page.screenshot({path:resolve(screenshots,`${presentation}-${width}-failure.png`),fullPage:true,timeout:5000});}catch{}throw error;}finally{await context.close();clearInterval(worker);fixture.close();}
  }
}finally{await browser?.close();clearInterval(worker);await new Promise(resolve=>server.close(resolve));}
