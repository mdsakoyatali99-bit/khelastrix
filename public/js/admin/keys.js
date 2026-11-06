import { ref, onValue } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js';
import { db } from '../core/firebase.js';
import { html, render, on, ago } from '../core/security.js';
import { toast, busy, formModal, confirmBox, infoModal } from '../components/ui.js';
import { call } from '../services/api.js';
import { firebaseConfig, FUNCTIONS_REGION } from '../config/firebase-config.js';

const BASE = `https://${FUNCTIONS_REGION}-${firebaseConfig.projectId}.cloudfunctions.net`;
const KINDS = { reader: { path: 'readerKeys', title: 'SMS reader keys', hint: 'One key per Android phone running the SMS reader app.', scopeLabel: 'Allowed method', scope: ['bkash', 'nagad', 'rocket'], url: `${BASE}/ingestSms`, hdr: 'x-reader-key' },
  game: { path: 'gameKeys', title: 'Game server keys', hint: 'One key per custom Ludo / Carrom game server.', scopeLabel: 'Allowed game', scope: ['ludo', 'carrom'], url: `${BASE}/gameResult`, hdr: 'x-game-key' } };

export default function keys(el) {
  const data = { reader: {}, game: {} };
  const section = (k) => { const K = KINDS[k]; return html`<div class="card" style="margin-bottom:16px"><div class="row between wrap"><div><h3>${K.title}</h3><p class="muted small">${K.hint}</p></div><button class="btn" data-new="${k}">Generate key</button></div>
    <p class="small muted" style="margin:10px 0">Endpoint <span class="mono">${K.url}</span> · header <span class="mono">${K.hdr}</span></p>
    <div class="table-wrap"><table><thead><tr><th>Name</th><th>Key</th><th>Scope</th><th>Last seen</th><th>Status</th><th></th></tr></thead><tbody>
    ${Object.entries(data[k]).map(([id, r]) => html`<tr><td><b>${r.name}</b><div class="small muted">${ago(r.createdAt)}</div></td><td class="mono">KX-••••-${r.hint}</td><td>${(r.methods || r.games || []).join(', ') || 'all'}</td><td>${ago(r.lastSeen)}</td>
      <td><span class="tag ${r.active ? 'ok' : 'bad'}">${r.active ? 'active' : 'disabled'}</span></td><td><div class="row wrap"><button class="btn sm ghost" data-t="${k}|${id}|${r.active ? 0 : 1}">${r.active ? 'Disable' : 'Enable'}</button><button class="btn sm danger" data-d="${k}|${id}">Revoke</button></div></td></tr>`)}</tbody></table>
    ${Object.keys(data[k]).length ? '' : html`<div class="empty">No keys yet.</div>`}</div></div>`; };
  const draw = () => render(el, html`${section('reader')}${section('game')}`);
  const offs = Object.entries(KINDS).map(([k, K]) => onValue(ref(db, K.path), (s) => { data[k] = s.val() || {}; draw(); }));
  const o = [
    on(el, 'click', '[data-new]', async (_, b) => {
      const k = b.dataset.new, K = KINDS[k];
      const v = await formModal({ title: 'Generate key', submit: 'Generate', fields: [{ name: 'name', label: 'Device / server name', placeholder: k === 'reader' ? 'Phone A · bKash SIM' : 'Ludo server' }, { name: 'scope', label: K.scopeLabel, type: 'select', options: [{ value: '', label: 'All' }, ...K.scope] }] });
      if (!v) return;
      await busy(b, async () => {
        const r = await call('adminCreateKey', { kind: k, name: v.name, scope: v.scope ? [v.scope] : [] });
        await infoModal('Copy this key now', html`<p class="muted small">It is shown only once. We store only a one-way hash, so it cannot be recovered later.</p><div class="key-reveal" id="kv">${r.key}</div><button class="btn sm" id="cp">Copy</button>`);
      });
    }),
    on(el, 'click', '[data-t]', (_, b) => { const [kind, id, on_] = b.dataset.t.split('|'); busy(b, () => call('adminSetKeyActive', { kind, id, active: on_ === '1' })); }),
    on(el, 'click', '[data-d]', async (_, b) => { const [kind, id] = b.dataset.d.split('|'); if (await confirmBox('Revoke key', 'The device loses access on its next request. This cannot be undone.', { danger: true, submit: 'Revoke' })) busy(b, async () => { await call('adminDeleteKey', { kind, id }); toast('Key revoked'); }); }),
  ];
  const cp = (e) => { if (e.target.id === 'cp') { navigator.clipboard?.writeText(document.getElementById('kv').textContent); toast('Copied'); } };
  document.addEventListener('click', cp);
  return () => { offs.forEach((f) => f()); o.forEach((f) => f()); document.removeEventListener('click', cp); };
}
