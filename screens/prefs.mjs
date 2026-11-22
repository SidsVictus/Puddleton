// The player's settings: one JSON object in localStorage "pad-settings", always read merged over DEFAULTS,
// so a missing or older save still gives a full object. settings.mjs is the menu; this file is the store.
//
// Schema, version 1 (every key optional in storage, every key present in getSettings()):
// {
//   v: 1,
//   audio:    { master: 0..100, music: 0..100, effects: 0..100, muted: boolean },
//   display:  { quality: "auto" | "high" | "low", reduceMotion: boolean, screenShake: boolean, flashing: boolean,
//               textSize: "small" | "medium" | "large" | "huge" },
//   chat:     { mode: "phrases" | "typing",          // "typing" means typing where the room and age band allow it
//               filter: "standard" | "strict",       // only adults may pick; everyone else always gets "strict"
//               strangers: boolean,                  // adults only: chat with players who are not friends
//               whisper: "everyone" | "friends" | "nobody",
//               muted: [{ id, name }], blocked: [{ id, name }] },
//   gameplay: { confirmVote: boolean, showTips: boolean },
//   access:   { highContrast: boolean, colorSafe: boolean, captions: boolean },
// }
//
// Changes: onChange(fn) calls fn({ path, value, settings }) and the same detail goes out as a "pad-settings"
// CustomEvent on window. applySettings() mirrors the look settings onto <html> as data attributes
// (data-pad-motion="reduce", data-pad-text, data-pad-contrast="high", data-pad-colors="safe", data-pad-flash="off",
// data-pad-shake="off") so any stylesheet can follow them. It runs once when this module loads and after every change.

export const SETTINGS_KEY = "pad-settings";
export const DEFAULTS = Object.freeze({
  v: 1,
  audio: { master: 80, music: 70, effects: 80, muted: false },
  display: { quality: "auto", reduceMotion: false, screenShake: true, flashing: true, textSize: "medium" },
  chat: { mode: "phrases", filter: "standard", strangers: false, whisper: "everyone", muted: [], blocked: [] },
  gameplay: { confirmVote: true, showTips: true },
  access: { highContrast: false, colorSafe: false, captions: false },
});

const clone = (o) => JSON.parse(JSON.stringify(o));
let memory = null;   // used when storage is blocked (private mode, sandboxed frames)
const listeners = new Set();

function merge(base, saved) {
  if (!saved || typeof saved !== "object") return base;
  for (const k of Object.keys(base)) {
    const b = base[k], s = saved[k];
    if (s === undefined) continue;
    if (Array.isArray(b)) base[k] = Array.isArray(s) ? s.filter((x) => x && typeof x.id === "string").map((x) => ({ id: x.id, name: String(x.name || x.id) })) : b;
    else if (b && typeof b === "object") base[k] = merge(b, s);
    else if (typeof s === typeof b) base[k] = s;
  }
  return base;
}

export function getSettings() {
  let saved = memory;
  try { const raw = localStorage.getItem(SETTINGS_KEY); if (raw) saved = JSON.parse(raw); } catch { /* storage blocked or bad JSON */ }
  return merge(clone(DEFAULTS), saved);
}

function save(s) {
  memory = s;
  try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(s)); } catch { /* keep the in-memory copy */ }
}

function emit(path, value, settings) {
  applySettings(settings);
  const detail = { path, value, settings: clone(settings) };
  for (const fn of listeners) { try { fn(detail); } catch (e) { console.error(e); } }
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent("pad-settings", { detail }));
}

// setSetting("audio.music", 40). Unknown paths are ignored. Returns the new full settings.
export function setSetting(path, value) {
  const s = getSettings(), keys = path.split("."), last = keys.pop();
  let o = s;
  for (const k of keys) { if (!o[k] || typeof o[k] !== "object") return s; o = o[k]; }
  if (!(last in o)) return s;
  o[last] = value; save(s); emit(path, value, s);
  return s;
}

export function resetSettings() { const s = clone(DEFAULTS); save(s); emit("*", null, s); return s; }

export function onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); }

// What chat actually allows for an age band ("child" | "teen" | "adult"), whatever is saved.
export function effectiveChat(settings = getSettings(), band = "child") {
  const c = settings.chat, adult = band === "adult";
  return { mode: c.mode, filter: adult ? c.filter : "strict", strangers: adult && c.strangers, whisper: c.whisper };
}

export function applySettings(s = getSettings(), root = typeof document !== "undefined" ? document.documentElement : null) {
  if (!root) return;
  const set = (k, v) => (v ? root.setAttribute(k, v) : root.removeAttribute(k));
  set("data-pad-motion", s.display.reduceMotion ? "reduce" : "");
  set("data-pad-text", s.display.textSize !== "medium" ? s.display.textSize : "");
  set("data-pad-contrast", s.access.highContrast ? "high" : "");
  set("data-pad-colors", s.access.colorSafe ? "safe" : "");
  set("data-pad-flash", s.display.flashing ? "" : "off");
  set("data-pad-shake", s.display.screenShake ? "" : "off");
}

applySettings();
