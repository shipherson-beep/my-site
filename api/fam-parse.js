// api/fam-parse.js — серверний посередник до OpenAI для AI-порад застосунку «Лад».
// Приймає prompt зі сторінки, додає секретний ключ OpenAI і повертає текст відповіді.
// Ключ ніколи не потрапляє в браузер (живе у змінній середовища OPENAI_API_KEY).
//
// На відміну від бюджету, тут модель повертає ВІЛЬНИЙ ТЕКСТ (поради коуча),
// тому response_format не задаємо.
//
// Доступ захищений сесією Google-користувача (Authorization: Bearer <token>) — див. _fam-auth.js.

import { authRequest } from './_fam-auth.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  if (!authRequest(req)) return res.status(401).json({ error: 'unauthorized' });

  const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
  const prompt = body.prompt;
  if (!prompt) return res.status(400).json({ error: 'No prompt' });

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
        temperature: 0.6,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    const rawText = await r.text();
    let data = null;
    try { data = JSON.parse(rawText); } catch (e) { /* не JSON */ }

    if (!r.ok) {
      const msg = (data && data.error && data.error.message) || rawText.slice(0, 300) || ('OpenAI error ' + r.status);
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
