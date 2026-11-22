# Puddleton client protocol (version 1)

This is the complete contract between the Puddleton browser client and the game server
(`fable/server`, Cloudflare Workers and Durable Objects). A client can be written from this file alone.
Game rules and the shape of the engine views are in `fable/engine/API.md` (sections 6 to 9); this file says
where they appear on the wire and what the server changes in them.

`PROTOCOL` and `API_BASE` come from `fable/config.mjs`. Phrase chat comes from `fable/phrases.mjs`.
Looks are validated with `cleanLook` from `fable/cosmetics.mjs`.

Contents: 1 Basics, 2 Identity, 3 HTTP endpoints, 4 The WebSocket, 5 Client to server messages,
6 Server to client messages, 7 Game flow and timing, 8 Chat and safety, 9 Error codes, 10 Admin endpoints,
11 From the PeerJS protocol.

---

## 1. Basics

- HTTP base: `API_BASE` (local `http://localhost:8787`; production `https://puddleton-server.<subdomain>.workers.dev`).
- WebSocket: the same host with `ws://` or `wss://`: `API_BASE.replace(/^http/, "ws") + "/ws/" + CODE`.
- Every body is JSON (UTF-8). Every HTTP response is JSON with `Cache-Control: no-store`.
- **Origin.** Every HTTP request and every WebSocket upgrade must come from an allowed origin:
  `https://beta.puddleton.surge.sh`, `https://puddleton.surge.sh`, `https://puddleton.online`,
  `https://www.puddleton.online`, any `http://localhost:<port>` or `http://127.0.0.1:<port>`, plus origins the owner
  adds in `EXTRA_ORIGINS`. The admin endpoints also accept `https://admin.puddleton.surge.sh`. Browsers send `Origin`
  on these cross-site calls automatically. Anything else gets `403 {"error":"E_ORIGIN"}`; a request with no
  `Origin` is refused too.
- **CORS.** Preflight `OPTIONS` answers `204` with `Access-Control-Allow-Origin: <origin>`,
  `Access-Control-Allow-Methods: GET, POST, OPTIONS`, `Access-Control-Allow-Headers: Content-Type, Authorization`.
- **No tokens in URLs.** Credentials travel in the `Authorization` header (HTTP) or in the `hello` message
  (WebSocket). Room codes are not secrets. A friend link token belongs in the page fragment (`#f=TOKEN`, which is
  never sent to a server) and is posted in a body.
- **Errors (HTTP)**: `{ "error": "E_CODE", "msg": "Plain English for the player." }` plus extra fields where noted.
  Branch on `error`; `msg` may change.
- **Times** are milliseconds since the Unix epoch on the server clock unless a field says otherwise. Use
  `serverNow` to correct for the device clock (section 7.4).
- **Versioning.** `GET /version` returns the protocol number. The `hello` carries the client's `PROTOCOL`; on a
  mismatch the server sends `version` and closes the socket. Show "New version available" and reload.

## 2. Identity

There are no accounts yet. A player is a **guest**: `{ gid, secret }`, made once per device and kept in
`localStorage`. The server stores only a hash of the secret. Later the owner can link a guest to an account.

- `gid`: `g_` plus 20 characters `a-z2-7`. Public: it is the player's profile card id (`card` in rooms).
- `secret`: 64 hex characters. Private. Never show or log it.
- `band`: the age band, `"child"` (under 13), `"teen"` (13 to 17) or `"adult"` (18+). Chosen once when the guest is
  made (age gate) and **locked**: there is no way to change it. A `hello` that names another band is refused with
  `E_BAND_LOCKED`.
- `device`: a random string (8 to 128 characters) the client makes once and keeps in `localStorage`. Sent with
  `/guest`, room creation, Quick Play and `hello`. Used only, hashed, to make bans stick.

HTTP authentication: `Authorization: Guest <gid>:<secret>`, for example
`Authorization: Guest g_abcdefghijklmnopqrst:0123...cdef`. A missing or wrong one gets `401 {"error":"E_AUTH"}`.

**Age classes.** A room is either a **kids** room (child band only) or a **13+** room (teen and adult). The class
is the creator's. Room lists and Quick Play only ever show the player's own class; joining the other class is
refused (`E_CLASS`). Children have no friend links and no whispers, and use phrase chat only.

**Turnstile.** Guest creation, room creation and Quick Play need a fresh Cloudflare Turnstile token in the body
field `turnstile`. Render the widget with `TURNSTILE_SITE_KEY` from `config.mjs` (it is Cloudflare's always-pass
test key when the page is served from localhost, the real key otherwise). One token per request. A missing or
failed token: `403 E_TURNSTILE`.

## 3. HTTP endpoints

`(auth)` means the guest `Authorization` header is required.

### `GET /version`
`200 { "protocol": 1, "server": "puddleton-server/1.0.0" }`

### `POST /guest`
Body: `{ "band": "child"|"teen"|"adult", "turnstile": "<token>", "device": "<device string>" }`
- `200 { "gid": "g_...", "secret": "<64 hex>", "band": "teen" }`. Store all three.
- `400 E_BAND`, `403 E_TURNSTILE`, `403 E_BANNED { reason, until, appeal }` (this device is banned).
- Owner only: a request with `Authorization: Bearer ADMIN_TOKEN` skips the Turnstile check (for test players in
  live rooms). Game pages never send it.

### `GET /me` (auth)
`200 { "gid", "band", "name", "look", "stats", "created", "sanction" }`. `name` and `look` are the last ones used in
a room (`""` and `null` before that). `stats` as in `/profile`. `sanction` is `null` or
`{ "type": "ban"|"mute", "reason", "until", "appeal" }`. Use it at start up to check the guest still works
(a `401` means make a new guest).

