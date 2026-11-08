# Game API (Ludo, Carrom and any new game)

Admin panel → **Game API Keys** → name (+ optional category limit) → **Generate Game Key** (shown once).

    POST https://asia-southeast1-ludofire-arena.cloudfunctions.net/gameApi
    x-game-key: GK-XXXXXX-XXXXXX-XXXXXX-XXXXXX
    content-type: application/json

| action | body | what it does |
|---|---|---|
| `listMatches` | `{"action":"listMatches","status":"Upcoming"}` | matches this key may run (status Upcoming/Ongoing/Finished) |
| `getMatch` | `{"action":"getMatch","matchId":"-Nabc"}` | match info + joined players `[{uid, ign}]` |
| `setRoom` | `{"action":"setRoom","matchId":"-Nabc","room_id":"R123","room_pass":"4455"}` | publishes room id/pass to joined players only |
| `start` | `{"action":"start","matchId":"-Nabc"}` | Upcoming → Ongoing |
| `result` | `{"action":"result","matchId":"-Nabc","results":[{"uid":"…","rank":1,"kills":3},{"ign":"Karim","rank":2}]}` | pays prizes automatically and finishes the match (once only) |

Prizes: `prize_split` (admin → Manage Match, e.g. `500,200,100` = rank 1,2,3; sum must not exceed Total Prize) — if empty, rank 1 gets the whole Total Prize. `per_kill × kills` is added. Winnings go to the player's **winning** wallet.

A game server flow: `listMatches` → at start time `getMatch` → create the room → `setRoom` → `start` → play → `result`.
Errors: `401` bad/disabled key · `404` match not allowed for this key · `409` already settled · `429` rate limited. Disable a key in the admin panel to cut that server off immediately.
New game later? Create another key (optionally limited to that game's category) — nothing else to change.
