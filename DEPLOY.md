# Khelastrix — deploy & test (project: ludofire-arena)

## 0. One-time console checks (https://console.firebase.google.com/project/ludofire-arena)
1. Authentication → Sign-in method → enable **Email/Password**.
2. Realtime Database → confirm it exists (URL must be `https://ludofire-arena-default-rtdb.firebaseio.com`).
3. Upgrade to **Blaze** (required for Cloud Functions + secrets).
4. Authentication → Settings → Authorized domains: add your Render domain / custom domain if not using Firebase Hosting.

## 1. Install & login
    npm i -g firebase-tools
    firebase login
    cd functions && npm install && cd ..

## 2. Secrets (never commit these)
    firebase functions:secrets:set OTP_PEPPER          # long random string
    firebase functions:secrets:set GAME_TOKEN_SECRET   # long random string
    firebase functions:secrets:set SMS_API_KEY         # SMS gateway key (any value while SMS_MODE=dev)
Optional `functions/.env`:  `SMS_MODE=dev`  (switch to `live` + set `SMS_API_URL`, `SMS_SENDER_ID`).

## 3. Deploy (Firebase Hosting + rules + functions)
    firebase deploy --project ludofire-arena
Hosting URLs: https://ludofire-arena.web.app and https://ludofire-arena.firebaseapp.com

## 4. Make yourself admin
Sign up in the app first, then (service-account JSON stays on YOUR machine, outside the repo):
    cd functions
    GOOGLE_APPLICATION_CREDENTIALS=/path/to/ludofire-arena-firebase-adminsdk-....json \
      node ../scripts/set-admin.js you@mail.com "a long admin passphrase"
Sign out/in, open `/admin`, unlock with the passphrase.

## 5. Test checklist
- Register / login; profile appears under `users/<uid>` with deposit 0, winning 0.
- Admin → API keys → create a **reader key**; copy it (shown once).
- Simulate the SMS app:
    curl -X POST https://asia-southeast1-ludofire-arena.cloudfunctions.net/ingestSms \
      -H "x-reader-key: KX-..." -H "content-type: application/json" \
      -d '{"trxId":"TEST123ABC","amount":100,"method":"bkash","sender":"01712345678"}'
  Expect `{"ok":true,"settled":false}`.
- In the app → Wallet → deposit with TrxID `TEST123ABC` (bkash) → balance +100. Repeating it must fail (already used).
- Admin → Tournaments → create one → join as a player (fee deducted) → room code visible only to joined players.
- Settle a result (admin or game server `gameResult`) → winning balance and leaderboard update.
- Local emulators (no cost): `firebase emulators:start` after `firebase init emulators`.

## Render alternative (static front-end only)
Render replaces *Hosting* only; Functions and the database remain on Firebase.
1. Push this folder to GitHub (the `.gitignore` already excludes service-account files).
2. Render → New → Blueprint → select the repo (uses `render.yaml`), or New → Static Site with publish dir `public`.
3. Add the resulting `*.onrender.com` domain to Firebase Auth → Authorized domains.
4. Still run `firebase deploy --only functions,database --project ludofire-arena`.

## Security notes
- The Admin SDK service-account JSON was shared in chat. It is NOT used by the web app or Functions (Functions use their built-in identity), and it is not included in the output. Use it only for `set-admin.js`; afterwards, delete the key in Google Cloud Console → IAM → Service Accounts → Keys and generate a new one if needed.
- `apiKey` in the web config is public by design; protect with rules, App Check, and API-key restrictions (Google Cloud → Credentials → HTTP referrer restriction to your domains).
- `measurementId` is stored but Analytics is not initialised (CSP would also need extra hosts).
