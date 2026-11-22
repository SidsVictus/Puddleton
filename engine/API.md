# Puddleton engine API

`engine/engine.mjs` is the rules engine. Only the host runs it: since the move off PeerJS that is the game
server (`server/src/room.mjs`, one Cloudflare Durable Object per room). The host keeps the game state, applies
every action, and sends each player only `playerView(state, id)`. A human Grandmaster sees `gmView(state)`.

Properties that always hold:

- Pure and deterministic. The only randomness is a seeded generator stored inside the state. The same
  setup and the same actions always give the same state.
- Atomic. A rejected action changes nothing.
- Views are plain objects, arrays, strings, numbers, booleans and `null`. No `undefined`, no null-prototype
  objects, no shared references into the state. They are safe to send over the peer link as they are.
- The state itself is opaque. Do not read it from UI code; use the views. (The host's existing `voteTally()`
  reads `state.votes`; that still works.)

```js
import {
  createGame, applyAction, playerView, gmView, nightPending, allVoted, phaseDuration,
  exportState, importState, validateSetup, GameError,
  MODES, TOWN, MAFIA_TEAM, NEUTRAL, ALL_ROLES, NIGHT_ROLES, TRIAL_SECONDS,
} from "./engine/engine.mjs";
```

Tests: `node engine/test.mjs`.

---

## 1. Exports

| Export | Type | What it is |
|---|---|---|
| `MODES` | `string[]` | `["classic", "crazy", "gore", "speed"]` |
| `TOWN` | `string[]` | `["villager", "angel", "detective", "vigilante", "mayor"]` |
| `MAFIA_TEAM` | `string[]` | `["mafia", "godfather", "framer"]` |
| `NEUTRAL` | `string[]` | `["jester", "serialkiller"]` |
| `ALL_ROLES` | `string[]` | `TOWN`, then `MAFIA_TEAM`, then `NEUTRAL` |
| `NIGHT_ROLES` | `string[]` | **New export.** Roles with a night move: `mafia`, `godfather`, `angel`, `detective`, `vigilante`, `serialkiller`, `framer`. |
| `TRIAL_SECONDS` | `number` | `12`. How long the bot narrator should let a trial run. |
| `GameError` | class | `Error` with a `code` string. Thrown by `createGame` / `validateSetup` only. |
| `validateSetup(setup)` | function | Throws `GameError` with code `E_SETUP` if the setup is bad. Returns nothing. |
| `createGame(setup)` | function | Validates, deals roles, returns a new state. Throws `GameError` `E_SETUP`. |
| `applyAction(state, action)` | function | Applies one action. Returns `{ state, result }`. Never throws for bad input. |
| `playerView(state, playerId)` | function | What one player may see. See section 6. |
| `gmView(state)` | function | Everything, for the human Grandmaster. See section 7. |
| `nightPending(state)` | function | Ids of living players who still have a night move to make. |
| `allVoted(state)` | function | `true` when phase is `"day"` and every living player has voted. |
| `phaseDuration(phase, times)` | function | Timer seconds for a phase. See below. |
| `exportState(state)` | function | **New.** The state as a JSON string, for storage. |
| `importState(json)` | function | **New.** The state back from `exportState`, identical (see below). |

### `exportState(state)` and `importState(json)`

The server saves the state between phases (a Durable Object can be evicted from memory at any time).
`importState(exportState(st))` gives a state that is identical to `st` in every way the engine cares about:
the bare dictionaries come back without prototypes (so ids like `__proto__` or `toString` still work), and an
unset `forceLynch` comes back as `undefined`. Playing on from the copy gives exactly the same results. The fuzz
test round trips the state at random steps of every game and checks this.

### `applyAction(state, action)`

Mutates `state` in place on success and returns the same object.

```js
const { state, result } = applyAction(st, { type: "vote", actor: "Di", target: "Bo" });
// success: result = { ok: true }
// failure: result = { ok: false, error: { code: "E_PHASE", message: "votes happen during the day" } }
```

On failure the state is exactly as it was. Error codes are listed in section 5. Messages are plain English
and may change; branch on `code`.

### `nightPending(state)`

Unchanged. Living night-role players (angel, detective, vigilante, serialkiller, framer) who have not acted,
in seat order, followed by every living `mafia` and `godfather` if none of them has picked yet (one pick from
any of them is enough). Only meaningful at night.

### `allVoted(state)`

`state.phase === "day"` and every living player has a vote recorded (an abstain counts). It is always `false`
during a trial, so the host's "everyone voted, shorten the timer" shortcut never cuts a trial short.

