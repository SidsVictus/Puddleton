// Puddleton engine tests: targeted checks for every feature, then a seeded fuzz audit.
// Run: node engine/test.mjs   (no dependencies; exits 1 on any failure)
import {
  createGame, applyAction, playerView, gmView, nightPending, allVoted, phaseDuration,
  exportState, importState, TRIAL_SECONDS, MODES, ALL_ROLES, MAFIA_TEAM,
} from "./engine.mjs";

let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log(`ok    ${name}`); }
  catch (e) { failed++; console.log(`FAIL  ${name}\n      ${e.message}`); }
}
function check(cond, msg) { if (!cond) throw new Error(msg); }
function same(got, want, msg) {
  const a = JSON.stringify(got), b = JSON.stringify(want);
  check(a === b, `${msg}: got ${a}, want ${b}`);
}

// Canonical dump of any value, prototypes and undefined included, so "unchanged" means identical.
const ser = (x) => JSON.stringify(x, (k, v) => {
  if (v === undefined) return "\u0000undefined";
  if (v === null || typeof v !== "object" || Array.isArray(v)) return v;
  const proto = Object.getPrototypeOf(v);
  return proto === Object.prototype ? v : { "\u0000proto": proto === null ? "null" : "other", ...v };
});

// Views cross a peer link: only plain objects, arrays and JSON values, never undefined.
function checkPlain(x, where) {
  if (x === null || typeof x !== "object") { check(x !== undefined, `${where}: undefined value`); return; }
  if (Array.isArray(x)) { x.forEach((y, i) => checkPlain(y, `${where}[${i}]`)); return; }
  check(Object.getPrototypeOf(x) === Object.prototype, `${where}: not a plain object`);
  for (const k of Object.keys(x)) checkPlain(x[k], `${where}.${k}`);
}

const BASE = { mode: "crazy", narrator: "bot", rigged: false, communityChat: true, seed: 1 };
// A game with the given cast { id: role }. Roles are set directly so each test controls who is who.
function cast(roles, extra = {}) {
  const st = createGame({ ...BASE, players: Object.keys(roles), ...extra });
  for (const [p, r] of Object.entries(roles)) st.roles[p] = r;
  return st;
}
const rigged = { narrator: "human", rigged: true };
const act = (st, a) => applyAction(st, a).result;
function ok(st, a) { const r = act(st, a); check(r.ok, `expected ok for ${JSON.stringify(a)}, got ${JSON.stringify(r)}`); }
function no(st, a, code) {
  const before = ser(st), r = act(st, a);
  check(!r.ok && r.error.code === code, `expected ${code} for ${JSON.stringify(a)}, got ${JSON.stringify(r)}`);
  check(ser(st) === before, `state changed after rejected ${JSON.stringify(a)}`);
}
const night = (st, actor, target, fx) => ok(st, { type: "night", actor, target, ...(fx !== undefined && { fx }) });
const vote = (st, actor, target) => ok(st, { type: "vote", actor, target });
const advance = (st) => ok(st, { type: "advance", by: "gm" });
const views = (st) => st.setup.players.map((p) => [p, playerView(st, p)]);
const others = (st, pid) => views(st).filter(([p]) => p !== pid);

const CAST = { gf: "godfather", maf: "mafia", ang: "angel", det: "detective", vig: "vigilante", may: "mayor", sk: "serialkiller", vil: "villager", vil2: "villager" };

// ---------- 1. victim sees killer ----------
test("victim sees the Godfather's carried-out pick and fx, nobody else does", () => {
  const st = cast(CAST);
  night(st, "gf", "vil", "knife"); night(st, "maf", "may", "pistol");
  advance(st);
  check(!st.alive.vil && st.alive.may, "the Godfather's pick should be carried out");
  same(playerView(st, "vil").deathBy, { night: 1, cause: "mafia", killer: "gf", fx: "knife" }, "victim deathBy");
  for (const [p, v] of others(st, "vil")) {
    check(v.deathBy === null, `${p} must not get deathBy`);
    const j = JSON.stringify(v);
    check(!j.includes("knife") && !j.includes("pistol") && !j.includes('"killer"'), `${p} view leaks the kill`);
  }
  same(gmView(st).deathBy.vil, { night: 1, cause: "mafia", killer: "gf", fx: "knife" }, "gm deathBy");
});

test("without a Godfather the latest mafia pick is carried out and names its picker", () => {
  const st = cast({ m1: "mafia", m2: "mafia", a: "villager", b: "villager", c: "villager", d: "villager", e: "villager", f: "angel" });
  night(st, "m1", "a"); night(st, "m2", "b"); night(st, "m1", "c");
  advance(st);
  check(!st.alive.c && st.alive.a && st.alive.b, "m1 picked last, so c dies");
  same(playerView(st, "c").deathBy, { night: 1, cause: "mafia", killer: "m1" }, "no fx given, so no fx key");
});

test("victimSeesKiller off: deathBy has night and cause only", () => {
  const st = cast(CAST, { victimSeesKiller: false });
  night(st, "gf", "vil", "knife");
  advance(st);
  same(playerView(st, "vil").deathBy, { night: 1, cause: "mafia" }, "deathBy");
  check(!JSON.stringify(playerView(st, "vil")).includes("knife"), "fx hidden");
});

test("serial killer and vigilante kills name their cause and killer", () => {
  const st = cast(CAST);
  night(st, "sk", "vil", "slash"); night(st, "vig", "may", "bang");
  advance(st);
  same(playerView(st, "vil").deathBy, { night: 1, cause: "serialkiller", killer: "sk", fx: "slash" }, "sk victim");
  same(playerView(st, "may").deathBy, { night: 1, cause: "vigilante", killer: "vig", fx: "bang" }, "vig victim");
});

test("overlapping attacks: the mafia kill names the cause", () => {
  const st = cast(CAST);
  night(st, "gf", "vil"); night(st, "sk", "vil"); night(st, "vig", "vil");
  advance(st);
  same(playerView(st, "vil").deathBy, { night: 1, cause: "mafia", killer: "gf" }, "deathBy");
});

test("a lynch gives no deathBy", () => {
  const st = cast(CAST);
  advance(st);
  for (const p of ["gf", "maf", "ang"]) vote(st, p, "vil");
  advance(st); advance(st);
  check(!st.alive.vil && playerView(st, "vil").deathBy === null, "lynch victim has no deathBy");
});

