// Shared helpers for the Puddleton screens: layers with focus and Escape handling, radio groups,
// motion checks, role names, time formatting and a tiny pixel bean drawn as SVG.
import { getSettings } from "./prefs.mjs";
import { quality as artQuality, onQuality as onArtQuality } from "../quality.mjs";
import * as picture from "../quality.mjs";   // uiIcon() and icon() hand out the set for the current picture quality

const url = (p) => new URL(p, import.meta.url).href;
export const asset = url;                                   // a path relative to screens/
// Icons come in two looks (tools/ui.py, icons/draw.py): smooth vector art, and its chunky pixel twin in a low/ folder
// for Low picture quality. q forces one look ("high" or "low"); left out, the current picture quality picks.
// sm is for an icon drawn at 16px or less: Low then hands out its 8 x 8 twin in low/sm/ so the art pixels stay 2px big
// (only the names in SMALL have one; SM_FIX in the two generators). Mark such an <img> data-sm so a live switch keeps it small.
const SMALL = new Set(["crown", "skull", "clock", "book", "lock", "chevron", "refresh"]);
const iconSet = (q, name, sm) => ((q || picture.quality()) !== "low" ? "" : sm && SMALL.has(name) ? "low/sm/" : "low/");
export const uiIcon = (name, q, sm) => url(name === "lock" && !iconSet(q) ? "../lock.svg" : `../ui/${iconSet(q, name, sm)}${name}.svg`);   // the game's own icon set, and the lock badge
export const icon = (name, q, sm) => url(`icons/${iconSet(q, name, sm)}${name}.svg`);     // icons drawn for the screens (icons/draw.py)
// A change of picture quality swaps the icons already on screen (<img> tags and inline backgrounds) to the other set.
const ICON_PATH = /(^|\/)(ui\/|icons\/)?(?:low\/)?(?:sm\/)?([\w-]+)\.svg/;
const twin = (s, q, sm) => s.replace(ICON_PATH, (m, pre, dir, name) => {
  const set = iconSet(q, name, sm);
  return name === "lock" ? `${pre}${set && "ui/" + set}lock.svg` : dir ? `${pre}${dir}${set}${name}.svg` : m;
});
function swapIcons(q) {
  for (const img of document.images) { const s = img.getAttribute("src"), t = s && twin(s, q, img.hasAttribute("data-sm")); if (t !== s) img.setAttribute("src", t); }
  for (const el of document.querySelectorAll('[style*=".svg"]')) { const s = el.style.backgroundImage, t = twin(s, q, el.hasAttribute("data-sm")); if (t !== s) el.style.backgroundImage = t; }
}
if (typeof document !== "undefined") { picture.onQuality(swapIcons); if (picture.quality() === "low") swapIcons("low"); }
export const brand = (name) => url(`../brand/${name}`);
export const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let uid = 0;
export const nextId = (p = "scr") => `${p}-${++uid}`;

// True when motion should be kept to a minimum: the player's setting or the system preference.
export function calm(settings) {
  const s = settings || getSettings();
  return !!s?.display?.reduceMotion || (typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches);
}

// ---------- layers ----------
// Every screen lives in one fixed layer on <body>. Layers stack: the top modal layer takes all input
// (everything beneath it is made inert), Escape goes to the topmost layer that handles it, Tab wraps inside.
const stack = [];
const inerted = new Set();
const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
export const focusables = (el) => [...el.querySelectorAll(FOCUSABLE)].filter((n) => !n.closest("[hidden], [inert]") && n.getClientRects().length);

function topModal() { for (let i = stack.length - 1; i >= 0; i--) if (stack[i].modal) return i; return -1; }

function refresh() {
  for (const el of inerted) el.inert = false;
  inerted.clear();
  const t = topModal();
  if (t >= 0) {
    const keep = new Set(stack.slice(t).map((e) => e.el));
    for (const child of document.body.children) {
      if (keep.has(child) || child.inert || child.tagName === "SCRIPT" || child.tagName === "STYLE") continue;
      child.inert = true; inerted.add(child);
    }
  }
  document.documentElement.classList.toggle("scr-locked", t >= 0);
}

