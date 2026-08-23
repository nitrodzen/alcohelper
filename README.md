# Alco Helper

Закрытый помощник для домашнего бара: пользователь ведет инвентарь, находит подтвержденные рецепты, оценивает недостающие ингредиенты и получает осторожные варианты замен.

## Возможности

- Email/password авторизация через Auth.js/NextAuth Credentials и регистрация только по allowlist.
- PostgreSQL + Prisma для пользователей, инвентаря и сохраненных рецептов.
- CRUD-инвентарь с быстрым массовым добавлением; учет остатка необязателен.
- AI-нормализация предмета через OpenAI API с локальным fallback без ключа.
- Два режима: поиск конкретного рецепта и подбор того, что можно собрать.
- Проверка источника, количества, недостающих компонентов и влияния замен на вкус.
- Консервативная серверная валидация рецептов и защита внешнего fetch от локальных адресов/редиректов.
- Сохранение рецепта вместе со снимком инвентаря, моделью и заметками.

## Запуск через Docker Compose

Портал запускается как два контейнера в одной папке: `app` и `postgres`. На хосте не нужны Node.js и PostgreSQL для работы приложения.

Локально:

```bash
cp .env.example .env
docker compose up -d --build
```

Приложение будет доступно только локально на сервере: `http://127.0.0.1:777`. Публичный доступ должен идти через Nginx по HTTPS.

На сервере:

```bash
cd /opt
git clone https://github.com/nitrodzen/alcohelper.git alco-helper
cd /opt/alco-helper
cp .env.example .env
nano .env
docker compose up -d --build
```

В `.env` обязательно замени `POSTGRES_PASSWORD`, продублируй тот же пароль в `DATABASE_URL`, задай длинный `NEXTAUTH_SECRET`, добавь `OPENAI_API_KEY` и хотя бы один email или домен в allowlist. Пустой allowlist закрывает создание новых аккаунтов; существующие пользователи продолжают входить.

Конфигурация reverse proxy лежит в `deploy/nginx/alco-helper.ru.conf`. Перед включением проверь пути к сертификату, затем установи конфиг и перезагрузи Nginx:

```bash
cp deploy/nginx/alco-helper.ru.conf /etc/nginx/sites-available/alco-helper.ru
ln -s /etc/nginx/sites-available/alco-helper.ru /etc/nginx/sites-enabled/alco-helper.ru
nginx -t
systemctl reload nginx
```

После запуска:

```bash
docker compose ps
docker compose logs -f app
curl -I http://127.0.0.1:777
curl -I https://alco-helper.ru
```

## Переменные

- `POSTGRES_USER` - пользователь PostgreSQL внутри compose.
- `POSTGRES_PASSWORD` - пароль PostgreSQL внутри compose.
- `POSTGRES_DB` - база PostgreSQL внутри compose.
- `DATABASE_URL` - PostgreSQL connection string.
- `NEXTAUTH_URL` - канонический публичный URL: `https://alco-helper.ru`.
- `NEXTAUTH_SECRET` - длинная случайная строка.
- `REGISTRATION_ALLOWED_EMAILS` - email приглашенных через запятую, пробел или `;`.
- `REGISTRATION_ALLOWED_DOMAINS` - точные домены приглашенных без `@`; поддомены автоматически не разрешаются.
- `OPENAI_API_KEY` - серверный ключ владельца портала.
- `OPENAI_MODEL` - модель для нормализации инвентаря, по умолчанию `gpt-5.4-mini`.
- `OPENAI_RECIPE_MODEL` - модель для подбора рецептов и проверки источников, по умолчанию `gpt-5.4`.

В Docker Compose `DATABASE_URL` должен смотреть на хост `postgres`, например:

```env
DATABASE_URL="postgresql://postgres:CHANGE_ME@postgres:5432/alco_helper?schema=public"
```

Не используй здесь `localhost`: внутри контейнера приложения это будет сам контейнер приложения, а не база.

Пример закрытой регистрации:

```env
REGISTRATION_ALLOWED_EMAILS="owner@example.com,friend@example.org"
REGISTRATION_ALLOWED_DOMAINS="team.example.com"
```

## Проверки

```powershell
npm test
npx tsc --noEmit
npm run build
npm audit
docker compose config --quiet
```