test("a forced kill names a living Mafia member, never the victim", () => {
  const st = cast(CAST, rigged);
  ok(st, { type: "rig", by: "gm", op: "forceKill", target: "gf" });
  advance(st);
  same(playerView(st, "gf").deathBy, { night: 1, cause: "mafia", killer: "maf" }, "forced deathBy");
});

// ---------- 2. kill fx ----------
test("fx must be 1 to 24 of a-z0-9; bad fx is rejected and changes nothing", () => {
  const st = cast(CAST);
  for (const fx of ["Knife", "", "a".repeat(25), "two words", "ab-c", "caf\u00e9", 5, {}, []]) no(st, { type: "night", actor: "gf", target: "vil", fx }, "E_FX");
  night(st, "gf", "vil", "a".repeat(24));
  night(st, "gf", "vil", null);
  advance(st);
  same(playerView(st, "vil").deathBy, { night: 1, cause: "mafia", killer: "gf" }, "null fx means no fx");
});

test("fx on a non-killing act is stored but never shown", () => {
  const st = cast(CAST);
  night(st, "ang", "may", "zap"); night(st, "det", "gf", "zap2"); night(st, "gf", "vil", "zap3");
  advance(st);
  for (const [p, v] of views(st)) {
    const j = JSON.stringify(v);
    check(!j.includes('"zap"') && !j.includes("zap2"), `${p} sees a non-kill fx`);
    check(p === "vil" || !j.includes("zap3"), `${p} sees the kill fx`);
  }
});

// ---------- 3. saves ----------
test("an Angel save: savedFrom for the saved player, saved outcome for the Angel, nameless log event", () => {
  const st = cast(CAST);
  night(st, "gf", "vil"); night(st, "ang", "vil");
  advance(st);
  check(st.alive.vil, "vil survives");
  same(playerView(st, "vil").savedFrom, { night: 1, cause: "mafia" }, "savedFrom");
  same(playerView(st, "ang").lastNight, { night: 1, kind: "protect", target: "vil", outcome: "saved" }, "angel lastNight");
  for (const [p, v] of others(st, "vil")) check(v.savedFrom === null, `${p} must not get savedFrom`);
  const ev = st.log.filter((e) => e.type === "saved");
  same(ev, [{ type: "saved", day: 1 }], "one nameless save event");
  check(st.log.some((e) => e.type === "quiet"), "nobody died, so the night is still quiet");
  same(playerView(st, "gf").lastNight.outcome, "blocked", "mafia sees a blocked kill");
});

test("saves name the attack cause; an unattacked guard is just protected", () => {
  const st = cast(CAST);
  night(st, "sk", "may"); night(st, "ang", "may");
  advance(st);
  same(playerView(st, "may").savedFrom, { night: 1, cause: "serialkiller" }, "sk save");
  advance(st);
  night(st, "ang", "det");
  advance(st);
  same(playerView(st, "ang").lastNight, { night: 2, kind: "protect", target: "det", outcome: "protected" }, "no attack");
  same(st.log.filter((e) => e.type === "saved").length, 1, "no second save event");
  same(playerView(st, "may").savedFrom, { night: 1, cause: "serialkiller" }, "savedFrom keeps the latest save");
});

test("Director shield is not an Angel save; a forced kill ignores the Angel", () => {
  const st = cast(CAST, rigged);
  night(st, "gf", "vil");
  ok(st, { type: "rig", by: "gm", op: "protect", target: "vil" });
  advance(st);
  check(st.alive.vil && playerView(st, "vil").savedFrom === null, "shielded silently");
  check(!st.log.some((e) => e.type === "saved"), "no save event for a Director shield");
  advance(st);
  night(st, "ang", "may");
  ok(st, { type: "rig", by: "gm", op: "forceKill", target: "may" });
  advance(st);
  check(!st.alive.may && playerView(st, "may").savedFrom === null, "forced kill goes through");
  same(playerView(st, "ang").lastNight.outcome, "protected", "the Angel did not save");
});

// ---------- 4. lastNight ----------
test("lastNight covers every night role's outcome", () => {
  const st = cast({ gf: "godfather", maf: "mafia", fr: "framer", ang: "angel", det: "detective", vig: "vigilante", sk: "serialkiller", may: "mayor", vil: "villager", vil2: "villager", jes: "jester" });
  night(st, "gf", "vil"); night(st, "maf", "may"); night(st, "fr", "vil2"); night(st, "ang", "ang");
  night(st, "det", "vil2"); night(st, "vig", "sk"); night(st, "sk", "vil2");
  advance(st);
  const want = {
    gf: { kind: "kill", target: "vil", outcome: "killed" }, maf: { kind: "kill", target: "may", outcome: "overruled" },
    fr: { kind: "frame", target: "vil2", outcome: "framed" }, ang: { kind: "protect", target: "ang", outcome: "protected" },
    det: { kind: "investigate", target: "vil2", outcome: "mafia" }, vig: { kind: "shoot", target: "sk", outcome: "killed" },
    sk: { kind: "kill", target: "vil2", outcome: "killed" },
  };
  for (const [p, v] of views(st)) same(v.lastNight, want[p] ? { night: 1, ...want[p] } : null, `${p} lastNight`);
});

test("lastNight blocked outcomes, staleness and reset", () => {
  const st = cast(CAST);
  night(st, "gf", "may"); night(st, "vig", "may"); night(st, "ang", "may"); night(st, "sk", "vil");
  advance(st);
  same(playerView(st, "gf").lastNight.outcome, "blocked", "gf blocked");
  same(playerView(st, "vig").lastNight.outcome, "blocked", "vig blocked");
  same(playerView(st, "sk").lastNight.outcome, "killed", "sk killed");
  same(playerView(st, "may").savedFrom, { night: 1, cause: "mafia" }, "mafia outranks vigilante");
  advance(st);   // no votes: straight to night 2
  same(playerView(st, "gf").lastNight.night, 1, "still shows night 1 during night 2");
  night(st, "maf", "det");
  advance(st);
  check(playerView(st, "gf").lastNight === null, "gf did not act on night 2");
  same(playerView(st, "maf").lastNight, { night: 2, kind: "kill", target: "det", outcome: "killed" }, "maf carried night 2");
});