if (typeof document !== "undefined") {
  document.addEventListener("keydown", (e) => {
    if (!stack.length) return;
    const t = topModal();
    if (e.key === "Escape") {
      for (let i = stack.length - 1; i >= Math.max(t, 0); i--) {
        if (stack[i].escape) { e.preventDefault(); e.stopPropagation(); stack[i].escape(e); return; }
      }
    } else if (e.key === "Tab" && t >= 0) {
      const box = stack[t].el, list = focusables(box);
      if (!list.length) { e.preventDefault(); return; }
      const first = list[0], last = list[list.length - 1], a = document.activeElement;
      if (e.shiftKey && (a === first || !box.contains(a))) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && (a === last || !box.contains(a))) { e.preventDefault(); first.focus(); }
    }
  }, true);
}

// layer({ cls, label, labelledby, describedby, modal = true, escape, settings, role })
// Returns { el, $, $$, focus(node?), close({ animate }) , closed }. close() resolves after the exit fade.
export function layer({ cls = "", label, labelledby, describedby, modal = true, escape = null, settings, role } = {}) {
  const el = document.createElement("div");
  el.className = `scr-layer ${cls}`.trim();
  if (role !== null) el.setAttribute("role", role || (modal ? "dialog" : "region"));
  if (modal) el.setAttribute("aria-modal", "true");
  if (label) el.setAttribute("aria-label", label);
  if (labelledby) el.setAttribute("aria-labelledby", labelledby);
  if (describedby) el.setAttribute("aria-describedby", describedby);
  if (calm(settings)) el.classList.add("scr-calm");
  const entry = { el, modal, escape, back: document.activeElement };
  document.body.append(el); stack.push(entry); refresh();
  let closed = false;
  const api = {
    el,
    $: (s) => el.querySelector(s),
    $$: (s) => [...el.querySelectorAll(s)],
    focus(node) { const n = node || el.querySelector("[autofocus]") || focusables(el)[0]; n?.focus({ preventScroll: true }); },
    setEscape(fn) { entry.escape = fn; },
    get closed() { return closed; },
    async close({ animate = true } = {}) {
      if (closed) return; closed = true;
      const i = stack.indexOf(entry); if (i >= 0) stack.splice(i, 1);
      refresh();
      if (animate && !el.classList.contains("scr-calm")) { el.classList.add("scr-out"); await sleep(200); }
      const hadFocus = el.contains(document.activeElement);
      el.remove();
      const a = document.activeElement;
      if (modal && entry.back?.isConnected && (hadFocus || !a || a === document.body)) entry.back.focus?.({ preventScroll: true });
    },
  };
  return api;
}

// ---------- radio groups: role="radio" buttons inside a container; arrows move and pick ----------
export function radios(group, onPick) {
  const items = () => [...group.querySelectorAll('[role="radio"]')].filter((b) => !b.disabled && !b.hidden);
  const set = (btn, focus, fire = true) => {
    for (const b of group.querySelectorAll('[role="radio"]')) { const on = b === btn; b.setAttribute("aria-checked", String(on)); b.tabIndex = on ? 0 : -1; }
    if (focus) btn.focus();
    if (fire) onPick?.(btn.dataset.value, btn);
  };
  group.addEventListener("click", (e) => { const b = e.target.closest('[role="radio"]'); if (b && !b.disabled && group.contains(b)) set(b, false); });
  group.addEventListener("keydown", (e) => {
    const list = items(), i = list.indexOf(document.activeElement);
    if (i < 0) return;
    const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key];
    if (step) { e.preventDefault(); set(list[(i + step + list.length) % list.length], true); }
    else if (e.key === "Home") { e.preventDefault(); set(list[0], true); }
    else if (e.key === "End") { e.preventDefault(); set(list[list.length - 1], true); }
  });
  const on = group.querySelector('[role="radio"][aria-checked="true"]');
  const all = group.querySelectorAll('[role="radio"]');
  all.forEach((b, i) => { b.tabIndex = on ? (b === on ? 0 : -1) : i === 0 ? 0 : -1; });
  return { set: (value) => { const b = group.querySelector(`[role="radio"][data-value="${CSS.escape(value)}"]`); if (b) set(b, false, false); } };
}

