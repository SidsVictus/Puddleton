// Connection and status screens: connecting, connection interrupted (over the live game, which stays visible),
// room not found, new version available, under maintenance, offline, and the island is full.
// Only one of each kind is open at a time; opening one again replaces it. closeAll() clears them all.
import { layer, esc, nextId, uiIcon, icon, asset, bean, pic, BEAN_COLORS, nextUtcMidnight, fmtClock, fmtCountdown } from "./base.mjs";

const live = new Map();   // kind -> handle with close()
// The "no signal" icon is shown when the network is gone, so both looks of it are read once now, while it is still
// here, and used from memory as data URLs (an <img> made later with its plain URL would fail offline).
const kept = {};
const noSignal = () => kept[icon("nosignal")] || icon("nosignal");
if (typeof fetch === "function") for (const q of ["high", "low"]) {
  const u = icon("nosignal", q);
  fetch(u).then((r) => (r.ok ? r.text() : null)).then((t) => { if (t) kept[u] = "data:image/svg+xml," + encodeURIComponent(t); }).catch(() => {});
}
const K = "#1c1330";
function track(kind, h) { live.get(kind)?.close(); live.set(kind, h); return h; }
const untrack = (kind, h) => { if (live.get(kind) === h) live.delete(kind); };
export function closeAll() { for (const h of [...live.values()]) h.close(); }

// ---------- little pixel pieces ----------
// Each is a pic() from base.mjs, drawn in both picture looks. The rowboat's art pixel is 5 CSS px and the island
// scene's (--sp) about 5 too, so Low splits each in two (k = 2) to stay near the shared 3px pixel.
function rowboat() {
  const rower = pic().bean(BEAN_COLORS[1], { x: 10, y: 5 });
  const hull = pic().put(["####################", "#wwwwwwwwwwwwwwwwww#", ".#bbbbbbbbbbbbbbbb#.", "..################.."], { "#": K, w: "#a8703f", b: "#6b4326" }, 6, 12);
  const oarA = pic().put(["o.....", ".o....", "..o...", "...o..", "....oo"], { o: "#c9a46a" }, 16, 9);
  const oarB = pic().put(["o....", ".o...", ".o...", "..o..", "..ooo"], { o: "#c9a46a" }, 16, 9);
  const waves = pic().put(["..ww....ww....ww....ww....ww....ww....ww..", "wwddwwwwddwwwwddwwwwddwwwwddwwwwddwwwwddww", "dddddddddddddddddddddddddddddddddddddddddd"], { w: "#7a6ad0", d: "#3a2f80" }, -6, 14);
  return `<svg class="scr-rowboat" viewBox="0 0 32 17" width="160" height="85" aria-hidden="true">
    <g class="scr-bob">${rower.art(2)}${hull.art(2)}<g class="scr-oar-a">${oarA.art(2)}</g><g class="scr-oar-b">${oarB.art(2)}</g></g>
    <g class="scr-waves">${waves.art(2)}</g></svg>`;
}

const SCENE_K = 1.5;   // Low: art pixels per island-scene pixel, so they come out the size of scenes/low/dock.svg's (480 x 270)
const GLYPH = { F: ["###", "#..", "##.", "#..", "#.."], U: ["#.#", "#.#", "#.#", "#.#", "###"], L: ["#..", "#..", "#..", "#..", "###"] };
function sign(word = "FULL") {
  const post = pic().box(2, 0, 4, 34, K).box(3, 1, 2, 33, "#8a5a34").box(3, 1, 1, 33, "#a8703f").box(2, 1, 21, 3, K).box(3, 2, 19, 1, "#a8703f");
  const board = pic().box(8, 4, 1, 3, "#c9a46a").box(18, 4, 1, 3, "#c9a46a").box(4, 7, 19, 10, K).box(5, 8, 17, 8, "#fff1cf").box(5, 15, 17, 1, "#e6d3a8");
  let x = 6;
  for (const ch of word) { board.put(GLYPH[ch], { "#": "#e8384f" }, x, 9); x += 4; }
  return `<svg class="scr-full-sign" viewBox="0 0 24 34" aria-hidden="true">${post.art(SCENE_K)}<g class="scr-swing">${board.art(SCENE_K)}</g></svg>`;
}

