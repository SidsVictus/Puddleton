# Puddleton game server

The authoritative server for Puddleton on Cloudflare Workers, Durable Objects and D1, built to run on the
**free plan**. It replaces the PeerJS setup where the host's browser was the server.

- `src/index.mjs`: the front Worker. Thin on purpose (10 ms CPU per request on the free plan): Origin allowlist,
  CORS, Turnstile, guest auth, then it hands off to a Durable Object or D1.
- `src/room.mjs`: the `Room` Durable Object, one per room code. Runs the rules engine (`../engine/engine.mjs`),
  seats, rejoin, host handover, both narrators, timers (one alarm), chat safety, reports, credits and the return
  to the lobby. WebSocket Hibernation API.
- `src/lobby.mjs`: the `Lobby` Durable Object (one instance): room registry, room list, Quick Play, friend presence,
  daily usage counters, the "island is full" soft cap, admin numbers, the daily cleanup alarm.
- `src/filter.mjs`, `src/wordlists.mjs`: the chat filter (strict for children, standard for teens, minimal for adults
  unless they choose strict; readers below adult get a safe version) and its word lists (easy to extend).
- `src/ratelimit.mjs`: chat limits, spam slowdown, duplicate suppression, token buckets.
- `src/db.mjs`: D1 helpers. `src/usage.mjs`: free plan limits and the capacity estimate. `src/util.mjs`: origins,
  hashing, ids. `src/modes.mjs`: mode timers. `src/three-stub.mjs`: lets the server import `../cosmetics.mjs`.
- `migrations/0001_init.sql`: the D1 schema.
- `test/unit.mjs`, `test/integration.mjs`, `test/bot.mjs`: tests (see below).
- `PROTOCOL.md`: the complete client protocol. The client is written against it.

Shared with the browser: `../engine/engine.mjs` (rules), `../phrases.mjs` (phrase chat), `../config.mjs`
(`API_BASE`, `PROTOCOL`, Turnstile site key), `../cosmetics.mjs` (look validation).

## Local development (no Cloudflare account needed)

Needs Node 22 or newer.

```sh
cd fable/server
npm install
cp .dev.vars.example .dev.vars        # local secrets: Turnstile test secret, a local admin token, a salt
npm run db:local                      # creates the local D1 tables (wrangler d1 migrations apply --local)
npm run dev                           # wrangler dev on http://localhost:8787
```

`fable/config.mjs` already points `API_BASE` at `http://localhost:8787`. Pages served from `http://localhost:*`
are allowed by the Origin check. Local state lives in `.wrangler/` (delete it to start fresh, then `npm run db:local`).

## Tests

```sh
npm run test:engine   # node ../engine/test.mjs: 39 engine tests incl. the 3,000 game fuzz (about 2 minutes)
npm run test:unit     # filter, rate limits, phrases, capacity math (instant)
npm run test:int      # starts wrangler dev twice locally and plays it with bots (about 2 minutes)
npm test              # all three
```

The integration test starts its own servers on ports 8799 and 8798 with fresh state in `.wrangler/test-*`
(safe to delete), with `TIME_SCALE=0.08` (every game timer 12 times faster) and, for the soft cap test,
`CAP_SCALE=0.001` (daily limits shrunk a thousand times). It needs internet access for Cloudflare's Turnstile
test endpoint.

## Deploy (owner steps)

`wrangler login` is already done on the owner's account, and `wrangler.jsonc` pins that account
(`account_id`). From `fable/server`:

1. `npm install`
2. Create the database: `npx wrangler d1 create puddleton`. Copy the printed `database_id` into
   `wrangler.jsonc` (replace `00000000-0000-0000-0000-000000000000`).
3. Create the tables: `npx wrangler d1 migrations apply puddleton --remote`
4. `npx wrangler deploy`. It prints the URL, for example `https://puddleton-server.YOUR-SUBDOMAIN.workers.dev`.
5. Right after the first deploy, set the three secrets (each command asks for the value and applies it to the
   live Worker at once, no redeploy needed):
   - `npx wrangler secret put TURNSTILE_SECRET`: the **secret key** of the Puddleton Turnstile widget, from the
     Cloudflare dashboard (Turnstile, the Puddleton widget, Settings). It is never stored in this repository.
     Until it is set the server fails closed: `POST /guest`, `POST /rooms` and `POST /quickplay` answer
     `403 E_TURNSTILE`, so nobody can start playing yet.
   - `npx wrangler secret put ADMIN_TOKEN`: a long random string; the admin page sends it as `Authorization: Bearer ...`.
     Until it is set every admin endpoint answers 401.
   - `npx wrangler secret put HASH_SALT`: another long random string; it salts the device hashes used for bans
     (bans match the guest id or the device, never an IP address). Set it before real players arrive and never
     change it (old bans would stop matching).

   A good random string: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`
6. Put the URL into `fable/config.mjs` (`API_BASE`) and into the admin page's API setting, then publish the sites.
7. Check it: `curl -H "Origin: https://puddleton.surge.sh" https://puddleton-server.YOUR-SUBDOMAIN.workers.dev/version`
   should print `{"protocol":1,...}`. Check `npx wrangler secret list` shows the three names.

