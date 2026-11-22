// Picture quality. The player picks Auto, High or Low (Settings > Display) and the game draws one of two looks:
// "high", smooth like the 3D beans, or "low", chunky square pixels. Auto picks the look from the device.
// The look lives on <html data-quality="high|low" data-quality-pref="auto|high|low"> so CSS can follow it, and every
// change fires a "pad:quality" window event with { quality, pref }.
let PREF = "auto";

export const quality = () => (document.documentElement.dataset.quality === "low" ? "low" : "high");
export const qualityPref = () => PREF;

// fn(quality, pref) on every change; returns a function that stops listening.
export function onQuality(fn) {
  const h = (e) => fn(e.detail.quality, e.detail.pref);
  addEventListener("pad:quality", h);
  return () => removeEventListener("pad:quality", h);
}

// Auto draws Low when the device asks to save data, is small (2 GB of memory or 2 cores or fewer), or the 3D stage
// fires "pad:slow" (still slow at its lowest sharpness). High otherwise. A low battery never switches the look by
// itself: screens/battery.mjs asks the player first. Cores only count where memory is reported too (Chromium):
// Safari on iPhone and Firefox's fingerprint guard say 2 cores on any device.
let slow = false;
const DATA = "(prefers-reduced-data: reduce)";
function resolveAuto() {
  const n = navigator, mem = n.deviceMemory, cores = n.hardwareConcurrency;
  const small = mem > 0 && (mem <= 2 || cores <= 2);
  return slow || small || n.connection?.saveData || matchMedia(DATA).matches ? "low" : "high";
}

// A signal changed: draw again, but only if the player is on Auto (and play.js has applied the setting).
if (typeof window !== "undefined") {
  const again = () => { if (document.documentElement.dataset.qualityPref === "auto") applyQuality("auto"); };
  addEventListener("pad:slow", () => { slow = true; again(); });
  navigator.connection?.addEventListener?.("change", again);
  matchMedia(DATA).addEventListener?.("change", again);
}

export function applyQuality(pref) {
  PREF = ["auto", "high", "low"].includes(pref) ? pref : "auto";
  const el = document.documentElement, next = PREF === "auto" ? resolveAuto() : PREF;
  const changed = el.dataset.quality !== next || el.dataset.qualityPref !== PREF;
  el.dataset.quality = next; el.dataset.qualityPref = PREF;
  if (changed) dispatchEvent(new CustomEvent("pad:quality", { detail: { quality: next, pref: PREF } }));
}