// ---------- 5. mafia hideout ----------
test("teamPicks: living mafia team at night only", () => {
  const st = cast({ gf: "godfather", maf: "mafia", fr: "framer", ang: "angel", det: "detective", vil: "villager", vil2: "villager", vil3: "villager", vil4: "villager", vil5: "villager", vil6: "villager", vil7: "villager" });
  same(playerView(st, "gf").teamPicks, { gf: null, maf: null, fr: null }, "empty picks");
  night(st, "gf", "vil"); night(st, "fr", "det");
  same(playerView(st, "maf").teamPicks, { gf: "vil", maf: null, fr: "det" }, "current picks");
  for (const [p, v] of views(st)) check(("teamPicks" in v) === MAFIA_TEAM.includes(st.roles[p]), `${p} teamPicks presence`);
  advance(st);
  for (const [p, v] of views(st)) check(!("teamPicks" in v), `${p} has teamPicks by day`);
  for (const p of ["ang", "det", "vil2"]) vote(st, p, "maf");
  advance(st); advance(st);
  check(!st.alive.maf && st.phase === "night", "maf lynched, night 2");
  check(!("teamPicks" in playerView(st, "maf")), "dead mafia get no teamPicks");
  same(playerView(st, "gf").teamPicks, { gf: null, fr: null }, "only living members");
});

test("teamPicks is a plain object even with tricky ids", () => {
  const st = cast({ __proto__x: "villager", constructor: "godfather", toString: "mafia", 0: "angel", hasOwnProperty: "villager", b: "villager", c: "villager", d: "detective" });
  const st2 = createGame({ ...BASE, players: ["__proto__", "constructor", "toString", "valueOf", "a", "b", "c", "d"] });
  for (const p of st2.setup.players) st2.roles[p] = "villager";
  st2.roles.__proto__ = "godfather"; st2.roles.valueOf = "mafia";
  night(st2, "__proto__", "a");
  const tp = playerView(st2, "valueOf").teamPicks;
  checkPlain(tp, "teamPicks");
  check(Object.hasOwn(tp, "__proto__") && tp.__proto__ === "a" && tp.valueOf === null, "own keys for tricky ids");
  night(st, "constructor", "b");
  same(playerView(st, "toString").teamPicks, { constructor: "b", toString: null }, "picks");
});

// ---------- 6. clues ----------
const TR = (hat, pack, tone) => ({ hat, pack, tone });
test("no traits, no clues; quiet nights give no clue", () => {
  const st = cast(CAST);
  night(st, "gf", "vil"); advance(st);
  same(st.clues, [], "no traits");
  const t = cast(CAST, { traits: Object.fromEntries(Object.keys(CAST).map((p) => [p, TR("yes", "no", "warm")])) });
  advance(t);
  same(t.clues, [], "quiet night");
});

test("clues: about 70% true, herrings only from living non-mafia, same for everyone", () => {
  let match = 0, n = 0;
  for (let seed = 0; seed < 3000; seed++) {
    const traits = Object.fromEntries(Object.keys(CAST).map((p) => [p, TR("no", "no", "cool")]));
    traits.gf = TR("yes", "yes", "warm"); traits.maf = TR("yes", "yes", "pale");
    const st = cast(CAST, { seed, traits });
    night(st, "gf", "vil"); advance(st);
    check(st.clues.length === 1, "one clue per night kill");
    const c = st.clues[0];
    same(Object.keys(c), ["night", "trait", "value"], "clue keys");
    check(c.value !== "pale", "a herring never comes from the mafia");
    if (c.value === traits.gf[c.trait]) match++;
    n++;
    if (seed < 20) for (const [p, v] of views(st)) same(v.clues, st.clues, `${p} sees the public clue`);
  }
  const rate = match / n;
  check(rate > 0.66 && rate < 0.74, `true rate ${rate.toFixed(3)} should be about 0.70`);
});

test("clues describe the framed player when the Framer acted", () => {
  const roles = { gf: "godfather", maf: "mafia", fr: "framer", ang: "angel", det: "detective", vil: "villager", vil2: "villager", vil3: "villager", vil4: "villager", vil5: "villager", vil6: "villager", vil7: "villager" };
  let match = 0;
  for (let seed = 0; seed < 2000; seed++) {
    const traits = Object.fromEntries(Object.keys(roles).map((p) => [p, TR("no", "no", "cool")]));
    traits.gf = TR("yes", "yes", "warm"); traits.vil2 = TR("yes", "yes", "dark");
    const st = cast(roles, { seed, traits });
    night(st, "gf", "vil"); night(st, "fr", "vil2"); advance(st);
    const c = st.clues[0];
    check(c.value !== "warm", "the real killer is not described");
    if (c.value === traits.vil2[c.trait]) match++;
  }
  check(match / 2000 > 0.66 && match / 2000 < 0.74, `framed rate ${(match / 2000).toFixed(3)}`);
});

test("clues are deterministic for a seed", () => {
  const run = () => {
    const st = cast(CAST, { seed: 42, traits: Object.fromEntries(Object.keys(CAST).map((p, i) => [p, TR(i % 2 ? "yes" : "no", i % 3 ? "yes" : "no", ["warm", "cool", "pale", "dark"][i % 4])])) });
    for (let i = 0; i < 3 && !st.winner; i++) { night(st, "gf", st.setup.players.filter((p) => st.alive[p] && p !== "gf" && p !== "maf")[0]); advance(st); if (!st.winner) advance(st); }
    return ser(st);
  };
  check(run() === run(), "same seed, same state");
});

// ---------- 7. ghost chat ----------
test("ghost chat: dead only, text rules, never shown to the living", () => {
  const st = cast(CAST);
  no(st, { type: "ghostchat", from: "may", text: "boo" }, "E_ALIVE");
  night(st, "gf", "vil"); advance(st);
  ok(st, { type: "ghostchat", from: "vil", text: "it was gf" });
  for (const text of ["", "   ", "x".repeat(501), 5, null]) no(st, { type: "ghostchat", from: "vil", text }, "E_TEXT");
  no(st, { type: "ghostchat", from: "nobody", text: "hi" }, "E_UNKNOWN");
  no(st, { type: "ghostchat", from: "gm", text: "hi" }, "E_UNKNOWN");
  same(playerView(st, "vil").ghostChat, [{ from: "vil", text: "it was gf" }], "dead view");
  same(gmView(st).ghostChat, [{ from: "vil", text: "it was gf" }], "gm view");
  for (const [p, v] of others(st, "vil")) check(!("ghostChat" in v) && !JSON.stringify(v).includes("it was gf"), `${p} sees ghost chat`);
});

