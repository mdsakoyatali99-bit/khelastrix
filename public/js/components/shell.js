import { html, render, $, taka, raw } from '../core/security.js';
import { logo } from './logo.js';
import { subscribe, balances } from '../services/auth.js';

const ICON = {
  trophy: '<path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0V4ZM17 5h3v2a3 3 0 0 1-3 3M7 5H4v2a3 3 0 0 0 3 3"/>',
  wallet: '<path d="M3 7a2 2 0 0 1 2-2h13v4M3 7v10a2 2 0 0 0 2 2h14a1 1 0 0 0 1-1v-9a1 1 0 0 0-1-1H5a2 2 0 0 1-2-2Z"/><circle cx="16.5" cy="13.5" r="1"/>',
  board: '<path d="M5 20V10M12 20V4M19 20v-7"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21c1-4 4-6 8-6s7 2 8 6"/>',
};
const tabs = [['/tournaments', 'Play', 'trophy'], ['/wallet', 'Wallet', 'wallet'], ['/leaderboard', 'Ranks', 'board'], ['/profile', 'Me', 'user']];

/** Renders the app shell and returns {content, dispose}. */
export function shell(root, active) {
  render(root, html`<div class="shell">
    <header class="topbar"><a href="/" data-link class="brand">${logo({ size: 34, animate: false })}<span>Khelastrix</span></a><a href="/wallet" data-link class="bal-chip" aria-label="Wallet balance"><span id="chip">৳0</span></a></header>
    <main id="content"></main></div>
    <nav class="tabbar" aria-label="Main">${tabs.map(([href, label, ic]) => html`<a href="${href}" data-link class="${href === active ? 'on' : ''}"><svg viewBox="0 0 24 24" aria-hidden="true">${raw(ICON[ic])}</svg>${label}</a>`)}</nav>`);
  const off = subscribe(() => { const b = balances(); const c = $('#chip', root); if (c) c.textContent = taka(b.deposit + b.winning); });
  return { content: $('#content', root), dispose: off };
}
