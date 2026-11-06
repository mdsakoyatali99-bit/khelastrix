// Pure-SVG avian-wing logo. SMIL animation: wing flap + pulsing edge glow. No images, no external files.
import { raw } from '../core/security.js';
let n = 0;
const reduce = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

export function logo({ size = 120, animate = true } = {}) {
  const id = 'kx' + ++n, anim = animate && !reduce();
  const wing = (dir) => `
    <g>${anim ? `<animateTransform attributeName="transform" type="rotate" values="0 47 60;${-4 * dir} 47 60;0 47 60" dur="4s" repeatCount="indefinite" calcMode="spline" keySplines=".4 0 .6 1;.4 0 .6 1"/>` : ''}
      <path d="M47 56C38 42 24 31 8 27c7 11 14 22 25 34Z" fill="url(#${id}w)"/>
      <path d="M47 62C39 52 27 46 14 45c6 8 12 16 21 24Z" fill="url(#${id}w)" opacity=".78"/>
      <path d="M47 68c-6-6-15-9-25-8 5 6 10 12 17 17Z" fill="url(#${id}w)" opacity=".58"/>
      <path d="M47 56C38 42 24 31 8 27" fill="none" stroke="#3ff0d0" stroke-width="1.6" stroke-linecap="round" filter="url(#${id}b)">
        ${anim ? '<animate attributeName="stroke-opacity" values=".2;1;.2" dur="3.2s" repeatCount="indefinite"/>' : ''}</path>
    </g>`;
  return raw(`<svg viewBox="0 0 100 100" width="${size}" height="${size}" role="img" aria-label="Khelastrix logo" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="${id}w" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#3ff0d0"/><stop offset=".55" stop-color="#7a5cff"/><stop offset="1" stop-color="#ff7ab8"/></linearGradient>
      <radialGradient id="${id}g"><stop offset="0" stop-color="#ffe9a8"/><stop offset=".6" stop-color="#ffc857"/><stop offset="1" stop-color="#ff8a3d"/></radialGradient>
      <filter id="${id}b" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="2"/></filter>
    </defs>
    ${wing(1)}<g transform="translate(100 0) scale(-1 1)">${wing(1)}</g>
    <path d="M50 38l8 17-8 24-8-24Z" fill="#0a0b1a" stroke="url(#${id}w)" stroke-width="1.4"/>
    <circle cx="50" cy="55" r="5" fill="url(#${id}g)">${anim ? '<animate attributeName="r" values="4;6;4" dur="2.4s" repeatCount="indefinite"/>' : ''}</circle>
  </svg>`);
}

// Decorative drifting feathers for the landing background (SVG + CSS only).
export function feathers() {
  const f = (x, y, s, d, o) => `<g transform="translate(${x} ${y}) scale(${s})" opacity="${o}"><path d="M0 0C10-20 28-34 52-40 40-22 24-6 0 0Z" fill="#7a5cff"><animateTransform attributeName="transform" type="translate" values="0 0;12 -18;0 0" dur="${d}s" repeatCount="indefinite"/></path></g>`;
  return raw(`<svg viewBox="0 0 400 700" preserveAspectRatio="xMidYMid slice" aria-hidden="true">${f(40, 120, 1.2, 9, .5)}${f(310, 220, .8, 11, .4)}${f(90, 420, 1.5, 13, .3)}${f(280, 560, 1, 10, .45)}${f(180, 40, .7, 12, .35)}</svg>`);
}
