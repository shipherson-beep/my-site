// api/_fam-auth.js — спільна бібліотека автентифікації для застосунку «Лад» (/fam).
// Файл починається з підкреслення → Vercel НЕ робить із нього HTTP-роут (це бібліотека).
//
// Модель доступу (та сама, що в бюджеті):
//   1. Клієнт входить через Google → отримує Google ID-токен.
//   2. POST /api/fam-auth { credential } → сервер перевіряє токен у Google,
//      звіряє email зі списком дозволених і видає власну СЕСІЮ —
//      підписаний HMAC-токен на 30 днів.
//   3. /api/fam-data, /api/fam-parse і /api/fam-presence приймають цю сесію
//      в заголовку Authorization: Bearer <token>.
//
// Змінні середовища (Vercel → Settings → Environment Variables):
//   AUTH_SECRET         — довгий випадковий рядок (підпис сесій). ОБОВ'ЯЗКОВО.
//   GOOGLE_CLIENT_ID    — той самий Client ID, що в застосунку (перевірка aud). Рекомендовано.
//   FAM_ALLOWED_EMAILS  — дозволені акаунти через кому. Необов'язково (є дефолт).

import crypto from 'node:crypto';

const DEFAULT_EMAILS = ['ship.her.son@gmail.com', 'shiferson.julia@gmail.com'];
const SESSION_TTL = 30 * 24 * 3600; // секунд

export function allowedEmails() {
  const env = process.env.FAM_ALLOWED_EMAILS;
  const list = env ? env.split(',') : DEFAULT_EMAILS;
  return list.map((e) => String(e).trim().toLowerCase()).filter(Boolean);
}

function b64url(buf) {
  return Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function b64urlJson(obj) { return b64url(JSON.stringify(obj)); }
function fromB64url(s) { return Buffer.from(String(s).replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8'); }

export function signSession(payload, secret) {
  const body = b64urlJson(payload);
  const sig = b64url(crypto.createHmac('sha256', secret).update(body).digest());
  return body + '.' + sig;
}

export function verifySession(token, secret) {
  if (!secret || !token || typeof token !== 'string' || token.indexOf('.') < 0) return null;
  const i = token.indexOf('.');
  const body = token.slice(0, i);
  const sig = token.slice(i + 1);
  const expected = b64url(crypto.createHmac('sha256', secret).update(body).digest());
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  let payload;
  try { payload = JSON.parse(fromB64url(body)); } catch (e) { return null; }
  if (!payload || !payload.exp || payload.exp < Math.floor(Date.now() / 1000)) return null;
  if (!payload.email || allowedEmails().indexOf(String(payload.email).toLowerCase()) === -1) return null;
  return payload;
}

export function newSession(email) {
  const secret = process.env.AUTH_SECRET;
  if (!secret) return null;
  const exp = Math.floor(Date.now() / 1000) + SESSION_TTL;
  return signSession({ email: String(email).toLowerCase(), exp }, secret);
}

function bearer(req) {
  const h = (req.headers && (req.headers.authorization || req.headers.Authorization)) || '';
  return h.startsWith('Bearer ') ? h.slice(7).trim() : '';
}

// Повертає payload {email, exp} або null.
export function authRequest(req) {
  return verifySession(bearer(req), process.env.AUTH_SECRET);
}

// Перевірка Google ID-токена через офіційний endpoint Google (без зовнішніх бібліотек).
export async function verifyGoogleIdToken(idToken) {
  if (!idToken) return null;
  let claims;
  try {
    const r = await fetch('https://oauth2.googleapis.com/tokeninfo?id_token=' + encodeURIComponent(idToken));
    if (!r.ok) return null;
    claims = await r.json();
  } catch (e) { return null; }
  if (!claims || claims.error) return null;
  const cid = process.env.GOOGLE_CLIENT_ID;
  if (cid && claims.aud !== cid) return null;
  if (claims.email_verified !== true && claims.email_verified !== 'true') return null;
  const email = String(claims.email || '').toLowerCase();
  if (!email || allowedEmails().indexOf(email) === -1) return null;
  return { email, name: claims.name || '', picture: claims.picture || '' };
}