// The ferry, crammed with beans: on the deck, on the roof, at every window, one even peeking out of the funnel.
function ferry() {
  const p = pic(), R = (x, y, w, h, c) => p.box(x, y, w, h, c);
  const C = BEAN_COLORS;
  // the funnel (a bean has squeezed in) and the cabin roof
  p.bean(C[2], { x: 32, y: -8 });
  R(30, -4, 11, 1, K); R(31, -3, 9, 1, "#ffc45a"); R(30, -3, 1, 1, K); R(40, -3, 1, 1, K);
  R(31, -2, 9, 9, K); R(32, -2, 7, 9, "#ffc45a"); R(32, 0, 7, 2, "#3a2756"); R(37, -2, 2, 9, "#c98a2a"); R(37, 0, 2, 2, "#2a1c42");
  p.bean(C[4], { x: 14, y: -1 }); p.bean(C[6], { x: 21, y: -1, flip: true });
  R(11, 7, 37, 3, K); R(12, 8, 35, 1, "#3a2756");
  // cabin with three windows, a face in each
  R(13, 10, 33, 9, K); R(14, 10, 31, 9, "#fff1cf"); R(42, 10, 3, 9, "#e6d3a8");
  [[16, C[0]], [26, C[3]], [36, C[5]]].forEach(([wx, c]) => {
    R(wx, 12, 7, 5, K); R(wx + 1, 13, 5, 3, "#6fe3cf");
    R(wx + 2, 13, 3, 1, c); R(wx + 1, 14, 5, 2, c); R(wx + 2, 14, 1, 1, K); R(wx + 4, 14, 1, 1, K);
  });
  // beans on the bow and the stern, a flag
  p.bean(C[7], { x: 1, y: 11 }); p.bean(C[1], { x: 6, y: 11 }); p.bean(C[3], { x: 46, y: 11, flip: true }); p.bean(C[0], { x: 51, y: 11, flip: true });
  R(57, 4, 1, 15, K); R(58, 4, 4, 3, "#ff6b9a"); R(58, 7, 2, 1, "#ff6b9a");
  // the hull
  const rows = { 20: "#ff8aa3", 21: "#e05a75", 22: "#fff1cf", 23: "#e05a75", 24: "#c8445f", 25: "#c8445f", 26: "#8a2a45", 27: "#8a2a45", 28: "#8a2a45" };
  R(0, 19, 62, 1, K);
  for (let y = 20; y <= 29; y++) {
    const i = Math.max(0, y - 24), x0 = 1 + i, w = 60 - 2 * i;
    if (y === 29) { R(x0 - 1, y, w + 2, 1, K); continue; }
    R(x0 - 1, y, 1, 1, K); R(x0 + w, y, 1, 1, K); R(x0, y, w, 1, rows[y]);
  }
  R(7, 22, 3, 3, "#fff1cf"); R(8, 23, 1, 1, "#c8445f"); R(7, 22, 1, 1, "#ff6b9a"); R(9, 24, 1, 1, "#ff6b9a");   // life ring
  const waves = pic().put(["..ww......ww......ww......ww......ww......ww......ww......ww..", "wwddww..wwddww..wwddww..wwddww..wwddww..wwddww..wwddww..wwddww", "dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd"],
    { w: "#7a4a9a", d: "#432470" }, -2, 29);
  return `<svg class="scr-full-ferry" viewBox="0 -9 62 41" aria-hidden="true"><g class="scr-bob">${p.art(SCENE_K)}</g><g class="scr-waves">${waves.art(SCENE_K)}</g></svg>`;
}

function queue(n = 5) {
  let g = "";
  for (let i = 0; i < n; i++) {
    g += `<g class="scr-q" style="--i:${i}">${pic().bean(BEAN_COLORS[(i * 3 + 2) % 8], { x: i * 8 }).art(SCENE_K)}</g>`;
    if (i === n - 1 || i === 1) g += pic().put([".##.", "#cc#", "#cc#"], { "#": K, c: "#a8703f" }, i * 8 + 6, 5).art(SCENE_K);   // suitcases
  }
  return `<svg class="scr-full-queue" viewBox="0 0 ${n * 8 + 3} 8" aria-hidden="true">${g}</svg>`;
}