### `POST /me/delete` (auth)
"Clear my data" in the settings. Body `{}`. Deletes the guest and everything that belongs to it: the guest row (name,
look, stats, device token), its friendships both ways, friend requests either way, its friend link, and blocks it made
or that name it. Kept: sanctions (bans keep matching the device) and reports; match logs keep their own 30 day purge
because they hold other players' data too. `200 { "ok": true }`. The guest pass stops working at once (`401` after
this), so leave any room first and wipe the local copy (`gid`, `secret`, `device`, settings) afterwards.

### `GET /profile/<gid>`
The public profile card. No auth. `200 { "gid", "name", "look", "stats": { "games", "wins", "roles": { "<role>": { "played", "won" } } } }`.
Never contains the band. `404 E_NOT_FOUND`.

### `GET /rooms` (auth)
Waiting rooms of the player's class (games in progress are not listed), fullest first, at most 50:
`200 { "rooms": [ { "code": "K84QVV", "mode": "classic", "players": 5, "narrator": "bot", "locked": false } ] }`.
`locked: true` is a private room: show a lock and ask for the room pass. Poll at most every 10 s, only while the
list is on screen.

### `POST /rooms` (auth)
Creates a room. Body: `{ "turnstile": "<token>", "narrator": "bot"|"human", "device": "<device>" }`.
`"human"` makes the creator the Grandmaster when they connect. Then open the WebSocket to the code.
- `200 { "code": "K84QVV", "created": true }`
- `503 E_FULL { "resetAt": "2026-11-23T00:00:00.000Z" }`: the island is full for today (section 7.7).
- `429 E_RATE` (more than 5 rooms in 10 minutes), `403 E_TURNSTILE`, `403 E_BANNED { reason, until, appeal }`.

### `POST /quickplay` (auth)
Body: `{ "turnstile": "<token>", "exclude": ["CODE", ...], "device": "<device>" }` (`exclude`: up to 10 codes to skip,
for example a room that just refused you). Picks the best waiting public bot-narrator room of your class (Quick
Play rooms first, then the fullest) or makes a new Quick Play room. Then open the WebSocket to the code.
- `200 { "code": "K84QVV", "created": false }`
- Same errors as `POST /rooms`. If the `hello` is then refused with `E_ROOM_FULL` or `E_STARTED`, call Quick Play
  again with that code in `exclude`.

### `POST /fullreport` (auth)
For days the client could not reach the API at all. Body: `{ "day": "YYYY-MM-DD", "count": 3 }` (the UTC day, at most
7 days ago; `count`: failed attempts that day). Send once, the next time the API answers.
`200 { "ok": true, "counted": true|false }` (one report per guest per day), `429 E_RATE`, `400 E_PROTO`.

### Friends (auth; not for the child band: `403 E_CHILD` on every call, and `GET /friends` returns empty lists)
Opening someone's friend link sends them a **friend request**; nothing is a friendship until they accept.

- `GET /friends`:
  ```json
  { "friends": [ { "gid", "name", "look", "online": true, "room": "K84QVV" | null } ],
    "requests": { "incoming": [ { "gid", "name", "look", "created": <ms>, "expires": <ms> } ],
                  "outgoing": [ { "gid", "name", "look", "created": <ms>, "expires": <ms> } ] } }
  ```
  `online`: in a room now or seen in the last 5 minutes. `room`: the room they are in (join it by code; a private
  room still needs its pass). `incoming`: requests waiting for your answer (newest first, at most 20). `outgoing`:
  requests you sent that are not accepted yet. A declined request stays in the sender's `outgoing` until it expires,
  so the sender is never told about a decline. Requests expire 7 days after they were made. There is no push for
  friends: poll `GET /friends` at most every 30 s while the friends list is open, and once when the profile opens.
- `POST /friends/link`: your current friend link token, made if missing or expired:
  `200 { "token": "<24 chars a-z2-7>", "expires": <ms> }`. Share `https://puddleton.surge.sh/play.html#f=<token>`.
- `POST /friends/link/reset`: a new token now (the old one stops working). Same answer.
- `POST /friends/redeem` body `{ "token", "name"? }`: opens a friend link. The owner's token rotates at once, so every
  link works once; links also expire after 7 days. `name`: the name the player typed. A guest with no name yet (names
  are kept from the first room) gets it stored, after the same name check as a room hello, so the request shows who
  is asking instead of an empty name. Ignored once the guest has a name, and silently ignored if refused.
  - `200 { "status": "pending", "to": { "gid", "name", "look" } }`: a request was sent (also the answer when the
    owner blocked you, or you blocked them; then nothing is stored).
  - `200 { "status": "friends", "friend": { "gid", "name", "look" } }`: you were already friends, or they had already
    sent you a request (both asked, so you are friends now).
  - `404 E_LINK` (used, reset or expired), `400 E_SELF`, `400 E_FRIENDS_FULL` (200 friends),
    `429 E_REQUEST_LIMIT` (you sent 10 requests in the last 24 hours), `409 E_REQUESTS_FULL` (the owner already has
    20 requests waiting). A refused redeem does not use up the link.
- `POST /friends/accept` body `{ "gid" }`: accept an incoming request. `200 { "friend": { "gid", "name", "look" } }`,
  `404 E_NO_REQUEST` (none, expired, declined or cancelled), `400 E_FRIENDS_FULL`.
- `POST /friends/decline` body `{ "gid" }`: decline an incoming request. Silent for the sender. `200 { "ok": true }`.
- `POST /friends/cancel` body `{ "gid" }`: withdraw a request you sent. `200 { "ok": true }`.
- `POST /friends/remove` body `{ "gid" }`: removes the friendship both ways. `200 { "ok": true }`.
- Blocking a player (the `block` socket message) also deletes any pending request between you, either way.

## 4. The WebSocket

### 4.1 Connecting

