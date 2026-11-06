// /admin — three stages: sign in (Firebase Auth) -> unlock (server-checked passphrase, lockout) -> panel.
import { html, render, $, on } from '../core/security.js';
import { logo } from '../components/logo.js';
import { toast, busy, spinner } from '../components/ui.js';
import { state, subscribe, login, logout } from '../services/auth.js';
import { call } from '../services/api.js';
import { adminUnlocked } from '../guards/admin-guard.js';

const TABS = [['', 'Dashboard', './dashboard.js'], ['users', 'Users', './users.js'], ['tournaments', 'Tournaments', './tournaments.js'], ['withdrawals', 'Withdrawals', './withdrawals.js'],
  ['keys', 'API keys', './keys.js'], ['sms', 'SMS & OTP', './sms.js'], ['settings', 'Settings', './settings.js']];
const IDLE_MS = 15 * 60e3;

export default function adminApp(root, { path, navigate }) {
  document.title = 'Admin · Khelastrix';
  let panelCleanup = null, unlocked = false, idle = null, stageToken = 0;
  const drop = () => { if (panelCleanup) { try { panelCleanup(); } catch (_) {} panelCleanup = null; } };

  const loginView = () => render(root, html`<div class="lock-wrap"><div class="card auth-card"><div class="logo-sm">${logo({ size: 76 })}</div><h3 style="text-align:center;margin-bottom:14px">Admin sign in</h3>
    <form id="lf"><label class="field"><span>Email</span><input class="input" name="e" type="email" required autocomplete="username"></label>
    <label class="field"><span>Password</span><input class="input" name="p" type="password" required autocomplete="current-password"></label><button class="btn block">Continue</button></form></div></div>`);
  const denied = () => render(root, html`<div class="lock-wrap"><div class="card auth-card" style="text-align:center"><h3>No admin access</h3><p class="muted" style="margin:8px 0 16px">This account is not an administrator.</p><button class="btn ghost" id="lo">Sign out</button></div></div>`);
  const unlockView = () => render(root, html`<div class="lock-wrap"><div class="card auth-card"><div class="logo-sm">${logo({ size: 76 })}</div><h3 style="text-align:center;margin-bottom:6px">Unlock admin</h3><p class="muted small" style="text-align:center;margin-bottom:14px">Enter your admin passphrase. Five wrong attempts lock this account for 15 minutes.</p>
    <form id="uf"><label class="field"><span>Passphrase</span><input class="input" name="x" type="password" required autocomplete="off"></label><button class="btn block">Unlock</button></form><p class="small muted" style="text-align:center;margin-top:12px"><a href="#" id="lo">Sign out</a></p></div></div>`);

  async function panel() {
    const seg = path.replace(/^\/admin\/?/, '').split('/')[0];
    const tab = TABS.find((t) => t[0] === seg) || TABS[0];
    render(root, html`<div class="adm"><header class="adm-top"><span class="brand">${logo({ size: 30, animate: false })}Admin</span><div class="row"><a class="btn ghost sm" href="/tournaments" data-link>Open app</a><button class="btn ghost sm" id="lk">Lock</button></div></header>
      <nav class="adm-nav">${TABS.map(([s, l]) => html`<a href="/admin${s ? '/' + s : ''}" data-link class="${s === tab[0] ? 'on' : ''}">${l}</a>`)}</nav><main class="adm-main" id="am">${spinner()}</main></div>`);
    const mod = await import(tab[2]);
    drop(); panelCleanup = await mod.default($('#am', root), { navigate });
  }
  async function stage() {
    const my = ++stageToken; drop();
    if (!state.user) { unlocked = false; return loginView(); }
    if (!state.isAdmin) return denied();
    unlocked = await adminUnlocked();
    if (my !== stageToken) return;
    unlocked ? panel() : unlockView();
  }
  const resetIdle = () => { clearTimeout(idle); idle = setTimeout(async () => { if (unlocked) { await call('adminLockSession').catch(() => {}); toast('Locked after inactivity'); stage(); } }, IDLE_MS); };
  ['click', 'keydown', 'touchstart'].forEach((ev) => document.addEventListener(ev, resetIdle, { passive: true }));

  const submit = async (e) => {
    e.preventDefault(); const f = e.target, b = $('button', f);
    if (f.id === 'lf') await busy(b, async () => { await login(f.e.value, f.p.value); });
    if (f.id === 'uf') await busy(b, async () => { await call('adminUnlock', { passphrase: f.x.value }); f.reset(); await stage(); resetIdle(); });
  };
  root.addEventListener('submit', submit);
  const o1 = on(root, 'click', '#lo', async (e) => { e.preventDefault(); await logout(); });
  const o2 = on(root, 'click', '#lk', async () => { await call('adminLockSession').catch(() => {}); stage(); });
  let first = true;
  const offS = subscribe(() => { if (first) { first = false; } stage(); });
  // in-admin tab navigation without re-running the unlock check
  const o3 = on(root, 'click', '.adm-nav a', (e, a) => { e.preventDefault(); e.stopPropagation(); history.pushState({}, '', a.getAttribute('href')); path = location.pathname; panel(); });
  return () => { drop(); offS(); o1(); o2(); o3(); clearTimeout(idle); root.removeEventListener('submit', submit); ['click', 'keydown', 'touchstart'].forEach((ev) => document.removeEventListener(ev, resetIdle)); };
    }