// ---------- the cast ----------
// In the order the end credits use.
export const ROLES = {
  godfather: { name: "Godfather", side: "mafia" }, angel: { name: "Angel", side: "town" }, mafia: { name: "Mafia", side: "mafia" },
  framer: { name: "Framer", side: "mafia" }, detective: { name: "Detective", side: "town" }, vigilante: { name: "Vigilante", side: "town" },
  mayor: { name: "Mayor", side: "town" }, serialkiller: { name: "Serial Killer", side: "solo" }, jester: { name: "Jester", side: "solo" },
  villager: { name: "Villager", side: "town" },
};
export const MODES = {
  classic: { name: "Classic", blurb: "Five roles, the timeless game" }, crazy: { name: "Crazy", blurb: "All ten roles, chaos guaranteed" },
  gore: { name: "Gore", blurb: "Classic roles, cartoon-gruesome tales" }, speed: { name: "Speed", blurb: "Classic roles, lightning timers" },
};
export const roleName = (r) => ROLES[r]?.name || "Unknown";
export const BEAN_COLORS = ["#ff9db5", "#8fd6ff", "#ffd97a", "#a5ecb0", "#cdb4ff", "#ffb98a", "#8fe8d8", "#f3a0f7"];

// ---------- time ----------
export function nextUtcMidnight(now = new Date()) { return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1)); }
export const fmtClock = (d) => new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" }).format(d);
export const fmtDay = (d) => new Intl.DateTimeFormat(undefined, { weekday: "long", day: "numeric", month: "long" }).format(d);
export function fmtCountdown(ms) {
  const s = Math.max(0, Math.ceil(ms / 1000)), h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = s % 60;
  const p = (n) => String(n).padStart(2, "0");
  return h ? `${h}:${p(m)}:${p(x)}` : `${p(m)}:${p(x)}`;
}
// "about 3 hours", "12 minutes", "2 days": a friendly length of time
export function fmtSpan(ms) {
  const m = Math.max(1, Math.round(ms / 60000));
  if (m < 60) return `${m} minute${m === 1 ? "" : "s"}`;
  const h = Math.round(m / 60);
  if (h < 48) return `${h} hour${h === 1 ? "" : "s"}`;
  const d = Math.round(h / 24);
  return `${d} day${d === 1 ? "" : "s"}`;
}