1. Open `wss://<host>/ws/<CODE>` (CODE: 6 characters from `ABCDEFGHJKMNPQRSTUVWXYZ23456789`).
2. Immediately send `hello` (section 5). Without it the server closes the socket after 10 s.
3. The server answers with exactly one of: `welcome` (you are in), `err` then close, `version` then close,
   `sanction` (ban) then close, `closed` then close.
4. After `welcome` the server sends the current state: a `lobby`; or, during a game, a `view` (players), a
   `gmview` (Grandmaster) or `shuffle` (waiting for the Grandmaster to deal); plus `final` if the game has ended.

### 4.2 Keepalive

Send the plain text frame `ping` every 25 s (not JSON). The server answers the plain text `pong` without waking
the room (free). A socket with no message and no ping for 75 s counts as offline and is closed (code 4013).
`{"t":"ping"}` as JSON also works and answers `{"t":"pong","serverNow":...}`; use it for clock sync if needed,
not as the keepalive.

### 4.3 Reconnecting and rejoining (seats)

A seat belongs to the guest: the guest credentials are the seat token. To rejoin after a drop, open a new socket
to the same code and send the same `hello`. The server finds your seat by `gid`, replies `welcome` and a full
snapshot (lobby, or view with your role, chat, whispers and investigations), and tells the others
(`presence` online). This works minutes later, as long as you were not removed. If you connect from a second tab,
the newer socket takes the seat and the older one gets `closed {reason: "elsewhere"}` and code 4001.

Reconnect automatically after an unexpected close (codes 1001, 1005, 1006, 1011, 4013, or a network error) with
backoff 1, 2, 4, 8, then every 10 s, and when the page becomes visible again. Do **not** reconnect automatically
after the close codes below that end the visit.

Seats while away: in the **lobby** an offline seat is kept for 60 s, then dropped. In a **game** your seat stays
until you are removed by the away rules (section 7.6) or by the host (offline kick). A removed player can still
rejoin to watch as a ghost.

### 4.4 Close codes

| Code | Meaning | Reconnect? |
|---|---|---|
| 4000 | Protocol version mismatch (a `version` message came first) | No. Reload the client. |
| 4001 | Replaced by a newer connection of the same guest | No |
| 4002 | Name refused (`E_NAME`) | After the player picks another name |
| 4003 | Banned (a `sanction` message came first) | No |
| 4004 | No such room (`E_NO_ROOM`), or too many connections (`E_ROOM_FULL`) | No |
| 4005 | Kicked from this room (`kicked`), or `E_KICKED` on hello | No |
| 4006 | Wrong age class (`E_CLASS`) | No |
| 4007 | Room pass missing or wrong (`E_PASS`) | After asking for the pass |
| 4008 | Room full, 16 seats (`E_ROOM_FULL`) | No |
| 4009 | Game already started and you have no seat (`E_STARTED`) | No |
| 4010 | Guest auth failed (`E_AUTH`, `E_BAND_LOCKED`) | No. Make a new guest on E_AUTH. |
| 4011 | Room closed (`closed`) | No |
| 4012 | You left (`leave`) | No |
| 4013 | No hello in 10 s, or silent for 75 s | Yes |

## 5. Client to server messages

Every message is a JSON object with a string `t`. At most 4096 bytes. Unknown `t`: `err E_PROTO`.
Rate limit for everything except chat: a bucket of 30 messages refilled at 5 per second per guest; extra messages
are dropped with one `err E_RATE` per second. Chat has its own rules (section 8.4).

### `hello`
```json
{ "t": "hello", "v": 1, "gid": "g_...", "secret": "...", "name": "Muffin", "look": { "body": "mint" },
  "device": "...", "pass": "moonlight", "freeChat": false, "filter": "strict", "whisper": "everyone", "band": "teen" }
```
- `v` (required): `PROTOCOL` from config.mjs.
- `gid`, `secret` (required): the guest.
- `name`: the display name and player id. The server keeps only `A-Z a-z 0-9 _`, at most 16 characters, runs the
  name check on it (section 8.5, the same for every band; `E_NAME` if refused or empty), and makes it unique in the
  room (`Muffin`, `Muffin2`, ...). `"@biscuit99"` becomes the id `biscuit99`.
  The final id is `welcome.you.id`. Ignored on rejoin.
- `look`: the outfit (`{ body, head, pack, house, killfx, tomb, dance }`). Unknown or locked items become the
  defaults. Optional.
- `device`: see section 2. Optional but recommended.
- `pass`: the room pass, needed to enter a private room for the first time (the creator never needs it).
- `freeChat`: `true` only if an adult player opted in to typing with strangers in public rooms (section 8.2).
- `filter`: `"strict"` if an adult player chose the strict chat filter in their settings (section 8.5); anything else
  or missing means the default. Ignored for other bands.
- `whisper`: who may whisper to this player: `"everyone"` (default, also for anything else or missing), `"friends"`
  (friends only) or `"nobody"`. Section 8.6.
- `band`: optional; if present it must equal the guest's band.

The creator of a `"human"` narrator room becomes the **Grandmaster** on their first `hello`: no seat, no name
needed, `you.gm: true`.

### Lobby messages
- `{ "t": "look", "look": {...} }`: change outfit in the lobby (players only).
- `{ "t": "prefs", "freeChat": true|false, "filter": "strict"|"default", "whisper": "everyone"|"friends"|"nobody" }`:
  change the chat settings, every field optional (`freeChat` and `filter` count for adults only; answered with `you`,
  or a new `view` in game). Any time, in the lobby or a game.
- `{ "t": "leave" }`: leave for good. In the lobby your seat is freed; in a game you are removed (you die with
  cause `"left"`, role revealed); as Grandmaster the town clock takes over. You get `closed {reason:"left"}`.
