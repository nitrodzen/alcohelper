# Alco Helper

Закрытый текстовый помощник для домашнего бара: пользователь авторизуется, ведет инвентарь, генерирует коктейли из доступных компонентов и сохраняет рецепты.

## Возможности

- Email/password авторизация через Auth.js/NextAuth Credentials.
- PostgreSQL + Prisma для пользователей, инвентаря и сохраненных рецептов.
- CRUD-инвентарь: алкоголь, ингредиенты, инструменты, количество, ABV, описание, иконка, алиасы.
- AI-нормализация предмета через OpenAI API с локальным fallback без ключа.
- Генерация рецептов только из доступных обязательных компонентов.
- Серверная валидация рецептов перед показом пользователю.
- Сохранение рецепта вместе со снимком инвентаря, моделью и заметками.

## Запуск через Docker Compose

Портал запускается как два контейнера в одной папке: `app` и `postgres`. На хосте не нужны Node.js и PostgreSQL для работы приложения.

Локально:

```bash
cp .env.example .env
docker compose up -d --build
```

Приложение будет доступно на `http://localhost:777`.

На сервере:

```bash
ss -ltnp | grep ':777'
cd /opt
git clone https://github.com/nitrodzen/alcohelper.git alco-helper
cd /opt/alco-helper
cp .env.example .env
nano .env
docker compose up -d --build
```

Если команда `ss -ltnp | grep ':777'` ничего не вывела, порт свободен. В `.env` на сервере обязательно замени `POSTGRES_PASSWORD`, продублируй тот же пароль в `DATABASE_URL`, задай длинный `NEXTAUTH_SECRET` и добавь `OPENAI_API_KEY`.

После запуска:

```bash
docker compose ps
docker compose logs -f app
curl -I http://localhost:777
```

Снаружи портал будет доступен на `http://185.233.184.185:777`, если порт открыт в firewall/панели хостинга.

## Переменные

- `POSTGRES_USER` - пользователь PostgreSQL внутри compose.
- `POSTGRES_PASSWORD` - пароль PostgreSQL внутри compose.
- `POSTGRES_DB` - база PostgreSQL внутри compose.
- `DATABASE_URL` - PostgreSQL connection string.
- `NEXTAUTH_URL` - публичный URL приложения, для пилота `http://185.233.184.185:777`.
- `NEXTAUTH_SECRET` - длинная случайная строка.
- `OPENAI_API_KEY` - серверный ключ владельца портала.
- `OPENAI_MODEL` - модель для нормализации инвентаря, по умолчанию `gpt-5.4-mini`.
- `OPENAI_RECIPE_MODEL` - модель для подбора рецептов и проверки источников, по умолчанию `gpt-5.4`.

В Docker Compose `DATABASE_URL` должен смотреть на хост `postgres`, например:

```env
DATABASE_URL="postgresql://postgres:CHANGE_ME@postgres:5432/alco_helper?schema=public"
```

Не используй здесь `localhost`: внутри контейнера приложения это будет сам контейнер приложения, а не база.

## Проверки

```powershell
npm test
npx tsc --noEmit
npm run build
docker compose config --quiet
```

`npm audit` сейчас показывает moderate advisory в транзитивном `postcss`, который приходит через текущий `next@16.2.5`; автоматический fix предлагает breaking downgrade, поэтому он не применен.
