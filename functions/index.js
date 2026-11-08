'use strict';
/**
 * Khelastrix secure backend (Firebase Cloud Functions v2, Realtime Database).
 * Every money movement happens here. The browser can never write a balance (see database.rules.json).
 */
const admin = require('firebase-admin');
const crypto = require('crypto');
const { onCall, onRequest, HttpsError } = require('firebase-functions/v2/https');
const { setGlobalOptions } = require('firebase-functions/v2');
const { defineSecret } = require('firebase-functions/params');

admin.initializeApp({ databaseURL: 'https://ludofire-arena-default-rtdb.firebaseio.com' });
const db = admin.database();
const REGION = 'asia-southeast1';
setGlobalOptions({ region: REGION, maxInstances: 20 });
const ADMIN_SETUP_CODE = defineSecret('ADMIN_SETUP_CODE');

// ---------- helpers ----------
const sha256 = (s) => crypto.createHash('sha256').update(String(s)).digest('hex');
const now = () => Date.now();
const money = (n) => Math.round(Number(n) * 100) / 100;
const dateStr = () => new Date().toLocaleString('en-GB', { timeZone: 'Asia/Dhaka', day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
const METHODS = { bkash: 'bKash', nagad: 'Nagad', rocket: 'Rocket' };
const NAME_RE = /^[^<>"'`&\\\n\r\t]{2,30}$/;

function ipOf(req) {
  const raw = req.rawRequest || req;
  const xf = (raw.headers && raw.headers['x-forwarded-for']) || '';
  return (String(xf).split(',')[0] || raw.ip || '').trim() || 'unknown';
}
function requireAuth(req) {
  if (!req.auth) throw new HttpsError('unauthenticated', 'Please log in first.');
  return req.auth.uid;
}
function requireAdmin(req) {
  const uid = requireAuth(req);
  if (req.auth.token.admin !== true) throw new HttpsError('permission-denied', 'Admin only.');
  return uid;
}
async function rateLimit(key, max, windowSec) {
  const ref = db.ref(`rate/${sha256(key).slice(0, 32)}`);
  const t = now();
  const res = await ref.transaction((c) => {
    if (!c || c.resetAt <= t) return { n: 1, resetAt: t + windowSec * 1000 };
    if (c.n >= max) return;
    return { n: c.n + 1, resetAt: c.resetAt };
  });
  if (!res.committed) throw new HttpsError('resource-exhausted', 'Too many requests. Please wait a moment.');
}
const audit = (actor, action, target, detail) => db.ref('audit').push({ ts: now(), actor, action, target: target || null, detail: detail || null });
const logTx = (uid, rec) => db.ref(`transactions/${uid}`).push({ ts: now(), date: dateStr(), status: 'Success', ...rec });
function str(v, { min = 0, max = 200, re, name = 'Field' } = {}) {
  if (typeof v !== 'string') throw new HttpsError('invalid-argument', `${name} is invalid.`);
  const s = v.trim();
  if (s.length < min || s.length > max || (re && !re.test(s))) throw new HttpsError('invalid-argument', `${name} is invalid.`);
  return s;
}
function num(v, { min = 0, max = 1e7, name = 'Number' } = {}) {
  const n = Number(v);
  if (!Number.isFinite(n) || n < min || n > max) throw new HttpsError('invalid-argument', `${name} is invalid.`);
  return n;
}
/** Atomic wallet change. mutator(deposit, winning) -> {deposit, winning} or null to abort. */
async function mutateWallet(uid, mutator) {
  let out = null;
  const res = await db.ref(`users/${uid}`).transaction((u) => {
    if (u === null) return null;
    const r = mutator(Number(u.deposit) || 0, Number(u.winning) || 0);
    if (!r || r.deposit < 0 || r.winning < 0) return;
    u.deposit = money(r.deposit); u.winning = money(r.winning);
    out = { deposit: u.deposit, winning: u.winning };
    return u;
  });
  if (!res.snapshot.exists()) throw new HttpsError('not-found', 'Account not found.');
  if (!res.committed || !out) throw new HttpsError('failed-precondition', 'Insufficient balance.');
  return out;
}

// ---------- accounts ----------
exports.ensureProfile = onCall(async (req) => {
  const uid = requireAuth(req);
  await rateLimit(`prof_${uid}`, 10, 60);
  const d = req.data || {};
  const email = req.auth.token.email || '';
  let username = typeof d.username === 'string' ? d.username.trim() : '';
  if (!NAME_RE.test(username)) username = (email.split('@')[0] || 'player').replace(/[^\w ]/g, '').slice(0, 20) || `player${uid.slice(0, 5)}`;
  const phone = typeof d.phone === 'string' && /^[0-9+]{6,16}$/.test(d.phone.trim()) ? d.phone.trim() : '';
  await db.ref(`users/${uid}`).transaction((c) => c || { username, email, phone, deposit: 0, winning: 0, createdAt: now() });
  return { ok: true };
});

/** One-time bootstrap: the first account that knows ADMIN_SETUP_CODE becomes admin. Works only once. */
exports.claimAdmin = onCall({ secrets: [ADMIN_SETUP_CODE] }, async (req) => {
  const uid = requireAuth(req);
  await rateLimit(`adm_${ipOf(req)}`, 5, 3600);
  const code = str(req.data && req.data.code, { min: 6, max: 100, name: 'Code' });
  const a = Buffer.from(sha256(code)), b = Buffer.from(sha256(ADMIN_SETUP_CODE.value()));
  if (!crypto.timingSafeEqual(a, b)) throw new HttpsError('permission-denied', 'Wrong code.');
  const t = await db.ref('config/adminUid').transaction((c) => (c ? undefined : uid));
  if (!t.committed && (await db.ref('config/adminUid').get()).val() !== uid) throw new HttpsError('already-exists', 'An admin already exists.');
  await admin.auth().setCustomUserClaims(uid, { admin: true });
  await audit(uid, 'claimAdmin', uid);
  return { ok: true };
});

// ---------- matches ----------
async function rollbackJoin(matchId, uid, slots, joined) {
  if (slots) await db.ref(`matches/${matchId}/joined`).transaction((j) => Math.max(0, (Number(j) || 0) - slots));
  if (joined) await db.ref(`match_joined/${matchId}/${uid}`).remove();
}
exports.joinMatch = onCall(async (req) => {
  const uid = requireAuth(req);
  await rateLimit(`join_${uid}`, 20, 60);
  const matchId = str(req.data && req.data.matchId, { min: 1, max: 60, re: /^[-\w]+$/, name: 'Match' });
  const names = (Array.isArray(req.data && req.data.names) ? req.data.names : []).map((n) => str(n, { re: NAME_RE, name: 'Player name' }));
  if (names.length < 1 || names.length > 4) throw new HttpsError('invalid-argument', 'Invalid player count.');
  const m = (await db.ref(`matches/${matchId}`).get()).val();
  if (!m) throw new HttpsError('not-found', 'Match not found.');
  if (m.status !== 'Upcoming') throw new HttpsError('failed-precondition', 'This match is not open for joining.');
  const need = { Solo: 1, Duo: 2, Squad: 4 }[m.type];
  if (need && names.length !== need) throw new HttpsError('invalid-argument', `This match needs ${need} player name(s).`);
  const total = money((Number(m.entry) || 0) * names.length);

  const mark = await db.ref(`match_joined/${matchId}/${uid}`).transaction((c) => (c ? undefined : true));
  if (!mark.committed) throw new HttpsError('already-exists', 'You already joined this match.');
  const cap = Number(m.total) || 48;
  const slot = await db.ref(`matches/${matchId}/joined`).transaction((j) => { j = Number(j) || 0; return j + names.length > cap ? undefined : j + names.length; });
  if (!slot.committed) { await rollbackJoin(matchId, uid, 0, true); throw new HttpsError('resource-exhausted', 'Match is full.'); }
  let bal;
  try {
    bal = await mutateWallet(uid, (d, w) => {
      if (d + w < total) return null;
      let rem = total, nd = d, nw = w;
      if (nd >= rem) nd -= rem; else { rem -= nd; nd = 0; nw -= rem; }
      return { deposit: nd, winning: nw };
    });
  } catch (e) { await rollbackJoin(matchId, uid, names.length, true); throw e; }
  const pRef = db.ref(`match_participants/${matchId}`);
  for (const ign of names) await pRef.push({ ign, joinedBy: uid, kills: 0, win: 0 });
  await logTx(uid, { type: 'Match Join', amount: total, matchId });
  return { ok: true, balances: bal };
});

/** Pays out a match. results: [{uid | ign, rank, kills}] — idempotent (settled once). */
async function settleMatch(matchId, results, actor) {
  const mref = db.ref(`matches/${matchId}`);
  const m = (await mref.get()).val();
  if (!m) throw new HttpsError('not-found', 'Match not found.');
  const lock = await db.ref(`matches/${matchId}/settled`).transaction((c) => (c ? undefined : now()));
  if (!lock.committed) throw new HttpsError('already-exists', 'This match was already settled.');
  let paidAny = false;
  try {
    const parts = (await db.ref(`match_participants/${matchId}`).get()).val() || {};
    const byIgn = {}, uids = new Set();
    Object.entries(parts).forEach(([k, p]) => { byIgn[String(p.ign).toLowerCase()] = { k, uid: p.joinedBy }; uids.add(p.joinedBy); });
    if (!Array.isArray(results) || !results.length || results.length > 100) throw new HttpsError('invalid-argument', 'results is invalid.');
    const split = Array.isArray(m.prize_split) && m.prize_split.length ? m.prize_split.map(Number) : [Number(m.total_prize) || 0];
    if (split.some((x) => !(x >= 0)) || split.reduce((a, x) => a + x, 0) > (Number(m.total_prize) || 0) + 0.01) throw new HttpsError('failed-precondition', 'Prize split is larger than the total prize.');
    const perKill = Number(m.per_kill) || 0;
    const pay = {}; const seen = new Set();
    for (const r of results) {
      let uid = typeof r.uid === 'string' ? r.uid : null;
      let pk = null;
      if (!uid && typeof r.ign === 'string' && byIgn[r.ign.toLowerCase()]) { uid = byIgn[r.ign.toLowerCase()].uid; pk = byIgn[r.ign.toLowerCase()].k; }
      if (!uid || !uids.has(uid)) throw new HttpsError('invalid-argument', 'A result refers to a player who did not join.');
      if (seen.has(uid)) throw new HttpsError('invalid-argument', 'Duplicate player in results.');
      seen.add(uid);
      const rank = Math.max(0, Math.floor(num(r.rank, { min: 0, max: 1000, name: 'rank' })));
      const kills = Math.floor(num(r.kills || 0, { min: 0, max: 100, name: 'kills' }));
      const prize = rank >= 1 && rank <= split.length ? split[rank - 1] : 0;
      pay[uid] = money((pay[uid] || 0) + prize + kills * perKill);
      if (pk) await db.ref(`match_participants/${matchId}/${pk}`).update({ kills, win: rank === 1 ? 1 : 0, rank });
    }
    for (const [uid, amount] of Object.entries(pay)) {
      if (amount <= 0) continue;
      await mutateWallet(uid, (d, w) => ({ deposit: d, winning: w + amount }));
      paidAny = true;
      await logTx(uid, { type: 'Match Win', amount, matchId });
    }
    await mref.update({ status: 'Finished', finishedAt: now() });
    await audit(actor, 'settleMatch', matchId, pay);
    return pay;
  } catch (e) {
    if (!paidAny) await db.ref(`matches/${matchId}/settled`).remove(); // retry allowed only if nothing was paid yet
    throw e;
  }
}
exports.adminSettleMatch = onCall(async (req) => {
  const uid = requireAdmin(req);
  const matchId = str(req.data && req.data.matchId, { min: 1, max: 60, re: /^[-\w]+$/, name: 'Match' });
  return { ok: true, paid: await settleMatch(matchId, req.data.results, uid) };
});

// ---------- wallet ----------
exports.claimDeposit = onCall(async (req) => {
  const uid = requireAuth(req);
  await rateLimit(`claim_${uid}`, 8, 60);
  const trxId = str(req.data && req.data.trxId, { min: 6, max: 20, re: /^[A-Za-z0-9]{6,20}$/, name: 'TrxID' }).toUpperCase();
  const method = str(req.data && req.data.method, { name: 'Method' }).toLowerCase();
  if (!METHODS[method]) throw new HttpsError('invalid-argument', 'Invalid method.');
  const smsRef = db.ref(`sms_inbox/${trxId}`);
  const res = await smsRef.transaction((s) => {
    if (s === null) return null;
    if (s.used || s.method !== method) return;
    return { ...s, used: true, usedBy: uid, usedAt: now() };
  });
  if (!res.snapshot.exists()) throw new HttpsError('not-found', 'Payment not received yet. Wait a minute and try again, or check the TrxID.');
  if (!res.committed) {
    const s = (await smsRef.get()).val() || {};
    throw new HttpsError('already-exists', s.used ? 'TrxID already used.' : `This TrxID is not a ${METHODS[method]} payment.`);
  }
  const amount = money(res.snapshot.val().amount);
  let bal;
  try { bal = await mutateWallet(uid, (d, w) => ({ deposit: d + amount, winning: w })); }
  catch (e) { await smsRef.update({ used: false, usedBy: null, usedAt: null }); throw e; }
  await logTx(uid, { type: 'Deposit', amount, method: METHODS[method], trxId });
  await db.ref(`deposit_claims/${trxId}`).set({ uid, amount, method, ts: now() });
  return { ok: true, amount, balances: bal };
});

exports.requestWithdraw = onCall(async (req) => {
  const uid = requireAuth(req);
  await rateLimit(`wd_${uid}`, 5, 600);
  const d = req.data || {};
  const amount = Math.floor(num(d.amount, { min: 100, max: 100000, name: 'Amount' }));
  const number = str(d.number, { re: /^01\d{9}$/, name: 'Mobile number' });
  const method = METHODS[str(d.method, { name: 'Method' }).toLowerCase()];
  if (!method) throw new HttpsError('invalid-argument', 'Invalid method.');
  const bal = await mutateWallet(uid, (dep, win) => (win < amount ? null : { deposit: dep, winning: win - amount }));
  try {
    const u = (await db.ref(`users/${uid}`).get()).val() || {};
    const r = db.ref('withdraw_requests').push();
    await r.set({ userId: uid, userName: u.username || 'User', userEmail: u.email || '', amount, method, mobileNumber: number, status: 'pending', timestamp: dateStr(), requestedAt: now() });
    await logTx(uid, { type: 'Withdraw Request', amount, method, number, status: 'Pending', reqId: r.key });
  } catch (e) {
    await mutateWallet(uid, (dep, win) => ({ deposit: dep, winning: win + amount }));
    throw new HttpsError('internal', 'Could not create the request. Your balance was restored.');
  }
  return { ok: true, balances: bal };
});

exports.adminWithdraw = onCall(async (req) => {
  const admin_ = requireAdmin(req);
  const reqId = str(req.data && req.data.reqId, { min: 1, max: 60, re: /^[-\w]+$/, name: 'Request' });
  const action = req.data.action === 'approve' ? 'approve' : req.data.action === 'reject' ? 'reject' : null;
  if (!action) throw new HttpsError('invalid-argument', 'Invalid action.');
  const ref = db.ref(`withdraw_requests/${reqId}`);
  const t = await ref.transaction((r) => (r && r.status === 'pending' ? { ...r, status: 'processing' } : undefined));
  if (!t.committed) throw new HttpsError('failed-precondition', 'Request is not pending.');
  const r = t.snapshot.val();
  if (action === 'reject') {
    try { await mutateWallet(r.userId, (d, w) => ({ deposit: d, winning: w + Number(r.amount) })); }
    catch (e) { await ref.update({ status: 'pending' }); throw e; }
  }
  await ref.update({ status: action === 'approve' ? 'approved' : 'rejected', processedAt: dateStr(), processedBy: admin_ });
  await logTx(r.userId, action === 'approve'
    ? { type: 'Withdraw', amount: r.amount, method: r.method }
    : { type: 'Withdraw Rejected (Refund)', amount: r.amount, status: 'Refunded' });
  await audit(admin_, `withdraw_${action}`, reqId, { userId: r.userId, amount: r.amount });
  return { ok: true };
});

exports.adminAdjustBalance = onCall(async (req) => {
  const actor = requireAdmin(req);
  const uid = str(req.data && req.data.uid, { min: 5, max: 128, re: /^[-\w]+$/, name: 'User' });
  const deposit = money(num(req.data.deposit, { max: 1e7, name: 'Deposit' }));
  const winning = money(num(req.data.winning, { max: 1e7, name: 'Winning' }));
  const before = (await db.ref(`users/${uid}`).get()).val();
  if (!before) throw new HttpsError('not-found', 'User not found.');
  await mutateWallet(uid, () => ({ deposit, winning }));
  await logTx(uid, { type: 'Admin Adjustment', amount: money(deposit + winning - (Number(before.deposit) || 0) - (Number(before.winning) || 0)) });
  await audit(actor, 'adjustBalance', uid, { before: { deposit: before.deposit, winning: before.winning }, after: { deposit, winning } });
  return { ok: true };
});

// ---------- API keys (SMS readers + game servers) ----------
function newKey(prefix) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const b = crypto.randomBytes(24);
  let k = prefix;
  for (let i = 0; i < 24; i++) { if (i % 6 === 0) k += '-'; k += chars[b[i] % chars.length]; }
  return k;
}
exports.adminCreateKey = onCall(async (req) => {
  const actor = requireAdmin(req);
  const kind = req.data && req.data.kind === 'game' ? 'game' : 'reader';
  const name = str(req.data && req.data.name, { min: 2, max: 40, re: NAME_RE, name: 'Name' });
  const game = kind === 'game' && req.data.game ? str(req.data.game, { max: 60, re: /^[-\w ]+$/, name: 'Game/category' }) : '';
  const key = newKey(kind === 'game' ? 'GK' : 'KX');
  const id = sha256(key);
  await db.ref(`apiKeys/${id}`).set({ kind, name, game, active: true, createdAt: now(), lastUsed: 0, hint: `${key.slice(0, 7)}…${key.slice(-4)}` });
  await audit(actor, 'createKey', id.slice(0, 12), { kind, name });
  return { ok: true, key, id }; // shown once; only the hash is stored
});
async function authKey(req, kind) {
  const h = String(req.headers[kind === 'game' ? 'x-game-key' : 'x-reader-key'] || '').trim();
  if (h.length < 20 || h.length > 80) return null;
  await rateLimit(`ip_${ipOf(req)}`, 120, 60);
  const id = sha256(h);
  const k = (await db.ref(`apiKeys/${id}`).get()).val();
  if (!k || !k.active || k.kind !== kind) return null;
  await rateLimit(`key_${id}`, 240, 60);
  db.ref(`apiKeys/${id}/lastUsed`).set(now());
  return { id, ...k };
}

function parseSms(raw, address) {
  const text = String(raw || '');
  if (!/received|cash\s?in|deposit/i.test(text) || /cash\s?out|sent\s+to|payment\s+to/i.test(text)) return null;
  const amount = (text.match(/(?:Tk\.?|BDT|৳)\s?([\d,]+(?:\.\d{1,2})?)/i) || [])[1];
  const trx = (text.match(/(?:Trx\s?ID|Txn\s?ID|TxnId|Transaction\s?ID)[:\s]*([A-Za-z0-9]{6,20})/i) || [])[1];
  const sender = (text.match(/(?:from|sender)[:\s]*(?:A\/C[:\s]*)?(01\d{9})/i) || [])[1];
  const a = String(address || text).toLowerCase();
  const method = a.includes('bkash') ? 'bkash' : a.includes('nagad') ? 'nagad' : (a.includes('rocket') || a.includes('16216')) ? 'rocket' : null;
  if (!amount || !trx || !method) return null;
  return { amount: Number(amount.replace(/,/g, '')), trxId: trx.toUpperCase(), sender: sender || '', method };
}
const json = (res, code, body) => res.status(code).set('Cache-Control', 'no-store').json(body);

/** SMS reader phone -> POST with header x-reader-key */
exports.ingestSms = onRequest({ cors: false }, async (req, res) => {
  try {
    if (req.method !== 'POST') return json(res, 405, { ok: false, error: 'POST only' });
    const k = await authKey(req, 'reader');
    if (!k) return json(res, 401, { ok: false, error: 'Invalid or disabled key' });
    const b = req.body || {};
    const p = b.trxId ? { trxId: String(b.trxId).toUpperCase(), amount: Number(b.amount), method: String(b.method || '').toLowerCase(), sender: String(b.sender || '') } : parseSms(b.raw, b.address);
    if (!p || !/^[A-Z0-9]{6,20}$/.test(p.trxId) || !METHODS[p.method] || !(p.amount > 0 && p.amount <= 500000)) return json(res, 422, { ok: false, error: 'Not a valid deposit SMS' });
    const t = await db.ref(`sms_inbox/${p.trxId}`).transaction((c) => c || { amount: money(p.amount), method: p.method, sender: p.sender.replace(/[^\d+]/g, '').slice(0, 16), time: dateStr(), receivedAt: now(), used: false, reader: k.id.slice(0, 12) });
    return json(res, 200, { ok: true, duplicate: !t.committed });
  } catch (e) {
    if (e instanceof HttpsError && e.code === 'resource-exhausted') return json(res, 429, { ok: false, error: 'Rate limited' });
    console.error(e); return json(res, 500, { ok: false, error: 'Server error' });
  }
});

/** Game server -> POST {action, ...} with header x-game-key. */
exports.gameApi = onRequest({ cors: false }, async (req, res) => {
  try {
    if (req.method !== 'POST') return json(res, 405, { ok: false, error: 'POST only' });
    const k = await authKey(req, 'game');
    if (!k) return json(res, 401, { ok: false, error: 'Invalid or disabled key' });
    const b = req.body || {};
    const own = (m) => !k.game || String(m.category) === k.game || String(m.title).toLowerCase().includes(k.game.toLowerCase());
    if (b.action === 'listMatches') {
      const all = (await db.ref('matches').get()).val() || {};
      const status = ['Upcoming', 'Ongoing', 'Finished'].includes(b.status) ? b.status : 'Upcoming';
      const out = Object.entries(all).filter(([, m]) => own(m) && m.status === status)
        .map(([id, m]) => ({ id, title: m.title, type: m.type, entry: m.entry, total: m.total, joined: m.joined || 0, status: m.status, start: m.date ? `${m.date} ${m.time || ''}`.trim() : null }));
      return json(res, 200, { ok: true, matches: out });
    }
    const matchId = typeof b.matchId === 'string' && /^[-\w]{1,60}$/.test(b.matchId) ? b.matchId : null;
    if (!matchId) return json(res, 400, { ok: false, error: 'matchId required' });
    const m = (await db.ref(`matches/${matchId}`).get()).val();
    if (!m || !own(m)) return json(res, 404, { ok: false, error: 'Match not found for this key' });
    if (b.action === 'getMatch') {
      const parts = (await db.ref(`match_participants/${matchId}`).get()).val() || {};
      return json(res, 200, { ok: true, match: { id: matchId, title: m.title, type: m.type, status: m.status, total: m.total, entry: m.entry, total_prize: m.total_prize, per_kill: m.per_kill || 0, prize_split: m.prize_split || null }, players: Object.values(parts).map((p) => ({ uid: p.joinedBy, ign: p.ign })) });
    }
    if (b.action === 'setRoom') {
      const room_id = str(b.room_id, { min: 1, max: 60, re: /^[^<>"'`]+$/, name: 'room_id' });
      const room_pass = str(b.room_pass || '', { max: 60, re: /^[^<>"'`]*$/, name: 'room_pass' });
      await db.ref(`match_secrets/${matchId}`).set({ room_id, room_pass });
      await audit(`game:${k.name}`, 'setRoom', matchId);
      return json(res, 200, { ok: true });
    }
    if (b.action === 'start') {
      const t = await db.ref(`matches/${matchId}/status`).transaction((s) => (s === 'Upcoming' ? 'Ongoing' : undefined));
      return json(res, t.committed ? 200 : 409, { ok: t.committed });
    }
    if (b.action === 'result') {
      if (m.status === 'Finished' || m.settled) return json(res, 409, { ok: false, error: 'Already settled' });
      const paid = await settleMatch(matchId, b.results, `game:${k.name}`);
      return json(res, 200, { ok: true, paid });
    }
    return json(res, 400, { ok: false, error: 'Unknown action' });
  } catch (e) {
    if (e instanceof HttpsError) return json(res, e.code === 'resource-exhausted' ? 429 : e.code === 'already-exists' ? 409 : 400, { ok: false, error: e.message });
    console.error(e); return json(res, 500, { ok: false, error: 'Server error' });
  }
});
