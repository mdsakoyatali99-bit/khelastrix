import { ref, query, limitToLast, orderByChild, startAt, endAt, get } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js';
import { db } from '../core/firebase.js';
import { html, render, $, on, taka, when } from '../core/security.js';
import { toast, busy, formModal, confirmBox } from '../components/ui.js';
import { call } from '../services/api.js';

export default function users(el) {
  let rows = [], q = '';
  const draw = () => render(el, html`<form id="s" class="row" style="margin-bottom:14px"><input class="input" name="q" value="${q}" placeholder="Search username or email" style="flex:1"><button class="btn">Search</button></form>
    <div class="card table-wrap"><table><thead><tr><th>User</th><th>Deposit</th><th>Winnings</th><th>Phone</th><th></th></tr></thead><tbody>
    ${rows.map((u) => html`<tr><td><b>${u.username}</b> ${u.banned ? html`<span class="tag bad">banned</span>` : ''}<div class="small muted">${u.email}</div><div class="small muted mono">${u.uid}</div></td><td>${taka(u.deposit)}</td><td>${taka(u.winning)}</td>
      <td>${u.phoneVerified ? html`<span class="tag ok">${u.phone}</span>` : '—'}<div class="small muted">${when(u.createdAt)}</div></td>
      <td><div class="row wrap"><button class="btn sm" data-adj="${u.uid}">Balance</button><button class="btn sm ${u.banned ? 'teal' : 'danger'}" data-ban="${u.uid}">${u.banned ? 'Unban' : 'Ban'}</button></div></td></tr>`)}</tbody></table>${rows.length ? '' : html`<div class="empty">No users found.</div>`}</div>`);
  async function load() {
    let snap;
    if (!q) snap = await get(query(ref(db, 'users'), limitToLast(100)));
    else { const f = q.includes('@') ? 'email' : 'username'; snap = await get(query(ref(db, 'users'), orderByChild(f), startAt(q), endAt(q + '\uf8ff'), limitToLast(50))); }
    rows = []; snap.forEach((c) => { rows.unshift({ uid: c.key, ...c.val() }); }); draw();
  }
  const o1 = on(el, 'click', '[data-adj]', async (_, b) => {
    const u = rows.find((r) => r.uid === b.dataset.adj);
    const v = await formModal({ title: `Adjust balance · ${u.username}`, submit: 'Apply', fields: [{ name: 'wallet', label: 'Wallet', type: 'select', options: [{ value: 'deposit', label: 'Deposit' }, { value: 'winning', label: 'Winnings' }], value: 'deposit' }, { name: 'delta', label: 'Amount (negative to deduct)', type: 'number', step: '0.01' }, { name: 'reason', label: 'Reason (saved in audit log)' }] });
    if (v) await busy(b, async () => { await call('adminAdjustBalance', { uid: u.uid, wallet: v.wallet, delta: Number(v.delta), reason: v.reason }); toast('Balance updated'); load(); });
  });
  const o2 = on(el, 'click', '[data-ban]', async (_, b) => {
    const u = rows.find((r) => r.uid === b.dataset.ban);
    if (await confirmBox(u.banned ? 'Unban user' : 'Ban user', `${u.username} will ${u.banned ? 'regain' : 'lose'} access.`, { danger: !u.banned })) await busy(b, async () => { await call('adminSetBan', { uid: u.uid, banned: !u.banned }); load(); });
  });
  const sub = (e) => { if (e.target.id === 's') { e.preventDefault(); q = e.target.q.value.trim(); load(); } };
  el.addEventListener('submit', sub);
  load();
  return () => { o1(); o2(); el.removeEventListener('submit', sub); };
}
