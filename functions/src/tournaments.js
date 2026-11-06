'use strict';
const { onCall } = require('firebase-functions/v2/https');
const { db, HttpsError, REGION, ENFORCE_APPCHECK, requireAuth, requireAdmin, rateLimit, now, money, mutateWallet, logTx, audit, str, num } = require('./util');
const { assertNotBanned } = require('./wallet');
const { settleCore } = require('./games');

const opts = { region: REGION, enforceAppCheck: ENFORCE_APPCHECK };
const MODES = { '1v1': 2, '2v2': 4, '4p': 4 };
const GAMES = ['ludo', 'carrom'];

exports.joinTournament = onCall(opts, async (req) => {
  const uid = requireAuth(req);
  await assertNotBanned(uid);
  await rateLimit(`join_${uid}`, 10, 60);
  const tid = str(req.data && req.data.tid, { min: 5, max: 40, re: /^[-\w]+$/, name: 'Tournament' });
  const tRef = db.ref(`tournaments/${tid}`);
  const t = (await tRef.get()).val();
  if (!t) throw new HttpsError('not-found', 'Tournament not found.');
  if (t.status !== 'upcoming') throw new HttpsError('failed-precondition', 'Registration is closed.');
  const user = (await db.ref(`users/${uid}`).get()).val() || {};

  // 1) one seat per user
  const pRef = db.ref(`participants/${tid}/${uid}`);
  const p = await pRef.transaction((c) => (c ? undefined : { name: user.username || 'Player', joinedAt: now() }));
  if (!p.committed) throw new HttpsError('already-exists', 'You have already joined.');
  // 2) reserve a slot atomically
  const slot = await tRef.child('joined').transaction((n) => ((n || 0) < t.slots ? (n || 0) + 1 : undefined));
  if (!slot.committed) { await pRef.remove(); throw new HttpsError('resource-exhausted', 'Tournament is full.'); }
  // 3) charge the entry fee (deposit first, then winnings)
  try {
    if (t.entryFee > 0) {
      let fromDep = 0, fromWin = 0;
      await mutateWallet(uid, (d, w) => {
        if (d + w < t.entryFee) return null;
        fromDep = Math.min(d, t.entryFee); fromWin = money(t.entryFee - fromDep);
        return { deposit: d - fromDep, winning: w - fromWin };
      });
      await pRef.update({ paid: t.entryFee, fromDeposit: fromDep, fromWinning: fromWin });
      await logTx(uid, { type: 'Tournament Entry', wallet: 'mixed', amount: -t.entryFee, ref: tid, note: t.title });
    }
  } catch (e) {
    await pRef.remove();
    await tRef.child('joined').transaction((n) => Math.max(0, (n || 1) - 1));
    throw e;
  }
  return { ok: true };
});

exports.adminSaveTournament = onCall(opts, async (req) => {
  const adminUid = await requireAdmin(req);
  const d = req.data || {};
  const title = str(d.title, { min: 3, max: 60, name: 'Title' });
  const game = str(d.game, { name: 'Game' });
  const mode = str(d.mode, { name: 'Mode' });
  if (!GAMES.includes(game) || !MODES[mode]) throw new HttpsError('invalid-argument', 'Unknown game or mode.');
  const entryFee = money(num(d.entryFee, { min: 0, max: 10000, name: 'Entry fee' }));
  const startAt = num(d.startAt, { min: 1e12, max: 4e12, name: 'Start time' });
  const prizes = {};
  const raw = d.prizes && typeof d.prizes === 'object' ? d.prizes : {};
  for (let r = 1; r <= MODES[mode]; r++) if (raw[r] !== undefined && raw[r] !== '') prizes[r] = money(num(raw[r], { min: 0, max: 1e6, name: `Prize #${r}` }));
  const roomCode = d.roomCode ? str(String(d.roomCode), { max: 40, name: 'Room code' }) : '';

  let tid = d.id ? str(d.id, { min: 5, max: 40, re: /^[-\w]+$/, name: 'Tournament id' }) : null;
  if (tid) {
    const cur = (await db.ref(`tournaments/${tid}`).get()).val();
    if (!cur) throw new HttpsError('not-found', 'Tournament not found.');
    if (cur.status !== 'upcoming') throw new HttpsError('failed-precondition', 'Only upcoming tournaments can be edited.');
    if (cur.joined > 0 && (cur.mode !== mode || cur.entryFee !== entryFee || cur.game !== game))
      throw new HttpsError('failed-precondition', 'Game, mode and entry fee are locked once players have joined.');
    await db.ref(`tournaments/${tid}`).update({ title, game, mode, slots: MODES[mode], entryFee, startAt, prizes });
  } else {
    tid = db.ref('tournaments').push().key;
    await db.ref(`tournaments/${tid}`).set({ title, game, mode, slots: MODES[mode], entryFee, startAt, prizes, joined: 0, status: 'upcoming', createdAt: now() });
  }
  await db.ref(`room_secrets/${tid}`).set({ roomCode });
  await audit(adminUid, d.id ? 'edit_tournament' : 'create_tournament', tid, { title });
  return { id: tid };
});

exports.adminTournamentAction = onCall(opts, async (req) => {
  const adminUid = await requireAdmin(req);
  const tid = str(req.data && req.data.tid, { min: 5, max: 40, re: /^[-\w]+$/, name: 'Tournament' });
  const action = req.data.action;
  const tRef = db.ref(`tournaments/${tid}`);
  const t = (await tRef.get()).val();
  if (!t) throw new HttpsError('not-found', 'Tournament not found.');

  if (action === 'start') {
    if (t.status !== 'upcoming') throw new HttpsError('failed-precondition', 'Already started.');
    await tRef.update({ status: 'live', startedAt: now() });
  } else if (action === 'cancel') {
    const res = await tRef.child('status').transaction((s) => (s === 'upcoming' || s === 'live' ? 'cancelled' : undefined));
    if (!res.committed) throw new HttpsError('failed-precondition', 'Cannot cancel this tournament.');
    const parts = (await db.ref(`participants/${tid}`).get()).val() || {};
    for (const [uid, p] of Object.entries(parts)) {
      if (!p.paid) continue;
      await mutateWallet(uid, (dep, win) => ({ deposit: dep + (p.fromDeposit || 0), winning: win + (p.fromWinning || 0) }));
      await logTx(uid, { type: 'Entry Refund', wallet: 'mixed', amount: p.paid, ref: tid, note: t.title });
    }
  } else if (action === 'settle') {
    const results = Array.isArray(req.data.results) ? req.data.results : [];
    await settleCore(tid, results, `admin:${adminUid}`);
  } else {
    throw new HttpsError('invalid-argument', 'Unknown action.');
  }
  await audit(adminUid, `tournament_${action}`, tid);
  return { ok: true };
});