### `phaseDuration(phase, times)`

```js
phaseDuration("night", { night: 60, day: 120 })  // 60
phaseDuration("day",   { night: 60, day: 120 })  // 120
phaseDuration("trial", { night: 60, day: 120 })  // 12 (TRIAL_SECONDS)
phaseDuration("ended", { night: 60, day: 120 })  // 0, not timed
```

`times` is the host's own per-mode lengths (play.js `MODE[mode]` already has `night` and `day`). Use it
wherever the host computes a deadline or a timer bar total, so the trial gets its 12 seconds.

---

## 2. Setup

```js
const st = createGame({
  mode: "crazy",                 // required: one of MODES
  players: ["Ava", "Bo", "Cy", "Di", "Ed", "Flo"],   // required: seat order
  narrator: "bot",               // required: "bot" or "human"
  rigged: false,                 // required: boolean; true only with narrator "human"
  communityChat: true,           // required: boolean; the public town square chat
  seed: 1234,                    // required: integer 0..2147483647
  victimSeesKiller: true,        // optional: boolean, default true
  traits: {                      // optional: see below
    Ava: { hat: "yes", pack: "no", tone: "warm" },
    Bo:  { hat: "no",  pack: "yes", tone: "dark" },
  },
});
```

| Field | Rule (any violation throws `GameError` code `E_SETUP`) |
|---|---|
| `mode` | One of `MODES`. |
| `players` | Array of 4 to 16 unique strings, each matching `/^[A-Za-z0-9_]{1,16}$/`. `"gm"` is reserved and rejected. Order is seat order everywhere. |
| `narrator` | `"bot"` or `"human"`. |
| `rigged` | Boolean. `true` requires `narrator: "human"`. Enables the Director tools (`rig` actions). |
| `communityChat` | Boolean. When `false`, `chat` actions fail with `E_CHAT_DISABLED` (including the accused at a trial). DMs and ghost chat are unaffected. |
| `seed` | Integer from 0 to 2147483647. Drives the role deal and the clues. |
| `victimSeesKiller` | Optional. Omitted, `undefined` or `null` means `true`. Otherwise must be a boolean. Controls whether a night victim's `deathBy` names the killer and the kill effect. |
| `traits` | Optional. Omitted, `undefined` or `null` means no traits, and then no clues are ever made. Otherwise a plain object whose keys are player ids from `players` (unknown ids are rejected). Each value must be an object with `hat: "yes" or "no"`, `pack: "yes" or "no"`, `tone: "warm", "cool", "pale" or "dark"`. Players may be left out; a player without traits is never described by a clue and never used as a red herring. The host derives these from cosmetic outfits. |

### Role deal

`m = max(1, floor(players / 4))` Mafia team members. With `m = 1` the team is `["mafia"]`; otherwise
`["godfather"]` plus `m - 1` `"mafia"`.

- `classic`, `gore`, `speed`: the team, one `angel`, one `detective`, the rest `villager`.
  (`gore` and `speed` differ only in host-side timers and flavour.)
- `crazy`: the team, with its third member (if `m >= 3`) a `framer` instead of `mafia`; then, with 6 or
  more players, one `jester` or `serialkiller` (seeded coin flip); then `angel`, `detective`, `vigilante`,
  `mayor` while seats remain; the rest `villager`.

Roles are shuffled with the seed. The same seed and player count always deal the same roles.

---

## 3. Phases

```
night 1 -> day 1 -> [trial 1] -> night 2 -> day 2 -> [trial 2] -> night 3 ... -> ended
```

| `phase` | What happens | Next `advance` (by `"gm"`) |
|---|---|---|
| `"night"` | Night roles pick targets. Square closed. | Resolves the night (section 4) and moves to `"day"` with the same `day` number. |
| `"day"` | Chat and votes. | If there is a single top-voted player (or a Director `forceLynch` target), moves to `"trial"` with that player as `accused`. On a tie, no votes, or a forced no-lynch, logs `nolynch` and goes straight to `"night"` with `day + 1`. |
| `"trial"` | The accused gives last words. Votes are locked. Only the accused may post in the square. DMs and ghost chat still work. | Lynches the accused exactly as before (log `death` with cause `lynch`), then `"night"` with `day + 1`. |
| `"ended"` | `winner` is set. Every action now fails with `E_ENDED`. | Not allowed. |

`day` starts at 1. Night N, day N and trial N share the number N. It increases by one each time night falls.

