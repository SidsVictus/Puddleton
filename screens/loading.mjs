// The loading screen: a pixel progress bar with a bean hopping along it, and rotating tips underneath.
// It shows real progress when it can measure it, never more than has really loaded, and stays up for at least
// minMs (two seconds by default) so it never flickers; longer if the work needs longer.
import { layer, calm, brand, esc, sleep, bean, nextId, BEAN_COLORS } from "./base.mjs";
import { getSettings } from "./prefs.mjs";
import { TIPS, TIP_LABEL, pickTip } from "./tips.mjs";

// showLoading(work, { label = "Loading", minMs = 2000, settings, tips = TIPS, tipEvery = 4500 }) -> Promise<result>
// work may be:
//   a Promise                      progress creeps on its own until it settles
//   a function (report) => Promise  call report(fraction 0 to 1, label?) as you go
//   an array of tasks               Promises, functions, or { label, weight = 1, run: () => Promise }; they run together
//                                   and the bar moves as each one finishes (the label shows the next unfinished task)
//   nothing                         just shows the screen for minMs
// Resolves with the work's result (an array of results for an array), or rejects with its error after closing.
export async function showLoading(work, { label = "Loading", minMs = 2000, settings, tips = TIPS, tipEvery = 4500 } = {}) {
  const s = settings || getSettings(), still = calm(s), showTips = s.gameplay?.showTips !== false && tips?.length;
  const lid = nextId("load");
  const L = layer({ cls: "scr-loading scr-night", label: "Loading", settings: s });
  L.el.setAttribute("aria-busy", "true");
  const L1 = brand("logo-359"), L2 = brand("logo-718");
  L.el.innerHTML = `<div class="scr-load">
      <picture class="scr-load-logo"><source type="image/webp" srcset="${L1}.webp 359w, ${L2}.webp 718w" sizes="300px"><img src="${L1}.png" srcset="${L1}.png 359w, ${L2}.png 718w" sizes="300px" width="359" height="175" alt="Puddleton After Dark"></picture>
      <div class="scr-load-bar" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0" aria-labelledby="${lid}">
        <div class="scr-load-walker">${bean(BEAN_COLORS[Math.floor(Math.random() * BEAN_COLORS.length)], { size: 3 })}</div>
        <div class="scr-load-track"><i class="scr-load-fill"></i></div>
      </div>
      <p class="scr-load-status"><span class="scr-load-label" id="${lid}">${esc(label)}</span><b class="scr-load-pct">0%</b></p>
      ${showTips ? `<div class="scr-load-tip" aria-live="off"><span class="scr-eyebrow"></span><p></p></div>` : ""}
    </div>`;
  const bar = L.$(".scr-load-bar"), fill = L.$(".scr-load-fill"), walker = L.$(".scr-load-walker"), pct = L.$(".scr-load-pct"), lab = L.$(".scr-load-label");

  // ---- tips ----
  let tip = null, tipTimer = 0;
  const nextTip = async (first) => {
    const box = L.$(".scr-load-tip"); if (!box) return;
    tip = pickTip(tip, tips);
    if (!first && !still) { box.classList.add("swap"); await sleep(180); }
    box.querySelector(".scr-eyebrow").textContent = TIP_LABEL[tip.kind] || "Tip";
    box.dataset.kind = tip.kind; box.querySelector("p").textContent = tip.text;
    box.classList.remove("swap");
  };
  if (showTips) { nextTip(true); tipTimer = setInterval(nextTip, tipEvery); }

  // ---- progress ----
  let real = 0, fake = false, done = false, failed = null, result;
  const setLabel = (t) => { if (t) lab.textContent = t; };
  let job;
  if (Array.isArray(work)) {
    const items = work.map((w) => (w && typeof w === "object" && "run" in w ? { label: w.label, weight: w.weight ?? 1, run: w.run } : { weight: 1, run: typeof w === "function" ? w : () => w }));
    const total = items.reduce((a, b) => a + b.weight, 0) || 1, left = new Set(items);
    const nextLabel = () => setLabel([...left].find((i) => i.label)?.label);
    nextLabel();
    job = Promise.all(items.map(async (it) => { const v = await it.run(); left.delete(it); real += it.weight / total; nextLabel(); return v; }));
  } else if (typeof work === "function") {
    job = Promise.resolve().then(() => work((f, t) => { real = Math.max(real, Math.min(1, +f || 0)); setLabel(t); }));
  } else if (work && typeof work.then === "function") { fake = true; job = work; }
  else job = Promise.resolve();
  job.then((v) => { result = v; real = 1; done = true; }, (e) => { failed = e || new Error("Loading failed"); done = true; });

  const t0 = performance.now();
  let shown = 0;
  await new Promise((resolve) => {
    const tick = () => {
      if (failed) return resolve();
      const t = performance.now() - t0, time = Math.min(1, t / minMs);
      const measured = fake && !done ? 0.92 * (1 - Math.exp(-t / 2500)) : real;
      shown = Math.max(shown, Math.min(measured, done ? time : Math.min(time, 0.99)));
      const step = Math.floor(shown * 20) / 20;   // twenty chunky segments
      fill.style.width = `${step * 100}%`;
      walker.style.left = `${step * 100}%`;
      const n = Math.round(shown * 100);
      pct.textContent = `${n}%`; bar.setAttribute("aria-valuenow", String(n));
      if (done && shown >= 1) return resolve();
      setTimeout(tick, 50);
    };
    tick();
  });
  clearInterval(tipTimer);
  if (!failed) { L.el.classList.add("done"); await sleep(still ? 120 : 380); }
  await L.close();
  if (failed) throw failed;
  return result;
}
