// A SpeedChat-style phrase menu: pick a category, then a phrase; a phrase with {player} or {role} in it then
// asks for the player or role. A bottom sheet in thumb reach on phones, a small menu at the bottom left on PC.
// The catalog is passed in: [{ id: "accuse.1", cat: "Accuse", text: "I think {player} is Mafia", args: ["player"] }].
import { layer, esc, nextId, uiIcon, icon, roleName, ROLES, BEAN_COLORS, bean } from "./base.mjs";

export const ALL_ROLES = ["villager", "angel", "detective", "vigilante", "mayor", "mafia", "godfather", "framer", "jester", "serialkiller"];
const ASK = { player: "Pick a player", role: "Pick a role" };
const BLANK = { player: "someone", role: "a role" };

// The phrase with its arguments filled in: render(entry, { player: "p3" }, { players }) -> "I think Noodle is Mafia".
export function render(entry, args = {}, { players = [] } = {}) {
  return entry.text.replace(/\{(\w+)\}/g, (m, k) => {
    const v = args[k];
    if (v == null) return BLANK[k] || "something";
    if (k === "player") return players.find((p) => p.id === v)?.name ?? String(v);
    if (k === "role") return roleName(v);
    return String(v);
  });
}
const argsOf = (e) => e.args || [...e.text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]);
const chips = (text) => esc(text).replace(/\{(\w+)\}/g, (m, k) => `<span class="scr-pw-chip">${esc(BLANK[k] || k)}</span>`);

let current = null;

// open({ catalog, players: [{ id, name, color? }], roles = ALL_ROLES, title = "Quick chat", settings })
//   -> Promise<{ id, args: { player?, role? }, text } | null>   (null when closed without picking)
export function open({ catalog = [], players = [], roles = ALL_ROLES, title = "Quick chat", settings } = {}) {
  if (current) return current.promise;
  const tid = nextId("pw");
  const cats = [...new Set(catalog.map((e) => e.cat))];
  const L = layer({ cls: "scr-phrases", labelledby: tid, settings, escape: () => (stack.length > 1 ? back() : done(null)) });
  L.el.innerHTML = `<div class="scr-pw scr-plate">
      <header class="scr-pw-head">
        <button class="scr-tile scr-pw-back" aria-label="Back"><img src="${uiIcon("back")}" alt=""></button>
        <div class="scr-pw-titles"><span class="scr-eyebrow" data-crumb></span><h2 class="scr-pw-title" id="${tid}"></h2></div>
        <button class="scr-tile" data-close aria-label="Close quick chat"><img src="${uiIcon("close")}" alt=""></button>
      </header>
      <p class="scr-pw-preview" aria-live="polite" hidden></p>
      <ul class="scr-menu scr-pw-list" role="menu" aria-labelledby="${tid}"></ul>
    </div>`;
  const list = L.$(".scr-pw-list"), preview = L.$(".scr-pw-preview");
  let stack = [], pick = null, args = {};

  const level = () => stack[stack.length - 1];
  const draw = (focusIndex = 0) => {
    const lv = level();
    L.$(".scr-pw-back").hidden = stack.length < 2;
    L.$("[data-crumb]").textContent = lv.crumb;
    L.$(".scr-pw-title").textContent = lv.title;
    preview.hidden = !pick;
    if (pick) preview.innerHTML = `<span class="scr-eyebrow amber">You will say</span>${esc(render(pick, args, { players })).replace(esc(BLANK[lv.ask] || "\u0000"), `<mark>${esc(BLANK[lv.ask] || "")}</mark>`)}`;
    list.dataset.kind = lv.kind;
    list.innerHTML = lv.items.map((it, i) => `<li role="none"><button class="scr-item" role="menuitem" data-i="${i}" ${it.side ? `data-side="${it.side}"` : ""}>${it.html}</button></li>`).join("")
      || `<li class="scr-empty">Nothing to pick here.</li>`;
    list.scrollTop = 0;
    list.querySelectorAll(".scr-item")[Math.min(focusIndex, lv.items.length - 1)]?.focus({ preventScroll: true });
  };
  const push = (lv) => { stack.push(lv); draw(); };
  const back = () => {
    if (stack.length < 2) return;
    const was = stack.pop();
    if (was.kind === "arg") { delete args[was.ask]; if (level().kind !== "arg") { pick = null; args = {}; } }
    draw(level().last || 0);
  };
  const askNext = () => {
    const need = argsOf(pick).find((k) => args[k] == null);
    if (!need) return done({ id: pick.id, args: { ...args }, text: render(pick, args, { players }) });
    const items = need === "player"
      ? players.map((p, i) => ({ value: p.id, html: `${bean(p.color || BEAN_COLORS[i % 8], { size: 2 })}<span>${esc(p.name)}</span>` }))
      : roles.map((r) => ({ value: r, side: ROLES[r]?.side, html: `<i class="scr-pw-dot"></i><span>${esc(roleName(r))}</span>` }));
    push({ kind: "arg", ask: need, crumb: pick.cat, title: ASK[need] || "Pick one", items });
  };
  const choose = (i) => {
    const lv = level(), it = lv.items[i];
    if (!it) return;
    lv.last = i;
    if (lv.kind === "cats") push({ kind: "phrases", crumb: title, title: it.cat, items: catalog.filter((e) => e.cat === it.cat).map((e) => ({ entry: e, html: `<span>${chips(e.text)}</span>` })) });
    else if (lv.kind === "phrases") { pick = it.entry; args = {}; askNext(); }
    else { args[lv.ask] = it.value; askNext(); }
  };
  stack.push({ kind: "cats", crumb: "Pick a topic", title, items: cats.map((c) => ({ cat: c, html: `<span>${esc(c)}</span><small>${catalog.filter((e) => e.cat === c).length}</small><img class="scr-pw-chev" src="${icon("chevron", null, true)}" data-sm alt="">` })) });

  list.addEventListener("click", (e) => { const b = e.target.closest("[data-i]"); if (b) choose(+b.dataset.i); });
  list.addEventListener("keydown", (e) => {
    const items = [...list.querySelectorAll(".scr-item")], i = items.indexOf(document.activeElement);
    if (i < 0) return;
    const go = (n) => { e.preventDefault(); items[(n + items.length) % items.length].focus(); };
    if (e.key === "ArrowDown") go(i + 1);
    else if (e.key === "ArrowUp") go(i - 1);
    else if (e.key === "Home") go(0);
    else if (e.key === "End") go(items.length - 1);
    else if (e.key === "ArrowRight") { e.preventDefault(); choose(i); }
    else if (e.key === "ArrowLeft" || e.key === "Backspace") { if (stack.length > 1) { e.preventDefault(); back(); } }
  });
  L.$(".scr-pw-back").onclick = back;
  L.$("[data-close]").onclick = () => done(null);
  L.el.addEventListener("click", (e) => { if (e.target === L.el) done(null); });

  let resolve;
  const promise = new Promise((r) => (resolve = r));
  const done = (v) => { if (!current) return; current = null; L.close(); resolve(v); };
  current = { promise, close: () => done(null) };
  draw();
  return promise;
}

export function close() { current?.close(); }
