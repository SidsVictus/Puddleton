// Cute Mafia game engine: pure, deterministic, shared by the browser host and the Node CLI.

export const MODES = ["classic", "crazy", "gore", "speed"];
export const TOWN = ["villager", "angel", "detective", "vigilante", "mayor"];
export const MAFIA_TEAM = ["mafia", "godfather", "framer"];
export const NEUTRAL = ["jester", "serialkiller"];
export const ALL_ROLES = [...TOWN, ...MAFIA_TEAM, ...NEUTRAL];
const NIGHT_ROLES = ["mafia", "godfather", "angel", "detective", "vigilante", "serialkiller", "framer"];
const ID_RE = /^[A-Za-z0-9_]{1,16}$/;

export class GameError extends Error {
  constructor(code, message) { super(message); this.code = code; }
}
const fail = (code, message) => { throw new GameError(code, message); };

function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
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
  const rand = rng(setup.seed);
  const dealt = dealRoles(setup.mode, setup.players.length, rand);
  const roles = dict(), alive = dict(), investigations = dict();
  setup.players.forEach((p, i) => { roles[p] = dealt[i]; alive[p] = true; investigations[p] = []; });
  return {
    setup: { mode: setup.mode, players: [...setup.players], narrator: setup.narrator, rigged: setup.rigged, communityChat: setup.communityChat, seed: setup.seed },
    roles, alive, investigations,
    phase: "night", day: 1, started: false, winner: null,
    night: freshNight(), votes: dict(), forceLynch: undefined,
    chat: [], dms: [], log: [],
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

function resolveNight(st) {
  const acts = st.night.acts, roleOf = (p) => st.roles[p];
  const actorsWith = (role) => Object.keys(acts).filter((p) => roleOf(p) === role);
  const gf = actorsWith("godfather")[0];
  const mafiaVoters = Object.keys(acts).filter((p) => roleOf(p) === "mafia");
  const latest = mafiaVoters.sort((a, b) => acts[b].seq - acts[a].seq)[0];
  // A Director forceKill takes the place of the Mafia's pick, so the death count stays natural.
  const forced = st.night.forceKill, shielded = new Set(st.night.protect);
  const mafiaPick = forced ?? (gf ? acts[gf].target : latest ? acts[latest].target : null);
  const kills = new Set(mafiaPick === null ? [] : [mafiaPick]);
  for (const r of ["vigilante", "serialkiller"]) for (const p of actorsWith(r)) kills.add(acts[p].target);
  const saved = new Set(actorsWith("angel").map((p) => acts[p].target));
  const framed = new Set(actorsWith("framer").map((p) => acts[p].target));
  for (const det of actorsWith("detective")) {
    const t = acts[det].target;
    const natural = roleOf(t) === "mafia" || roleOf(t) === "framer" || framed.has(t) ? "mafia" : "innocent";
    st.investigations[det].push({ day: st.day, target: t, result: st.night.fake ?? natural });
  }
  const dead = st.setup.players
    .filter((p) => st.alive[p] && !shielded.has(p) && kills.has(p) && (p === forced || !saved.has(p)))
    .sort();
  for (const p of dead) {
    st.alive[p] = false;
    st.log.push({ type: "death", day: st.day, player: p, role: roleOf(p), cause: "night" });
  }
  if (dead.length === 0) st.log.push({ type: "quiet", day: st.day });
  st.night = freshNight();
  st.started = true;
  st.phase = "day";
  finishResolution(st);
}

function resolveDay(st) {
  let lynched = null;
  if (st.forceLynch !== undefined) lynched = st.forceLynch;
  else {
    const tally = dict();
    for (const [voter, target] of Object.entries(st.votes)) {
      if (target === null) continue;
      tally[target] = (tally[target] || 0) + (st.roles[voter] === "mayor" ? 2 : 1);
    }
    const ranked = Object.entries(tally).sort((a, b) => b[1] - a[1]);
    if (ranked.length && (ranked.length === 1 || ranked[0][1] > ranked[1][1])) lynched = ranked[0][0];
  }
  let jester = false;
  if (lynched) {
    st.alive[lynched] = false;
    jester = st.roles[lynched] === "jester";
    st.log.push({ type: "death", day: st.day, player: lynched, role: st.roles[lynched], cause: "lynch" });
  } else st.log.push({ type: "nolynch", day: st.day });
  st.votes = dict();
  st.forceLynch = undefined;
  st.phase = "night";
  st.day += 1;
  finishResolution(st, jester);
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
      return st.phase === "night" ? resolveNight(st) : resolveDay(st);
    case "night": {
      needPlayer(st, a.actor);
      if (st.phase !== "night") fail("E_PHASE", "night actions happen at night");
      if (!st.alive[a.actor]) fail("E_DEAD", "the dead cannot act");
      const role = st.roles[a.actor];
      if (!NIGHT_ROLES.includes(role)) fail("E_NO_ABILITY", "your role has no night ability");
      needAliveTarget(st, a.target);
      if (a.target === a.actor && role !== "angel") fail("E_TARGET", "you cannot target yourself");
      st.night.acts[a.actor] = { target: a.target, seq: ++st.night.seq };
      return;
    }
    case "vote":
      needPlayer(st, a.actor);
      if (st.phase !== "day") fail("E_PHASE", "votes happen during the day");
      if (!st.alive[a.actor]) fail("E_DEAD", "the dead cannot vote");
      if (a.target !== null) needAliveTarget(st, a.target);
      st.votes[a.actor] = a.target;
      return;
    case "chat":
      needPlayer(st, a.from);
      if (!st.setup.communityChat) fail("E_CHAT_DISABLED", "community chat is off for this game");
      if (st.phase !== "day") fail("E_PHASE", "the town square is closed at night");
      if (!st.alive[a.from]) fail("E_DEAD", "the dead cannot talk");
      checkText(a.text);
      st.chat.push({ from: a.from, text: a.text });
      return;
    case "dm":
      needPlayer(st, a.from);
      if (!st.alive[a.from]) fail("E_DEAD", "the dead cannot talk");
      if (typeof a.to !== "string" || !Object.hasOwn(st.roles, a.to) || a.to === a.from) fail("E_TARGET", "pick another player");
      checkText(a.text);
      st.dms.push({ from: a.from, to: a.to, text: a.text });
      return;
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

export function playerView(st, pid) {
  const mine = st.roles[pid];
  return {
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
  };
}

export function gmView(st) {
  return {
    phase: st.phase, day: st.day, rigged: st.setup.rigged,
    roles: { ...st.roles }, alive: { ...st.alive },
    chat: structuredClone(st.chat), dms: structuredClone(st.dms), log: structuredClone(st.log),
    winner: st.winner,
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

export const allVoted = (st) => alivePlayers(st).every((p) => p in st.votes);
