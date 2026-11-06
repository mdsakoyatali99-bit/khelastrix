import { ref, onValue } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js';
import { db } from '../core/firebase.js';
import { html, render, on } from '../core/security.js';
import { toast, busy } from '../components/ui.js';
import { call } from '../services/api.js';

export default function settings(el) {
  let c = {}, dep = {};
  const f = (name, label, val, type = 'text') => html`<label class="field"><span>${label}</span><input class="input" name="${name}" type="${type}" value="${val ?? ''}" ${type === 'number' ? 'min="0"' : ''}></label>`;
  const draw = () => render(el, html`<div class="card" style="margin-bottom:16px"><h3 style="margin-bottom:12px">App settings</h3><form id="cf" class="form-grid">
    ${f('notice', 'Notice banner', c.notice)}${f('minDeposit', 'Minimum deposit (৳)', c.minDeposit, 'number')}${f('minWithdraw', 'Minimum withdrawal (৳)', c.minWithdraw, 'number')}
    ${f('bkash', 'bKash number', c.bkash)}${f('nagad', 'Nagad number', c.nagad)}${f('rocket', 'Rocket number', c.rocket)}${f('support', 'Support link (https)', c.support)}
    ${f('ludoUrl', 'Ludo game URL (https)', c.gameUrls?.ludo)}${f('carromUrl', 'Carrom game URL (https)', c.gameUrls?.carrom)}
    <label class="field"><span>Deposit sender must match verified phone</span><select class="input" name="requireSenderMatch"><option value="0" ${dep.requireSenderMatch ? '' : 'selected'}>No</option><option value="1" ${dep.requireSenderMatch ? 'selected' : ''}>Yes (stricter)</option></select></label></form><button class="btn" id="sv">Save settings</button></div>
    <div class="card"><h3 style="margin-bottom:12px">Send notification</h3><form id="nf"><label class="field"><span>Title</span><input class="input" name="t" maxlength="80" required></label><label class="field"><span>Message</span><input class="input" name="b" maxlength="400" required></label><button class="btn">Send to all players</button></form></div>`);
  const offs = [onValue(ref(db, 'config/public'), (s) => { c = s.val() || {}; draw(); }), onValue(ref(db, 'config/private/deposit'), (s) => { dep = s.val() || {}; draw(); })];
  const o1 = on(el, 'click', '#sv', (_, b) => { const f_ = document.getElementById('cf'); busy(b, async () => { await call('adminSaveConfig', { ...Object.fromEntries(new FormData(f_)), requireSenderMatch: f_.requireSenderMatch.value === '1' }); toast('Settings saved'); }); });
  const sub = (e) => { if (e.target.id === 'nf') { e.preventDefault(); const f_ = e.target; busy(f_.querySelector('button'), async () => { await call('adminSendNotification', { title: f_.t.value, body: f_.b.value }); toast('Notification sent'); f_.reset(); }); } };
  el.addEventListener('submit', sub);
  return () => { offs.forEach((f_) => f_()); o1(); el.removeEventListener('submit', sub); };
}
