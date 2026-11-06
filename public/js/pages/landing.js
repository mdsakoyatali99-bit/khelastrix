import { html, render, $, on, raw } from '../core/security.js';
import { logo, feathers } from '../components/logo.js';
import { canInstall, promptInstall, onInstallChange, isStandalone, isIOS } from '../core/pwa.js';
import { infoModal, toast } from '../components/ui.js';
import { state } from '../services/auth.js';

export default function landing(root, { navigate }) {
  if (isStandalone() && state.user) { navigate('/tournaments', { replace: true }); return; }
  const modes = [['1v1', 'Head to head', 'Two players, one board. Fastest way to settle it.'], ['2v2', 'Team up', 'Pair with a partner and take on another duo.'], ['4 players', 'Free for all', 'Four seats, one winner, prizes for the top finishers.']];
  render(root, html`<div class="land"><div class="land-bg"></div><div class="feathers">${feathers()}</div>
    <nav class="nav"><span class="brand">${logo({ size: 38 })}Khelastrix</span>
      <a class="btn ghost sm" href="${state.user ? '/tournaments' : '/login'}" data-link>${state.user ? 'Open app' : 'Log in'}</a></nav>
    <section class="hero"><div>
      <h1>Win real prizes at <em>Ludo</em> and <em>Carrom</em></h1>
      <p>Join a tournament, play on our own game boards, and get paid the moment the match ends. Deposits through bKash, Nagad and Rocket are credited automatically.</p>
      <div class="cta"><button class="btn gold" id="install">Download app</button><a class="btn ghost" href="${state.user ? '/tournaments' : '/signup'}" data-link>${state.user ? 'Browse tournaments' : 'Create free account'}</a></div>
      <div class="install-hint" id="hint"></div></div>
      <div class="hero-art"><div class="halo"></div><div class="logo-big">${logo({ size: 360 })}</div></div></section>
    <section class="section"><h2>Pick how you play</h2><div class="modes">${modes.map(([t, h, d]) => html`<div class="card mode"><b>${t}</b><h3>${h}</h3><p class="muted">${d}</p></div>`)}</div></section>
    <section class="section"><h2>From deposit to payout</h2><div class="steps">
      <div class="card"><h3>Add money</h3><p class="muted">Send to our number, paste your TrxID. Your wallet updates by itself.</p></div>
      <div class="card"><h3>Join a match</h3><p class="muted">Pick a Ludo or Carrom tournament and take a seat.</p></div>
      <div class="card"><h3>Win and withdraw</h3><p class="muted">Prizes land in your wallet right after the final result.</p></div></div></section>
    <footer class="foot">© Khelastrix · khelastrix.com · Play responsibly. 18+ only.</footer></div>`);

  const btn = $('#install', root), hint = $('#hint', root);
  const sync = () => { if (isStandalone()) { btn.style.display = 'none'; hint.textContent = ''; } else hint.textContent = canInstall() ? 'Installs like a native app. No browser bar, works full screen.' : ''; };
  sync();
  const offI = onInstallChange(sync);
  const offC = on(root, 'click', '#install', async () => {
    if (canInstall()) { const r = await promptInstall(); if (r === 'accepted') toast('Installing Khelastrix…'); return; }
    await infoModal('Install Khelastrix', isIOS()
      ? html`<p class="muted">Tap the <b>Share</b> button in Safari, then <b>Add to Home Screen</b>.</p>`
      : html`<p class="muted">Open your browser menu (⋮) and choose <b>Install app</b> or <b>Add to Home screen</b>. If you don't see it, open this page in Chrome.</p>`);
  });
  return () => { offI(); offC(); };
}
