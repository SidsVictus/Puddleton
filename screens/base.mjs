// Shared helpers for the Puddleton screens: layers with focus and Escape handling, radio groups,
// motion checks, role names, time formatting and a tiny pixel bean drawn as SVG.
import { getSettings } from "./prefs.mjs";

const url = (p) => new URL(p, import.meta.url).href;
export const asset = url;                                   // a path relative to screens/
export const uiIcon = (name) => url(`../ui/${name}.svg`);   // the game's own icon set
export const icon = (name) => url(`icons/${name}.svg`);     // icons drawn for the screens (icons/draw.py)
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

// ---------- pixel bean: a 14 x 16 sprite as an SVG string, crisp at any integer scale ----------
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
function mix(hex, to, t) {
  const a = parseInt(hex.slice(1), 16), b = parseInt(to.slice(1), 16);
  const c = [16, 8, 0].map((s) => Math.round(((a >> s) & 255) * (1 - t) + ((b >> s) & 255) * t));
  return "#" + c.map((v) => v.toString(16).padStart(2, "0")).join("");
}
// bean(color, { size = 4 (screen px per art px), closed = false, cls, title })
export function bean(color = BEAN_COLORS[0], { size = 4, closed = false, cls = "", title = "" } = {}) {
  const pal = { "#": "#1c1330", e: "#1c1330", m: "#1c1330", k: mix(color, "#2a1a4a", 0.62), b: color, h: mix(color, "#ffffff", 0.45), s: mix(color, "#3a1f5a", 0.32), p: "#ff7fa6" };
  const runs = {};
  BEAN.forEach((row, y) => {
    row = closed && BLINK[y] ? BLINK[y] : row;
    let x = 0;
    while (x < row.length) {
      const c = row[x]; let n = 1;
      while (row[x + n] === c) n++;
      if (c !== ".") (runs[pal[c]] ||= []).push(`M${x} ${y}h${n}v1h-${n}z`);
      x += n;
    }
  });
  const paths = Object.entries(runs).map(([f, d]) => `<path fill="${f}" d="${d.join("")}"/>`).join("");
  return `<svg class="scr-bean ${cls}" viewBox="0 0 14 16" width="${14 * size}" height="${16 * size}" shape-rendering="crispEdges" ${title ? `role="img" aria-label="${esc(title)}"` : 'aria-hidden="true"'}>${paths}</svg>`;
}

// A pixel crescent moon, the studio mark: n x n art pixels.
export function moonMark(size = 4, color = "#fff1cf", shade = "#ecd9a2") {
  const n = 16, rows = [];
  for (let y = 0; y < n; y++) {
    let row = "";
    for (let x = 0; x < n; x++) {
      const dx = x + 0.5 - 8, dy = y + 0.5 - 8, ox = x + 0.5 - 11.2, oy = y + 0.5 - 5.6;
      const inA = dx * dx + dy * dy <= 7.6 * 7.6, inB = ox * ox + oy * oy <= 6.4 * 6.4;
      row += inA && !inB ? (dx * dx + dy * dy > 6.2 * 6.2 || (x < 5 && y > 9) ? "s" : "m") : ".";
    }
    rows.push(row);
  }
  const out = [];
  rows.forEach((row, y) => [...row].forEach((c, x) => { if (c !== ".") out.push(`<rect x="${x}" y="${y}" width="1" height="1" fill="${c === "m" ? color : shade}"/>`); }));
  return `<svg class="scr-moon" viewBox="0 0 16 16" width="${16 * size}" height="${16 * size}" shape-rendering="crispEdges" aria-hidden="true">${out.join("")}</svg>`;
}

// A 7 x 8 mini bean for crowds, drawn at the same pixel size as the scene art. flip faces it left.
const MINI = ["..###..", ".#hbb#.", "#hbbbs#", "#bebes#", "#bbbbs#", "#sbbss#", ".#sss#.", "..k.k.."];
export function miniBean(color = BEAN_COLORS[0], { x = 0, y = 0, cls = "", flip = false } = {}) {
  const pal = { "#": "#1c1330", e: "#1c1330", k: "#1c1330", b: color, h: mix(color, "#ffffff", 0.45), s: mix(color, "#3a1f5a", 0.32) };
  const runs = {};
  MINI.forEach((row, ry) => {
    if (flip) row = [...row].reverse().join("");
    [...row].forEach((c, rx) => { if (c !== ".") (runs[pal[c]] ||= []).push(`M${rx} ${ry}h1v1h-1z`); });
  });
  return `<g class="${cls}" transform="translate(${x} ${y})">${Object.entries(runs).map(([f, d]) => `<path fill="${f}" d="${d.join("")}"/>`).join("")}</g>`;
}

// Rows of characters to SVG paths: pixels("ab.", { a: "#fff", b: "#000" }, x, y). "." is empty.
export function pixels(rows, pal, ox = 0, oy = 0) {
  const runs = {};
  rows.forEach((row, ry) => [...row].forEach((c, rx) => { if (pal[c]) (runs[pal[c]] ||= []).push(`M${ox + rx} ${oy + ry}h1v1h-1z`); }));
  return Object.entries(runs).map(([f, d]) => `<path fill="${f}" d="${d.join("")}"/>`).join("");
}