// ---------- drawn art, in both picture looks (../quality.mjs) ----------
// Low draws crisp square pixels about 3 CSS px wide wherever the art appears; High draws smooth anti-aliased
// shapes in the same palette, like the 3D beans. Sizes are the same in both, so nothing moves when the look changes.
const INK = "#1c1330";
function mix(hex, to, t) {
  const a = parseInt(hex.slice(1), 16), b = parseInt(to.slice(1), 16);
  const c = [16, 8, 0].map((s) => Math.round(((a >> s) & 255) * (1 - t) + ((b >> s) & 255) * t));
  return "#" + c.map((v) => v.toString(16).padStart(2, "0")).join("");
}
const toGrid = (rows, pal) => rows.map((row) => [...row].map((c) => pal[c] || null));
// EPX (Scale2x): doubles a pixel grid and rounds off its stair steps, so art drawn with big pixels can be shown
// with pixels half the size. A grid is rows of colours, null where empty.
function epx(g) {
  const h = g.length, w = g[0].length, at = (x, y) => (x < 0 || y < 0 || x >= w || y >= h ? null : g[y][x]);
  const out = Array.from({ length: h * 2 }, () => new Array(w * 2));
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const p = g[y][x], a = at(x, y - 1), b = at(x + 1, y), c = at(x - 1, y), d = at(x, y + 1);
    out[2 * y][2 * x] = c === a && c !== d && a !== b ? a : p;
    out[2 * y][2 * x + 1] = a === b && a !== c && b !== d ? b : p;
    out[2 * y + 1][2 * x] = d === c && d !== b && c !== a ? c : p;
    out[2 * y + 1][2 * x + 1] = b === d && b !== a && d !== c ? d : p;
  }
  return out;
}
// 1.5 times as many pixels: Scale3x (EPX's three-way sibling), then every other sub-pixel's centre.
function epx3half(g) {
  const h = g.length, w = g[0].length, at = (x, y) => (x < 0 || y < 0 || x >= w || y >= h ? null : g[y][x]);
  const s = Array.from({ length: h * 3 }, () => new Array(w * 3));
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const [A, B, C, D, E, F, G, H, I] = [-1, 0, 1].flatMap((j) => [-1, 0, 1].map((i) => at(x + i, y + j)));
    const nw = D === B && D !== H && B !== F, ne = B === F && B !== D && F !== H, sw = D === H && D !== B && H !== F, se = H === F && D !== H && B !== F;
    [[nw ? D : E, (nw && E !== C) || (ne && E !== A) ? B : E, ne ? F : E],
      [(nw && E !== G) || (sw && E !== A) ? D : E, E, (ne && E !== I) || (se && E !== C) ? F : E],
      [sw ? D : E, (sw && E !== I) || (se && E !== G) ? H : E, se ? F : E]].forEach((row, j) => row.forEach((c, i) => { s[3 * y + j][3 * x + i] = c; }));
  }
  return Array.from({ length: Math.floor(h * 1.5) }, (_, j) => Array.from({ length: Math.floor(w * 1.5) }, (_, i) => s[2 * j + 1][2 * i + 1]));
}
// Low: one path per colour, made of horizontal runs.
function squares(g) {
  const runs = {};
  g.forEach((row, y) => {
    for (let x = 0; x < row.length;) {
      const c = row[x]; let n = 1;
      while (x + n < row.length && row[x + n] === c) n++;
      if (c) (runs[c] ||= []).push(`M${x} ${y}h${n}v1h-${n}z`);
      x += n;
    }
  });
  return Object.entries(runs).map(([f, d]) => `<path fill="${f}" d="${d.join("")}"/>`).join("");
}
// High: each colour's outline traced from the pixels, every corner rounded by a curve through the middle of its edges
// (at most r pixels from the corner), so stair steps become slopes and curves. Outlines go first and each shape
// laps a hair over its neighbours, so no seam shows between colours.
function smooth(g, r = 1) {
  const h = g.length, w = g[0].length, f = (v) => +v.toFixed(2);
  const colors = [...new Set(g.flat().filter(Boolean))].sort((a, b) => (b === INK) - (a === INK));
  return colors.map((c) => {
    const inside = (x, y) => x >= 0 && y >= 0 && x < w && y < h && g[y][x] === c;
    const from = new Map(), add = (x0, y0, x1, y1) => { const k = x0 + "," + y0; if (!from.has(k)) from.set(k, []); from.get(k).push([x0, y0, x1, y1]); };
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {   // clockwise edges, the colour on their right
      if (g[y][x] !== c) continue;
      if (!inside(x, y - 1)) add(x, y, x + 1, y);
      if (!inside(x + 1, y)) add(x + 1, y, x + 1, y + 1);
      if (!inside(x, y + 1)) add(x + 1, y + 1, x, y + 1);
      if (!inside(x - 1, y)) add(x, y + 1, x, y);
    }
    let d = "";
    for (const list of from.values()) while (list.length) {
      let e = list.pop();
      const sx = e[0], sy = e[1], pts = [];
      for (;;) {
        pts.push([e[0], e[1]]);
        if (e[2] === sx && e[3] === sy) break;
        const next = from.get(e[2] + "," + e[3]), dx = e[2] - e[0], dy = e[3] - e[1];
        const i = next.findIndex((n) => n[2] - n[0] === dy && n[3] - n[1] === -dx);   // where two pixels touch corners, turn left: a one-pixel diagonal stays one line
        e = next.splice(Math.max(0, i), 1)[0];
      }
      const n0 = pts.length, poly = pts.filter((p, i) => {
        const a = pts[(i + n0 - 1) % n0], b = pts[(i + 1) % n0];
        return (p[0] - a[0]) * (b[1] - p[1]) !== (p[1] - a[1]) * (b[0] - p[0]);
      });
      const n = poly.length, at = (i) => poly[(i + n) % n], len = (p, q) => Math.hypot(q[0] - p[0], q[1] - p[1]);
      const toward = (p, q) => { const t = Math.min(0.5, r / len(p, q)); return `${f(p[0] + (q[0] - p[0]) * t)} ${f(p[1] + (q[1] - p[1]) * t)}`; };
      const turn = (i) => Math.sign((at(i)[0] - at(i - 1)[0]) * (at(i + 1)[1] - at(i)[1]) - (at(i)[1] - at(i - 1)[1]) * (at(i + 1)[0] - at(i)[0]));
      poly.forEach((v, i) => {   // a one-pixel stair step is cut straight (a clean slope); any other corner is rounded
        const step = len(at(i - 1), v) === 1 && len(v, at(i + 1)) === 1 && (turn(i - 1) !== turn(i) || turn(i + 1) !== turn(i));
        d += `${i ? "L" : "M"}${toward(v, at(i - 1))}${step ? "L" : `Q${v[0]} ${v[1]} `}${toward(v, at(i + 1))}`;
      });
      d += "Z";
    }
    return `<path fill="${c}" stroke="${c}" stroke-width=".3" stroke-linejoin="round" d="${d}"/>`;
  }).join("");
}
const rendering = (low) => `shape-rendering="${low ? "crispEdges" : "geometricPrecision"}"`;

