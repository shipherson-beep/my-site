// api/check-limits.js — щоденна перевірка лімітів і email-сповіщення через Resend.
//
// Викликається автоматично за розкладом (Vercel Cron, див. vercel.json),
// або вручну для тесту:  GET /api/check-limits?key=<AUTH_SECRET>[&force=1]
//
// Що робить:
//   1. читає весь бюджет із Neon (рядок budget.id='main', той самий, що й /api/data);
//   2. рахує витрати ПОТОЧНОГО місяця по категоріях з лімітом
//      (Продукти, Їжа поза домом, Благодійність/Подарунки, Особисті витрати);
//   3. якщо категорія перетнула 80% (попередження) або 100% (перевитрата) ліміту —
//      шле один лист на адреси отримувачів;
//   4. кожен рівень (80% / 100%) для кожної категорії спрацьовує МАКСИМУМ раз на місяць
//      (стан тримається в рядку budget.id='notified:<YYYY-MM>').
//
// Потрібні змінні середовища у Vercel:
//   DATABASE_URL                            — підключення до Neon (сховище)
//   RESEND_API_KEY                          — ключ Resend (обовʼязково)
//   NOTIFY_FROM      (необовʼязково)        — відправник, дефолт "onboarding@resend.dev"
//   NOTIFY_EMAILS    (необовʼязково)        — отримувачі через кому, дефолт нижче
//   CRON_SECRET      (необовʼязково)        — Vercel сам шле його в Authorization для cron

import { neon } from '@neondatabase/serverless';

const ROW_ID = 'main';

// Категорії з лімітом: id у даних → людська назва + ключ ліміту в config.limits
const LIMIT_CATS = [
  { id: 'products',  name: 'Продукти',                 limitKey: 'products' },
  { id: 'eatingOut', name: 'Їжа поза домом',           limitKey: 'eatingOut' },
  { id: 'charity',   name: 'Благодійність / Подарунки', limitKey: 'charity' },
  { id: 'personal',  name: 'Особисті витрати',         limitKey: 'personal' },
];

const WARN_PCT = 80;   // поріг попередження
const OVER_PCT = 100;  // поріг перевитрати

const DEFAULT_EMAILS = ['ship.her.son@gmail.com', 'shiferson.julia@gmail.com'];

const pnum = (v) => { const n = parseFloat(v); return isNaN(n) ? 0 : n; };
const fmt = (n) => new Intl.NumberFormat('uk-UA', { maximumFractionDigits: 0 }).format(Math.round(n));

// Ключ поточного місяця за київським часом
function monthKey() {
  const now = new Date();
  const kyiv = new Date(now.toLocaleString('en-US', { timeZone: 'Europe/Kyiv' }));
  return kyiv.getFullYear() + '-' + String(kyiv.getMonth() + 1).padStart(2, '0');
}

// Сума по категорії за місяць (та сама логіка, що в застосунку)
function catTotal(month, catId) {
  let t = 0;
  if (month && month.days) {
    for (const day in month.days) {
      const arr = month.days[day][catId];
      if (arr) for (const r of arr) t += pnum(r.amount);
    }
  }
  return t;
}