Later: when the `.online` domain is live, it is already in the allowlist as `https://puddleton.online` and
`https://www.puddleton.online` (also add it to the Turnstile widget's hostnames); any other origin can be added
without code changes via the `EXTRA_ORIGINS` variable in `wrangler.jsonc` (comma separated), then `npx wrangler deploy`.

Updating: change code, `npx wrangler deploy`. New migrations: add `migrations/0002_*.sql`, then step 3 again.
Bump `PROTOCOL` in `fable/config.mjs` on breaking protocol changes; old clients then get a `version` message.

### Turnstile

The owner created the widget (hostnames `puddleton.surge.sh` and `beta.puddleton.surge.sh`, Managed mode).

- **Site key** (public): `0x4AAAAAAGM0kBs1GCJXCu2U`, exported by `fable/config.mjs` as `TURNSTILE_SITE_KEY`. When
  the page is served from `localhost` or `127.0.0.1`, config.mjs picks Cloudflare's documented always-pass test
  site key `1x00000000000000000000AA` instead (the real widget refuses other hostnames).
- **Secret key**: only the owner has it; it goes in with `npx wrangler secret put TURNSTILE_SECRET` after the
  first deploy (step 5). Never commit it.
- **Local development** uses Cloudflare's documented always-pass test secret
  `1x0000000000000000000000000000000AA`, set in `.dev.vars` (copied from `.dev.vars.example`) and passed by the
  integration tests. The server still calls Cloudflare's siteverify endpoint with it, so local tests need internet.
- The client shows the widget before creating a guest, creating a room and Quick Play, and sends the token in the
  request body as `turnstile`. Each token works once.
- When the `.online` domain goes live, add it to the widget's hostnames in the dashboard.

## Free plan design

Daily free limits (exceeding one makes calls fail until 00:00 UTC): Workers 100,000 requests; Durable Objects
100,000 requests, 13,000 GB-s duration, 5,000,000 rows read, 100,000 rows written; D1 5,000,000 rows read,
100,000 rows written. How the server stays inside them:

- WebSocket Hibernation API: an idle room sleeps after about 10 s and costs no duration. Pings use the automatic
  response (`"ping"` gets `"pong"` without waking the room).
- Room state is one SQLite row, written at once on important actions (seats, settings, start, each phase change,
  game end). Other changes (chat lines, votes, picks, usage counters) are written when the room goes quiet (8 s
  after the last message, before it can hibernate at 10 s) or once a minute while it stays busy. Chat lines never
  cause a write of their own.
- Game timers use the Durable Object alarm (one per room, all timers share it; at least once delivery is safe
  because every timer checks the phase it was set for). Each `setAlarm` is billed as a row written, so timer
  changes are collected and the alarm is set at most once per event.
- Clients get full snapshots only on joins and phase changes; chat, votes and picks go out as small events
  (outgoing messages are free).
- The Worker only routes; the Lobby is called only for room lists, room creation, Quick Play, friends presence,
  reports of usage, and admin numbers.

### Capacity and the soft cap

Every room counts its own usage (connects, incoming messages, alarms, rows read and written, D1 rows, awake time)
and reports it to the Lobby with its registry updates (at most every 5 minutes, plus at start and end). The
Worker counts its requests and D1 rows the same way. At 85% of any daily limit, new rooms and Quick Play get
`503 {"error":"E_FULL","resetAt":...}` until 00:00 UTC; games already running carry on. Every refusal is counted,
and clients can report days when the API was unreachable (`POST /fullreport`). All of it is on
`GET /admin/stats` (exact contract in PROTOCOL.md) and in more detail on `GET /admin/usage`.

`WS_RATIO` in `wrangler.jsonc` says how many incoming WebSocket messages count as one billed Durable Object
request. It defaults to `1` (the worst case). Cloudflare documents 20; once the dashboard numbers confirm that,
set it to `"20"` and redeploy, which raises the request headroom about twenty times for chat heavy games.

Measured locally (`/admin/usage` before and after) for one 8 player classic game at real timings, bots acting
at once and chatting twice a day each, 65 s of play plus credits and the room's teardown: 95 to 99 incoming
messages, 8 connects, 12 to 19 alarms, 7 to 11 internal calls, 42 to 51 Durable Object rows written (Lobby
included), 15 D1 rows written, 48 D1 rows read. Extrapolated to a real 8 player, 15 minute game (about 450
incoming messages; while busy one flush check alarm per 8 s and a save per minute; about 80% awake):

| Limit | Per game | Games per day at 85% |
|---|---|---|
| DO duration (128 MB x estimated awake time, rooms and Lobby) | about 110 GB-s | about 100 |
| DO requests with `WS_RATIO=1` (8 connects, 450 messages, 100 alarms, 10 internal calls) | about 570 | about 150 |
| DO requests with `WS_RATIO=20` | about 140 | about 600 |
| DO rows written | about 135 | about 630 |
| D1 rows written (8 stats rows, name and look updates) | about 15 to 20 | about 4,500 |
| Worker requests (upgrades, room creation, list polls, profiles) | about 30 | about 2,800 |

So with the defaults the island fills at roughly 100 eight player games a day (about 800 player games), bound
by Durable Object duration, with requests next. The duration estimate is deliberately high (every room wake
counts 20 s of idle tail). Compare it with the Cloudflare dashboard after a few real days and tune `WS_RATIO`.
The Workers Paid plan ($5 a month) lifts all of these limits by orders of magnitude.

## Operations

- Admin: `GET /admin/stats`, `GET /admin/usage`, `GET /admin/reports`, `GET /admin/reports/:id`,
  `POST /admin/action` (resolve, mute, ban, unmute, unban), `GET /admin/audit`. All need
  `Authorization: Bearer <ADMIN_TOKEN>`; CORS allows `https://admin.puddleton.surge.sh`.
- Clear my data: players delete their own guest with `POST /me/delete` (the guest, friendships, friend requests, friend
  link and blocks; sanctions and reports stay, so bans keep matching the device).
- Retention: match logs (report snapshots) 30 days, reports 1 year, friend requests 7 days, expired friend links and old sanctions are
  removed by the Lobby's daily cleanup alarm (03:00 UTC).
- Appeals: every sanction message carries the appeal contact sidsvictus@gmail.com.
- Payments: none. Every shop item stays locked; the server refuses locked items in looks and emotes.
