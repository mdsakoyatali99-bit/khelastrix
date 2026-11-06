'use strict';
// Second-factor admin unlock with server-enforced brute-force lockout.
const crypto = require('crypto');
const { onCall } = require('firebase-functions/v2/https');
const { db, HttpsError, REGION, ENFORCE_APPCHECK, requireAuth, rateLimit, ipOf, sha256, now, audit, str } = require('./util');

const SESSION_MS = 2 * 3600e3;
const MAX_FAILS = 5;
const LOCK_MS = 15 * 60e3;
const opts = { region: REGION, enforceAppCheck: ENFORCE_APPCHECK };

function verifyScrypt(pass, stored) {
  const [salt, hash] = String(stored || '').split(':');
  if (!salt || !hash) return false;
  const calc = crypto.scryptSync(pass, Buffer.from(salt, 'hex'), 64).toString('hex');
  const a = Buffer.from(calc, 'hex'), b = Buffer.from(hash, 'hex');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

exports.adminUnlock = onCall(opts, async (req) => {
  const uid = requireAuth(req);
  if (req.auth.token.admin !== true) throw new HttpsError('permission-denied', 'Not an admin account.');
  const ip = ipOf(req);
  await rateLimit(`unlock_ip_${ip}`, 20, 900);
  const pass = str(req.data && req.data.passphrase, { min: 1, max: 200, name: 'Passphrase' });

  const lockRef = db.ref(`adminLock/${uid}`);
  const lock = (await lockRef.get()).val() || { fails: 0, lockedUntil: 0 };
  if (lock.lockedUntil > now()) {
    throw new HttpsError('resource-exhausted', `Locked. Try again in ${Math.ceil((lock.lockedUntil - now()) / 60000)} min.`);
  }
  const stored = (await db.ref(`adminSecrets/${uid}`).get()).val();
  if (!verifyScrypt(pass, stored)) {
    const fails = (lock.fails || 0) + 1;
    await lockRef.set({ fails: fails >= MAX_FAILS ? 0 : fails, lockedUntil: fails >= MAX_FAILS ? now() + LOCK_MS : 0, lastIp: sha256(ip).slice(0, 12), ts: now() });
    await audit(uid, 'admin_unlock_failed', null, { fails });
    throw new HttpsError('permission-denied', fails >= MAX_FAILS ? 'Too many attempts. Locked for 15 minutes.' : `Wrong passphrase. ${MAX_FAILS - fails} attempts left.`);
  }
  await lockRef.remove();
  await db.ref(`adminSessions/${uid}`).set({ until: now() + SESSION_MS, ts: now() });
  await audit(uid, 'admin_unlock', null, null);
  return { until: now() + SESSION_MS };
});

exports.adminLockSession = onCall(opts, async (req) => {
  const uid = requireAuth(req);
  await db.ref(`adminSessions/${uid}`).remove();
  return { ok: true };
});
exports.verifyScrypt = verifyScrypt;
