import { html, render, $, on } from '../core/security.js';
import { logo } from '../components/logo.js';
import { toast, busy } from '../components/ui.js';
import { login, signup, resetPassword } from '../services/auth.js';

export default function authPage(root, { path, navigate }) {
  let mode = path === '/signup' ? 'signup' : 'login';
  const draw = () => {
    render(root, html`<div class="auth-wrap"><div class="card auth-card">
      <div class="logo-sm">${logo({ size: 84 })}</div>
      <div class="seg"><button data-m="login" class="${mode === 'login' ? 'on' : ''}">Log in</button><button data-m="signup" class="${mode === 'signup' ? 'on' : ''}">Sign up</button></div>
      <form id="f" novalidate>
        ${mode === 'signup' ? html`<label class="field"><span>Username</span><input class="input" name="u" minlength="3" maxlength="20" pattern="[A-Za-z0-9_ ]+" required autocomplete="nickname"></label>` : ''}
        <label class="field"><span>Email</span><input class="input" name="e" type="email" required autocomplete="email"></label>
        <label class="field"><span>Password</span><input class="input" name="p" type="password" minlength="8" required autocomplete="${mode === 'login' ? 'current-password' : 'new-password'}"></label>
        <button class="btn block" type="submit">${mode === 'login' ? 'Log in' : 'Create account'}</button>
        ${mode === 'login' ? html`<p class="small muted" style="text-align:center;margin-top:12px"><a href="#" id="forgot">Forgot password?</a></p>` : ''}
      </form></div></div>`);
  };
  draw();
  const o1 = on(root, 'click', '[data-m]', (_, b) => { mode = b.dataset.m; history.replaceState({}, '', '/' + mode); draw(); });
  const o2 = on(root, 'click', '#forgot', async (e) => { e.preventDefault(); const em = $('input[name=e]', root).value; if (!em) return toast('Enter your email first', 'err'); await resetPassword(em); toast('If that email exists, a reset link is on its way.'); });
  const submit = async (e) => {
    e.preventDefault();
    const f = e.target; if (!f.checkValidity()) { f.reportValidity(); return; }
    await busy($('button[type=submit]', f), async () => {
      if (mode === 'login') await login(f.e.value, f.p.value); else await signup(f.u.value.trim(), f.e.value, f.p.value);
      navigate('/tournaments', { replace: true });
    });
  };
  root.addEventListener('submit', submit);
  return () => { o1(); o2(); root.removeEventListener('submit', submit); };
}
