// The front Worker: kept thin for the free plan's 10 ms CPU budget. It checks the Origin, answers CORS, verifies
// Turnstile, authenticates guests, and routes to the Lobby or a Room Durable Object. Endpoints: PROTOCOL.md.
import { Room } from "./room.mjs";
import { Lobby } from "./lobby.mjs";
import { PROTOCOL } from "../../config.mjs";
import * as db from "./db.mjs";
import { checkName } from "./filter.mjs";
import { originAllowed, cors, json, sha256, sameHex, randomB32, randomHex, deviceHash, CODE_RE, GID_RE, BANDS, SERVER_VERSION, APPEAL, num } from "./util.mjs";
import { emptyUsage, hasUsage } from "./usage.mjs";

export { Room, Lobby };

const DAY = 86400000, LINK_MS = 7 * DAY, MAX_FRIENDS = 200, ONLINE_MS = 5 * 60000;
// Friend requests: expire after 7 days (REQUEST_TTL_MS, a test knob, can shorten it); at most 20 waiting for one
// player, at most 10 sent by one player per day.
const REQUEST_MS = 7 * DAY, MAX_INCOMING = 20, MAX_OUT_DAY = 10;

// Usage counted in this isolate (best effort), sent to the Lobby with the next Lobby call or once a minute.
let pending = emptyUsage(), lastFlush = Date.now();
function takeUsage() { const u = pending; pending = emptyUsage(); lastFlush = Date.now(); return u; }
const lobby = (env) => env.LOBBY.get(env.LOBBY.idFromName("main"));

export default {
  async fetch(req, env, ctx) {
    pending.workerReq++;
    const url = new URL(req.url), path = url.pathname, origin = req.headers.get("Origin") || "";
    const allowed = originAllowed(origin, env, path.startsWith("/admin/"));
    if (req.method === "OPTIONS") return allowed ? new Response(null, { status: 204, headers: cors(origin) }) : new Response(null, { status: 403 });
    if (!allowed) return json({ error: "E_ORIGIN", msg: "This site may not use the Puddleton API." }, 403);
    try {
      return await route(req, env, url, path, origin);
    } catch (e) {
      console.log("error", path, e?.stack || String(e));
      return json({ error: "E_SERVER", msg: "Something went sideways." }, 500, origin);
    } finally {
      if (Date.now() - lastFlush > 60000 && hasUsage(pending)) ctx.waitUntil(lobby(env).addUsage({ usage: takeUsage() }).catch(() => {}));
    }
  },
};

async function readBody(req) {
  try { const t = await req.text(); return t.length <= 16384 ? JSON.parse(t || "{}") : null; } catch { return null; }
}

// Authorization: Guest <gid>:<secret>
async function guestOf(req, env) {
  const m = (req.headers.get("Authorization") || "").match(/^Guest (g_[a-z2-7]{20}):([0-9a-f]{64})$/);
  if (!m) return null;
  const g = await db.getGuest(env, pending, m[1]);
  return g && sameHex(await sha256(m[2]), g.secret_hash) ? g : null;
}

// The player's IP address is not sent (the optional remoteip field stays empty).
async function turnstileOk(env, token) {
  if (typeof token !== "string" || !token || token.length > 2048 || !env.TURNSTILE_SECRET) return false;
  const form = new FormData();
  form.append("secret", env.TURNSTILE_SECRET);
  form.append("response", token);
  try {
    const r = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", { method: "POST", body: form });
    return (await r.json()).success === true;
  } catch { return false; }
}

function adminOk(req, env) {
  const h = req.headers.get("Authorization") || "", t = h.startsWith("Bearer ") ? h.slice(7) : "";
  const want = String(env.ADMIN_TOKEN || "");
  if (!want || t.length !== want.length) return false;
  let d = 0;
  for (let i = 0; i < t.length; i++) d |= t.charCodeAt(i) ^ want.charCodeAt(i);
  return d === 0;
}

const banBody = (ban) => ({ error: "E_BANNED", msg: "You are banned for now.", reason: ban.reason, until: ban.until, appeal: APPEAL });

