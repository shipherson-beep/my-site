// api/auth.js — обмін Google ID-токена на серверну сесію.
//
// POST /api/auth  { credential: "<Google ID token>" }
//   → 200 { token, email, name, picture }   (token — сесія на 30 днів)
//   → 401 якщо акаунт не дозволений або токен недійсний
//
// Див. api/_auth.js щодо потрібних змінних середовища (AUTH_SECRET тощо).

import { verifyGoogleIdToken, newSession } from './_auth.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  if (!process.env.AUTH_SECRET) {
    return res.status(500).json({ error: 'AUTH_SECRET не налаштовано на сервері.' });
  }

  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch (e) { body = {}; } }
  body = body || {};

  const claims = await verifyGoogleIdToken(body.credential);
  if (!claims) return res.status(401).json({ error: 'Акаунт не має доступу або токен недійсний.' });

  const token = newSession(claims.email);
  if (!token) return res.status(500).json({ error: 'Не вдалося створити сесію.' });

  res.setHeader('Cache-Control', 'no-store');
  return res.status(200).json({ token, email: claims.email, name: claims.name, picture: claims.picture });
}
