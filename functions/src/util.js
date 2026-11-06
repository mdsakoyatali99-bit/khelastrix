'use strict';
const admin = require('firebase-admin');
const crypto = require('crypto');
const { HttpsError } = require('firebase-functions/v2/https');
const { defineBoolean, defineSecret, defineString } = require('firebase-functions/params');

if (!admin.apps.length) admin.initializeApp({ databaseURL: 'https://ludofire-arena-default-rtdb.firebaseio.com' });
const db = admin.database();

const REGION = 'asia-southeast1';
const ENFORCE_APPCHECK = defineBoolean('ENFORCE_APPCHECK', { default: false });
const SECRETS = {
  SMS_API_KEY: defineSecret('SMS_API_KEY'),
  OTP_PEPPER: defineSecret('OTP_PEPPER'),
  GAME_TOKEN_SECRET: defineSecret('GAME_TOKEN_SECRET'),
};
const PARAMS = {
  SMS_MODE: defineString('SMS_MODE', { default: 'dev' }), // dev | live
  SMS_API_URL: defineString('SMS_API_URL', { default: '' }),
  SMS_SENDER_ID: defineString('SMS_SENDER_ID', { default: 'Khelastrix' }),
};

const sha256 = (s) => crypto.createHash('sha256').update(String(s)).digest('hex');
const now = () => Date.now();
const money = (n) => Math.round(Number(n) * 100) / 100;
const dayKey = (t = now()) => new Date(t + 6 * 3600e3).toISOString().slice(0, 10); // Asia/Dhaka (UTC+6)

function ipOf(req) {
  const raw = req.rawRequest || req;
  const xf = (raw.headers && raw.headers['x-forwarded-for']) || '';
  return (String(xf).split(',')[0] || raw.ip || '').trim() || 'unknown';
}
function requireAuth(req) {
  if (!req.auth) throw new HttpsError('unauthenticated', 'Sign in required.');
  return req.auth.uid;
}
/** Admin = custom claim AND an unlocked server-side admin session (second factor with lockout). */
async function requireAdmin(req) {
  const uid = requireAuth(req);
  if (req.auth.token.admin !== true) throw new HttpsError('permission-denied', 'Admin only.');
  const until = (await db.ref(`adminSessions/${uid}/until`).get()).val();
  if (!until || until < now()) throw new HttpsError('permission-denied', 'Admin session locked. Unlock first.');
  return uid;
}
/** Fixed-window limiter backed by RTDB. Throws resource-exhausted when exceeded. */
async function rateLimit(key, max, windowSec) {
  const ref = db.ref(`rate/${sha256(key).slice(0, 32)}`);
  const t = now();
  const res = await ref.transaction((cur) => {
    if (!cur || cur.resetAt <= t) return { n: 1, resetAt: t + windowSec * 1000 };
    if (cur.n >= max) return; // abort
    return { n: cur.n + 1, resetAt: cur.resetAt };
  });
  if (!res.committed) throw new HttpsError('resource-exhausted', 'Too many requests. Please wait a moment and try again.');
}
const audit = (actor, action, target, detail) =>
  db.ref('audit').push({ ts: now(), actor, action, target: target || null, detail: detail || null });

/**
 * Atomic wallet mutation. mutator(deposit, winning) -> {deposit, winning} | null (abort).
 * Returns the new balances.
 */
async function mutateWallet(uid, mutator) {
  const ref = db.ref(`users/${uid}`);
  let out = null;
  const res = await ref.transaction((u) => {
    if (u === null) return null; // cache miss or missing user; SDK retries with real value
    const r = mutator(Number(u.deposit) || 0, Number(u.winning) || 0, u);
    if (!r) return; // abort
    if (r.deposit < 0 || r.winning < 0) return;
    u.deposit = money(r.deposit);
    u.winning = money(r.winning);
    out = { deposit: u.deposit, winning: u.winning };
    return u;
  });
  if (!res.snapshot.exists()) throw new HttpsError('not-found', 'User not found.');
  if (!res.committed || !out) throw new HttpsError('failed-precondition', 'Insufficient balance.');
  return out;
}
const logTx = (uid, rec) => db.ref(`transactions/${uid}`).push({ ts: now(), status: 'success', ...rec });

function str(v, { min = 0, max = 200, re, name = 'field' } = {}) {
  if (typeof v !== 'string') throw new HttpsError('invalid-argument', `${name} must be text.`);
  const s = v.trim();
  if (s.length < min || s.length > max || (re && !re.test(s))) throw new HttpsError('invalid-argument', `${name} is invalid.`);
  return s;
}
function num(v, { min = 0, max = 1e7, name = 'number' } = {}) {
  const n = Number(v);
  if (!Number.isFinite(n) || n < min || n > max) throw new HttpsError('invalid-argument', `${name} is invalid.`);
  return n;
}

module.exports = {
  admin, db, HttpsError, REGION, ENFORCE_APPCHECK, SECRETS, PARAMS,
  sha256, now, money, dayKey, ipOf, requireAuth, requireAdmin, rateLimit, audit, mutateWallet, logTx, str, num,
};
