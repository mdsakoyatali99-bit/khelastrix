import { ref, query, limitToLast, orderByChild, equalTo, onValue } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js';
import { db } from '../core/firebase.js';
import { html, render, ago, taka } from '../core/security.js';

export default function dash(el) {
  const d = { users: 0, pending: 0, readers: 0, live: 0, sms: [], audit: [] };
  const draw = () => render(el, html`<div class="stats"><div class="card stat"><b>${d.users >= 500 ? '500+' : d.users}</b><span class="muted small">Users</span></div><div class="card stat"><b>${d.pending}</b><span class="muted small">Pending withdrawals</span></div>
    <div class="card stat"><b>${d.readers}</b><span class="muted small">Active reader keys</span></div><div class="card stat"><b>${d.live}</b><span class="muted small">Live tournaments</span></div></div>
    <div class="card" style="margin-bottom:14px"><h3 style="margin-bottom:8px">Latest payment SMS</h3>${d.sms.length ? d.sms.map((s) => html`<div class="tx"><div><b>${s.method}</b> <span class="mono small">${s.trxId}</span><div class="small muted">${ago(s.receivedAt)} · ${s.readerName}</div></div><div><b>${taka(s.amount)}</b> <span class="tag ${s.used ? '' : 'warn'}">${s.used ? 'used' : 'unused'}</span></div></div>`) : html`<div class="empty">No SMS yet.</div>`}</div>
    <div class="card"><h3 style="margin-bottom:8px">Audit log</h3>${d.audit.map((a) => html`<div class="tx"><div><b>${a.action}</b><div class="small muted mono">${a.target || ''}</div></div><div class="small muted">${ago(a.ts)}</div></div>`)}</div>`);
  const offs = [
    onValue(query(ref(db, 'users'), limitToLast(500)), (s) => { d.users = s.size; draw(); }),
    onValue(query(ref(db, 'withdraw_requests'), orderByChild('status'), equalTo('pending')), (s) => { d.pending = s.size; draw(); }),
    onValue(ref(db, 'readerKeys'), (s) => { d.readers = Object.values(s.val() || {}).filter((r) => r.active).length; draw(); }),
    onValue(query(ref(db, 'tournaments'), orderByChild('status'), equalTo('live')), (s) => { d.live = s.size; draw(); }),
    onValue(query(ref(db, 'sms_inbox'), limitToLast(8)), (s) => { d.sms = Object.values(s.val() || {}).sort((a, b) => b.receivedAt - a.receivedAt); draw(); }),
    onValue(query(ref(db, 'audit'), limitToLast(15)), (s) => { d.audit = Object.values(s.val() || {}).sort((a, b) => b.ts - a.ts); draw(); }),
  ];
  draw();
  return () => offs.forEach((f) => f());
}
