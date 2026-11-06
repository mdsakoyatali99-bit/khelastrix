import { onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut, sendPasswordResetEmail } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js';
import { ref, onValue, set, get } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js';
import { auth, db } from '../core/firebase.js';

export const state = { user: null, profile: null, isAdmin: false, ready: false };
const subs = new Set();
let offProfile = null;
const emit = () => subs.forEach((f) => f(state));
export const subscribe = (f) => { subs.add(f); f(state); return () => subs.delete(f); };

export function initAuth() {
  return new Promise((resolve) => {
    onAuthStateChanged(auth, async (user) => {
      state.user = user; state.profile = null; state.isAdmin = false;
      if (offProfile) { offProfile(); offProfile = null; }
      if (user) {
        try { state.isAdmin = (await user.getIdTokenResult()).claims.admin === true; } catch (_) {}
        offProfile = onValue(ref(db, `users/${user.uid}`), (s) => { state.profile = s.val(); emit(); });
      }
      if (!state.ready) { state.ready = true; resolve(); }
      emit();
    });
  });
}

// ---- client-side login throttle (UX only; real throttling is enforced by Firebase Auth) ----
const KEY = 'kx_lg';
function throttle() {
  try { const s = JSON.parse(localStorage.getItem(KEY) || '{}'); return s.until > Date.now() ? Math.ceil((s.until - Date.now()) / 1000) : 0; } catch { return 0; }
}
function fail() {
  try { const s = JSON.parse(localStorage.getItem(KEY) || '{}'); const n = (s.n || 0) + 1; localStorage.setItem(KEY, JSON.stringify({ n, until: n >= 3 ? Date.now() + Math.min(900, 15 * 2 ** (n - 3)) * 1000 : 0 })); } catch (_) {}
}
export async function login(email, password) {
  const wait = throttle();
  if (wait) throw new Error(`Too many attempts. Try again in ${wait}s.`);
  try { await signInWithEmailAndPassword(auth, email.trim(), password); localStorage.removeItem(KEY); }
  catch (e) {
    if (e.code === 'auth/too-many-requests') throw new Error('Too many attempts. Please wait a few minutes.');
    fail(); throw new Error('Incorrect email or password.');
  }
}
export async function signup(username, email, password) {
  let cred;
  try { cred = await createUserWithEmailAndPassword(auth, email.trim(), password); }
  catch (e) { throw new Error(e.code === 'auth/email-already-in-use' ? 'This email is already registered.' : e.code === 'auth/weak-password' ? 'Password must be at least 8 characters.' : 'Could not create account.'); }
  // the server creates the profile (zero balances); wait for it, then set the username
  for (let i = 0; i < 20; i++) { if ((await get(ref(db, `users/${cred.user.uid}/deposit`))).exists()) break; await new Promise((r) => setTimeout(r, 400)); }
  try { await set(ref(db, `users/${cred.user.uid}/username`), username); } catch (_) {}
}
export const logout = () => signOut(auth);
export const resetPassword = (email) => sendPasswordResetEmail(auth, email.trim()).catch(() => {});
export const balances = () => ({ deposit: Number(state.profile?.deposit) || 0, winning: Number(state.profile?.winning) || 0 });