// ---------- 8. trial ----------
test("trial: single top vote, accused in all views, votes locked, only the accused speaks", () => {
  const st = cast(CAST);
  advance(st);
  vote(st, "gf", "vil"); vote(st, "maf", "vil"); vote(st, "ang", "det");
  check(!allVoted(st), "not everyone voted");
  advance(st);
  same(st.phase, "trial", "phase");
  for (const [p, v] of views(st)) same([v.phase, v.accused], ["trial", "vil"], `${p} sees the trial`);
  same(gmView(st).accused, "vil", "gm sees the accused");
  check(st.alive.vil && !allVoted(st), "accused still alive; allVoted is false in a trial");
  no(st, { type: "vote", actor: "may", target: "gf" }, "E_PHASE");
  no(st, { type: "chat", from: "may", text: "guilty" }, "E_TRIAL");
  no(st, { type: "night", actor: "gf", target: "may" }, "E_PHASE");
  ok(st, { type: "chat", from: "vil", text: "I am innocent" });
  ok(st, { type: "dm", from: "may", to: "det", text: "whispers still work" });
  advance(st);
  check(!st.alive.vil && st.phase === "night" && st.day === 2 && st.accused === null, "lynched, night 2");
  same(st.log.at(-1), { type: "death", day: 1, player: "vil", role: "villager", cause: "lynch" }, "lynch log");
});

test("ties and no votes skip the trial; mayor counts double", () => {
  const st = cast(CAST);
  advance(st);
  vote(st, "gf", "vil"); vote(st, "maf", "det");
  advance(st);
  same([st.phase, st.day, st.log.at(-1).type], ["night", 2, "nolynch"], "tie");
  advance(st); advance(st);
  same([st.phase, st.day], ["night", 3], "no votes");
  advance(st);
  vote(st, "may", "vil"); vote(st, "gf", "det");
  advance(st);
  same(st.accused, "vil", "mayor's double vote wins");
});

test("trial follows a Director forceLynch; forced no-lynch skips it", () => {
  const st = cast(CAST, rigged);
  advance(st);
  vote(st, "gf", "vil"); vote(st, "maf", "vil");
  ok(st, { type: "rig", by: "gm", op: "forceLynch", target: "det" });
  advance(st);
  same(st.accused, "det", "forced accused");
  no(st, { type: "rig", by: "gm", op: "forceLynch", target: "vil" }, "E_PHASE");
  advance(st);
  check(!st.alive.det && st.alive.vil, "det lynched");
  advance(st);
  vote(st, "gf", "vil");
  ok(st, { type: "rig", by: "gm", op: "forceLynch", target: null });
  advance(st);
  same([st.phase, st.log.at(-1).type], ["night", "nolynch"], "forced no-lynch");
});

test("trial chat obeys communityChat; a lynched Jester still wins", () => {
  const st = cast({ ...CAST, vil2: "jester" }, { communityChat: false });
  advance(st);
  vote(st, "gf", "vil2"); vote(st, "maf", "vil2");
  advance(st);
  no(st, { type: "chat", from: "vil2", text: "last words" }, "E_CHAT_DISABLED");
  advance(st);
  same([st.winner, st.phase], ["jester", "ended"], "jester wins");
});

test("phaseDuration knows the trial", () => {
  const t = { night: 60, day: 120 };
  same([phaseDuration("night", t), phaseDuration("day", t), phaseDuration("trial", t), phaseDuration("ended", t)], [60, 120, 12, 0], "durations");
  same(TRIAL_SECONDS, 12, "TRIAL_SECONDS");
});

// ---------- 9. history ----------
test("history: gm only until the end, then everyone gets the full replay", () => {
  const st = cast({ maf: "mafia", ang: "angel", det: "detective", vil: "villager", vil2: "villager" });
  night(st, "maf", "vil", "boom"); night(st, "det", "maf"); night(st, "ang", "det");
  advance(st);
  for (const [p, v] of views(st)) check(!("history" in v), `${p} sees history early`);
  check(gmView(st).history.length === 1, "gm sees history any time");
  vote(st, "det", "maf"); vote(st, "ang", "maf"); vote(st, "maf", null);
  advance(st);
  for (const [p, v] of views(st)) check(!("history" in v), `${p} sees history during the trial`);
  advance(st);
  same(st.winner, "town", "town wins");
  const want = [
    { type: "night", night: 1, acts: [
      { actor: "maf", role: "mafia", kind: "kill", target: "vil", outcome: "killed" },
      { actor: "ang", role: "angel", kind: "protect", target: "det", outcome: "protected" },
      { actor: "det", role: "detective", kind: "investigate", target: "maf", outcome: "mafia" },
    ] },
    { type: "day", day: 1, votes: [{ voter: "maf", target: null }, { voter: "ang", target: "maf" }, { voter: "det", target: "maf" }], lynched: "maf" },
  ];
  for (const [p, v] of views(st)) same(v.history, want, `${p} history`);
  check(!JSON.stringify(want).includes("boom"), "history carries no fx");
});

// ---------- 10. existing behaviour ----------
test("role deals are unchanged for a seed", () => {
  const gold = {
    classic6_1: "villager,angel,villager,detective,mafia,villager",
    crazy16_12345: "framer,villager,mafia,villager,villager,angel,mafia,villager,mayor,villager,godfather,villager,detective,villager,vigilante,serialkiller",
    gore9_2147483647: "villager,villager,villager,villager,godfather,villager,angel,mafia,detective",
    speed4_0: "villager,detective,mafia,angel",
    crazy12_77: "jester,villager,framer,detective,villager,villager,villager,vigilante,mafia,angel,mayor,godfather",
  };
  for (const [key, roles] of Object.entries(gold)) {
    const [, mode, n, seed] = key.match(/^([a-z]+)(\d+)_(\d+)$/);
    const players = Array.from({ length: +n }, (_, i) => "p" + i);
    const st = createGame({ ...BASE, mode, players, seed: +seed });
    same(players.map((p) => st.roles[p]).join(","), roles, key);
  }
});