- `{ "t": "settings", "settings": { ... } }` (host, lobby only). Any subset of:
  - `mode`: `"classic"`, `"crazy"`, `"gore"` or `"speed"`. Kids rooms may not use `"gore"` (`E_NOT_ALLOWED`; its tales
    are too gruesome for under 13s), and a kids game never starts in Gore whatever was stored.
  - `communityChat`: boolean (Town Square chat on or off)
  - `victimSeesKiller`: boolean
  - `visibility`: `"public"` or `"private"`. Private needs a pass (`E_PASS_NEEDED` otherwise).
  - `pass`: string of 3 to 32 characters (sets a new pass), or `null` (clears it). Only a salted hash is stored and
    it is never sent back; `lobby.settings.hasPass` says one is set.
  - `secretWhispers`: boolean. `true` only in a private 13+ room (`E_NOT_ALLOWED` otherwise). Turned off when the
    room goes public.
  - `rigged`: boolean, Director tools; only for a human Grandmaster (ignored otherwise).
  Answer: a new `lobby` to everyone, or `err`.
- `{ "t": "start" }` (host, lobby): needs 4 to 16 **connected** players (`E_PLAYERS`); offline seats are dropped.
- `{ "t": "kick", "id": "<player id>" }` (host). Lobby: anyone; they get `kicked` and cannot rejoin this room.
  Game: only a player who is offline (`E_ONLINE` otherwise); they leave the town (die with cause `"left"`).
- `{ "t": "votekick", "id": "<player id>" }` (players, lobby): one vote per voter. When more than half of the
  other people in the room have voted, the player is removed like a host kick and a report is filed
  automatically. Counts are in `lobby.votekicks`.
- `{ "t": "endroom" }` (host): closes the room for everyone (`closed {reason:"host"}`).
- `{ "t": "lobbychat", "text": "hi all" }` or `{ "t": "lobbychat", "phrase": { "id", "args" } }` (players, lobby):
  the Town Square before the game (section 8.1). The Grandmaster only reads it (`E_STATE`).

### Game messages
- `{ "t": "act", "a": { ... } }` (players, after the deal):
  - `{ "kind": "night", "target": "<id>" }`: your night move (any time at night; again to change it). The kill
    effect comes from your look's `killfx`, the client does not send one.
  - `{ "kind": "vote", "target": "<id>" | null }`: your day vote (`null` abstains; again to change it).
  - `{ "kind": "chat", "text": "..." }` or `{ "kind": "chat", "phrase": { "id": "accuse.1", "args": ["Bo"] } }`:
    the Town Square.
  - `{ "kind": "dm", "to": "<id>", "text"|"phrase": ... }`: a whisper.
  - `{ "kind": "ghostchat", "text"|"phrase": ... }`: the dead talking to the dead.
  Errors use the engine codes (section 9), for example `E_PHASE` or `E_TARGET`.
- `{ "t": "advance" }`: move the story on. The Grandmaster: any phase. The host with the bot narrator: during the
  day ("End voting") and the trial ("Deliver the verdict"); at night `E_STATE`. Others: `E_HOST`.
- `{ "t": "deal" }` (Grandmaster, once): deal the cards after the `shuffle`.
- `{ "t": "rig", "op": "...", ... }` (Grandmaster, rigged games): the engine Director tools, same fields as the
  engine `rig` action without `type` and `by` (`setRole` with `player` and `role`, `forceKill` with `target`,
  `protect` with `target`, `fakeResult` with `result`, `forceLynch` with `target` or `null`). Answer: `rigged` and a
  new `gmview`. Players receive nothing.
- `{ "t": "move", "x": 1.5, "z": -2 }`: walk to a spot (one per tap, at most every 250 ms; `|x|, |z| <= 50`).
- `{ "t": "emote", "kind": "wave", "target": "<id>" | null }`: at most every 900 ms. `kind`: an emote id from
  `EMOTES` in cosmetics.mjs that is not locked (`wave`, `shrug`, `laugh`, `point`, `sweat`).
- `{ "t": "replay" }`: the last finished game's replay, once per player (`replay`, or `err E_REPLAY`).

### Any time
- `{ "t": "block", "id": "<id>" }` / `{ "t": "unblock", "id": "<id>" }`: server side block (section 8.6). Answer:
  `blocked`. Stored per guest and remembered in later rooms. The Grandmaster's id is `"gm"`.
- `{ "t": "report", "target": "<id>" | "gm", "reason": "...", "note": "..." }`: `reason` one of `cheating`,
  `harassment`, `hate`, `inappropriate`, `name`, `spam`, `grooming`, `other`; `note` up to 300 characters.
  At most 3 reports per player per game, one per target (`E_REPORT`). Answer: `reported`.

## 6. Server to client messages

### `welcome`
```json
{ "t": "welcome", "code": "K84QVV", "cls": "13+", "serverNow": 1795326363546, "protocol": 1,
  "you": { "id": "Muffin", "gid": "g_...", "band": "teen", "gm": false, "host": true, "tier": "phrase",
           "muted": false, "freeChat": false, "chatFilter": "standard", "safeChat": true, "whisper": "everyone", "blocks": [] } }
```
`cls`: `"kids"` or `"13+"`. `you` is your own record (only ever yours): `id` is your player id (`""` for the
Grandmaster), `tier` is `"text"` (you may type) or `"phrase"` (phrase chat only), `chatFilter` the level your typed
messages are checked at (`"strict"`, `"standard"` or `"minimal"`, section 8.5), `safeChat` whether other players'
typed lines reach you in their safe version, `whisper` your whisper setting (section 8.6), `blocks` the ids you block that are in this room. `you.host` is a snapshot; follow `host` in `lobby` and `view` for changes.

### `you`
`{ "t": "you", "you": {...} }`: your record changed (prefs, a mute starting or ending).

