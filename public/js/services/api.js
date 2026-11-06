import { httpsCallable } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-functions.js';
import { fns } from '../core/firebase.js';

/** Call a Cloud Function. All money / key / result logic lives server-side. */
export async function call(name, data = {}) {
  try { return (await httpsCallable(fns, name)(data)).data; }
  catch (e) {
    const known = ['invalid-argument', 'failed-precondition', 'permission-denied', 'resource-exhausted', 'already-exists', 'not-found', 'unauthenticated', 'deadline-exceeded', 'unavailable'];
    const code = String(e.code || '').replace('functions/', '');
    const err = new Error(known.includes(code) ? e.message : 'Request failed. Please try again.');
    err.code = code; throw err;
  }
}