A win is checked after every night resolution and at the end of every day (lynch or not), and after a
`remove` action. If someone has won, the phase becomes `"ended"` immediately (so a game can end at dawn, after a
trial, or in any phase when a player is removed).

Mayor votes count double. A tally is decided only if one player has strictly more weight than every other.

### Win conditions (unchanged), checked in this order

1. Nobody alive: `"draw"`.
2. The Jester was just lynched: `"jester"`.
3. A Serial Killer is alive and at most 2 players are alive: `"draw"` if the other survivor is Mafia team, otherwise `"serialkiller"`.
4. No Mafia team and no Serial Killer alive: `"town"`.
5. No Serial Killer alive and Mafia team members are at least as many as everyone else: `"mafia"`.

`winner` is one of `"town"`, `"mafia"`, `"jester"`, `"serialkiller"`, `"draw"`, or `null`.

---

## 4. Night resolution

When the night is advanced:

1. **Mafia pick.** If the Godfather picked, their pick is carried out. Otherwise the Mafia member who picked
   most recently (latest action) is carried out. That member is the *carrier*. A Director `forceKill`
   replaces the target (not the carrier).
2. **Attacks.** The Mafia target, every Serial Killer target and every Vigilante target are attacked.
3. **Protection.** A Director `protect` shield stops every attack. An Angel's guard stops every attack
   except a Director `forceKill`.
4. **Deaths.** Attacked players who are not stopped die. They are logged in id order (default string sort).
5. **Cause.** If several attacks hit one player, the first of `mafia`, `serialkiller`, `vigilante` names the
   cause and the killer. For a Mafia kill the killer is the carrier. For a forced kill with no carrier (or
   when the carrier is the victim) the killer is the first living Godfather, else the first living Mafia
   member in seat order, other than the victim; if there is none, no killer is recorded.
6. **Saves.** A player who was attacked, guarded by an Angel, and not the `forceKill` target counts as
   *saved* (also if a Director shield covered them too). A Director shield alone is never a save.
7. **Detective.** Result is `"mafia"` for a `mafia` or `framer`, or anyone framed tonight; otherwise
   `"innocent"`. The Godfather reads innocent. A Director `fakeResult` overrides every result tonight.
8. **Clue.** See below.

### Clues

Made only when `traits` were given and at least one player died tonight. At most one clue per night.

- **Subject:** if a Framer acted tonight, the framed player. Otherwise the killer of tonight's
  highest-priority death (a Mafia kill first, then a Serial Killer kill, then a Vigilante kill).
- If the subject has no traits entry (or no killer is known), no clue is made.
- **Trait:** one of `hat`, `pack`, `tone`, chosen with the seeded generator.
- **Value:** about 70% of the time the subject's own value. Otherwise the same trait of a random living
  player who is not on the Mafia team, is not the subject, and has traits (if there is none, the subject's
  own value is used).
- The clue is `{ night, trait, value }`. Whether it was true or a red herring is never stored or shown,
  not even in `gmView`. A herring can coincide with the truth.

Suggested wording: `hat: "yes"` "wore a hat", `hat: "no"` "had no hat", `pack: "yes"` "carried a pack",
`pack: "no"` "carried nothing", `tone: "warm" | "cool" | "pale" | "dark"` "had a warm (cool, pale, dark) look".

### Kill effects (`fx`)

Any `night` action may carry `fx`: a cosmetic effect name chosen by the actor's client.

- Rule: omitted, `undefined` or `null` means no effect. Otherwise it must be a string of 1 to 24 characters,
  `a` to `z` and `0` to `9` only (`/^[a-z0-9]{1,24}$/`). **Anything else rejects the whole action with
  `E_FX`** and nothing changes (the pick is not recorded).
- Re-picking replaces the earlier pick and its `fx`.
- It surfaces in exactly one place: the victim's own `deathBy.fx`, and only if `victimSeesKiller` is on and
  the killer's own action carried an `fx`. For a Mafia kill that is the carrier's `fx`. The `fx` of
  non-killing roles is stored but never shown. It is not in `history`.

### What the Director tools look like to players (rigged games)

- A forced kill looks like a Mafia kill: `cause: "mafia"`, with a Mafia killer as described above. The
  Mafia's own pick reports `"blocked"` (or `"killed"` if that player died anyway).
- A shield gives no save event and no `savedFrom`. The attacker sees `"blocked"`.
- A faked Detective result is what the Detective sees in `investigations`, `lastNight` and `history`.
- `history` never mentions Director moves.

