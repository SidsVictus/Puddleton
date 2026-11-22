// Quick Play: the public rooms to join, Quick join for the best one, and Create a room (public or private with a
// room pass). Data comes in through open() and update(); actions go out through the on.* callbacks.
// A callback that returns true finishes the screen; a string is shown to the player as the reason it did not work.
import { layer, esc, nextId, uiIcon, icon, asset, MODES, radios, bean } from "./base.mjs";

const LOCK = asset("../lock.svg");
const PASS = /^[A-Za-z0-9]{4,12}$/;
let current = null;

// open({ rooms: [{ id, name, mode, players, max = 16, narrator: "bot" | "human", private }] | null (still loading),
//        on: { refresh() -> Promise<rooms>, join(room, pass?) -> Promise<true | string>, quickJoin() -> Promise<true | string>,
//              create({ visibility: "public" | "private", pass }) -> Promise<true | string> },
//        settings }) -> Promise<"joined" | "created" | "closed">
export function open({ rooms = null, on = {}, settings } = {}) {
  if (current) { current.update(rooms); return current.promise; }
  const tid = nextId("rl");
  const L = layer({ cls: "scr-rooms scr-veil", labelledby: tid, settings, escape: () => done("closed") });
  L.el.innerHTML = `<div class="scr-rl scr-plate">
      <header class="scr-rl-head"><div><span class="scr-eyebrow">Quick Play</span><h2 class="scr-title small" id="${tid}">Find a room</h2></div>
        <button class="scr-tile" data-refresh aria-label="Refresh the list"><img src="${icon("refresh")}" alt=""></button>
        <button class="scr-tile" data-close aria-label="Close"><img src="${uiIcon("close")}" alt=""></button></header>
      <div class="scr-rl-top">
        <button class="scr-rl-big quick" data-quick><img src="${icon("ferry")}" alt=""><span><b>Quick join</b><small>Hop into the best open room</small></span></button>
        <button class="scr-rl-big make" data-create><img src="${uiIcon("crown")}" alt=""><span><b>Create a room</b><small>Public or private, you pick</small></span></button>
      </div>
      <p class="scr-rl-status" role="status"></p>
      <div class="scr-rl-listhead"><h3>Open rooms</h3><small data-count></small></div>
      <ul class="scr-rl-list" aria-labelledby="${tid}"></ul>
    </div>`;
  const listEl = L.$(".scr-rl-list"), status = (t, bad) => { const s = L.$(".scr-rl-status"); s.textContent = t || ""; s.classList.toggle("bad", !!bad); };
  let data = rooms;

  const draw = () => {
    if (!data) { listEl.innerHTML = `<li class="scr-rl-wait">Looking for rooms<span class="scr-dots" aria-hidden="true"><i></i><i></i><i></i></span></li>`; L.$("[data-count]").textContent = ""; return; }
    const open = data.filter((r) => r.players < (r.max || 16));
    L.$("[data-count]").textContent = data.length ? `${open.length} with space` : "";
    if (!data.length) {
      listEl.innerHTML = `<li class="scr-rl-empty"><div class="scr-rl-sleep" aria-hidden="true">${bean("#cdb4ff", { size: 4, closed: true })}<span>z</span><span>z</span></div>
        <b>No open rooms right now</b><p class="scr-note">Make one and your friends can hop in.</p><button class="scr-btn alt" data-create>Create a room</button></li>`;
      return;
    }
    listEl.innerHTML = data.map((r) => {
      const max = r.max || 16, full = r.players >= max, m = MODES[r.mode] ? r.mode : "classic";
      return `<li class="scr-rl-room${full ? " full" : ""}">
        <span class="scr-rl-mode" data-mode="${m}">${esc(MODES[m].name)}</span>
        <div class="scr-rl-info"><b>${esc(r.name || "Open room")}${r.private ? `<img class="scr-rl-lock" src="${LOCK}" alt="Private room" title="Private room">` : ""}</b>
          <small><img src="${uiIcon(r.narrator === "human" ? "book" : "clock")}" alt="">${r.narrator === "human" ? "Grandmaster narrates" : "Town clock narrates"}</small></div>
        <div class="scr-rl-count" aria-label="${r.players} of ${max} players"><span><b>${r.players}</b> / ${max}</span><i aria-hidden="true"><b style="width:${Math.round((r.players / max) * 100)}%"></b></i></div>
        <button class="scr-btn small${r.private ? " dark" : ""}" data-join="${esc(r.id)}" ${full ? "disabled" : ""} aria-label="${full ? "Full" : `Join ${esc(r.name || "room")}`}">${full ? "Full" : "Join"}</button></li>`;
    }).join("");
  };

  const busy = (on) => L.el.classList.toggle("busy", on);
  const outcome = (res, what) => { if (res === true) done(what); else if (typeof res === "string") status(res, true); };
  L.el.addEventListener("click", async (e) => {
    const t = e.target.closest("[data-refresh], [data-close], [data-quick], [data-create], [data-join]");
    if (!t) return;
    if (t.hasAttribute("data-close")) return done("closed");
    if (L.el.classList.contains("busy")) return;
    if (t.hasAttribute("data-refresh")) {
      if (!on.refresh) return;
      busy(true); status("Refreshing");
      try { const next = await on.refresh(); if (Array.isArray(next)) { data = next; draw(); } status(""); } catch { status("Could not refresh. Try again in a moment.", true); }
      busy(false);
    } else if (t.hasAttribute("data-quick")) {
      busy(true); status("Finding you a seat");
      try { outcome(await on.quickJoin?.(), "joined"); } catch { status("Could not join right now.", true); }
      busy(false);
    } else if (t.hasAttribute("data-create")) {
      const res = await createDialog(on, settings);
      if (res === true) done("created");
    } else if (t.dataset.join) {
      const room = data.find((r) => r.id === t.dataset.join); if (!room) return;
      if (room.private) { if ((await passDialog(room, on, settings)) === true) done("joined"); return; }
      busy(true); status(`Joining ${room.name || "the room"}`);
      try { outcome(await on.join?.(room), "joined"); } catch { status("Could not join right now.", true); }
      busy(false);
    }
  });

  let resolve;
  const promise = new Promise((r) => (resolve = r));
  const done = (v) => { if (!current) return; current = null; L.close(); resolve(v); };
  current = { promise, close: () => done("closed"), update: (r) => { data = r; draw(); } };
  draw();
  L.focus(L.$("[data-quick]"));
  return promise;
}