// ---------- the bean ----------
// Low: the 14 x 16 sprite. Sizes 2 to 4 draw it as is (size 3 is the loading screen's bean, the Low reference);
// bigger beans split each sprite pixel with EPX so a drawn pixel stays near 3 CSS px.
const BEAN = [
  "....######....",
  "..##hhbbbb##..",
  ".#hhbbbbbbbb#.",
  ".#hbbbbbbbbs#.",
  "#hbbbbbbbbbbs#",
  "#hbbebbbbebbs#",
  "#bbbebbbbebbs#",
  "#bppbbbbbbpps#",
  "#bbbbbmmbbbbs#",
  "#bbbbbbbbbbss#",
  "#sbbbbbbbbbss#",
  ".#sbbbbbbbss#.",
  ".#ssssssssss#.",
  "..##########..",
  "..#kk#..#kk#..",
  "...##....##...",
];
const BLINK = { 5: "#hbbbbbbbbbbs#", 6: "#bbkkbbbbkkbs#" };
function beanLow(color, size, closed) {
  const pal = { "#": INK, e: INK, m: INK, k: mix(color, "#2a1a4a", 0.62), b: color, h: mix(color, "#ffffff", 0.45), s: mix(color, "#3a1f5a", 0.32), p: "#ff7fa6" };
  const k = size <= 4 ? 1 : size <= 8 ? 2 : 4;
  let g = toGrid(BEAN.map((row, y) => (closed && BLINK[y]) || row), pal);
  for (let s = 1; s < k; s *= 2) g = epx(g);
  return k === 1 ? squares(g) : `<g transform="scale(${1 / k})">${squares(g)}</g>`;
}
// High: the 3D bean (../world.mjs makeBean) laid on the same 14 x 16 box: a round body, flat toon bands lit from the
// top left (a light rim, the body colour, a shaded crescent low on the right), the same eyes, mouth and blush.
const ellipse = (cx, cy, rx, ry) => `M${+(cx - rx).toFixed(2)} ${cy}a${rx} ${ry} 0 1 0 ${2 * rx} 0a${rx} ${ry} 0 1 0 ${-2 * rx} 0z`;
function beanHigh(color, closed) {
  const id = nextId("bean"), body = 'cx="7" cy="7.1" rx="6.15" ry="6.75"';
  const eyes = closed ? '<rect x="3.55" y="6.3" width="1.9" height=".6" rx=".3"/><rect x="8.55" y="6.3" width="1.9" height=".6" rx=".3"/>'
    : '<rect x="3.8" y="4.8" width="1.4" height="2.2" rx=".4"/><rect x="8.8" y="4.8" width="1.4" height="2.2" rx=".4"/>';
  return `<defs><clipPath id="${id}"><ellipse ${body}/></clipPath></defs>`
    + `<g fill="${mix(color, INK, 0.72)}" stroke="${INK}" stroke-width=".6"><rect x="3" y="12.4" width="2.5" height="2.8" rx="1.1"/><rect x="8.5" y="12.4" width="2.5" height="2.8" rx="1.1"/></g>`
    + `<ellipse ${body} fill="${mix(color, "#3a1f5a", 0.24)}"/>`
    + `<g clip-path="url(#${id})"><ellipse cx="5.9" cy="5" rx="6.15" ry="6.75" fill="${color}"/><path fill="${mix(color, "#ffffff", 0.32)}" fill-rule="evenodd" d="${ellipse(7, 7.1, 6.15, 6.75)}${ellipse(7.45, 7.8, 6.15, 6.75)}"/></g>`
    + `<ellipse ${body} fill="none" stroke="${INK}" stroke-width=".7"/>`
    + `<g fill="${INK}">${eyes}<rect x="6.35" y="8" width="1.3" height=".55" rx=".27"/></g>`
    + '<g fill="#ff8fb0"><rect x="2.4" y="7.55" width="1.35" height=".75" rx=".37"/><rect x="10.25" y="7.55" width="1.35" height=".75" rx=".37"/></g>';
}
// bean(color, { size = 4 (CSS px per sprite pixel), closed = false, cls, title })
export function bean(color = BEAN_COLORS[0], { size = 4, closed = false, cls = "", title = "" } = {}) {
  const low = artQuality() === "low";
  return `<svg class="scr-bean ${cls}" viewBox="0 0 14 16" width="${14 * size}" height="${16 * size}" data-art="bean" data-c="${esc(color)}" data-z="${size}${closed ? " closed" : ""}" ${rendering(low)} ${title ? `role="img" aria-label="${esc(title)}"` : 'aria-hidden="true"'}>${low ? beanLow(color, size, closed) : beanHigh(color, closed)}</svg>`;
}

