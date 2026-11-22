// The "After Dark" studio sting: a pixel crescent drops in, the letters pop on one by one, a shine sweeps across,
// then it fades to black. About two seconds; a tap, click or any key skips it. Drawn in code as crisp SVG pixels.
import { layer, calm, moonMark, nextId, sleep } from "./base.mjs";

// 5 x 7 capitals for the studio name, and a 3 x 5 face for the small line under it.
const BIG = {
  A: [".###.", "#...#", "#...#", "#####", "#...#", "#...#", "#...#"],
  F: ["#####", "#....", "#....", "####.", "#....", "#....", "#...."],
  T: ["#####", "..#..", "..#..", "..#..", "..#..", "..#..", "..#.."],
  E: ["#####", "#....", "#....", "####.", "#....", "#....", "#####"],
  R: ["####.", "#...#", "#...#", "####.", "#.#..", "#..#.", "#...#"],
  D: ["####.", "#...#", "#...#", "#...#", "#...#", "#...#", "####."],
  K: ["#...#", "#..#.", "#.#..", "##...", "#.#..", "#..#.", "#...#"],
};
const SMALL = {
  P: ["###", "#.#", "###", "#..", "#.."], R: ["##.", "#.#", "##.", "#.#", "#.#"], E: ["###", "#..", "##.", "#..", "###"],
  S: ["###", "#..", "###", "..#", "###"], N: ["#..#", "##.#", "#.##", "#..#", "#..#"], T: ["###", ".#.", ".#.", ".#.", ".#."],
};

// One <g> per letter so each can pop in on its own beat. Returns { svg, w, h }.
function word(text, font, { gap = 1, space = 3, top = "#fff1cf", low = "#ffc45a", split = 4, shadow = "#5a2a6a", cls = "" } = {}) {
  let x = 0, i = 0;
  const groups = [], clip = [];
  for (const ch of text) {
    if (ch === " ") { x += space; continue; }
    const g = font[ch], w = g[0].length, rects = [], shade = [];
    g.forEach((row, y) => [...row].forEach((c, k) => {
      if (c !== "#") return;
      rects.push(`<rect x="${x + k}" y="${y}" width="1" height="1" fill="${y < split ? top : low}"/>`);
      shade.push(`<rect x="${x + k + 1}" y="${y + 1}" width="1" height="1"/>`);
      clip.push(`<rect x="${x + k}" y="${y}" width="1" height="1"/>`);
    }));
    groups.push(`<g class="${cls}" style="--i:${i++}"><g fill="${shadow}">${shade.join("")}</g>${rects.join("")}</g>`);
    x += w + gap;
  }
  return { svg: groups.join(""), clip: clip.join(""), w: x - gap + 1, h: font[Object.keys(font)[0]].length + 1 };
}

let current = null;

// play({ settings, duration = 2100 }) -> Promise<{ skipped: boolean }>
export function play({ settings, duration = 2100 } = {}) {
  if (current) return current.promise;
  const still = calm(settings);
  const L = layer({ cls: "scr-boot", label: "After Dark", settings, role: "img" });
  const big = word("AFTER DARK", BIG, { cls: "scr-boot-l" });
  const small = word("PRESENTS", SMALL, { gap: 1, top: "#cfc5ec", low: "#a79dcd", split: 9, shadow: "#2a1a4a" });
  const fit = () => Math.max(3, Math.min(8, Math.floor(Math.min(innerWidth * 0.82 / big.w, innerHeight * 0.55 / 34))));
  const s = fit(), clipId = nextId("boot");
  L.el.style.setProperty("--px", s + "px");
  L.el.innerHTML = `<div class="scr-boot-stage">
      <div class="scr-boot-moon">${moonMark(s)}<i class="scr-boot-star" style="left:${18 * s}px;top:${1 * s}px"></i><i class="scr-boot-star b" style="left:${-5 * s}px;top:${9 * s}px"></i></div>
      <svg class="scr-boot-word" viewBox="0 0 ${big.w} ${big.h}" width="${big.w * s}" height="${big.h * s}" shape-rendering="crispEdges" aria-hidden="true">
        <defs><clipPath id="${clipId}">${big.clip}</clipPath></defs>${big.svg}
        <g clip-path="url(#${clipId})"><rect class="scr-boot-shine" x="-12" y="-2" width="5" height="12" fill="#ffffff" transform="skewX(-24)"/></g>
      </svg>
      <svg class="scr-boot-sub" viewBox="0 0 ${small.w} ${small.h}" width="${small.w * Math.max(2, s - 3)}" height="${small.h * Math.max(2, s - 3)}" shape-rendering="crispEdges" aria-hidden="true">${small.svg}</svg>
    </div><p class="scr-sr">After Dark presents</p>`;
  if (still) L.el.classList.add("scr-still");

  let resolve, skipped = false, timer;
  const promise = new Promise((r) => (resolve = r));
  const finish = async (skip) => {
    if (!current || current.promise !== promise) return;
    skipped = skip; clearTimeout(timer); current = null;
    removeEventListener("keydown", onKey, true); L.el.removeEventListener("pointerdown", onTap);
    L.el.classList.add("scr-boot-end");
    await sleep(still ? 0 : skip ? 120 : 260);
    await L.close({ animate: false });
    resolve({ skipped });
  };
  const onKey = (e) => { if (!["Shift", "Control", "Alt", "Meta"].includes(e.key)) { e.preventDefault(); finish(true); } };
  const onTap = () => finish(true);
  addEventListener("keydown", onKey, true); L.el.addEventListener("pointerdown", onTap);
  current = { promise, skip: () => finish(true) };
  // the CSS timeline starts at the first paint, which render-blocking styles can delay; start the clock there too
  requestAnimationFrame(() => requestAnimationFrame(() => { if (current?.promise === promise) timer = setTimeout(() => finish(false), still ? Math.min(duration, 1400) : duration); }));
  return promise;
}

// Ends the sting now, if one is playing.
export function skip() { current?.skip(); }
