# Структура цього пакета (важливо!)

```
api/
  parse.js        ← серверна функція (живе в КОРЕНІ — інакше Vercel її не бачить)
budget/
  index.html      ← сам застосунок, відкривається на shipherson.com/budget/
package.json
```

## Що залити на Vercel
Залийте ВЕСЬ цей вміст так, щоб у корені проєкту лежали `api/` і `budget/` поряд.
Не кладіть `api/` всередину `budget/` — Vercel реєструє функції лише з кореневої папки `api/`.

## Змінні середовища (Settings → Environment Variables)
- `OPENAI_API_KEY` = ваш ключ `sk-proj-...`
- (необовʼязково) `OPENAI_MODEL` = напр. `gpt-4o-mini`

Після додавання ключа — обовʼязково Redeploy (`vercel --prod` або кнопка Redeploy).

## Перевірка
1. `shipherson.com/api/parse` → має показати `Method not allowed` (функція жива).
2. `shipherson.com/budget/` → відкрити застосунок, спробувати ввід.

Сторінка вже налаштована звертатися до `/api/parse` у корені (рядок
`window.BUDGET_API_URL = "/api/parse"` у `budget/index.html`).
