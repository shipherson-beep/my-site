// api/parse.js
// Серверна функція-посередник (Vercel / Netlify Functions, Node.js runtime).
// Її завдання: прийняти prompt зі сторінки, додати ваш СЕКРЕТНИЙ ключ OpenAI
// і повернути відповідь моделі. Ключ ніколи не потрапляє в браузер.
//
// Ключ зберігається в змінній середовища OPENAI_API_KEY (НЕ в коді!).

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // На Vercel req.body вже розпарсений; підстраховка на випадок рядка.
  const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
  const prompt = body.prompt;
  if (!prompt) {
    return res.status(400).json({ error: 'No prompt' });
  }

  try {
    const r = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',            // дешева й швидка модель, достатня для парсингу
        temperature: 0,
        response_format: { type: 'json_object' }, // змушує повертати чистий JSON
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    const data = await r.json();
    if (!r.ok) {
      const msg = (data && data.error && data.error.message) || 'OpenAI error';
      return res.status(r.status).json({ error: msg });
    }

    const text = (data.choices && data.choices[0] && data.choices[0].message.content) || '';
    return res.status(200).json({ text });
  } catch (e) {
    return res.status(500).json({ error: String(e) });
  }
}
