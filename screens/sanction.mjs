// The notice a player sees when they are muted or banned: why, for how long, and how to ask us to look again.
import { layer, esc, nextId, icon, fmtClock, fmtSpan } from "./base.mjs";
import { reasonText } from "./report.mjs";

export const APPEAL_EMAIL = "sidsvictus@gmail.com";

// show({ kind: "muted" | "banned", reason, until: Date | null, playerName, appealEmail, settings }) -> Promise<void>
// reason: a report reason id ("language", "bullying", ...) or any short sentence. until: null means it does not end on its own.
export function show({ kind = "muted", reason = "", until = null, playerName = "", appealEmail = APPEAL_EMAIL, settings } = {}) {
  return new Promise((resolve) => {
    const tid = nextId("sn"), did = nextId("sn"), banned = kind === "banned";
    const end = until ? new Date(until) : null;
    const today = end && end.toDateString() === new Date().toDateString();
    const when = end
      ? `Ends ${today ? "today" : new Intl.DateTimeFormat(undefined, { weekday: "long", day: "numeric", month: "long" }).format(end)} at ${esc(fmtClock(end))}, in about ${esc(fmtSpan(end - Date.now()))}.`
      : `This does not end on its own.`;
    const mail = `mailto:${appealEmail}?subject=${encodeURIComponent(`Puddleton appeal${playerName ? `: ${playerName}` : ""}`)}&body=${encodeURIComponent(`Player name: ${playerName}\n\nWhy I think this was a mistake:\n\n`)}`;
    const L = layer({ cls: "scr-sanction scr-veil", labelledby: tid, describedby: did, role: "alertdialog", settings, escape: () => done() });
    L.el.innerHTML = `<div class="scr-dialog scr-plate rose scr-sn">
        <img class="scr-sn-art" src="${icon(banned ? "block" : "mute")}" alt="">
        <span class="scr-eyebrow">${banned ? "Account paused" : "Chat paused"}</span>
        <h2 class="scr-title" id="${tid}">${banned ? "You cannot play right now" : "You are muted"}</h2>
        <div id="${did}">
          <p class="scr-lede">${banned ? "Your access to Puddleton is paused after a report was checked by our team." : "You can keep playing, but chat is switched off for you after a report was checked by our team."}</p>
          <dl class="scr-sn-facts">
            ${reason ? `<div><dt>Why</dt><dd>${esc(reasonText(reason))}</dd></div>` : ""}
            <div><dt>How long</dt><dd>${when}</dd></div>
          </dl>
          <p class="scr-note scr-sn-appeal">Think we got it wrong? You or a grown-up can email <a href="${esc(mail)}">${esc(appealEmail)}</a> with your player name, and we will take another look.</p>
        </div>
        <div class="scr-actions"><button class="scr-btn" data-ok>OK</button></div>
      </div>`;
    const done = () => { L.close(); resolve(); };
    L.$("[data-ok]").onclick = done;
    L.focus(L.$("[data-ok]"));
  });
}