// ---------- the screens ----------

// connecting({ label = "Connecting", detail, onCancel, settings }) -> { update(label?, detail?), close() }
export function connecting({ label = "Connecting", detail = "Rowing over to the room.", onCancel, settings } = {}) {
  const tid = nextId("ov");
  const L = layer({ cls: "scr-ov scr-veil scr-connecting", labelledby: tid, role: "alertdialog", settings, escape: onCancel ? () => { h.close(); onCancel(); } : null });
  L.el.setAttribute("aria-busy", "true");
  L.el.innerHTML = `<div class="scr-dialog scr-plate scr-ov-card">${rowboat()}
      <h2 class="scr-title" id="${tid}"><span data-label>${esc(label)}</span><span class="scr-dots" aria-hidden="true"><i></i><i></i><i></i></span></h2>
      <p class="scr-lede" data-detail>${esc(detail)}</p>
      ${onCancel ? `<div class="scr-actions"><button class="scr-btn dark" data-cancel>Cancel</button></div>` : ""}</div>`;
  const h = {
    update(l, d) { if (l) L.$("[data-label]").textContent = l; if (d != null) L.$("[data-detail]").textContent = d; },
    close() { untrack("connecting", h); L.close(); },
  };
  L.$("[data-cancel]")?.addEventListener("click", () => { h.close(); onCancel(); });
  if (onCancel) L.focus(L.$("[data-cancel]"));
  return track("connecting", h);
}

// reconnecting({ seconds = 5, attempt = 1, maxSeconds = 30, delays, onRetry(attempt) -> Promise<boolean>, onLeave, settings })
//   -> { close(), retry(), done: Promise<"reconnected" | "left" | "closed"> }
// delays: an optional list of waits in seconds, one per attempt (the last one repeats), instead of growing by 1.6.
// A band across the top of the live game: the game stays in view (frozen and dimmed) while it counts down.
// At zero it calls onRetry; true closes the band, anything else waits longer and counts down again.
// Without onRetry it just keeps counting; close() it yourself when the connection is back.
export function reconnecting({ seconds = 5, attempt = 1, maxSeconds = 30, delays = null, onRetry, onLeave, settings } = {}) {
  const tid = nextId("ov");
  const L = layer({ cls: "scr-ov scr-reconnect", labelledby: tid, role: "alertdialog", settings });
  L.el.innerHTML = `<div class="scr-rc-band">
      <img class="scr-rc-ic" src="${noSignal()}" alt="">
      <div class="scr-rc-text"><b id="${tid}">Connection interrupted</b><span data-status aria-live="polite"></span></div>
      <div class="scr-rc-act"><button class="scr-btn small" data-retry>Retry now</button>${onLeave ? `<button class="scr-btn small dark" data-leave>Leave</button>` : ""}</div>
    </div>`;
  const planned = (k) => delays?.length ? delays[Math.min(k, delays.length) - 1] : null;
  let wait = planned(attempt) ?? seconds, left = wait, n = attempt, busy = false, timer = 0, settle;
  const done = new Promise((r) => (settle = r));
  const status = (t) => { L.$("[data-status]").textContent = t; };
  const finish = (why) => { clearInterval(timer); untrack("reconnecting", h); L.close(); settle(why); };
  const count = () => { status(`Reconnecting in ${left}`); if (left-- <= 0) retry(); };
  const start = () => { clearInterval(timer); left = wait; count(); timer = setInterval(count, 1000); };
  async function retry() {
    if (busy || L.closed) return;
    busy = true; clearInterval(timer); L.$("[data-retry]").disabled = true; L.el.classList.add("busy");
    status(n > 1 ? `Reconnecting, try ${n}` : "Reconnecting");
    let ok = false;
    try { ok = onRetry ? (await onRetry(n)) === true : false; } catch { ok = false; }
    if (L.closed) return;
    if (!onRetry) await new Promise((r) => setTimeout(r, 900));
    if (ok) return finish("reconnected");
    n++; wait = planned(n) ?? Math.min(maxSeconds, Math.round(wait * 1.6)); busy = false;
    L.$("[data-retry]").disabled = false; L.el.classList.remove("busy"); start();
  }
  L.$("[data-retry]").onclick = retry;
  L.$("[data-leave]")?.addEventListener("click", () => { finish("left"); onLeave(); });
  const h = { close: () => finish("closed"), retry, done };
  start(); L.focus(L.$("[data-retry]"));
  return track("reconnecting", h);
}

