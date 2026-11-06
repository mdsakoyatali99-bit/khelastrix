/**
 * Example: how YOUR custom Ludo/Carrom game server talks to Khelastrix.
 * The game key stays on the game server. Never ship it inside the game client.
 *
 *   KX_BASE=https://asia-southeast1-<project>.cloudfunctions.net KX_GAME_KEY=KX-XXXXX-... node game-server-example.js
 */
const BASE = process.env.KX_BASE, KEY = process.env.KX_GAME_KEY;
const post = async (fn, body) => {
  const r = await fetch(`${BASE}/${fn}`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-game-key': KEY }, body: JSON.stringify(body) });
  return { status: r.status, body: await r.json() };
};

// 1) A player opens the game with ?t=<launch token> (issued by the Khelastrix app). Verify it:
async function onPlayerConnect(token) {
  const r = await post('verifyLaunchToken', { token });
  if (!r.body.valid) throw new Error('Invalid or expired token');
  return r.body; // { uid, tournamentId, game, name, roomCode }
}

// 2) When the match ends, report the final ranking only. Prizes are computed by Khelastrix.
//    1v1 / 4-player: one rank per player. 2v2: give teammates the same rank.
async function onMatchFinished(tournamentId, ranking /* [{uid, rank}] */) {
  const r = await post('gameResult', { tournamentId, results: ranking });
  console.log('settled:', r.status, r.body); // wallets + leaderboard update live in every player's app
}

module.exports = { onPlayerConnect, onMatchFinished };
