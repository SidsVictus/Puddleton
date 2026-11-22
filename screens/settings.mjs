// The settings menu, opened from the gear. A centred two column panel on PC (sections on the left, the chosen
// section on the right) and a full screen menu on phones (pick a section, then Back). Every change saves at once
// to localStorage "pad-settings" (schema and defaults in prefs.mjs) and fires onChange and a "pad-settings" event.
import { layer, esc, nextId, uiIcon, icon, asset, brand, radios, focusables } from "./base.mjs";
import { getSettings, setSetting } from "./prefs.mjs";
import { getBand } from "./agegate.mjs";

export { DEFAULTS, SETTINGS_KEY, getSettings, setSetting, resetSettings, onChange, effectiveChat, applySettings } from "./prefs.mjs";
export const GEAR_ICON = icon("gear");
export const BUG_EMAIL = "sidsvictus@gmail.com";
// The official community server. Discord itself is 13+, so it is never offered to the under 13 band.
export const DISCORD_URL = "https://discord.gg/PunQKtq9XN";
export const LINKS = {
  privacy: asset("../legal/privacy.html"), terms: asset("../legal/terms.html"),
  safety: asset("../legal/safety.html"), credits: asset("../legal/credits.html"),
};

// A pixel gear button for a HUD: gearButton({ label, onClick }) -> <button class="scr-tile scr-gear">
export function gearButton({ label = "Settings", onClick } = {}) {
  const b = document.createElement("button");
  b.className = "scr-tile scr-gear"; b.type = "button"; b.setAttribute("aria-label", label);
  b.innerHTML = `<img src="${GEAR_ICON}" alt="">`;
  if (onClick) b.addEventListener("click", onClick);
  return b;
}

