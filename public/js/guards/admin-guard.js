import { ref, get } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js';
import { db } from '../core/firebase.js';
import { state } from '../services/auth.js';

/** True only when the server's rules accept this session as an unlocked admin (claim + live session). */
export async function adminUnlocked() {
  if (!state.user || !state.isAdmin) return false;
  try { await get(ref(db, 'config/private')); return true; } catch { return false; }
}
