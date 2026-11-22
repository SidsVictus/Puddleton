// Rate limits. Pure, clock passed in, so the unit tests can drive time.

// Chat rules for every player and every channel (square, whispers, ghost chat).
export const CHAT_RULES = {
  minGap: 1000,      // at least 1 s between messages
  slowGap: 3000,     // 1 message per 3 s while slowed
  spamCount: 5,      // 5 or more attempts ...
  spamWindow: 6000,  // ... within 6 s slows the player down ...
  slowFor: 60000,    // ... for the next 60 s
  dupWindow: 30000,  // the same message again within 30 s is suppressed
  dupDepth: 3,       // compared with the last 3 messages
};

// check(id, now, key) -> { ok: true } or { ok: false, code, until? } and slowedNow: true on the attempt that
// started a slowdown (send the "slowed" message once). key is the normalised text for duplicate detection.
// Every attempt, accepted or not, counts toward the spam window.
export class ChatLimiter {
  constructor(rules = CHAT_RULES) { this.r = rules; this.s = new Map(); }
  get(id) {
    let x = this.s.get(id);
    if (!x) this.s.set(id, (x = { last: -Infinity, times: [], slowUntil: 0, recent: [] }));
    return x;
  }
  slowUntil(id) { return this.get(id).slowUntil; }
  restore(id, slowUntil) { this.get(id).slowUntil = slowUntil || 0; }
  check(id, now, key = "") {
    const r = this.r, x = this.get(id);
    x.times = x.times.filter((t) => now - t < r.spamWindow);
    x.times.push(now);
    let slowedNow = false;
    if (now >= x.slowUntil && x.times.length >= r.spamCount) { x.slowUntil = now + r.slowFor; slowedNow = true; x.times = []; }
    const slowed = now < x.slowUntil;
    if (slowedNow) return { ok: false, code: "E_SLOWED", until: x.slowUntil, slowedNow };
    if (now - x.last < (slowed ? r.slowGap : r.minGap)) return { ok: false, code: slowed ? "E_SLOWED" : "E_RATE", until: slowed ? x.slowUntil : undefined, slowedNow };
    x.recent = x.recent.filter((m) => now - m.at < r.dupWindow);
    if (key && x.recent.some((m) => m.key === key)) return { ok: false, code: "E_DUP", slowedNow };
    x.last = now;
    if (key) { x.recent.push({ key, at: now }); if (x.recent.length > r.dupDepth) x.recent.shift(); }
    return { ok: true, slowedNow };
  }
}

// A token bucket for all other messages from one connection (moves, votes, settings...).
// take(id, now) -> true when allowed. Refills `rate` tokens per second up to `burst`.
export class Bucket {
  constructor(burst = 20, rate = 4) { this.burst = burst; this.rate = rate; this.s = new Map(); }
  take(id, now, cost = 1) {
    const x = this.s.get(id) || { tokens: this.burst, at: now };
    x.tokens = Math.min(this.burst, x.tokens + ((now - x.at) / 1000) * this.rate);
    x.at = now;
    const ok = x.tokens >= cost;
    if (ok) x.tokens -= cost;
    this.s.set(id, x);
    return ok;
  }
}

// Minimum gap per key: gap(key, now, ms) -> true when at least ms passed since the last allowed call.
export class Gap {
  constructor() { this.s = new Map(); }
  ok(key, now, ms) {
    if (now - (this.s.get(key) ?? -Infinity) < ms) return false;
    this.s.set(key, now);
    return true;
  }
}