// ---------- the studio mark: a crescent moon on a 16 x 16 box ----------
// Low: a pixel crescent, each of the 16 cells split k ways so a drawn pixel stays near 3 CSS px. High: the same crescent,
// smooth: the disc (8, 8) r 7.6 less the disc (11.2, 5.6) r 6.4, which cross at (7.44, 0.42) and (15.12, 10.66).
function moonLow(size, color, shade) {
  const k = size <= 4 ? 1 : Math.round(size / 3), n = 16 * k, rim = 7.6 - 1.4 / k, g = [];
  for (let y = 0; y < n; y++) {
    const row = [];
    for (let x = 0; x < n; x++) {
      const u = (x + 0.5) / k, v = (y + 0.5) / k, dx = u - 8, dy = v - 8, ox = u - 11.2, oy = v - 5.6, r2 = dx * dx + dy * dy;
      row.push(r2 <= 7.6 * 7.6 && ox * ox + oy * oy > 6.4 * 6.4 ? (r2 > rim * rim || (u < 5 && v > 10) ? shade : color) : null);
    }
    g.push(row);
  }
  return k === 1 ? squares(g) : `<g transform="scale(${1 / k})">${squares(g)}</g>`;
}
const CRESCENT = "M7.44 .42A7.6 7.6 0 1 0 15.12 10.66A6.4 6.4 0 1 1 7.44 .42Z";
function moonHigh(color, shade) {
  const id = nextId("moon");
  return `<defs><clipPath id="${id}"><path d="${CRESCENT}"/></clipPath></defs><path fill="${shade}" d="${CRESCENT}"/><circle clip-path="url(#${id})" cx="8.7" cy="7.3" r="7.25" fill="${color}"/>`;
}
// moonMark(size = 4 (CSS px per 1/16 of the mark), color, shade)
export function moonMark(size = 4, color = "#fff1cf", shade = "#ecd9a2") {
  const low = artQuality() === "low";
  return `<svg class="scr-moon" viewBox="0 0 16 16" width="${16 * size}" height="${16 * size}" data-art="moon" data-z="${size}" data-c="${esc(color)}" data-s="${esc(shade)}" ${rendering(low)} aria-hidden="true">${low ? moonLow(size, color, shade) : moonHigh(color, shade)}</svg>`;
}

// A change of look redraws the beans and moons already on screen in place, so their animations keep running.
if (typeof addEventListener === "function") onArtQuality((q) => {
  const low = q === "low";
  for (const el of document.querySelectorAll("svg[data-art]")) {
    const [z, closed] = el.dataset.z.split(" "), c = el.dataset.c;
    el.setAttribute("shape-rendering", low ? "crispEdges" : "geometricPrecision");
    el.innerHTML = el.dataset.art === "moon" ? (low ? moonLow(+z, c, el.dataset.s) : moonHigh(c, el.dataset.s)) : low ? beanLow(c, +z, !!closed) : beanHigh(c, !!closed);
  }
});