---

## 5. Actions

Every action is a plain object with a `type`. `applyAction` checks in the order listed and reports the first
failure. Any action at all fails with `E_ENDED` once the game is over, and a non-object action fails with
`E_UNKNOWN`.

Text rule (`chat`, `dm`, `ghostchat`): `text` must be a string, not blank after trimming, at most 500
characters (counted by code point). Otherwise `E_TEXT`.

### `night`: a night move

```js
{ type: "night", actor: "Ava", target: "Ed", fx: "knife" }   // fx optional
```

1. `actor` is not a player: `E_UNKNOWN`
2. Phase is not `"night"`: `E_PHASE`
3. `actor` is dead: `E_DEAD`
4. `actor`'s role has no night move (villager, mayor, jester): `E_NO_ABILITY`
5. `target` is not a living player: `E_TARGET`
6. `target === actor` and the role is not `angel`: `E_TARGET`
7. Bad `fx`: `E_FX`

Sending again replaces the earlier pick. What the move means depends on the role:

| Role | Move (`kind`) |
|---|---|
| `godfather`, `mafia` | `"kill"` (team pick, see section 4) |
| `serialkiller` | `"kill"` |
| `vigilante` | `"shoot"` |
| `angel` | `"protect"` (may target self) |
| `detective` | `"investigate"` |
| `framer` | `"frame"` (the target reads as Mafia to the Detective tonight, and becomes the clue subject) |

### `vote`

```js
{ type: "vote", actor: "Di", target: "Bo" }   // target: a living player id, or null to abstain
```

1. `actor` is not a player: `E_UNKNOWN`
2. Phase is `"trial"`: `E_PHASE` ("votes are locked during the trial")
3. Phase is not `"day"`: `E_PHASE`
4. `actor` is dead: `E_DEAD`
5. `target` is neither `null` nor a living player: `E_TARGET`

Voting again replaces the earlier vote. Voting for yourself is allowed.

### `chat`: the public town square

```js
{ type: "chat", from: "Bo", text: "I am just a baker" }
```

1. `from` is not a player: `E_UNKNOWN`
2. `communityChat` is off: `E_CHAT_DISABLED`
3. Phase is not `"day"` or `"trial"`: `E_PHASE`
4. `from` is dead: `E_DEAD`
5. Phase is `"trial"` and `from` is not the accused: `E_TRIAL`
6. Bad text: `E_TEXT`

### `dm`: a private whisper (any phase)

```js
{ type: "dm", from: "Cy", to: "Di", text: "trust me" }
```

1. `from` is not a player: `E_UNKNOWN`
2. `from` is dead: `E_DEAD`
3. `to` is not a player, or is `from`: `E_TARGET` (the recipient may be dead)
4. Bad text: `E_TEXT`
5. `announce` present and not a boolean: `E_UNKNOWN` **New.**

**New: `announce`.** `{ type: "dm", from: "Cy", to: "Di", text: "trust me", announce: true }` also adds a public line
`{ from: "Cy", to: "Di", whisper: true }` to `chat` (no text; everyone sees who whispered to whom, never what). This is
the Town of Salem whisper mechanic. It is added in any phase and whatever `communityChat` says. Omitted or `false`:
no public line.

### `ghostchat`: chat among the dead (any phase)

```js
{ type: "ghostchat", from: "Ed", text: "Ava did it" }
```

1. `from` is not a player: `E_UNKNOWN`
2. `from` is alive: `E_ALIVE`
3. Bad text: `E_TEXT`

Not affected by `communityChat`. Only dead players' views and `gmView` contain it.

### `advance`: move the story on

```js
{ type: "advance", by: "gm" }
```

`by` must be exactly `"gm"`, else `E_UNKNOWN`. The host sends this for the bot narrator when the timer runs
out, and for a human Grandmaster's button. Effects are in section 3. A human Grandmaster now needs two
presses to lynch: "End the day" (starts the trial) and then "Deliver the verdict" (resolves it).

### `remove`: a player leaves mid game **New**

```js
{ type: "remove", by: "gm", player: "Ed" }
```

For the server only: a player kicked while offline, a player who was away too long, a player who quit.

1. `by !== "gm"`: `E_UNKNOWN`
2. `player` is not a living player: `E_TARGET`

