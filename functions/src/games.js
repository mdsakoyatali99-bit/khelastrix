'use strict';
// Bridge between the tournament app and our own Ludo / Carrom servers.
const crypto = require('crypto');
const { onCall, onRequest } = require('firebase-functions/v2/https');
const { db, HttpsError, REGION, ENFORCE_APPCHECK, SECRETS, requireAuth, rateLimit, sha256, now, money, mutateWallet, logTx, str } = require('./util');

/** Settle a tournament once: validates results, pays prizes (idempotent per player), updates leaderboard. */
async function settleCore(tid, results, source) {
  const tRef = db.ref(`tournaments/${tid}`);
  const t = (await tRef.get()).val();
  if (!t) throw new HttpsError('not-found', 'Tournament not found.');
  if (t.status === 'finished' || t.status === 'cancelled') throw new HttpsError('already-exists', 'Tournament already closed.');
  const parts = (await db.ref(`participants/${tid}`).get()).val() || {};

  const seen = new Set();
  const clean = [];
  for (const r of results) {
    const uid = String(r && r.uid || '');
    const rank = Number(r && r.rank);
    if (!parts[uid]) throw new HttpsError('invalid-argument', 'Result contains a player who did not join.');
    if (!Number.isInteger(rank) || rank < 1 || rank > t.slots) throw new HttpsError('invalid-argument', 'Invalid rank.');
    if (seen.has(uid)) throw new HttpsError('invalid-argument', 'Duplicate player in results.');
    seen.add(uid); clean.push({ uid, rank });
  }
  if (!clean.some((r) => r.rank === 1)) throw new HttpsError('invalid-argument', 'A winner (rank 1) is required.');

  const lock = await db.ref(`game_results/${tid}`).transaction((c) => (c && c.status !== 'failed' ? undefined : { status: 'settling', source, ts: now(), paid: (c && c.paid) || null }));
  if (!lock.committed) throw new HttpsError('already-exists', 'Result already submitted.');

  const summary = {};
  try {
    for (const { uid, rank } of clean) {
      const prize = money((t.prizes && t.prizes[rank]) || 0);
      const mark = await db.ref(`game_results/${tid}/paid/${uid}`).transaction((c) => (c ? undefined : true));
      if (mark.committed) {
        try {
          if (prize > 0) {
            await mutateWallet(uid, (d, w) => ({ deposit: d, winning: w + prize }));
            await logTx(uid, { type: 'Prize', wallet: 'winning', amount: prize, ref: tid, note: `${t.title} · #${rank}` });
          }
          await db.ref(`leaderboard/${uid}`).transaction((l) => {
            l = l || { played: 0, wins: 0, earnings: 0 };
            l.name = parts[uid].name || 'Player';
            l.played += 1; if (rank === 1) l.wins += 1; l.earnings = money(l.earnings + prize);
            return l;
          });
        } catch (e) { await db.ref(`game_results/${tid}/paid/${uid}`).remove(); throw e; }
      }
      summary[uid] = { rank, prize, name: parts[uid].name || 'Player' };
    }
    await tRef.update({ status: 'finished', finishedAt: now(), results: summary });
    await db.ref(`game_results/${tid}`).update({ status: 'settled', results: summary, settledAt: now() });
  } catch (e) {
    await db.ref(`game_results/${tid}`).update({ status: 'failed', error: String(e.message).slice(0, 120) });
    throw e;
  }
  return summary;
}

async function authGameKey(req, res) {
  const key = String(req.get('x-game-key') || '');
  if (!/^KX-[A-Z2-9-]{20,40}$/.test(key)) { res.status(401).json({ error: 'Invalid key' }); return null; }
  const id = sha256(key);
  const g = (await db.ref(`gameKeys/${id}`).get()).val();
  if (!g || g.active !== true) { res.status(403).json({ error: 'Key revoked or disabled' }); return null; }
  await rateLimit(`game_${id}`, 120, 60);
  db.ref(`gameKeys/${id}/lastSeen`).set(now());
  return { id, ...g };
}
const b64 = (b) => Buffer.from(b).toString('base64url');
const sign = (payload) => crypto.createHmac('sha256', SECRETS.GAME_TOKEN_SECRET.value()).update(payload).digest('base64url');

