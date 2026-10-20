# Миграция на Next.js

## Что перенесено

Строковый генератор страниц заменён настоящими React-компонентами и маршрутами App Router. Главная и адреса `/projects/autoparts/`, `/projects/anime-love/`, `/projects/vectra/` сохранены. Контакт, тексты, адаптивные изображения, рамки устройств и иллюстрации перенесены из исходного сайта.

| Прежний файл | Новое расположение |
| --- | --- |
| `src/content.mjs` | `src/config/site.ts`, `src/features/projects/data/projects.ts` |
| `src/templates.mjs`, `src/home.mjs` | `src/app`, компоненты features и общие секции |
| `src/media.mjs` | `src/features/projects/data/screenshots.ts` |
| `src/main.js`, `src/mobile.js` | `src/components/layout`, `src/components/ui` |
| `src/solutions.mjs` | `src/features/services` |
| `src/hero-atmosphere.mjs` | `src/features/home/components/hero-atmosphere.tsx` |
| `src/stack-icons.mjs` | `src/features/home/data/technology-icons.ts` |
| `dist/assets` как источник | `public/assets` |
| `scripts/build.mjs` | `next build` и `scripts/finalize-export.mjs` |
| `scripts/check.mjs` | `tests/export.test.mjs`, ESLint и TypeScript |

Старые DOM-скрипты и сборщик удалены из активного исходного кода. История оформления и материалов сохранена в `docs/archive/static-site.md`, промпты — в `docs/asset-generation`. Первоначальные архивы и фотографии вне каталога приложения не изменены.

## Сборка и размещение

Используется `output: "export"` и завершающий `/` в URL. Next.js создаёт `out/`, затем скрипт копирует его в `dist/`. Поэтому существующий manifest `.openai/hosting.json` и конфигурации Nginx продолжают указывать на статический результат. Сервер Next.js для опубликованного сайта не требуется.

Изолированная сборка для другого домена поддерживает прежние переменные:

```bash
SITE_ORIGIN=https://example.com SITE_OUTPUT_DIR=.cache/example-dist npm run build
SITE_ORIGIN=https://example.com SITE_OUTPUT_DIR=.cache/example-dist npm test
```

`SITE_OUTPUT_DIR` разрешён только для `dist` или подпапки `.cache`. Скрипт очищает выбранный результат перед копированием, чтобы не оставлять файлы удалённых маршрутов. Не помещайте исходные файлы в эти каталоги.

Текущий запуск `node-studio.ru` описан в [руководстве Docker](deployment.md): фронтенд и API находятся в одном контейнере с постоянным томом. После проверок и push контейнер обновляется командой Docker Compose. Прежние установщики и отдельный supervisor удалены из исходников.

`npm run dev` теперь запускает Next.js на порту 3000; просмотр готового экспорта — `npm run preview`, порт 4173. Открытие прежних `preview*.html` через `file://` заменено этими командами: клиентская навигация Next.js использует HTTP-ресурсы.

## Границы статического экспорта

Для портфолио все данные известны при сборке. Здесь нет собственного API, авторизации или форм с серверной обработкой. Контакт ведёт в Telegram.

Если появятся серверные сценарии, сначала выберите подходящий runtime, уберите `output: "export"`, пересмотрите сборку и размещение. Не добавляйте обработчик, который требует сервера, в статический проект без такого изменения.

## Проверка в текущей среде

Установка выполнена из доступного npm-кэша: прямой DNS-доступ к npm registry здесь отсутствует. Проект имеет обычный `package-lock.json` со ссылками на npm registry и не зависит от локальных путей другого проекта.

Production-сборка проверена в режиме `NEXT_BUILD_WORKER_THREADS=1`, поскольку среда ограничивает запуск дочерних процессов. Lint, строгая проверка типов и 9 проверок экспорта проходят. Полный браузерный прогон выполняется в GitHub Actions: локально среда запрещает HTTP-порт (`listen EPERM`). Установка серверной службы требует запуска вне ограничений этой сессии; порядок активации и проверка домена описаны в `docs/deployment.md`.