// Swaps the list shown (pass null to show the loading state).
export function update(rooms) { current?.update(rooms); }
export function close() { current?.close(); }

// ---------- the small dialogs ----------
// passDialog(room, on, settings) -> Promise<boolean>: asks for a private room's pass and calls on.join(room, pass)
// until it returns true (also used by the game when a room code turns out to need a pass).
export function passDialog(room, on, settings) {
  return new Promise((resolve) => {
    const tid = nextId("rp");
    const L = layer({ cls: "scr-roompass scr-veil", labelledby: tid, settings, escape: () => end(false) });
    L.el.innerHTML = `<form class="scr-dialog scr-plate scr-rl-form" novalidate>
        <img class="scr-rl-formart" src="${LOCK}" alt="">
        <span class="scr-eyebrow">${esc(room.name || "Private room")}</span><h2 class="scr-title small" id="${tid}">This room has a pass</h2>
        <label class="scr-field"><span class="scr-label">Room pass</span><input class="scr-input" name="pass" maxlength="12" autocomplete="off" autocapitalize="off" spellcheck="false"></label>
        <p class="scr-rl-err" role="alert"></p>
        <div class="scr-actions"><button type="button" class="scr-btn dark" data-no>Cancel</button><button type="submit" class="scr-btn">Join</button></div></form>`;
    const f = L.$("form"), err = L.$(".scr-rl-err");
    const end = (v) => { L.close(); resolve(v); };
    L.$("[data-no]").onclick = () => end(false);
    f.onsubmit = async (e) => {
      e.preventDefault();
      const pass = f.pass.value.trim();
      if (!pass) { err.textContent = "Type the room pass your friend gave you."; return; }
      f.querySelector("[type=submit]").disabled = true;
      let res; try { res = await on.join?.(room, pass); } catch { res = "Could not join right now."; }
      f.querySelector("[type=submit]").disabled = false;
      if (res === true) end(true); else { err.textContent = typeof res === "string" ? res : "That pass did not work."; f.pass.select(); }
    };
    L.focus(f.pass);
  });
}

// Also used by the home screen's Create a room, after the narrator is picked.
export function createDialog(on, settings) {
  return new Promise((resolve) => {
    const tid = nextId("rc"), hid = nextId("rc");
    const L = layer({ cls: "scr-roomcreate scr-veil", labelledby: tid, settings, escape: () => end(false) });
    L.el.innerHTML = `<form class="scr-dialog scr-plate scr-rl-form" novalidate>
        <span class="scr-eyebrow">New room</span><h2 class="scr-title small" id="${tid}">Create a room</h2>
        <div class="scr-seg" role="radiogroup" aria-label="Who can find it" aria-describedby="${hid}">
          <button type="button" role="radio" aria-checked="true" data-value="public">Public</button><button type="button" role="radio" aria-checked="false" data-value="private">Private</button></div>
        <p class="scr-note" id="${hid}" data-hint>Anyone can find it in Quick Play.</p>
        <label class="scr-field scr-rl-pass" hidden><span class="scr-label">Room pass</span>
          <input class="scr-input" name="pass" maxlength="12" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="4 to 12 letters or numbers"></label>
        <p class="scr-rl-err" role="alert"></p>
        <div class="scr-actions"><button type="button" class="scr-btn dark" data-no>Cancel</button><button type="submit" class="scr-btn alt">Create</button></div></form>`;
    const f = L.$("form"), err = L.$(".scr-rl-err"), passBox = L.$(".scr-rl-pass");
    let vis = "public";
    radios(L.$(".scr-seg"), (v) => {
      vis = v; passBox.hidden = v !== "private"; err.textContent = "";
      L.$("[data-hint]").textContent = v === "private" ? "Shows a lock in Quick Play. Players need the room pass to get in." : "Anyone can find it in Quick Play.";
    });
    const end = (v) => { L.close(); resolve(v); };
    L.$("[data-no]").onclick = () => end(false);
    f.onsubmit = async (e) => {
      e.preventDefault();
      const pass = f.pass.value.trim();
      if (vis === "private" && !PASS.test(pass)) { err.textContent = "Pick a pass of 4 to 12 letters or numbers."; f.pass.focus(); return; }
      f.querySelector("[type=submit]").disabled = true;
      let res; try { res = await on.create?.({ visibility: vis, pass: vis === "private" ? pass : "" }); } catch { res = "Could not create the room right now."; }
      f.querySelector("[type=submit]").disabled = false;
      if (res === true) end(true); else if (typeof res === "string") err.textContent = res;
    };
    L.focus(L.$('[role="radio"]'));
  });
}
