// api/presence.js — «хто зараз на сайті» (живі сесії родини).
//
// POST /api/presence  { name?, picture? }  → пульс: оновлює last_seen для
//      e-mail з сесії та повертає { users: [{email,name,picture,lastSeen}] }
//      — усіх, кого бачили за останні ACTIVE_SEC секунд.
// GET  /api/presence  → той самий список без оновлення власного пульсу.
//
// Захищено серверною сесією (Authorization: Bearer <token>) — як /api/data.
// Зберігається в тій самій базі Neon (таблиця presence). Жодних бюджетних
// даних не торкається.
//
// Потрібні env: DATABASE_URL (+ автентифікація, див. _auth.js).

import { neon } from '@neondatabase/serverless';
import { authRequest } from './_auth.js';

const ACTIVE_SEC = 65; // користувач вважається «онлайн», якщо пульс був протягом цього часу

let _ready = null;
function getSql() {
  const conn = process.env.DATABASE_URL;
  if (!conn) throw new Error('Сховище не налаштовано: додайте Neon (DATABASE_URL) і Redeploy.');
  const sql = neon(conn);
  if (!_ready) {
    _ready = sql`
      CREATE TABLE IF NOT EXISTS presence (
        email      text PRIMARY KEY,
        name       text,
        picture    text,
        last_seen  timestamptz NOT NULL DEFAULT now()
      )
    `;
  }
  return { sql, ready: _ready };
}

async function activeUsers(sql) {
  const rows = await sql`
    SELECT email, name, picture, last_seen
    FROM presence
    WHERE last_seen > now() - (${ACTIVE_SEC} * interval '1 second')
    ORDER BY last_seen DESC
  `;
  return rows.map((r) => ({
    email: r.email,
    name: r.name || '',
    picture: r.picture || '',
    lastSeen: r.last_seen,
  }));
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const session = authRequest(req);
  if (!session) return res.status(401).json({ error: 'unauthorized' });

  let sql, ready;
  try { ({ sql, ready } = getSql()); }
  catch (e) { return res.status(500).json({ error: String((e && e.message) || e) }); }

  try {
    await ready;
    res.setHeader('Cache-Control', 'no-store');

    if (req.method === 'POST') {
      let body = req.body;
      if (typeof body === 'string') { try { body = JSON.parse(body); } catch (e) { body = {}; } }
      body = body || {};
      const email = String(session.email).toLowerCase();
      const name = (typeof body.name === 'string' ? body.name : '').slice(0, 120);
      const picture = (typeof body.picture === 'string' ? body.picture : '').slice(0, 500);
      await sql`
        INSERT INTO presence (email, name, picture, last_seen)
        VALUES (${email}, ${name}, ${picture}, now())
        ON CONFLICT (email) DO UPDATE
          SET name = EXCLUDED.name, picture = EXCLUDED.picture, last_seen = now()
      `;
      return res.status(200).json({ users: await activeUsers(sql) });
    }

    if (req.method === 'GET') {
      return res.status(200).json({ users: await activeUsers(sql) });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (e) {
    return res.status(500).json({ error: String((e && e.message) || e) });
  }
}
