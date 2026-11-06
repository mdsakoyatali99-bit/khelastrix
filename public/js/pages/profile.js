import { ref, set } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js';
import { db } from '../core/firebase.js';
import { html, render, $, on } from '../core/security.js';
import { shell } from '../components/shell.js';
import { toast, busy } from '../components/ui.js';
import { state, subscribe, logout } from '../services/auth.js';
import { call } from '../services/api.js';
import { canInstall, promptInstall, onInstallChange, isStandalone } from '../core/pwa.js';

export default function page(root, { navigate }) {
  const { content, dispose } = shell(root, '/profile');
  let step = 'phone', phone = '', cool = 0, timer = null;
  const draw = () => {
    const p = state.profile || {};
    render(content, html`<div class="card" style="margin-bottom:14px"><h3 style="margin-bottom:10px">Profile</h3><p class="muted small" style="margin-bottom:12px">${p.email}</p>
      <form id="nm"><label class="field"><span>Username</span><input class="input" name="u" value="${p.username || ''}" minlength="3" maxlength="20" pattern="[A-Za-z0-9_ ]+" required></label><button class="btn sm">Save name</button></form></div>
      <div class="card" style="margin-bottom:14px"><div class="row between"><h3>Phone</h3>${p.phoneVerified ? html`<span class="tag ok">verified</span>` : html`<span class="tag warn">not verified</span>`}</div>
      ${p.phoneVerified ? html`<p class="muted small" style="margin-top:8px">${p.phone}</p>` : step === 'phone'
        ? html`<form id="ph" style="margin-top:10px"><label class="field"><span>Mobile number</span><input class="input" name="p" inputmode="numeric" placeholder="01XXXXXXXXX" required></label><button class="btn sm" ${cool ? 'disabled' : ''}>${cool ? `Wait ${cool}s` : 'Send code'}</button></form>`
        : html`<form id="cd" style="margin-top:10px"><label class="field"><span>6-digit code sent to ${phone}</span><input class="input mono" name="c" inputmode="numeric" maxlength="6" pattern="[0-9]{6}" required></label><div class="row"><button class="btn sm">Verify</button><button type="button" class="btn ghost sm" data-resend ${cool ? 'disabled' : ''}>${cool ? `Resend in ${cool}s` : 'Resend code'}</button></div></form>`}</div>
      <div class="grid">${!isStandalone() && canInstall() ? html`<button class="btn gold block" id="inst">Install app</button>` : ''}
      ${state.isAdmin ? html`<a class="btn ghost block" href="/admin" data-link>Admin panel</a>` : ''}<button class="btn ghost block" id="out">Log out</button></div>`);
  };
  const tick = () => { cool = Math.max(0, cool - 1); if (!cool) { clearInterval(timer); timer = null; } draw(); };
  const startCool = (s) => { cool = s; clearInterval(timer); timer = setInterval(tick, 1000); };
  const offs = [subscribe(draw), onInstallChange(draw)];
  const send = async (b, ph) => busy(b, async () => { const r = await call('requestOtp', { phone: ph }); phone = ph; step = 'code'; startCool(r.cooldownSec); toast('Code sent'); draw(); });
  const sub = async (e) => {
    e.preventDefault(); const f = e.target;
    if (f.id === 'nm') await busy($('button', f), async () => { await set(ref(db, `users/${state.user.uid}/username`), f.u.value.trim()); toast('Saved'); });
    if (f.id === 'ph') await send($('button', f), f.p.value.trim());
    if (f.id === 'cd') await busy($('button', f), async () => { await call('verifyOtp', { phone, code: f.c.value.trim() }); toast('Phone verified'); });
  };
  content.addEventListener('submit', sub);
  const o1 = on(content, 'click', '[data-resend]', (_, b) => send(b, phone));
  const o2 = on(content, 'click', '#inst', () => promptInstall());
  const o3 = on(content, 'click', '#out', async () => { await logout(); navigate('/', { replace: true }); });
  return () => { offs.forEach((f) => f()); clearInterval(timer); content.removeEventListener('submit', sub); o1(); o2(); o3(); dispose(); };
}
