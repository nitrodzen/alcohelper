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

## Запуск

```powershell
Copy-Item .env.example .env
docker compose up -d
npm install
npm run prisma:migrate
npm run dev
```

Приложение будет доступно на `http://localhost:3000`.

## Переменные

- `DATABASE_URL` - PostgreSQL connection string.
- `NEXTAUTH_URL` - URL приложения, локально `http://localhost:3000`.
- `NEXTAUTH_SECRET` - длинная случайная строка.
- `OPENAI_API_KEY` - серверный ключ владельца портала.
- `OPENAI_MODEL` - модель для нормализации и рецептов, по умолчанию `gpt-5.4-mini`.

## Проверки

```powershell
npm test
npx tsc --noEmit
npm run build
```

`npm audit` сейчас показывает moderate advisory в транзитивном `postcss`, который приходит через текущий `next@16.2.5`; автоматический fix предлагает breaking downgrade, поэтому он не применен.
