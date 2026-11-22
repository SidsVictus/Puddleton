# The stage (stage.mjs)

The stage is the live 3D town: one house per player around a square, beans that walk, chat and emote, and a short
cutscene for every night action, dawn, trial, exile and ending. It uses the same look as the island in world.mjs: one
WebGL renderer drawing at low resolution, scaled up with nearest-neighbour, toon materials, procedural geometry only.

Try everything in `stage-demo.html` (add `?clean` to hide the panel, `?n=16` for the player count, `?phase=night`).

## Setup

```js
import { createStage } from "./stage.mjs";
const stage = createStage(canvas, { onTap, wander: true, grain: 300 });
```

- `canvas`: a canvas sized by CSS. Its parent becomes `position: relative` if it is static, because the stage adds an
  overlay `div.stg-ui` beside the canvas for speech bubbles, captions, flashes, cinema bars and the case file.
  The page needs the same import map as play.html (`three`), and looks best with the "Jersey 20" font loaded.
- `onTap(hit)`: called for a tap (not a drag) when no cutscene is playing. `hit` is
  `{ type: "ground" | "bean" | "house", id, x, z }`. `id` is the player id for beans and houses, `x, z` are world units.
  Dragging sideways turns the town (it settles on the nearest gap between two houses). A tap during a cutscene skips
  it. In the hideout a tap picks a house.
- `wander`: living beans other than `me` stroll around the square during the day. Default true.
- `grain`: no longer used. The stage renders at the screen's own pixel density (at most 2 render pixels per CSS pixel), stepping down to 1 on slow devices; `stats.ratio` reports the current value.

## Town and state

| Call | What it does |
| --- | --- |
| `setPlayers([{ id, look, alive, me, role, name }])` | Builds one house per player (4 to 16) in a ring around the square, in list order. `look` is a cosmetics look (cleaned with `cleanLook`). `role` is optional and only adds the role costume the viewer is allowed to see. `name` is optional and labels the house on the hideout map. Calling it again with the same ids, looks, roles and names only updates `alive` and `me`; anything else rebuilds the town (queued until the running scene ends). Dead players get a shut dark house and their tombstone (`look.tomb`). |
| `setPhase("night" \| "dawn" \| "day" \| "trial" \| "ended")` | Eases sky, light, lamps and windows. At night every living bean walks home, the door shuts, and the window lights go out one by one. In every other phase beans that are indoors step out. |
| `walkTo(id, x, z)` | Walks a bean (or a visible ghost) to a point with a waddle and dust puffs. Clamped to the square and paths. Returns a Promise of `true` on arrival, `false` if the bean cannot walk (indoors, dead, unknown). |
| `bubble(id, text, seconds?)` | Speech bubble above the bean for a few seconds (longer for longer text, capped at 90 characters). If the bean is indoors the bubble comes from its house; for a dead player it follows the ghost when shown. |
| `emote(id, kind, targetId?)` | `wave, shrug, laugh, point, sweat, heart, steam, sleepy, cry, spin`. `point` (and any emote with a target) turns to face the target bean or house first. |
| `setGhost(id, on)` | Shows or hides a dead player's ghost: translucent, floating, bobbing, drifting around the square. |
| `showGhosts(on)` | Master switch for all ghosts (the UI decides who can see them). |
| `where(id)` | `{ x, z, inside, home: { x, z } }`. |
| `turn(angle)`, `zoom(k)` | Camera yaw in radians and orbit distance factor (0.5 to 1.6). |
| `caption(text, seconds?)` | Big caption near the bottom of the stage. |
| `run(on)` | Pause or resume rendering (also pauses itself while the page is hidden). |
| `skip()` | Finishes the running cutscene at once, or closes the hideout. |
| `dispose()` | Stops the loop, frees GPU resources, removes listeners and the overlay. |
| `busy`, `phase`, `stats` | Getters: a scene is running; current phase; `{ frames, ms, calls, triangles, geometries, textures, particles, size }` (`ms` is the smoothed CPU time of one frame). |
| `emotes`, `dances`, `kills`, `dreams` | Lists of the ids the stage can play. |

## Cutscenes

Every `play...` call returns a Promise that resolves when the scene is done. Scenes are queued and play one at a time.
Night scenes run 2.6 to 4.0 seconds, all in the same framing (a push in on one house at night), so a glance at another
phone does not show who has a power. Any scene can be skipped with `skip()` or a tap.

