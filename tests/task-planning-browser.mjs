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
    const page=await context.newPage();page.setDefaultTimeout(15000);const errors=[];page.on('pageerror',error=>errors.push(error.message));
    async function section(name){
      if(mini)await page.getByRole('navigation',{name:'Навигация приложения',exact:true}).getByRole('button',{name,exact:true}).click();
      else await openProject(page,width,'one',name);
    }
    async function send(text){await section('Чат');const chat=page.getByRole('region',{name:'Чат проекта',exact:true});await chat.getByLabel('Сообщение',{exact:true}).fill(text);await chat.getByRole('button',{name:'Отправить сообщение',exact:true}).click();}
    async function refresh(){await page.reload({waitUntil:'domcontentloaded'});await page.getByTestId('portal').waitFor();if(mini&&await page.getByRole('button',{name:'Открыть проект one',exact:true}).count())await page.getByRole('button',{name:'Открыть проект one',exact:true}).click();}
    const cards=()=>page.getByRole('region',{name:'Согласование задач',exact:true});
    const card=title=>cards().getByRole('article',{name:title,exact:true});
    try{
      if(mini){
        await page.goto(origin+'/miniapp/');await page.getByLabel('Почта',{exact:true}).fill('client@example.test');await page.getByRole('button',{name:'Получить код',exact:true}).click();await page.getByLabel('Код из письма',{exact:true}).waitFor();await completeEmailCode(page,origin,'client@example.test');await page.getByRole('button',{name:'Открыть проект one',exact:true}).click();
      }else await login(page,origin,'client');
      await send('Добавь поиск и фильтр');
      await card('Новая задача: Поиск товаров').waitFor();await card('Новая задача: Фильтр цены').waitFor();
      assert.equal(fixture.issues.get('Matthew-zzz/fixture-one').length,2);
      await card('Новая задача: Фильтр цены').getByRole('button',{name:'Отклонить',exact:true}).click();
      await card('Новая задача: Фильтр цены').waitFor({state:'hidden'});
      await send('Поиск только по артикулу');await card('Новая задача: Поиск товаров').getByText('Поиск только по точному артикулу.',{exact:true}).first().waitFor();
      await refresh();await section('Задачи');
      const pending=card('Новая задача: Поиск товаров');await pending.waitFor();
      await pending.getByRole('button',{name:'Уточнить формулировку',exact:true}).click();
      const dialog=page.getByRole('dialog',{name:'Уточнить задачу',exact:true});
      await dialog.getByLabel('Название задачи',{exact:true}).fill('Поиск по артикулу');
      await dialog.getByLabel('Описание задачи',{exact:true}).fill('Поиск по точному артикулу с сохранением ведущих нулей.');
      await dialog.getByRole('button',{name:'Сохранить формулировку',exact:true}).click();await dialog.waitFor({state:'hidden'});
      await card('Новая задача: Поиск по артикулу').getByRole('button',{name:'Одобрить задачу',exact:true}).click();
      await card('Новая задача: Поиск по артикулу').waitFor({state:'hidden'});
      assert.equal(fixture.issues.get('Matthew-zzz/fixture-one').length,3);
      assert.equal(fixture.issues.get('Matthew-zzz/fixture-one').at(-1).body,'Поиск по точному артикулу с сохранением ведущих нулей.');
      await send('Добавь поиск по части артикула');await card('Изменение задачи: Поиск по артикулу').waitFor();await section('Задачи');
      const change=card('Изменение задачи: Поиск по артикулу');await change.locator('summary').filter({hasText:'Что изменится'}).click();
      assert.ok(fixture.issues.get('Matthew-zzz/fixture-one').at(-1).body.includes('ведущих нулей'));
      await page.screenshot({path:resolve(screenshots,`${presentation}-${width}-review.png`),fullPage:true});
      assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
      await change.getByRole('button',{name:'Одобрить изменения',exact:true}).click();await change.waitFor({state:'hidden'});
      assert.ok(fixture.issues.get('Matthew-zzz/fixture-one').at(-1).body.includes('части артикула'));
      await send('Отменить поиск');await card('Отмена задачи: Поиск по артикулу').getByRole('button',{name:'Одобрить отмену',exact:true}).click();
      await card('Отмена задачи: Поиск по артикулу').waitFor({state:'hidden'});assert.equal(fixture.issues.get('Matthew-zzz/fixture-one').at(-1).status,'canceled');
      await send('Добавь избранное');await card('Новая задача: Избранное').waitFor();await send('Избранное не нужно');await card('Новая задача: Избранное').waitFor({state:'hidden'});
      await section('Задачи');await cards().locator('summary').filter({hasText:'Принятые решения'}).click();
      await card('Новая задача: Избранное').getByText(/Отозвано по переписке/).first().waitFor();
      const approved=card('Новая задача: Поиск по артикулу');await approved.locator('summary').filter({hasText:'История изменений'}).click();
      await approved.getByText('Поиск только по точному артикулу.',{exact:true}).first().waitFor();
      await page.screenshot({path:resolve(screenshots,`${presentation}-${width}-history.png`),fullPage:true});
      assert.ok(await page.evaluate(()=>[...document.querySelectorAll('main,dialog[open]')].every(el=>el.scrollWidth<=el.clientWidth+1)));
      assert.deepEqual(errors,[]);
      console.log(`Task planning ${presentation} ${width}px: chat extraction, revisions, rejection, client editing, approval, proposed updates, cancellation, withdrawal, persisted history and layout passed.`);
    }catch(error){console.log(JSON.stringify({presentation,width,dialogs:await page.locator('dialog[open]').evaluateAll(items=>items.map(item=>({text:item.innerText,html:item.innerHTML.slice(0,5000)}))),proposals:fixture.store.all('drafts').map(item=>({id:item.id,title:item.title,status:item.status,revision:item.revision}))}));await page.screenshot({path:resolve(screenshots,`${presentation}-${width}-failure.png`),fullPage:true});throw error;}finally{await context.close();clearInterval(worker);fixture.close();}
  }
}finally{await browser?.close();clearInterval(worker);await new Promise(resolve=>server.close(resolve));}