function card({ cls = "", art, eyebrow, title, text, actions, settings, escape, night = false }) {
  const tid = nextId("ov"), did = nextId("ov");
  const L = layer({ cls: `scr-ov ${night ? "scr-night" : "scr-veil"} ${cls}`, labelledby: tid, describedby: did, role: "alertdialog", settings, escape });
  L.el.innerHTML = `<div class="scr-dialog scr-plate scr-ov-card">${art || ""}
      ${eyebrow ? `<span class="scr-eyebrow">${esc(eyebrow)}</span>` : ""}<h2 class="scr-title" id="${tid}">${esc(title)}</h2>
      <div id="${did}">${text}</div><div class="scr-actions">${actions}</div></div>`;
  return L;
}

// roomNotFound({ code, settings }) -> Promise<"retry" | "back">
export function roomNotFound({ code = "", settings } = {}) {
  return new Promise((resolve) => {
    const L = card({ cls: "scr-notfound", settings, escape: () => done("back"),
      art: `<div class="scr-ov-art">${bean("#cdb4ff", { size: 5 })}<img class="scr-ov-q" src="${uiIcon("help")}" alt=""></div>`,
      eyebrow: code ? `Room ${code}` : "Hmm", title: "Room not found",
      text: `<p class="scr-lede">We looked all over the island${code ? ` for room <b>${esc(code)}</b>` : ""}. The game may have ended, or a letter in the code might be off.</p>`,
      actions: `<button class="scr-btn dark" data-v="back">Back</button><button class="scr-btn" data-v="retry">Try again</button>` });
    const h = { close: () => done("back") };
    const done = (v) => { untrack("notfound", h); L.close(); resolve(v); };
    L.el.addEventListener("click", (e) => { const v = e.target.closest("[data-v]")?.dataset.v; if (v) done(v); });
    track("notfound", h); L.focus(L.$('[data-v="retry"]'));
  });
}

// updateAvailable({ onRefresh = () => location.reload(), settings }) -> Promise<"refresh" | "later">
// A small banner at the bottom that never blocks the game.
export function updateAvailable({ onRefresh = () => location.reload(), settings } = {}) {
  return new Promise((resolve) => {
    const L = layer({ cls: "scr-ov scr-update", label: "New version available", modal: false, role: "status", settings, escape: () => done("later") });
    L.el.innerHTML = `<div class="scr-up-bar scr-plate gold">
        <button class="scr-up-go" data-v="refresh"><img src="${icon("refresh")}" alt=""><span><b>New version available</b><small>Tap to refresh</small></span></button>
        <button class="scr-tile scr-up-x" data-v="later" aria-label="Later"><img src="${uiIcon("close")}" alt=""></button></div>`;
    const h = { close: () => done("later") };
    const done = (v) => { untrack("update", h); L.close(); resolve(v); if (v === "refresh") onRefresh(); };
    L.el.addEventListener("click", (e) => { const v = e.target.closest("[data-v]")?.dataset.v; if (v) done(v); });
    track("update", h);
  });
}

// maintenance({ until: Date, message, settings }) -> Promise<"retry">
export function maintenance({ until = null, message = "We are giving the island a fresh coat of paint. It will not take long.", settings } = {}) {
  return new Promise((resolve) => {
    const when = until ? `<p class="scr-ov-when">Back around <b>${esc(fmtClock(until))}</b>, your time. <span data-left></span></p>` : "";
    const L = card({ cls: "scr-maint", night: true, settings,
      art: `<div class="scr-ov-art scr-maint-art">${bean("#ffd97a", { size: 4 })}<div class="scr-barrier" aria-hidden="true"><i></i></div>${bean("#8fe8d8", { size: 4, closed: true })}</div>`,
      eyebrow: "Back soon", title: "Under maintenance", text: `<p class="scr-lede">${esc(message)}</p>${when}`,
      actions: `<button class="scr-btn" data-v="retry">Try again</button>` });
    let t = 0;
    const tick = () => { const el = L.$("[data-left]"); if (el) el.textContent = until - Date.now() > 0 ? `(in ${fmtCountdown(until - Date.now())})` : ""; };
    if (until) { tick(); t = setInterval(tick, 1000); }
    const h = { close: () => done("retry") };
    const done = (v) => { clearInterval(t); untrack("maintenance", h); L.close(); resolve(v); };
    L.$("[data-v]").onclick = () => done("retry");
    track("maintenance", h); L.focus(L.$("[data-v]"));
  });
}

