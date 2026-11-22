// The Room Durable Object: one per room code, the authoritative host of one Puddleton room.
// It ports the PeerJS host logic of play.js (hostReceive, attach, broadcastLobby, playerAct, hostApply, startGame,
// deal, pushViews, voteTally, relayPresence, endRoom, traitsOf) and adds the server-only rules: guest auth,
// age classes, chat safety, away players, credits and the return to the lobby.
//
// Storage: one SQLite row, "room": { m: settings, seats, timers, last game; g: the engine state and the match
// log }. Saved at once on important actions (seats, settings, start, phase changes, game end), otherwise within
// FLUSH_MS of the first unsaved change, never per chat line. Timers share the one alarm.
import { DurableObject } from "cloudflare:workers";
import { createGame, applyAction, playerView, gmView, nightPending, allVoted, phaseDuration, exportState, importState, MAFIA_TEAM, NIGHT_ROLES } from "../../engine/engine.mjs";
import { cleanLook, DEFAULT_LOOK, RACKS, EMOTES } from "../../cosmetics.mjs";
import { checkPhrase } from "../../phrases.mjs";
import { PROTOCOL } from "../../config.mjs";
import { checkText, checkName, signalsOf, dupKey, levelFor, safeVersion } from "./filter.mjs";
import { ChatLimiter, Bucket, Gap } from "./ratelimit.mjs";
import { MODE } from "./modes.mjs";
import * as db from "./db.mjs";
import { APPEAL, sha256, sameHex, randomHex, deviceHash, num, GID_RE } from "./util.mjs";
import { emptyUsage, hasUsage, AwakeClock } from "./usage.mjs";

// Game timings in ms before TIME_SCALE (a test knob).
const GRACE = 4000, CREDITS = 25000, AUTOSTART = 15000, GM_TAKEOVER = 60000, LOBBY_DROP = 60000, IDLE_LOBBY = 120000, IDLE_GAME = 300000;
// Server housekeeping in ms, not scaled.
const FLUSH_MS = 8000, BUSY_SAVE_MS = 60000, REG_DEBOUNCE = 2000, USAGE_EVERY = 300000, HELLO_MS = 10000, LIVE_MS = 75000, PURGE_MS = 3600000;
const MAX_SEATS = 16, MIN_PLAYERS = 4, AUTOSTART_AT = 6, STRIKES_TO_MUTE = 3, PAIR_FLAG = 5, MAX_SOCKETS = 40, MAX_MSG = 4096;
const VIEW_LINES = 200, MAX_EVENTS = 4000, LOBBY_LINES = 60;
// The lobby's Town Square: its last lines, and the strikes and filter mutes that carry between the lobby and the game.
const freshLobbyChat = (carry) => ({ lines: [], n: 0, strikes: { ...(carry?.strikes || {}) }, muted: [...(carry?.muted || [])], signals: {} });
const HOUSEKEEPING = ["sweep", "lobby"];   // timers whose changes need no write: a stale copy only makes a handler run early
const RESERVED = ["gm", "system", "host", "admin", "__proto__", "constructor", "prototype"];
const WHISPER = ["everyone", "friends", "nobody"];   // who may whisper to a player (their own setting)
const whisperPref = (v) => (WHISPER.includes(v) ? v : "everyone");
const REASONS = ["cheating", "harassment", "hate", "inappropriate", "name", "spam", "grooming", "other"];
const TONES = { snowdrop: "pale", frostbite: "pale", charcoal: "dark", cocoa: "dark", wraith: "dark",
  sky: "cool", mint: "cool", lilac: "cool", seafoam: "cool", limefizz: "cool", cobalt: "cool", cottoncandy: "cool" };
const MSG = {
  E_PROTO: "That message did not make sense.", E_AUTH: "Your guest pass is not valid. Make a new one.", E_BAND_LOCKED: "Your age group is already set.",
  E_NO_ROOM: "No room with that code.", E_CLOSED: "This room has closed.", E_CLASS: "That room is for a different age group.",
  E_STARTED: "That game already started.", E_ROOM_FULL: "The room is full. Sixteen is the limit.", E_PASS: "That room needs the right room pass.",
  E_KICKED: "You can't rejoin this room.", E_NAME: "Please pick a different name.", E_HOST: "Only the host can do that.",
  E_STATE: "Not right now.", E_RATE: "Easy there. One message at a time.", E_SLOWED: "You're sending too fast. Slow down a little.",
  E_DUP: "You just said that.", E_PHRASE_ONLY: "Use phrase chat here.", E_MUTED: "You can only use phrase chat for now.",
  E_PHRASE: "That phrase is not available.", E_WHISPER_OFF: "Whispers are not available here.", E_WHISPER_PREF: "That player is not taking whispers right now.", E_ONLINE: "You can only remove players who are offline.",
  E_TARGET: "You can't pick that one.", E_PASS_NEEDED: "A private room needs a room pass (3 to 32 characters).", E_NOT_ALLOWED: "That setting is not available in this room.",
  E_PLAYERS: "Need at least 4 players.", E_REPLAY: "The replay is not available.", E_REPORT: "You already reported that.", E_BANNED: "You are banned for now.",
  E_PHASE: "Not right now.", E_DEAD: "The dead can only watch.", E_NO_ABILITY: "Your role has no night power. Sleep tight.", E_TEXT: "Messages need 1 to 200 characters.",
  E_CHAT_DISABLED: "The Town Square is closed this game.", E_ENDED: "The game is over.", E_NOT_RIGGED: "Not available.", E_UNKNOWN: "Something went sideways.",
  E_FX: "That kill effect is not available.", E_TRIAL: "Only the accused may speak during the trial.", E_ALIVE: "Only ghosts can use the ghost chat.",
};

const won = (r, w) => (w === "mafia" ? MAFIA_TEAM.includes(r) : w === "town" ? !MAFIA_TEAM.includes(r) && r !== "jester" && r !== "serialkiller" : r === w);
const cleanId = (name) => String(name || "").replace(/[^A-Za-z0-9_]/g, "").slice(0, 16);
function uniqueId(base, taken) {
  let id = base, n = 2;
  while (taken.includes(id) || RESERVED.includes(id.toLowerCase())) id = base.slice(0, 14) + n++;
  return id;
}
// Looks from the network: only catalog ids, and nothing locked (the shop is closed, every locked item stays locked).
function serverLook(l) {
  const look = cleanLook(l) || { ...DEFAULT_LOOK };
  for (const rack of Object.keys(RACKS)) if (RACKS[rack].find((i) => i.id === look[rack])?.locked) look[rack] = DEFAULT_LOOK[rack];
  return look;
}
function traitsOf(l) { return { hat: l.head && l.head !== "none" ? "yes" : "no", pack: l.pack && l.pack !== "none" ? "yes" : "no", tone: TONES[l.body] || "warm" }; }
const send = (ws, obj) => { try { ws.send(JSON.stringify(obj)); } catch { /* gone */ } };
const errMsg = (code, msg) => ({ t: "err", code, msg: msg || MSG[code] || MSG.E_UNKNOWN });

