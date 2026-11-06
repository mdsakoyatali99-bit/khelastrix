# Khelastrix — tournament platform (Ludo & Carrom)

Static PWA (no build step) + Firebase Realtime Database + Cloud Functions (Node 20).
Every operation that touches money, keys or results runs in Cloud Functions. Clients cannot write balances.

```
public/                 PWA: index.html, manifest.json, sw.js, css/, js/
  js/config/            firebase-config.js  (paste your web config)
  js/core/              router (History API), security (XSS-safe html``), pwa, firebase init
  js/services/          auth, api (callable wrapper)
  js/guards/            auth-guard, admin-guard
  js/components/        logo (pure SVG/SMIL), shell, ui (toast/modal)
  js/pages/             landing, auth, tournaments, wallet, leaderboard, profile
  js/admin/             /admin: login → unlock → dashboard, users, tournaments, withdrawals, keys, sms, settings
functions/              Cloud Functions (deposits, keys, otp, games, wallet, tournaments, adminAuth)
database.rules.json     Realtime Database rules (deny by default)
scripts/                set-admin.js, make-icons.py
games/                  game-server example + SMS reader protocol
```

## Setup
1. Firebase Console: create a project, enable **Authentication → Email/Password**, create a **Realtime Database**, upgrade to **Blaze** (Functions need it).
2. Register a Web App and paste its config into `public/js/config/firebase-config.js`. `.firebaserc` already points at `ludofire-arena`.
3. `npm i -g firebase-tools && firebase login`, then `cd functions && npm install`.
4. Secrets: `firebase functions:secrets:set OTP_PEPPER` (any long random string), `GAME_TOKEN_SECRET` (long random), `SMS_API_KEY` (your SMS provider key, or any value in dev mode).
5. Params (prompted at deploy, or put in `functions/.env`): `SMS_MODE=dev|live`, `SMS_API_URL`, `SMS_SENDER_ID`. Adapt `sendSms()` in `functions/src/otp.js` to your gateway's parameter names.
6. `firebase deploy` (hosting, database rules, functions).
7. Create an account in the app, then make it admin:
   `cd functions && GOOGLE_APPLICATION_CREDENTIALS=../serviceAccount.json FIREBASE_DATABASE_URL=<your rtdb url> node ../scripts/set-admin.js you@mail.com "a long admin passphrase"` (run `npm i` first; sign out and in again afterwards). Open `khelastrix.com/admin`.

## Admin security model
Firebase Auth password → custom claim `admin` → **server-checked passphrase unlock** (scrypt hash, 5 failures = 15 min lockout, enforced in `adminUnlock`) → 2 h session, auto-lock after 15 min idle. Database rules and every admin function require both the claim and a live session, so a stolen password alone is not enough. The login throttle in the browser is only UX; real throttling is Firebase Auth's and the unlock lockout.

## Payments (auto deposit)
Admin → API keys → generate a **reader key** per phone (optionally limited to bKash / Nagad / Rocket). Only a SHA-256 hash is stored; the key is shown once. The SMS app POSTs to `ingestSms` (see `games/sms-reader-protocol.md`). User pastes TrxID → `claimDeposit` credits atomically, or registers a pending claim that is credited the moment the SMS arrives. Revoking a key blocks the next request.
Check the parser against your real SMS texts (`parseSms` in `functions/src/deposits.js`); structured fields from the app are preferred.

## Games
Admin → API keys → **game key** per game server. Players get a 10-minute signed launch token (`getLaunchToken`); the game server verifies it with `verifyLaunchToken` and, at the end, posts the ranking to `gameResult`. Prizes come from the tournament's prize table, a result can be settled only once, and wallets and leaderboard update live in every player's app. See `games/game-server-example.js`.

## Security notes
- XSS: all templates escape by default (`html```), strict CSP in `firebase.json`, no inline scripts.
- Injection: no SQL anywhere; all inputs validated server-side. Rules are deny-by-default.
- CSRF: no cookies or sessions; every call carries a Firebase ID token.
- The Firebase web `apiKey` is public by design. Sensitive values (SMS key, token secrets) live in Functions secrets. Enable **App Check** (set `APPCHECK_SITE_KEY`, deploy with `ENFORCE_APPCHECK=true`) for extra abuse protection.
- Not run end to end here: I had no Firebase project or emulator available. Test deposit, join, settle and OTP on a test project (or the Emulator Suite) before going live.
