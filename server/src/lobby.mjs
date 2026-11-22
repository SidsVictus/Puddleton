// The Lobby Durable Object (a single instance named "main"): the registry of rooms, Quick Play, friend presence,
// the daily usage counters behind the "island is full" soft cap, the admin numbers, and the daily cleanup alarm.
import { DurableObject } from "cloudflare:workers";
import { makeCode, dayOf, num } from "./util.mjs";
import { capacity, emptyUsage, addUsage, usedOf, AwakeClock, COUNTERS } from "./usage.mjs";
import * as db from "./db.mjs";

const DAY = 86400000;
const STALE_MS = 15 * 60000;        // a room that has not reported for 15 minutes is not listed
const LIST_FRESH_MS = 3 * 60000;    // waiting rooms must have reported within 3 minutes to be listed
const CREATE_LIMIT = 5, CREATE_WINDOW = 10 * 60000;
const DAY_KEYS = ["gamesStarted", "roomsCreated", "refusedFull", "hardFailReports", "hardFailCount", "peakConcurrentRooms", ...COUNTERS];

export class Lobby extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.sql = ctx.storage.sql;
    this.own = emptyUsage();          // this object's own usage, written with the next daily row update
    this.clock = new AwakeClock();
    this.creates = new Map();         // gid -> recent room creation times
    this.fullReports = new Map();     // gid -> last /fullreport time
    this.q("CREATE TABLE IF NOT EXISTS rooms (code TEXT PRIMARY KEY, cls TEXT, mode TEXT, players INTEGER, narrator TEXT, private INTEGER, started INTEGER, quick INTEGER, members TEXT, created INTEGER, updated INTEGER) WITHOUT ROWID");
    this.q("CREATE TABLE IF NOT EXISTS daily (day TEXT PRIMARY KEY, data TEXT NOT NULL) WITHOUT ROWID");
    this.q("CREATE TABLE IF NOT EXISTS hardfail (gid TEXT NOT NULL, day TEXT NOT NULL, PRIMARY KEY (gid, day)) WITHOUT ROWID");
    this.alarmChecked = false;
  }

  q(sql, ...args) {
    const c = this.sql.exec(sql, ...args), rows = c.toArray();
    this.own.doRowsR += c.rowsRead; this.own.doRowsW += c.rowsWritten;
    return rows;
  }

  // Every RPC is one billed request on this object. `u` is usage the caller piggybacks (Worker counters).
  async enter(u) {
    const now = Date.now();
    this.clock.touch(now);
    this.own.rpc++;
    if (u) addUsage(this.own, u);
    if (!this.alarmChecked) {
      this.alarmChecked = true;
      if (!(await this.ctx.storage.getAlarm())) await this.ctx.storage.setAlarm(nextCleanup(now));
    }
    return now;
  }

  day(d) {
    const row = this.q("SELECT data FROM daily WHERE day = ?", d)[0];
    const out = Object.fromEntries(DAY_KEYS.map((k) => [k, 0]));
    if (row) Object.assign(out, JSON.parse(row.data));
    return out;
  }
  // Adds counters (and this object's pending own usage) to a day's row in one write.
  bump(add = {}, d = dayOf(Date.now())) {
    const row = this.day(d);
    for (const [k, v] of Object.entries(add)) row[k] = k === "peakConcurrentRooms" ? Math.max(row[k] || 0, v) : (row[k] || 0) + v;
    if (d === dayOf(Date.now())) {
      this.own.awakeMs += this.clock.take();
      addUsage(row, this.own);
      this.own = emptyUsage();   // this write itself is counted with the next one
    }
    this.q("INSERT INTO daily (day, data) VALUES (?, ?) ON CONFLICT(day) DO UPDATE SET data = excluded.data", d, JSON.stringify(row));
    return row;
  }
  capacityNow(now) {
    const today = this.day(dayOf(now));
    addUsage(today, this.own);
    return capacity(today, this.env, now);
  }
  liveRooms(now) {
    return this.q("SELECT count(*) AS rooms, coalesce(sum(players), 0) AS players FROM rooms WHERE players > 0 AND updated > ?", now - STALE_MS)[0];
  }

  // ---------- rooms ----------
  // Creates a room: capacity check, a fresh code, then the Room object is initialised.
  async createRoom({ gid, band, narrator = "bot", quick = false, usage } = {}) {
    const now = await this.enter(usage);
    const cap = this.capacityNow(now);
    if (cap.full) { this.bump({ refusedFull: 1 }); return { full: true, resetAt: cap.resetAt, limitName: cap.limitName }; }
    const recent = (this.creates.get(gid) || []).filter((t) => now - t < CREATE_WINDOW);
    if (recent.length >= CREATE_LIMIT) return { error: "E_RATE" };
    const cls = band === "child" ? "kids" : "teen";
    for (let i = 0; i < 8; i++) {
      const code = makeCode();
      if (this.q("SELECT code FROM rooms WHERE code = ?", code).length) continue;
      const room = this.env.ROOM.get(this.env.ROOM.idFromName(code));
      this.own.rpc++;   // the init call is a request on the room
      const ok = await room.init({ code, cls, creator: gid, narrator: narrator === "human" && !quick ? "human" : "bot", quick: !!quick, created: now });
      if (!ok) continue;
      // A Quick Play room counts its creator at once, so the next Quick Play finds it before the room reports.
      this.q("INSERT INTO rooms (code, cls, mode, players, narrator, private, started, quick, members, created, updated) VALUES (?, ?, 'classic', ?, ?, 0, 0, ?, '[]', ?, ?)",
        code, cls, quick ? 1 : 0, narrator === "human" && !quick ? "human" : "bot", quick ? 1 : 0, now, now);
      recent.push(now);
      this.creates.set(gid, recent);
      this.bump({ roomsCreated: 1 });
      return { code };
    }
    return { error: "E_UNKNOWN" };
  }

  // Quick Play: the fullest waiting public bot-narrator room of the player's class, or a new quick room.
  async quickPlay({ gid, band, exclude = [], usage } = {}) {
    const now = await this.enter(usage);
    const cap = this.capacityNow(now);
    if (cap.full) { this.bump({ refusedFull: 1 }); return { full: true, resetAt: cap.resetAt, limitName: cap.limitName }; }
    const cls = band === "child" ? "kids" : "teen";
    const skip = (Array.isArray(exclude) ? exclude : []).filter((c) => typeof c === "string").slice(0, 10);
    const rows = this.q("SELECT code, players FROM rooms WHERE cls = ? AND private = 0 AND started = 0 AND narrator = 'bot' AND players BETWEEN 1 AND 15 AND updated > ? ORDER BY quick DESC, players DESC LIMIT 12",
      cls, now - LIST_FRESH_MS).filter((r) => !skip.includes(r.code));
    if (rows.length) {
      this.q("UPDATE rooms SET players = players + 1 WHERE code = ?", rows[0].code);   // a reservation until the room reports
      return { code: rows[0].code, created: false };
    }
    const r = await this.createRoom({ gid, band, narrator: "bot", quick: true });
    return r.code ? { code: r.code, created: true } : r;
  }

  async listRooms({ band, usage } = {}) {
    const now = await this.enter(usage);
    const cls = band === "child" ? "kids" : "teen";
    return this.q("SELECT code, mode, players, narrator, private FROM rooms WHERE cls = ? AND started = 0 AND players BETWEEN 1 AND 15 AND updated > ? ORDER BY players DESC, created DESC LIMIT 50",
      cls, now - LIST_FRESH_MS).map((r) => ({ code: r.code, mode: r.mode, players: r.players, narrator: r.narrator, locked: !!r.private }));
  }

  // A room reports its registry entry (or that it closed) and its usage since the last report.
  async report({ code, reg = null, closed = false, usage = null, gamesStarted = 0 } = {}) {
    const now = await this.enter(usage);
    if (closed) this.q("DELETE FROM rooms WHERE code = ?", code);
    else if (reg) {
      this.q(`INSERT INTO rooms (code, cls, mode, players, narrator, private, started, quick, members, created, updated) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(code) DO UPDATE SET cls = excluded.cls, mode = excluded.mode, players = excluded.players, narrator = excluded.narrator, private = excluded.private,
        started = excluded.started, quick = excluded.quick, members = excluded.members, updated = excluded.updated`,
        code, reg.cls, reg.mode, reg.players, reg.narrator, reg.private ? 1 : 0, reg.started ? 1 : 0, reg.quick ? 1 : 0, JSON.stringify(reg.members || []), now, now);
    }
    this.bump({ gamesStarted, peakConcurrentRooms: this.liveRooms(now).rooms });
    return true;
  }

  // Worker counters with no other reason to call.
  async addUsage({ usage } = {}) { await this.enter(usage); this.bump(); return true; }

  // Friend presence: gid -> room code for the given gids.
  async presence({ gids = [], usage } = {}) {
    const now = await this.enter(usage);
    const want = new Set(gids), out = {};
    for (const r of this.q("SELECT code, members FROM rooms WHERE updated > ?", now - STALE_MS)) {
      for (const g of JSON.parse(r.members || "[]")) if (want.has(g)) out[g] = r.code;
    }
    return out;
  }

  // A client could not reach the API on `day` and saw `count` failures. One report per guest per day.
  async fullReport({ gid, day, count, usage } = {}) {
    const now = await this.enter(usage);
    if (now - (this.fullReports.get(gid) || 0) < 60000) return { ok: false, error: "E_RATE" };
    this.fullReports.set(gid, now);
    if (typeof day !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(day)) return { ok: false, error: "E_PROTO" };
    const t = Date.parse(day + "T00:00:00Z");
    if (!Number.isFinite(t) || t > now || now - t > 7 * DAY) return { ok: false, error: "E_PROTO" };
    if (this.q("SELECT 1 FROM hardfail WHERE gid = ? AND day = ?", gid, day).length) return { ok: true, counted: false };
    this.q("INSERT INTO hardfail (gid, day) VALUES (?, ?)", gid, day);
    this.bump({ hardFailReports: 1, hardFailCount: Math.min(100, Math.max(1, Math.floor(num(count, 1)))) }, day);
    return { ok: true, counted: true };
  }

  // Numbers for the admin page (the exact /admin/stats contract, without reports.open which lives in D1).
  async stats({ usage } = {}) {
    const now = await this.enter(usage);
    const rows = this.q("SELECT day, data FROM daily WHERE day >= ? ORDER BY day DESC", dayOf(now - 29 * DAY));
    const byDay = new Map(rows.map((r) => [r.day, JSON.parse(r.data)]));
    const days = [];
    for (let i = 0; i < 30; i++) {
      const d = dayOf(now - i * DAY), x = byDay.get(d) || {};
      days.push({
        day: d, gamesStarted: x.gamesStarted || 0, roomsCreated: x.roomsCreated || 0, refusedFull: x.refusedFull || 0,
        hardFailReports: x.hardFailReports || 0, peakConcurrentRooms: x.peakConcurrentRooms || 0,
        incomingMessages: x.incoming || 0, rowsWritten: (x.doRowsW || 0) + (x.d1RowsW || 0),
      });
    }
    const live = this.liveRooms(now), cap = this.capacityNow(now);
    return {
      now: new Date(now).toISOString(), days, live: { rooms: live.rooms, players: live.players },
      capacity: { limitName: cap.limitName, usedToday: cap.usedToday, limitToday: cap.limitToday, percent: cap.percent, resetAt: cap.resetAt },
    };
  }

  // Everything behind the estimate: every counter per day and every limit today (GET /admin/usage).
  async usage({ usage } = {}) {
    const now = await this.enter(usage);
    const rows = this.q("SELECT day, data FROM daily WHERE day >= ? ORDER BY day DESC", dayOf(now - 29 * DAY));
    const cap = this.capacityNow(now);
    return {
      now: new Date(now).toISOString(), softCapPercent: 85, wsRatio: num(this.env.WS_RATIO, 1), capScale: num(this.env.CAP_SCALE, 1),
      today: cap.all, full: cap.full, resetAt: cap.resetAt,
      days: rows.map((r) => { const x = JSON.parse(r.data); return { day: r.day, counters: x, used: usedOf(x, this.env) }; }),
    };
  }

  // The room a guest is in right now, for live moderator actions.
  async findRoom({ gid, usage } = {}) {
    const now = await this.enter(usage);
    for (const r of this.q("SELECT code, members FROM rooms WHERE updated > ?", now - STALE_MS)) if (JSON.parse(r.members || "[]").includes(gid)) return r.code;
    return null;
  }

  // Daily cleanup: match logs after 30 days, reports after a year, expired links and sanctions, stale rooms.
  async alarm() {
    const now = Date.now();
    this.clock.touch(now);
    this.own.alarms++;
    const u = this.own;
    try {
      await db.batch(this.env, u, [
        ["DELETE FROM match_logs WHERE created < ?", now - 30 * DAY],
        ["DELETE FROM reports WHERE created < ?", now - 365 * DAY],
        ["DELETE FROM friend_links WHERE expires < ?", now],
        ["DELETE FROM friend_requests WHERE created < ?", now - 7 * DAY],
        ["DELETE FROM sanctions WHERE until < ?", now - 365 * DAY],
      ]);
    } catch (e) { console.log("cleanup failed", String(e)); }
    this.q("DELETE FROM rooms WHERE updated < ?", now - 2 * 3600000);
    this.q("DELETE FROM daily WHERE day < ?", dayOf(now - 90 * DAY));
    this.q("DELETE FROM hardfail WHERE day < ?", dayOf(now - 30 * DAY));
    this.bump();
    await this.ctx.storage.setAlarm(nextCleanup(now));
  }
}

// The next 03:00 UTC.
function nextCleanup(now) {
  const d = new Date(now), t = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 3);
  return t > now + 60000 ? t : t + DAY;
}
