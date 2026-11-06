# SMS Reader app → Khelastrix

`POST https://asia-southeast1-ludofire-arena.cloudfunctions.net/ingestSms`
(if `firebase deploy` prints a different URL for `ingestSms`, e.g. a `*.a.run.app` address, use the printed one)
Headers: `x-reader-key: KX-XXXXX-XXXXX-XXXXX-XXXXX`, `content-type: application/json`

Preferred body (structured, parsed on the phone):
`{ "trxId": "9A1B2C3D4E", "amount": 1500, "method": "bkash|nagad|rocket", "sender": "01712345678" }`

Fallback body (server parses): `{ "raw": "<full SMS text>", "address": "bKash" }`

Responses: `200 {ok:true, settled:boolean}` · `200 {duplicate:true}` · `401/403` bad or revoked key · `422` not a deposit SMS · `429` rate limited.
Revoking a key in the admin panel blocks the very next request. Do not write to Firebase directly from the phone: the web API key is public and rules deny those writes by design.
