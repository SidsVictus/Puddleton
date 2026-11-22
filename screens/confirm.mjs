// A small yes or no dialog for moments like "Kick this player?" and "Leave the room?".
import { layer, esc, nextId, uiIcon } from "./base.mjs";

// confirm({ title, message, yes = "Yes", no = "Cancel", danger = false, art, settings }) -> Promise<boolean>
// art: an image URL, or the name of a game icon in ui/ ("door", "skull", "crown"...).
// Escape, a tap outside and the cancel button all resolve false. A danger dialog starts on the cancel button.
export function confirm({ title = "Are you sure?", message = "", yes = "Yes", no = "Cancel", danger = false, art = null, settings } = {}) {
  return new Promise((resolve) => {
    const tid = nextId("cf"), did = nextId("cf");
    const src = art && !/[/.:]/.test(art) ? uiIcon(art) : art;
    const L = layer({ cls: "scr-confirm scr-veil", labelledby: tid, describedby: message ? did : undefined, role: "alertdialog", settings, escape: () => done(false) });
    L.el.innerHTML = `<div class="scr-dialog scr-plate ${danger ? "rose" : ""}">
      ${src ? `<img class="scr-art" src="${esc(src)}" alt="">` : ""}
      <h2 class="scr-title" id="${tid}">${esc(title)}</h2>
      ${message ? `<p class="scr-lede" id="${did}">${esc(message)}</p>` : ""}
      <div class="scr-actions"><button class="scr-btn dark" data-no>${esc(no)}</button><button class="scr-btn ${danger ? "rose" : ""}" data-yes>${esc(yes)}</button></div>
    </div>`;
    let settled = false;
    const done = (v) => { if (settled) return; settled = true; L.close(); resolve(v); };
    L.$("[data-yes]").onclick = () => done(true);
    L.$("[data-no]").onclick = () => done(false);
    L.el.addEventListener("click", (e) => { if (e.target === L.el) done(false); });
    L.focus(L.$(danger ? "[data-no]" : "[data-yes]"));
  });
}