// ---------- small pixel pictures for the screens' scenes ----------
// pic() paints a pixel picture: put(rows, pal, x, y) ("." or a missing key is empty), box(x, y, w, h, colour) and
// bean(colour, { x, y, flip }) (a 7 x 8 mini bean; flip faces it left), later paint covering earlier. art(k) draws it
// in both looks, and CSS shows the one in use (.art-lo, .art-hi): Low as square pixels with each art pixel split
// k ways by EPX (so scene-sized pixels come out near 3 CSS px); High as smooth shapes traced from the same pixels,
// with each mini bean drawn as the smooth bean at half size.
const MINI = ["..###..", ".#hbb#.", "#hbbbs#", "#bebes#", "#bbbbs#", "#sbbss#", ".#sss#.", "..k.k.."];
function gridOf(px) {   // a Map of "x,y" -> colour as a grid, with its top left corner
  const xy = [...px.keys()].map((p) => p.split(",").map(Number));
  const x0 = Math.min(...xy.map((p) => p[0])), y0 = Math.min(...xy.map((p) => p[1]));
  const w = Math.max(...xy.map((p) => p[0])) - x0 + 1, h = Math.max(...xy.map((p) => p[1])) - y0 + 1;
  return { x0, y0, g: Array.from({ length: h }, (_, j) => Array.from({ length: w }, (_, i) => px.get(`${x0 + i},${y0 + j}`) || null)) };
}
export function pic() {
  const ops = [];   // paint batches (Maps) and mini beans, in the order they were painted
  const batch = () => { let b = ops[ops.length - 1]; if (!(b instanceof Map)) ops.push((b = new Map())); return b; };
  const put = (px, rows, pal, ox, oy) => rows.forEach((row, y) => [...row].forEach((c, x) => { if (pal[c]) px.set(`${ox + x},${oy + y}`, pal[c]); }));
  const mini = (px, { color, x, y, flip }) => put(px, flip ? MINI.map((r) => [...r].reverse().join("")) : MINI,
    { "#": INK, e: INK, k: INK, b: color, h: mix(color, "#ffffff", 0.45), s: mix(color, "#3a1f5a", 0.32) }, x, y);
  const api = {
    put(rows, pal, ox = 0, oy = 0) { put(batch(), rows, pal, ox, oy); return api; },
    box(x, y, w, h, c) { const b = batch(); for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) b.set(`${x + i},${y + j}`, c); return api; },
    bean(color = BEAN_COLORS[0], { x = 0, y = 0, flip = false } = {}) { ops.push({ color, x, y, flip }); return api; },
    art(k = 1) {
      if (!ops.length) return "";
      const all = new Map(), lo = new Map();
      for (const op of ops) {
        if (k !== 1.5) { if (op instanceof Map) for (const [p, c] of op) all.set(p, c); else mini(all, op); continue; }
        // Low at 1.5 times: each batch and bean is scaled on its own onto one shared lattice (so its corner sits on
        // an even pixel), and every mini bean is the same sprite (drawn at 0,0 and moved), so all their faces match
        const one = op instanceof Map ? op : new Map();
        if (one !== op) mini(one, { ...op, x: 0, y: 0 });
        let { x0, y0, g } = gridOf(one);
        if (x0 & 1) { g = g.map((r) => [null, ...r]); x0--; }
        if (y0 & 1) { g = [g[0].map(() => null), ...g]; y0--; }
        const dx = 1.5 * x0 + (one === op ? 0 : Math.round(1.5 * op.x)), dy = 1.5 * y0 + (one === op ? 0 : Math.round(1.5 * op.y));
        epx3half(g).forEach((row, j) => row.forEach((c, i) => { if (c) lo.set(`${dx + i},${dy + j}`, c); }));
      }
      let { x0, y0, g } = gridOf(k === 1.5 ? lo : all);
      if (k === 1.5) { x0 /= 1.5; y0 /= 1.5; } else for (let s = 1; s < k; s *= 2) g = epx(g);
      const hi = ops.map((op) => {
        if (!(op instanceof Map)) return `<g transform="translate(${op.flip ? op.x + 7 : op.x} ${op.y}) scale(${op.flip ? -0.5 : 0.5} .5)">${beanHigh(op.color, false)}</g>`;
        const b = gridOf(op);
        return `<g transform="translate(${b.x0} ${b.y0})">${smooth(b.g, 0.5)}</g>`;
      }).join("");
      return `<g class="art-lo" shape-rendering="crispEdges" transform="translate(${x0} ${y0})${k > 1 ? ` scale(${+(1 / k).toFixed(5)})` : ""}">${squares(g)}</g><g class="art-hi" shape-rendering="geometricPrecision">${hi}</g>`;
    },
  };
  return api;
}