test("setup validation, old and new options", () => {
  const good = { ...BASE, players: ["a", "b", "c", "d"] };
  const bad = [
    { ...good, mode: "chaos" }, { ...good, players: ["a", "b", "c"] }, { ...good, players: ["a", "b", "c", "gm"] },
    { ...good, players: ["a", "a", "b", "c"] }, { ...good, players: ["a", "b", "c", "no spaces"] }, { ...good, rigged: true },
    { ...good, seed: -1 }, { ...good, seed: 1.5 }, { ...good, victimSeesKiller: "yes" }, { ...good, traits: [] },
    { ...good, traits: { z: TR("yes", "yes", "warm") } }, { ...good, traits: { a: TR("yes", "yes", "green") } },
    { ...good, traits: { a: { hat: "yes", pack: "no" } } }, { ...good, traits: { a: null } }, null, [], "setup",
  ];
  for (const s of bad) {
    let code = null;
    try { createGame(s); } catch (e) { code = e.code; }
    same(code, "E_SETUP", `rejects ${JSON.stringify(s)}`);
  }
  for (const s of [{ ...good, victimSeesKiller: null, traits: null }, { ...good, traits: {} }, { ...good, traits: { a: TR("no", "yes", "dark") } }]) createGame(s);
  same(createGame(good).setup.victimSeesKiller, true, "victimSeesKiller defaults on");
});

test("win conditions: town, mafia, serial killer, draw", () => {
  const t = cast({ maf: "mafia", a: "villager", b: "villager", c: "villager" });
  advance(t); vote(t, "a", "maf"); vote(t, "b", "maf"); advance(t); advance(t);
  same(t.winner, "town", "town");
  const m = cast({ maf: "mafia", a: "villager", b: "villager", c: "villager" });
  night(m, "maf", "a"); advance(m);
  check(m.winner === null, "1 vs 2 continues");
  vote(m, "maf", "b"); vote(m, "c", "b"); advance(m); advance(m);
  same(m.winner, "mafia", "mafia parity");
  const s = cast({ sk: "serialkiller", a: "villager", b: "villager", c: "villager" });
  night(s, "sk", "a"); advance(s); vote(s, "sk", "b"); vote(s, "c", "b"); advance(s); advance(s);
  same(s.winner, "serialkiller", "sk");
  const d = cast({ sk: "serialkiller", maf: "mafia", a: "villager", b: "villager" });
  night(d, "sk", "a"); night(d, "maf", "b"); advance(d);
  same(d.winner, "draw", "sk vs mafia");
  no(d, { type: "advance", by: "gm" }, "E_ENDED");
});

test("Director tools: setRole, forceKill, fakeResult; rigging rules", () => {
  const st = cast(CAST, rigged);
  ok(st, { type: "rig", by: "gm", op: "setRole", player: "vil", role: "detective" });
  same([st.roles.vil, st.roles.det], ["detective", "villager"], "swap");
  night(st, "vil", "gf");
  ok(st, { type: "rig", by: "gm", op: "fakeResult", result: "innocent" });
  night(st, "gf", "may");
  ok(st, { type: "rig", by: "gm", op: "forceKill", target: "vil2" });
  advance(st);
  check(st.alive.may && !st.alive.vil2, "forceKill replaces the mafia pick");
  same(st.investigations.vil, [{ day: 1, target: "gf", result: "innocent" }], "fake result");
  same(playerView(st, "gf").lastNight.outcome, "blocked", "the mafia sees its own pick as blocked");
  no(st, { type: "rig", by: "gm", op: "setRole", player: "vil", role: "angel" }, "E_PHASE");
  no(st, { type: "rig", by: "vil", op: "forceLynch", target: null }, "E_UNKNOWN");
  const plain = cast(CAST);
  no(plain, { type: "rig", by: "gm", op: "forceKill", target: "vil" }, "E_NOT_RIGGED");
  no(plain, { type: "advance", by: "gf" }, "E_UNKNOWN");
});

test("detective, self-targeting, nightPending, chat and dm rules", () => {
  const st = cast({ gf: "godfather", maf: "mafia", fr: "framer", ang: "angel", det: "detective", vil: "villager", vil2: "villager", vil3: "villager", a: "villager", b: "villager", c: "villager", d: "villager" });
  same(nightPending(st), ["fr", "ang", "det", "gf", "maf"], "pending");
  no(st, { type: "night", actor: "gf", target: "gf" }, "E_TARGET");
  night(st, "ang", "ang");
  no(st, { type: "night", actor: "vil", target: "gf" }, "E_NO_ABILITY");
  no(st, { type: "chat", from: "vil", text: "hi" }, "E_PHASE");
  ok(st, { type: "dm", from: "vil", to: "det", text: "psst" });
  no(st, { type: "dm", from: "vil", to: "vil", text: "me" }, "E_TARGET");
  night(st, "fr", "vil"); night(st, "det", "vil"); night(st, "gf", "a");
  same(nightPending(st), [], "everyone done once one killer picked");
  advance(st);
  same(st.investigations.det, [{ day: 1, target: "vil", result: "mafia" }], "framed reads mafia");
  same(playerView(st, "vil").dms, [{ from: "vil", to: "det", text: "psst" }], "own dms");
  check(playerView(st, "b").dms.length === 0, "others' dms hidden");
  no(st, { type: "chat", from: "a", text: "hi" }, "E_DEAD");
  ok(st, { type: "chat", from: "b", text: "hi" });
});

