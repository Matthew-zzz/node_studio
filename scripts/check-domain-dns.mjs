import {Resolver} from 'node:dns/promises';

const domain = 'node-studio.ru';
const expectedAddress = '144.31.215.204';
const resolver = new Resolver({timeout: 5000, tries: 2});

try {
  const addresses = await resolver.resolve4(domain);
  console.log('DNS A для '+domain+': '+addresses.join(', '));
  if (!addresses.length || addresses.some(address => address !== expectedAddress)) {
    console.error('Для этого сервера нужна DNS-запись: A | @ | '+expectedAddress+'.');
    console.error('Исправьте запись у DNS-провайдера и дождитесь её обновления перед повторным запуском.');
    process.exitCode = 1;
  }
} catch (error) {
  if (error.code === 'ENOTFOUND') {
    console.error('DNS вернул NXDOMAIN: домен '+domain+' не найден.');
    console.error('Проверьте точное имя домена, его регистрацию и делегирование NS у регистратора.');
  } else if (error.code === 'ENODATA') {
    console.error('У домена '+domain+' не найдена DNS-запись A.');
  } else {
    console.error('Не удалось проверить DNS для '+domain+' ('+error.code+'). Проверьте доступ сервера к DNS.');
  }
  console.error('В действующей DNS-зоне нужна запись: A | @ | '+expectedAddress+'.');
  console.error('Сертификат пока не запрашивался. После исправления DNS повторите публикацию.');
  process.exitCode = 1;
}