const SEG = (path, options) => ({ type: "seg", path, options });
function sections(band, o) {
  const adult = band === "adult";
  return [
    { id: "audio", name: "Audio", blurb: "How loud the island is.", rows: [
      { type: "range", path: "audio.master", label: "Master volume" },
      { type: "range", path: "audio.music", label: "Music" },
      { type: "range", path: "audio.effects", label: "Sound effects" },
      { type: "switch", path: "audio.muted", label: "Mute everything", hint: "Silences music and effects until you switch it back." },
    ] },
    { id: "display", name: "Display", blurb: "How the game looks and moves.", rows: [
      { ...SEG("display.quality", [["auto", "Auto"], ["high", "High"], ["low", "Low"]]), label: "Picture quality", hint: "High is smooth. Low is chunky pixels and saves battery. Auto picks for your device." },
      { ...SEG("display.textSize", [["small", "Small"], ["medium", "Medium"], ["large", "Large"], ["huge", "Huge"]]), label: "Text size" },
      { type: "switch", path: "display.reduceMotion", label: "Reduce motion", hint: "Fewer moving parts, gentler screen changes." },
      { type: "switch", path: "display.screenShake", label: "Screen shake" },
      { type: "switch", path: "display.flashing", label: "Flashing effects", hint: "Bright flashes during big moments." },
    ] },
    { id: "chat", name: "Chat and safety", blurb: "Who can talk to you, and how.", rows: [
      { ...SEG("chat.mode", [["phrases", "Phrases only"], ["typing", "Typing where allowed"]]), label: "Chat style", hint: "Phrases are ready-made messages you pick from a menu." },
      adult && { ...SEG("chat.filter", [["standard", "Standard"], ["strict", "Strict"]]), label: "Chat filter", hint: "Strict hides more words, including mild ones." },
      adult && { type: "switch", path: "chat.strangers", label: "Chat with strangers", hint: "Off: only friends can chat with you. On: anyone in a public room can." },
      { ...SEG("chat.whisper", [["everyone", "Everyone"], ["friends", "Friends"], ["nobody", "Nobody"]]), label: "Who can whisper to me" },
      { type: "list", path: "chat.muted", label: "Muted players", empty: "Nobody is muted. Mute someone from their name in a game.", action: "Unmute" },
      { type: "list", path: "chat.blocked", label: "Blocked players", empty: "Nobody is blocked. Blocked players cannot whisper to you or join your rooms.", action: "Unblock" },
    ].filter(Boolean) },
    { id: "gameplay", name: "Gameplay", blurb: "Little helpers while you play.", rows: [
      { type: "switch", path: "gameplay.confirmVote", label: "Confirm before voting", hint: "Asks once more before your vote counts." },
      { type: "switch", path: "gameplay.showTips", label: "Show tips", hint: "Tips on the loading screen." },
      { type: "button", label: "Replay the tutorial", run: o.onReplayTutorial, art: uiIcon("book") },
    ] },
    { id: "access", name: "Accessibility", blurb: "Make the game fit you.", rows: [
      { type: "switch", path: "access.highContrast", label: "High contrast", hint: "Brighter text and stronger edges." },
      { type: "switch", path: "access.colorSafe", label: "Color-blind friendly roles", hint: "Role colors everyone can tell apart.", swatch: true },
      { type: "switch", path: "access.captions", label: "Captions for sounds", hint: "Shows a line of text when a sound plays." },
    ] },
    { id: "account", name: "Account and privacy", blurb: "Your details and your data.", rows: [
      { type: "html", html: `<div class="scr-set-soon"><img src="${icon("person")}" alt=""><div><b>Sign in is on its way</b><p class="scr-note">It arrives when Puddleton moves to its own home on the web. Until then you play as a guest: a random guest pass on this device keeps your name, your look and your progress.</p></div></div>` },
      { type: "links", links: [["Privacy policy", o.links.privacy], ["Terms of use", o.links.terms], ["Safety Center", o.links.safety]] },
      o.onClearData && { type: "button", label: "Clear my data", run: o.onClearData, art: uiIcon("close"), hint: "Deletes your guest pass, name, look, stats and friends from this device and from our server." },
    ].filter(Boolean) },
    { id: "help", name: "Help", blurb: "Stuck, or found a bug?", rows: [
      { type: "button", label: "How to play", run: o.onHowToPlay, art: uiIcon("help") },
      { type: "button", label: "Report a bug", href: `mailto:${BUG_EMAIL}?subject=${encodeURIComponent("Puddleton bug report")}&body=${encodeURIComponent(`What happened:\n\n\nWhat I expected:\n\n\nGame version: ${o.version}\n`)}`, art: icon("flag"), hint: `Opens an email to ${BUG_EMAIL}.` },
      ...(band === "child" ? [] : [{ type: "button", label: "Join our Discord", href: DISCORD_URL, art: icon("people"), hint: "The Puddleton community server, for players 13 and older." }]),
      { type: "button", label: "Safety Center", href: o.links.safety, art: icon("people"), hint: "How we keep Puddleton friendly, and what to do if something feels wrong." },
    ] },
    { id: "about", name: "About", blurb: "", rows: [
      { type: "html", html: `<div class="scr-set-about"><img class="scr-set-logo" src="${brand("logo-359.png")}" width="359" height="175" alt="Puddleton After Dark">
        <dl><dt>Version</dt><dd>${esc(o.version)}</dd><dt>Made by</dt><dd>After Dark</dd></dl>
        <p class="scr-note">A cozy little Mafia game about jelly-bean folk on a floating island. Thank you for playing.</p></div>` },
      { type: "links", links: [["Credits", o.links.credits]] },
    ] },
  ];
}

