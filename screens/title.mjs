// The title screen: the Puddleton wordmark floating over a starry night and a blinking "Tap to start",
// like an arcade cabinet in attract mode. The first tap or key resolves it; that tap is the one that unlocks audio.
import { layer, calm, brand, esc, sleep } from "./base.mjs";

const CLOUD = "data:image/svg+xml," + encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 20" shape-rendering="crispEdges"><path fill="#4a4290" d="M6 8h10V5h6V3h10v2h5v3h9v2h6V7h8V5h9v2h5v3h7v2h7v3H0v-3h3V8z"/><path fill="#3b3470" d="M0 12h3v-2h3V9h10V6h6V4h10v2h5v3h9v2h6V8h8V6h9v2h5v3h7v2h8v7H0z"/><path fill="#2e2862" d="M0 16h96v4H0z"/></svg>`);

let current = null;

// show({ settings, version, year, backdrop = "sky" | "none", prompt, onStart(event) }) -> Promise<{ via: "pointer" | "key" }>
// onStart runs inside the tap or key event itself: unlock audio there (iOS only allows it inside the gesture).
// backdrop "none" leaves the layer see-through so a live scene behind it shows.
export function show({ settings, version = "", year = new Date().getFullYear(), backdrop = "sky", prompt, onStart } = {}) {
  if (current) return current.promise;
  const coarse = matchMedia("(pointer: coarse)").matches;
  const text = prompt || (coarse ? "Tap to start" : "Press any key");
  const L = layer({ cls: `scr-titlescreen ${backdrop === "none" ? "bare" : ""}`, label: "Puddleton title screen", settings });
  let stars = "";
  for (let i = 0; i < 64; i++) {
    const x = (i * 37.7 + (i % 7) * 11.3) % 100, y = (i * 23.1 + (i % 5) * 17.9) % 78, k = i % 9 === 0 ? "big" : i % 3 === 0 ? "dim" : "";
    stars += `<i class="${k}" style="left:${x.toFixed(1)}%;top:${y.toFixed(1)}%;--d:${(i % 6) * -0.4}s"></i>`;
  }
  let lanterns = "";
  for (let i = 0; i < 9; i++) lanterns += `<b style="left:${8 + ((i * 41) % 86)}%;--d:${-i * 2.3}s;--s:${14 + (i % 4) * 3}s"></b>`;
  const L1 = brand("logo-359"), L2 = brand("logo-718"), L3 = brand("logo-1436");
  L.el.innerHTML = `
    ${backdrop === "none" ? "" : `<div class="scr-title-sky" aria-hidden="true"><div class="scr-title-stars">${stars}</div><div class="scr-title-lanterns">${lanterns}</div>
      <div class="scr-title-cloud far" style="background-image:url('${CLOUD}')"></div><div class="scr-title-cloud" style="background-image:url('${CLOUD}')"></div></div>`}
    <button class="scr-title-hit" aria-label="${esc(text)}">
      <picture class="scr-title-logo">
        <source type="image/webp" srcset="${L1}.webp 359w, ${L2}.webp 718w, ${L3}.webp 1436w" sizes="(max-width: 800px) 90vw, 720px">
        <img src="${L2}.png" srcset="${L1}.png 359w, ${L2}.png 718w, ${L3}.png 1436w" sizes="(max-width: 800px) 90vw, 720px" width="718" height="350" alt="Puddleton After Dark">
      </picture>
      <span class="scr-title-press" aria-hidden="true">${esc(text)}</span>
    </button>
    <p class="scr-title-foot"><span>&copy; ${esc(year)} After Dark</span>${version ? `<span>${esc(version)}</span>` : ""}</p>`;

  let resolve;
  const promise = new Promise((r) => (resolve = r));
  const go = async (via, e) => {
    if (!current || current.promise !== promise) return;
    current = null;
    removeEventListener("keydown", onKey, true);
    try { onStart?.(e); } catch (err) { console.error(err); }
    resolve({ via });
    L.el.classList.add("go");
    if (!calm(settings)) await sleep(520);
    await L.close();
  };
  const onKey = (e) => { if (e.repeat || ["Shift", "Control", "Alt", "Meta", "Tab", "CapsLock"].includes(e.key)) return; e.preventDefault(); go("key", e); };
  L.$(".scr-title-hit").addEventListener("click", (e) => go(e.detail === 0 ? "key" : "pointer", e));
  addEventListener("keydown", onKey, true);
  current = { promise, close: () => { current = null; removeEventListener("keydown", onKey, true); L.close(); resolve({ via: "closed" }); } };
  L.focus(L.$(".scr-title-hit"));
  return promise;
}

// Removes the title screen without a tap (resolves { via: "closed" }).
export function hide() { current?.close(); }
