// Cute Mafia game engine: pure, deterministic, shared by the game server, the browser and the Node CLI.

export const MODES = ["classic", "crazy", "gore", "speed"];
export const TOWN = ["villager", "angel", "detective", "vigilante", "mayor"];
export const MAFIA_TEAM = ["mafia", "godfather", "framer"];
export const NEUTRAL = ["jester", "serialkiller"];
export const ALL_ROLES = [...TOWN, ...MAFIA_TEAM, ...NEUTRAL];
export const NIGHT_ROLES = ["mafia", "godfather", "angel", "detective", "vigilante", "serialkiller", "framer"];   // roles with a night move
const ID_RE = /^[A-Za-z0-9_]{1,16}$/;
const FX_RE = /^[a-z0-9]{1,24}$/;
// What each night role's move is called in lastNight and history.
const KIND = { mafia: "kill", godfather: "kill", serialkiller: "kill", vigilante: "shoot", angel: "protect", detective: "investigate", framer: "frame" };
const CAUSES = ["mafia", "serialkiller", "vigilante"];   // when attacks overlap, the first one names the cause
const TRAITS = { hat: ["yes", "no"], pack: ["yes", "no"], tone: ["warm", "cool", "pale", "dark"] };
const TRAIT_NAMES = Object.keys(TRAITS);
export const TRIAL_SECONDS = 12;

// Seconds the host should give a phase, from its own per-mode { night, day } lengths. 0 means not timed.
export function phaseDuration(phase, times) {
  return phase === "night" ? times.night : phase === "day" ? times.day : phase === "trial" ? TRIAL_SECONDS : 0;
}

export class GameError extends Error {
  constructor(code, message) { super(message); this.code = code; }
}
const fail = (code, message) => { throw new GameError(code, message); };

