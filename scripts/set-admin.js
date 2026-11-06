#!/usr/bin/env node
/**
 * Make an existing Firebase Auth user an admin and set their admin passphrase (second factor).
 * Usage:  GOOGLE_APPLICATION_CREDENTIALS=./serviceAccount.json \
 *         FIREBASE_DATABASE_URL=https://<project>-default-rtdb.<region>.firebasedatabase.app \
 *         node scripts/set-admin.js admin@example.com "long passphrase here"
 * Run from the functions/ folder's node_modules (cd functions && npm i) or: NODE_PATH=functions/node_modules node scripts/set-admin.js ...
 */
const admin = require('firebase-admin');
const crypto = require('crypto');
const [email, pass] = process.argv.slice(2);
if (!email || !pass || pass.length < 12) { console.error('Usage: set-admin.js <email> "<passphrase, 12+ chars>"'); process.exit(1); }
admin.initializeApp({ databaseURL: process.env.FIREBASE_DATABASE_URL || 'https://ludofire-arena-default-rtdb.firebaseio.com' });
(async () => {
  const u = await admin.auth().getUserByEmail(email);
  await admin.auth().setCustomUserClaims(u.uid, { admin: true });
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(pass, salt, 64).toString('hex');
  await admin.database().ref(`adminSecrets/${u.uid}`).set(`${salt.toString('hex')}:${hash}`);
  console.log(`✔ ${email} (${u.uid}) is now admin. Sign out and back in to refresh the token.`);
  process.exit(0);
})().catch((e) => { console.error(e.message); process.exit(1); });