// ---------- 11. server support: remove, whisper announcements, persistence ----------
const remove = (st, player) => ok(st, { type: "remove", by: "gm", player });
test("remove: the player dies with cause left, role revealed, their picks and the picks on them dropped", () => {
  const st = cast(CAST);
  night(st, "gf", "vil"); night(st, "maf", "vil"); night(st, "det", "sk"); night(st, "ang", "ang");
  remove(st, "vil");
  check(!st.alive.vil, "vil is gone");
  same(st.log.at(-1), { type: "death", day: 1, player: "vil", role: "villager", cause: "left" }, "left log");
  same(playerView(st, "gf").teamPicks, { gf: null, maf: null }, "picks on vil dropped");
  for (const [p, v] of views(st)) same(v.players.find((r) => r.id === "vil").role, "villager", `${p} sees the revealed role`);
  check(playerView(st, "vil").deathBy === null && "ghostChat" in playerView(st, "vil"), "a ghost, with no deathBy");
  remove(st, "det");
  check(!nightPending(st).includes("det"), "a removed player owes no move");
  advance(st);
  same(st.history[0].acts.map((a) => a.actor), ["ang"], "only the remaining move resolved");
});

test("remove: votes by and for the player are dropped; the accused leaving ends the trial with no verdict", () => {
  const st = cast(CAST);
  advance(st);
  vote(st, "gf", "vil"); vote(st, "maf", "vil"); vote(st, "vil", "det"); vote(st, "ang", "may");
  remove(st, "vil");
  same(Object.keys(st.votes), ["ang"], "only ang's vote stays");
  vote(st, "gf", "may"); vote(st, "maf", "may");
  advance(st);
  same(st.accused, "may", "on trial");
  remove(st, "may");
  same([st.phase, st.day, st.accused], ["night", 2, null], "no verdict, night falls");
  same(st.log.slice(-2), [{ type: "death", day: 1, player: "may", role: "mayor", cause: "left" }, { type: "nolynch", day: 1 }], "left, then no lynch");
  same(st.history.at(-1).lynched, null, "nobody lynched");
});

test("remove: rules, and a win is checked at once", () => {
  const st = cast({ maf: "mafia", a: "villager", b: "villager", c: "villager", d: "angel" });
  no(st, { type: "remove", by: "maf", player: "a" }, "E_UNKNOWN");
  no(st, { type: "remove", player: "a" }, "E_UNKNOWN");
  no(st, { type: "remove", by: "gm", player: "nobody" }, "E_TARGET");
  no(st, { type: "remove", by: "gm", player: "gm" }, "E_TARGET");
  remove(st, "a");
  no(st, { type: "remove", by: "gm", player: "a" }, "E_TARGET");
  remove(st, "maf");
  same([st.winner, st.phase], ["town", "ended"], "the last mafia left: town wins");
  no(st, { type: "remove", by: "gm", player: "b" }, "E_ENDED");
  const j = cast({ maf: "mafia", jes: "jester", a: "villager", b: "villager", c: "villager", d: "villager" });
  remove(j, "jes");
  same(j.winner, null, "a Jester who leaves wins nothing");
});

test("whisper announcements: a public line with no text; announce must be a boolean", () => {
  const st = cast(CAST);
  ok(st, { type: "dm", from: "may", to: "det", text: "zsecret plan", announce: true });
  ok(st, { type: "dm", from: "det", to: "may", text: "zquiet reply", announce: false });
  ok(st, { type: "dm", from: "det", to: "may", text: "zquiet two" });
  for (const bad of ["yes", 1, {}]) no(st, { type: "dm", from: "may", to: "det", text: "x", announce: bad }, "E_UNKNOWN");
  same(st.chat, [{ from: "may", to: "det", whisper: true }], "one announcement");
  for (const [p, v] of views(st)) {
    same(v.chat, st.chat, `${p} sees the announcement`);
    const j = JSON.stringify(v);
    check(["may", "det"].includes(p) || (!j.includes("zsecret") && !j.includes("zquiet")), `${p} sees whisper text`);
  }
});

test("exportState and importState round trip, dictionaries and tricky ids included", () => {
  const st = createGame({ ...BASE, players: ["__proto__", "constructor", "toString", "valueOf", "0", "b", "c", "d"], rigged: true, narrator: "human",
    traits: { ["__proto__"]: TR("yes", "no", "warm"), b: TR("no", "yes", "dark") } });
  for (const p of st.setup.players) st.roles[p] = "villager";
  st.roles.__proto__ = "godfather"; st.roles.constructor = "angel"; st.roles.toString = "detective";
  night(st, "__proto__", "b", "zz"); night(st, "constructor", "b");
  const back = importState(exportState(st));
  check(ser(back) === ser(st), "identical state");
  for (const k of ["roles", "alive", "investigations", "traits", "votes", "deathBy", "savedFrom"]) check(Object.getPrototypeOf(back[k]) === null, `${k} has no prototype`);
  check(Object.getPrototypeOf(back.night.acts) === null && "forceLynch" in back && back.forceLynch === undefined, "acts and forceLynch");
  advance(st); advance(back);
  check(ser(back) === ser(st), "plays on identically");
  vote(back, "valueOf", "b");
  check(allVoted(back) === false && !("toString" in back.votes), "votes dictionary has no inherited keys");
});

// ---------- fuzz ----------
function prng(seed) {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return { next, int: (n) => Math.floor(next() * n), chance: (p) => next() < p, pick: (l) => l[Math.floor(next() * l.length)] };
}

const NIGHT_ROLES = ["mafia", "godfather", "angel", "detective", "vigilante", "serialkiller", "framer"];
const TRICKY = ["__proto__", "constructor", "toString", "hasOwnProperty", "valueOf", "0", "1", "A", "zz_9"];
const WORDS = ["hello", "sus", "trust", "me", "not", "it", "was", "them", "vote", "maybe", "\u00e9clair", "ok"];
const TONES = ["warm", "cool", "pale", "dark"];

function randomSetup(R) {
  const n = 4 + R.int(13), players = [];
  while (players.length < n) {
    const id = R.chance(0.2) ? R.pick(TRICKY) : "p" + R.int(40);
    if (!players.includes(id)) players.push(id);
  }
  const narrator = R.chance(0.5) ? "bot" : "human";
  const setup = { mode: R.pick(MODES), players, narrator, rigged: narrator === "human" && R.chance(0.6), communityChat: R.chance(0.8), seed: R.int(2147483648) };
  const vsk = R.next();
  if (vsk < 0.35) setup.victimSeesKiller = true; else if (vsk < 0.7) setup.victimSeesKiller = false; else if (vsk < 0.75) setup.victimSeesKiller = null;
  const tr = R.next();
  if (tr < 0.6) {
    setup.traits = Object.fromEntries(players.filter(() => tr < 0.45 || R.chance(0.5)).map((p) => [p, TR(R.pick(["yes", "no"]), R.pick(["yes", "no"]), R.pick(TONES))]));
  } else if (tr < 0.65) setup.traits = null;
  return setup;
}

