// D1 access shared by the Worker and the Durable Objects. Every call adds its rows read and written to `u`
// (a usage counters object, see usage.mjs) so the capacity estimate stays honest.
import { randomHex } from "./util.mjs";

const DAY = 86400000;
export const OFFENCE_WINDOW = 30 * DAY;   // match mutes within this window count toward a ban
export const BAN_AFTER = 3;               // the third match mute in the window brings a 24 hour ban
export const BAN_MS = DAY;

function count(u, res) {
  for (const r of Array.isArray(res) ? res : [res]) {
    if (!r?.meta || !u) continue;
    u.d1RowsR = (u.d1RowsR || 0) + (r.meta.rows_read || 0);
    u.d1RowsW = (u.d1RowsW || 0) + (r.meta.rows_written || 0);
  }
  return res;
}
export async function all(env, u, sql, ...args) { return count(u, await env.DB.prepare(sql).bind(...args).all()).results || []; }
export async function first(env, u, sql, ...args) { return (await all(env, u, sql, ...args))[0] || null; }
export async function run(env, u, sql, ...args) { return count(u, await env.DB.prepare(sql).bind(...args).run()); }
export async function batch(env, u, stmts) {
  if (!stmts.length) return [];
  return count(u, await env.DB.batch(stmts.map(([sql, ...args]) => env.DB.prepare(sql).bind(...args))));
}

export const getGuest = (env, u, gid) => first(env, u, "SELECT * FROM guests WHERE gid = ?", gid);

// The active sanction of a type for a guest or a device, or null. Only bans match the device. IPs are never used.
export function activeSanction(env, u, type, { gid = "", device = "" }, now = Date.now()) {
  return type === "ban"
    ? first(env, u, "SELECT id, type, reason, until FROM sanctions WHERE active = 1 AND type = 'ban' AND until > ? AND (gid = ? OR (device_hash = ? AND ? != '')) ORDER BY until DESC LIMIT 1", now, gid, device, device)
    : first(env, u, "SELECT id, type, reason, until FROM sanctions WHERE active = 1 AND type = ? AND until > ? AND gid = ? ORDER BY until DESC LIMIT 1", type, now, gid);
}

export function addSanction(env, u, { type, gid = null, device = null, reason, until, by }) {
  return run(env, u, "INSERT INTO sanctions (created, type, gid, device_hash, reason, until, by) VALUES (?, ?, ?, ?, ?, ?, ?)",
    Date.now(), type, gid, device || null, reason, until, by);
}

// A match mute counts as an offence. Returns the offences within the window, this one included.
export async function addOffence(env, u, gid, now = Date.now()) {
  const row = await first(env, u, "UPDATE guests SET offences = CASE WHEN offence_at < ? THEN 1 ELSE offences + 1 END, offence_at = ? WHERE gid = ? RETURNING offences",
    now - OFFENCE_WINDOW, now, gid);
  return row?.offences || 0;
}

// A report with a snapshot of the match. Returns the report id.
export async function fileReport(env, u, { reporter, target, targetName = "", room, reason, note = "", auto = false, snapshot }) {
  const logId = randomHex(12), now = Date.now();
  const res = await batch(env, u, [
    ["INSERT INTO match_logs (id, room, created, data) VALUES (?, ?, ?, ?)", logId, room, now, JSON.stringify(snapshot)],
    ["INSERT INTO reports (created, reporter, target, target_name, room, reason, note, auto, log_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id",
      now, reporter, target, targetName, room, reason, String(note).slice(0, 500), auto ? 1 : 0, logId],
  ]);
  return res[1]?.results?.[0]?.id ?? null;
}

// Game end: one row write per guest. entries: [{ gid, role, won }].
export function recordStats(env, u, entries) {
  return batch(env, u, entries.map(({ gid, role, won }) => [
    `UPDATE guests SET stats = json_set(stats, '$.games', coalesce(json_extract(stats, '$.games'), 0) + 1, '$.wins', coalesce(json_extract(stats, '$.wins'), 0) + ?,
       '$.' || ? || '_p', coalesce(json_extract(stats, '$.' || ? || '_p'), 0) + 1, '$.' || ? || '_w', coalesce(json_extract(stats, '$.' || ? || '_w'), 0) + ?) WHERE gid = ?`,
    won ? 1 : 0, role, role, role, role, won ? 1 : 0, gid,
  ]));
}

// The flat stats JSON as { games, wins, roles: { role: { played, won } } }.
export function statsOf(raw) {
  let s = {};
  try { s = JSON.parse(raw || "{}"); } catch { s = {}; }
  const roles = {};
  for (const [k, v] of Object.entries(s)) {
    const m = k.match(/^([a-z]+)_(p|w)$/);
    if (m) (roles[m[1]] ??= { played: 0, won: 0 })[m[2] === "p" ? "played" : "won"] = v;
  }
  return { games: s.games || 0, wins: s.wins || 0, roles };
}

// The guest's friends (gids), for the "friends only" whisper setting. One read, at most 200 rows.
export const getFriends = async (env, u, gid) => (await all(env, u, "SELECT b FROM friends WHERE a = ? LIMIT 200", gid)).map((r) => r.b);
export const getBlocks = async (env, u, gid) => (await all(env, u, "SELECT target FROM blocks WHERE gid = ?", gid)).map((r) => r.target);
// Blocking also clears any pending friend request between the two, either way.
export function setBlock(env, u, gid, target, on) {
  return on
    ? batch(env, u, [
      ["INSERT OR IGNORE INTO blocks (gid, target, since) VALUES (?, ?, ?)", gid, target, Date.now()],
      ["DELETE FROM friend_requests WHERE (from_gid = ? AND to_gid = ?) OR (from_gid = ? AND to_gid = ?)", gid, target, target, gid],
    ])
    : run(env, u, "DELETE FROM blocks WHERE gid = ? AND target = ?", gid, target);
}