### `lobby`
Sent to everyone on every lobby change (joins, leaves, online changes, looks, settings, votes, countdown).
```json
{ "t": "lobby", "code": "K84QVV", "cls": "13+", "narrator": "bot", "gm": false, "host": "Muffin", "quick": false,
  "players": [ { "id": "Muffin", "look": {...}, "online": true, "host": true, "card": "g_..." } ],
  "settings": { "mode": "classic", "communityChat": true, "victimSeesKiller": true, "visibility": "public",
                "hasPass": false, "secretWhispers": false, "rigged": false },
  "votekicks": { "Bo": 1 }, "kickNeed": 3, "countdown": 0, "min": 4, "max": 16, "lastGame": false, "serverNow": ... }
```
- `narrator`: `"bot"` (the town clock) or `"human"`; `gm`: a Grandmaster is connected. `host`: the host's player id,
  `""` when the Grandmaster is host. Seat order is `players` order.
- `card`: the player's `gid`, for `GET /profile/<gid>`.
- `countdown`: when a Quick Play room auto starts (server ms), or 0.
- `lastGame`: a replay of the previous game is available (`replay`).

### `lobbychat`
`{ "t": "lobbychat", "on": true, "lines": [ { "from": "Bo", "text": "hi all" } ] }`: the lobby Town Square as you may
read it (section 8.2), the last 60 lines. Sent to you on joining the lobby, on the way back from a game (empty: a
new lobby starts a new square), and when your `prefs` or the room's visibility or `communityChat` change. New lines
then come one by one as `{ "t": "chat", "ch": "lobby", "line": { "from", "text" } }`.

### `shuffle`
`{ "t": "shuffle" }`: the game started with a human Grandmaster; wait for the deal (show the shuffle screen).

### `view` (players)
The full snapshot of your game. Sent on join or rejoin, at the deal, on every phase change, when a player is
removed, when your chat tier or blocks change, and at the end.
```json
{ "t": "view", "view": { ...playerView... }, "you": {...}, "mode": "classic", "narrator": "bot", "dealt": true,
  "deadline": 1795326400000, "serverNow": 1795326363546,
  "seats": [ { "id": "Muffin", "look": {...}, "online": true, "card": "g_..." } ],
  "host": "Muffin", "tally": { "cast": 3, "alive": 6 } }
```
- `view`: the engine's `playerView` (engine/API.md section 6), changed by the server only like this: `chat`,
  `dms` and `ghostChat` hold at most the last 200 lines; typed lines you may not read are left out (section 8.2);
  your own filtered messages are put back where you sent them (only you see them); whispers from players you block
  are left out. `chat` also holds whisper announcements `{ "from", "to", "whisper": true }` (no text).
  `view.players[].role` follows the engine rule (yourself, the dead, Mafia teammates). Final roles come in `final`.
- `deadline`: when the phase ends (server ms), or `0` for no timer (human Grandmaster, or the game has ended).
- `seats`: every player of this game in seat order with look and online flag (removed players stay listed).
- `tally`: votes cast and living players during the day (`{cast:0, alive:0}` otherwise).

### `gmview` (Grandmaster)
Like `view` but with the engine's `gmView` (all roles, all whispers, the ghost chat, history), plus
`pending` (ids still owing a night move, at night after the deal), `rigged` and `dealt`:
`{ "t": "gmview", "gm": {...gmView...}, "pending": ["Bo"], "rigged": false, "you": {...}, "mode", "narrator",
"dealt", "deadline", "serverNow", "seats", "host", "tally" }`. Sent after every action in the game.

### Game events (small updates between snapshots)
- `{ "t": "chat", "ch": "square", "line": { "from": "Bo", "text": "I trust Muffin." } }`: a Town Square line. A whisper
  announcement is `line: { "from": "Bo", "to": "Cy", "whisper": true }`. `ch: "ghost"` lines go only to the dead
  and the Grandmaster.
- `{ "t": "dm", "line": { "from": "Bo", "to": "Cy", "text": "..." } }`: a whisper you sent or received (the
  Grandmaster sees all).
- `{ "t": "tally", "cast": 4, "alive": 6 }`: after every vote.
- `{ "t": "picks", "teamPicks": { "Ava": "Ed", "Bo": null } }`: the Mafia team's current picks (Mafia team only, at
  night, after a teammate picks).
- `{ "t": "picked", "kind": "night"|"vote", "target": "Ed" | null }`: your move was accepted.
- `{ "t": "deadline", "deadline": ..., "serverNow": ... }`: the phase end moved (everyone acted: the grace period).
- `{ "t": "presence", "id": "Bo", "online": false }`: a player dropped or came back during a game.
- `{ "t": "move", "id": "Bo", "x": 1.5, "z": -2 }`, `{ "t": "emote", "id": "Bo", "kind": "wave", "target": "Cy" | null }`:
  walking and emotes. Ghosts are seen only by the dead and the Grandmaster.
- `{ "t": "notice", "code": "...", ... }`:
  - `code: "host"`, `id`: the new host (old host left or was removed).
  - `code: "left"`, `id`, `why`: a player left the town (`"left"` quit, `"kicked"` offline kick, `"away"` idle,
    `"offline"` disconnected too long, `"banned"`). A new `view` follows.
  - `code: "narrator"`, `narrator: "bot"`: the Grandmaster left or was away for 60 s; the town clock takes over.
  - `code: "lobby"`: the room is back in the lobby after the credits; a `lobby` follows.
- `{ "t": "rigged", "op": "forceKill" }`: (Grandmaster) the Director move was applied.

### End of the game
- `{ "t": "final", "roles": { "Muffin": "detective", ... }, "winner": "town" }`: every role. Sent right after the
  final `view` (phase `"ended"`, which has `history`), and again on a rejoin while the game is still ended.