Effects: the player dies and the log gains `{ type: "death", day, player, role, cause: "left" }`, so the role is
revealed to everyone like any death. Their own night pick and day vote are dropped, and so is every night pick and
day vote that named them (those players can pick again; `nightPending` counts them again), a Director `forceKill`
or `forceLynch` on them is cleared. If they were on trial, there is no verdict: the day ends at once with a
`nolynch` (logged after the `left` death) and night falls. Then wins are checked, so a removal can end the game in
any phase. A Jester who leaves wins nothing. The leaver gets no `deathBy` (it is not a night death) and, being dead,
sees `ghostChat`. `history` has no entry for a removal; read it from `log`.

### `rig`: Director tools (rigged games only)

```js
{ type: "rig", by: "gm", op: "forceKill", target: "Di" }
```

First: `by !== "gm"`: `E_UNKNOWN`. Game not rigged: `E_NOT_RIGGED`. Then by `op`:

| `op` | Extra fields | When | Errors | Effect |
|---|---|---|---|---|
| `setRole` | `player`, `role` | Night 1, before it resolves | `E_PHASE`; `player` unknown or nobody holds `role`: `E_TARGET` | Swaps roles between `player` and whoever holds `role`. Clears both players' picks. |
| `forceKill` | `target` | Night | `E_PHASE`; dead or unknown target: `E_TARGET` | Replaces the Mafia target. Ignores the Angel. Last call wins. |
| `protect` | `target` | Night | `E_PHASE`; `E_TARGET` | Shields the target from every attack tonight. Can be used several times. |
| `fakeResult` | `result`: `"mafia"` or `"innocent"` | Night | `E_PHASE`; other result: `E_TARGET` | Every Detective result tonight becomes `result`. |
| `forceLynch` | `target`: player id or `null` | Day (not trial) | `E_PHASE`; `E_TARGET` | Overrides the vote. A player goes to trial and is lynched; `null` means no lynch and no trial. |
| anything else | | | `E_UNKNOWN` | |

The host should not broadcast after a rig action (play.js already passes `broadcast = false`), so players get
no hint.

### Error codes

| Code | Meaning |
|---|---|
| `E_SETUP` | Bad setup (thrown by `createGame`, never returned by `applyAction`). |
| `E_ENDED` | The game is over. |
| `E_UNKNOWN` | Not an object, unknown `type` or `op`, unknown player, a non-`"gm"` `by`, or a non-boolean `announce`. |
| `E_PHASE` | Not allowed in this phase (including votes during a trial). |
| `E_DEAD` | The dead cannot do that. |
| `E_ALIVE` | Ghost chat is for the dead only. **New.** |
| `E_NO_ABILITY` | This role has no night move. |
| `E_TARGET` | Bad target or recipient (for `remove`: not a living player). |
| `E_FX` | Bad `fx` on a night move. **New.** |
| `E_TEXT` | Bad message text. |
| `E_CHAT_DISABLED` | Community chat is off. |
| `E_TRIAL` | During a trial only the accused may post in the square. **New.** |
| `E_NOT_RIGGED` | Director tools need a rigged game. |

---

## 6. `playerView(state, playerId)`

Call it only with an id from `players`. Fields always present:

