# SMS Reader (auto payment) API

Admin panel → **SMS Reader** → type a name → **Generate Key** (shown once, copy it).

    POST https://asia-southeast1-ludofire-arena.cloudfunctions.net/ingestSms
    x-reader-key: KX-XXXXXX-XXXXXX-XXXXXX-XXXXXX
    content-type: application/json

Body (preferred, parsed on the phone):

    { "trxId": "9A1B2C3D4E", "amount": 500, "method": "bkash", "sender": "01712345678" }
    # method: bkash | nagad | rocket

Or send the raw SMS and let the server parse it: `{ "raw": "<SMS text>", "address": "bKash" }`

Replies: `200 {ok:true,duplicate:false}` · `401` bad/disabled key · `422` not a deposit SMS · `429` too many requests.

How it works: the SMS is stored as unused → the player enters the TrxID in the app → `claimDeposit` (server) marks it used once and credits the deposit wallet. Deactivate/delete the key in the admin panel and that phone is blocked instantly. The phone never writes to the database directly.

Test: `curl -X POST <url> -H "x-reader-key: <KEY>" -H "content-type: application/json" -d '{"trxId":"TEST123ABC","amount":100,"method":"bkash","sender":"01712345678"}'`