function randomAction(st, R) {
  const P = st.setup.players, alive = P.filter((p) => st.alive[p]), dead = P.filter((p) => !st.alive[p]);
  const junk = () => R.pick(["gm", "nobody", "", null, undefined, 7, {}, "__proto__", "toString", "constructor"]);
  const someone = (pool, p = 0.9) => (pool.length && R.chance(p) ? R.pick(pool) : R.chance(0.5) ? R.pick(P) : junk());
  const text = () => (R.chance(0.85) ? R.pick(WORDS) + " " + R.pick(WORDS) : R.pick(["", "   ", "\n\t", "x".repeat(501), 5, null, undefined, {}]));
  // Mostly moves that fit the phase, so games reach an ending, but every kind can come at any time.
  const kind = pickWeighted(R, st.phase === "night" ? NIGHT_MIX : DAY_MIX);
  if (kind === "junk") return R.pick([null, undefined, 3, "advance", [], {}, { type: "nope" }, { type: "advance" }, { type: "advance", by: "p1" }, { type: "rig" }, { type: "night" }, { type: "ghostchat" }, Object.create(null)]);
  if (kind === "advance") return { type: "advance", by: "gm" };
  if (kind === "night") {
    const actors = alive.filter((p) => NIGHT_ROLES.includes(st.roles[p]));
    const a = { type: "night", actor: someone(actors), target: R.chance(0.6) && alive.length ? alive[R.int(Math.min(3, alive.length))] : someone(alive) };
    const f = R.next();
    if (f < 0.4) a.fx = "zfx" + R.int(100000);
    else if (f < 0.5) a.fx = R.pick(["", "Zfx1", "zfx-1", "z".repeat(25), "zfx 1", 9, {}, null, "zfx\u00e9"]);
    return a;
  }
  if (kind === "vote") return { type: "vote", actor: someone(alive), target: R.chance(0.1) ? null : R.chance(0.6) && alive.length ? alive[0] : someone(alive) };
  if (kind === "chat") return { type: "chat", from: R.chance(0.3) && st.accused ? st.accused : someone(alive), text: text() };
  if (kind === "dm") {
    const a = { type: "dm", from: someone(alive), to: someone(P), text: text() };
    const n = R.next();
    if (n < 0.3) a.announce = true; else if (n < 0.5) a.announce = false; else if (n < 0.55) a.announce = R.pick(["yes", 1, {}]);
    return a;
  }
  if (kind === "remove") return { type: "remove", by: R.chance(0.9) ? "gm" : R.pick(P), player: R.chance(0.8) ? someone(alive) : someone(dead) };
  if (kind === "ghost") return { type: "ghostchat", from: someone(dead), text: R.chance(0.85) ? "zghost " + R.pick(WORDS) : text() };
  return {
    type: "rig", by: R.chance(0.9) ? "gm" : R.pick(P), op: R.pick(["setRole", "forceKill", "protect", "fakeResult", "forceLynch", "nope", undefined]),
    target: R.chance(0.15) ? null : someone(alive), player: someone(P), role: R.pick([...ALL_ROLES, "king", undefined]), result: R.pick(["mafia", "innocent", "guilty"]),
  };
}
const NIGHT_MIX = { junk: 3, advance: 12, night: 45, vote: 5, chat: 4, dm: 3, ghost: 5, rig: 18, remove: 1 };
const DAY_MIX = { junk: 3, advance: 14, night: 5, vote: 38, chat: 7, dm: 3, ghost: 5, rig: 15, remove: 1 };
function pickWeighted(R, mix) {
  let x = R.next() * Object.values(mix).reduce((a, b) => a + b, 0);
  for (const [k, w] of Object.entries(mix)) if ((x -= w) < 0) return k;
  return "junk";
}

// Every privacy and shape rule, checked against the full state.
// Internal keys that must never reach a player, and the fx tokens the fuzz uses (only in the victim's own deathBy).
const LEAK = /"(roles|acts|traits|rng|fake|forceKill|protect|seq|forceLynch|killer)":|zfx/;
function auditViews(st, where) {
  const P = st.setup.players, ended = st.phase === "ended", tell = st.setup.victimSeesKiller;
  const g = gmView(st);
  checkPlain(g, `${where} gmView`);
  check(Array.isArray(g.history) && Array.isArray(g.ghostChat), `${where}: gmView carries history and ghost chat`);
  const last = st.history.findLast((h) => h.type === "night");
  for (const e of st.log) if (e.type === "saved") same(Object.keys(e), ["type", "day"], `${where}: save event is nameless`);
  for (const c of st.clues) same(Object.keys(c), ["night", "trait", "value"], `${where}: clue shape`);
  for (const m of st.chat) same(Object.keys(m), m.whisper ? ["from", "to", "whisper"] : ["from", "text"], `${where}: chat line shape`);
  for (const pid of P) {
    const v = playerView(st, pid), mine = st.roles[pid], w = `${where} view ${pid}`;
    checkPlain(v, w);
    for (const row of v.players) {
      const shown = row.id === pid || !st.alive[row.id] || (MAFIA_TEAM.includes(mine) && MAFIA_TEAM.includes(st.roles[row.id]));
      check(row.role === (shown ? st.roles[row.id] : null), `${w}: role of ${row.id} leaked or missing`);
    }
    const d = st.deathBy[pid];
    same(v.deathBy, d ? { night: d.night, cause: d.cause, ...(tell && d.killer !== null && { killer: d.killer }), ...(tell && d.fx !== null && { fx: d.fx }) } : null, `${w}: deathBy`);
    const s = st.savedFrom[pid];
    same(v.savedFrom, s ? { night: s.night, cause: s.cause } : null, `${w}: savedFrom`);
    const team = st.phase === "night" && st.alive[pid] && MAFIA_TEAM.includes(mine);
    check(("teamPicks" in v) === team, `${w}: teamPicks presence`);
    if (team) {
      same(Object.keys(v.teamPicks).sort(), P.filter((p) => st.alive[p] && MAFIA_TEAM.includes(st.roles[p])).sort(), `${w}: teamPicks members`);
      for (const [m, t] of Object.entries(v.teamPicks)) same(t, Object.hasOwn(st.night.acts, m) ? st.night.acts[m].target : null, `${w}: pick of ${m}`);
    }
    check(("ghostChat" in v) === !st.alive[pid], `${w}: ghostChat presence`);
    check(("history" in v) === ended, `${w}: history presence`);
    const mineLast = last && last.acts.find((a) => a.actor === pid);
    same(v.lastNight, mineLast ? { night: last.night, kind: mineLast.kind, target: mineLast.target, outcome: mineLast.outcome } : null, `${w}: lastNight`);
    const rest = JSON.stringify({ ...v, deathBy: null, history: null });
    const leak = rest.match(LEAK);
    check(!leak, `${w}: ${leak && leak[0]} leaked`);
    if (st.alive[pid]) check(!rest.includes("zghost"), `${w}: ghost chat leaked to the living`);
    if (ended) check(!JSON.stringify(v.history).includes("zfx"), `${w}: fx in history`);
  }
}