export class Room extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.sql = ctx.storage.sql;
    this.scale = num(env.TIME_SCALE, 1);
    this.usage = emptyUsage();
    this.clock = new AwakeClock(2);
    this.limiter = new ChatLimiter();
    this.bucket = new Bucket(30, 5);
    this.gap = new Gap();
    this.lastMsg = new Map();
    this.friendSets = new Map();   // gid -> Set of friend gids, loaded for players whose whispers are friends only
    this.dead = new WeakSet();
    this.dirtyMeta = false; this.dirtyGame = false; this.flushAt = 0; this.alarmAt = undefined; this.unsaved = 0; this.lastActivity = 0; this.lastSave = 0; this.needArm = false;
    this.q("CREATE TABLE IF NOT EXISTS kv (k TEXT PRIMARY KEY, v TEXT NOT NULL) WITHOUT ROWID");
    const row = this.q("SELECT v FROM kv WHERE k = 'room'")[0];
    const saved = row ? JSON.parse(row.v) : null;
    this.m = saved?.m || null;
    this.g = null;
    if (saved?.g) { const g = saved.g; g.st = importState(g.st); this.g = g; }
    if (this.m) {
      for (const s of this.members()) if (s.slowUntil) this.limiter.restore(s.gid, s.slowUntil);
      addUsageInto(this.usage, this.m.usage);
      this.m.usage = emptyUsage();
    }
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair("ping", "pong"));
  }

  // ---------- storage, timers, usage ----------
  q(sql, ...args) {
    const c = this.sql.exec(sql, ...args), rows = c.toArray();
    this.usage.doRowsR += c.rowsRead; this.usage.doRowsW += c.rowsWritten;
    return rows;
  }
  ms(base) { return Math.max(50, Math.round(base * this.scale)); }
  touch(now) { this.clock.touch(now); this._socks = null; }
  markMeta() { this.dirtyMeta = true; this.wantFlush(); }
  markGame() { this.dirtyGame = true; this.wantFlush(); }
  wantFlush() { if (!this.flushAt) { this.flushAt = Date.now() + FLUSH_MS; this.arm(); } }
  // Writes the room as one row when something changed: state, or new incoming messages or connects (usage rides
  // along). Alarm counts and awake time alone never cause a write.
  save() {
    if (!this.m) return;
    if (this.dirtyMeta || this.dirtyGame || this.unsaved) {
      this.usage.awakeMs += this.clock.take();
      this.m.usage = this.usage;
      this.q("INSERT INTO kv (k, v) VALUES ('room', ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v",
        JSON.stringify({ m: this.m, g: this.g ? { ...this.g, st: exportState(this.g.st) } : null }));
      this.m.usage = emptyUsage();
      this.dirtyMeta = this.dirtyGame = false;
      this.unsaved = 0;
      this.lastSave = Date.now();
    }
    this.flushAt = 0;
    if (hasUsage(this.usage) && !this.m.timers.lobby && !this.m.closed) this.timer("lobby", Date.now() + USAGE_EVERY);
    this.arm();
  }
  timer(name, at, extra = {}) { this.m.timers[name] = { at, ...extra }; if (!HOUSEKEEPING.includes(name)) this.dirtyMeta = true; this.arm(); }
  clearTimer(name) { if (this.m.timers[name]) { delete this.m.timers[name]; if (!HOUSEKEEPING.includes(name)) this.dirtyMeta = true; this.arm(); } }
  // Every setAlarm is billed as a row written, so timer changes are collected and the alarm is set at most once
  // per event, in commitAlarm() at the end of each entry point.
  arm() { this.needArm = true; }
  commitAlarm() {
    if (!this.needArm) return;
    this.needArm = false;
    const list = Object.values(this.m?.timers || {}).map((t) => t.at);
    if (this.flushAt) list.push(this.flushAt);
    const next = list.length ? Math.min(...list) : null;
    if (next === this.alarmAt) return;
    this.alarmAt = next;
    if (next) { this.ctx.storage.setAlarm(Math.max(next, Date.now() + 20)); this.usage.doRowsW++; }
    else this.ctx.storage.deleteAlarm();
  }
  regDirty() { this.m.regDirty = true; const t = this.m.timers.lobby; if (!t || t.at > Date.now() + REG_DEBOUNCE) this.timer("lobby", Date.now() + REG_DEBOUNCE); }
  lobbyStub() { return this.env.LOBBY.get(this.env.LOBBY.idFromName("main")); }
  async reportToLobby(extra = {}) {
    const m = this.m, usage = this.usage;
    this.usage = emptyUsage();
    usage.awakeMs += this.clock.take();
    usage.rpc++;
    // Waiting rooms count only connected players, so rooms people walked away from drop out of lists quickly.
    const players = this.g ? this.activeSeats().length : this.activeSeats().filter((s) => this.online(s.gid)).length;
    const reg = m.closed ? null : { cls: m.cls, mode: m.settings.mode, players, narrator: m.narrator, private: m.settings.visibility === "private",
      started: !!this.g, quick: m.quick, members: this.members().map((s) => s.gid) };
    const gamesStarted = m.pendingGames || 0;
    m.pendingGames = 0; m.regDirty = false;
    try { await this.lobbyStub().report({ code: m.code, reg, closed: !!m.closed, usage, gamesStarted, ...extra }); }
    catch (e) {
      addUsageInto(this.usage, usage); m.pendingGames = (m.pendingGames || 0) + gamesStarted; m.regDirty = !!reg;
      console.log("lobby report failed", String(e));
      if (!m.closed) this.timer("lobby", Date.now() + 5000);   // try again soon
    }
  }

  // ---------- sockets ----------
  att(ws) { try { return ws.deserializeAttachment() || {}; } catch { return {}; } }
  socks() {
    if (this._socks) return this._socks;
    const map = new Map(), now = Date.now();
    for (const ws of this.ctx.getWebSockets()) {
      if (this.dead.has(ws) || ws.readyState !== 1) continue;
      const a = this.att(ws);
      if (!a.gid || a.kind === "pending") continue;
      const ts = this.ctx.getWebSocketAutoResponseTimestamp(ws)?.getTime() || 0;
      const last = Math.max(a.at || 0, ts, this.lastMsg.get(a.gid) || 0);
      if (now - last > LIVE_MS) continue;
      if (!map.has(a.gid)) map.set(a.gid, []);
      map.get(a.gid).push(ws);
    }
    return (this._socks = map);
  }
  online(gid) { return this.socks().has(gid); }
  toGid(gid, obj) { for (const ws of this.socks().get(gid) || []) send(ws, obj); }
  toAll(obj, filter = () => true) { for (const [gid, list] of this.socks()) if (filter(gid)) for (const ws of list) send(ws, obj); }
  drop(ws, code, reason) { this.dead.add(ws); this._socks = null; try { ws.close(code, reason); } catch { /* closed */ } }

  // ---------- members ----------
  members() { return this.m ? [...this.m.seats, ...(this.m.gm ? [this.m.gm] : [])] : []; }
  member(gid) { return this.members().find((s) => s.gid === gid) || null; }
  seatById(id) { return this.m.seats.find((s) => s.id === id) || null; }
  activeSeats() { return this.m.seats.filter((s) => !s.left); }
  isGm(gid) { return !!this.m.gm && this.m.gm.gid === gid; }
  isHost(gid) { return this.m.host === gid; }
  hostId() { const s = this.m.seats.find((x) => x.gid === this.m.host); return s ? s.id : ""; }
  muted(s) { return ((this.g || this.m?.lobbyChat)?.muted || []).includes(s.gid) || (s.muteUntil || 0) > Date.now(); }
  // Who may type, and who may read typed lines (see PROTOCOL.md, chat tiers).
  seesTyped(s) { return this.m.cls !== "kids" && s.band !== "child" && (this.m.settings.visibility === "private" || (s.band === "adult" && !!s.freeChat)); }
  tier(s) { return this.seesTyped(s) && !this.muted(s) ? "text" : "phrase"; }
  // Filter levels: what a member sends is checked at their band's level; teens, children and adults who chose
  // "strict" read other players' typed lines at the standard level (safeVersion), never rougher.
  sendLevel(s) { return levelFor(s.band, s.filter); }
  safeReader(s) { return s.band !== "adult" || s.filter === "strict"; }
  you(s) { return { id: s.id || "", gid: s.gid, band: s.band, gm: this.isGm(s.gid), host: this.isHost(s.gid), tier: this.tier(s), muted: this.muted(s), freeChat: !!s.freeChat, chatFilter: this.sendLevel(s), safeChat: this.safeReader(s), whisper: whisperPref(s.whisper), blocks: (s.blocks || []).map((g) => this.member(g)?.id).filter(Boolean) }; }
  seatsPublic() { return (this.g ? this.m.seats : this.activeSeats()).map((s) => ({ id: s.id, look: s.look, online: this.online(s.gid), card: s.gid })); }
  events() { return this.g ? this.g.log : (this.m.lobbyLog ||= []); }
  log(k, data = {}) { const ev = this.events(); ev.push({ at: Date.now(), k, ...data }); if (ev.length > MAX_EVENTS) ev.splice(0, ev.length - MAX_EVENTS); }

  // ---------- lifecycle (called by the Lobby) ----------
  async init(cfg) {
    if (this.m && !this.m.closed) return false;
    const now = Date.now();
    this.m = {
      code: cfg.code, cls: cfg.cls, created: now, creator: cfg.creator, creatorJoined: false, quick: !!cfg.quick, narrator: cfg.narrator, gm: null, host: null,
      settings: { mode: "classic", communityChat: true, victimSeesKiller: true, visibility: "public", passSalt: "", passHash: "", secretWhispers: false, rigged: false },
      seats: [], banned: [], votekicks: {}, reportsBy: {}, timers: {}, lastGame: null, lastLog: null, lobbyLog: [], closed: false, usage: emptyUsage(), pendingGames: 0, regDirty: false,
    };
    this.g = null;
    this.timer("idle", now + this.ms(IDLE_LOBBY));
    this.dirtyMeta = true;
    this.save();
    this.commitAlarm();
    return true;
  }

  async fetch(req) {
    if (req.headers.get("Upgrade") !== "websocket") return new Response("expected a websocket", { status: 426 });
    const now = Date.now();
    this.touch(now);
    this.lastActivity = now;
    this.usage.connects++;
    this.unsaved++;
    const pair = new WebSocketPair(), [client, server] = Object.values(pair);
    this.ctx.acceptWebSocket(server);
    server.serializeAttachment({ kind: "pending", at: now });
    if (!this.m || this.ctx.getWebSockets().length > MAX_SOCKETS) {
      send(server, errMsg(this.m ? "E_ROOM_FULL" : "E_NO_ROOM"));
      this.drop(server, 4004, "no room");
    } else if (this.m.closed) {
      send(server, { t: "closed", reason: this.m.closedReason || "closed" });
      this.drop(server, 4011, "closed");
    } else if (!this.m.timers.sweep) this.timer("sweep", now + HELLO_MS);
    if (this.m) this.wantFlush();
    this.commitAlarm();
    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(ws, data) {
    const now = Date.now();
    this.touch(now);
    this.lastActivity = now;
    this.usage.incoming++;
    this.unsaved++;
    if (!this.m) return;
    if (typeof data !== "string" || data.length > MAX_MSG) return send(ws, errMsg("E_PROTO"));
    let msg;
    try { msg = JSON.parse(data); } catch { return send(ws, errMsg("E_PROTO")); }
    if (!msg || typeof msg !== "object" || typeof msg.t !== "string") return send(ws, errMsg("E_PROTO"));
    const a = this.att(ws);
    try {
      if (a.kind === "pending") {
        if (msg.t !== "hello") return send(ws, errMsg("E_PROTO", "Say hello first."));
        await this.onHello(ws, msg, now);
      } else if (a.gid) {
        this.lastMsg.set(a.gid, now);
        if (msg.t === "ping") return send(ws, { t: "pong", serverNow: now });
        if (!this.bucket.take(a.gid, now)) {
          if (this.gap.ok("flood:" + a.gid, now, 1000)) send(ws, errMsg("E_RATE"));
          return;
        }
        await this.onMessage(ws, a, msg, now);
      }
    } finally {
      if (this.m && (this.dirtyMeta || this.dirtyGame || this.unsaved)) this.wantFlush();
      this.commitAlarm();
    }
  }

  async webSocketClose(ws, code) {
    this.touch(Date.now());
    this.lastActivity = Date.now();
    try { ws.close(code === 1005 || code === 1006 ? 1000 : code, "bye"); } catch { /* already closed */ }
    this.dead.add(ws);
    const a = this.att(ws);
    if (this.m && a.gid && a.kind !== "pending") this.onDisconnect(a.gid);
    if (this.m && (this.dirtyMeta || this.dirtyGame)) this.wantFlush();
    this.commitAlarm();
  }
  async webSocketError(ws) { await this.webSocketClose(ws, 1011); }

  // ---------- hello: auth, age class, seat, rejoin ----------
  async onHello(ws, msg, now) {
    const fail = (code, close, extra = {}) => { send(ws, { ...errMsg(code), ...extra }); this.drop(ws, close, code); };
    if (msg.v !== PROTOCOL) { send(ws, { t: "version", need: PROTOCOL, got: msg.v ?? null }); return this.drop(ws, 4000, "version"); }
    if (typeof msg.gid !== "string" || !GID_RE.test(msg.gid) || typeof msg.secret !== "string" || msg.secret.length > 128) return fail("E_AUTH", 4010);
    const guest = await db.getGuest(this.env, this.usage, msg.gid);
    if (!guest || !sameHex(await sha256(msg.secret), guest.secret_hash)) return fail("E_AUTH", 4010);
    if (msg.band != null && msg.band !== guest.band) return fail("E_BAND_LOCKED", 4010);
    const gid = guest.gid, band = guest.band, dev = await deviceHash(this.env, msg.device);
    const ban = await db.activeSanction(this.env, this.usage, "ban", { gid, device: dev }, now);
    if (ban) { send(ws, { t: "sanction", type: "ban", reason: ban.reason, until: ban.until, appeal: APPEAL }); return this.drop(ws, 4003, "banned"); }
    const mute = await db.activeSanction(this.env, this.usage, "mute", { gid }, now);
    const blocks = await db.getBlocks(this.env, this.usage, gid);
    const whisper = whisperPref(msg.whisper);
    const friends = whisper === "friends" ? await db.getFriends(this.env, this.usage, gid) : null;
    // Everything below is synchronous, so the room cannot change under us.
    const m = this.m;
    if (!m || m.closed) return fail(m ? "E_CLOSED" : "E_NO_ROOM", 4011);
    if ((m.cls === "kids") !== (band === "child")) return fail("E_CLASS", 4006);
    let s = this.member(gid), fresh = false;
    if (!s) {
      if (m.banned.includes(gid)) return fail("E_KICKED", 4005);
      const asGm = m.narrator === "human" && !m.gm && gid === m.creator;
      if (!asGm) {
        if (this.g) return fail("E_STARTED", 4009);
        if (this.activeSeats().length >= MAX_SEATS) return fail("E_ROOM_FULL", 4008);
      }
      if (m.settings.visibility === "private" && gid !== m.creator) {
        if (typeof msg.pass !== "string" || !sameHex(await sha256(m.settings.passSalt + ":" + msg.pass), m.settings.passHash)) return fail("E_PASS", 4007);
        if (this.member(gid) || this.g) return fail("E_STARTED", 4009);   // re-checked after the await
      }
      if (asGm) {
        s = m.gm = { gid, band, look: serverLook(msg.look), joined: now, freeChat: false, blocks: [], dev };
        m.host = gid;
      } else {
        const typed = String(msg.name || "").slice(0, 64), base = cleanId(typed);
        // Names follow one rule for every band: no slurs, nothing sexual, no links (handles and numbers are fine).
        // Children also may not put contact details in a name (an email, or a run of 8 or more digits).
        const child = band === "child";
        if (!base || !checkName(typed, { child }).ok || !checkName(base, { child }).ok) return fail("E_NAME", 4002);
        const id = uniqueId(base, this.m.seats.map((x) => x.id));
        s = { gid, id, band, look: serverLook(msg.look), joined: now, freeChat: false, blocks: [], dev, slowUntil: 0, muteUntil: 0, missed: 0, offline: 0, left: false, offSince: 0 };
        m.seats.push(s);
        if (!m.host || (gid === m.creator && !m.creatorJoined)) m.host = gid;
      }
      if (gid === m.creator) m.creatorJoined = true;
      fresh = true;
      this.log("join", { gid, id: s.id || "(gm)" });
    }
    s.band = band; s.dev = dev || s.dev; s.blocks = blocks; s.offSince = 0; s.whisper = whisper;
    if (friends) this.friendSets.set(gid, new Set(friends)); else this.friendSets.delete(gid);
    s.freeChat = band === "adult" && msg.freeChat === true;
    s.filter = band === "adult" && msg.filter === "strict" ? "strict" : null;
    s.muteUntil = mute ? mute.until : 0;
    if (!this.g && msg.look) s.look = serverLook(msg.look);
    // One live socket per guest: a newer hello takes the seat over.
    for (const old of this.socks().get(gid) || []) if (old !== ws) { send(old, { t: "closed", reason: "elsewhere" }); this.drop(old, 4001, "replaced"); }
    ws.serializeAttachment({ kind: this.isGm(gid) ? "gm" : "player", gid, at: now });
    this._socks = null;
    this.lastMsg.set(gid, now);
    this.clearTimer("idle");
    if (this.isGm(gid)) this.clearTimer("gm");
    // Remember the name and look for the profile card (only when they changed: one row write).
    if (s.id && (guest.name !== s.id || guest.look !== JSON.stringify(s.look))) {
      this.ctx.waitUntil(db.run(this.env, this.usage, "UPDATE guests SET name = ?, look = ?, last_seen = ? WHERE gid = ?", s.id, JSON.stringify(s.look), now, gid).catch(() => {}));
    }
    send(ws, { t: "welcome", code: m.code, cls: m.cls === "kids" ? "kids" : "13+", you: this.you(s), serverNow: now, protocol: PROTOCOL });
    if (this.g) {
      this.sendState(s);
      this.toAll({ t: "presence", id: s.id || "", online: true }, (g) => g !== gid);
    } else {
      this.checkAutostart(now);
      this.broadcastLobby();
      this.sendLobbyChat(s);
    }
    if (fresh) { this.regDirty(); this.dirtyMeta = true; this.save(); } else { if (!this.g) this.regDirty(); this.markMeta(); }
  }

  onDisconnect(gid) {
    if (this.online(gid)) return;
    const s = this.member(gid), now = Date.now();
    if (!s) return;
    if (this.isGm(gid)) this.timer("gm", now + this.ms(GM_TAKEOVER));
    if (this.g) this.toAll({ t: "presence", id: s.id || "", online: false });
    else if (!this.isGm(gid)) {
      s.offSince = now;
      if (!this.m.timers.drop) this.timer("drop", now + this.ms(LOBBY_DROP));
      this.broadcastLobby();
      this.regDirty();
    }
    if (this.socks().size === 0) this.timer("idle", now + this.ms(this.g ? IDLE_GAME : IDLE_LOBBY));
    this.markMeta();
  }

  // ---------- messages ----------
  async onMessage(ws, a, msg, now) {
    const s = this.member(a.gid);
    if (!s) { send(ws, errMsg("E_KICKED")); return this.drop(ws, 4005, "gone"); }
    const err = (code, m) => send(ws, errMsg(code, m));
    const host = this.isHost(s.gid), gm = this.isGm(s.gid), inGame = !!this.g;
    switch (msg.t) {
      case "look":
        if (inGame || gm) return err("E_STATE");
        s.look = serverLook(msg.look); this.broadcastLobby(); return this.markMeta();
      case "prefs":
        if ("freeChat" in msg) s.freeChat = s.band === "adult" && msg.freeChat === true;
        if ("filter" in msg) s.filter = s.band === "adult" && msg.filter === "strict" ? "strict" : null;
        if ("whisper" in msg) { s.whisper = whisperPref(msg.whisper); if (s.whisper !== "friends") this.friendSets.delete(s.gid); }
        this.markMeta();
        if (inGame) return this.sendState(s);
        send(ws, { t: "you", you: this.you(s) });
        return this.sendLobbyChat(s);
      case "leave": return this.leave(s, ws);
      case "settings": if (!host) return err("E_HOST"); if (inGame) return err("E_STATE"); return this.onSettings(s, msg, err);
      case "start": if (!host) return err("E_HOST"); if (inGame) return err("E_STATE"); return this.startGame(err);
      case "kick": if (!host) return err("E_HOST"); return this.onKick(s, msg.id, err);
      case "votekick": if (inGame || gm) return err("E_STATE"); return this.onVotekick(s, msg.id, err);
      case "endroom": if (!host) return err("E_HOST"); return this.closeRoom("host");
      case "act": if (!inGame || gm) return err("E_STATE"); this.g.active[s.id] = 1; return this.onAct(s, msg.a, err, now);
      case "lobbychat": if (inGame || gm) return err("E_STATE"); return this.onLobbyChat(s, msg, err, now);
      case "advance": return this.onAdvance(s, err);
      case "deal": if (!gm || !inGame || this.g.dealt) return err("E_STATE"); return this.deal();
      case "rig": if (!gm || !inGame) return err("E_STATE"); return this.onRig(s, msg, err);
      case "move": case "emote": if (!inGame || gm || !this.g.dealt) return; this.g.active[s.id] = 1; return this.relayPresence(s, msg, now);
      case "block": case "unblock": return this.onBlock(s, msg.id, msg.t === "block", err);
      case "report": return this.onReport(s, msg, err);
      case "replay": return this.onReplay(s, err);
      default: return err("E_PROTO");
    }
  }

  leave(s, ws) {
    const m = this.m;
    if (this.isGm(s.gid)) { this.gmGone("left"); }
    else if (this.g) {
      if (this.g.st.alive[s.id] && this.g.st.phase !== "ended") this.removeFromGame(s, "left");
      s.left = true;
      if (this.isHost(s.gid)) this.handover();
      this.afterGameChange();
    } else {
      m.seats = m.seats.filter((x) => x.gid !== s.gid);
      delete m.votekicks[s.gid];
      if (this.isHost(s.gid)) this.handover();
      this.log("leave", { gid: s.gid, id: s.id });
      this.checkAutostart(Date.now());
      this.broadcastLobby();
    }
    send(ws, { t: "closed", reason: "left" });
    for (const w of this.socks().get(s.gid) || [ws]) this.drop(w, 4012, "left");
    if (this.socks().size === 0) this.timer("idle", Date.now() + this.ms(this.g ? IDLE_GAME : IDLE_LOBBY));
    this.regDirty(); this.dirtyMeta = true; this.save();
  }

  handover() {
    const m = this.m;
    if (m.gm) { m.host = m.gm.gid; return; }
    const cands = m.seats.filter((x) => !x.left);
    const next = cands.find((x) => this.online(x.gid) && x.gid !== m.host) || cands.find((x) => x.gid !== m.host) || null;
    const old = m.host;
    m.host = next ? next.gid : null;
    if (old !== m.host) { this.log("host", { gid: m.host }); this.toAll({ t: "notice", code: "host", id: this.hostId() }); }
  }

  // The human Grandmaster left or stayed away: the town clock (bot narrator) takes over.
  gmGone(why) {
    const m = this.m, gm = m.gm;
    if (!gm) return;
    for (const w of this.socks().get(gm.gid) || []) { send(w, { t: "closed", reason: why }); this.drop(w, 4012, why); }
    m.gm = null; m.narrator = "bot"; m.host = null;
    this.clearTimer("gm");
    this.handover();
    this.log("narrator", { narrator: "bot", why });
    this.toAll({ t: "notice", code: "narrator", narrator: "bot" });
    if (this.g) {
      if (!this.g.dealt) this.deal();
      else { this.scheduleDeadline(Date.now(), true); this.pushAll(); }
    } else this.broadcastLobby();
    this.regDirty(); this.dirtyMeta = true; this.dirtyGame = true; this.save();
  }

  // ---------- lobby ----------
  broadcastLobby() {
    const m = this.m, st = m.settings, now = Date.now();
    const counts = Object.fromEntries(Object.entries(m.votekicks).map(([g, v]) => [this.member(g)?.id, v.length]).filter(([id]) => id));
    const msg = {
      t: "lobby", code: m.code, cls: m.cls === "kids" ? "kids" : "13+", narrator: m.narrator, gm: !!m.gm, host: this.hostId(), quick: m.quick,
      players: this.activeSeats().map((s) => ({ id: s.id, look: s.look, online: this.online(s.gid), host: s.gid === m.host, card: s.gid })),
      settings: { mode: st.mode, communityChat: st.communityChat, victimSeesKiller: st.victimSeesKiller, visibility: st.visibility, hasPass: !!st.passHash, secretWhispers: st.secretWhispers, rigged: st.rigged },
      votekicks: counts, kickNeed: Math.floor(Math.max(0, this.members().length - 1) / 2) + 1,
      countdown: m.timers.autostart?.at || 0, min: MIN_PLAYERS, max: MAX_SEATS, lastGame: !!m.lastGame, serverNow: now,
    };
    this.toAll(msg);
  }

  async onSettings(s, msg, err) {
    const m = this.m, cur = m.settings, next = { ...cur };
    const v = msg.settings && typeof msg.settings === "object" ? msg.settings : msg;
    if ("mode" in v) {
      if (!Object.hasOwn(MODE, v.mode)) return err("E_PROTO");
      if (v.mode === "gore" && m.cls === "kids") return err("E_NOT_ALLOWED", "Gore mode is not available in kids rooms.");   // its tales are too gruesome for under 13s
      next.mode = v.mode;
    }
    for (const k of ["communityChat", "victimSeesKiller", "rigged", "secretWhispers"]) if (k in v) { if (typeof v[k] !== "boolean") return err("E_PROTO"); next[k] = v[k]; }
    if ("visibility" in v) { if (v.visibility !== "public" && v.visibility !== "private") return err("E_PROTO"); next.visibility = v.visibility; }
    if ("pass" in v && v.pass !== null) {
      if (typeof v.pass !== "string" || [...v.pass].length < 3 || [...v.pass].length > 32) return err("E_PASS_NEEDED");
      next.passSalt = randomHex(16);
      next.passHash = await sha256(next.passSalt + ":" + v.pass);
    }
    if (v.pass === null) { next.passSalt = ""; next.passHash = ""; }
    if (next.visibility === "private" && !next.passHash) return err("E_PASS_NEEDED");
    // Secret whispers only in private rooms with no child band players; public rooms always announce.
    const secretOk = next.visibility === "private" && m.cls !== "kids";
    if (v.secretWhispers === true && !secretOk) return err("E_NOT_ALLOWED");
    if (!secretOk) next.secretWhispers = false;
    if (m.narrator !== "human") next.rigged = false;
    if (this.g || this.m.closed) return err("E_STATE");   // re-checked after the await
    const typingChanged = next.visibility !== cur.visibility, chatChanged = next.communityChat !== cur.communityChat;
    m.settings = next;
    this.log("settings", { mode: next.mode, visibility: next.visibility, secretWhispers: next.secretWhispers });
    this.broadcastLobby();
    if (typingChanged || chatChanged) for (const v of this.members()) if (this.online(v.gid)) { if (typingChanged) this.toGid(v.gid, { t: "you", you: this.you(v) }); this.sendLobbyChat(v); }
    this.regDirty(); this.dirtyMeta = true; this.save();
  }

  onKick(s, id, err) {
    const t = typeof id === "string" ? this.seatById(id) : null;
    if (!t || t.gid === s.gid || (this.g && t.left)) return err("E_TARGET");
    if (this.g) {
      if (this.online(t.gid)) return err("E_ONLINE");
      if (this.g.st.alive[t.id] && this.g.st.phase !== "ended") this.removeFromGame(t, "kicked");
      t.left = true;
      this.afterGameChange();
    } else {
      this.kickFromLobby(t, "host");
    }
    this.regDirty(); this.dirtyMeta = true; this.save();
  }
  kickFromLobby(t, why) {
    const m = this.m;
    m.seats = m.seats.filter((x) => x.gid !== t.gid);
    m.banned.push(t.gid);
    delete m.votekicks[t.gid];
    for (const v of Object.values(m.votekicks)) { const i = v.indexOf(t.gid); if (i >= 0) v.splice(i, 1); }
    for (const w of this.socks().get(t.gid) || []) { send(w, { t: "kicked", reason: why }); this.drop(w, 4005, "kicked"); }
    if (this.isHost(t.gid)) this.handover();
    this.log("kick", { gid: t.gid, id: t.id, why });
    this.checkAutostart(Date.now());
    this.broadcastLobby();
  }

  onVotekick(s, id, err) {
    const m = this.m, t = typeof id === "string" ? this.seatById(id) : null;
    if (!t || t.gid === s.gid) return err("E_TARGET");
    const votes = (m.votekicks[t.gid] ||= []);
    if (!votes.includes(s.gid)) votes.push(s.gid);
    const need = Math.floor((this.members().length - 1) / 2) + 1;
    this.log("votekick", { by: s.gid, target: t.gid, votes: votes.length, need });
    if (votes.length >= need) {
      const voters = votes.map((g) => this.member(g)?.id).filter(Boolean);
      this.autoReport(t, "votekick", `voted out of the lobby by ${voters.join(", ")}`);
      this.kickFromLobby(t, "vote");
      this.regDirty(); this.dirtyMeta = true; this.save();
    } else { this.broadcastLobby(); this.markMeta(); }
  }

  checkAutostart(now) {
    const m = this.m;
    if (!m.quick || this.g) return;
    const n = this.activeSeats().length;
    if (n >= AUTOSTART_AT && !m.timers.autostart) this.timer("autostart", now + this.ms(AUTOSTART));
    if (n < AUTOSTART_AT && m.timers.autostart) this.clearTimer("autostart");
  }

  // ---------- the game ----------
  startGame(err = () => {}) {
    const m = this.m, now = Date.now();
    // Players who dropped out of the lobby and have not come back do not get dealt in.
    const ready = m.seats.filter((s) => this.online(s.gid));
    if (ready.length < MIN_PLAYERS) return err("E_PLAYERS");
    if (m.narrator === "human" && !m.gm) m.narrator = "bot";   // the Grandmaster never arrived
    m.seats = ready.slice(0, MAX_SEATS);
    for (const s of m.seats) Object.assign(s, { missed: 0, offline: 0, left: false, offSince: 0 });
    const players = m.seats.map((s) => s.id);
    if (m.cls === "kids" && m.settings.mode === "gore") m.settings.mode = "classic";   // never Gore for under 13s, whatever was stored
    const st = createGame({
      mode: m.settings.mode, players, narrator: m.narrator, rigged: m.narrator === "human" && m.settings.rigged,
      communityChat: m.settings.communityChat, seed: crypto.getRandomValues(new Uint32Array(1))[0] % 2147483647,
      victimSeesKiller: m.settings.victimSeesKiller, traits: Object.fromEntries(m.seats.map((s) => [s.id, traitsOf(s.look)])),
    });
    const lc = m.lobbyChat;
    this.g = { st, startedAt: now, dealt: false, deadline: 0, kinds: { chat: [], ghost: [], dm: [] }, safe: { chat: {}, ghost: {}, dm: {} }, shadow: {}, strikes: { ...(lc?.strikes || {}) }, muted: [...(lc?.muted || [])], signals: {}, pairs: {}, active: {}, log: [] };
    m.lobbyChat = null;
    m.votekicks = {}; m.reportsBy = {};
    for (const k of ["autostart", "drop", "idle"]) this.clearTimer(k);
    m.pendingGames = (m.pendingGames || 0) + 1;
    this.log("start", { mode: m.settings.mode, narrator: m.narrator, players: m.seats.map((s) => ({ gid: s.gid, id: s.id, band: s.band })) });
    if (m.narrator === "human" && m.gm) {
      this.toAll({ t: "shuffle" }, (g) => !this.isGm(g));
      this.pushAll();
    } else this.deal(false);
    this.regDirty(); this.dirtyMeta = true; this.dirtyGame = true; this.save();
  }

  deal(save = true) {
    this.g.dealt = true;
    this.g.active = {};
    this.scheduleDeadline(Date.now(), true);
    this.pushAll();
    if (save) { this.dirtyGame = true; this.save(); }
  }

  // Bot narrator deadlines: each phase gets its mode length, and ends GRACE after everyone acted if that is sooner.
  // A human Grandmaster keeps their own time (deadline 0).
  scheduleDeadline(now, fresh) {
    const g = this.g, st = g.st;
    if (st.phase === "ended" || this.m.narrator === "human" || !g.dealt) { g.deadline = 0; this.clearTimer("phase"); return; }
    if (fresh) g.deadline = now + this.ms(phaseDuration(st.phase, MODE[st.setup.mode]) * 1000);
    const done = st.phase === "night" ? nightPending(st).length === 0 : allVoted(st);
    if (done) g.deadline = Math.min(g.deadline, now + this.ms(GRACE));
    this.timer("phase", g.deadline, { key: st.phase + st.day });
  }
  // After a vote or night move: maybe start the grace period, and tell everyone the new deadline.
  checkEarly(now) {
    const before = this.g.deadline;
    this.scheduleDeadline(now, false);
    if (this.g.deadline !== before) this.toAll({ t: "deadline", deadline: this.g.deadline, serverNow: now });
  }

  // Away bookkeeping for the phase that is ending (night and day only).
  accountPhase(phase) {
    if (phase !== "night" && phase !== "day") return;
    const st = this.g.st;
    for (const s of this.m.seats) {
      if (!st.alive[s.id]) continue;
      s.offline = this.online(s.gid) ? 0 : (s.offline || 0) + 1;
      const required = phase === "day" || NIGHT_ROLES.includes(st.roles[s.id]);
      if (required) s.missed = this.g.active[s.id] ? 0 : (s.missed || 0) + 1;
    }
    this.g.active = {};
  }
  removeAway() {
    const st = this.g.st;
    for (const s of this.m.seats) {
      if (st.phase === "ended") return;
      if (st.alive[s.id] && ((s.missed || 0) >= 2 || (s.offline || 0) >= 2)) { this.removeFromGame(s, s.offline >= 2 ? "offline" : "away"); s.left = true; }
    }
  }
  removeFromGame(s, why) {
    const r = applyAction(this.g.st, { type: "remove", by: "gm", player: s.id }).result;
    if (!r.ok) return false;
    this.log("removed", { gid: s.gid, id: s.id, why });
    this.toAll({ t: "notice", code: "left", id: s.id, why });
    if (this.isHost(s.gid)) this.handover();
    this.dirtyGame = true;
    return true;
  }

  advancePhase() {
    const g = this.g, st = g.st, prev = st.phase + st.day;
    this.accountPhase(st.phase);
    const r = applyAction(st, { type: "advance", by: "gm" }).result;
    if (!r.ok) return r;
    this.log("phase", { from: prev, to: st.phase + st.day });
    if (st.phase !== "ended") this.removeAway();
    this.afterGameChange(prev);
    return r;
  }

  // Something structural changed (phase, removal): new deadlines, full snapshots, maybe the end.
  afterGameChange(prevKey = null) {
    const g = this.g, st = g.st, now = Date.now(), key = st.phase + st.day;
    this.scheduleDeadline(now, prevKey !== null ? key !== prevKey : (this.m.timers.phase?.key !== key));
    this.pushAll();
    if (st.phase === "ended" && !g.endedAt) this.endGame(now);
    this.dirtyGame = true; this.dirtyMeta = true; this.save();
  }

  onAdvance(s, err) {
    const g = this.g;
    if (!g || !g.dealt) return err("E_STATE");
    const phase = g.st.phase;
    if (this.isGm(s.gid)) { /* the Grandmaster moves the story at any time */ }
    else if (!this.isHost(s.gid)) return err("E_HOST");
    else if (this.m.narrator === "human" || !(phase === "day" || phase === "trial")) return err("E_STATE");
    const r = this.advancePhase();
    if (!r.ok) err(r.error.code);
  }

  onRig(s, msg, err) {
    if (!this.g.st.setup.rigged) return err("E_NOT_RIGGED");
    const a = { type: "rig", by: "gm", op: msg.op };
    for (const k of ["target", "player", "role", "result"]) if (k in msg) a[k] = msg[k];
    const r = applyAction(this.g.st, a).result;
    if (!r.ok) return err(r.error.code);
    this.log("rig", { op: msg.op, target: msg.target ?? msg.player ?? null });
    this.toGid(s.gid, { t: "rigged", op: msg.op });
    this.sendState(s);   // players receive nothing, so nothing hints at it
    this.markGame();
  }

  onAct(s, a, err, now) {
    const g = this.g, st = g.st;
    if (!g.dealt) return err("E_STATE");
    if (!a || typeof a !== "object") return err("E_PROTO");
    const kind = a.kind;
    if (kind === "night") {
      const fx = s.look?.killfx && s.look.killfx !== "usual" ? s.look.killfx : null;   // the server picks fx from the validated look
      const r = applyAction(st, { type: "night", actor: s.id, target: a.target, fx }).result;
      if (!r.ok) return err(r.error.code);
      this.log("night", { by: s.id, target: a.target });
      this.toGid(s.gid, { t: "picked", kind: "night", target: a.target });
      if (MAFIA_TEAM.includes(st.roles[s.id])) for (const x of this.m.seats) if (st.alive[x.id] && MAFIA_TEAM.includes(st.roles[x.id])) this.toGid(x.gid, { t: "picks", teamPicks: playerView(st, x.id).teamPicks });
      this.sendGm();
      this.checkEarly(now);
      return this.markGame();
    }
    if (kind === "vote") {
      const target = a.target ?? null;
      const r = applyAction(st, { type: "vote", actor: s.id, target }).result;
      if (!r.ok) return err(r.error.code);
      this.log("vote", { by: s.id, target });
      this.toGid(s.gid, { t: "picked", kind: "vote", target });
      this.toAll({ t: "tally", ...this.tally() });
      this.sendGm();
      this.checkEarly(now);
      return this.markGame();
    }
    if (kind === "chat" || kind === "dm" || kind === "ghostchat") return this.onChat(s, kind, a, err, now);
    return err("E_PROTO");
  }

  tally() { const st = this.g.st; return st.phase === "day" ? { cast: Object.keys(st.votes).length, alive: st.setup.players.filter((p) => st.alive[p]).length } : { cast: 0, alive: 0 }; }

  // ---------- chat safety ----------
  async onChat(s, kind, a, err, now) {
    const g = this.g, st = g.st, ch = kind === "chat" ? "chat" : kind === "dm" ? "dm" : "ghost";
    let to = null;
    if (kind === "dm") {
      to = typeof a.to === "string" ? this.seatById(a.to) : null;
      if (!to || to.gid === s.gid) return err("E_TARGET");
      if (s.band === "child" || to.band === "child" || this.m.cls === "kids") return err("E_WHISPER_OFF");
      // The recipient's own setting: everyone, friends only, or nobody. A refusal tells only the sender, and makes
      // no public "whispered" line.
      const pref = whisperPref(to.whisper);
      if (pref === "nobody" || (pref === "friends" && !(await this.friendsOf(to)).has(s.gid))) {
        if (this.g === g) err("E_WHISPER_PREF", `${to.id} is not taking whispers right now.`);
        return;
      }
      if (this.g !== g) return;   // a new game started while the friends list loaded
    }
    let text, phrase = null;
    if (a.phrase != null) {
      const p = checkPhrase(a.phrase, { players: st.setup.players });
      if (!p.ok) return err("E_PHRASE");
      text = p.text; phrase = p.id;
    } else if (typeof a.text === "string") {
      if (this.tier(s) !== "text") return err(this.muted(s) && this.seesTyped(s) ? "E_MUTED" : "E_PHRASE_ONLY");
      if (to && !this.seesTyped(to)) return err("E_PHRASE_ONLY");
      text = a.text.trim();
      if (!text || [...text].length > 200) return err("E_TEXT");
    } else return err("E_PROTO");
    const lim = this.limiter.check(s.gid, now, dupKey(text));
    if (lim.slowedNow) { s.slowUntil = lim.until; this.toGid(s.gid, { t: "slowed", until: lim.until, serverNow: now }); this.log("slowed", { gid: s.gid, until: lim.until }); this.markMeta(); }
    if (!lim.ok) return err(lim.code);
    const action = kind === "chat" ? { type: "chat", from: s.id, text } : kind === "ghostchat" ? { type: "ghostchat", from: s.id, text }
      : { type: "dm", from: s.id, to: to.id, text, announce: !(this.m.settings.secretWhispers && this.m.settings.visibility === "private" && this.m.cls !== "kids") };
    let blocked = null, safe;
    if (!phrase) {
      const cats = signalsOf(text);
      if (cats.length) this.flagSignals(s, cats, text, ch, to);
      const level = this.sendLevel(s), f = checkText(text, { names: st.setup.players, level });
      if (!f.ok) blocked = f.reason;
      else if (level === "minimal") safe = safeVersion(text, { names: st.setup.players });   // what standard readers get
    }
    if (!blocked && to && (to.blocks || []).includes(s.gid)) blocked = "blocked";
    if (blocked) {
      // Echo only to the sender, as if sent, but only if the message would have been legal at all.
      const probe = applyAction(importState(exportState(st)), action).result;
      if (!probe.ok) return err(probe.error.code);
      const line = kind === "dm" ? { from: s.id, to: to.id, text } : { from: s.id, text };
      const index = ch === "chat" ? st.chat.length : ch === "dm" ? st.dms.length : st.ghostChat.length;
      (g.shadow[s.gid] ||= []).push({ ch, i: index, line });
      this.log(ch, { from: s.id, to: to?.id, text, phrase, blocked });
      this.toGid(s.gid, kind === "dm" ? { t: "dm", line } : { t: "chat", ch: ch === "chat" ? "square" : "ghost", line });
      if (blocked !== "blocked") await this.strike(s, blocked);
      return this.markGame();
    }
    const r = applyAction(st, action).result;
    if (!r.ok) return err(r.error.code);
    const k = phrase ? "p" : "t";
    g.kinds[ch].push(k);
    const list = ch === "chat" ? st.chat : ch === "dm" ? st.dms : st.ghostChat, i = list.length - 1;
    if (safe !== undefined && safe !== text) this.safeOf(ch)[i] = safe;
    this.log(ch, { from: s.id, to: to?.id, text, phrase, ...(safe !== undefined && safe !== text && { safe }) });
    const each = (t, extra) => (v) => { const line = this.lineFor(ch, i, list[i], v); return line && { t, ...extra, line }; };
    if (kind === "chat") {
      this.toMembers((v) => this.lineVisible("chat", i, v, s.id), each("chat", { ch: "square" }));
    } else if (kind === "ghostchat") {
      this.toMembers((v) => (this.isGm(v.gid) || !st.alive[v.id]) && this.lineVisible("ghost", i, v, s.id), each("chat", { ch: "ghost" }));
    } else {
      this.toMembers((v) => v.gid === s.gid || v.gid === to.gid || (this.isGm(v.gid) && (k === "p" || this.seesTyped(v))), each("dm", {}));
      if (action.announce) {
        g.kinds.chat.push("w");
        this.toMembers(() => true, { t: "chat", ch: "square", line: st.chat.at(-1) });
      }
      // Grooming signal: an adult whispering again and again to a teen.
      if (s.band === "adult" && to.band === "teen") {
        const key = s.gid + ">" + to.gid;
        g.pairs[key] = (g.pairs[key] || 0) + 1;
        if (g.pairs[key] === PAIR_FLAG) this.autoReport(s, "auto:adult_whispers_teen", `${PAIR_FLAG} whispers from ${s.id} (adult) to ${to.id} (teen)`);
      }
    }
    this.markGame();
  }
  // ---------- the Town Square in the lobby ----------
  // Before a game the square is open to every seated player (not the Grandmaster, who has no name yet) while the
  // host has Town Square chat on. Same tiers, filter, limits, strikes, signals and reports as the square in a game.
  // Its last LOBBY_LINES lines live in the room meta; each line keeps its author's gid, its kind (p phrase, t typed),
  // its safe version for standard readers, and "only" when it was filtered and is echoed to its author alone.
  chatBag() { return this.g || (this.m.lobbyChat ||= freshLobbyChat()); }
  async onLobbyChat(s, a, err, now) {
    if (!this.m.settings.communityChat) return err("E_CHAT_DISABLED");
    const names = this.activeSeats().map((x) => x.id);
    let text, phrase = null;
    if (a.phrase != null) {
      const p = checkPhrase(a.phrase, { players: names });
      if (!p.ok) return err("E_PHRASE");
      text = p.text; phrase = p.id;
    } else if (typeof a.text === "string") {
      if (this.tier(s) !== "text") return err(this.muted(s) && this.seesTyped(s) ? "E_MUTED" : "E_PHRASE_ONLY");
      text = a.text.trim();
      if (!text || [...text].length > 200) return err("E_TEXT");
    } else return err("E_PROTO");
    const lim = this.limiter.check(s.gid, now, dupKey(text));
    if (lim.slowedNow) { s.slowUntil = lim.until; this.toGid(s.gid, { t: "slowed", until: lim.until, serverNow: now }); this.log("slowed", { gid: s.gid, until: lim.until }); this.markMeta(); }
    if (!lim.ok) return err(lim.code);
    const lc = this.chatBag(), line = { n: ++lc.n, gid: s.gid, from: s.id, text, kind: phrase ? "p" : "t" };
    let blocked = null;
    if (!phrase) {
      const cats = signalsOf(text);
      if (cats.length) this.flagSignals(s, cats, text, "lobby", null);
      const level = this.sendLevel(s), f = checkText(text, { names, level });
      if (!f.ok) blocked = f.reason;
      else if (level === "minimal") { const safe = safeVersion(text, { names }); if (safe !== text) line.safe = safe; }
    }
    if (blocked) line.only = s.gid;
    lc.lines.push(line);
    if (lc.lines.length > LOBBY_LINES) lc.lines.splice(0, lc.lines.length - LOBBY_LINES);
    this.log("lobbychat", { from: s.id, text, phrase, ...(blocked && { blocked }), ...(line.safe !== undefined && { safe: line.safe }) });
    this.toMembers(() => true, (v) => { const l = this.lobbyLineFor(line, v); return l && { t: "chat", ch: "lobby", line: l }; });
    this.markMeta();
    if (blocked) await this.strike(s, blocked);
  }
  // A lobby line as one member may read it (the rules of lineFor and lineVisible), or null.
  lobbyLineFor(line, v) {
    const own = v.gid === line.gid;
    if (line.only && !own) return null;
    if (line.kind === "t" && !own && !this.seesTyped(v)) return null;
    if (line.safe !== undefined && !own && this.safeReader(v)) return line.safe === null ? null : { from: line.from, text: line.safe };
    return { from: line.from, text: line.text };
  }
  sendLobbyChat(s) {
    if (this.g) return;
    this.toGid(s.gid, { t: "lobbychat", on: this.m.settings.communityChat, lines: (this.m.lobbyChat?.lines || []).map((l) => this.lobbyLineFor(l, s)).filter(Boolean) });
  }

  async friendsOf(s) {
    let set = this.friendSets.get(s.gid);
    if (!set) { set = new Set(await db.getFriends(this.env, this.usage, s.gid)); if (whisperPref(s.whisper) === "friends") this.friendSets.set(s.gid, set); }
    return set;
  }
  // obj may be a function of the member; a falsy result sends nothing to that member.
  toMembers(pred, obj) {
    for (const v of this.members()) {
      if (!pred(v)) continue;
      const out = typeof obj === "function" ? obj(v) : obj;
      if (out) this.toGid(v.gid, out);
    }
  }
  safeOf(ch) { return (this.g.safe ||= { chat: {}, ghost: {}, dm: {} })[ch]; }
  // A line as one member may read it: the author always gets their own words; a standard level reader gets the
  // safe version of a line that only passed the minimal level, or nothing if there is no safe version.
  lineFor(ch, i, line, viewer) {
    const safe = this.safeOf(ch)[i];
    if (safe === undefined || (viewer.id && viewer.id === line.from) || !this.safeReader(viewer)) return { ...line };
    return safe === null ? null : { ...line, text: safe };
  }
  lineVisible(ch, i, viewer, authorId) {
    const k = this.g.kinds[ch][i];
    return k !== "t" || (!!viewer.id && viewer.id === authorId) || this.seesTyped(viewer);
  }

  async strike(s, reason) {
    const g = this.chatBag(), now = Date.now();
    g.strikes[s.gid] = (g.strikes[s.gid] || 0) + 1;
    this.log("strike", { gid: s.gid, reason, count: g.strikes[s.gid] });
    if (g.strikes[s.gid] < STRIKES_TO_MUTE || g.muted.includes(s.gid)) return;
    g.muted.push(s.gid);
    this.log("sanction", { gid: s.gid, type: "mute", scope: "match" });
    this.toGid(s.gid, { t: "sanction", type: "mute", reason: "filter", scope: "match", until: null, appeal: APPEAL });
    this.toGid(s.gid, { t: "you", you: this.you(s) });
    let offences = 0;
    try { offences = await db.addOffence(this.env, this.usage, s.gid, now); } catch (e) { console.log("offence failed", String(e)); }
    if (offences < db.BAN_AFTER) return;
    const until = now + db.BAN_MS;
    try { await db.addSanction(this.env, this.usage, { type: "ban", gid: s.gid, device: s.dev, reason: "repeated_offences", until, by: "auto" }); }
    catch (e) { console.log("ban failed", String(e)); }
    this.applyBan(s, "repeated_offences", until);
  }

  // Ban: tell the player, take them out of the room, close their socket.
  applyBan(s, reason, until) {
    this.log("sanction", { gid: s.gid, type: "ban", until });
    for (const w of this.socks().get(s.gid) || []) { send(w, { t: "sanction", type: "ban", reason, until, appeal: APPEAL }); this.drop(w, 4003, "banned"); }
    if (this.isGm(s.gid)) return this.gmGone("banned");
    if (this.g) {
      if (this.g.st.alive[s.id] && this.g.st.phase !== "ended") this.removeFromGame(s, "banned");
      s.left = true;
      this.afterGameChange();
    } else {
      this.m.seats = this.m.seats.filter((x) => x.gid !== s.gid);
      if (this.isHost(s.gid)) this.handover();
      this.broadcastLobby();
    }
    this.m.banned.push(s.gid);
    this.regDirty(); this.dirtyMeta = true; this.save();
  }

  // Grooming signals: silently filed as automatic reports, once per category per player per match.
  flagSignals(s, cats, text, ch, to) {
    const g = this.chatBag(), done = (g.signals[s.gid] ||= []);
    for (const cat of cats) {
      if (done.includes(cat)) continue;
      done.push(cat);
      this.log("signal", { gid: s.gid, cat, ch, to: to?.id });
      this.autoReport(s, "auto:" + cat, `${ch}${to ? " to " + to.id : ""}: ${text}`);
    }
  }
  autoReport(target, reason, note) {
    const snapshot = this.snapshot();
    this.ctx.waitUntil(db.fileReport(this.env, this.usage, { reporter: "system", target: target.gid, targetName: target.id || "(gm)", room: this.m.code, reason, note, auto: true, snapshot })
      .catch((e) => console.log("auto report failed", String(e))));
  }

  // Everything a moderator needs, server side only: never sent to players.
  snapshot() {
    const m = this.m, g = this.g, st = g?.st;
    return {
      room: m.code, cls: m.cls, at: new Date().toISOString(), narrator: m.narrator,
      settings: { mode: m.settings.mode, visibility: m.settings.visibility, communityChat: m.settings.communityChat, secretWhispers: m.settings.secretWhispers },
      players: m.seats.map((s) => ({ gid: s.gid, id: s.id, band: s.band, left: !!s.left })), gm: m.gm ? { gid: m.gm.gid, band: m.gm.band } : null,
      game: st ? { phase: st.phase, day: st.day, winner: st.winner, roles: { ...st.roles }, alive: { ...st.alive }, chat: st.chat, dms: st.dms, ghostChat: st.ghostChat,
        log: st.log, history: st.history, votes: { ...st.votes }, nightActs: Object.fromEntries(Object.entries(st.night.acts).map(([p, x]) => [p, x.target])) } : null,
      events: g ? g.log : (m.lobbyLog || []),
      lastGame: m.lastGame ? { winner: m.lastGame.winner, roles: m.lastGame.roles, history: m.lastGame.history, log: m.lastGame.log, events: m.lastLog || [] } : null,
    };
  }

  async onReport(s, msg, err) {
    const t = typeof msg.target === "string" ? (this.seatById(msg.target) || (msg.target === "gm" && this.m.gm) || null) : null;
    if (!t || t.gid === s.gid) return err("E_TARGET");
    const mine = (this.m.reportsBy[s.gid] ||= []);
    if (mine.includes(t.gid) || mine.length >= 3) return err("E_REPORT");
    mine.push(t.gid);
    const reason = REASONS.includes(msg.reason) ? msg.reason : "other";
    const note = typeof msg.note === "string" ? msg.note.slice(0, 300) : "";
    this.log("report", { by: s.gid, target: t.gid, reason });
    this.markMeta();
    try {
      const id = await db.fileReport(this.env, this.usage, { reporter: s.gid, target: t.gid, targetName: t.id || "(gm)", room: this.m.code, reason, note, auto: false, snapshot: this.snapshot() });
      this.toGid(s.gid, { t: "reported", target: msg.target, id });
    } catch (e) { console.log("report failed", String(e)); err("E_UNKNOWN"); }
  }

  async onBlock(s, id, on, err) {
    const t = typeof id === "string" ? (this.seatById(id) || (id === "gm" && this.m.gm) || null) : null;
    if (!t || t.gid === s.gid) return err("E_TARGET");
    s.blocks = (s.blocks || []).filter((g) => g !== t.gid);
    if (on) s.blocks.push(t.gid);
    this.markMeta();
    try { await db.setBlock(this.env, this.usage, s.gid, t.gid, on); } catch (e) { console.log("block failed", String(e)); }
    this.toGid(s.gid, { t: "blocked", id, on });
    if (this.g) this.sendState(s);
  }

  onReplay(s, err) {
    const lg = this.m.lastGame;
    if (!lg || lg.replayed.includes(s.gid)) return err("E_REPLAY");
    lg.replayed.push(s.gid);
    this.markMeta();
    this.toGid(s.gid, { t: "replay", mode: lg.mode, winner: lg.winner, roles: lg.roles, history: lg.history, log: lg.log, cast: lg.cast });
  }

  // Walking and emotes are not game rules, so they skip the engine (port of relayPresence).
  // Ghosts are seen only by the dead and the Grandmaster. A blocked player's emote never targets the blocker.
  relayPresence(s, msg, now) {
    const st = this.g.st;
    if (st.phase === "ended" || !this.gap.ok(msg.t + ":" + s.gid, now, msg.t === "move" ? 250 : 900)) return;
    const ghost = !st.alive[s.id];
    let out;
    if (msg.t === "move") {
      const x = Number(msg.x), z = Number(msg.z);
      if (!Number.isFinite(x) || !Number.isFinite(z) || Math.abs(x) > 50 || Math.abs(z) > 50) return;
      out = { t: "move", id: s.id, x: Math.round(x * 100) / 100, z: Math.round(z * 100) / 100 };
    } else {
      if (!EMOTES.some((e) => e.id === msg.kind && !e.locked)) return;
      out = { t: "emote", id: s.id, kind: msg.kind, target: typeof msg.target === "string" && st.setup.players.includes(msg.target) ? msg.target : null };
    }
    for (const v of this.members()) {
      if (v.gid === s.gid) continue;
      if (ghost && !this.isGm(v.gid) && st.alive[v.id]) continue;
      if (out.target && out.target === v.id && (v.blocks || []).includes(s.gid)) continue;
      this.toGid(v.gid, out);
    }
  }

  // ---------- views ----------
  // A player's snapshot: the engine view, with typed lines they may not read removed, their own filtered
  // messages put back where they sent them, and whispers from players they blocked hidden.
  viewFor(s) {
    const st = this.g.st, v = playerView(st, s.id), shadows = this.g.shadow[s.gid] || [];
    // Walks the whole engine list; a filtered message sits just before the line that came after it.
    const merge = (ch, list, keep) => {
      const out = [], mine = shadows.filter((sh) => sh.ch === ch);
      list.forEach((line, i) => {
        for (const sh of mine) if (sh.i === i) out.push({ ...sh.line });
        const shown = keep(line, i) && this.lineFor(ch, i, line, s);
        if (shown) out.push(shown);
      });
      for (const sh of mine) if (sh.i >= list.length) out.push({ ...sh.line });
      return out.slice(-VIEW_LINES);
    };
    const blocked = new Set((s.blocks || []).map((g) => this.member(g)?.id).filter(Boolean));
    v.chat = merge("chat", st.chat, (l, i) => this.lineVisible("chat", i, s, l.from));
    v.dms = merge("dm", st.dms, (l) => (l.from === s.id || l.to === s.id) && !blocked.has(l.from));
    if (v.ghostChat) v.ghostChat = merge("ghost", st.ghostChat, (l, i) => this.lineVisible("ghost", i, s, l.from));
    return v;
  }
  gmFor(s) {
    const st = this.g.st, v = gmView(st);
    const lines = (ch, list) => list.map((l, i) => (this.g.kinds[ch][i] !== "t" || this.seesTyped(s) ? this.lineFor(ch, i, l, s) : null)).filter(Boolean).slice(-VIEW_LINES);
    v.chat = lines("chat", v.chat);
    v.dms = lines("dm", v.dms);
    v.ghostChat = lines("ghost", v.ghostChat);
    return v;
  }
  common(now) {
    const g = this.g;
    return { mode: g.st.setup.mode, narrator: this.m.narrator, dealt: g.dealt, deadline: g.deadline, serverNow: now, seats: this.seatsPublic(), host: this.hostId(), tally: this.tally() };
  }
  sendState(s) {
    const g = this.g, now = Date.now();
    if (!g) return;
    if (this.isGm(s.gid)) {
      const st = g.st;
      return this.toGid(s.gid, { t: "gmview", gm: this.gmFor(s), pending: g.dealt && st.phase === "night" ? nightPending(st) : [], rigged: st.setup.rigged, you: this.you(s), ...this.common(now) });
    }
    if (!g.dealt) return this.toGid(s.gid, { t: "shuffle" });
    this.toGid(s.gid, { t: "view", view: this.viewFor(s), you: this.you(s), ...this.common(now) });
    if (g.st.phase === "ended") this.toGid(s.gid, { t: "final", roles: { ...g.st.roles }, winner: g.st.winner });
  }
  sendGm() { if (this.m.gm && this.online(this.m.gm.gid)) this.sendState(this.m.gm); }
  pushAll() { for (const s of this.members()) if (this.online(s.gid)) this.sendState(s); }

  // ---------- the end, the credits, and back to the lobby ----------
  endGame(now) {
    const g = this.g, st = g.st, m = this.m;
    g.endedAt = now;
    this.clearTimer("phase");
    const roles = { ...st.roles };
    const cast = m.seats.map((s) => ({ id: s.id, role: roles[s.id], won: !s.left && won(roles[s.id], st.winner), alive: !!st.alive[s.id], left: !!s.left, look: s.look }));
    const ms = this.ms(CREDITS);
    this.toAll({ t: "credits", winner: st.winner, cast, ms, until: now + ms, serverNow: now });
    m.lastGame = { endedAt: now, mode: st.setup.mode, winner: st.winner, roles, history: st.history, log: st.log, cast, replayed: [] };
    m.lastLog = g.log;
    this.log("end", { winner: st.winner });
    this.timer("credits", now + ms + this.ms(500));
    const entries = cast.filter((c) => !c.left).map((c) => ({ gid: m.seats.find((s) => s.id === c.id).gid, role: c.role, won: c.won }));
    this.ctx.waitUntil(db.recordStats(this.env, this.usage, entries).catch((e) => console.log("stats failed", String(e))));
  }

  returnToLobby() {
    const m = this.m;
    if (this.g) m.lastLog = this.g.log;
    m.lobbyChat = freshLobbyChat(this.g);
    this.g = null;
    m.seats = m.seats.filter((s) => !s.left && this.online(s.gid));
    for (const s of m.seats) Object.assign(s, { missed: 0, offline: 0, offSince: 0 });
    m.votekicks = {}; m.reportsBy = {}; m.lobbyLog = [];
    if (m.gm && !this.online(m.gm.gid)) { m.gm = null; m.narrator = "bot"; }
    if (!this.member(m.host)) this.handover();
    for (const k of ["phase", "credits", "gm"]) this.clearTimer(k);
    this.log("lobby", { players: m.seats.map((s) => s.id) });
    this.toAll({ t: "notice", code: "lobby" });
    this.broadcastLobby();
    for (const v of this.members()) if (this.online(v.gid)) this.sendLobbyChat(v);
    if (this.socks().size === 0) this.timer("idle", Date.now() + this.ms(IDLE_LOBBY));
    this.checkAutostart(Date.now());
    this.regDirty(); this.dirtyMeta = true; this.dirtyGame = true; this.save();
  }

  async closeRoom(reason) {
    const m = this.m;
    this.toAll({ t: "closed", reason });
    for (const ws of this.ctx.getWebSockets()) this.drop(ws, 4011, "closed");
    m.closed = true; m.closedReason = reason;
    this.g = null;
    m.timers = {};
    this.log("closed", { reason });
    await this.reportToLobby();
    this.timer("purge", Date.now() + PURGE_MS);
    this.dirtyMeta = true; this.dirtyGame = true; this.save();
  }

  // ---------- the alarm: every timer shares it ----------
  async alarm() {
    try { await this.runAlarm(); } finally { this.commitAlarm(); }
  }
  async runAlarm() {
    const now = Date.now();
    this.touch(now);
    this.usage.alarms++;
    this.alarmAt = undefined;
    this.needArm = true;
    if (!this.m) return;
    const t = this.m.timers, due = (k) => t[k] && t[k].at <= now + 25;
    if (due("purge")) {
      await this.ctx.storage.deleteAll();
      this.m = null; this.g = null;
      return;
    }
    if (due("sweep")) {
      this.clearTimer("sweep");
      let pending = false;
      for (const ws of this.ctx.getWebSockets()) {
        const a = this.att(ws);
        if (a.kind === "pending") { if (now - a.at >= HELLO_MS) this.drop(ws, 4013, "no hello"); else pending = true; }
      }
      // Sockets with no ping and no message for LIVE_MS are treated as gone.
      const live = this.socks();
      for (const ws of this.ctx.getWebSockets()) {
        const a = this.att(ws);
        if (a.gid && a.kind !== "pending" && !this.dead.has(ws) && !(live.get(a.gid) || []).includes(ws)) { this.drop(ws, 4013, "timeout"); this.onDisconnect(a.gid); }
      }
      if (pending || this.ctx.getWebSockets().length) this.timer("sweep", now + (pending ? HELLO_MS : LIVE_MS));
    }
    if (due("phase") && this.g) {
      const key = t.phase.key;
      this.clearTimer("phase");
      if (this.g.st.phase + this.g.st.day === key && this.g.dealt && this.m.narrator === "bot" && this.g.st.phase !== "ended") this.advancePhase();
    }
    if (due("credits")) { this.clearTimer("credits"); if (this.g && this.g.st.phase === "ended") this.returnToLobby(); }
    if (due("autostart")) { this.clearTimer("autostart"); if (!this.g && this.activeSeats().filter((s) => this.online(s.gid)).length >= MIN_PLAYERS) this.startGame(); }
    if (due("gm")) { this.clearTimer("gm"); if (this.m.gm && !this.online(this.m.gm.gid)) this.gmGone("away"); }
    if (due("drop")) {
      this.clearTimer("drop");
      if (!this.g) {
        const gone = this.m.seats.filter((s) => s.offSince && !this.online(s.gid) && now - s.offSince >= this.ms(LOBBY_DROP) - 50);
        if (gone.length) {
          this.m.seats = this.m.seats.filter((s) => !gone.includes(s));
          for (const s of gone) this.log("leave", { gid: s.gid, id: s.id, why: "offline" });
          if (!this.member(this.m.host)) this.handover();
          this.checkAutostart(now);
          this.broadcastLobby();
          this.regDirty();
        }
        const left = this.m.seats.filter((s) => s.offSince && !this.online(s.gid));
        if (left.length) this.timer("drop", Math.min(...left.map((s) => s.offSince)) + this.ms(LOBBY_DROP));
      }
    }
    if (due("idle")) {
      this.clearTimer("idle");
      if (this.socks().size === 0) return this.closeRoom("idle");
    }
    if (due("lobby")) {
      this.clearTimer("lobby");
      if (this.m.regDirty || hasUsage(this.usage) || this.m.pendingGames) await this.reportToLobby();
    }
    // The flush check: save once the room has gone quiet (it may hibernate after 10 s idle and lose its memory),
    // or at least every BUSY_SAVE_MS while busy. A busy room just checks again when it would go quiet.
    if (this.flushAt && this.flushAt <= now + 25) {
      this.flushAt = 0;
      const quietAt = this.lastActivity + FLUSH_MS;
      if ((this.dirtyMeta || this.dirtyGame || this.unsaved) && quietAt > now + 1000 && now - this.lastSave < BUSY_SAVE_MS) { this.flushAt = quietAt; this.arm(); }
      else this.save();
    } else if (this.dirtyMeta || this.dirtyGame) this.wantFlush();
  }

  // ---------- moderator actions (called by the Worker for /admin/action) ----------
  async sanction({ gid, type, reason, until }) {
    if (!this.m) return false;
    const s = this.member(gid);
    if (!s) return false;
    if (type === "ban") this.applyBan(s, reason, until);
    else if (type === "mute") {
      s.muteUntil = until;
      this.log("sanction", { gid, type: "mute", until });
      this.toGid(gid, { t: "sanction", type: "mute", reason, scope: "timed", until, appeal: APPEAL });
      this.toGid(gid, { t: "you", you: this.you(s) });
      this.dirtyMeta = true; this.save();
    } else if (type === "unmute") { s.muteUntil = 0; this.toGid(gid, { t: "you", you: this.you(s) }); this.dirtyMeta = true; this.save(); }
    this.commitAlarm();
    return true;
  }
}

function addUsageInto(into, u) { if (u) for (const k of Object.keys(into)) into[k] += Number(u[k]) || 0; }