// mulberry32. Its state lives in a box (the game state, after setup) so later draws stay deterministic.
function draw(box) {
  box.rng = (box.rng + 0x6d2b79f5) >>> 0;
  let t = box.rng;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

function shuffle(list, rand) {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function validateSetup(s) {
  const bad = (m) => fail("E_SETUP", m);
  if (!s || typeof s !== "object" || Array.isArray(s)) bad("setup must be an object");
  if (!MODES.includes(s.mode)) bad("mode must be one of " + MODES.join(", "));
  if (!Array.isArray(s.players) || s.players.length < 4 || s.players.length > 16) bad("need 4 to 16 players");
  if (!s.players.every((p) => typeof p === "string" && ID_RE.test(p))) bad("player ids must match " + ID_RE);
  if (s.players.includes("gm")) bad("gm is a reserved id");
  if (new Set(s.players).size !== s.players.length) bad("player ids must be unique");
  if (s.narrator !== "bot" && s.narrator !== "human") bad("narrator must be bot or human");
  if (typeof s.rigged !== "boolean") bad("rigged must be a boolean");
  if (typeof s.communityChat !== "boolean") bad("communityChat must be a boolean");
  if (typeof s.seed !== "number" || !Number.isInteger(s.seed) || s.seed < 0 || s.seed > 2147483647) bad("seed must be an integer 0..2147483647");
  if (s.rigged && s.narrator !== "human") bad("only a human Grandmaster can run a rigged game");
  if (s.victimSeesKiller != null && typeof s.victimSeesKiller !== "boolean") bad("victimSeesKiller must be a boolean");
  if (s.traits != null) {
    if (typeof s.traits !== "object" || Array.isArray(s.traits)) bad("traits must be an object");
    for (const id of Object.keys(s.traits)) {
      const t = s.traits[id];
      if (!s.players.includes(id)) bad("traits name an unknown player");
      if (!t || typeof t !== "object" || TRAIT_NAMES.some((k) => !TRAITS[k].includes(t[k]))) bad("each traits entry needs hat yes|no, pack yes|no, tone warm|cool|pale|dark");
    }
  }
}

function dealRoles(mode, n, rand) {
  const m = Math.max(1, Math.floor(n / 4));
  const team = m === 1 ? ["mafia"] : ["godfather", ...Array(m - 1).fill("mafia")];
  const roles = [];
  if (mode === "crazy") {
    if (m >= 3) team[2] = "framer";
    roles.push(...team);
    if (n >= 6) roles.push(rand() < 0.5 ? "jester" : "serialkiller");
    for (const r of ["angel", "detective", "vigilante", "mayor"]) if (roles.length < n) roles.push(r);
  } else {
    roles.push(...team, "angel", "detective");
  }
  while (roles.length < n) roles.push("villager");
  return shuffle(roles, rand);
}

const dict = () => Object.create(null);
const freshNight = () => ({ acts: dict(), seq: 0, forceKill: null, protect: [], fake: null });

export function createGame(setup) {
  validateSetup(setup);
  const box = { rng: setup.seed >>> 0 };
  const dealt = dealRoles(setup.mode, setup.players.length, () => draw(box));
  const roles = dict(), alive = dict(), investigations = dict();
  setup.players.forEach((p, i) => { roles[p] = dealt[i]; alive[p] = true; investigations[p] = []; });
  let traits = null;
  if (setup.traits != null) {
    traits = dict();
    for (const id of Object.keys(setup.traits)) { const t = setup.traits[id]; traits[id] = { hat: t.hat, pack: t.pack, tone: t.tone }; }
  }
  return {
    setup: { mode: setup.mode, players: [...setup.players], narrator: setup.narrator, rigged: setup.rigged, communityChat: setup.communityChat, seed: setup.seed, victimSeesKiller: setup.victimSeesKiller ?? true },
    roles, alive, investigations, traits, rng: box.rng,
    phase: "night", day: 1, started: false, winner: null,
    night: freshNight(), votes: dict(), forceLynch: undefined, accused: null,
    chat: [], dms: [], log: [], ghostChat: [], clues: [],
    deathBy: dict(), savedFrom: dict(), history: [],
  };
}

const isMafia = (role) => MAFIA_TEAM.includes(role);
const alivePlayers = (st) => st.setup.players.filter((p) => st.alive[p]);

function checkText(text) {
  if (typeof text !== "string" || !text.trim() || [...text].length > 500) fail("E_TEXT", "text must be 1 to 500 characters and not blank");
}

function needPlayer(st, id, code = "E_UNKNOWN") {
  if (typeof id !== "string" || !Object.hasOwn(st.roles, id)) fail(code, "unknown player");
}

function needAliveTarget(st, id) {
  if (typeof id !== "string" || !Object.hasOwn(st.roles, id) || !st.alive[id]) fail("E_TARGET", "target must be a living player");
}

function winner(st, jesterLynched) {
  const alive = alivePlayers(st);
  if (alive.length === 0) return "draw";
  if (jesterLynched) return "jester";
  const sk = alive.some((p) => st.roles[p] === "serialkiller");
  const mafia = alive.filter((p) => isMafia(st.roles[p])).length;
  if (sk && alive.length <= 2) {
    const other = alive.find((p) => st.roles[p] !== "serialkiller");
    return other && isMafia(st.roles[other]) ? "draw" : "serialkiller";
  }
  if (mafia === 0 && !sk) return "town";
  if (!sk && mafia >= alive.length - mafia) return "mafia";
  return null;
}

function finishResolution(st, jesterLynched = false) {
  st.winner = winner(st, jesterLynched);
  if (st.winner) st.phase = "ended";
}

// One public clue about the subject: about 70% their own trait, otherwise the same trait of a living
// non-mafia stand-in. Which kind it was is never stored.
function addClue(st, night, subject) {
  if (subject === null || !st.traits[subject]) return;
  const trait = TRAIT_NAMES[Math.floor(draw(st) * TRAIT_NAMES.length)];
  let source = subject;
  if (draw(st) >= 0.7) {
    const pool = alivePlayers(st).filter((p) => p !== subject && !isMafia(st.roles[p]) && st.traits[p]);
    if (pool.length) source = pool[Math.floor(draw(st) * pool.length)];
  }
  st.clues.push({ night, trait, value: st.traits[source][trait] });
}

function resolveNight(st) {
  const acts = st.night.acts, roleOf = (p) => st.roles[p], night = st.day;
  const actors = st.setup.players.filter((p) => Object.hasOwn(acts, p));
  const actorsWith = (role) => actors.filter((p) => roleOf(p) === role);
  const gf = actorsWith("godfather")[0];
  const latest = actorsWith("mafia").sort((a, b) => acts[b].seq - acts[a].seq)[0];
  const carrier = gf ?? latest;   // the member whose pick the Mafia carries out
  const pick = carrier ? acts[carrier].target : null;
  // A Director forceKill takes the place of the Mafia's pick, so the death count stays natural.
  const forced = st.night.forceKill, shielded = new Set(st.night.protect);
  const mafiaPick = forced ?? pick;
  const attacks = new Map();   // target -> [{ cause, by }] in CAUSES order
  const attack = (t, cause, by) => attacks.set(t, [...(attacks.get(t) || []), { cause, by }]);
  if (mafiaPick !== null) {
    // A forced kill still names a Mafia killer when it can, never the victim themselves.
    const living = (role) => st.setup.players.find((p) => st.alive[p] && roleOf(p) === role && p !== mafiaPick);
    attack(mafiaPick, "mafia", carrier !== undefined && carrier !== mafiaPick ? carrier : living("godfather") ?? living("mafia") ?? null);
  }
  for (const p of actorsWith("serialkiller")) attack(acts[p].target, "serialkiller", p);
  for (const p of actorsWith("vigilante")) attack(acts[p].target, "vigilante", p);
  const guarded = new Set(actorsWith("angel").map((p) => acts[p].target));
  const framed = new Set(actorsWith("framer").map((p) => acts[p].target));
  const outcome = dict();
  for (const det of actorsWith("detective")) {
    const t = acts[det].target;
    const natural = roleOf(t) === "mafia" || roleOf(t) === "framer" || framed.has(t) ? "mafia" : "innocent";
    outcome[det] = st.night.fake ?? natural;
    st.investigations[det].push({ day: st.day, target: t, result: outcome[det] });
  }
  const dead = st.setup.players
    .filter((p) => st.alive[p] && !shielded.has(p) && attacks.has(p) && (p === forced || !guarded.has(p)))
    .sort();
  // An Angel save: attacked, guarded by the Angel, and not a forced kill (those ignore the Angel).
  const saved = st.setup.players.filter((p) => st.alive[p] && guarded.has(p) && attacks.has(p) && p !== forced);
  for (const p of dead) {
    const { cause, by } = attacks.get(p)[0];
    st.alive[p] = false;
    st.deathBy[p] = { night, cause, killer: by, fx: by !== null && Object.hasOwn(acts, by) ? acts[by].fx : null };
    st.log.push({ type: "death", day: st.day, player: p, role: roleOf(p), cause: "night" });
  }
  for (const p of saved) {
    st.savedFrom[p] = { night, cause: attacks.get(p)[0].cause };
    st.log.push({ type: "saved", day: st.day });
  }
  if (dead.length === 0) st.log.push({ type: "quiet", day: st.day });
  for (const p of actors) {
    const t = acts[p].target, role = roleOf(p);
    if (role === "angel") outcome[p] = saved.includes(t) ? "saved" : "protected";
    else if (role === "framer") outcome[p] = "framed";
    else if (role === "mafia" || role === "godfather") outcome[p] = t !== pick ? "overruled" : dead.includes(t) ? "killed" : "blocked";
    else if (role !== "detective") outcome[p] = dead.includes(t) ? "killed" : "blocked";
  }
  st.history.push({ type: "night", night, acts: actors.map((p) => ({ actor: p, role: roleOf(p), kind: KIND[roleOf(p)], target: acts[p].target, outcome: outcome[p] })) });
  if (st.traits) {
    const framer = actorsWith("framer")[0];
    const first = CAUSES.map((c) => dead.find((p) => st.deathBy[p].cause === c)).find((p) => p !== undefined);
    if (first !== undefined) addClue(st, night, framer ? acts[framer].target : st.deathBy[first].killer);
  }
  st.night = freshNight();
  st.started = true;
  st.phase = "day";
  finishResolution(st);
}

function verdict(st) {
  if (st.forceLynch !== undefined) return st.forceLynch;
  const tally = dict();
  for (const [voter, target] of Object.entries(st.votes)) {
    if (target === null) continue;
    tally[target] = (tally[target] || 0) + (st.roles[voter] === "mayor" ? 2 : 1);
  }
  const ranked = Object.entries(tally).sort((a, b) => b[1] - a[1]);
  return ranked.length && (ranked.length === 1 || ranked[0][1] > ranked[1][1]) ? ranked[0][0] : null;
}

// The day ends: a single top-voted player stands trial for last words; otherwise night falls at once.
function endDay(st) {
  const accused = verdict(st);
  if (accused === null) return resolveDay(st, null);
  st.phase = "trial";
  st.accused = accused;
}

function resolveDay(st, lynched) {
  const votes = st.setup.players.filter((p) => Object.hasOwn(st.votes, p)).map((p) => ({ voter: p, target: st.votes[p] }));
  st.history.push({ type: "day", day: st.day, votes, lynched });
  let jester = false;
  if (lynched) {
    st.alive[lynched] = false;
    jester = st.roles[lynched] === "jester";
    st.log.push({ type: "death", day: st.day, player: lynched, role: st.roles[lynched], cause: "lynch" });
  } else st.log.push({ type: "nolynch", day: st.day });
  st.votes = dict();
  st.forceLynch = undefined;
  st.accused = null;
  st.phase = "night";
  st.day += 1;
  finishResolution(st, jester);
}

// A player leaves mid game (kicked while offline, or away too long). They die with cause "left" and their
// role is revealed like any death. Their own pick or vote is dropped, and so is every pick or vote that named
// them. If they were on trial there is no verdict. Wins are checked at once, so this can end the game in any phase.
function removePlayer(st, p) {
  st.alive[p] = false;
  st.log.push({ type: "death", day: st.day, player: p, role: st.roles[p], cause: "left" });
  if (st.phase === "trial" && st.accused === p) return resolveDay(st, null);
  const acts = st.night.acts;
  for (const actor of Object.keys(acts)) if (actor === p || acts[actor].target === p) delete acts[actor];
  if (st.phase === "day") for (const voter of Object.keys(st.votes)) if (voter === p || st.votes[voter] === p) delete st.votes[voter];
  if (st.forceLynch === p) st.forceLynch = undefined;
  if (st.night.forceKill === p) st.night.forceKill = null;
  finishResolution(st);
}

function rig(st, a) {
  if (a.by !== "gm") fail("E_UNKNOWN", "only the Grandmaster can do that");
  if (!st.setup.rigged) fail("E_NOT_RIGGED", "this game is not rigged");
  const night = () => { if (st.phase !== "night") fail("E_PHASE", "only at night"); };
  switch (a.op) {
    case "setRole": {
      if (st.phase !== "night" || st.day !== 1 || st.started) fail("E_PHASE", "roles can only be set before the first night ends");
      needPlayer(st, a.player, "E_TARGET");
      const holder = st.setup.players.find((p) => st.roles[p] === a.role);
      if (!holder) fail("E_TARGET", "that role is not in this game");
      [st.roles[holder], st.roles[a.player]] = [st.roles[a.player], a.role];
      delete st.night.acts[holder]; delete st.night.acts[a.player];
      return;
    }
    case "forceKill": night(); needAliveTarget(st, a.target); st.night.forceKill = a.target; return;
    case "protect": night(); needAliveTarget(st, a.target); st.night.protect.push(a.target); return;
    case "fakeResult":
      night();
      if (a.result !== "mafia" && a.result !== "innocent") fail("E_TARGET", "result must be mafia or innocent");
      st.night.fake = a.result; return;
    case "forceLynch":
      if (st.phase !== "day") fail("E_PHASE", "only during the day");
      if (a.target !== null) needAliveTarget(st, a.target);
      st.forceLynch = a.target; return;
    default: fail("E_UNKNOWN", "unknown rig op");
  }
}

function step(st, a) {
  if (st.winner) fail("E_ENDED", "the game is over");
  if (!a || typeof a !== "object" || Array.isArray(a)) fail("E_UNKNOWN", "action must be an object");
  switch (a.type) {
    case "advance":
      if (a.by !== "gm") fail("E_UNKNOWN", "only the Grandmaster can advance");
      if (st.phase === "night") return resolveNight(st);
      return st.phase === "trial" ? resolveDay(st, st.accused) : endDay(st);
    case "night": {
      needPlayer(st, a.actor);
      if (st.phase !== "night") fail("E_PHASE", "night actions happen at night");
      if (!st.alive[a.actor]) fail("E_DEAD", "the dead cannot act");
      const role = st.roles[a.actor];
      if (!NIGHT_ROLES.includes(role)) fail("E_NO_ABILITY", "your role has no night ability");
      needAliveTarget(st, a.target);
      if (a.target === a.actor && role !== "angel") fail("E_TARGET", "you cannot target yourself");
      if (a.fx != null && (typeof a.fx !== "string" || !FX_RE.test(a.fx))) fail("E_FX", "fx must be 1 to 24 characters, a-z and 0-9 only");
      st.night.acts[a.actor] = { target: a.target, seq: ++st.night.seq, fx: a.fx ?? null };
      return;
    }
    case "vote":
      needPlayer(st, a.actor);
      if (st.phase === "trial") fail("E_PHASE", "votes are locked during the trial");
      if (st.phase !== "day") fail("E_PHASE", "votes happen during the day");
      if (!st.alive[a.actor]) fail("E_DEAD", "the dead cannot vote");
      if (a.target !== null) needAliveTarget(st, a.target);
      st.votes[a.actor] = a.target;
      return;
    case "chat":
      needPlayer(st, a.from);
      if (!st.setup.communityChat) fail("E_CHAT_DISABLED", "community chat is off for this game");
      if (st.phase !== "day" && st.phase !== "trial") fail("E_PHASE", "the town square is closed at night");
      if (!st.alive[a.from]) fail("E_DEAD", "the dead cannot talk");
      if (st.phase === "trial" && a.from !== st.accused) fail("E_TRIAL", "only the accused may speak during the trial");
      checkText(a.text);
      st.chat.push({ from: a.from, text: a.text });
      return;
    case "dm":
      needPlayer(st, a.from);
      if (!st.alive[a.from]) fail("E_DEAD", "the dead cannot talk");
      if (typeof a.to !== "string" || !Object.hasOwn(st.roles, a.to) || a.to === a.from) fail("E_TARGET", "pick another player");
      checkText(a.text);
      if (a.announce != null && typeof a.announce !== "boolean") fail("E_UNKNOWN", "announce must be a boolean");
      st.dms.push({ from: a.from, to: a.to, text: a.text });
      if (a.announce) st.chat.push({ from: a.from, to: a.to, whisper: true });   // the table sees who, never what
      return;
    case "ghostchat":
      needPlayer(st, a.from);
      if (st.alive[a.from]) fail("E_ALIVE", "only the dead can use ghost chat");
      checkText(a.text);
      st.ghostChat.push({ from: a.from, text: a.text });
      return;
    case "remove":
      if (a.by !== "gm") fail("E_UNKNOWN", "only the Grandmaster can remove a player");
      needAliveTarget(st, a.player);
      return removePlayer(st, a.player);
    case "rig": return rig(st, a);
    default: fail("E_UNKNOWN", "unknown action type");
  }
}

// Applies one action atomically. Every handler validates before it mutates, so a rejected
// action leaves the state untouched without copying it.
export function applyAction(state, action) {
  try {
    step(state, action);
    return { state, result: { ok: true } };
  } catch (e) {
    if (!(e instanceof GameError)) throw e;
    return { state, result: { ok: false, error: { code: e.code, message: e.message } } };
  }
}

// Persistence. exportState gives a JSON string; importState rebuilds an identical state from it (the
// bare dictionaries come back without prototypes, and an unset forceLynch comes back as undefined).
export function exportState(st) { return JSON.stringify(st); }

const toDict = (o) => { const d = dict(); if (o) for (const k of Object.keys(o)) d[k] = o[k]; return d; };
export function importState(json) {
  const s = JSON.parse(json);
  return {
    setup: s.setup, roles: toDict(s.roles), alive: toDict(s.alive), investigations: toDict(s.investigations),
    traits: s.traits == null ? null : toDict(s.traits), rng: s.rng,
    phase: s.phase, day: s.day, started: s.started, winner: s.winner,
    night: { acts: toDict(s.night.acts), seq: s.night.seq, forceKill: s.night.forceKill, protect: s.night.protect, fake: s.night.fake },
    votes: toDict(s.votes), forceLynch: s.forceLynch, accused: s.accused,
    chat: s.chat, dms: s.dms, log: s.log, ghostChat: s.ghostChat, clues: s.clues,
    deathBy: toDict(s.deathBy), savedFrom: toDict(s.savedFrom), history: s.history,
  };
}

function lastNightOf(st, pid) {
  const last = st.history.findLast((h) => h.type === "night");
  const mine = last && last.acts.find((x) => x.actor === pid);
  return mine ? { night: last.night, kind: mine.kind, target: mine.target, outcome: mine.outcome } : null;
}

// Everything below is built from plain objects and arrays: the peer link cannot carry bare dictionaries.
export function playerView(st, pid) {
  const mine = st.roles[pid], death = st.deathBy[pid], save = st.savedFrom[pid], tell = st.setup.victimSeesKiller;
  const view = {
    you: pid, role: mine, alive: st.alive[pid], phase: st.phase, day: st.day,
    players: st.setup.players.map((id) => ({
      id, alive: st.alive[id],
      role: id === pid || !st.alive[id] || (isMafia(mine) && isMafia(st.roles[id])) ? st.roles[id] : null,
    })),
    communityChat: st.setup.communityChat,
    chat: structuredClone(st.chat),
    dms: st.dms.filter((d) => d.from === pid || d.to === pid).map((d) => ({ ...d })),
    log: structuredClone(st.log),
    investigations: structuredClone(st.investigations[pid]),
    winner: st.winner,
    accused: st.accused,
    clues: structuredClone(st.clues),
    lastNight: lastNightOf(st, pid),
    deathBy: death ? { night: death.night, cause: death.cause, ...(tell && death.killer !== null && { killer: death.killer }), ...(tell && death.fx !== null && { fx: death.fx }) } : null,
    savedFrom: save ? { night: save.night, cause: save.cause } : null,
  };
  if (st.phase === "night" && st.alive[pid] && isMafia(mine)) {
    view.teamPicks = Object.fromEntries(st.setup.players.filter((p) => st.alive[p] && isMafia(st.roles[p]))
      .map((p) => [p, Object.hasOwn(st.night.acts, p) ? st.night.acts[p].target : null]));
  }
  if (Object.hasOwn(st.alive, pid) && !st.alive[pid]) view.ghostChat = structuredClone(st.ghostChat);
  if (st.phase === "ended") view.history = structuredClone(st.history);
  return view;
}

export function gmView(st) {
  return {
    phase: st.phase, day: st.day, rigged: st.setup.rigged,
    roles: { ...st.roles }, alive: { ...st.alive },
    chat: structuredClone(st.chat), dms: structuredClone(st.dms), log: structuredClone(st.log),
    winner: st.winner,
    accused: st.accused, clues: structuredClone(st.clues), ghostChat: structuredClone(st.ghostChat),
    deathBy: structuredClone(st.deathBy), savedFrom: structuredClone(st.savedFrom), history: structuredClone(st.history),
  };
}

// Who still has a night move pending (used by the bot narrator to end the night early).
export function nightPending(st) {
  const alive = alivePlayers(st);
  const killers = alive.filter((p) => ["mafia", "godfather"].includes(st.roles[p]));
  const pending = alive.filter((p) => NIGHT_ROLES.includes(st.roles[p]) && !["mafia", "godfather"].includes(st.roles[p]) && !st.night.acts[p]);
  if (killers.length && !killers.some((p) => st.night.acts[p])) pending.push(...killers);
  return pending;
}

// True once every living player has voted. Always false outside the day, so a trial is never cut short.
export const allVoted = (st) => st.phase === "day" && alivePlayers(st).every((p) => p in st.votes);