- `{ "t": "credits", "winner": "town", "ms": 25000, "until": ..., "serverNow": ...,
   "cast": [ { "id": "Muffin", "role": "detective", "won": true, "alive": true, "left": false, "look": {...} } ] }`:
  play the cast credits roll (about 25 s, `ms`). Then the server returns the room to the lobby by itself: a
  `notice {code:"lobby"}` and a `lobby` with everyone still connected. The host keeps the room and can start again.
- `{ "t": "replay", "mode", "winner", "roles", "history", "log", "cast" }`: answer to `replay`.

### Safety and control
- `{ "t": "slowed", "until": ..., "serverNow": ... }`: you were sending too fast; 1 message per 3 s until `until`.
- `{ "t": "sanction", "type": "mute"|"ban", "reason": "...", "scope": "match"|"timed", "until": <ms>|null, "appeal": "sidsvictus@gmail.com" }`:
  a mute (phrase chat only; `scope:"match"` lasts for this game, `until: null`) or a ban (the socket closes,
  code 4003). Always show the appeal contact.
- `{ "t": "reported", "target": "Bo", "id": 42 }`, `{ "t": "blocked", "id": "Bo", "on": true }`.
- `{ "t": "kicked", "reason": "host"|"vote" }`: you were removed from the lobby (close 4005 follows).
- `{ "t": "closed", "reason": "host"|"idle"|"left"|"elsewhere"|"away"|"banned"|"closed" }`: the room or your visit
  ended (a close code follows).
- `{ "t": "version", "need": 1, "got": 0 }`: protocol mismatch (close 4000 follows).
- `{ "t": "err", "code": "E_...", "msg": "..." }`: something you sent was refused (section 9). Nothing changed.
- `{ "t": "pong", "serverNow": ... }`: answer to a JSON ping.

## 7. Game flow and timing

### 7.1 Lobby
Join, dress up (`look`), host picks settings, host presses start (4 to 16 connected players). Quick Play rooms
start by themselves: when 6 players are in, a 15 s countdown runs (`lobby.countdown`; cancelled below 6); the host
can start earlier. Rooms with no connection close after 2 minutes in the lobby (5 minutes during a game).

### 7.2 Narrators
- **Bot narrator (the town clock)**: the server runs the timers. Phases end at their deadline, or 4 s after
  everyone has acted (night: every living night role has a pick, one pick for the Mafia team; day: every living
  player has voted). The host can end the day or trial early (`advance`).
- **Human Grandmaster**: players get `shuffle`, the Grandmaster checks the cast (and recasts in rigged games), then
  `deal`. The Grandmaster moves every phase with `advance`; `deadline` is 0 for everyone. If the Grandmaster
  leaves or is offline for 60 s, the town clock takes over (`notice narrator`) and the first connected player
  becomes host.

### 7.3 Modes and timers (seconds)
| Mode | Night | Day | Trial | Roles |
|---|---|---|---|---|
| classic | 45 | 150 | 12 | classic five |
| crazy | 60 | 180 | 12 | all ten |
| gore | 45 | 150 | 12 | classic (gruesome tales) |
| speed | 20 | 60 | 12 | classic |

With the bot narrator a night or day also ends 4 s after everyone has acted, if that comes first.
After the end: 25 s credits, then the lobby.

### 7.4 Countdown clock
Every `view`, `gmview`, `deadline`, `credits`, `slowed` and `lobby` carries `serverNow`. On receipt compute
`offset = serverNow - Date.now()`; the time left is `deadline - (Date.now() + offset)`. `deadline: 0` means no timer.

### 7.5 Phases
`night 1 -> day 1 -> [trial 1] -> night 2 -> ...` exactly as engine/API.md section 3. Snapshots (`view`) arrive at
each change; between them, events (section 6).

### 7.6 Away players
A living player is removed from the game (dies with cause `"left"`, role revealed, `notice left`) when:
- they made no move (no act, chat, whisper, walk or emote) in two consecutive phases where a move was required
  (every day; nights only for roles with a night move), or
- they were disconnected at the end of two consecutive night or day phases (trials do not count).
The host can also remove an offline player at once (`kick`). A removed player who comes back watches as a ghost.

### 7.7 The island is full
At about 85% of any free daily Cloudflare limit, `POST /rooms` and `POST /quickplay` answer
`503 { "error": "E_FULL", "resetAt": "<next 00:00 UTC>" }` until `resetAt`. Show "The island is full, come back at
<local time of resetAt>". Joining an existing room by code and games in progress keep working. If the API cannot
be reached at all, remember the day and the number of failed attempts and send `POST /fullreport` later.

## 8. Chat and safety

### 8.1 Channels
Town Square (`chat`, by day and from the accused during the trial; off when `communityChat` is false), whispers
(`dm`, any phase, living senders), ghost chat (`ghostchat`, the dead). The engine rules apply (engine/API.md
section 5): for example `E_PHASE` for the square at night.
Before the game the square is open in the lobby too (`lobbychat`, every seated player, while `communityChat` is on):
the same tiers, phrases, filter, rate limits, strikes and reports. It starts empty at every lobby and is cleared when
the game starts; strikes and filter mutes carry from the lobby into the game and back.

### 8.2 Tiers (who may type)
| Player | Kids room | 13+ public room | 13+ private room |
|---|---|---|---|
| child band | phrases | (not allowed in) | (not allowed in) |
| teen band | (not allowed in) | phrases | typing (filtered) |
| adult band | (not allowed in) | phrases, or typing (filtered) if they opted in with `freeChat` | typing (filtered) |
| muted player | phrases | phrases | phrases |

`you.tier` says which applies. A typed message from a phrase tier player gets `E_PHRASE_ONLY` (or `E_MUTED`).
**Reading**: typed lines in a public room go only to players who may type there (opted in adults); everyone else
sees the phrase lines only. A typed whisper needs a recipient who may read typed text (`E_PHRASE_ONLY` otherwise).

