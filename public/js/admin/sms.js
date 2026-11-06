import { ref, query, limitToLast, onValue } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js';
import { db } from '../core/firebase.js';
import { html, render, on, ago, taka } from '../core/security.js';
import { toast, busy, formModal } from '../components/ui.js';
import { call } from '../services/api.js';

export default function sms(el) {
  let inbox = [], otp = { enabled: true, cooldownSec: 90, dailyLimit: 5, ipDailyLimit: 20, expirySec: 300, maxAttempts: 5 }, log = [];
  const draw = () => render(el, html`<div class="card" style="margin-bottom:16px"><div class="row between wrap"><h3>OTP and SMS bombing protection</h3><button class="btn ghost sm" id="test">Send test SMS</button></div>
    <form id="oc" class="form-grid" style="margin-top:12px">
      <label class="field"><span>OTP enabled</span><select class="input" name="enabled"><option value="1" ${otp.enabled ? 'selected' : ''}>On</option><option value="0" ${otp.enabled ? '' : 'selected'}>Off</option></select></label>
      <label class="field"><span>Cooldown between codes (seconds)</span><input class="input" name="cooldownSec" type="number" min="30" max="600" value="${otp.cooldownSec}"></label>
      <label class="field"><span>Daily codes per phone number</span><input class="input" name="dailyLimit" type="number" min="1" max="20" value="${otp.dailyLimit}"></label>
      <label class="field"><span>Daily codes per IP address</span><input class="input" name="ipDailyLimit" type="number" min="1" max="200" value="${otp.ipDailyLimit}"></label>
      <label class="field"><span>Code lifetime (seconds)</span><input class="input" name="expirySec" type="number" min="60" max="900" value="${otp.expirySec}"></label>
      <label class="field"><span>Wrong attempts allowed</span><input class="input" name="maxAttempts" type="number" min="3" max="10" value="${otp.maxAttempts}"></label></form><button class="btn" id="save">Save limits</button></div>
    <div class="card" style="margin-bottom:16px"><h3 style="margin-bottom:8px">Recent OTP activity</h3>${log.length ? log.map((l) => html`<div class="tx"><div><span class="mono">${l.phone}</span> <span class="small muted">${ago(l.ts)}</span></div><span class="tag ${l.status === 'sent' ? 'ok' : 'bad'}">${l.status.replace('_', ' ')}</span></div>`) : html`<div class="empty">No OTP requests yet.</div>`}</div>
    <div class="card"><h3 style="margin-bottom:8px">Payment SMS inbox</h3>${inbox.length ? inbox.map((s) => html`<div class="tx"><div><b>${s.method}</b> <span class="mono small">${s.trxId}</span><div class="small muted">${s.sender || '—'} · ${s.readerName} · ${ago(s.receivedAt)}${s.usedBy ? ' · used by ' + s.usedBy.slice(0, 8) : ''}</div></div><div><b>${taka(s.amount)}</b> <span class="tag ${s.used ? '' : 'warn'}">${s.used ? 'credited' : 'unclaimed'}</span></div></div>`) : html`<div class="empty">No SMS received yet.</div>`}</div>`);
  const offs = [
    onValue(ref(db, 'config/private/otp'), (s) => { if (s.val()) otp = { ...otp, ...s.val() }; draw(); }),
    onValue(query(ref(db, 'otp_log'), limitToLast(25)), (s) => { log = Object.values(s.val() || {}).sort((a, b) => b.ts - a.ts); draw(); }),
    onValue(query(ref(db, 'sms_inbox'), limitToLast(40)), (s) => { inbox = Object.values(s.val() || {}).sort((a, b) => b.receivedAt - a.receivedAt); draw(); }),
  ];
  const o = [
    on(el, 'click', '#save', (_, b) => { const f = document.getElementById('oc'); busy(b, async () => { await call('adminSaveOtpConfig', { enabled: f.enabled.value === '1', cooldownSec: f.cooldownSec.value, dailyLimit: f.dailyLimit.value, ipDailyLimit: f.ipDailyLimit.value, expirySec: f.expirySec.value, maxAttempts: f.maxAttempts.value }); toast('Limits saved'); }); }),
    on(el, 'click', '#test', async (_, b) => { const v = await formModal({ title: 'Test SMS gateway', submit: 'Send', fields: [{ name: 'phone', label: 'Mobile number', placeholder: '01XXXXXXXXX' }] }); if (v) busy(b, async () => { const r = await call('adminOtpTest', { phone: v.phone }); toast(r.mode === 'live' ? 'Test SMS sent' : 'Dev mode: message written to function logs'); }); }),
  ];
  return () => { offs.forEach((f) => f()); o.forEach((f) => f()); };
}
