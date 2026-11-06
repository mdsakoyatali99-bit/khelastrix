import { ref, query, orderByChild, limitToLast, onValue } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js';
import { db } from '../core/firebase.js';
import { html, render, taka } from '../core/security.js';
import { shell } from '../components/shell.js';
import { spinner } from '../components/ui.js';
import { state } from '../services/auth.js';

export default function page(root) {
  const { content, dispose } = shell(root, '/leaderboard');
  render(content, spinner());
  const off = onValue(query(ref(db, 'leaderboard'), orderByChild('earnings'), limitToLast(50)), (s) => {
    const rows = Object.entries(s.val() || {}).map(([uid, v]) => ({ uid, ...v })).sort((a, b) => b.earnings - a.earnings);
    render(content, html`<div class="card"><h3 style="margin-bottom:6px">Top earners</h3>${rows.length ? rows.map((r, i) => html`<div class="lb-row"><div class="lb-rank">${i + 1}</div>
      <div style="flex:1"><b>${r.name}</b>${r.uid === state.user.uid ? html` <span class="tag">you</span>` : ''}<div class="small muted">${r.wins} wins · ${r.played} played</div></div><b style="color:var(--gold)">${taka(r.earnings)}</b></div>`) : html`<div class="empty">The board fills up after the first finished match.</div>`}</div>`);
  });
  return () => { off(); dispose(); };
}
