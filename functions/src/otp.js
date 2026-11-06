'use strict';
// Phone OTP with SMS-bombing protection: per-phone cooldown, per-phone daily cap, per-user and per-IP caps.
const crypto = require('crypto');
const { onCall } = require('firebase-functions/v2/https');
const { db, HttpsError, REGION, ENFORCE_APPCHECK, SECRETS, PARAMS, requireAuth, requireAdmin, rateLimit, ipOf, sha256, now, dayKey, audit, str } = require('./util');

const opts = { region: REGION, enforceAppCheck: ENFORCE_APPCHECK, secrets: [SECRETS.SMS_API_KEY, SECRETS.OTP_PEPPER] };
const DEFAULTS = { enabled: true, cooldownSec: 90, dailyLimit: 5, ipDailyLimit: 20, expirySec: 300, maxAttempts: 5 };

function normPhone(p) {
  const d = String(p || '').replace(/[\s-]/g, '');
  const m = d.match(/^(?:\+?88)?(01[3-9]\d{8})$/);
  if (!m) throw new HttpsError('invalid-argument', 'Enter a valid Bangladeshi mobile number.');
  return '88' + m[1];
}
const mask = (p) => p.slice(0, 5) + '*****' + p.slice(-3);
const hashCode = (phone, code) => sha256(`${phone}:${code}:${SECRETS.OTP_PEPPER.value()}`);

async function sendSms(to, text) {
  if (PARAMS.SMS_MODE.value() !== 'live') { console.log('[SMS dev mode]', to, text); return; }
  const url = new URL(PARAMS.SMS_API_URL.value());
  // Generic GET gateway (BulkSMSBD-style). Adapt parameter names to your provider.
  url.searchParams.set('api_key', SECRETS.SMS_API_KEY.value());
  url.searchParams.set('type', 'text');
  url.searchParams.set('number', to);
  url.searchParams.set('senderid', PARAMS.SMS_SENDER_ID.value());
  url.searchParams.set('message', text);
  const r = await fetch(url, { signal: AbortSignal.timeout(10000) });
  if (!r.ok) throw new Error('SMS gateway HTTP ' + r.status);
}

exports.requestOtp = onCall(opts, async (req) => {
  const uid = requireAuth(req);
  const phone = normPhone(req.data && req.data.phone);
  const ip = ipOf(req);
  const cfg = { ...DEFAULTS, ...((await db.ref('config/private/otp').get()).val() || {}) };
  if (!cfg.enabled) throw new HttpsError('failed-precondition', 'Phone verification is temporarily unavailable.');
  await rateLimit(`otp_uid_${uid}`, 6, 3600);
  await rateLimit(`otp_ip_${ip}`, cfg.ipDailyLimit, 86400);

  const taken = (await db.ref(`phone_index/${phone}`).get()).val();
  if (taken && taken !== uid) throw new HttpsError('already-exists', 'This number is linked to another account.');

  const code = String(crypto.randomInt(100000, 1000000));
  const t = now(), today = dayKey(t);
  let wait = 0, capped = false;
  const st = await db.ref(`otp_state/${phone}`).transaction((s) => {
    s = s || { day: today, count: 0, lastSentAt: 0 };
    if (s.day !== today) { s.day = today; s.count = 0; }
    if (t - s.lastSentAt < cfg.cooldownSec * 1000) { wait = Math.ceil((cfg.cooldownSec * 1000 - (t - s.lastSentAt)) / 1000); return; }
    if (s.count >= cfg.dailyLimit) { capped = true; return; }
    return { day: s.day, count: s.count + 1, lastSentAt: t, codeHash: hashCode(phone, code), expiresAt: t + cfg.expirySec * 1000, attempts: 0 };
  });
  if (!st.committed) {
    const msg = capped ? 'Daily OTP limit reached for this number. Try again tomorrow.' : `Please wait ${wait || cfg.cooldownSec}s before requesting another code.`;
    await db.ref('otp_log').push({ ts: t, phone: mask(phone), uid, status: capped ? 'blocked_daily' : 'blocked_cooldown' });
    throw new HttpsError('resource-exhausted', msg);
  }
  try {
    await sendSms(phone, `Khelastrix code: ${code}. Valid ${Math.round(cfg.expirySec / 60)} min. Never share it.`);
  } catch (e) {
    console.error('sms send failed', e.message);
    await db.ref('otp_log').push({ ts: t, phone: mask(phone), uid, status: 'send_failed' });
    throw new HttpsError('unavailable', 'Could not send the SMS. Try again shortly.');
  }
  await db.ref('otp_log').push({ ts: t, phone: mask(phone), uid, status: 'sent' });
  return { cooldownSec: cfg.cooldownSec };
});

exports.verifyOtp = onCall(opts, async (req) => {
  const uid = requireAuth(req);
  const phone = normPhone(req.data && req.data.phone);
  const code = str(String(req.data && req.data.code || ''), { re: /^\d{6}$/, name: 'Code' });
  await rateLimit(`otpv_${uid}`, 15, 3600);
  const ref = db.ref(`otp_state/${phone}`);
  const cfg = { ...DEFAULTS, ...((await db.ref('config/private/otp').get()).val() || {}) };
  let state = null;
  const res = await ref.transaction((s) => {
    if (!s || !s.codeHash) return;
    if (s.attempts >= cfg.maxAttempts) return;
    s.attempts += 1; state = { ...s }; return s;
  });
  if (!res.committed || !state) throw new HttpsError('failed-precondition', 'No active code. Request a new one.');
  if (state.expiresAt < now()) throw new HttpsError('deadline-exceeded', 'Code expired. Request a new one.');
  const a = Buffer.from(state.codeHash), b = Buffer.from(hashCode(phone, code));
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) throw new HttpsError('permission-denied', `Wrong code. ${Math.max(0, cfg.maxAttempts - state.attempts)} attempts left.`);

  const own = await db.ref(`phone_index/${phone}`).transaction((c) => (c && c !== uid ? undefined : uid));
  if (!own.committed) throw new HttpsError('already-exists', 'This number is linked to another account.');
  await db.ref(`users/${uid}`).update({ phone, phoneVerified: true });
  await ref.update({ codeHash: null, expiresAt: 0 });
  return { ok: true };
});

exports.adminOtpTest = onCall(opts, async (req) => {
  const adminUid = await requireAdmin(req);
  const phone = normPhone(req.data && req.data.phone);
  await rateLimit(`otp_test_${adminUid}`, 5, 3600);
  await sendSms(phone, 'Khelastrix SMS gateway test: OK');
  await audit(adminUid, 'sms_gateway_test', mask(phone));
  return { ok: true, mode: PARAMS.SMS_MODE.value() };
});

exports.adminSaveOtpConfig = onCall({ region: REGION, enforceAppCheck: ENFORCE_APPCHECK }, async (req) => {
  const adminUid = await requireAdmin(req);
  const d = req.data || {};
  const clamp = (v, lo, hi, def) => { const n = Number(v); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, Math.round(n))) : def; };
  const cfg = {
    enabled: d.enabled !== false,
    cooldownSec: clamp(d.cooldownSec, 30, 600, 90),
    dailyLimit: clamp(d.dailyLimit, 1, 20, 5),
    ipDailyLimit: clamp(d.ipDailyLimit, 1, 200, 20),
    expirySec: clamp(d.expirySec, 60, 900, 300),
    maxAttempts: clamp(d.maxAttempts, 3, 10, 5),
  };
  await db.ref('config/private/otp').set(cfg);
  await audit(adminUid, 'save_otp_config', null, cfg);
  return cfg;
});