async function route(req, env, url, path, origin) {
  const J = (body, status = 200) => json(body, status, origin);
  const E = (error, status, msg, extra = {}) => J({ error, msg, ...extra }, status);
  const method = req.method;

  if (path === "/version" && method === "GET") return J({ protocol: PROTOCOL, server: SERVER_VERSION });

  // The game socket. The Room checks everything else in the hello.
  const ws = path.match(/^\/ws\/([A-Za-z0-9]{6})$/);
  if (ws && method === "GET") {
    if ((req.headers.get("Upgrade") || "").toLowerCase() !== "websocket") return E("E_PROTO", 426, "Expected a WebSocket upgrade.");
    const code = ws[1].toUpperCase();
    if (!CODE_RE.test(code)) return E("E_NO_ROOM", 404, "No room with that code.");
    return env.ROOM.get(env.ROOM.idFromName(code)).fetch(req);
  }

  if (path === "/guest" && method === "POST") {
    const b = await readBody(req);
    if (!b || !BANDS.includes(b.band)) return E("E_BAND", 400, "Pick an age group: child, teen or adult.");
    if (!(await turnstileOk(env, b.turnstile))) return E("E_TURNSTILE", 403, "Please complete the check.");
    const dev = await deviceHash(env, b.device);
    const ban = await db.activeSanction(env, pending, "ban", { device: dev });
    if (ban) return J(banBody(ban), 403);
    const gid = "g_" + randomB32(20), secret = randomHex(32), now = Date.now();
    await db.run(env, pending, "INSERT INTO guests (gid, secret_hash, band, created, last_seen, device_hash) VALUES (?, ?, ?, ?, ?, ?)",
      gid, await sha256(secret), b.band, now, now, dev);
    return J({ gid, secret, band: b.band });
  }

  if (path.startsWith("/profile/") && method === "GET") {
    const gid = path.slice(9);
    if (!GID_RE.test(gid)) return E("E_NOT_FOUND", 404, "No such player.");
    const g = await db.first(env, pending, "SELECT gid, name, look, stats FROM guests WHERE gid = ?", gid);
    if (!g) return E("E_NOT_FOUND", 404, "No such player.");
    return J({ gid: g.gid, name: g.name, look: parseLook(g.look), stats: db.statsOf(g.stats) });
  }

  if (path.startsWith("/admin/")) return admin(req, env, url, path, J, E);

  // Everything below needs a guest.
  const me = await guestOf(req, env);
  if (!me) return E("E_AUTH", 401, "Your guest pass is not valid.");

  if (path === "/me" && method === "GET") {
    const now = Date.now();
    const [ban, mute] = await Promise.all([db.activeSanction(env, pending, "ban", { gid: me.gid }, now), db.activeSanction(env, pending, "mute", { gid: me.gid }, now)]);
    return J({ gid: me.gid, band: me.band, name: me.name, look: parseLook(me.look), stats: db.statsOf(me.stats), created: me.created,
      sanction: ban ? { type: "ban", reason: ban.reason, until: ban.until, appeal: APPEAL } : mute ? { type: "mute", reason: mute.reason, until: mute.until, appeal: APPEAL } : null });
  }

  // Clear my data: removes the guest and everything that belongs to it. Sanctions and reports stay (bans keep
  // matching the device, moderators keep their records); match logs keep their own 30 day purge (other players' data).
  if (path === "/me/delete" && method === "POST") {
    await db.batch(env, pending, [
      ["DELETE FROM friends WHERE a = ? OR b = ?", me.gid, me.gid],
      ["DELETE FROM friend_requests WHERE from_gid = ? OR to_gid = ?", me.gid, me.gid],
      ["DELETE FROM friend_links WHERE gid = ?", me.gid],
      ["DELETE FROM blocks WHERE gid = ? OR target = ?", me.gid, me.gid],
      ["DELETE FROM guests WHERE gid = ?", me.gid],
    ]);
    return J({ ok: true });
  }

  if (path === "/rooms" && method === "GET") return J({ rooms: await lobby(env).listRooms({ band: me.band, usage: takeUsage() }) });

  if ((path === "/rooms" || path === "/quickplay") && method === "POST") {
    const b = await readBody(req);
    if (!b) return E("E_PROTO", 400, "Bad request.");
    if (!(await turnstileOk(env, b.turnstile))) return E("E_TURNSTILE", 403, "Please complete the check.");
    const dev = await deviceHash(env, b.device);
    const ban = await db.activeSanction(env, pending, "ban", { gid: me.gid, device: dev });
    if (ban) return J(banBody(ban), 403);
    const r = path === "/rooms"
      ? await lobby(env).createRoom({ gid: me.gid, band: me.band, narrator: b.narrator === "human" ? "human" : "bot", quick: false, usage: takeUsage() })
      : await lobby(env).quickPlay({ gid: me.gid, band: me.band, exclude: b.exclude, usage: takeUsage() });
    if (r.full) return E("E_FULL", 503, "The island is full for today.", { resetAt: r.resetAt });
    if (r.error === "E_RATE") return E("E_RATE", 429, "You are making rooms too fast. Try again in a few minutes.");
    if (!r.code) return E("E_SERVER", 500, "Could not open a room.");
    return J({ code: r.code, created: r.created ?? true });
  }

  if (path === "/fullreport" && method === "POST") {
    const b = await readBody(req);
    const r = await lobby(env).fullReport({ gid: me.gid, day: b?.day, count: b?.count, usage: takeUsage() });
    return r.ok ? J(r) : E(r.error, r.error === "E_RATE" ? 429 : 400, r.error === "E_RATE" ? "Too many reports." : "Bad report.");
  }

  // ---------- friends ----------
  // Opening someone's friend link sends them a request; they accept or decline (a decline is silent), the sender
  // can cancel. The child band has no friend features.
  if (path.startsWith("/friends")) {
    if (me.band === "child") return path === "/friends" && method === "GET" ? J({ friends: [], requests: { incoming: [], outgoing: [] } }) : E("E_CHILD", 403, "Friend links are not available for this age group.");
    const now = Date.now(), ttl = num(env.REQUEST_TTL_MS, REQUEST_MS), fresh = now - ttl;
    const card = (r) => ({ gid: r.gid, name: r.name, look: parseLook(r.look) });
    const guest = (gid) => db.first(env, pending, "SELECT gid, name, look FROM guests WHERE gid = ?", gid);
    const friendCount = async (gid) => (await db.first(env, pending, "SELECT count(*) AS n FROM friends WHERE a = ?", gid)).n;
    const areFriends = async (a, b) => !!(await db.first(env, pending, "SELECT 1 AS x FROM friends WHERE a = ? AND b = ?", a, b));
    const makeFriends = (a, b) => db.batch(env, pending, [
      ["INSERT OR IGNORE INTO friends (a, b, since) VALUES (?, ?, ?)", a, b, now],
      ["INSERT OR IGNORE INTO friends (a, b, since) VALUES (?, ?, ?)", b, a, now],
      ["DELETE FROM friend_requests WHERE (from_gid = ? AND to_gid = ?) OR (from_gid = ? AND to_gid = ?)", a, b, b, a],
    ]);
    const gidOf = async () => { const b = await readBody(req); return typeof b?.gid === "string" && GID_RE.test(b.gid) ? b.gid : null; };

    if (path === "/friends" && method === "GET") {
      const rows = await db.all(env, pending, "SELECT g.gid, g.name, g.look, g.last_seen FROM friends f JOIN guests g ON g.gid = f.b WHERE f.a = ? LIMIT ?", me.gid, MAX_FRIENDS);
      const where = rows.length ? await lobby(env).presence({ gids: rows.map((r) => r.gid), usage: takeUsage() }) : {};
      // Incoming: only pending ones. Outgoing: a declined request still shows, as if pending, until it expires.
      const incoming = await db.all(env, pending, "SELECT g.gid, g.name, g.look, r.created FROM friend_requests r JOIN guests g ON g.gid = r.from_gid WHERE r.to_gid = ? AND r.status = 'pending' AND r.created > ? ORDER BY r.created DESC LIMIT ?", me.gid, fresh, MAX_INCOMING);
      const outgoing = await db.all(env, pending, "SELECT g.gid, g.name, g.look, r.created FROM friend_requests r JOIN guests g ON g.gid = r.to_gid WHERE r.from_gid = ? AND r.created > ? ORDER BY r.created DESC LIMIT 50", me.gid, fresh);
      if (now - me.last_seen > ONLINE_MS) await db.run(env, pending, "UPDATE guests SET last_seen = ? WHERE gid = ?", now, me.gid);
      const request = (r) => ({ ...card(r), created: r.created, expires: r.created + ttl });
      return J({
        friends: rows.map((r) => ({ ...card(r), online: !!where[r.gid] || now - r.last_seen < ONLINE_MS, room: where[r.gid] || null })),
        requests: { incoming: incoming.map(request), outgoing: outgoing.map(request) },
      });
    }
    if ((path === "/friends/link" || path === "/friends/link/reset") && method === "POST") {
      let row = await db.first(env, pending, "SELECT token, expires FROM friend_links WHERE gid = ?", me.gid);
      if (!row || row.expires < now || path.endsWith("/reset")) {
        row = { token: randomB32(24), expires: now + LINK_MS };
        await db.run(env, pending, "INSERT INTO friend_links (gid, token, expires) VALUES (?, ?, ?) ON CONFLICT(gid) DO UPDATE SET token = excluded.token, expires = excluded.expires", me.gid, row.token, row.expires);
      }
      return J({ token: row.token, expires: row.expires });
    }
    if (path === "/friends/redeem" && method === "POST") {
      const b = await readBody(req);
      if (typeof b?.token !== "string" || !/^[a-z2-7]{24}$/.test(b.token)) return E("E_LINK", 404, "That friend link is not valid any more.");
      const link = await db.first(env, pending, "SELECT gid, expires FROM friend_links WHERE token = ?", b.token);
      if (!link || link.expires < now) return E("E_LINK", 404, "That friend link is not valid any more.");
      const owner = link.gid;
      if (owner === me.gid) return E("E_SELF", 400, "That is your own friend link.");
      // A brand new player has no name here yet (names are kept from the first room). The client sends the name the
      // player typed, so the owner can see who is asking; it passes the same name check as a room hello.
      if (!me.name && typeof b.name === "string") {
        const typed = b.name.slice(0, 64), id = typed.replace(/[^A-Za-z0-9_]/g, "").slice(0, 16);
        if (id && checkName(typed).ok && checkName(id).ok) await db.run(env, pending, "UPDATE guests SET name = ? WHERE gid = ? AND name = ''", id, me.gid);
      }
      const friends = await areFriends(me.gid, owner);
      if (!friends) {
        if ((await friendCount(me.gid)) >= MAX_FRIENDS) return E("E_FRIENDS_FULL", 400, "Your friends list is full.");
        const sent = await db.first(env, pending, "SELECT count(*) AS n FROM friend_requests WHERE from_gid = ? AND created > ?", me.gid, now - DAY);
        if (sent.n >= MAX_OUT_DAY) return E("E_REQUEST_LIMIT", 429, "You have sent a lot of friend requests today. Try again tomorrow.");
        const waiting = await db.first(env, pending, "SELECT count(*) AS n FROM friend_requests WHERE to_gid = ? AND status = 'pending' AND created > ? AND from_gid != ?", owner, fresh, me.gid);
        if (waiting.n >= MAX_INCOMING) return E("E_REQUESTS_FULL", 409, "That player has too many friend requests waiting right now.");
      }
      // Single use: whoever rotates the token first gets to use it.
      const rot = await db.run(env, pending, "UPDATE friend_links SET token = ?, expires = ? WHERE gid = ? AND token = ?", randomB32(24), now + LINK_MS, owner, b.token);
      if (!rot.meta?.changes) return E("E_LINK", 404, "That friend link is not valid any more.");
      const them = card(await guest(owner));
      if (friends) return J({ status: "friends", friend: them });
      // A block either way: nothing is stored, and the answer looks the same as a normal request.
      const blocked = await db.first(env, pending, "SELECT 1 AS x FROM blocks WHERE (gid = ? AND target = ?) OR (gid = ? AND target = ?)", owner, me.gid, me.gid, owner);
      if (blocked) return J({ status: "pending", to: them });
      // They already asked us: both want it, so it is a friendship now.
      const mutual = await db.first(env, pending, "SELECT 1 AS x FROM friend_requests WHERE from_gid = ? AND to_gid = ? AND status = 'pending' AND created > ?", owner, me.gid, fresh);
      if (mutual && (await friendCount(owner)) < MAX_FRIENDS) { await makeFriends(me.gid, owner); return J({ status: "friends", friend: them }); }
      await db.run(env, pending, "INSERT INTO friend_requests (from_gid, to_gid, created, status) VALUES (?, ?, ?, 'pending') ON CONFLICT(from_gid, to_gid) DO UPDATE SET created = excluded.created, status = 'pending'",
        me.gid, owner, now);
      return J({ status: "pending", to: them });
    }
    if (path === "/friends/accept" && method === "POST") {
      const gid = await gidOf();
      if (!gid) return E("E_PROTO", 400, "Bad request.");
      const r = await db.first(env, pending, "SELECT 1 AS x FROM friend_requests WHERE from_gid = ? AND to_gid = ? AND status = 'pending' AND created > ?", gid, me.gid, fresh);
      if (!r) return E("E_NO_REQUEST", 404, "That friend request is not there any more.");
      if ((await friendCount(me.gid)) >= MAX_FRIENDS || (await friendCount(gid)) >= MAX_FRIENDS) return E("E_FRIENDS_FULL", 400, "A friends list is full.");
      await makeFriends(me.gid, gid);
      return J({ friend: card(await guest(gid)) });
    }
    if (path === "/friends/decline" && method === "POST") {
      const gid = await gidOf();
      if (!gid) return E("E_PROTO", 400, "Bad request.");
      await db.run(env, pending, "UPDATE friend_requests SET status = 'declined' WHERE from_gid = ? AND to_gid = ? AND status = 'pending'", gid, me.gid);
      return J({ ok: true });
    }
    if (path === "/friends/cancel" && method === "POST") {
      const gid = await gidOf();
      if (!gid) return E("E_PROTO", 400, "Bad request.");
      await db.run(env, pending, "DELETE FROM friend_requests WHERE from_gid = ? AND to_gid = ?", me.gid, gid);
      return J({ ok: true });
    }
    if (path === "/friends/remove" && method === "POST") {
      const gid = await gidOf();
      if (!gid) return E("E_PROTO", 400, "Bad request.");
      await db.batch(env, pending, [["DELETE FROM friends WHERE a = ? AND b = ?", me.gid, gid], ["DELETE FROM friends WHERE a = ? AND b = ?", gid, me.gid]]);
      return J({ ok: true });
    }
  }
  return E("E_NOT_FOUND", 404, "Not found.");
}

