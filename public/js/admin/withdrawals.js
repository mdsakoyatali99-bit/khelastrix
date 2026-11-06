import { ref, query, limitToLast, onValue } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js';
import { db } from '../core/firebase.js';
import { html, render, on, taka, when } from '../core/security.js';
import { toast, busy, confirmBox } from '../components/ui.js';
import { call } from '../services/api.js';

export default function wd(el) {
  let rows = [];
  const draw = () => render(el, html`<div class="card table-wrap"><table><thead><tr><th>User</th><th>Amount</th><th>Send to</th><th>Status</th><th></th></tr></thead><tbody>
    ${rows.map((r) => html`<tr><td><b>${r.name || '—'}</b><div class="small muted mono">${r.uid.slice(0, 10)}</div></td><td><b>${taka(r.amount)}</b><div class="small muted">${when(r.ts)}</div></td><td>${r.method}<div class="mono">${r.number}</div></td>
      <td><span class="tag ${r.status === 'pending' ? 'warn' : r.status === 'approved' ? 'ok' : 'bad'}">${r.status}</span></td>
      <td>${r.status === 'pending' ? html`<div class="row wrap"><button class="btn teal sm" data-a="${r.id}">Paid</button><button class="btn danger sm" data-r="${r.id}">Reject</button></div>` : ''}</td></tr>`)}</tbody></table>${rows.length ? '' : html`<div class="empty">No withdrawal requests.</div>`}</div>`);
  const off = onValue(query(ref(db, 'withdraw_requests'), limitToLast(80)), (s) => { rows = Object.entries(s.val() || {}).map(([id, r]) => ({ id, ...r })).sort((a, b) => (b.status === 'pending') - (a.status === 'pending') || b.ts - a.ts); draw(); });
  const act = (approve) => async (_, b) => {
    const id = b.dataset[approve ? 'a' : 'r'];
    const ok = await confirmBox(approve ? 'Mark as paid' : 'Reject and refund', approve ? 'Confirm you have sent the money to the number shown.' : 'The amount returns to the user\'s winnings.', { danger: !approve });
    if (ok) await busy(b, async () => { await call('adminProcessWithdraw', { id, approve }); toast(approve ? 'Marked paid' : 'Rejected and refunded'); });
  };
  const o1 = on(el, 'click', '[data-a]', act(true)), o2 = on(el, 'click', '[data-r]', act(false));
  return () => { off(); o1(); o2(); };
}
