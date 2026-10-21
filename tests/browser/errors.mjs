import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { login } from './portal.mjs';
import { responseError } from '../../server/upstream-error.ts';

export async function checkErrorJournal(browser, origin, width, screenshots, fixture) {
  const clientContext=await browser.newContext({viewport:{width,height:900},reducedMotion:'reduce'});
  const adminContext=await browser.newContext({viewport:{width,height:900},reducedMotion:'reduce'});
  const previous=fixture.integrations.issues; const pageErrors=[];
  const client=await clientContext.newPage();const admin=await adminContext.newPage();
  client.on('pageerror',e=>pageErrors.push(e.message));admin.on('pageerror',e=>pageErrors.push(e.message));
  async function navigate(label,page) {
    if(width<=650)await page.getByRole('button',{name:'Открыть меню кабинета',exact:true}).click();
    await page.getByRole('navigation',{name:'Разделы кабинета',exact:true}).getByRole('button',{name:label,exact:true}).click();
    if(width<=650)await page.getByRole('dialog',{name:'Меню кабинета',exact:true}).waitFor({state:'hidden'});
  }
  try{
    await login(client,origin,'client');
    const failure=await responseError('https://api.github.com/repos/fixture/project/issues',new Response(JSON.stringify({message:'Sorry. Your account was suspended'}),{status:403}));
    fixture.integrations.issues=async()=>{throw failure;};
    await fixture.service.sync(fixture.store.get('projects','one'),1,true).catch(()=>undefined);
    await client.reload();await client.getByTestId('portal').waitFor();
    await client.locator('[data-sonner-toast]').filter({hasText:'Администратор уведомлён'}).first().waitFor();
    await login(admin,origin,'admin');await navigate('Ошибки',admin);
    await admin.getByLabel('Поиск ошибок',{exact:true}).fill('client@example.test');
    await admin.getByLabel('Сервис ошибок',{exact:true}).selectOption('github');
    const row=admin.locator('details').filter({has:admin.getByRole('heading',{name:'Аккаунт GitHub заблокирован',exact:true})}).first();
    await row.waitFor();await row.locator('summary').click();
    assert.ok((await row.innerText()).includes('GITHUB_ACCOUNT_SUSPENDED'));assert.ok((await row.innerText()).includes('client@example.test'));
    assert.ok((await row.innerText()).includes('502 / 403'));assert.ok((await row.innerText()).includes('GitHub и отправьте обращение'));
    assert.ok(await admin.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
    await admin.screenshot({path:resolve(screenshots,`${width}-errors-light.png`),fullPage:true});
    await admin.getByRole('button',{name:'Включить тёмную тему',exact:true}).click();
    await admin.screenshot({path:resolve(screenshots,`${width}-errors-dark.png`),fullPage:true});
    await row.getByRole('button',{name:'Отметить решённой',exact:true}).click();
    await admin.getByRole('heading',{name:'Ошибок не найдено',exact:true}).waitFor();
    await admin.getByLabel('Статус ошибок',{exact:true}).selectOption('resolved');await row.waitFor();
    fixture.integrations.issues=previous;
    for(const project of fixture.store.all('projects'))await fixture.service.sync(project,1,true);
    await clientContext.setOffline(true);await client.evaluate(()=>window.dispatchEvent(new Event('focus')));
    await client.locator('[data-sonner-toast]').filter({hasText:'Не удалось связаться с сервером'}).first().waitFor();
    assert.ok(await client.evaluate(()=>JSON.parse(localStorage.getItem('node-request-errors-v1')||'[]').some(item=>item.kind==='network')));
    await clientContext.setOffline(false);await client.evaluate(()=>window.dispatchEvent(new Event('focus')));
    await admin.getByLabel('Статус ошибок',{exact:true}).selectOption('open');await admin.getByLabel('Сервис ошибок',{exact:true}).selectOption('browser');
    const browserRow=admin.locator('details').filter({has:admin.getByRole('heading',{name:'Браузер не смог связаться с сервером',exact:true})}).first();
    await admin.getByRole('button',{name:'Обновить журнал',exact:true}).click();await browserRow.waitFor();await browserRow.locator('summary').click();assert.ok((await browserRow.innerText()).includes('client@example.test'));
    await client.waitForFunction(()=>!JSON.parse(localStorage.getItem('node-request-errors-v1')||'[]').length);
    const before=fixture.service.errors.query({provider:'browser'}).total;
    await client.route('**/api/portal/snapshot?*',route=>route.fulfill({status:502,contentType:'text/html',body:'<h1>Bad Gateway</h1>'}));
    await client.evaluate(()=>window.dispatchEvent(new Event('focus')));
    await client.locator('[data-sonner-toast]').filter({hasText:'Не удалось выполнить запрос'}).first().waitFor();
    await client.unroute('**/api/portal/snapshot?*');await client.evaluate(()=>window.dispatchEvent(new Event('focus')));
    await admin.getByRole('button',{name:'Обновить журнал',exact:true}).click();
    await admin.getByRole('heading',{name:'Ошибка запроса из браузера',exact:true}).waitFor();assert.ok(fixture.service.errors.query({provider:'browser'}).total>before);
    assert.deepEqual(pageErrors,[]);console.log(`Error journal ${width}px: user attribution, decoding, status filters, themes, offline recovery and proxy errors passed`);
  }finally{
    fixture.integrations.issues=previous;
    await clientContext.close();await adminContext.close();
  }
}
