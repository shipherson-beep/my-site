// api/parse.js
// Серверна функція-посередник (Vercel / Netlify Functions, Node.js runtime).
// Її завдання: прийняти prompt зі сторінки, додати ваш СЕКРЕТНИЙ ключ OpenAI
// і повернути відповідь моделі. Ключ ніколи не потрапляє в браузер.
//
// Ключ зберігається в змінній середовища OPENAI_API_KEY (НЕ в коді!).

export default async function handler(req, res) {
  // Дозволяємо виклик з будь-якого домену (напр. ваш сайт shipherson.com
  // звертається до функції на Vercel). Можна звузити до свого домену.
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // На Vercel req.body вже розпарсений; підстраховка на випадок рядка.
  const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
  const prompt = body.prompt;
  if (!prompt) {
    return res.status(400).json({ error: 'No prompt' });
  }

  // Модель можна перевизначити змінною середовища OPENAI_MODEL.
  const model = process.env.OPENAI_MODEL || 'gpt-4o-mini';

  if (!process.env.OPENAI_API_KEY) {
    return res.status(500).json({ error: 'Не задано OPENAI_API_KEY на сервері.' });
  }

  try {
    const r = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model,
        temperature: 0,
        response_format: { type: 'json_object' }, // змушує повертати чистий JSON
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    // Читаємо як текст, щоб показати справжню помилку навіть якщо це не JSON.
    const rawText = await r.text();
    let data = null;
    try { data = JSON.parse(rawText); } catch (e) { /* не JSON */ }

    if (!r.ok) {
      const msg = (data && data.error && data.error.message)
        || rawText.slice(0, 300)
        || ('OpenAI error ' + r.status);
      // Підказка для частого випадку 404
      const hint = (r.status === 404)
        ? ` (модель "${model}" недоступна для цього ключа — перевірте назву моделі / доступ акаунта)`
        : '';
      return res.status(r.status).json({ error: msg + hint });
    }

    const text = (data && data.choices && data.choices[0] && data.choices[0].message.content) || '';
    return res.status(200).json({ text });
  } catch (e) {
    return res.status(500).json({ error: String(e) });
  }
}
