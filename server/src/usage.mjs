// Daily usage estimates against the Cloudflare free plan, and the "island is full" soft cap.
// Every counter is an estimate made by our own code (Cloudflare does not expose live usage to a Worker).
import { nextUtcMidnight, num } from "./util.mjs";

// Free plan daily limits. Exceeding one makes operations fail until 00:00 UTC, so we stop new rooms at 85%.
export const FREE_LIMITS = {
  workerRequests: { name: "Workers requests", limit: 100000 },
  doRequests: { name: "Durable Objects requests", limit: 100000 },
  doDuration: { name: "Durable Objects duration (GB-s)", limit: 13000 },
  doRowsWritten: { name: "Durable Objects rows written", limit: 100000 },
  doRowsRead: { name: "Durable Objects rows read", limit: 5000000 },
  d1RowsWritten: { name: "D1 rows written", limit: 100000 },
  d1RowsRead: { name: "D1 rows read", limit: 5000000 },
};
export const SOFT_CAP = 0.85;
export const DO_GB = 0.125;            // every awake Durable Object is billed as 128 MB
export const HIBERNATE_MS = 10000;     // an idle object hibernates after about 10 s

// The counters a Durable Object or the Worker adds up and sends to the Lobby.
export const COUNTERS = ["incoming", "connects", "alarms", "rpc", "workerReq", "doRowsW", "doRowsR", "d1RowsW", "d1RowsR", "awakeMs"];
export const emptyUsage = () => Object.fromEntries(COUNTERS.map((k) => [k, 0]));
export const hasUsage = (u) => COUNTERS.some((k) => u[k] > 0);
export function addUsage(into, u) { for (const k of COUNTERS) into[k] = (into[k] || 0) + (Number(u?.[k]) || 0); return into; }

// Estimated use of each limit for one day's counters.
export function usedOf(d, env) {
  const ratio = num(env.WS_RATIO, 1);
  return {
    workerRequests: d.workerReq || 0,
    doRequests: (d.connects || 0) + Math.ceil((d.incoming || 0) / ratio) + (d.alarms || 0) + (d.rpc || 0),
    doDuration: Math.round(((d.awakeMs || 0) / 1000) * DO_GB * 10) / 10,
    doRowsWritten: d.doRowsW || 0,
    doRowsRead: d.doRowsR || 0,
    d1RowsWritten: d.d1RowsW || 0,
    d1RowsRead: d.d1RowsR || 0,
  };
}

// The tightest limit today. CAP_SCALE (tests only) shrinks every limit.
export function capacity(d, env, now) {
  const used = usedOf(d, env), scale = num(env.CAP_SCALE, 1);
  let worst = null;
  const all = {};
  for (const [key, { name, limit }] of Object.entries(FREE_LIMITS)) {
    const lim = Math.max(1, Math.round(limit * scale)), pct = Math.round((used[key] / lim) * 1000) / 10;
    all[key] = { name, used: used[key], limit: lim, percent: pct };
    if (!worst || pct > worst.percent) worst = { limitName: name, usedToday: used[key], limitToday: lim, percent: pct };
  }
  return { ...worst, resetAt: new Date(nextUtcMidnight(now)).toISOString(), full: worst.percent >= SOFT_CAP * 100, all };
}

// Awake time estimate: an event extends the current awake stretch by the gap since the previous event,
// at most HIBERNATE_MS (after that the object would have hibernated). A fresh wake adds the idle tail before it
// sleeps again; rooms pass tails = 2 to also cover time counted before the last sleep that was never saved.
export class AwakeClock {
  constructor(tails = 1) { this.last = null; this.pending = tails * HIBERNATE_MS; }
  touch(now) {
    if (this.last !== null) this.pending += Math.min(now - this.last, HIBERNATE_MS);
    this.last = now;
  }
  take() { const ms = this.pending; this.pending = 0; return ms; }
}
