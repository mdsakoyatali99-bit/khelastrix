# Khelastrix — secure version (Firebase project: ludofire-arena)

Same app and features as before (single files `public/user.html` and `public/admin.html`), but money logic now runs on the server and the database is locked.

## What is different from the old version
- Old: wallet, join, withdraw, deposit were written by the browser (anyone could give themselves money) and the admin "PIN" was `1234` in the page. **New:** the browser cannot write balances; everything goes through Cloud Functions; the admin logs in with a real account.
- Room ID/password is visible only to players who joined.
- User text is HTML-escaped (no script injection). Passwords min 8.
- New: Admin → **SMS Reader** keys and **Game API Keys** (see SMS_API.md, GAME_API.md). Keys are stored hashed.
- Old users/data lived in the old Firebase project; this is a fresh database (users must register again).

## 1. Firebase console (https://console.firebase.google.com/project/ludofire-arena)
1. Build → Authentication → Sign-in method → enable **Email/Password**.
2. Build → Realtime Database → make sure it exists.
3. Upgrade to **Blaze** plan (required for Functions; the free quota is normally enough).

## 2. Deploy (needs a computer, or GitHub Codespaces from your phone browser)
    npm i -g firebase-tools
    firebase login --no-localhost
    cd functions && npm install && cd ..
    firebase functions:secrets:set ADMIN_SETUP_CODE      # type a strong secret code
    firebase deploy --project ludofire-arena
App: https://ludofire-arena.web.app/user.html · Admin: https://ludofire-arena.web.app/admin.html

Phone-only: open github.com → create repo → upload this folder → press `.`/Codespaces → run the commands above in its terminal.

## 3. Become admin (once)
1. Open the user app, register your own account.
2. Open `/admin.html`, log in with that email+password → "First time? Become the admin" → enter the setup code → Activate.
Only the first account can ever do this. Then delete the secret if you like: `firebase functions:secrets:destroy ADMIN_SETUP_CODE`.

## 4. Test checklist
- Register in user app → profile with ৳0.
- Admin → SMS Reader → Generate Key → send the curl test from SMS_API.md → user Wallet → Add Money → enter TrxID `TEST123ABC` → balance +100; a second try says "already used".
- Admin → Categories/Matches → create match (entry 10) → user joins (balance −10); room shows only after admin sets Room ID.
- Admin → match → 🏆 → `PlayerName, 1, 2` → winner's winning balance increases.
- User → Withdraw → Admin approves/rejects (reject refunds).

## Running without a server (phone file manager)
The two HTML files are self-contained: opening `user.html` from a file manager in Chrome can work, but login and some browsers block `file://`. For reliable use, host it: Firebase Hosting (above) or any static host (Render: New → Static Site, publish dir `public`; then add the domain in Authentication → Settings → Authorized domains). If the screen is blank, a red message at the bottom now shows the real error.

## Security notes
- Add API-key restriction (Google Cloud → Credentials → HTTP referrers) for your domains once hosted.
- The service-account JSON you shared is not used here; delete that key in Google Cloud → IAM → Service accounts → Keys if you don't need it.
- Never put game/reader keys in public code; rotate by deleting and creating a new key.
