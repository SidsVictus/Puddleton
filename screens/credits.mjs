// The cast credits after every game: the screen fades to darkness and the cast rolls up slowly like the end of a
// film, role by role, then the winner line and a last card: "Puddleton, a game by After Dark".
// Only the local player can skip it, and only by holding the skip button (or Space or Enter on it).
import { layer, esc, calm, sleep, roleName, MODES, ROLES, bean, moonMark, BEAN_COLORS } from "./base.mjs";

export const ORDER = ["godfather", "angel", "mafia", "framer", "detective", "vigilante", "mayor", "serialkiller", "jester", "villager"];
const PLURAL = { mafia: "The Mafia", villager: "The Villagers" };
export const WIN_LINE = {
  town: "The Town wins. Puddleton sleeps safe tonight.", mafia: "The Mafia wins. The town belongs to the family now.",
  jester: "The Jester wins. They wanted to be voted out all along.", serialkiller: "The Serial Killer wins. The last one standing.",
  draw: "A draw. The streets fall silent.",
};
const SIDE_OF_WIN = { town: "town", mafia: "mafia", jester: "solo", serialkiller: "solo", draw: "" };

let current = null;

// play({ players: [{ id, name, role, look, alive }], winner, winnerText, mode, localId, duration = 25000,
//        skippable = true, holdMs = 900, portrait, settings }) -> Promise<{ skipped: boolean }>
// portrait(role, look) returns an image URL; it defaults to portrait() from ../world.mjs (needs the "three" import map).
export async function play({ players = [], winner = "", winnerText, mode = "classic", localId = null, duration = 25000, skippable = true, holdMs = 900, portrait, settings } = {}) {
  if (current) return current;
  let draw = portrait;
  if (!draw) { try { draw = (await import("../world.mjs")).portrait; } catch { draw = null; } }
  const face = (p, i) => {
    try { if (draw) return `<img class="scr-cr-face" src="${draw(p.role, p.look)}" width="128" height="128" alt="">`; } catch { /* no WebGL: fall back to a pixel bean */ }
    return `<span class="scr-cr-face">${bean(BEAN_COLORS[i % 8], { size: 6 })}</span>`;
  };
  const groups = ORDER.map((r) => ({ role: r, cast: players.filter((p) => p.role === r) })).filter((g) => g.cast.length);
  let k = 0;
  const groupHtml = groups.map((g) => `<section class="scr-cr-group" data-side="${ROLES[g.role]?.side || ""}">
      <p class="scr-cr-role">${esc(g.cast.length > 1 && PLURAL[g.role] ? PLURAL[g.role] : `The ${roleName(g.role)}`)}</p>
      <div class="scr-cr-cast">${g.cast.map((p) => `<figure class="scr-cr-who${p.alive ? "" : " gone"}">${face(p, k++)}
        <figcaption><b>${esc(p.name)}</b>${p.id === localId ? `<em>You</em>` : ""}<small>${p.alive ? "Survived" : "Became a ghost"}</small></figcaption></figure>`).join("")}</div>
    </section>`).join("");
  const line = winnerText || WIN_LINE[winner] || "";
  const still = calm(settings);

  const L = layer({ cls: `scr-credits${still ? " paged" : ""}`, label: "Cast credits", settings, role: "dialog" });
  L.el.innerHTML = `<div class="scr-cr-roll" aria-hidden="${still ? "false" : "true"}">
      <header class="scr-cr-open"><span class="scr-cr-eyebrow">A ${esc(MODES[mode]?.name || "Puddleton")} tale</span><h2 class="scr-cr-title">The Cast</h2><i class="scr-cr-rule"></i></header>
      ${groupHtml}
      ${line ? `<p class="scr-cr-win" data-side="${SIDE_OF_WIN[winner] ?? ""}">${esc(line)}</p>` : ""}
    </div>
    <div class="scr-cr-end">${moonMark(4)}<p class="scr-cr-game">Puddleton</p><p class="scr-cr-by">a game by After Dark</p></div>
    <p class="scr-sr" aria-live="polite">${esc(`The cast: ${players.map((p) => `${p.name}, ${roleName(p.role)}`).join("; ")}. ${line} Puddleton, a game by After Dark.`)}</p>
    ${skippable ? `<button class="scr-cr-skip" aria-label="Hold to skip the credits"><span>Hold to skip</span><i aria-hidden="true"><b></b></i></button>` : ""}`;

  const roll = L.$(".scr-cr-roll"), end = L.$(".scr-cr-end");
  let resolve, skipped = false, raf = 0, timers = [];
  const promise = new Promise((r) => (resolve = r));
  current = promise;
  const finish = async (skip) => {
    if (L.closed || L.el.classList.contains("leaving")) return;
    skipped = skip; cancelAnimationFrame(raf); timers.forEach(clearTimeout);
    L.el.classList.add("leaving");
    await sleep(still ? 0 : skip ? 400 : 1100);
    current = null; await L.close({ animate: false }); resolve({ skipped });
  };

  // ---- hold to skip ----
  if (skippable) {
    const btn = L.$(".scr-cr-skip"), fill = btn.querySelector("b");
    let t0 = 0, held = 0;
    const step = () => { const f = Math.min(1, (performance.now() - t0) / holdMs); fill.style.width = `${Math.floor(f * 8) / 8 * 100}%`; if (f >= 1) finish(true); else held = requestAnimationFrame(step); };
    const down = (e) => { if (t0) return; e.preventDefault?.(); t0 = performance.now(); btn.classList.add("held"); held = requestAnimationFrame(step); };
    const up = () => { t0 = 0; cancelAnimationFrame(held); fill.style.width = "0"; btn.classList.remove("held"); };
    btn.addEventListener("pointerdown", down); btn.addEventListener("pointerup", up); btn.addEventListener("pointerleave", up); btn.addEventListener("pointercancel", up);
    btn.addEventListener("keydown", (e) => { if ((e.key === " " || e.key === "Enter") && !e.repeat) down(e); });
    btn.addEventListener("keyup", (e) => { if (e.key === " " || e.key === "Enter") up(); });
    btn.addEventListener("contextmenu", (e) => e.preventDefault());
    L.focus(btn);
  }

  // ---- the roll ----
  const fadeIn = still ? 0 : 1200, hold = 3200, fadeOut = 1100;
  await sleep(fadeIn);
  if (L.closed) return promise;
  const rollTime = Math.max(4000, duration - fadeIn - hold - fadeOut);
  if (still) {
    // reduced motion: the roll becomes pages that change in place
    const pages = [...roll.children];
    const each = rollTime / pages.length;
    pages.forEach((p, i) => { p.hidden = i > 0; timers.push(setTimeout(() => { pages.forEach((q, j) => (q.hidden = j !== i)); }, i * each)); });
    timers.push(setTimeout(() => { roll.hidden = true; end.classList.add("show"); }, rollTime));
  } else {
    const H = L.el.clientHeight, dist = H + roll.offsetHeight, t0 = performance.now();
    roll.style.transform = `translateY(${H}px)`;
    const frame = (now) => {
      const f = Math.min(1, (now - t0) / rollTime);
      roll.style.transform = `translateY(${Math.round(H - dist * f)}px)`;
      if (f >= 1) return;
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    timers.push(setTimeout(() => end.classList.add("show"), rollTime - 900));
  }
  timers.push(setTimeout(() => finish(false), rollTime + hold));
  return promise;
}