function playGame(gameSeed, stats) {
  const R = prng(gameSeed * 7919 + 13);
  const setup = randomSetup(R);
  let st = createGame(setup);
  const actions = [], results = [];
  for (let i = 0; i < 160; i++) {
    const a = randomAction(st, R), where = `game ${gameSeed} step ${i} ${JSON.stringify(a) ?? String(a)}`;
    const before = ser(st);
    let r;
    try { r = applyAction(st, a).result; }
    catch (e) { throw new Error(`${where}: crashed: ${e.stack}`); }
    actions.push(a); results.push(r);
    stats.actions++;
    if (!r.ok) {
      stats.rejected++;
      check(ser(st) === before, `${where}: rejected (${r.error.code}) but the state changed`);
      if (r.error.code === "E_ENDED") break;
      continue;
    }
    // Persistence: sometimes carry on from a saved and restored copy, which must be identical.
    if (R.chance(0.1)) {
      const back = importState(exportState(st));
      check(ser(back) === ser(st), `${where}: export and import changed the state`);
      st = back;
      stats.restores++;
    }
    // No view shows votes, so a vote leaves every view as it was; the next audited step sees its state.
    if (a.type === "vote") continue;
    if (st.phase === "trial") stats.trialViews++;
    auditViews(st, where);
    stats.views += st.setup.players.length + 1;
  }
  // Determinism: the same setup and actions give the same state and the same results.
  const again = createGame(setup), results2 = actions.map((a) => applyAction(again, a).result);
  check(ser(again) === ser(st), `game ${gameSeed}: replay produced a different state`);
  check(JSON.stringify(results2) === JSON.stringify(results), `game ${gameSeed}: replay produced different results`);
  stats.games++;
  stats.modes[setup.mode] = (stats.modes[setup.mode] || 0) + 1;
  stats.narrators[setup.rigged ? "human rigged" : setup.narrator] = (stats.narrators[setup.rigged ? "human rigged" : setup.narrator] || 0) + 1;
  if (st.winner) stats.winners[st.winner] = (stats.winners[st.winner] || 0) + 1;
  stats.trials += st.history.filter((h) => h.type === "day" && h.lynched !== null).length;
  stats.saves += st.log.filter((e) => e.type === "saved").length;
  stats.clues += st.clues.length;
  stats.ghost += st.ghostChat.length;
  stats.nightDeaths += Object.keys(st.deathBy).length;
  stats.left += st.log.filter((e) => e.cause === "left").length;
}

test("fuzz: invalid setups only ever throw E_SETUP", () => {
  const R = prng(99);
  for (let i = 0; i < 2000; i++) {
    const s = randomSetup(R);
    const k = R.int(8);
    if (k === 0) s.mode = R.pick(["", "Classic", 3, null]);
    if (k === 1) s.players = s.players.slice(0, R.int(4));
    if (k === 2) s.players = [...s.players, R.pick(["gm", "bad id", "", 5, s.players[0]])];
    if (k === 3) s.seed = R.pick([-5, 2147483648, 0.5, "1", NaN]);
    if (k === 4) s.victimSeesKiller = R.pick(["no", 0, 1, {}]);
    if (k === 5) s.traits = R.pick([[], "x", 5, { nobody: TR("yes", "yes", "warm") }, { [s.players[0]]: TR("maybe", "no", "warm") }, { [s.players[0]]: [] }]);
    if (k === 6) Object.assign(s, { narrator: "bot", rigged: true });
    try { createGame(s); if (k !== 7) throw new Error(`accepted a bad setup ${JSON.stringify(s)}`); }
    catch (e) { if (e.code !== "E_SETUP") throw e; check(k !== 7, `rejected a good setup ${JSON.stringify(s)}: ${e.message}`); }
  }
});

const FUZZ_GAMES = 3000;
const stats = { games: 0, actions: 0, rejected: 0, views: 0, trialViews: 0, trials: 0, saves: 0, clues: 0, ghost: 0, nightDeaths: 0, left: 0, restores: 0, modes: {}, narrators: {}, winners: {} };
const t0 = Date.now();
test(`fuzz: ${FUZZ_GAMES} seeded random games (crash, atomicity, privacy, determinism)`, () => {
  for (let g = 0; g < FUZZ_GAMES; g++) playGame(g, stats);
});
const ended = Object.values(stats.winners).reduce((a, b) => a + b, 0);
console.log(`\nfuzz: ${stats.games} games in ${((Date.now() - t0) / 1000).toFixed(1)}s, ${stats.actions} actions (${stats.rejected} rejected, all atomic), ${stats.views} views audited (${stats.trialViews} trial states)`);
console.log(`      ${ended} games ended ${JSON.stringify(stats.winners)}`);
console.log(`      modes ${JSON.stringify(stats.modes)} narrators ${JSON.stringify(stats.narrators)}`);
console.log(`      ${stats.nightDeaths} night deaths, ${stats.saves} saves, ${stats.clues} clues, ${stats.trials} trials, ${stats.ghost} ghost messages`);
console.log(`      ${stats.left} players removed mid game, ${stats.restores} save and restore round trips`);
console.log(`\n${passed} passed, ${failed} failed`);
if (failed) process.exitCode = 1;
