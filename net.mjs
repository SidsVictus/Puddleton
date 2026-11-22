// Talking to the Puddleton server (contract: server/PROTOCOL.md). The guest pass, HTTP calls, Turnstile tokens,
// the room WebSocket with its keepalive, and the days when the server could not be reached at all.
// No IP addresses are ever sent or stored here: the guest pass and a random device string are all the server gets.
import { API_BASE, PROTOCOL, TURNSTILE_SITE_KEY } from "./config.mjs";
import { layer } from "./screens/base.mjs";

const GUEST_KEY = "pad-guest", DEVICE_KEY = "pad-device", FAILS_KEY = "pad-fails";
const BANDS = ["child", "teen", "adult"];
const read = (k) => { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } };
const write = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* storage blocked: this visit only */ } };
const hex = (n) => [...crypto.getRandomValues(new Uint8Array(n))].map((b) => b.toString(16).padStart(2, "0")).join("");
const dayOf = (t = Date.now()) => new Date(t).toISOString().slice(0, 10);

export { PROTOCOL };
export const STORAGE_KEYS = [GUEST_KEY, DEVICE_KEY, FAILS_KEY];

// A random string made once per device (PROTOCOL section 2). Used, hashed, only to make bans stick.
let deviceMem = null;
export function device() {
  let d = read(DEVICE_KEY) || deviceMem;
  if (typeof d !== "string" || d.length < 8) { d = hex(16); write(DEVICE_KEY, d); }
  return (deviceMem = d);
}

// The guest pass { gid, secret, band }, or null before one exists.
export function guest() {
  const g = read(GUEST_KEY);
  return g && /^g_[a-z2-7]{20}$/.test(g.gid) && /^[0-9a-f]{64}$/.test(g.secret) && BANDS.includes(g.band) ? g : null;
}
export function forgetGuest() { try { localStorage.removeItem(GUEST_KEY); } catch { /* blocked */ } }

export class ApiError extends Error {
  constructor(status, body) { super(body?.msg || `The island said no (${status}).`); this.status = status; this.code = body?.error || "E_HTTP"; this.body = body || {}; }
}
export class NetError extends Error {
  constructor() { super("We could not reach the island. Check your connection and try again."); this.code = "E_NET"; }
}

// ---------- the island could not be reached ----------
// Each failed attempt (a network error while the device itself is online) is counted per UTC day; the next time the
// server answers, one day is reported with POST /fullreport (the server takes one report per guest per minute).
function noteFail() {
  if (typeof navigator !== "undefined" && navigator.onLine === false) return;
  const f = read(FAILS_KEY) || {}, d = dayOf();
  f[d] = (f[d] || 0) + 1;
  write(FAILS_KEY, f);
}
let reporting = false, lastReport = 0;
async function reached() {
  if (reporting || !guest() || Date.now() - lastReport < 61000) return;
  const f = read(FAILS_KEY);
  if (!f || typeof f !== "object") return;
  const oldest = dayOf(Date.now() - 7 * 86400000);
  const days = Object.keys(f).filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d) && d >= oldest && f[d] > 0).sort();
  for (const d of Object.keys(f)) if (!days.includes(d)) delete f[d];
  if (!days.length) { write(FAILS_KEY, {}); return; }
  reporting = true; lastReport = Date.now();
  const d = days[days.length - 1];
  try {
    await call("POST", "/fullreport", { day: d, count: Math.min(1000, f[d]) });
    delete f[d]; write(FAILS_KEY, f);
  } catch (e) {
    if (e instanceof ApiError && e.code === "E_PROTO") { delete f[d]; write(FAILS_KEY, f); }   // too old or malformed: drop it
  } finally { reporting = false; }
}

