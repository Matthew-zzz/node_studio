import assert from "node:assert/strict";
import { resolve } from "node:path";
import { login } from "./portal.mjs";
import { escapeHtml } from "../../src/features/portal/model/telegram-html.ts";

export async function checkAgentAdmin(browser, origin, width, screenshots, fixture) {
  const context = await browser.newContext({ viewport: { width, height: 900 }, reducedMotion: "reduce" });
  const previous = fixture.integrations.assistant;
  fixture.integrations.assistant = async (messages, kind, options) => kind === "telegram" ? {
    reply: `<b>Консультация</b>\n\n${escapeHtml(options?.knowledge[0]?.text ?? 'Уточните вопрос.')}\n\n<i>Можно позвать куратора.</i>`, title: '', body: '', handoff: false,
  } : previous(messages, kind, options);
  const errors = [];
  try {
    const page = await context.newPage();
    page.on('pageerror', error => errors.push(error.message));
    async function navigate(label, target = page) {
      if (width <= 650) await target.getByRole('button', { name: 'Открыть меню кабинета', exact: true }).click();
      await target.getByRole('navigation', { name: 'Разделы кабинета', exact: true }).getByRole('button', { name: label, exact: true }).click();
      if (width <= 650) await target.getByRole('dialog', { name: 'Меню кабинета', exact: true }).waitFor({ state: 'hidden' });
    }
    const toast = message => page.locator('[data-sonner-toast]:not([data-removed="true"])').filter({ hasText: message });
    async function save(target = page) {
      await target.getByRole('button', { name: 'Сохранить настройки', exact: true }).click();
      await target.locator('[data-sonner-toast]:not([data-removed="true"])').filter({ hasText: 'Настройки агента применены.' }).waitFor();
      await target.getByRole('button', { name: 'Сохранить настройки', exact: true }).waitFor();
    }
    await login(page, origin, 'admin');
    await page.getByLabel('Имя агента', { exact: true }).fill(`София ${width}`);
    await navigate('Промпты');
    await page.getByLabel('Системный промпт', { exact: true }).fill('Отвечай как консультант студии. Используй только сведения из базы знаний.');
    await page.locator('summary').filter({ hasText: /^Приветствие$/ }).click();
    await page.getByLabel('Приветствие', { exact: true }).fill('<b>Здравствуйте!</b> Если нужен куратор, просто попросите.');
    await save();
    assert.equal(fixture.service.agent.settings().name, `София ${width}`, 'unsaved changes survive navigation between admin sections');
    await page.reload(); await page.getByTestId('portal').waitFor();
    assert.equal(await page.getByLabel('Имя агента', { exact: true }).inputValue(), `София ${width}`);
    await page.screenshot({ path: resolve(screenshots, `${width}-agent-settings-light.png`), fullPage: true });

    await navigate('База знаний');
    await page.locator('summary').filter({ hasText: /^Добавить материал$/ }).click();
    const title = `Работа над проектом ${width}`;
    const content = 'Разработка начинается с брифа. Сначала обсуждаем пожелания, затем согласуем ТЗ. Связаться с куратором можно в Telegram.';
    await page.getByLabel('Импорт материала', { exact: true }).setInputFiles({ name: 'process.md', mimeType: 'text/markdown', buffer: Buffer.from(content) });
    await page.waitForFunction(content => document.querySelector('textarea[maxlength="50000"]')?.value === content, content);
    await page.getByLabel('Название материала', { exact: true }).fill(title);
    await page.getByRole('button', { name: 'Сохранить материал', exact: true }).click();
    const materials = page.getByRole('region', { name: 'Материалы базы знаний', exact: true });
    await materials.getByRole('heading', { name: title, exact: true }).waitFor();
    assert.equal(fixture.store.all('agentDocuments').find(document => document.title === title).content, content);
    await page.getByRole('button', { name: 'Включить тёмную тему', exact: true }).click();
    await page.screenshot({ path: resolve(screenshots, `${width}-agent-knowledge-dark.png`), fullPage: true });

    await navigate('Проверка агента');
    const messageCount = fixture.store.all('messages').length; const sentCount = fixture.sent.length;
    await page.getByLabel('Тестовое сообщение', { exact: true }).fill('С чего начинается разработка?');
    await page.getByRole('button', { name: 'Проверить ответ', exact: true }).click();
    const log = page.getByRole('log', { name: 'Тестовые сообщения', exact: true });
    await log.locator('b').filter({ hasText: 'Консультация' }).waitFor();
    const sources = page.getByRole('region', { name: 'Источники тестового ответа', exact: true });
    await sources.getByRole('heading', { name: title, exact: true }).waitFor();
    assert.equal(fixture.store.all('messages').length, messageCount); assert.equal(fixture.sent.length, sentCount);
    await page.screenshot({ path: resolve(screenshots, `${width}-agent-playground-dark.png`), fullPage: true });

    await navigate('База знаний');
    await page.locator('summary').filter({ hasText: /^Настройки RAG$/ }).click();
    await page.getByLabel('Поиск по базе знаний', { exact: true }).selectOption('hybrid');
    await save(); await fixture.service.workJobs();
    await page.getByRole('button', { name: 'Обновить данные', exact: true }).click();
    await materials.getByText('Готов', { exact: true }).waitFor();
    await materials.getByRole('button', { name: 'В архив', exact: true }).click();
    await materials.getByRole('heading', { name: 'Добавьте знания студии', exact: true }).waitFor();
    assert.equal((await fixture.service.agent.retrieve('Разработка', fixture.service.agent.settings())).sources.length, 0);
    await materials.getByRole('button', { name: 'Показать архив', exact: true }).click();
    await materials.getByRole('button', { name: 'Вернуть в базу', exact: true }).click();
    await materials.getByRole('button', { name: 'Активные материалы', exact: true }).click();
    await materials.getByRole('heading', { name: title, exact: true }).waitFor();

    await navigate('История настроек');
    const initial = page.locator('article').filter({ has: page.getByRole('heading', { name: 'Версия 0', exact: true }) });
    await initial.getByRole('button', { name: 'Восстановить', exact: true }).click();
    await toast('Версия настроек восстановлена.').waitFor();
    await navigate('ИИ-агент');
    assert.equal(await page.getByLabel('Имя агента', { exact: true }).inputValue(), 'Node');

    const other = await context.newPage();
    await other.goto(origin + '/cabinet/');
    await other.getByLabel('Имя агента', { exact: true }).waitFor();
    await page.getByLabel('Имя агента', { exact: true }).fill('Первый черновик');
    await other.getByLabel('Имя агента', { exact: true }).fill('Из другой вкладки');
    await save(other);
    await page.getByRole('button', { name: 'Обновить данные', exact: true }).click();
    assert.equal(await page.getByLabel('Имя агента', { exact: true }).inputValue(), 'Первый черновик', 'refresh preserves a dirty form');
    await page.getByRole('button', { name: 'Сохранить настройки', exact: true }).click();
    await toast('Настройки изменились в другой вкладке.').waitFor();
    assert.equal(fixture.service.agent.settings().name, 'Из другой вкладки', 'a refreshed stale form cannot overwrite another administrator');
    await page.getByRole('button', { name: 'Отменить изменения', exact: true }).click();
    assert.equal(await page.getByLabel('Имя агента', { exact: true }).inputValue(), 'Из другой вкладки');
    await other.close();
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));

    fixture.service.receiveTelegram({ update_id: 90000 + width, message: { text: 'С чего начинается разработка?', chat: { type: 'private', id: 90000 + width }, from: { first_name: 'Проверка', username: `agent_fixture_${width}` } } });
    await fixture.service.workJobs();
    await login(page, origin, 'curator');
    await page.getByLabel('Поиск диалогов', { exact: true }).fill(`agent_fixture_${width}`);
    await page.getByRole('region', { name: 'Очередь обращений', exact: true }).getByRole('button', { name: /^Открыть диалог:/ }).click();
    await page.getByRole('region', { name: 'Telegram-диалог', exact: true }).locator('b').filter({ hasText: 'Консультация' }).waitFor();
    assert.equal(await page.getByRole('navigation', { name: 'Разделы кабинета', exact: true }).getByRole('button', { name: 'ИИ-агент', exact: true }).count(), 0);
    assert.deepEqual(errors, []);
    console.log(`Agent admin ${width}px: settings, prompts, file import, RAG, preview, HTML, archival, rollback and stale-write protection passed.`);
  } finally { fixture.integrations.assistant = previous; await context.close(); }
}
