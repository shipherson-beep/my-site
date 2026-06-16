// api/data.js — спільне сховище сімейного бюджету (Vercel KV / Upstash Redis).
//
// GET  /api/data?code=2109            → { data: <весь бюджет JSON | null> }
// POST /api/data  { code, data }       → { ok: true }
//
// Дані лежать в одному ключі "budget:main" — це і є ваш спільний акаунт.
// Доступ захищений тим самим кодом, що й вхід у застосунок (2109).
//
// Потрібні змінні середовища (Vercel додає їх автоматично, коли під'єднати KV):
//   KV_REST_API_URL    (або UPSTASH_REDIS_REST_URL)
//   KV_REST_API_TOKEN  (або UPSTASH_REDIS_REST_TOKEN)

const PIN = '2109';
const STORE_KEY = 'budget:main';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) {
    return res.status(500).json({ error: 'Сховище не налаштовано: додайте KV (KV_REST_API_URL / KV_REST_API_TOKEN) і Redeploy.' });
  }

  // Виконує одну команду Redis через REST API Upstash (команда як JSON-масив у тілі).
  const redis = async (cmd) => {
    const r = await fetch(url, {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
      body: JSON.stringify(cmd),
    });
    const j = await r.json().catch(() => null);
    if (!r.ok || (j && j.error)) throw new Error((j && j.error) || ('KV HTTP ' + r.status));
    return j ? j.result : null;
  };

  try {
    if (req.method === 'GET') {
      if ((req.query.code || '') !== PIN) return res.status(401).json({ error: 'unauthorized' });
      const raw = await redis(['GET', STORE_KEY]);
      let data = null;
      if (raw) { try { data = JSON.parse(raw); } catch (e) { data = null; } }
      // не кешувати на CDN — завжди свіже
      res.setHeader('Cache-Control', 'no-store');
      return res.status(200).json({ data });
    }

    if (req.method === 'POST') {
      let body = req.body;
      if (typeof body === 'string') { try { body = JSON.parse(body); } catch (e) { body = {}; } }
      body = body || {};
      if ((body.code || '') !== PIN) return res.status(401).json({ error: 'unauthorized' });
      if (!body.data || typeof body.data !== 'object') return res.status(400).json({ error: 'no data' });
      await redis(['SET', STORE_KEY, JSON.stringify(body.data)]);
      return res.status(200).json({ ok: true });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (e) {
    return res.status(500).json({ error: String((e && e.message) || e) });
  }
}
