// api/data.js — спільне сховище сімейного бюджету (Neon / Postgres).
//
// GET  /api/data?code=2109            → { data: <весь бюджет JSON | null> }
// POST /api/data  { code, data }       → { ok: true }
//
// Весь бюджет лежить в ОДНОМУ рядку таблиці budget (id='main', колонка data jsonb).
// Доступ захищений тим самим кодом, що й вхід у застосунок (2109).
//
// Потрібна змінна середовища:
//   DATABASE_URL  — рядок підключення до Neon (Vercel додає його автоматично,
//                   коли під'єднати Neon Postgres у вкладці Storage).
//
// Одноразовий перенос зі старого Redis (KV/Upstash): якщо в Neon ще порожньо,
// а змінні KV_REST_API_URL/KV_REST_API_TOKEN ще присутні — при першому GET
// дані автоматично копіюються з Redis у Neon. Після переносу змінні KV можна
// прибрати.

import { neon } from '@neondatabase/serverless';

const PIN = '2109';
const ROW_ID = 'main';

let _ready = null;
function getSql() {
  const conn = process.env.DATABASE_URL;
  if (!conn) throw new Error('Сховище не налаштовано: додайте Neon (DATABASE_URL) і Redeploy.');
  const sql = neon(conn);
  if (!_ready) {
    _ready = sql`
      CREATE TABLE IF NOT EXISTS budget (
        id         text PRIMARY KEY,
        data       jsonb,
        updated_at timestamptz NOT NULL DEFAULT now()
      )
    `;
  }
  return { sql, ready: _ready };
}

// одноразовий перенос зі старого Redis (Upstash REST), якщо Neon порожній
async function importFromRedis(sql) {
  const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  try {
    const r = await fetch(url, {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
      body: JSON.stringify(['GET', 'budget:main']),
    });
    const j = await r.json().catch(() => null);
    const raw = j && j.result;
    if (!raw) return null;
    const data = JSON.parse(raw);
    await sql`
      INSERT INTO budget (id, data, updated_at)
      VALUES (${ROW_ID}, ${data}, now())
      ON CONFLICT (id) DO NOTHING
    `;
    return data;
  } catch (e) {
    return null; // перенос best-effort — не валимо запит
  }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  let sql, ready;
  try { ({ sql, ready } = getSql()); }
  catch (e) { return res.status(500).json({ error: String((e && e.message) || e) }); }

  try {
    await ready;

    if (req.method === 'GET') {
      if ((req.query.code || '') !== PIN) return res.status(401).json({ error: 'unauthorized' });
      const rows = await sql`SELECT data FROM budget WHERE id = ${ROW_ID}`;
      let data = rows.length ? rows[0].data : null;
      if (data == null) data = await importFromRedis(sql); // одноразова міграція
      res.setHeader('Cache-Control', 'no-store');
      return res.status(200).json({ data: data ?? null });
    }

    if (req.method === 'POST') {
      let body = req.body;
      if (typeof body === 'string') { try { body = JSON.parse(body); } catch (e) { body = {}; } }
      body = body || {};
      if ((body.code || '') !== PIN) return res.status(401).json({ error: 'unauthorized' });
      if (!body.data || typeof body.data !== 'object') return res.status(400).json({ error: 'no data' });
      await sql`
        INSERT INTO budget (id, data, updated_at)
        VALUES (${ROW_ID}, ${body.data}, now())
        ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data, updated_at = now()
      `;
      return res.status(200).json({ ok: true });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (e) {
    return res.status(500).json({ error: String((e && e.message) || e) });
  }
}
