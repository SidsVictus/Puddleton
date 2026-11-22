// Low battery: when Picture quality is Auto and the battery is at 20% or less and not charging, ask once whether to
// switch to Low. Only on calm screens (home, lobby, wardrobe, nothing open on top); anywhere else it waits, and a game
// that starts while the question is open closes it until the next calm moment. "Not now" holds until the battery has
// been above 20% again, and the question comes at most once a session. Browsers without the Battery API never ask.
import { layer, nextId } from "./base.mjs";
import { getSettings, setSetting } from "./prefs.mjs";
import { quality, qualityPref, onQuality } from "../quality.mjs";

const LOW = 0.2, NO = "pad-battery-no", ASKED = "pad-battery-asked", CALM = ["home", "lobby", "wardrobe"];
let bat = null, open = null, wait = 0, askedHere = false;

// flag("localStorage", key) reads, flag(store, key, true / false) sets or clears. Blocked storage reads as unset.
const flag = (store, key, on) => {
  try { const s = window[store]; if (on === undefined) return !!s.getItem(key); if (on) s.setItem(key, "1"); else s.removeItem(key); }
  catch { /* storage blocked: askedHere still covers this session */ }
  return false;
};
const calmScreen = () => !document.body.classList.contains("booting") && CALM.includes(document.querySelector(".screen.active")?.id);
const worth = () => bat && !bat.charging && bat.level <= LOW && qualityPref() === "auto" && quality() === "high";

function check() {
  if (bat?.level > LOW) flag("localStorage", NO, false);   // charged back up: the next drop may ask again
  clearTimeout(wait);
  if (open) { if (!calmScreen() || !worth()) open.close(); return; }
  if (!worth() || askedHere || flag("sessionStorage", ASKED) || flag("localStorage", NO)) return;
  if (calmScreen() && !document.querySelector('.scr-layer[aria-modal="true"]')) ask();
  else wait = setTimeout(check, 2000);
}

// A smooth battery with one red bar left: the question only ever shows while the look is High.
const ART = `<svg class="scr-art" viewBox="0 0 64 64" width="64" height="64" aria-hidden="true">
  <rect x="51" y="24" width="9" height="16" rx="3" fill="#ecd9a2" stroke="#1c1330" stroke-width="3"/>
  <rect x="4" y="15" width="49" height="34" rx="8" fill="#fff1cf" stroke="#1c1330" stroke-width="3"/>
  <path d="M5.5 38h46v3c0 3.6-2.9 6.5-6.5 6.5h-33c-3.6 0-6.5-2.9-6.5-6.5z" fill="#ecd9a2"/>
  <rect x="10" y="21" width="37" height="22" rx="4" fill="#2a1f4f"/>
  <rect x="13" y="24" width="10" height="16" rx="2.5" fill="#ff6b9a"/>
  <path d="M13 29v-2.5a2.5 2.5 0 0 1 2.5-2.5h5a2.5 2.5 0 0 1 2.5 2.5v2.5z" fill="#ffa3c0"/></svg>`;

function ask() {
  askedHere = true; flag("sessionStorage", ASKED, true);
  const tid = nextId("bt"), did = nextId("bt");
  const L = layer({ cls: "scr-confirm scr-battery scr-veil", labelledby: tid, describedby: did, role: "alertdialog", settings: getSettings(), escape: () => done(false) });
  L.el.innerHTML = `<div class="scr-dialog scr-plate">${ART}
    <h2 class="scr-title" id="${tid}">Battery is low</h2>
    <p class="scr-lede" id="${did}">Switch Picture quality to Low to save charge?</p>
    <p class="scr-note">You can change it back any time in Settings&nbsp;&gt;&nbsp;Display.</p>
    <div class="scr-actions"><button class="scr-btn dark" data-no>Not now</button><button class="scr-btn" data-yes>Switch to Low</button></div>
  </div>`;
  // yes: switch to Low. no: not now. interrupted: a game started or the question stopped mattering, so it may come back.
  const me = { close: () => done(false, true) };
  const done = (yes, interrupted = false) => {
    if (open !== me) return;
    open = null; L.close();
    if (interrupted) { askedHere = false; flag("sessionStorage", ASKED, false); check(); }
    else if (yes) setSetting("display.quality", "low");   // play.js re-applies the display settings on every change
    else flag("localStorage", NO, true);
  };
  open = me;
  L.$("[data-yes]").onclick = () => done(true);
  L.$("[data-no]").onclick = () => done(false);
  L.el.addEventListener("click", (e) => { if (e.target === L.el) done(false); });
  L.focus(L.$("[data-yes]"));
  const watch = () => { if (open === me) { check(); setTimeout(watch, 1000); } };
  setTimeout(watch, 1000);
}

// Call once at boot. Safari and Firefox have no navigator.getBattery, so there it quietly does nothing.
export function watchBattery() {
  navigator.getBattery?.().then((b) => {
    bat = b;
    b.addEventListener("levelchange", check);
    b.addEventListener("chargingchange", check);
    onQuality(check);
    check();
  }, () => {});
}
