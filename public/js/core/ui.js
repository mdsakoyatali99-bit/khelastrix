import { html, render, $, on, raw, esc } from '../core/security.js';

export function toast(msg, kind = 'ok') {
  const el = document.createElement('div');
  el.className = `toast ${kind}`; el.textContent = msg; // textContent: always safe
  document.getElementById('toasts').append(el);
  setTimeout(() => el.remove(), 3800);
}
export const spinner = () => html`<div class="spin" role="status" aria-label="Loading"></div>`;

/** Modal with a form. fields: [{name,label,type,value,options,placeholder,required}] -> resolves values or null. */
export function formModal({ title, fields = [], submit = 'Save', danger = false, body = null }) {
  return new Promise((resolve) => {
    const root = document.getElementById('modal-root');
    const inputs = fields.map((f) => f.type === 'select'
      ? html`<label class="field"><span>${f.label}</span><select class="input" name="${f.name}">${f.options.map((o) => html`<option value="${o.value ?? o}" ${String(o.value ?? o) === String(f.value) ? 'selected' : ''}>${o.label ?? o}</option>`)}</select></label>`
      : html`<label class="field"><span>${f.label}</span><input class="input" name="${f.name}" type="${f.type || 'text'}" value="${f.value ?? ''}" placeholder="${f.placeholder || ''}" ${f.required === false ? '' : 'required'} autocomplete="off" ${f.step ? raw(`step="${esc(f.step)}"`) : ''}></label>`);
    render(root, html`<div class="modal-bg" role="dialog" aria-modal="true"><form class="modal"><h3>${title}</h3>${body}${inputs}
      <div class="row" style="justify-content:flex-end;margin-top:6px"><button type="button" class="btn ghost" data-x>Cancel</button><button class="btn ${danger ? 'danger' : ''}">${submit}</button></div></form></div>`);
    const form = $('form', root);
    const close = (v) => { root.innerHTML = ''; resolve(v); };
    on(root, 'click', '[data-x]', () => close(null));
    $('.modal-bg', root).addEventListener('mousedown', (e) => { if (e.target.classList.contains('modal-bg')) close(null); });
    form.addEventListener('submit', (e) => { e.preventDefault(); close(Object.fromEntries(new FormData(form))); });
    const first = form.querySelector('input,select'); if (first) first.focus();
  });
}
export async function confirmBox(title, text, { danger = false, submit = 'Confirm' } = {}) {
  return !!(await formModal({ title, submit, danger, body: html`<p class="muted" style="margin-bottom:14px">${text}</p>` }));
}
export function infoModal(title, bodyHtml) {
  return new Promise((resolve) => {
    const root = document.getElementById('modal-root');
    render(root, html`<div class="modal-bg"><div class="modal"><h3>${title}</h3>${bodyHtml}<div class="row" style="justify-content:flex-end;margin-top:12px"><button class="btn" data-x>Done</button></div></div></div>`);
    on(root, 'click', '[data-x]', () => { root.innerHTML = ''; resolve(); });
  });
}
/** Run an async action on a button with busy state + error toast. */
export async function busy(btn, fn) {
  if (btn) btn.disabled = true;
  try { return await fn(); } catch (e) { toast(e.message || 'Something went wrong', 'err'); } finally { if (btn) btn.disabled = false; }
}
