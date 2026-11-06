'use strict';
// Reader Keys (SMS phones) and Game Keys (custom Ludo/Carrom servers). Only SHA-256 hashes are stored.
const crypto = require('crypto');
const { onCall } = require('firebase-functions/v2/https');
const { db, HttpsError, REGION, ENFORCE_APPCHECK, requireAdmin, sha256, now, audit, str } = require('./util');

const KINDS = { reader: 'readerKeys', game: 'gameKeys' };
const ALPHA = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const opts = { region: REGION, enforceAppCheck: ENFORCE_APPCHECK };

function newKey() {
  const bytes = crypto.randomBytes(20);
  let k = 'KX';
  for (let i = 0; i < 20; i++) { if (i % 5 === 0) k += '-'; k += ALPHA[bytes[i] % ALPHA.length]; }
  return k; // KX-XXXXX-XXXXX-XXXXX-XXXXX (~100 bits)
}
const path = (kind) => { if (!KINDS[kind]) throw new HttpsError('invalid-argument', 'Unknown key type.'); return KINDS[kind]; };

exports.adminCreateKey = onCall(opts, async (req) => {
  const admin = await requireAdmin(req);
  const p = path(req.data && req.data.kind);
  const name = str(req.data.name, { min: 1, max: 40, name: 'Name' });
  const allowed = req.data.kind === 'reader' ? ['bkash', 'nagad', 'rocket'] : ['ludo', 'carrom'];
  const list = Array.isArray(req.data.scope) ? req.data.scope.filter((m) => allowed.includes(m)) : [];
  const key = newKey();
  const id = sha256(key);
  await db.ref(`${p}/${id}`).set({
    name, active: true, createdAt: now(), lastSeen: 0, hint: key.slice(-5),
    [req.data.kind === 'reader' ? 'methods' : 'games']: list,
  });
  await audit(admin, `create_${req.data.kind}_key`, id.slice(0, 10), { name });
  return { id, key }; // the plain key is shown exactly once
});

exports.adminSetKeyActive = onCall(opts, async (req) => {
  const admin = await requireAdmin(req);
  const p = path(req.data && req.data.kind);
  const id = str(req.data.id, { min: 64, max: 64, re: /^[a-f0-9]+$/, name: 'Key id' });
  await db.ref(`${p}/${id}/active`).set(req.data.active === true);
  await audit(admin, `${req.data.active ? 'enable' : 'disable'}_${req.data.kind}_key`, id.slice(0, 10));
  return { ok: true };
});

exports.adminDeleteKey = onCall(opts, async (req) => {
  const admin = await requireAdmin(req);
  const p = path(req.data && req.data.kind);
  const id = str(req.data.id, { min: 64, max: 64, re: /^[a-f0-9]+$/, name: 'Key id' });
  await db.ref(`${p}/${id}`).remove(); // takes effect on the very next request from that device
  await audit(admin, `delete_${req.data.kind}_key`, id.slice(0, 10));
  return { ok: true };
});
