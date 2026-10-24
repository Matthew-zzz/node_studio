import { chooseAction } from "./focus-dialogs.mjs";
import assert from 'node:assert/strict';
import {resolve} from 'node:path';
import {login,openProject} from './portal.mjs';

export async function checkSubprojects(browser,origin,width,screenshots,fixture){
  const context=await browser.newContext({viewport:{width,height:900},reducedMotion:'reduce'});const errors=[];
  const frontend=`Matthew-zzz/browser-frontend-${width}`;const backend=`Matthew-zzz/browser-backend-${width}`;const worker=`Matthew-zzz/browser-worker-${width}`;
  const item=title=>({id:'1',projectId:'',number:1,title,body:'Описание',kind:'initial',included:true,status:'new',updatedAt:new Date().toISOString()});
  fixture.issues.set(frontend,[item('Задача интерфейса')]);fixture.issues.set(backend,[item('Задача сервера')]);fixture.issues.set(worker,[item('Фоновая обработка')]);
  for(const [repo,prefix] of [[frontend,'Интерфейс'],[backend,'Сервер']])fixture.commits.set(repo,[{sha:'shared-sha',projectId:'',title:`${prefix}: общий коммит`,author:'Разработчик',createdAt:new Date().toISOString()},{sha:`${prefix}-initial`,projectId:'',title:`${prefix}: первый коммит`,author:'Разработчик',createdAt:'2026-01-01T00:00:00Z'}]);
  try{
    const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));page.on('console',e=>{if(e.type()==='error')errors.push(e.text());});
    await login(page,origin,'developer');
    if(width<=650)await page.getByRole('button',{name:'Открыть меню кабинета',exact:true}).click();
    await page.getByRole('navigation',{name:'Разделы кабинета',exact:true}).getByRole('button',{name:'Создание проектов',exact:true}).click();
    await chooseAction(page,'Создать проект','Создать проект из репозиториев');
    await page.getByLabel('Название клиентского проекта',{exact:true}).fill('AnimeLove');await page.getByLabel('Почта клиента проекта',{exact:true}).fill('client@example.test');await page.getByLabel('Описание клиентского проекта',{exact:true}).fill('Один продукт и несколько направлений разработки.');
    await page.getByLabel('Название подпроекта 1',{exact:true}).fill('Frontend');await page.getByLabel('Репозиторий подпроекта 1',{exact:true}).fill(frontend);
    await page.getByRole('button',{name:'Добавить подпроект',exact:true}).click();await page.getByLabel('Название подпроекта 2',{exact:true}).fill('Backend');await page.getByLabel('Репозиторий подпроекта 2',{exact:true}).fill(backend);
    await page.getByRole('button',{name:'Создать клиентский проект',exact:true}).click();await page.getByRole('heading',{name:'AnimeLove',exact:true}).waitFor();
    const project=fixture.store.all('projects').find(p=>p.name==='AnimeLove');assert.ok(project);const backId=project.subprojects[1].id;
    async function part(label){
      if(width<=650)await page.getByRole('button',{name:'Открыть меню кабинета',exact:true}).click();
      await page.getByRole('group',{name:'Подпроекты проекта AnimeLove',exact:true}).getByRole('button',{name:label,exact:true}).click();
      if(width<=650)await page.getByRole('dialog',{name:'Меню кабинета',exact:true}).waitFor({state:'hidden'});
    }
    await part('Backend');await page.getByRole('heading',{name:'AnimeLove / Backend',exact:true}).waitFor();
    const stages=page.getByRole('region',{name:'Этапы проекта',exact:true});await stages.getByRole('button',{name:'Добавить этап',exact:true}).click();assert.equal(await page.getByLabel('Подпроект этапа',{exact:true}).inputValue(),backId);
    await stages.getByLabel('Название',{exact:true}).fill('Разработка API');await stages.getByLabel('Описание',{exact:true}).fill('Серверные методы');await stages.getByRole('button',{name:'Сохранить этап',exact:true}).click();await stages.getByRole('heading',{name:'Разработка API',exact:true}).waitFor();
    assert.ok(fixture.issues.get(backend).some(t=>t.title==='Разработка API'));assert.ok(!fixture.issues.get(frontend).some(t=>t.title==='Разработка API'));
    if(width<=650)await page.getByRole('button',{name:'Открыть меню кабинета',exact:true}).click();
    await page.getByRole('group',{name:'Разделы подпроекта Backend',exact:true}).getByRole('button',{name:'Задачи',exact:true}).click();
    if(width<=650)await page.getByRole('dialog',{name:'Меню кабинета',exact:true}).waitFor({state:'hidden'});
    await page.getByRole('heading',{name:/Задача сервера$/}).waitFor();assert.equal(await page.getByRole('heading',{name:/Задача интерфейса$/}).count(),0);
    await page.getByRole('button',{name:'Открыть рядом',exact:true}).click();const chat=page.getByRole('region',{name:'Чат проекта',exact:true});await chat.getByRole('button',{name:'Подключиться к диалогу',exact:true}).click();await chat.getByLabel('Сообщение',{exact:true}).fill('Черновик общего чата');
    await page.getByLabel('Подпроект',{exact:true}).selectOption('main');assert.equal(await chat.getByLabel('Сообщение',{exact:true}).inputValue(),'Черновик общего чата');await page.getByRole('heading',{name:/Задача интерфейса$/}).waitFor();
    await page.getByLabel('Раздел слева',{exact:true}).selectOption('history');await page.getByLabel('Подпроект',{exact:true}).selectOption('all');const history=page.getByRole('region',{name:'История коммитов',exact:true});assert.equal(await history.locator('article').count(),4);
    await page.evaluate(()=>{document.activeElement?.blur();window.scrollTo(0,0);});await page.screenshot({path:resolve(screenshots,`${width}-subprojects-developer-light.png`),fullPage:true});await page.getByRole('button',{name:'Включить тёмную тему',exact:true}).click();await page.screenshot({path:resolve(screenshots,`${width}-subprojects-developer-dark.png`),fullPage:true});
    await page.getByRole('button',{name:'Один раздел',exact:true}).click();await page.getByLabel('Подпроект',{exact:true}).selectOption('all');await openProject(page,width,'AnimeLove','Обзор проекта');
    await page.getByRole('region',{name:'Подготовить разработку',exact:true}).waitFor();await page.getByLabel('Название нового подпроекта',{exact:true}).fill('Worker');await page.getByLabel('Репозиторий нового подпроекта',{exact:true}).fill(worker);await page.getByRole('button',{name:'Подключить подпроект',exact:true}).click();await page.waitForFunction(()=>document.querySelector('select[aria-label="Подпроект"]')?.options.length===4);
    await login(page,origin,'client');await openProject(page,width,'AnimeLove','Задачи');
    assert.equal(await page.getByLabel('Подпроект',{exact:true}).count(),0);assert.equal(await page.getByRole('group',{name:'Подпроекты проекта AnimeLove',exact:true}).count(),0);
    for(const title of ['Задача интерфейса','Задача сервера','Фоновая обработка'])await page.getByRole('heading',{name:title,exact:true}).waitFor();
    const snapshot=await (await page.request.get(origin+`/api/portal/snapshot?project=${encodeURIComponent(project.id)}`)).json();assert.equal(snapshot.projects.find(p=>p.id===project.id).subprojects,undefined);assert.ok(!JSON.stringify(snapshot).includes(frontend));assert.equal(snapshot.conversations.filter(t=>t.projectId===project.id).length,1);
    await page.screenshot({path:resolve(screenshots,`${width}-subprojects-client.png`),fullPage:true});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
    await openProject(page,width,'AnimeLove','История');assert.equal(await page.getByRole('region',{name:'История коммитов',exact:true}).locator('article').count(),4);
    assert.deepEqual(errors,[]);console.log(`Subprojects ${width}px: developer import, source navigation, stage routing, shared chat drafts, combined history, attachment and client projection passed`);
  }finally{await context.close();}
}
