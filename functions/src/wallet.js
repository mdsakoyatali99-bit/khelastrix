'use strict';
const { onCall } = require('firebase-functions/v2/https');
const { admin, db, HttpsError, REGION, ENFORCE_APPCHECK, requireAuth, requireAdmin, rateLimit, now, money, mutateWallet, logTx, audit, str, num } = require('./util');

const opts = { region: REGION, enforceAppCheck: ENFORCE_APPCHECK };
const BD_MOBILE = /^01[3-9]\d{8}$/;

async function assertNotBanned(uid) {
  if ((await db.ref(`users/${uid}/banned`).get()).val() === true) throw new HttpsError('permission-denied', 'This account is suspended.');
}

exports.requestWithdraw = onCall(opts, async (req) => {
  const uid = requireAuth(req);
  await assertNotBanned(uid);
  await rateLimit(`wd_${uid}`, 5, 3600);
  const cfg = (await db.ref('config/public').get()).val() || {};
  const min = Number(cfg.minWithdraw) || 100;
  const amount = money(num(req.data && req.data.amount, { min, max: 25000, name: 'Amount' }));
  const method = str(req.data.method, { name: 'Method' }).toLowerCase();
  if (!['bkash', 'nagad', 'rocket'].includes(method)) throw new HttpsError('invalid-argument', 'Unknown payout method.');
  const number = str(req.data.number, { re: BD_MOBILE, name: 'Mobile number' });

  const user = (await db.ref(`users/${uid}`).get()).val() || {};
  const otpCfg = (await db.ref('config/private/otp').get()).val() || {};
  if (otpCfg.enabled !== false && !user.phoneVerified) throw new HttpsError('failed-precondition', 'Verify your phone number before withdrawing.');

  await mutateWallet(uid, (d, w) => ({ deposit: d, winning: w - amount })); // winnings only
  const id = db.ref('withdraw_requests').push().key;
  const rec = { uid, name: user.username || '', amount, method, number, status: 'pending', ts: now() };
  await db.ref(`withdraw_requests/${id}`).set(rec);
  await db.ref(`my_withdrawals/${uid}/${id}`).set(rec);
  await logTx(uid, { type: 'Withdraw Request', wallet: 'winning', amount: -amount, status: 'pending', ref: id });
  return { id };
});

exports.adminProcessWithdraw = onCall(opts, async (req) => {
  const adminUid = await requireAdmin(req);
  const id = str(req.data && req.data.id, { min: 5, max: 40, re: /^[-\w]+$/, name: 'Request id' });
  const approve = req.data.approve === true;
  const ref = db.ref(`withdraw_requests/${id}`);
  const res = await ref.transaction((r) => {
    if (r === null) return null;
    if (r.status !== 'pending') return;
    r.status = approve ? 'approved' : 'rejected';
    r.processedAt = now(); r.processedBy = adminUid;
    return r;
  });
  if (!res.snapshot.exists()) throw new HttpsError('not-found', 'Request not found.');
  if (!res.committed) throw new HttpsError('already-exists', 'Request already processed.');
  const r = res.snapshot.val();
  if (!approve) {
    await mutateWallet(r.uid, (d, w) => ({ deposit: d, winning: w + r.amount }));
    await logTx(r.uid, { type: 'Withdraw Refund', wallet: 'winning', amount: r.amount, ref: id });
  } else {
    await logTx(r.uid, { type: 'Withdraw Paid', wallet: 'winning', amount: 0, ref: id, note: `${r.method} ${r.number}` });
  }
  await db.ref(`my_withdrawals/${r.uid}/${id}`).update({ status: r.status, processedAt: r.processedAt });
  await audit(adminUid, approve ? 'withdraw_approve' : 'withdraw_reject', id, { uid: r.uid, amount: r.amount });
  return { status: r.status };
});

exports.adminAdjustBalance = onCall(opts, async (req) => {
  const adminUid = await requireAdmin(req);
  const uid = str(req.data && req.data.uid, { min: 6, max: 128, re: /^[-\w]+$/, name: 'User id' });
  const wallet = req.data.wallet === 'winning' ? 'winning' : 'deposit';
  const delta = money(num(req.data.delta, { min: -100000, max: 100000, name: 'Amount' }));
  const reason = str(req.data.reason, { min: 3, max: 120, name: 'Reason' });
  if (delta === 0) throw new HttpsError('invalid-argument', 'Amount cannot be zero.');
  const out = await mutateWallet(uid, (d, w) => (wallet === 'deposit' ? { deposit: d + delta, winning: w } : { deposit: d, winning: w + delta }));
  await logTx(uid, { type: 'Admin Adjustment', wallet, amount: delta, note: reason });
  await audit(adminUid, 'adjust_balance', uid, { wallet, delta, reason });
  return out;
});

exports.adminSetBan = onCall(opts, async (req) => {
  const adminUid = await requireAdmin(req);
  const uid = str(req.data && req.data.uid, { min: 6, max: 128, re: /^[-\w]+$/, name: 'User id' });
  const banned = req.data.banned === true;
  await db.ref(`users/${uid}/banned`).set(banned);
  await admin.auth().updateUser(uid, { disabled: banned });
  if (banned) await admin.auth().revokeRefreshTokens(uid);
  await audit(adminUid, banned ? 'ban_user' : 'unban_user', uid);
  return { ok: true };
});

exports.assertNotBanned = assertNotBanned;