// Game server -> platform: final ranking. Prizes are computed here from the tournament, never trusted from the game.
exports.gameResult = onRequest({ region: REGION, cors: false, secrets: [SECRETS.GAME_TOKEN_SECRET] }, async (req, res) => {
  try {
    if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
    const g = await authGameKey(req, res); if (!g) return;
    const tid = String(req.body && req.body.tournamentId || '');
    if (!/^[-\w]{5,40}$/.test(tid)) return res.status(422).json({ error: 'Bad tournamentId' });
    const t = (await db.ref(`tournaments/${tid}`).get()).val();
    if (!t) return res.status(404).json({ error: 'Unknown tournament' });
    if (Array.isArray(g.games) && g.games.length && !g.games.includes(t.game)) return res.status(403).json({ error: 'Key not allowed for this game' });
    const results = Array.isArray(req.body.results) ? req.body.results.slice(0, 8) : [];
    const summary = await settleCore(tid, results, `game:${g.name}`);
    return res.json({ ok: true, results: summary });
  } catch (e) {
    const code = e instanceof HttpsError ? ({ 'invalid-argument': 422, 'already-exists': 409, 'not-found': 404, 'resource-exhausted': 429 }[e.code] || 400) : 500;
    if (code === 500) console.error('gameResult', e);
    return res.status(code).json({ error: code === 500 ? 'Server error' : e.message });
  }
});

// Player app -> short-lived signed launch token for the custom game.
exports.getLaunchToken = onCall({ region: REGION, enforceAppCheck: ENFORCE_APPCHECK, secrets: [SECRETS.GAME_TOKEN_SECRET] }, async (req) => {
  const uid = requireAuth(req);
  await rateLimit(`launch_${uid}`, 20, 60);
  const tid = str(req.data && req.data.tid, { min: 5, max: 40, re: /^[-\w]+$/, name: 'Tournament' });
  const t = (await db.ref(`tournaments/${tid}`).get()).val();
  const p = (await db.ref(`participants/${tid}/${uid}`).get()).val();
  if (!t || !p) throw new HttpsError('permission-denied', 'You are not in this tournament.');
  if (t.status !== 'live' && t.status !== 'upcoming') throw new HttpsError('failed-precondition', 'Tournament is closed.');
  const payload = b64(JSON.stringify({ uid, tid, game: t.game, name: p.name, exp: now() + 10 * 60e3, n: crypto.randomBytes(6).toString('hex') }));
  const url = (await db.ref(`config/public/gameUrls/${t.game}`).get()).val() || '';
  return { token: `${payload}.${sign(payload)}`, game: t.game, url };
});

// Game server -> platform: verify a player's launch token.
exports.verifyLaunchToken = onRequest({ region: REGION, cors: false, secrets: [SECRETS.GAME_TOKEN_SECRET] }, async (req, res) => {
  try {
    if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
    const g = await authGameKey(req, res); if (!g) return;
    const [payload, sig] = String(req.body && req.body.token || '').split('.');
    if (!payload || !sig) return res.status(422).json({ valid: false });
    const a = Buffer.from(sig), b = Buffer.from(sign(payload));
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return res.status(401).json({ valid: false });
    const d = JSON.parse(Buffer.from(payload, 'base64url').toString());
    if (d.exp < now()) return res.status(401).json({ valid: false, error: 'expired' });
    const p = (await db.ref(`participants/${d.tid}/${d.uid}`).get()).val();
    if (!p) return res.status(403).json({ valid: false });
    const room = (await db.ref(`room_secrets/${d.tid}/roomCode`).get()).val() || '';
    return res.json({ valid: true, uid: d.uid, tournamentId: d.tid, game: d.game, name: d.name, roomCode: room });
  } catch (e) { console.error('verifyLaunchToken', e); return res.status(500).json({ error: 'Server error' }); }
});

exports.settleCore = settleCore;
