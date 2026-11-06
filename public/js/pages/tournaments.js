import { ref, query, orderByChild, limitToLast, onValue, get } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js';
import { db } from '../core/firebase.js';
import { html, render, $, on, taka, when } from '../core/security.js';
import { shell } from '../components/shell.js';
import { spinner, toast, busy, confirmBox, infoModal } from '../components/ui.js';
import { state } from '../services/auth.js';
import { call } from '../services/api.js';

const MODE = { '1v1': '1 v 1', '2v2': '2 v 2', '4p': '4 players' };
export default function page(root) {
  const { content, dispose } = shell(root, '/tournaments');
  let all = [], filter = 'all'; const joined = new Set(), offs = [];
  render(content, spinner());
  const card = (t) => {
    const mine = joined.has(t.id), full = t.joined >= t.slots, pct = Math.min(100, (t.joined / t.slots) * 100);
    const top = Object.entries(t.prizes || {}).map(([r, v]) => `#${r} ${taka(v)}`).join(' · ');
    const winners = t.results ? Object.values(t.results).sort((a, b) => a.rank - b.rank).slice(0, 2) : [];
    return html`<article class="card t-card"><div class="t-head"><div><h3>${t.title}</h3><div class="small muted">${t.game === 'ludo' ? 'Ludo' : 'Carrom'} · ${MODE[t.mode]} · ${when(t.startAt)}</div></div>
      <span class="tag ${t.status === 'live' ? 'ok' : t.status === 'upcoming' ? 'warn' : ''}">${t.status}</span></div>
      <div class="t-meta"><div><b>${t.entryFee ? taka(t.entryFee) : 'Free'}</b><span>Entry</span></div><div><b>${top || '—'}</b><span>Prizes</span></div><div><b>${t.joined}/${t.slots}</b><span>Seats</span></div></div>
      <div class="bar"><i style="width:${pct}%"></i></div>
      ${t.status === 'finished' ? html`<div class="small muted">${winners.map((w) => html`#${w.rank} ${w.name} ${w.prize ? taka(w.prize) : ''} `)}</div>` : ''}
      <div class="row">${t.status === 'upcoming' && !mine ? html`<button class="btn teal block" data-join="${t.id}" ${full ? 'disabled' : ''}>${full ? 'Full' : t.entryFee ? `Join for ${taka(t.entryFee)}` : 'Join free'}</button>` : ''}
        ${mine && (t.status === 'upcoming' || t.status === 'live') ? html`<button class="btn gold block" data-play="${t.id}">${t.status === 'live' ? 'Play now' : 'Room details'}</button>` : ''}
        ${mine && t.status === 'finished' ? html`<span class="tag ok">You played</span>` : ''}</div></article>`;
  };
  const draw = () => {
    const list = all.filter((t) => filter === 'all' || t.game === filter || t.status === filter);
    render(content, html`<div class="chips">${['all', 'ludo', 'carrom', 'live', 'upcoming', 'finished'].map((f) => html`<button data-f="${f}" class="${f === filter ? 'on' : ''}">${f[0].toUpperCase() + f.slice(1)}</button>`)}</div>
      <div class="grid">${list.length ? list.map(card) : html`<div class="empty">No tournaments here yet.</div>`}</div>`);
  };
  const offT = onValue(query(ref(db, 'tournaments'), orderByChild('startAt'), limitToLast(40)), (s) => {
    const v = s.val() || {};
    all = Object.entries(v).map(([id, t]) => ({ id, ...t })).filter((t) => t.status !== 'cancelled').sort((a, b) => (a.status === 'finished') - (b.status === 'finished') || a.startAt - b.startAt);
    offs.forEach((f) => f()); offs.length = 0;
    all.forEach((t) => offs.push(onValue(ref(db, `participants/${t.id}/${state.user.uid}`), (p) => { const had = joined.has(t.id); p.exists() ? joined.add(t.id) : joined.delete(t.id); if (had !== p.exists()) draw(); })));
    draw();
  });
  const o1 = on(content, 'click', '[data-f]', (_, b) => { filter = b.dataset.f; draw(); });
  const o2 = on(content, 'click', '[data-join]', async (_, b) => {
    const t = all.find((x) => x.id === b.dataset.join);
    if (!(await confirmBox('Join tournament', t.entryFee ? `${taka(t.entryFee)} will be taken from your wallet (deposit first, then winnings).` : 'This tournament is free to enter.', { submit: 'Join' }))) return;
    await busy(b, async () => { await call('joinTournament', { tid: t.id }); toast('You are in!'); });
  });
  const o3 = on(content, 'click', '[data-play]', async (_, b) => {
    const t = all.find((x) => x.id === b.dataset.play);
    await busy(b, async () => {
      const room = (await get(ref(db, `room_secrets/${t.id}/roomCode`))).val();
      if (t.status === 'live') {
        const { token, url } = await call('getLaunchToken', { tid: t.id });
        if (url) { location.href = `${url}${url.includes('?') ? '&' : '?'}t=${encodeURIComponent(token)}`; return; }
      }
      await infoModal(t.title, html`<p class="muted">${t.status === 'live' ? 'Game link is not configured yet.' : 'Starts ' + when(t.startAt)}</p>${room ? html`<div class="key-reveal">${room}</div><p class="small muted">Room code</p>` : ''}`);
    });
  });
  return () => { offT(); offs.forEach((f) => f()); o1(); o2(); o3(); dispose(); };
}