### 8.3 Phrase chat
Send `phrase: { "id": "<id>", "args": [...] }` from `PHRASES` in `fable/phrases.mjs`. Each argument is a player id
of this game (`"player"`) or a role key (`"role"`, see `ROLE_NAMES`), in order. The server checks and renders the
text; everyone receives plain `text`. Bad id or arguments: `E_PHRASE`.

### 8.4 Rate limits (every player, every channel)
- At least 1 s between messages (`E_RATE`).
- 5 or more attempts within 6 s: slowed to 1 message per 3 s for 60 s (`slowed` message once, then `E_SLOWED`).
- The same message again within 30 s (compared after normalising): `E_DUP`.
- Typed messages: 1 to 200 characters (`E_TEXT`).

### 8.5 The filter
Typed messages pass a server filter. Lookalike letters, leetspeak and repeated letters are undone first. The level
depends on the **sender's** age band (shown to them as `you.chatFilter`):

| Level | Who sends at it | Blocks |
|---|---|---|
| strict | child band | profanity and slurs, links and domain-like text, emails, phone numbers and long digit runs, street addresses, spelled out number runs ("five five five"), social handles, app names and off-platform invites; words joined across spaces count ("fu ck", "pen is", "oh snap") |
| standard | teen band; adults who chose `filter: "strict"` | profanity and slurs (also spelled out, "f u c k"), links, emails, phone numbers and long digit runs, street addresses, social handles, messaging app names (snapchat, discord, whatsapp...) and off-platform invites ("add me on snap"). Not blocked: spelled numbers, everyday words like "snap" or "insta", and words joined across spaces unless they make a slur |
| minimal | adult band (default) | hate slurs, sexual content involving minors, links. Ordinary swearing, numbers, emails and handles are allowed |

A blocked message gets **no error**: the sender receives it back as a normal `chat`/`dm` event as if sent, and nobody
else ever sees it. Three blocked messages in a game mute the player for that game (`sanction` mute, scope `match`).
Repeated match mutes (3 within 30 days) bring a 24 hour ban.

**What you receive respects your band too.** Teens, children and adults who chose `filter: "strict"`
(`you.safeChat: true`) never get a line rougher than the standard level. When an adult's line passed only the
minimal level, such readers get a safe version with each offending word replaced by asterisks
(`"this is ******* great"`), or no line at all if no safe version exists (for example a phone number split over
words). The author always sees their own words. This applies to `chat`, `dm` and ghost lines and to the snapshots.
(Kids rooms only ever contain the child band.)

**Names** follow one rule for every band, adults included: no slurs, nothing sexual (including sexual content
involving minors), no links. The child band also may not put contact details in a name: an email address, or a
phone-like run of 8 or more digits (spaces and dashes in between still count). Short numbers stay fine for
children too (`Player12345`). The same bypass handling applies (lookalike letters, leetspeak, spacing and
underscores, repeated letters, and CamelCase: `SexyBabe` is checked as `Sexy Babe`); the name is checked both as
typed and as the id made from it. Allowed: handles (`@biscuit99`), numbers (`Player12345`), ordinary and family words
(`daddy`, `mommy`), and other profanity that is not sexual or a slur. A refused name gets `err E_NAME` (close 4002).

### 8.6 Whispers and blocks
- Whispers exist only in games and never to or from the child band (`E_WHISPER_OFF`; so never in kids rooms).
- By default the table sees a public line `{ from, to, whisper: true }` for every whisper (who, not what). With
  `secretWhispers` (private 13+ rooms only) there is no line. Public rooms always announce.
- **Whisper setting.** Each player chooses who may whisper to them (`hello.whisper`, `prefs.whisper`): everyone,
  friends only, or nobody. A whisper the recipient does not accept is refused: the sender alone gets
  `err E_WHISPER_PREF` with `msg` "<id> is not taking whispers right now.", the recipient gets nothing, and there is no
  public "whispered" line. Friends are read once when the player joins with the friends setting (or at the first
  whisper after a change), so a friendship made during the game counts from the next join.