function rowHtml(r, s) {
  const id = nextId("set"), val = r.path?.split(".").reduce((a, k) => a?.[k], s);
  const hint = r.hint ? `<small id="${id}h">${esc(r.hint)}</small>` : "";
  switch (r.type) {
    case "range":
      return `<div class="scr-set-row range"><label class="scr-label" for="${id}">${esc(r.label)}</label><b class="scr-set-val" aria-hidden="true">${val}</b>
        <input class="scr-range" id="${id}" type="range" min="0" max="100" step="5" value="${val}" data-path="${r.path}" style="--p:${val}%"></div>`;
    case "switch":
      return `<div class="scr-set-row"><button class="scr-switch" role="switch" aria-checked="${!!val}" data-path="${r.path}" ${r.hint ? `aria-describedby="${id}h"` : ""}>
        <span>${esc(r.label)}${hint}</span><i aria-hidden="true"></i></button>
        ${r.swatch ? `<div class="scr-set-swatch" aria-hidden="true"><span class="town">Town</span><span class="mafia">Mafia</span><span class="solo">Wildcard</span></div>` : ""}</div>`;
    case "seg":
      return `<div class="scr-set-row seg"><span class="scr-label" id="${id}">${esc(r.label)}</span>
        <div class="scr-seg" role="radiogroup" aria-labelledby="${id}" ${r.hint ? `aria-describedby="${id}h"` : ""} data-path="${r.path}">
        ${r.options.map(([v, t]) => `<button role="radio" aria-checked="${v === val}" data-value="${v}">${esc(t)}</button>`).join("")}</div>${hint ? `<p class="scr-note">${hint}</p>` : ""}</div>`;
    case "list":
      return `<div class="scr-set-row list"><span class="scr-label">${esc(r.label)}</span><ul class="scr-list" data-list="${r.path}" data-empty="${esc(r.empty)}" data-action="${esc(r.action)}"></ul></div>`;
    case "button":
      return `<div class="scr-set-row">${r.href
        ? `<a class="scr-set-action" href="${esc(r.href)}" ${r.href.startsWith("mailto:") ? "" : 'target="_blank" rel="noopener"'}>`
        : `<button class="scr-set-action" data-run="${id}" ${r.run ? "" : "disabled"}>`}
        ${r.art ? `<img src="${r.art}" alt="">` : ""}<span>${esc(r.label)}${hint}</span>${r.href ? "</a>" : "</button>"}</div>`;
    case "links":
      return `<div class="scr-set-row"><ul class="scr-set-links">${r.links.map(([t, h]) => `<li><a class="scr-link" href="${esc(h)}" target="_blank" rel="noopener">${esc(t)}</a></li>`).join("")}</ul></div>`;
    default:
      return `<div class="scr-set-row">${r.html}</div>`;
  }
}

let current = null;

