// Report a player, plus the mute and block confirmations. Each returns the player's choice; sending it is the
// game's job.
import { layer, esc, nextId, icon, uiIcon, radios, bean, asset } from "./base.mjs";
import { confirm } from "./confirm.mjs";

export const REASONS = [
  ["language", "Bad words"], ["bullying", "Bullying or being mean"], ["cheating", "Cheating or teaming"],
  ["sharing", "Sharing personal info"], ["asking", "Asking for personal info"], ["name", "Inappropriate name"], ["other", "Something else"],
];
export const reasonText = (id) => REASONS.find(([k]) => k === id)?.[1] || id;

// report({ target: { id, name }, allowNote = true, thanks = true, settings }) -> Promise<{ reason, note } | null>
// reason is one of the REASONS ids. Resolves when the report is sent; with thanks the dialog then says thank you
// before it closes. allowNote = false hides the free text note (for example for younger players).
export function report({ target = {}, allowNote = true, thanks = true, settings } = {}) {
  return new Promise((resolve) => {
    const tid = nextId("rp"), did = nextId("rp"), name = target.name || "this player";
    const L = layer({ cls: "scr-report scr-veil", labelledby: tid, describedby: did, settings, escape: () => cancel() });
    L.el.innerHTML = `<div class="scr-dialog scr-plate scr-rp">
        <div class="scr-head"><div><span class="scr-eyebrow">Report a player</span><h2 class="scr-title small" id="${tid}">Report ${esc(name)}</h2></div>
          <button class="scr-tile" data-cancel aria-label="Close"><img src="${uiIcon("close")}" alt=""></button></div>
        <form class="scr-rp-form" novalidate>
          <p class="scr-lede" id="${did}">What happened? Pick the closest one.</p>
          <div class="scr-rp-reasons" role="radiogroup" aria-labelledby="${did}">
            ${REASONS.map(([k, t]) => `<button type="button" role="radio" aria-checked="false" data-value="${k}"><i aria-hidden="true"></i>${esc(t)}</button>`).join("")}</div>
          ${allowNote ? `<label class="scr-field scr-rp-note"><span class="scr-label">Anything else we should know? <small>Optional</small></span>
            <textarea class="scr-input" maxlength="140" rows="2" placeholder="A few words help us understand"></textarea><span class="scr-count" aria-hidden="true">0 / 140</span></label>` : ""}
          <p class="scr-note">Reports are private. ${esc(name)} will not know who sent it. <a class="scr-link" href="${asset("../legal/safety.html")}" target="_blank" rel="noopener">How we handle reports</a></p>
          <div class="scr-actions"><button type="button" class="scr-btn dark" data-cancel>Cancel</button><button type="submit" class="scr-btn rose" disabled>Send report</button></div>
        </form>
        <div class="scr-rp-thanks" hidden tabindex="-1">
          <div class="scr-rp-art" aria-hidden="true">${bean("#a5ecb0", { size: 4 })}<img src="${icon("flag")}" alt="">${bean("#8fd6ff", { size: 4 })}</div>
          <h2 class="scr-title small">Thanks for telling us</h2>
          <p class="scr-lede">We will take a look. You can also mute or block ${esc(name)} from their name.</p>
          <div class="scr-actions"><button class="scr-btn" data-done>Done</button></div>
        </div>
      </div>`;
    let reason = null, settled = false;
    const send = L.$("[type=submit]"), note = L.$("textarea");
    radios(L.$(".scr-rp-reasons"), (v) => { reason = v; send.disabled = false; });
    note?.addEventListener("input", () => { L.$(".scr-count").textContent = `${note.value.length} / 140`; });
    const cancel = () => { if (!settled) { settled = true; resolve(null); } L.close(); };
    L.$$("[data-cancel]").forEach((b) => (b.onclick = cancel));
    L.$("form").onsubmit = (e) => {
      e.preventDefault();
      if (!reason || settled) return;
      settled = true;
      resolve({ reason, note: (note?.value || "").trim() });
      if (!thanks) return L.close();
      L.$("form").hidden = true; L.$(".scr-head").hidden = true;
      const box = L.$(".scr-rp-thanks"); box.hidden = false;
      L.el.removeAttribute("aria-labelledby"); L.el.removeAttribute("aria-describedby"); L.el.setAttribute("aria-label", "Report sent");
      L.setEscape(() => L.close());
      L.$("[data-done]").onclick = () => L.close();
      L.focus(L.$("[data-done]"));
    };
    L.focus(L.$('[role="radio"]'));
  });
}

// confirmMute({ target, settings }) -> Promise<boolean>
export function confirmMute({ target = {}, settings } = {}) {
  const n = target.name || "this player";
  return confirm({ title: `Mute ${n}?`, message: `You will not see messages or emotes from ${n}. They will not be told.`, yes: "Mute", art: icon("mute"), settings });
}

// confirmBlock({ target, settings }) -> Promise<boolean>
export function confirmBlock({ target = {}, settings } = {}) {
  const n = target.name || "this player";
  return confirm({ title: `Block ${n}?`, message: `${n} cannot whisper to you, join your rooms or send you a friend link. You can unblock them in Settings.`,
    yes: "Block", danger: true, art: icon("block"), settings });
}