const parseLook = (s) => { try { return s ? JSON.parse(s) : null; } catch { return null; } };

// ---------- admin (Authorization: Bearer ADMIN_TOKEN) ----------
async function admin(req, env, url, path, J, E) {
  if (!adminOk(req, env)) return E("E_AUTH", 401, "Admin token required.");
  const method = req.method;
  if (path === "/admin/stats" && method === "GET") {
    const [stats, open] = await Promise.all([lobby(env).stats({ usage: takeUsage() }), db.first(env, pending, "SELECT count(*) AS n FROM reports WHERE status = 'open'")]);
    return J({ now: stats.now, days: stats.days, live: stats.live, capacity: stats.capacity, reports: { open: open?.n || 0 } });
  }
  if (path === "/admin/usage" && method === "GET") return J(await lobby(env).usage({ usage: takeUsage() }));
  if (path === "/admin/reports" && method === "GET") {
    const status = ["open", "resolved", "all"].includes(url.searchParams.get("status")) ? url.searchParams.get("status") : "open";
    const limit = Math.min(200, Math.floor(num(url.searchParams.get("limit"), 50)));
    const before = Math.floor(num(url.searchParams.get("before"), 2 ** 52));
    const rows = await db.all(env, pending, `SELECT id, created, reporter, target, target_name, room, reason, note, auto, status, log_id, resolved_at, resolution FROM reports
      WHERE id < ? ${status === "all" ? "" : "AND status = ?"} ORDER BY id DESC LIMIT ?`, ...(status === "all" ? [before, limit] : [before, status, limit]));
    return J({ reports: rows.map((r) => ({ ...r, auto: !!r.auto })) });
  }
  const one = path.match(/^\/admin\/reports\/(\d+)$/);
  if (one && method === "GET") {
    const r = await db.first(env, pending, "SELECT * FROM reports WHERE id = ?", Number(one[1]));
    if (!r) return E("E_NOT_FOUND", 404, "No such report.");
    const log = r.log_id ? await db.first(env, pending, "SELECT data FROM match_logs WHERE id = ?", r.log_id) : null;
    return J({ report: { ...r, auto: !!r.auto }, snapshot: log ? JSON.parse(log.data) : null });
  }
  if (path === "/admin/action" && method === "POST") {
    const b = await readBody(req);
    if (!b || typeof b.action !== "string") return E("E_PROTO", 400, "Bad request.");
    const now = Date.now(), reason = typeof b.reason === "string" ? b.reason.slice(0, 200) : "moderator";
    let target = null, result = { ok: true };
    if (b.action === "resolve") {
      const id = Number(b.reportId);
      if (!Number.isInteger(id)) return E("E_PROTO", 400, "reportId needed.");
      const r = await db.run(env, pending, "UPDATE reports SET status = 'resolved', resolved_at = ?, resolution = ? WHERE id = ?", now, typeof b.resolution === "string" ? b.resolution.slice(0, 500) : "", id);
      if (!r.meta?.changes) return E("E_NOT_FOUND", 404, "No such report.");
      target = "report:" + id;
    } else if (["mute", "ban", "unmute", "unban"].includes(b.action)) {
      if (typeof b.gid !== "string" || !GID_RE.test(b.gid)) return E("E_PROTO", 400, "gid needed.");
      const g = await db.getGuest(env, pending, b.gid);
      if (!g) return E("E_NOT_FOUND", 404, "No such guest.");
      target = b.gid;
      if (b.action === "mute" || b.action === "ban") {
        const until = now + Math.min(24 * 365, Math.max(1, num(b.hours, 24))) * 3600000;
        await db.addSanction(env, pending, { type: b.action, gid: g.gid, device: b.action === "ban" ? g.device_hash : null, reason, until, by: "admin" });
        result.until = until;
        await liveSanction(env, g.gid, { type: b.action, reason, until });
      } else {
        const type = b.action === "unban" ? "ban" : "mute";
        await db.run(env, pending, "UPDATE sanctions SET active = 0 WHERE gid = ? AND type = ? AND active = 1", g.gid, type);
        if (type === "mute") await liveSanction(env, g.gid, { type: "unmute" });
      }
    } else return E("E_PROTO", 400, "Unknown action.");
    await db.run(env, pending, "INSERT INTO audit (at, action, target, detail) VALUES (?, ?, ?, ?)", now, b.action, target,
      JSON.stringify({ reason, hours: b.hours ?? null, resolution: b.resolution ?? null, note: typeof b.note === "string" ? b.note.slice(0, 500) : null }));
    return J(result);
  }
  if (path === "/admin/audit" && method === "GET") {
    return J({ audit: await db.all(env, pending, "SELECT id, at, action, target, detail FROM audit ORDER BY id DESC LIMIT 200") });
  }
  return E("E_NOT_FOUND", 404, "Not found.");
}

// Pushes a moderator action into the room the guest is playing in right now, if any.
async function liveSanction(env, gid, s) {
  try {
    const code = await lobby(env).findRoom({ gid, usage: takeUsage() });
    if (code) await env.ROOM.get(env.ROOM.idFromName(code)).sanction({ gid, ...s });
  } catch (e) { console.log("live sanction failed", String(e)); }
}
