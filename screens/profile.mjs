// The player's own profile: their player card (bean, name, stats, wins per role), the items they own,
// their friend link, friend requests waiting for an answer, and their friends. Data comes in through open() and
// update(); every action goes out through the on.* callbacks. Nothing in here talks to the network.
import { layer, esc, nextId, uiIcon, icon, bean, BEAN_COLORS, roleName, MODES, ROLES } from "./base.mjs";
import { confirm } from "./confirm.mjs";

const ROLE_ORDER = ["villager", "angel", "detective", "vigilante", "mayor", "mafia", "godfather", "framer", "jester", "serialkiller"];
const RACK_NAMES = { body: "Bean colors", head: "Head", pack: "Backpacks", house: "Houses", killfx: "Kill effects", tomb: "Tombstones", emote: "Emotes", dance: "Dances" };

let current = null;

// open({
//   player: { id, name, look },                       look is a cosmetics look ({ body, head, pack, ... })
//   owned: { body: [ids], head: [ids], ... },         items the player owns, by rack
//   stats: { played, wins, roles: { [role]: { played, wins } } },
//   friendLink: "https://...",                         each link works once, then the game makes a new one
//   friends: [{ id, name, look, online, room: { code, mode, players, max } | null }],
//   requests: [{ id, name, look }],                    people who opened your friend link and wait for an answer
//   on: { copy(url), share(url), resetLink() -> Promise<newUrl>, join(friend), remove(friend) -> Promise|void, wardrobe(),
//         accept(req) -> Promise<friend|void>,          resolve with the new friend to list it at once
//         decline(req) -> Promise|void },                a decline is silent: the other player is never told
//   tab: "card" | "items" | "friends",                 the first tab on phones (PC always shows the card)
//   friendsTab = true,                                 false hides friends and the friend link (younger players)
//   portrait(role, look), preview(rack, id, look, size), catalog,   default to ../world.mjs and ../cosmetics.mjs
//   settings
// }) -> Promise<void>, resolves when closed
export async function open(opts = {}) {
  if (current) { current.update(opts); return current.promise; }
  const o = { player: { name: "You" }, owned: {}, stats: {}, friendLink: "", friends: [], requests: [], on: {}, tab: "card", friendsTab: true, ...opts };
  if (!o.friendsTab && o.tab === "friends") o.tab = "card";
  if (!o.portrait || !o.preview || !o.catalog) {
    try { const [w, c] = await Promise.all([import("../world.mjs"), import("../cosmetics.mjs")]); o.portrait ||= w.portrait; o.preview ||= c.preview; o.catalog ||= c.SHOP; }
    catch { /* no WebGL or no three: pixel beans instead */ }
  }
  const tid = nextId("pf");
  const L = layer({ cls: "scr-profile scr-veil", labelledby: tid, settings: o.settings, escape: () => done() });
  L.el.innerHTML = `<div class="scr-pf scr-plate">
      <header class="scr-pf-head"><div><span class="scr-eyebrow">Profile</span><h2 class="scr-title small" id="${tid}">Your player card</h2></div>
        <button class="scr-tile" data-close aria-label="Close profile"><img src="${uiIcon("close")}" alt=""></button></header>
      <nav class="scr-pf-tabs" role="tablist" aria-label="Profile sections">
        <button role="tab" data-tab="card" id="${tid}-tcard" aria-controls="${tid}-card">Card</button>
        ${o.friendsTab ? `<button role="tab" data-tab="friends" id="${tid}-tfriends" aria-controls="${tid}-friends">Friends</button>` : ""}
        <button role="tab" data-tab="items" id="${tid}-titems" aria-controls="${tid}-items">Items</button></nav>
      <div class="scr-pf-body">
        <section class="scr-pf-card" role="tabpanel" id="${tid}-card" aria-labelledby="${tid}-tcard"></section>
        <section class="scr-pf-pane" role="tabpanel" id="${tid}-friends" data-pane="friends" aria-labelledby="${tid}-tfriends"></section>
        <section class="scr-pf-pane" role="tabpanel" id="${tid}-items" data-pane="items" aria-labelledby="${tid}-titems"></section>
      </div></div>`;
  const wide = () => matchMedia("(min-width: 900px)").matches;
  const imgFace = (role, look, i, size) => {
    try { if (o.portrait) return `<img class="scr-pf-face" src="${o.portrait(role || null, look)}" width="${size}" height="${size}" alt="">`; } catch { /* fall through */ }
    return `<span class="scr-pf-face">${bean(BEAN_COLORS[i % 8], { size: Math.max(2, Math.round(size / 18)) })}</span>`;
  };

  // ---- the player card ----
  const drawCard = () => {
    const s = o.stats || {}, played = s.played || 0, wins = s.wins || 0, rate = played ? Math.round((wins / played) * 100) : 0;
    const rows = ROLE_ORDER.map((r) => {
      const x = s.roles?.[r] || { played: 0, wins: 0 }, f = x.played ? x.wins / x.played : 0;
      return `<li data-side="${ROLES[r].side}" class="${x.played ? "" : "none"}"><span>${esc(roleName(r))}</span>
        <i class="scr-pf-bar" aria-hidden="true"><b style="width:${Math.round(f * 100)}%"></b></i><em>${x.played ? `${x.wins} of ${x.played}` : "Not yet"}</em></li>`;
    }).join("");
    L.$(".scr-pf-card").innerHTML = `<div class="scr-pf-me scr-plate gold">
        ${imgFace(null, o.player.look, 0, 160)}
        <div class="scr-pf-id"><p class="scr-pf-name">${esc(o.player.name)}</p>
          ${o.on.wardrobe ? `<button class="scr-tile" data-act="wardrobe"><img src="${uiIcon("hanger")}" alt=""><span>Wardrobe</span></button>` : ""}</div>
      </div>
      <dl class="scr-pf-stats"><div><dt>Games</dt><dd>${played}</dd></div><div><dt>Wins</dt><dd>${wins}</dd></div><div><dt>Win rate</dt><dd>${rate}%</dd></div></dl>
      <h3 class="scr-pf-h">Wins by role</h3><ul class="scr-pf-roles">${rows}</ul>`;
  };

  // ---- friends and the friend link ----
  let note = "";
  const drawFriends = () => {
    const can = typeof navigator.share === "function" || o.on.share;
    const order = (f) => (f.online && f.room ? 0 : f.online ? 1 : 2);
    const list = [...(o.friends || [])].sort((a, b) => order(a) - order(b) || a.name.localeCompare(b.name));
    const reqs = o.requests || [];
    const status = (f) => f.online && f.room ? `<span class="scr-pip room"></span>In a ${MODES[f.room.mode] ? esc(MODES[f.room.mode].name) + " " : ""}room${f.room.players ? `, ${f.room.players} of ${f.room.max || 16}` : ""}`
      : f.online ? `<span class="scr-pip on"></span>Online` : `<span class="scr-pip"></span>Offline`;
    L.$('[data-pane="friends"]').innerHTML = `<div class="scr-pf-link">
        <span class="scr-eyebrow amber">Your friend link</span>
        <div class="scr-pf-linkrow"><input class="scr-input" readonly value="${esc(o.friendLink || "")}" aria-label="Your friend link" placeholder="Making your link">
          <button class="scr-tile" data-act="copy" aria-label="Copy link"><img src="${icon("copy")}" alt=""><span>Copy</span></button>
          ${can ? `<button class="scr-tile" data-act="share" aria-label="Share link"><img src="${uiIcon("share")}" alt=""><span>Share</span></button>` : ""}</div>
        <p class="scr-note">Send it to someone you know. Each link works once, then a fresh one appears here.
          ${o.on.resetLink ? `<button class="scr-link" data-act="reset"><img src="${icon("refresh", null, true)}" data-sm alt="" width="16" height="16">Make a new link</button>` : ""}</p>
        <p class="scr-pf-flash" role="status">${esc(note)}</p>
      </div>
      ${reqs.length ? `<h3 class="scr-pf-h">Requests <small>${reqs.length}</small></h3>
      <ul class="scr-list scr-pf-friends scr-pf-reqs">${reqs.map((r, i) => `<li>
          ${imgFace(null, r.look, i + 3, 56)}
          <div class="scr-pf-fr"><b>${esc(r.name)}</b><small>Wants to be your friend</small></div>
          <button class="scr-btn small alt" data-accept="${esc(r.id)}" aria-label="Accept ${esc(r.name)}">Accept</button>
          <button class="scr-link danger" data-decline="${esc(r.id)}" aria-label="Decline ${esc(r.name)}">Decline</button></li>`).join("")}</ul>` : ""}
      <h3 class="scr-pf-h">Friends <small>${list.length}</small></h3>
      ${list.length ? `<ul class="scr-list scr-pf-friends">${list.map((f, i) => `<li class="${f.online ? "on" : ""}">
          ${imgFace(null, f.look, i + 1, 56)}
          <div class="scr-pf-fr"><b>${esc(f.name)}</b><small>${status(f)}</small></div>
          ${f.online && f.room ? `<button class="scr-btn small" data-join="${esc(f.id)}">Join</button>` : ""}
          ${o.on.remove ? `<button class="scr-link danger" data-remove="${esc(f.id)}" aria-label="Remove ${esc(f.name)}">Remove</button>` : ""}</li>`).join("")}</ul>`
        : `<p class="scr-empty scr-pf-none">${bean("#cdb4ff", { size: 3 })}<span>No friends yet. Share your friend link with someone you know and trust.</span></p>`}`;
  };

  // ---- owned items ----
  const drawItems = () => {
    const owned = Object.fromEntries(Object.keys(RACK_NAMES).map((r) => [r, (o.owned?.[r] || []).filter((id) => id !== "none")]));   // "none" is the empty slot, not an item
    const racks = Object.keys(RACK_NAMES).filter((r) => owned[r].length);
    const total = racks.reduce((n, r) => n + owned[r].length, 0);
    const look = o.player.look || {};
    const name = (r, id) => o.catalog?.[r]?.find((x) => x.id === id)?.name || id;
    const thumb = (r, id) => { try { if (o.preview) return `<img src="${o.preview(r, id, look, 64)}" width="64" height="64" alt="">`; } catch { /* no WebGL */ } return `<span class="scr-pf-blank"></span>`; };
    L.$('[data-pane="items"]').innerHTML = `<h3 class="scr-pf-h">Your items <small>${total}</small></h3>` + (racks.length ? racks.map((r) => `<div class="scr-pf-rack">
        <p class="scr-eyebrow">${esc(RACK_NAMES[r])}</p>
        <ul class="scr-pf-items">${owned[r].map((id) => `<li class="${look[r] === id ? "worn" : ""}">${thumb(r, id)}<span>${esc(name(r, id))}</span>${look[r] === id ? `<em>Wearing</em>` : ""}</li>`).join("")}</ul></div>`).join("")
      : `<p class="scr-empty">Nothing here yet. Items you earn show up here.</p>`);
  };

  // ---- tabs ----
  let tab = o.tab;
  const showTab = (t, focus) => {
    if (wide() && t === "card") t = o.friendsTab ? "friends" : "items";
    if (!o.friendsTab && t === "friends") t = "items";
    tab = t;
    L.$$("[role=tab]").forEach((b) => { const on = b.dataset.tab === t; b.setAttribute("aria-selected", String(on)); b.tabIndex = on ? 0 : -1; if (on && focus) b.focus(); });
    L.$(".scr-pf-card").hidden = !wide() && t !== "card";
    L.$$(".scr-pf-pane").forEach((p) => (p.hidden = p.dataset.pane !== t));
  };
  L.$(".scr-pf-tabs").addEventListener("click", (e) => { const b = e.target.closest("[role=tab]"); if (b) showTab(b.dataset.tab); });
  L.$(".scr-pf-tabs").addEventListener("keydown", (e) => {
    const tabs = L.$$("[role=tab]").filter((b) => b.offsetParent), i = tabs.indexOf(document.activeElement), d = { ArrowRight: 1, ArrowLeft: -1 }[e.key];
    if (i >= 0 && d) { e.preventDefault(); showTab(tabs[(i + d + tabs.length) % tabs.length].dataset.tab, true); }
  });
  const mq = matchMedia("(min-width: 900px)"), onMq = () => showTab(tab);
  mq.addEventListener("change", onMq);

  // ---- actions ----
  const flash = (t) => { note = t; const el = L.$(".scr-pf-flash"); if (el) el.textContent = t; clearTimeout(flash.t); flash.t = setTimeout(() => { note = ""; const e2 = L.$(".scr-pf-flash"); if (e2) e2.textContent = ""; }, 2600); };
  L.el.addEventListener("click", async (e) => {
    const t = e.target.closest("[data-act], [data-join], [data-remove], [data-accept], [data-decline], [data-close]");
    if (!t) return;
    if (t.hasAttribute("data-close")) return done();
    const act = t.dataset.act, url = o.friendLink;
    if (act === "copy") {
      try { await navigator.clipboard.writeText(url); flash("Link copied."); } catch { L.$(".scr-pf-linkrow input").select(); flash("Press and hold the link to copy it."); }
      o.on.copy?.(url);
    } else if (act === "share") {
      if (o.on.share) o.on.share(url);
      else { try { await navigator.share({ title: "Puddleton", text: "Be my friend on Puddleton!", url }); } catch { /* cancelled */ } }
    } else if (act === "reset") {
      const ok = await confirm({ title: "Make a new link?", message: "Your current link stops working right away.", yes: "New link", settings: o.settings });
      if (!ok) return;
      const next = await o.on.resetLink?.();
      if (typeof next === "string") { o.friendLink = next; drawFriends(); flash("Here is your new link."); }
    } else if (act === "wardrobe") { o.on.wardrobe?.(); }
    else if (t.dataset.join) { const f = o.friends.find((x) => x.id === t.dataset.join); if (f) o.on.join?.(f); }
    else if (t.dataset.accept || t.dataset.decline) {
      const yes = !!t.dataset.accept, id = t.dataset.accept || t.dataset.decline, r = (o.requests || []).find((x) => x.id === id);
      if (!r) return;
      t.disabled = true;
      let res;
      try { res = await (yes ? o.on.accept : o.on.decline)?.(r); } catch { t.disabled = false; flash("That did not work. Try again."); return; }
      o.requests = o.requests.filter((x) => x.id !== id);
      if (yes && res && typeof res === "object" && res.id && !o.friends.some((f) => f.id === res.id)) o.friends = [...o.friends, res];
      drawFriends();
      flash(yes ? `You and ${r.name} are friends now.` : "Request declined.");
    }
    else if (t.dataset.remove) {
      const f = o.friends.find((x) => x.id === t.dataset.remove); if (!f) return;
      const ok = await confirm({ title: `Remove ${f.name}?`, message: "You can add each other again later with a friend link.", yes: "Remove", danger: true, settings: o.settings });
      if (!ok) return;
      await o.on.remove?.(f);
      o.friends = o.friends.filter((x) => x.id !== f.id); drawFriends(); L.$(".scr-pf-h")?.focus?.();
    }
  });

  let resolve;
  const promise = new Promise((r) => (resolve = r));
  const done = () => { if (!current) return; current = null; mq.removeEventListener("change", onMq); L.close(); resolve(); };
  current = {
    promise, close: done,
    update(p = {}) { Object.assign(o, p); if (p.player || p.stats) drawCard(); if (p.friends || p.requests || p.friendLink !== undefined) drawFriends(); if (p.owned || p.player) drawItems(); },
  };
  drawCard(); drawFriends(); drawItems(); showTab(tab);
  L.focus(L.$("[data-close]"));
  return promise;
}

// Changes what an open profile shows: update({ friends }), update({ requests }), update({ friendLink }), update({ stats })...
export function update(p) { current?.update(p); }
export function close() { current?.close(); }