// offline({ settings }) -> { close(), done: Promise<"online" | "closed"> }  Closes by itself when the connection returns.
export function offline({ settings } = {}) {
  const L = card({ cls: "scr-offline", settings,
    art: `<img class="scr-ov-icon" src="${noSignal()}" alt="">`, eyebrow: "No connection", title: "You are offline",
    text: `<p class="scr-lede">Check your Wi-Fi or mobile data. We will pick up where you left off as soon as you are back.</p><p class="scr-ov-note" role="status"></p>`,
    actions: `<button class="scr-btn" data-v="retry">Try again</button>` });
  let settle;
  const done = new Promise((r) => (settle = r));
  const finish = (why) => { removeEventListener("online", back); untrack("offline", h); L.close(); settle(why); };
  const back = () => finish("online");
  addEventListener("online", back);
  L.$("[data-v]").onclick = () => { if (navigator.onLine) finish("online"); else L.$(".scr-ov-note").textContent = "Still offline. We will keep listening for your connection."; };
  const h = { close: () => finish("closed"), done };
  L.focus(L.$("[data-v]"));
  return track("offline", h);
}

// islandFull({ resetAt = next 00:00 UTC, settings }) -> Promise<"retry" | "back">
// Not "server full": the ferry to Puddleton is packed. Shows when the island reopens in the player's own time,
// with a live countdown, over the dock at sunset with a crowded ferry and beans queueing by a swinging FULL sign.
export function islandFull({ resetAt = nextUtcMidnight(), settings } = {}) {
  return new Promise((resolve) => {
    const tid = nextId("ov"), did = nextId("ov");
    const tomorrow = new Date(resetAt).toDateString() !== new Date().toDateString();
    const L = layer({ cls: "scr-ov scr-full", labelledby: tid, describedby: did, role: "alertdialog", settings, escape: () => done("back") });
    L.el.innerHTML = `<div class="scr-full-art" aria-hidden="true">${ferry()}<div class="scr-full-pier">${queue(5)}${sign()}</div></div>
      <div class="scr-dialog scr-plate scr-full-card">
        <span class="scr-eyebrow amber">Ferry service</span>
        <h2 class="scr-title" id="${tid}">The ferry to Puddleton is packed!</h2>
        <div id="${did}"><p class="scr-lede">So many beans want to play today that the island is full. The next ferry leaves at
          <b>${esc(fmtClock(resetAt))}${tomorrow ? " tomorrow" : ""}</b>, your time.</p>
        <p class="scr-full-count"><span>Next ferry in</span><b data-left>${fmtCountdown(resetAt - Date.now())}</b></p></div>
        <div class="scr-actions"><button class="scr-btn dark" data-v="back">Back</button><button class="scr-btn" data-v="retry">Try again</button></div>
      </div>`;
    const tick = () => {
      const ms = resetAt - Date.now(), el = L.$("[data-left]");
      el.textContent = ms > 0 ? fmtCountdown(ms) : "Boarding now";
      if (ms <= 0) { L.el.classList.add("open"); clearInterval(t); }
    };
    const t = setInterval(tick, 1000); tick();
    const h = { close: () => done("back") };
    const done = (v) => { clearInterval(t); untrack("full", h); L.close(); resolve(v); };
    L.el.addEventListener("click", (e) => { const v = e.target.closest("[data-v]")?.dataset.v; if (v) done(v); });
    track("full", h); L.focus(L.$('[data-v="retry"]'));
  });
}