- **Mute is client side** (hide a player's lines locally). **Block is server side**: whispers from a blocked player
  never reach you (the sender sees them as sent) and their emotes aimed at you are not delivered. Old whispers from
  them disappear from your next `view`.

### 8.7 Reports and moderation
`report` stores a snapshot of the whole match (chat, whispers, votes, night moves, events, players and their age
bands) for moderators; it is never shown to players. Some messages are flagged silently for moderators (questions
about age, location, school, phone numbers, photos, moving to other apps; adults whispering again and again to teen
players). Snapshots are kept 30 days, reports 1 year. Every sanction message includes the appeal contact
`sidsvictus@gmail.com`.

## 9. Error codes

WebSocket `err.code` (HTTP codes are listed with each endpoint).

| Code | When |
|---|---|
| `E_PROTO` | Malformed or unknown message. |
| `E_AUTH` | Guest credentials wrong (hello closes with 4010). |
| `E_BAND_LOCKED` | `hello.band` differs from the guest's band. |
| `E_NO_ROOM` | No room with that code. |
| `E_CLOSED` | The room has closed. |
| `E_CLASS` | The room is for the other age class. |
| `E_STARTED` | The game is running and you have no seat. |
| `E_ROOM_FULL` | 16 seats taken (or too many connections). |
| `E_PASS` | Private room: pass missing or wrong. |
| `E_KICKED` | You were kicked from this room. |
| `E_NAME` | Name empty, or refused by the name check (slurs, sexual words, links; for children also contact details; section 8.5). |
| `E_HOST` | Only the host (or Grandmaster) can do that. |
| `E_STATE` | Not possible right now (wrong stage, or not for your role in the room). |
| `E_PLAYERS` | Fewer than 4 connected players. |
| `E_ONLINE` | Mid game you can only kick offline players. |
| `E_TARGET` | No such player, or not a valid target (also engine). |
| `E_PASS_NEEDED` | Private rooms need a pass of 3 to 32 characters. |
| `E_NOT_ALLOWED` | Secret whispers outside a private 13+ room, or Gore mode in a kids room. |
| `E_RATE` | Too fast (chat: under 1 s; other messages: the bucket). |
| `E_SLOWED` | Slowed down after spam. |
| `E_DUP` | Same message again. |
| `E_PHRASE_ONLY` | You (or the whisper's recipient) can only use phrase chat here. |
| `E_MUTED` | You are muted: phrase chat only. |
| `E_PHRASE` | Unknown phrase or bad arguments. |
| `E_WHISPER_OFF` | No whispers to or from the child band. |
| `E_WHISPER_PREF` | The recipient does not take whispers from you (their whisper setting); `msg` names them. |
| `E_REPORT` | Already reported that player, or 3 reports this game. |
| `E_REPLAY` | No replay, or already sent to you. |
| Engine codes | `E_PHASE`, `E_DEAD`, `E_NO_ABILITY`, `E_TEXT`, `E_CHAT_DISABLED`, `E_ENDED`, `E_NOT_RIGGED`, `E_FX`, `E_TRIAL`, `E_ALIVE`, `E_UNKNOWN` (engine/API.md section 5). |

## 10. Admin endpoints

All need `Authorization: Bearer <ADMIN_TOKEN>` (else `401 {"error":"E_AUTH"}`). CORS allows
`https://admin.puddleton.surge.sh` (and localhost).

### `GET /admin/stats` (exact contract)
```json
{
  "now": "2026-11-22T10:15:00.000Z",
  "days": [
    { "day": "2026-11-22", "gamesStarted": 12, "roomsCreated": 20, "refusedFull": 0, "hardFailReports": 0,
      "peakConcurrentRooms": 4, "incomingMessages": 5120, "rowsWritten": 1830 }
  ],
  "live": { "rooms": 3, "players": 17 },
  "capacity": { "limitName": "Durable Objects duration (GB-s)", "usedToday": 1210.5, "limitToday": 13000,
                "percent": 9.3, "resetAt": "2026-11-23T00:00:00.000Z" },
  "reports": { "open": 2 }
}
```
- `days`: the last 30 UTC days, newest first (days with no activity are zeros).
- `rowsWritten`: Durable Object storage rows plus D1 rows written that day.
- `live`: rooms with players that reported in the last 15 minutes, and their players.
- `capacity`: the free limit closest to running out today (estimates), with its use, the limit and the percent.
  New rooms are refused at 85.
- `reports.open`: unresolved reports (player and automatic).

### `GET /admin/usage`
Every counter behind the estimate: `{ now, softCapPercent, wsRatio, capScale, full, resetAt,
today: { <limit>: { name, used, limit, percent } }, days: [ { day, counters, used } ] }`.

### `GET /admin/reports?status=open|resolved|all&limit=50&before=<id>`
`{ "reports": [ { "id", "created", "reporter" (gid or "system"), "target" (gid), "target_name", "room", "reason",
"note", "auto", "status", "log_id", "resolved_at", "resolution" } ] }`, newest first. Automatic reasons start with
`auto:` (`auto:age`, `auto:location`, `auto:school`, `auto:phone`, `auto:photo`, `auto:offplatform`,
`auto:adult_whispers_teen`); a lobby vote kick files `votekick`.

### `GET /admin/reports/<id>`
`{ "report": {...}, "snapshot": { room, cls, at, narrator, settings, players: [ { gid, id, band, left } ], gm,
game: { phase, day, winner, roles, alive, chat, dms, ghostChat, log, history, votes, nightActs } | null,
events: [ { at, k, ... } ], lastGame } }`. `snapshot` is `null` after the 30 day retention.

### `POST /admin/action`
Body `{ "action": ..., ... }`, every action appended to the audit log:
- `{ "action": "resolve", "reportId": 42, "resolution": "warned" }`
- `{ "action": "mute", "gid": "g_...", "hours": 24, "reason": "..." }`: phrase chat only until then.
- `{ "action": "ban", "gid": "g_...", "hours": 24, "reason": "..." }`: by guest id and device (never by IP address).
- `{ "action": "unmute", "gid": "g_..." }`, `{ "action": "unban", "gid": "g_..." }`
Answer `{ "ok": true }` (`until` for mute and ban). A guest in a room right now gets the sanction live.

### `GET /admin/audit`
The last 200 audit entries `{ id, at, action, target, detail }`, newest first. The table is append only.

## 11. From the PeerJS protocol

| Old (host browser) | New |
|---|---|
| `hello {name, seat, look}` | `hello {v, gid, secret, name, look, device, pass?, freeChat?, filter?}`; the guest replaces the seat token |
| `welcome {id, token, code}` | `welcome {code, cls, you, serverNow, protocol}` |
| `lobby {players, mode, code, looks, host}` | `lobby` with `players[{id, look, online, host, card}]` and `settings` |
| `view {view, mode, deadline, players, looks, tally}` | `view` with `seats`, `serverNow`, `narrator`, `dealt`, `you`, `tally{cast, alive}` |
| `final {roles}` | `final {roles, winner}`, then `credits`, then back to `lobby` |
| `shuffle`, `err {msg}`, `closed` | same names; `err` has `code`; `closed` has `reason` |
| `act {a}`, `look`, `leave`, `move`, `emote` | same; chat kinds take `text` or `phrase`; `fx` is no longer sent |
| host-only local calls (start, mode, end voting, end room, deal, Director) | `start`, `settings`, `advance`, `endroom`, `deal`, `rig` messages |
