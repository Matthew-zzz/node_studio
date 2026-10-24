import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium } from 'playwright';
import { createStaticServer } from '../scripts/lib/static-server.mjs';
import { portalFixture } from './helpers/portal-fixture.mjs';
import { telegramLaunch } from './helpers/telegram.mjs';
import { completeEmailCode, selectLoginRole } from './browser/portal.mjs';

const screenshots=resolve('test-results/screenshots/more');await mkdir(screenshots,{recursive:true});
const server=createStaticServer(resolve(process.env.SITE_OUTPUT_DIR||'dist'));const frontend=server.listeners('request')[0];server.removeAllListeners('request');
let fixture;let worker;let browser;
server.on('request',(request,response)=>void(request.url.startsWith('/api/portal/')?fixture.handler(request,response):frontend(request,response)));
try{
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const origin=`http://127.0.0.1:${server.address().port}`;
  browser=await chromium.launch({headless:true});
  for(const [role,width] of [['client',320],['developer',320],['admin',320],['developer',390],['client',768]].filter(([role,width])=>!process.env.MORE_CASES||process.env.MORE_CASES.split(',').includes(`${role}:${width}`))){
    fixture=portalFixture(origin);
    fixture.store.put('projects',{...fixture.store.get('projects','one'),developerId:fixture.users.developer.id});
    const issues=fixture.issues.get('Matthew-zzz/fixture-one');
    for(let number=10;number<22;number++)issues.push({...issues[0],id:String(number),number,title:`Этап ${number}`,body:'Описание этапа',kind:'stage'});
    worker=setInterval(()=>void fixture.service.workJobs(),100);
    const context=await browser.newContext({viewport:{width,height:844},reducedMotion:'reduce'});
    await context.route('https://telegram.org/js/telegram-web-app.js*',route=>route.fulfill({contentType:'application/javascript',body:'/* fixture bridge */'}));
    await context.addInitScript(initData=>{
      const callbacks=new Set();const events=new Map();window.__moreBack=()=>callbacks.forEach(callback=>callback());
      window.Telegram={WebApp:{initData,platform:'ios',colorScheme:'light',viewportStableHeight:innerHeight,ready(){},expand(){},isVersionAtLeast:()=>true,onEvent(name,callback){if(!events.has(name))events.set(name,new Set());events.get(name).add(callback);},offEvent(name,callback){events.get(name)?.delete(callback);},setHeaderColor(){},setBackgroundColor(){},setBottomBarColor(){},openLink(){},openTelegramLink(){},BackButton:{show(){},hide(){},onClick:callback=>callbacks.add(callback),offClick:callback=>callbacks.delete(callback)}}};
    },telegramLaunch(fixture.config.telegramToken,1));
    const page=await context.newPage();page.setDefaultTimeout(30000);const errors=[];page.on('pageerror',error=>errors.push(error.message));
    const main=page.getByRole('main');const nav=page.getByRole('navigation',{name:'Навигация приложения',exact:true});const more=page.getByRole('region',{name:'Ещё',exact:true});
    async function openMore(header=false){await (header?page.getByRole('button',{name:'Открыть раздел Ещё',exact:true}):nav.getByRole('button',{name:'Ещё',exact:true})).click();await more.waitFor();}
    async function fits(){assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));assert.ok(await main.evaluate(el=>el.scrollWidth<=el.clientWidth+1));const bounds=await nav.boundingBox();assert.ok(bounds.y+bounds.height<=844+1);}
    try{
      await page.goto(origin+'/miniapp/');await page.getByLabel('Почта',{exact:true}).waitFor();await selectLoginRole(page,role);await page.getByLabel('Почта',{exact:true}).fill(`${role}@example.test`);await page.getByRole('button',{name:'Получить код',exact:true}).click();await page.getByLabel('Код из письма',{exact:true}).waitFor();await completeEmailCode(page,origin,`${role}@example.test`);await page.getByTestId('portal').waitFor();
      if(role!=='admin'){
        if(role==='developer'){await openMore();await more.getByRole('button',{name:'Мои проекты',exact:true}).click();}
        await page.getByRole('button',{name:'Открыть проект one',exact:true}).click();await page.getByRole('heading',{name:'Этап 10',exact:true}).waitFor();
      }else await page.getByRole('heading',{name:'ИИ-агент Telegram',exact:true}).waitFor();
      await main.evaluate(el=>el.scrollTo({top:240}));const previous=await main.evaluate(el=>el.scrollTop);if(role!=='admin')assert.ok(previous>100);
      await openMore();await page.getByRole('heading',{name:'Ещё',exact:true,level:1}).waitFor();
      assert.equal(await page.locator('dialog[open]').count(),0,'More is a normal screen');assert.equal(await more.getAttribute('role'),null,'More uses ordinary section semantics');
      assert.equal(await nav.getByRole('button',{name:'Ещё',exact:true}).getAttribute('aria-current'),'page');assert.equal(await nav.locator('[aria-current="page"]').count(),1);
      await more.getByRole('region',{name:'Аккаунт',exact:true}).getByText(`${role}@example.test`,{exact:true}).waitFor();
      assert.equal(await page.getByRole('button',{name:'Открыть раздел Ещё',exact:true}).getAttribute('aria-haspopup'),null);
      if(role==='client')assert.equal(await more.getByRole('button',{name:'Добавить профиль: Администратор',exact:true}).count(),0);
      await fits();await page.screenshot({path:resolve(screenshots,`${role}-${width}-light.png`),fullPage:true});
      await page.evaluate(()=>window.__moreBack());await more.waitFor({state:'detached'});await page.waitForFunction(previous=>Math.abs(document.querySelector('main').scrollTop-previous)<2,previous).catch(async error=>{error.message+=` Expected scroll ${previous}; actual ${await main.evaluate(el=>el.scrollTop)}`;throw error;});
      if(role!=='admin'){
        await nav.getByRole('button',{name:'Чат',exact:true}).click();const chat=page.getByRole('region',{name:'Чат проекта',exact:true});
        if(role==='developer')await chat.getByRole('button',{name:'Подключиться к диалогу',exact:true}).click();
        await chat.getByLabel('Сообщение',{exact:true}).fill('Сохранённый черновик');await openMore(true);await more.getByRole('button',{name:'Включить тёмную тему',exact:true}).click();await page.getByRole('button',{name:'Назад',exact:true}).click();
        assert.equal(await chat.getByLabel('Сообщение',{exact:true}).inputValue(),'Сохранённый черновик');await fits();
      }
      await openMore();await more.getByRole('button',{name:'Настройки',exact:true}).click();await more.waitFor({state:'detached'});await page.getByRole('heading',{name:'Аккаунт',exact:true}).waitFor();
      await openMore();await more.getByRole('button',{name:'Включить тёмную тему',exact:true}).click();await fits();await page.screenshot({path:resolve(screenshots,`${role}-${width}-dark.png`),fullPage:true});
      assert.deepEqual(errors,[]);console.log(`More ${role} ${width}px: normal page, active navigation, role actions, native/visible back, scroll restoration, preserved chat draft, settings, themes and responsive layout passed.`);
    }catch(error){try{await page.screenshot({path:resolve(screenshots,`${role}-${width}-failure.png`),timeout:5000});}catch{}throw error;}
    finally{await context.close();clearInterval(worker);fixture.close();}
  }
}finally{await browser?.close();clearInterval(worker);await new Promise(resolve=>server.close(resolve));}