| Field | Type | Meaning |
|---|---|---|
| `you` | `string` | The viewer's id. |
| `role` | `string` | The viewer's own role. |
| `alive` | `boolean` | Is the viewer alive. |
| `phase` | `"night" \| "day" \| "trial" \| "ended"` | |
| `day` | `number` | See section 3. |
| `players` | `{ id, alive, role }[]` | Seat order. `role` is a string for: the viewer, every dead player, and, when the viewer is Mafia team, every Mafia team member. Otherwise `null`. Unchanged at `"ended"` (the host sends final roles separately). |
| `communityChat` | `boolean` | |
| `chat` | `{ from, text }[]` | The whole public square, oldest first (includes the accused's last words). Also holds whisper announcements `{ from, to, whisper: true }` (no `text`), see `dm` `announce`. |
| `dms` | `{ from, to, text }[]` | Only whispers the viewer sent or received. |
| `log` | event `[]` | The public story. See section 8. |
| `investigations` | `{ day, target, result }[]` | The viewer's Detective results (empty for others). |
| `winner` | `string \| null` | |
| `accused` | `string \| null` | **New.** The player on trial while `phase === "trial"`, else `null`. Same for everyone. |
| `clues` | `{ night, trait, value }[]` | **New.** Every clue so far, oldest first. Public. |
| `lastNight` | object or `null` | **New.** The viewer's own move in the most recently resolved night. See below. |
| `deathBy` | object or `null` | **New.** Only in the viewer's own view, only if they died at night. See below. |
| `savedFrom` | object or `null` | **New.** Only in the viewer's own view, only if an Angel saved them. See below. |

Fields present only sometimes (the key is absent otherwise, not `null`):

| Field | Present when | Type |
|---|---|---|
| `teamPicks` | `phase === "night"`, the viewer is alive and on the Mafia team (`mafia`, `godfather`, `framer`). | `{ [memberId]: targetId \| null }`. One key per living Mafia team member, the viewer and the Framer included (key order is normal JS object order; use `players` for seat order). The value is that member's current pick tonight (for the Framer, the frame target), or `null`. Updates as picks change. |
| `ghostChat` | The viewer is dead. | `{ from, text }[]`, oldest first. Never present for a living viewer, even after the game ends. |
| `history` | `phase === "ended"`. | The full replay. See section 9. |

### `lastNight`

```js
{ night: 2, kind: "protect", target: "Di", outcome: "saved" }
```

Describes the viewer's own move in the most recently resolved night. It stays the same through that day, the
trial, and the following night, until the next night resolves (compare `lastNight.night` with `day`: at dawn
of day N, a fresh result has `night === N`). `null` if the viewer made no move that night (including roles
without a night move).

| `kind` | Roles | `outcome` values |
|---|---|---|
| `"kill"` | `godfather`, `mafia` | `"killed"`: the team's carried-out pick was yours and the target died. `"blocked"`: it was yours and the target lived. `"overruled"`: the team carried out a different pick. |
| `"kill"` | `serialkiller` | `"killed"` or `"blocked"` |
| `"shoot"` | `vigilante` | `"killed"` or `"blocked"` |
| `"protect"` | `angel` | `"saved"`: your guard stopped an attack. `"protected"`: no attack was stopped by you. |
| `"investigate"` | `detective` | `"mafia"` or `"innocent"` (same as the new `investigations` entry) |
| `"frame"` | `framer` | `"framed"` |

`"killed"` means the target died that night, whoever's attack it was.

### `deathBy`

```js
{ night: 1, cause: "mafia", killer: "Ava", fx: "knife" }
```

Set only in the victim's own view, from the night they died, for the rest of the game (also after it ends).
`null` for everyone else, for the living, and for players who were lynched.

- `night`: the night number.
- `cause`: `"mafia"`, `"serialkiller"` or `"vigilante"` (section 4, step 5).
- `killer`: present only when `victimSeesKiller` is on and a killer is known. For a Mafia kill, the member
  whose pick was carried out.
- `fx`: present only when `victimSeesKiller` is on and the killer's move carried an `fx`.

With `victimSeesKiller: false` the victim gets `{ night, cause }` only.

### `savedFrom`

```js
{ night: 2, cause: "mafia" }
```

Set only in the saved player's own view. The most recent save (it keeps showing until replaced by a later
save). `cause` is the attack that was stopped, using the same priority as `deathBy`. It never names the
attacker. The Angel learns of the save through `lastNight.outcome === "saved"`; the town through the
nameless `saved` log event.

### Example: a Mafia member at night 1

```json
{
  "you": "Bo", "role": "mafia", "alive": true, "phase": "night", "day": 1,
  "players": [
    { "id": "Ava", "alive": true, "role": "godfather" },
    { "id": "Bo", "alive": true, "role": "mafia" },
    { "id": "Cy", "alive": true, "role": null },
    { "id": "Di", "alive": true, "role": null },
    { "id": "Ed", "alive": true, "role": null },
    { "id": "Flo", "alive": true, "role": null }
  ],
  "communityChat": true, "chat": [], "dms": [], "log": [], "investigations": [], "winner": null,
  "accused": null, "clues": [], "lastNight": null, "deathBy": null, "savedFrom": null,
  "teamPicks": { "Ava": "Ed", "Bo": "Di" }
}
```

### Example: the night victim at dawn (day 1)

```json
{
  "you": "Ed", "role": "villager", "alive": false, "phase": "day", "day": 1,
  "players": [
    { "id": "Ava", "alive": true, "role": null },
    { "id": "Bo", "alive": true, "role": null },
    { "id": "Cy", "alive": true, "role": null },
    { "id": "Di", "alive": true, "role": null },
    { "id": "Ed", "alive": false, "role": "villager" },
    { "id": "Flo", "alive": true, "role": null }
  ],
  "communityChat": true, "chat": [], "dms": [],
  "log": [{ "type": "death", "day": 1, "player": "Ed", "role": "villager", "cause": "night" }],
  "investigations": [], "winner": null, "accused": null,
  "clues": [{ "night": 1, "trait": "pack", "value": "yes" }],
  "lastNight": null,
  "deathBy": { "night": 1, "cause": "mafia", "killer": "Ava", "fx": "knife" },
  "savedFrom": null,
  "ghostChat": []
}
```