// ---------- HTTP ----------
// One call. Resolves with the JSON body; rejects with ApiError (the server answered no) or NetError (no answer).
export async function call(method, path, body = null, { auth = true } = {}) {
  const g = auth ? guest() : null;
  let r;
  try {
    r = await fetch(API_BASE + path, {
      method, cache: "no-store", credentials: "omit",
      headers: { ...(body ? { "Content-Type": "application/json" } : {}), ...(g ? { Authorization: `Guest ${g.gid}:${g.secret}` } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch { noteFail(); throw new NetError(); }
  let json = null;
  try { json = await r.json(); } catch { /* empty */ }
  if (path !== "/fullreport") reached();
  if (!r.ok) throw new ApiError(r.status, json);
  return json;
}

// ---------- Turnstile ----------
// One fresh token per request (guest creation, room creation, Quick Play). The widget stays invisible unless
// Cloudflare wants the player to tick a box; then it appears at the bottom of the screen above everything.
let tsLoading = null;
function loadTurnstile() {
  if (window.turnstile) return Promise.resolve(window.turnstile);
  return (tsLoading ||= new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
    s.async = true;
    s.onload = () => (window.turnstile ? resolve(window.turnstile) : reject(new NetError()));
    s.onerror = () => { tsLoading = null; s.remove(); noteFail(); reject(new NetError()); };
    document.head.append(s);
  }));
}
export async function turnstileToken() {
  const ts = await loadTurnstile();
  return new Promise((resolve, reject) => {
    const L = layer({ cls: "pad-ts", modal: false, role: null });
    const box = document.createElement("div");
    box.className = "pad-ts-box";
    L.el.append(box);
    let id = null, done = false;
    const fail = (msg) => Object.assign(new Error(msg), { code: "E_TURNSTILE" });
    const finish = (fn, v) => {
      if (done) return;
      done = true; clearTimeout(timer);
      try { if (id !== null) ts.remove(id); } catch { /* gone */ }
      L.close({ animate: false });
      fn(v);
    };
    const timer = setTimeout(() => finish(reject, fail("The safety check took too long. Please try again.")), 90000);
    try {
      id = ts.render(box, {
        sitekey: TURNSTILE_SITE_KEY, appearance: "interaction-only", theme: "dark", action: "play",
        callback: (token) => finish(resolve, token),
        "error-callback": () => { finish(reject, fail("The safety check did not work. Please try again.")); return true; },
        "expired-callback": () => finish(reject, fail("The safety check ran out of time. Please try again.")),
        "before-interactive-callback": () => box.classList.add("ask"),
      });
    } catch { finish(reject, fail("The safety check could not start.")); }
  });
}

// ---------- the guest pass ----------
// Makes sure this device has a working guest for the age band. Resolves with { guest, me } (me from GET /me, or null
// for a brand new guest). A stored guest that the server no longer knows (401) is replaced; so is one whose band is
// older than the age gate's answer (the youngest answer wins, like the gate itself).
export async function ensureGuest(band) {
  const g = guest();
  if (g && BANDS.indexOf(band) >= BANDS.indexOf(g.band)) {
    try { return { guest: g, me: await call("GET", "/me") }; }
    catch (e) { if (!(e instanceof ApiError && e.status === 401)) throw e; }
  }
  forgetGuest();
  const r = await call("POST", "/guest", { band, turnstile: await turnstileToken(), device: device() }, { auth: false });
  const fresh = { gid: r.gid, secret: r.secret, band: r.band };
  write(GUEST_KEY, fresh);
  return { guest: fresh, me: null };
}

// ---------- the room socket ----------
// Close codes that end the visit (PROTOCOL 4.4); every other close is a drop and may be retried.
export const FINAL = new Set([4000, 4001, 4002, 4003, 4004, 4005, 4006, 4007, 4008, 4009, 4010, 4011, 4012]);
const INFO = ["err", "closed", "kicked", "version", "sanction"];

// new RoomLink(code, { hello() -> object, onMessage(m), onDrop(code), onEnd(code, info) })
//   open() -> Promise<welcome>: one connection; rejects with { code, info, network } if it closes before the welcome.
//   After the welcome a close calls onEnd for the final codes, onDrop for the rest.
//   send(obj) -> boolean, leave(), close()
export class RoomLink {
  constructor(code, handlers) { this.code = code; this.h = handlers; this.ws = null; this.info = null; this.ended = false; this.live = false; this.pinger = 0; }
  get url() { return API_BASE.replace(/^http/, "ws") + "/ws/" + this.code; }
  open() {
    return new Promise((resolve, reject) => {
      if (this.ended) return reject({ code: 4012, info: null, network: false });
      let ws, opened = false, welcomed = false;
      try { ws = new WebSocket(this.url); } catch { noteFail(); return reject({ code: 1006, info: null, network: true }); }
      const old = this.ws;
      this.ws = ws; this.info = null;
      if (old && old.readyState < 2) { try { old.close(1000); } catch { /* closed */ } }
      ws.onopen = () => { opened = true; try { ws.send(JSON.stringify(this.h.hello())); } catch { /* closing */ } };
      ws.onmessage = (e) => {
        if (ws !== this.ws) return;
        if (e.data === "pong") return;
        let m;
        try { m = JSON.parse(e.data); } catch { return; }
        if (!m || typeof m.t !== "string") return;
        if (INFO.includes(m.t)) this.info = m;
        if (m.t === "welcome") { welcomed = true; this.live = true; this.ping(ws); reached(); }
        try { this.h.onMessage(m); } catch (err) { console.error(err); }
        if (m.t === "welcome") resolve(m);
      };
      ws.onerror = () => {};
      ws.onclose = (e) => {
        if (ws !== this.ws) return;
        clearInterval(this.pinger); this.live = false;
        const code = e.code || 1006;
        if (!opened && !this.ended) noteFail();
        if (!welcomed) return reject({ code, info: this.info, network: !opened });
        if (this.ended || FINAL.has(code)) { this.ended = true; this.h.onEnd(code, this.info); }
        else this.h.onDrop(code);
      };
    });
  }
  // The keepalive: a plain text "ping" every 25 s, answered with "pong" without waking the room.
  ping(ws) { clearInterval(this.pinger); this.pinger = setInterval(() => { if (ws.readyState === 1) ws.send("ping"); }, 25000); }
  send(obj) { const ws = this.ws; if (!ws || ws.readyState !== 1) return false; ws.send(JSON.stringify(obj)); return true; }
  // Leave for good: the server answers closed {reason: "left"} and 4012. If the socket is already gone, end now.
  leave() {
    const sent = this.send({ t: "leave" });
    this.ended = true;
    const ws = this.ws;
    if (!sent) { this.close(); return; }
    setTimeout(() => { if (ws.readyState < 2) try { ws.close(1000); } catch { /* closed */ } }, 1500);
  }
  close() { this.ended = true; clearInterval(this.pinger); const ws = this.ws; this.ws = null; if (ws && ws.readyState < 2) { try { ws.close(1000); } catch { /* closed */ } } }
}
