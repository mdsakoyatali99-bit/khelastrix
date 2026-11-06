import { ref, query, limitToLast, onValue } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js';
import { db } from '../core/firebase.js';
import { html, render, $, on, taka, when } from '../core/security.js';
import { shell } from '../components/shell.js';
import { toast, busy } from '../components/ui.js';
import { state, subscribe, balances } from '../services/auth.js';
import { call } from '../services/api.js';

export default function page(root) {
  const { content, dispose } = shell(root, '/wallet');
  let cfg = {}, txs = [], claims = {}, tab = 'add';
  const draw = () => {
    const b = balances();
    render(content, html`<section class="wallet-hero"><div class="small muted">Total balance</div><div class="total">${taka(b.deposit + b.winning)}</div>
      <div class="split"><div><div class="small muted">Deposit</div><b>${taka(b.deposit)}</b></div><div><div class="small muted">Winnings</div><b>${taka(b.winning)}</b></div></div></section>
      <div class="seg"><button data-t="add" class="${tab === 'add' ? 'on' : ''}">Add money</button><button data-t="out" class="${tab === 'out' ? 'on' : ''}">Withdraw</button></div>
      ${tab === 'add' ? html`<div class="card" style="margin-bottom:14px"><h3 style="margin-bottom:8px">Add money</h3>
        <p class="muted small" style="margin-bottom:12px">1. Send money (Send Money / Cash In) to: ${['bkash', 'nagad', 'rocket'].filter((m) => cfg[m]).map((m) => html`<br><b>${m[0].toUpperCase() + m.slice(1)}</b> <span class="mono">${cfg[m]}</span>`)}<br>2. Paste the TrxID below. Your wallet updates automatically.</p>
        <form id="dep"><label class="field"><span>Method</span><select class="input" name="m"><option value="bkash">bKash</option><option value="nagad">Nagad</option><option value="rocket">Rocket</option></select></label>
        <label class="field"><span>Transaction ID</span><input class="input mono" name="t" maxlength="20" required autocapitalize="characters" autocomplete="off"></label><button class="btn teal block">Verify payment</button></form>
        ${Object.entries(claims).filter(([, c]) => c.status === 'pending').map(([id]) => html`<p class="small muted" style="margin-top:10px">Waiting for SMS confirmation of <span class="mono">${id}</span>…</p>`)}</div>`
      : html`<div class="card" style="margin-bottom:14px"><h3 style="margin-bottom:8px">Withdraw winnings</h3><p class="muted small" style="margin-bottom:12px">Minimum ${taka(cfg.minWithdraw || 100)}. Only winnings can be withdrawn. Phone verification is required.</p>
        <form id="wd"><label class="field"><span>Method</span><select class="input" name="m"><option value="bkash">bKash</option><option value="nagad">Nagad</option><option value="rocket">Rocket</option></select></label>
        <label class="field"><span>Mobile number</span><input class="input" name="n" inputmode="numeric" pattern="01[3-9][0-9]{8}" placeholder="01XXXXXXXXX" required></label>
        <label class="field"><span>Amount</span><input class="input" name="a" type="number" min="${cfg.minWithdraw || 100}" max="${Math.floor(b.winning)}" required></label><button class="btn block">Request withdrawal</button></form></div>`}
      <div class="card"><h3 style="margin-bottom:6px">History</h3>${txs.length ? txs.map((t) => html`<div class="tx"><div><b>${t.type}</b><div class="small muted">${t.note || t.method || ''} ${when(t.ts)}</div></div>
        <div class="amt ${t.amount > 0 ? 'pos' : t.amount < 0 ? 'neg' : ''}">${t.amount ? (t.amount > 0 ? '+' : '') + taka(t.amount) : ''} ${t.status === 'pending' ? html`<span class="tag warn">pending</span>` : ''}</div></div>`) : html`<div class="empty">No transactions yet.</div>`}</div>`);
  };
  const uid = state.user.uid;
  const offs = [
    onValue(ref(db, 'config/public'), (s) => { cfg = s.val() || {}; draw(); }),
    onValue(query(ref(db, `transactions/${uid}`), limitToLast(30)), (s) => { txs = Object.values(s.val() || {}).sort((a, b) => b.ts - a.ts); draw(); }),
    onValue(ref(db, `deposit_claims/${uid}`), (s) => { const prev = claims; claims = s.val() || {}; Object.entries(claims).forEach(([id, c]) => { if (c.status === 'success' && prev[id]?.status === 'pending') toast(`${taka(c.amount)} added to your wallet`); }); draw(); }),
    subscribe(() => draw()),
  ];
  const o1 = on(content, 'click', '[data-t]', (_, b) => { tab = b.dataset.t; draw(); });
  const sub = async (e) => {
    e.preventDefault(); const f = e.target; const btn = $('button', f);
    if (f.id === 'dep') await busy(btn, async () => {
      const r = await call('claimDeposit', { trxId: f.t.value.trim(), method: f.m.value });
      toast(r.status === 'success' ? `${taka(r.amount)} added to your wallet` : 'Payment not seen yet. We will credit you the moment it arrives.'); f.reset();
    });
    if (f.id === 'wd') await busy(btn, async () => { await call('requestWithdraw', { amount: Number(f.a.value), method: f.m.value, number: f.n.value.trim() }); toast('Withdrawal requested'); f.reset(); });
  };
  content.addEventListener('submit', sub);
  return () => { offs.forEach((f) => f()); o1(); content.removeEventListener('submit', sub); dispose(); };
}