| Call | Seen by | What plays |
| --- | --- | --- |
| `playKill({ victim, killer, killerLook, method, showKiller })` | the victim | The attacker walks up to the victim's house and knocks, the lights come on, the method plays, lights out, fade to black. `killerLook` (or the look of player `killer`) dresses the attacker. With `showKiller: false` the attacker is a flat black silhouette with no outfit. `method` is a KILLFX id resolved with `killMethod(look.killfx, mode)`, or `"serial"` or `"vigilante"`. |
| `playSave({ target, cause })` | the saved player | A shield bubble blooms over the house and the attack bounces off. `cause` is the method that was blocked: falling things (`piano, anvil, boot`) bounce off the top, `"vigilante"` is a pebble, anything else is a shadow that charges in and is flung back. |
| `playAngel({ target, look })` | the Angel | The Angel flies in, forms a glowing bubble and drops it on the house. |
| `playPeek({ target, result, look })` | the Detective | Tiptoe to the window with a magnifier, then a case file with the suspect's photo slams onto the screen and is stamped `MAFIA` or `INNOCENT` (`result: "mafia" \| "innocent"`). |
| `playFrame({ target, look })` | the Framer | Sneaks up and leaves a tiny fedora on the doorstep. |
| `playShot({ target, hit, look })` | the Vigilante | Slingshot from the next rooftop; the pebble goes through the window (`hit`) or pings off the wall. |
| `playDream({ kind, id })` | everyone with no action | `kind: "sheep" \| "snore" \| "talk"` (random if omitted) at the player's own house (`id`, default `me`). |
| `playHideout({ members, picks, onPick })` | the Mafia | The basement with a pinned map of the island. `members` are teammate ids (they stand in front of the map, their houses wear a tiny fedora on the map). `picks` is `{ memberId: targetId }`: one dart per member in that member's bean colour. A tap on a house calls `onPick(id)`. The Promise resolves when the hideout closes. |
| `setHideoutPicks(picks)`, `closeHideout()` | | Update the darts live (new darts fly in); leave the hideout. It also closes on `skip()`, on any phase other than night, and when another scene is queued. |
| `playDawn({ dead: [{ id, role, tomb }], saved, clue })` | everyone | Sunrise, beans step out. For each death: that door rattles but stays shut, the tombstone rises with its style's effect, and a little spirit drifts up (in `role` costume when given). `tomb` overrides `look.tomb`. `saved: true` pops a bubble over the square with "Someone was saved tonight" (pass a player id instead to pop it over that house). `clue: { trait, value, text? }` drops a clue at the scene with a caption: `trait: "head"` a feather ("A feather from a Ranch Hat was found"), `"body"` muddy footprints in that colour, `"pack"` a button; anything else shows `A clue was found: value`; `text` overrides the caption. The dead are marked dead on the stage. |
| `playTrial({ accused })` | everyone | Switches to the trial light, the town gathers, the accused is lassoed and dragged onto the podium, the spotlight snaps on. The podium and spotlight stay until the phase changes. Use `bubble()` for the last words. |
| `playExile({ id, mode, jester })` | everyone | `mode: "classic"` floats them away on a balloon, `"gore"` is a catapult, `"crazy"` a giant boot. With `jester: true` the bean flips on a jester cap instead, with confetti and a victory dance. Otherwise the player is marked dead on the stage. |
| `playVictory({ winners, team, dances })` | everyone | Winners line up in the square and each does their dance (`look.dance`, or `dances[id]`), with confetti until the phase changes. With `team: "mafia"` every winner flips on a fedora at the same moment first. Dead winners dance as ghosts. |

Kill methods: `fedora` (classic: a fedora in the lit doorway, the door shuts, a scuffle, lights out), `shove` (gore:
off the island edge), `anvil`, `pie` (gore), `mallet`, `piano`, `muffin`, `banana`, `duck`, `tickle`, `boot`, `bees`
(crazy), plus `serial` and `vigilante`.

## Effects toolkit (`stage.fx`)

- `burst(kind, x, y, z, count, opts)`: pooled pixel particles. Kinds: `spark, dust, smoke, cloud, confetti, feather,
  magic, splat, water, petal, shard, fire, bee, keys, firefly`. `opts`: `r` spread, `c` colour or colours, `sp` speed,
  `up` lift, `s` size, `dx, dy, dz` push, `flat` ring on the ground.
- `ring(x, y, z, color, radius, seconds, startRadius, upright)`: shock ring.
- `icon(name, x, y, z, opts)`: floating pixel icon (`heart, zed, bang, quest, anger, drop, note, star, skull, ha, hand,
  swirl, arrow`).
- `shake(amount)`, `flash(color, alpha, seconds)`, `glow(x, y, z, color, power, seconds)`, `slowmo(scale, seconds)`,
  `impact(x, y, z, power)`.

## Cosmetics (cosmetics.mjs)

- Look shape: `{ body, head, pack, house, killfx, tomb, dance }`. `cleanLook` fills defaults and rejects unknown ids.
  `RACKS` has one rack per look key; `SHOP` adds `emote: EMOTES` (emotes are owned items, not part of the look).
- `HOUSES`: `match` (free: painted in the bean's colour, gradient beans get a gradient house), ten paints, and four
  skins (`mushroom, lighthouse, haunted, bakery`). `KILLFX`, `TOMBS`, `EMOTES`, `DANCES` follow the same
  `{ id, name, locked }` style.
- `killMethod(id, mode)`: the kill scene for a signature (`usual` picks the free move for the room's mode).
- `preview(rack, id, look?, size?)`: data URL thumbnail of any shop item, cached.
- Builders used by the stage: `buildHouse(look)`, `buildProp(id)`, `buildTomb(id)`, `iconCanvas(name)`.

## Performance notes

- One renderer, no shadows, no post-processing, at most two point lights (effects and the spotlight).
- Houses, scenery, clouds, the podium and the still parts of every bean are merged into one mesh per material: a day
  view of 8 players is about 270 draw calls and 15k triangles, 16 players about 450 to 500 and 27k, a night close-up 50
  to 155.
- Particles are one `Points` object (720 slots in typed arrays, ring allocation); shock rings and icons are small pools.
  The frame loop allocates nothing; only speech bubbles write a transform string when they move.
- Rendering pauses while the page is hidden and with `run(false)`.
