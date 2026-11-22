// A neutral age check, shown on the first visit before anything else is saved: birth month and year with no
// default answer. Only the age band is kept, never the birthday.
//
// Storage: localStorage "pad-band" = "child" | "teen" | "adult"
//          localStorage "pad-band-lock" = { band, at }   a second copy with the time of the answer
//          sessionStorage "pad-band"                       a copy for this visit, so clearing one store mid visit changes nothing
// If the copies ever disagree, the youngest band wins. A stored answer cannot be replaced for COOLDOWN_MS,
// and only then when the game explicitly asks for a retake (a shared device, from a grown-up's settings).
import { layer, esc, nextId, bean, asset } from "./base.mjs";

export const BAND_KEY = "pad-band";
export const LOCK_KEY = "pad-band-lock";
export const COOLDOWN_MS = 24 * 60 * 60 * 1000;
const ORDER = ["child", "teen", "adult"];

const read = (store, key) => { try { return store.getItem(key); } catch { return null; } };
const write = (store, key, v) => { try { store.setItem(key, v); } catch { /* blocked storage: the session copy may still hold */ } };
function lockInfo() { try { const l = JSON.parse(read(localStorage, LOCK_KEY)); return l && ORDER.includes(l.band) && Number.isFinite(l.at) ? l : null; } catch { return null; } }

// The stored band, or null before the gate has been answered.
export function getBand() {
  const found = [read(localStorage, BAND_KEY), lockInfo()?.band, read(sessionStorage, BAND_KEY)].filter((b) => ORDER.includes(b));
  return found.length ? found.sort((a, b) => ORDER.indexOf(a) - ORDER.indexOf(b))[0] : null;
}
export const needsGate = () => getBand() === null;

// month is 1 to 12. With no day given, a birthday in the current month counts as not reached yet (the safer guess).
export function bandFromBirth(year, month, now = new Date()) {
  let age = now.getFullYear() - year;
  if (now.getMonth() + 1 <= month) age -= 1;
  return age < 13 ? "child" : age < 18 ? "teen" : "adult";
}

function keep(band, fresh) {
  write(localStorage, BAND_KEY, band);
  write(sessionStorage, BAND_KEY, band);
  if (fresh || !lockInfo()) write(localStorage, LOCK_KEY, JSON.stringify({ band, at: Date.now() }));
}

let open = null;

// show({ settings, allowRetake = false, over = false }) -> Promise<"child" | "teen" | "adult">
// over: a see-through veil over the screen below (the start screen) instead of its own night sky.
// Resolves at once with the stored band when there is one (and repairs any missing copy).
export function show({ settings, allowRetake = false, over = false } = {}) {
  if (open) return open;
  const have = getBand(), lock = lockInfo();
  if (have && !(allowRetake && lock && Date.now() - lock.at >= COOLDOWN_MS)) { keep(have, false); return Promise.resolve(have); }

  const tid = nextId("age"), did = nextId("age"), eid = nextId("age");
  const now = new Date(), year = now.getFullYear();
  const months = Array.from({ length: 12 }, (_, i) => new Intl.DateTimeFormat(undefined, { month: "long" }).format(new Date(2000, i, 15)));
  const L = layer({ cls: `scr-agegate ${over ? "scr-veil over" : "scr-night"}`, labelledby: tid, describedby: did, settings });
  L.el.innerHTML = `<div class="scr-dialog scr-plate gold scr-age">
      <div class="scr-age-beans" aria-hidden="true">${bean("#a5ecb0", { size: 4 })}${bean("#ff9db5", { size: 5 })}${bean("#8fd6ff", { size: 4 })}</div>
      <span class="scr-eyebrow">Welcome to Puddleton</span>
      <h2 class="scr-title" id="${tid}">When were you born?</h2>
      <p class="scr-lede" id="${did}">Pick your birth month and year. We keep only a rough age group on this device, never your birthday.</p>
      <form novalidate>
        <div class="scr-age-pick">
          <label class="scr-field"><span class="scr-label">Month</span>
            <select class="scr-input" name="month" required aria-describedby="${eid}"><option value="" disabled selected>Month</option>${months.map((m, i) => `<option value="${i + 1}">${esc(m)}</option>`).join("")}</select></label>
          <label class="scr-field"><span class="scr-label">Year</span>
            <select class="scr-input" name="year" required aria-describedby="${eid}"><option value="" disabled selected>Year</option>${Array.from({ length: 101 }, (_, i) => `<option>${year - i}</option>`).join("")}</select></label>
        </div>
        <p class="scr-age-err" id="${eid}" role="alert"></p>
        <button class="scr-btn big wide" type="submit" disabled>Continue</button>
      </form>
      <p class="scr-note scr-age-legal">How we look after players: our <a class="scr-link" href="${asset("../legal/privacy.html")}" target="_blank" rel="noopener">Privacy policy</a>,
        <a class="scr-link" href="${asset("../legal/terms.html")}" target="_blank" rel="noopener">Terms of use</a> and <a class="scr-link" href="${asset("../legal/safety.html")}" target="_blank" rel="noopener">Safety Center</a>.</p>
    </div>`;
  const form = L.$("form"), m = form.month, y = form.year, go = L.$("[type=submit]"), err = L.$(".scr-age-err");
  const check = () => {
    const ok = m.value && y.value, future = ok && +y.value === year && +m.value > now.getMonth() + 1;
    err.textContent = future ? "That month has not happened yet. Please check the date." : "";
    go.disabled = !ok || future;
  };
  m.onchange = y.onchange = check;
  open = new Promise((resolve) => {
    form.onsubmit = (e) => {
      e.preventDefault(); check();
      if (go.disabled) return;
      const band = bandFromBirth(+y.value, +m.value, now);
      keep(band, true); open = null;
      L.close(); resolve(band);
    };
  });
  L.focus(m);
  return open;
}

// Clears every copy so the gate shows again. For the demo page and tests only; the game should never call it.
export function resetForTesting() {
  for (const [s, k] of [[localStorage, BAND_KEY], [localStorage, LOCK_KEY], [sessionStorage, BAND_KEY]]) { try { s.removeItem(k); } catch { /* blocked */ } }
}