export default async function handler(req, res) {
  const conn = process.env.DATABASE_URL;
  if (!conn) {
    return res.status(500).json({ error: 'Сховище не налаштовано (DATABASE_URL).' });
  }

  // Захист: cron від Vercel надсилає Authorization: Bearer <CRON_SECRET>.
  // Для ручного виклику дозволяємо ?key=<AUTH_SECRET>.
  const cronSecret = process.env.CRON_SECRET;
  const authedAsCron = cronSecret && req.headers.authorization === 'Bearer ' + cronSecret;
  const authSecret = process.env.AUTH_SECRET;
  const authedManually = authSecret && (req.query && req.query.key) === authSecret;
  if (!authedAsCron && !authedManually) {
    return res.status(401).json({ error: 'unauthorized' });
  }

  const sql = neon(conn);

  try {
    await sql`CREATE TABLE IF NOT EXISTS budget (id text PRIMARY KEY, data jsonb, updated_at timestamptz NOT NULL DEFAULT now())`;
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) return res.status(500).json({ error: 'RESEND_API_KEY не задано.' });

    const force = !!(req.query && req.query.force); // ?force=1 — ігнорувати анти-спам (для тесту)
    const from = process.env.NOTIFY_FROM || 'Сімейний бюджет <onboarding@resend.dev>';
    const emails = (process.env.NOTIFY_EMAILS
      ? process.env.NOTIFY_EMAILS.split(',').map((s) => s.trim()).filter(Boolean)
      : DEFAULT_EMAILS);

    // 1. дані
    const dataRows = await sql`SELECT data FROM budget WHERE id = ${ROW_ID}`;
    const data = dataRows.length ? dataRows[0].data : null;
    if (!data || !data.config) return res.status(200).json({ ok: true, note: 'немає даних' });

    const mKey = monthKey();
    const month = (data.months && data.months[mKey]) || null;
    const limits = (data.config.limits) || {};

    // 2+3. знаходимо категорії, що перетнули поріг і ще не сповіщені на цьому рівні
    const notifKey = 'notified:' + mKey;
    let notified = {};
    if (!force) {
      const nrows = await sql`SELECT data FROM budget WHERE id = ${notifKey}`;
      if (nrows.length && nrows[0].data) notified = nrows[0].data || {};
    }

    const triggered = [];
    for (const c of LIMIT_CATS) {
      const lim = pnum(limits[c.limitKey]);
      if (lim <= 0) continue; // ліміт не заданий — пропускаємо
      const spent = catTotal(month, c.id);
      const pct = Math.round((spent / lim) * 100);
      let tier = 0;
      if (pct >= OVER_PCT) tier = OVER_PCT;
      else if (pct >= WARN_PCT) tier = WARN_PCT;
      if (tier === 0) continue;
      if (!force && (notified[c.id] || 0) >= tier) continue; // вже сповіщали на цьому/вищому рівні
      triggered.push({ name: c.name, spent, lim, pct, over: tier === OVER_PCT });
      notified[c.id] = tier;
    }

    if (!triggered.length) {
      return res.status(200).json({ ok: true, month: mKey, sent: false, note: 'жодна категорія не перетнула поріг' });
    }

    // 4. лист
    const monthNames = ['січень','лютий','березень','квітень','травень','червень','липень','серпень','вересень','жовтень','листопад','грудень'];
    const moLabel = monthNames[parseInt(mKey.split('-')[1], 10) - 1] + ' ' + mKey.split('-')[0];
    const anyOver = triggered.some((t) => t.over);

    const rows = triggered.map((t) => {
      const color = t.over ? '#d9342b' : '#c77700';
      const tag = t.over ? 'перевитрата' : 'близько до ліміту';
      const barW = Math.min(100, t.pct);
      return `
        <tr>
          <td style="padding:14px 0 4px;font:600 16px -apple-system,Segoe UI,Roboto,sans-serif;color:#1d1d1f">${t.name}</td>
          <td style="padding:14px 0 4px;text-align:right;font:600 15px -apple-system,Segoe UI,Roboto,sans-serif;color:${color};white-space:nowrap">${t.pct}% · ${tag}</td>
        </tr>
        <tr><td colspan="2" style="padding:0 0 4px;font:400 13px -apple-system,Segoe UI,Roboto,sans-serif;color:#6e6e73">${fmt(t.spent)} ₴ із ${fmt(t.lim)} ₴</td></tr>
        <tr><td colspan="2" style="padding:0 0 14px"><div style="height:7px;background:#ececed;border-radius:99px;overflow:hidden"><div style="height:100%;width:${barW}%;background:${color};border-radius:99px"></div></div></td></tr>`;
    }).join('');

    const html = `<!doctype html><html><body style="margin:0;background:#f5f5f7;padding:28px 0">
      <div style="max-width:480px;margin:0 auto;background:#fff;border-radius:18px;overflow:hidden;border:1px solid rgba(0,0,0,.06)">
        <div style="padding:22px 26px;border-bottom:1px solid rgba(0,0,0,.06)">
          <div style="font:700 19px -apple-system,Segoe UI,Roboto,sans-serif;color:#1d1d1f;letter-spacing:-.01em">${anyOver ? 'Перевитрата по бюджету' : 'Категорії підходять до ліміту'}</div>
          <div style="font:400 13px -apple-system,Segoe UI,Roboto,sans-serif;color:#86868b;margin-top:3px">Сімейний бюджет · ${moLabel}</div>
        </div>
        <div style="padding:8px 26px 18px">
          <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse">${rows}</table>
        </div>
        <div style="padding:14px 26px 22px;border-top:1px solid rgba(0,0,0,.06)">
          <a href="https://shipherson.com/budget/" style="display:inline-block;background:#1d1d1f;color:#fff;text-decoration:none;font:600 14px -apple-system,Segoe UI,Roboto,sans-serif;padding:11px 20px;border-radius:11px">Відкрити бюджет →</a>
        </div>
      </div>
      <div style="max-width:480px;margin:14px auto 0;text-align:center;font:400 11px -apple-system,Segoe UI,Roboto,sans-serif;color:#aeaeb2">Поріг сповіщення — ${WARN_PCT}%. Лист надсилається автоматично раз на день за потреби.</div>
    </body></html>`;

    const subject = (anyOver ? '🔴 Перевитрата' : '🟠 Близько до ліміту') +
      ': ' + triggered.map((t) => t.name).join(', ') + ' — ' + moLabel;

    const sendRes = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from, to: emails, subject, html }),
    });
    const sendJson = await sendRes.json().catch(() => null);
    if (!sendRes.ok) {
      return res.status(502).json({ error: 'Resend: ' + ((sendJson && (sendJson.message || sendJson.error)) || sendRes.status) });
    }

    // зберігаємо стан сповіщень, щоб не дублювати в межах місяця
    if (!force) {
      await sql`
        INSERT INTO budget (id, data, updated_at)
        VALUES (${notifKey}, ${notified}, now())
        ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data, updated_at = now()
      `;
    }

    return res.status(200).json({ ok: true, month: mKey, sent: true, to: emails, categories: triggered.map((t) => ({ name: t.name, pct: t.pct })) });
  } catch (e) {
    return res.status(500).json({ error: String((e && e.message) || e) });
  }
}