// open({ band, version, section, links, onHowToPlay, onReplayTutorial, onClearData, settings }) -> Promise<void> (resolves on close)
// band defaults to the age gate's answer; adult-only rows (filter strength, chat with strangers) only show for "adult".
export function open({ band = getBand() || "child", version = "dev", section, links = {}, onHowToPlay, onReplayTutorial, onClearData, settings } = {}) {
  if (current) return current.promise;
  const o = { version, links: { ...LINKS, ...links }, onHowToPlay, onReplayTutorial, onClearData };
  const list = sections(band, o), tid = nextId("set");
  const runs = new Map();
  const L = layer({ cls: "scr-settings scr-veil", labelledby: tid, settings, escape: () => (narrow() && root.classList.contains("in-pane") ? back() : done()) });
  const s = getSettings();
  L.el.innerHTML = `<div class="scr-set scr-plate" data-band="${esc(band)}">
      <header class="scr-set-head">
        <button class="scr-tile scr-set-back" aria-label="Back to all settings"><img src="${uiIcon("back")}" alt=""></button>
        <div class="scr-set-titles"><span class="scr-eyebrow">Options</span><h2 class="scr-title small" id="${tid}">Settings</h2></div>
        <button class="scr-tile scr-set-close" aria-label="Close settings"><img src="${uiIcon("close")}" alt=""></button>
      </header>
      <div class="scr-set-body">
        <nav class="scr-set-nav" aria-label="Settings sections"><ul class="scr-menu">${list.map((x) => `<li><button class="scr-item" data-sec="${x.id}" aria-controls="${tid}-${x.id}">${esc(x.name)}<small class="scr-set-chev" aria-hidden="true"></small></button></li>`).join("")}</ul></nav>
        <div class="scr-set-panes">${list.map((x) => `<section class="scr-set-pane" id="${tid}-${x.id}" data-pane="${x.id}" aria-labelledby="${tid}-${x.id}h" hidden>
          <h3 class="scr-set-h" id="${tid}-${x.id}h" tabindex="-1">${esc(x.name)}</h3>${x.blurb ? `<p class="scr-note scr-set-blurb">${esc(x.blurb)}</p>` : ""}
          ${x.rows.map((r) => { const h = rowHtml(r, s); const m = h.match(/data-run="([^"]+)"/); if (m) runs.set(m[1], r.run); return h; }).join("")}</section>`).join("")}</div>
      </div>
    </div>`;
  const root = L.$(".scr-set"), narrow = () => matchMedia("(max-width: 759px)").matches;

  // ---- lists of muted and blocked players ----
  const drawLists = () => {
    const now = getSettings();
    for (const ul of L.$$("[data-list]")) {
      const items = ul.dataset.list.split(".").reduce((a, k) => a[k], now);
      ul.innerHTML = items.length ? items.map((p) => `<li><span class="scr-set-who">${esc(p.name)}</span><button class="scr-btn small dark" data-unlist="${esc(p.id)}">${esc(ul.dataset.action)}</button></li>`).join("")
        : `<li class="scr-empty">${esc(ul.dataset.empty)}</li>`;
    }
  };
  drawLists();

  // ---- sections ----
  let sec = section && list.some((x) => x.id === section) ? section : list[0].id;
  const show = (id, { focusPane = false } = {}) => {
    sec = id;
    L.$$(".scr-set-pane").forEach((p) => (p.hidden = p.dataset.pane !== id));
    L.$$("[data-sec]").forEach((b) => b.setAttribute("aria-current", String(b.dataset.sec === id)));
    if (narrow()) { root.classList.add("in-pane"); L.$(".scr-set-titles .scr-title").textContent = list.find((x) => x.id === id).name; }
    if (focusPane) L.$(`[data-pane="${id}"] .scr-set-h`).focus({ preventScroll: true });
    L.$(".scr-set-panes").scrollTop = 0;
  };
  const back = () => {
    root.classList.remove("in-pane"); L.$(".scr-set-titles .scr-title").textContent = "Settings";
    L.$(`[data-sec="${sec}"]`)?.focus();
  };
  L.$(".scr-set-nav").addEventListener("click", (e) => { const b = e.target.closest("[data-sec]"); if (b) show(b.dataset.sec, { focusPane: narrow() }); });
  L.$(".scr-set-nav").addEventListener("keydown", (e) => {
    const items = L.$$("[data-sec]"), i = items.indexOf(document.activeElement);
    if (i < 0) return;
    const step = { ArrowDown: 1, ArrowUp: -1 }[e.key];
    if (step) { e.preventDefault(); const n = items[(i + step + items.length) % items.length]; n.focus(); if (!narrow()) show(n.dataset.sec); }
    else if (e.key === "ArrowRight" && !narrow()) { e.preventDefault(); focusables(L.$(`[data-pane="${sec}"]`))[0]?.focus(); }
  });
  L.$(".scr-set-back").onclick = back;
  L.$(".scr-set-close").onclick = () => done();

  // ---- controls ----
  const body = L.$(".scr-set-panes");
  body.addEventListener("input", (e) => {
    const r = e.target.closest(".scr-range"); if (!r) return;
    r.style.setProperty("--p", r.value + "%"); r.parentElement.querySelector(".scr-set-val").textContent = r.value;
    setSetting(r.dataset.path, +r.value);
  });
  body.addEventListener("click", (e) => {
    const sw = e.target.closest(".scr-switch");
    if (sw) {
      const on = sw.getAttribute("aria-checked") !== "true"; sw.setAttribute("aria-checked", String(on));
      setSetting(sw.dataset.path, on);
      if (sw.dataset.path === "display.reduceMotion") L.el.classList.toggle("scr-calm", on || matchMedia("(prefers-reduced-motion: reduce)").matches);
      return;
    }
    const un = e.target.closest("[data-unlist]");
    if (un) {
      const path = un.closest("[data-list]").dataset.list, now = getSettings();
      const next = path.split(".").reduce((a, k) => a[k], now).filter((p) => p.id !== un.dataset.unlist);
      const li = un.closest("li"), sib = li.nextElementSibling || li.previousElementSibling;
      setSetting(path, next); drawLists();
      (sib && L.$(`[data-unlist="${CSS.escape(sib.querySelector("[data-unlist]")?.dataset.unlist || "")}"]`) || L.$(`[data-pane="${sec}"] .scr-set-h`))?.focus();
      return;
    }
    const run = e.target.closest("[data-run]");
    if (run) runs.get(run.dataset.run)?.();
  });
  for (const g of L.$$(".scr-seg")) radios(g, (v) => setSetting(g.dataset.path, v));

  let resolve;
  const promise = new Promise((r) => (resolve = r));
  const done = () => { if (!current) return; current = null; L.close(); resolve(); };
  current = { promise, close: done, refresh: drawLists };
  show(sec);
  if (narrow()) { root.classList.remove("in-pane"); L.$(".scr-set-titles .scr-title").textContent = "Settings"; if (section) show(sec, { focusPane: true }); else L.focus(L.$("[data-sec]")); }
  else L.focus(L.$(`[data-sec="${sec}"]`));
  return promise;
}

export function close() { current?.close(); }
// Redraws the muted and blocked lists if the menu is open (call after muting or blocking someone elsewhere).
export function refresh() { current?.refresh(); }
