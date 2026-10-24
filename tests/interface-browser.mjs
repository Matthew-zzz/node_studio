import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium } from 'playwright';
import { createStaticServer } from '../scripts/lib/static-server.mjs';
import { portalFixture } from './helpers/portal-fixture.mjs';
import { login, openProject, completeEmailCode, selectLoginRole } from './browser/portal.mjs';

const screenshots=resolve('test-results/screenshots/interface');await mkdir(screenshots,{recursive:true});
const server=createStaticServer(resolve(process.env.SITE_OUTPUT_DIR||'dist'));const frontend=server.listeners('request')[0];server.removeAllListeners('request');
let fixture;let worker;let browser;
server.on('request',(request,response)=>void(request.url.startsWith('/api/portal/')?fixture.handler(request,response):frontend(request,response)));
try{
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const origin=`http://127.0.0.1:${server.address().port}`;
  browser=await chromium.launch({headless:true});
  for(const [presentation,width] of [['web',1440],['web',320],['miniapp',320]]){
    fixture=portalFixture(origin);const developer=fixture.users.developer;const mini=presentation==='miniapp';
    const project={...fixture.store.get('projects','one'),developerId:developer.id,subprojects:[{id:'main',name:'Frontend',repo:'Matthew-zzz/fixture-one',createdAt:new Date().toISOString()}]};fixture.store.put('projects',project);
    const issues=fixture.issues.get(project.repo);issues[1].title='Поиск по артикулу';
    issues.push({...issues[1],id:'3',number:3,title:'Готовая задача',status:'done'});
    issues.push({...issues[1],id:'4',number:4,title:'Текущая разработка',status:'in_progress',included:true});
    for(let i=1;i<=4;i++)fixture.store.put('drafts',{id:`pending-${i}`,threadId:'chat-one',projectId:'one',title:`Пожелание ${i}`,body:i===1?'Подробные требования клиента. '.repeat(80):'Конкретные требования клиента.',confirmed:false,status:'pending',revision:1,createdAt:new Date().toISOString()});
    await fixture.service.action(fixture.login('developer').session,{type:'order.create',order:{projectName:'Оплата каталога',clientName:'Client',email:'client@example.test',username:'client',brief:'Каталог.',totalKopecks:100000}});
    worker=setInterval(()=>void fixture.service.workJobs(),100);
    const context=await browser.newContext({viewport:{width,height:900},reducedMotion:'reduce'});
    await context.route('https://telegram.org/js/telegram-web-app.js*',route=>route.fulfill({contentType:'application/javascript',body:'/* standalone Mini App fixture */'}));
    const page=await context.newPage();page.setDefaultTimeout(15000);const errors=[];page.on('pageerror',error=>errors.push(error.message));
    async function signIn(role){
      if(!mini)return login(page,origin,role);
      await page.goto(origin+'/miniapp/');
      await page.waitForFunction(()=>document.querySelector('[data-testid="portal"]')||document.querySelector('input[type="email"]'));
      if(await page.getByTestId('portal').count()){await page.getByRole('button',{name:'Открыть раздел Ещё',exact:true}).click();await page.getByRole('button',{name:'Выйти из аккаунтов',exact:true}).click();}
      await page.getByLabel('Почта',{exact:true}).waitFor();await selectLoginRole(page,role);
      await page.getByLabel('Почта',{exact:true}).fill(`${role}@example.test`);await page.getByRole('button',{name:'Получить код',exact:true}).click();await page.getByLabel('Код из письма',{exact:true}).waitFor();await completeEmailCode(page,origin,`${role}@example.test`);
      await page.getByTestId('portal').waitFor();
    }
    async function section(name){
      if(mini)await page.getByRole('navigation',{name:'Навигация приложения',exact:true}).getByRole('button',{name,exact:true}).click();
      else await openProject(page,width,'one',name);
    }
    async function openOne(){
      if(!mini)return openProject(page,width,'one');
      if(!await page.getByRole('button',{name:'Открыть проект one',exact:true}).count()){await page.getByRole('button',{name:'Открыть раздел Ещё',exact:true}).click();await page.getByRole('button',{name:'Мои проекты',exact:true}).click();}
      await page.getByRole('button',{name:'Открыть проект one',exact:true}).click();
    }
    async function fits(){assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));assert.ok(await page.evaluate(()=>[...document.querySelectorAll('main,dialog[open]')].every(el=>el.scrollWidth<=el.clientWidth+1)));}
    try{
      await signIn('client');await openOne();
      const tasks=page.getByRole('region',{name:'Задачи проекта',exact:true});
      await tasks.getByText('Ждут решения: 4',{exact:true}).waitFor();
      assert.equal(await tasks.getByRole('article',{name:/Новая задача:/}).count(),0,'overview summarizes proposals');
      assert.equal(await tasks.getByRole('heading',{name:'Готовая задача',exact:true}).count(),0,'completed work is not repeated on overview');
      if(!mini&&width===320){const profile=page.getByRole('button',{name:'Открыть профили',exact:true});const bounds=await profile.boundingBox();assert.ok(bounds.y<73,'profile switcher stays in the header');await profile.click();await page.getByRole('group',{name:'Переключение профилей',exact:true}).waitFor();await page.keyboard.press('Escape');}
      await fits();await page.screenshot({path:resolve(screenshots,`${presentation}-${width}-client-overview.png`),fullPage:true});
      await tasks.getByRole('button',{name:'Открыть задачи',exact:true}).click();
      const taskSections=tasks.getByRole('group',{name:'Подразделы задач',exact:true});
      await taskSections.waitFor();assert.equal(await tasks.getByRole('button',{name:/Действия предложения:/}).count(),4);
      assert.equal(await tasks.getByRole('button',{name:'Одобрить задачу',exact:true}).count(),0,'approval controls are inside dialogs');
      await tasks.getByRole('button',{name:'Действия предложения: Пожелание 1',exact:true}).click();
      const proposal=page.getByRole('dialog',{name:'Пожелание 1',exact:true});await proposal.getByText('Подробные требования клиента. '.repeat(80),{exact:true}).waitFor();assert.equal(await page.locator('dialog[open]').count(),1);await fits();await page.keyboard.press('Escape');
      await taskSections.getByRole('button',{name:'Одобренные',exact:true}).click();
      await tasks.getByLabel('Статус задач',{exact:true}).selectOption('done');
      await tasks.getByRole('heading',{name:'Готовая задача',exact:true}).waitFor();
      const details=tasks.getByRole('button',{name:'Действия задачи: Готовая задача',exact:true});await details.click();
      const description=page.getByRole('dialog',{name:'Описание задачи',exact:true});await description.waitFor();assert.equal(await description.getByLabel('Статус',{exact:true}).count(),0);
      await page.keyboard.press('Escape');await description.waitFor({state:'hidden'});assert.ok(await details.evaluate(el=>el===document.activeElement));
      await tasks.getByLabel('Статус задач',{exact:true}).selectOption('all');
      await tasks.getByLabel('Поиск задач',{exact:true}).fill('АРТИКУЛУ');await tasks.getByRole('heading',{name:'Поиск по артикулу',exact:true}).waitFor();assert.equal(await tasks.getByRole('heading',{name:'Текущая разработка',exact:true}).count(),0);
      await taskSections.getByRole('button',{name:'Ждут одобрения',exact:true}).click();assert.equal(await tasks.getByRole('button',{name:/Действия предложения:/}).count(),0,'search applies to proposals');
      await tasks.getByLabel('Поиск задач',{exact:true}).fill('');await fits();await page.screenshot({path:resolve(screenshots,`${presentation}-${width}-client-tasks.png`),fullPage:true});
      await signIn('developer');await openOne();
      const manager=page.getByRole('region',{name:'Подготовить разработку',exact:true});await manager.getByRole('heading',{name:'Подпроекты',exact:true}).waitFor();
      assert.equal(await page.getByRole('form',{name:'Добавление подпроекта',exact:true}).count(),0);
      await manager.getByRole('button',{name:'Добавить подпроект',exact:true}).click();const add=page.getByRole('dialog',{name:'Добавить подпроект',exact:true});await add.waitFor();await fits();
      await add.getByLabel('Название нового подпроекта',{exact:true}).fill('Backend');await add.getByLabel('Репозиторий нового подпроекта',{exact:true}).fill('Matthew-zzz/interface-backend');await add.getByRole('button',{name:'Подключить подпроект',exact:true}).click();await add.waitFor({state:'hidden'});
      await manager.getByRole('link',{name:'Matthew-zzz/interface-backend',exact:true}).waitFor();await fits();await page.screenshot({path:resolve(screenshots,`${presentation}-${width}-developer-overview.png`),fullPage:true});
      await section('Задачи');await tasks.getByRole('button',{name:'Одобренные',exact:true}).click();await page.getByRole('button',{name:'Действия задачи: Поиск по артикулу',exact:true}).click();const edit=page.getByRole('dialog',{name:'Управление задачей',exact:true});await edit.getByLabel('Статус',{exact:true}).waitFor();await page.keyboard.press('Escape');
      await section('Чат');const chat=page.getByRole('region',{name:'Чат проекта',exact:true});const connect=chat.getByRole('button',{name:'Подключиться к диалогу',exact:true});const log=chat.getByRole('log',{name:'Сообщения',exact:true});assert.ok((await connect.boundingBox()).y<(await log.boundingBox()).y);await connect.click();await page.waitForFunction(()=>document.querySelector('textarea[aria-label="Сообщение"]')?.disabled===false);assert.ok(await chat.getByLabel('Сообщение',{exact:true}).isEnabled());
      if(mini){await page.getByRole('button',{name:'Открыть раздел Ещё',exact:true}).click();await page.getByRole('button',{name:'Проекты и оплаты',exact:true}).click();}
      else{if(width<=650)await page.getByRole('button',{name:'Открыть меню кабинета',exact:true}).click();await page.getByRole('navigation',{name:'Разделы кабинета',exact:true}).getByRole('button',{name:'Проекты и оплаты',exact:true}).click();}
      const hub=page.getByRole('region',{name:'Проекты клиентов',exact:true});assert.equal(await hub.getByRole('heading',{name:'Оплата каталога',exact:true}).count(),0);
      await hub.getByRole('group',{name:'Проекты и оплаты',exact:true}).getByRole('button',{name:'Оплаты',exact:true}).click();await hub.getByRole('heading',{name:'Оплата каталога',exact:true}).waitFor();await fits();await page.screenshot({path:resolve(screenshots,`${presentation}-${width}-payments.png`),fullPage:true});
      assert.deepEqual(errors,[]);console.log(`Interface ${presentation} ${width}px: compact overview, proposal summary, task filters/search, one-click details, profile placement, subproject dialog, chat controls and grouped payments passed.`);
    }catch(error){console.log(JSON.stringify({presentation,width,url:page.url(),body:(await page.locator('body').innerText()).slice(-3500)}));try{await page.screenshot({path:resolve(screenshots,`${presentation}-${width}-failure.png`),fullPage:true,timeout:5000});}catch{}throw error;}
    finally{await context.close();clearInterval(worker);fixture.close();}
  }
}finally{await browser?.close();clearInterval(worker);await new Promise(resolve=>server.close(resolve));}
