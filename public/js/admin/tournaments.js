import { ref, query, limitToLast, onValue, get } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js';
import { db } from '../core/firebase.js';
import { html, render, on, taka, when } from '../core/security.js';
import { toast, busy, formModal, confirmBox } from '../components/ui.js';
import { call } from '../services/api.js';

const SLOTS = { '1v1': 2, '2v2': 4, '4p': 4 };
const localInput = (ms) => { const d = new Date(ms - new Date().getTimezoneOffset() * 60000); return d.toISOString().slice(0, 16); };

export default function tournaments(el) {
  let rows = [];
  const draw = () => render(el, html`<div class="row between" style="margin-bottom:14px"><h3>Tournaments</h3><button class="btn" id="new">New tournament</button></div>
    <div class="card table-wrap"><table><thead><tr><th>Match</th><th>Entry / prizes</th><th>Seats</th><th>Status</th><th></th></tr></thead><tbody>
    ${rows.map((t) => html`<tr><td><b>${t.title}</b><div class="small muted">${t.game} · ${t.mode} · ${when(t.startAt)}</div></td><td>${taka(t.entryFee)}<div class="small muted">${Object.entries(t.prizes || {}).map(([r, v]) => `#${r} ${taka(v)}`).join(' ')}</div></td><td>${t.joined}/${t.slots}</td>
      <td><span class="tag ${t.status === 'live' ? 'ok' : t.status === 'upcoming' ? 'warn' : t.status === 'cancelled' ? 'bad' : ''}">${t.status}</span></td>
      <td><div class="row wrap">${t.status === 'upcoming' ? html`<button class="btn sm ghost" data-e="${t.id}">Edit</button><button class="btn sm teal" data-s="${t.id}">Start</button>` : ''}
      ${t.status === 'live' ? html`<button class="btn sm gold" data-r="${t.id}">Set result</button>` : ''}${t.status === 'upcoming' || t.status === 'live' ? html`<button class="btn sm danger" data-c="${t.id}">Cancel</button>` : ''}</div></td></tr>`)}</tbody></table>${rows.length ? '' : html`<div class="empty">Create your first tournament.</div>`}</div>`);
  const off = onValue(query(ref(db, 'tournaments'), limitToLast(80)), (s) => { rows = Object.entries(s.val() || {}).map(([id, t]) => ({ id, ...t })).sort((a, b) => b.startAt - a.startAt); draw(); });

  async function editor(t) {
    const p = t?.prizes || {};
    const room = t ? (await get(ref(db, `room_secrets/${t.id}/roomCode`))).val() : '';
    const v = await formModal({ title: t ? 'Edit tournament' : 'New tournament', submit: 'Save', fields: [
      { name: 'title', label: 'Title', value: t?.title }, { name: 'game', label: 'Game', type: 'select', options: ['ludo', 'carrom'], value: t?.game },
      { name: 'mode', label: 'Mode', type: 'select', options: [{ value: '1v1', label: '1 v 1 (2 players)' }, { value: '2v2', label: '2 v 2 (4 players)' }, { value: '4p', label: '4 players' }], value: t?.mode },
      { name: 'entryFee', label: 'Entry fee (৳)', type: 'number', value: t?.entryFee ?? 10, step: '0.01' }, { name: 'startAt', label: 'Starts at', type: 'datetime-local', value: localInput(t?.startAt || Date.now() + 3600e3) },
      { name: 'p1', label: 'Prize for 1st place (per player)', type: 'number', value: p[1] ?? '', step: '0.01', required: false }, { name: 'p2', label: '2nd place', type: 'number', value: p[2] ?? '', step: '0.01', required: false },
      { name: 'p3', label: '3rd place', type: 'number', value: p[3] ?? '', step: '0.01', required: false }, { name: 'p4', label: '4th place', type: 'number', value: p[4] ?? '', step: '0.01', required: false },
      { name: 'roomCode', label: 'Room code (visible to joined players only)', value: room || '', required: false }] });
    if (!v) return;
    await busy(null, async () => {
      await call('adminSaveTournament', { id: t?.id, title: v.title, game: v.game, mode: v.mode, entryFee: Number(v.entryFee), startAt: new Date(v.startAt).getTime(), prizes: { 1: v.p1, 2: v.p2, 3: v.p3, 4: v.p4 }, roomCode: v.roomCode });
      toast('Saved');
    });
  }
  const find = (id) => rows.find((r) => r.id === id);
  const o = [
    on(el, 'click', '#new', () => editor(null)),
    on(el, 'click', '[data-e]', (_, b) => editor(find(b.dataset.e))),
    on(el, 'click', '[data-s]', async (_, b) => { if (await confirmBox('Start tournament', 'Registration closes and players can launch the game.')) busy(b, async () => { await call('adminTournamentAction', { tid: b.dataset.s, action: 'start' }); toast('Started'); }); }),
    on(el, 'click', '[data-c]', async (_, b) => { if (await confirmBox('Cancel tournament', 'Every entry fee is refunded automatically.', { danger: true, submit: 'Cancel and refund' })) busy(b, async () => { await call('adminTournamentAction', { tid: b.dataset.c, action: 'cancel' }); toast('Cancelled and refunded'); }); }),
    on(el, 'click', '[data-r]', async (_, b) => {
      const t = find(b.dataset.r); const parts = (await get(ref(db, `participants/${t.id}`))).val() || {};
      const entries = Object.entries(parts);
      const v = await formModal({ title: `Result · ${t.title}`, submit: 'Pay prizes', fields: entries.map(([uid, p], i) => ({ name: uid, label: p.name, type: 'select', options: Array.from({ length: t.slots }, (_, k) => ({ value: k + 1, label: `#${k + 1}` })), value: i + 1 })) });
      if (v) await busy(b, async () => { await call('adminTournamentAction', { tid: t.id, action: 'settle', results: entries.map(([uid]) => ({ uid, rank: Number(v[uid]) })) }); toast('Prizes paid'); });
    }),
  ];
  return () => { off(); o.forEach((f) => f()); };
}
