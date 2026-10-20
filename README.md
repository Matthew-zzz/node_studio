# NODO Studio — frontend

Фронтенд существующего сайта NODO Studio на **Next.js 16, React 19 и TypeScript**. Сохранены главная, три кейса, адаптивные изображения и Telegram-контакт. Маршруты используют App Router; страницы предварительно собираются в HTML.

## Запуск

Нужны Node.js 24 LTS и npm 10+.

```bash
npm ci
npm run dev
```

Сайт доступен на `http://localhost:3000`. При необходимости скопируйте `.env.example` в `.env.local` и задайте `SITE_ORIGIN` — домен для canonical, Open Graph, sitemap и robots. Контакты и тексты студии находятся в `src/config/site.ts`.

## Структура

```text
src/
├── app/                        # Маршруты, layout, SEO, 404 и обработка ошибок
│   └── projects/[slug]/         # Страница кейса и generateStaticParams
├── components/
│   ├── layout/                 # Шапка, меню, подвал, эффекты страницы
│   ├── sections/               # Общие секции: контакт
│   └── ui/                     # Иконки, логотип, ссылки, копирование, анимация
├── features/
│   ├── home/                   # Главная: компоненты, контент и стили
│   ├── projects/               # Кейсы: данные, типы, поиск, изображения, галереи
│   └── services/               # Услуги: данные, типы, иллюстрации и стили
├── config/                     # Настройки студии и навигация
├── lib/                        # Метаданные и общие браузерные функции
└── styles/                     # Токены, общие и адаптивные стили
public/
├── assets/                     # Исходные изображения и favicon
└── licenses/                   # Лицензии сторонних материалов
scripts/                        # Подготовка экспорта, локальный preview, deployment
tests/                         # Проверки HTML и браузерных сценариев
docs/                          # Архитектура, миграция, происхождение материалов
```

- [Архитектура и правила расширения](docs/architecture.md).
- [Перенос со статического сборщика и размещение](docs/migration.md).

## Команды

| Команда | Назначение |
| --- | --- |
| `npm run dev` | Разработка с обновлением страницы |
| `npm run build` | Production-сборка; результат в `out/` и совместимой копии `dist/` |
| `npm run preview` | Проверка `dist/` на `http://localhost:4173` |
| `npm run lint` | ESLint, правила React и Next.js, проверка импортов и оформления JSX |
| `npm run lint:fix` | Автоматическое исправление поддерживаемых правил |
| `npm run typecheck` | Строгая проверка TypeScript |
| `npm test` | 9 проверок готовой статической сборки; сначала выполните build |
| `npm run check` | Lint, TypeScript и тесты готовой сборки |
| `npm run test:e2e` | Chromium: четыре размера экрана, меню, переходы, FAQ и копирование |

Перед изменениями и отправкой кода:

```bash
npm run lint
npm run typecheck
npm run build
npm test
```

Для браузерных проверок один раз установите Chromium:

```bash
npx playwright install chromium
npm run test:e2e
```

Скриншоты сохраняются в `test-results/screenshots/`. Для уже установленного браузера можно задать `CHROMIUM_EXECUTABLE`. Проверки запускаются также в GitHub Actions из `.github/workflows/ci.yml`; публикация в workflow не выполняется.

В изолированной среде с запретом дочерних процессов доступна сборка через потоки с сохранением проверки типов:

```bash
NEXT_BUILD_WORKER_THREADS=1 npm run build
```

В текущей среде этот режим успешно собрал проект; lint, TypeScript и 9 тестов экспорта прошли. Браузерный прогон здесь недоступен: локальный HTTP-сервер получает `listen EPERM`. Его нужно выполнить в обычной среде или CI.
