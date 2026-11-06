import { route, startRouter } from './core/router.js';
import { initPWA } from './core/pwa.js';
import { initAuth } from './services/auth.js';
import { requireUser, guestOnly } from './guards/auth-guard.js';
import { logo } from './components/logo.js';
import { render } from './core/security.js';

initPWA();
render(document.getElementById('boot-logo'), logo({ size: 110 }));

route('/', () => import('./pages/landing.js'));
route('/login', () => import('./pages/auth.js'), { guard: guestOnly });
route('/signup', () => import('./pages/auth.js'), { guard: guestOnly });
route('/tournaments', () => import('./pages/tournaments.js'), { guard: requireUser });
route('/home', () => import('./pages/tournaments.js'), { guard: requireUser });
route('/wallet', () => import('./pages/wallet.js'), { guard: requireUser });
route('/leaderboard', () => import('./pages/leaderboard.js'), { guard: requireUser });
route('/profile', () => import('./pages/profile.js'), { guard: requireUser });
route('/admin*', () => import('./admin/admin-app.js'));        // khelastrix.com/admin
route('.*', () => import('./pages/landing.js'), { fallback: true });

(async () => {
  try { await initAuth(); } catch (e) { console.error(e); }
  await startRouter();
  const boot = document.getElementById('boot'); boot.classList.add('gone'); setTimeout(() => boot.remove(), 400);
})();