### Example: a villager during the trial

```json
{
  "you": "Flo", "role": "villager", "alive": true, "phase": "trial", "day": 1,
  "players": ["...as above..."],
  "communityChat": true,
  "chat": [{ "from": "Di", "text": "Bo is mafia" }, { "from": "Bo", "text": "I am just a baker" }],
  "dms": [], "log": ["...as above..."], "investigations": [], "winner": null,
  "accused": "Bo",
  "clues": [{ "night": 1, "trait": "pack", "value": "yes" }],
  "lastNight": null, "deathBy": null, "savedFrom": null
}
```

### Example: the Angel and the saved player at dawn of day 2

Angel (`Cy`): `"lastNight": { "night": 2, "kind": "protect", "target": "Di", "outcome": "saved" }`

Saved player (`Di`): `"savedFrom": { "night": 2, "cause": "mafia" }`

Everyone's log gains: `{ "type": "saved", "day": 2 }, { "type": "quiet", "day": 2 }`

### Example: after the game ends

Same fields as before, plus `history` (section 9), `"phase": "ended"`, `"winner": "town"`.

---

## 7. `gmView(state)`

For the human Grandmaster (and the host's own bookkeeping). Everything is visible, at any time.

| Field | Type |
|---|---|
| `phase`, `day` | as in `playerView` |
| `rigged` | `boolean` |
| `roles` | `{ [id]: role }` |
| `alive` | `{ [id]: boolean }` |
| `chat` | `{ from, text }[]` |
| `dms` | `{ from, to, text }[]`, all whispers |
| `log` | event `[]` |
| `winner` | `string \| null` |
| `accused` | `string \| null` **New.** |
| `clues` | `{ night, trait, value }[]` **New.** |
| `ghostChat` | `{ from, text }[]` **New.** |
| `deathBy` | `{ [victimId]: { night, cause, killer, fx } }` **New.** Every night victim. `killer` is an id or `null` (none known); `fx` is a string or `null`. Shown in full whatever `victimSeesKiller` says. |
| `savedFrom` | `{ [id]: { night, cause } }` **New.** The latest save of each saved player. |
| `history` | section 9 **New.** Always present, from the first resolved night. |

Tonight's picks are still not in `gmView` (unchanged); `nightPending(state)` says who has not acted.

```json
{
  "phase": "ended", "day": 3, "rigged": false,
  "roles": { "Ava": "godfather", "Bo": "mafia", "Cy": "angel", "Di": "detective", "Ed": "villager", "Flo": "villager" },
  "alive": { "Ava": false, "Bo": false, "Cy": true, "Di": true, "Ed": false, "Flo": true },
  "chat": [{ "from": "Di", "text": "Bo is mafia" }, { "from": "Bo", "text": "I am just a baker" }],
  "dms": [],
  "log": [
    { "type": "death", "day": 1, "player": "Ed", "role": "villager", "cause": "night" },
    { "type": "death", "day": 1, "player": "Bo", "role": "mafia", "cause": "lynch" },
    { "type": "saved", "day": 2 },
    { "type": "quiet", "day": 2 },
    { "type": "death", "day": 2, "player": "Ava", "role": "godfather", "cause": "lynch" }
  ],
  "winner": "town", "accused": null,
  "clues": [{ "night": 1, "trait": "pack", "value": "yes" }],
  "ghostChat": [{ "from": "Ed", "text": "Ava did it" }],
  "deathBy": { "Ed": { "night": 1, "cause": "mafia", "killer": "Ava", "fx": "knife" } },
  "savedFrom": { "Di": { "night": 2, "cause": "mafia" } },
  "history": ["...see section 9..."]
}
```

---

## 8. Log events

The public story, in order. Same for every view.

| Event | When |
|---|---|
| `{ type: "death", day, player, role, cause: "night" }` | Someone died in night `day`. One per victim, in id order. |
| `{ type: "saved", day }` | **New.** An Angel save happened in night `day`. No names, ever. Comes after that night's deaths and before its `quiet`. |
| `{ type: "quiet", day }` | Night `day` had no deaths (a save can still have happened). |
| `{ type: "death", day, player, role, cause: "lynch" }` | Someone was lynched at the end of trial `day`. |
| `{ type: "death", day, player, role, cause: "left" }` | **New.** Someone left mid game (`remove` action) during day or night `day`. |
| `{ type: "nolynch", day }` | Day `day` ended with no lynch (tie, no votes, or forced no-lynch). |

The UI must handle `"saved"`: play.js `tale()` looks up a story list by event type and currently has none for
it. It is a night event (part of the night's block, like `quiet` and night deaths). The trial itself adds no
log event; it is shown through `phase` and `accused`.

---

## 9. `history`

In player views only when `phase === "ended"`; always in `gmView`. One entry per resolved night and per
resolved day, in order:

```json
[
  { "type": "night", "night": 1, "acts": [
    { "actor": "Ava", "role": "godfather", "kind": "kill", "target": "Ed", "outcome": "killed" },
    { "actor": "Bo", "role": "mafia", "kind": "kill", "target": "Di", "outcome": "overruled" },
    { "actor": "Cy", "role": "angel", "kind": "protect", "target": "Cy", "outcome": "protected" },
    { "actor": "Di", "role": "detective", "kind": "investigate", "target": "Bo", "outcome": "mafia" }
  ] },
  { "type": "day", "day": 1, "votes": [
    { "voter": "Ava", "target": "Di" }, { "voter": "Bo", "target": "Di" },
    { "voter": "Cy", "target": "Bo" }, { "voter": "Di", "target": "Bo" }, { "voter": "Flo", "target": "Bo" }
  ], "lynched": "Bo" },
  { "type": "night", "night": 2, "acts": [
    { "actor": "Ava", "role": "godfather", "kind": "kill", "target": "Di", "outcome": "blocked" },
    { "actor": "Cy", "role": "angel", "kind": "protect", "target": "Di", "outcome": "saved" }
  ] },
  { "type": "day", "day": 2, "votes": [{ "voter": "Cy", "target": "Ava" }, { "voter": "Di", "target": "Ava" }], "lynched": "Ava" }
]
```

- Night entry: `{ type: "night", night, acts }`. `acts` lists every player who made a move that night, in
  seat order, with their role at the time, `kind` and `outcome` exactly as in `lastNight`. No `fx`.
- Day entry: `{ type: "day", day, votes, lynched }`. `votes` is each player's final ballot in seat order;
  players who never voted are left out; `target: null` is an abstain. `lynched` is the id lynched after the
  trial, or `null`. A Director `forceLynch` shows as the `lynched` id; the votes are the real ones.
- Night deaths are not repeated here; read them from `log` (or `"killed"` outcomes).

---

## 10. Privacy guarantees (checked by the fuzz test on every step)

- `deathBy` is non-null only in the victim's own view; `killer` and `fx` only when `victimSeesKiller` is on.
  No other view contains a killer or an `fx`.
- `savedFrom` is non-null only in the saved player's own view, with no attacker.
- `teamPicks` only for living Mafia team members, only at night.
- `ghostChat` never in a living player's view.
- `history` never in a player view before `"ended"`.
- `lastNight` is always the viewer's own move.
- Roles in `players` follow the existing rule (self, the dead, Mafia teammates).
- No internal state (`roles`, picks, traits, generator state, Director moves) appears in any player view.
- Clues never reveal whether they are true.

---

## 11. Host notes (play.js before the server; server/src/room.mjs now)

- `playerAct()` maps client messages to actions. To support the new features it needs
  `{ kind: "night", target, fx }` passed through as `fx`, and a new `{ kind: "ghostchat", text }` mapped to
  `{ type: "ghostchat", from: id, text }` (rate limit it like `chat`).
- Use `phaseDuration(state.phase, MODE[mode])` instead of the night/day ternary in `phaseSeconds()` and in
  the timer bar, so a trial lasts `TRIAL_SECONDS`.
- The host already restarts the deadline when `phase + day` changes; day to trial and trial to night both
  count as changes.
- `voteTally()` returns counts only for `"day"`; during a trial votes are locked and the tally is not needed.
- Pass `victimSeesKiller` and `traits` to `createGame` from the lobby settings and outfits. Build `traits`
  with `Object.fromEntries(...)` (not `traits[id] = ...`) so an id like `__proto__` still works.
- `renderStory()` / `tale()` must handle the `"saved"` log event (see section 8).
- `cli.mjs` is unchanged and passes any action through.
