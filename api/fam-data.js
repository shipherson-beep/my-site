// api/fam-data.js — спільне сховище застосунку «Лад» (Neon / Postgres).
//
// GET  /api/fam-data            → { data: <весь стан JSON | null> }
// POST /api/fam-data  { data }  → { ok: true }
//
// Доступ захищений СЕСІЄЮ Google-користувача (Authorization: Bearer <token>),
// яку видає /api/fam-auth.
//
// Весь стан лежить в ОДНОМУ рядку таблиці fam_tasks (id='main', колонка data jsonb).
// Окрема таблиця → НЕ конфліктує з бюджетом, навіть якщо це той самий проєкт / та сама база Neon.
//
// Потрібна змінна середовища:
//   DATABASE_URL  — рядок підключення до Neon (Vercel додає автоматично при під'єднанні Neon).
//   + змінні автентифікації — див. api/_fam-auth.js.

import { neon } from '@neondatabase/serverless';
import { authRequest } from './_fam-auth.js';

const ROW_ID = 'main';

let _ready = null;
function getSql() {
  const conn = process.env.DATABASE_URL;
  if (!conn) throw new Error('Сховище не налаштовано: додайте Neon (DATABASE_URL) і Redeploy.');
  const sql = neon(conn);
  if (!_ready) {
    _ready = sql`
      CREATE TABLE IF NOT EXISTS fam_tasks (
        id         text PRIMARY KEY,
        data       jsonb,
        updated_at timestamptz NOT NULL DEFAULT now()
      )
    `;
  }
  return { sql, ready: _ready };
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();

  // Автентифікація: валідна сесія Google-користувача.
  if (!authRequest(req)) return res.status(401).json({ error: 'unauthorized' });

  let sql, ready;
  try { ({ sql, ready } = getSql()); }
  catch (e) { return res.status(500).json({ error: String((e && e.message) || e) }); }

  try {
    await ready;

    if (req.method === 'GET') {
      const rows = await sql`SELECT data FROM fam_tasks WHERE id = ${ROW_ID}`;
      const data = rows.length ? rows[0].data : null;
      res.setHeader('Cache-Control', 'no-store');
      return res.status(200).json({ data: data ?? null });
    }

    if (req.method === 'POST') {
      let body = req.body;
      if (typeof body === 'string') { try { body = JSON.parse(body); } catch (e) { body = {}; } }
      body = body || {};
      if (!body.data || typeof body.data !== 'object') return res.status(400).json({ error: 'no data' });
      await sql`
        INSERT INTO fam_tasks (id, data, updated_at)
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
