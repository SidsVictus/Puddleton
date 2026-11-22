// Puddleton, the game client. The game server (server/PROTOCOL.md) runs every room; this page is a view of what it
// sends and a remote for what the player does. Networking lives in net.mjs, the ready-made screens in screens/.
import { phaseDuration, MAFIA_TEAM } from "./engine/engine.mjs";
import { createWorld, town, addBean, portrait, createMirror, BEAN_COLORS } from "./world.mjs";
import { applyQuality, quality, onQuality } from "./quality.mjs";
import { RACKS, SHOP, EMOTES, DEFAULT_LOOK, cleanLook, killMethod, preview } from "./cosmetics.mjs";
import { createStage } from "./stage.mjs";
import { initSound, click, sfx } from "./audio.mjs";
import { PROTOCOL } from "./config.mjs";
import { PHRASES, PHRASE_BY_ID } from "./phrases.mjs";
import { call, guest, ensureGuest, turnstileToken, device, RoomLink, FINAL, ApiError, NetError, STORAGE_KEYS } from "./net.mjs";
import { begin, started } from "./start.mjs";
import { layer, calm as calmScreens, nextId, uiIcon, icon } from "./screens/base.mjs";
import * as agegate from "./screens/agegate.mjs";
import { showLoading } from "./screens/loading.mjs";
import * as settingsMenu from "./screens/settings.mjs";
import { getSettings, setSetting, onChange } from "./screens/prefs.mjs";
import * as overlays from "./screens/overlays.mjs";
import * as credits from "./screens/credits.mjs";
import * as profile from "./screens/profile.mjs";
import * as phrasewheel from "./screens/phrasewheel.mjs";
import * as reports from "./screens/report.mjs";
import * as sanction from "./screens/sanction.mjs";
import * as roomlist from "./screens/roomlist.mjs";
import { confirm } from "./screens/confirm.mjs";
import { watchBattery } from "./screens/battery.mjs";

const VERSION = "1.0.0";
const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// Icons are small SVG files in ui/ (drawn by tools/ui.py, uiIcon picks the set for the picture quality); names without a file render nothing.
const ICONS = new Set(["back", "hanger", "help", "share", "door", "crown", "moon", "sun", "check", "skull", "clock", "book", "hourglass", "close"]);
const ic = (name, cls = "", sm = cls !== "huge") => (ICONS.has(name) ? `<img class="ic ${cls}" alt="" src="${uiIcon(name, null, sm)}"${sm ? " data-sm" : ""}>` : "");   // sm: drawn at 16px or less
const MORE = `<svg viewBox="0 0 20 20" width="20" height="20" fill="currentColor" aria-hidden="true"><path class="art-lo" shape-rendering="crispEdges" d="M2 8h4v4h-4zM8 8h4v4h-4zM14 8h4v4h-4z"/><path class="art-hi" d="M6 10a2 2 0 1 1-4 0a2 2 0 1 1 4 0M12 10a2 2 0 1 1-4 0a2 2 0 1 1 4 0M18 10a2 2 0 1 1-4 0a2 2 0 1 1 4 0"/></svg>`;   // square dots in Low, round in High

const ROLE = {
  villager: { name: "Villager", icon: "sprout", blurb: "No powers, just a big heart and a sharp vote. Sniff out the Mafia by day." },
  angel: { name: "Angel", icon: "halo", blurb: "Each night, shield one player, even yourself. You save them before they die.", act: "Choose someone to protect tonight" },
  detective: { name: "Detective", icon: "glass", blurb: "Each night, inspect one player and learn if they are mafia or innocent.", act: "Choose someone to investigate" },
  vigilante: { name: "Vigilante", icon: "target", blurb: "Each night you may take a shot. Hit the Mafia, not your friends.", act: "Choose someone to shoot, or hold fire" },
  mayor: { name: "Mayor", icon: "tophat", blurb: "Your day vote counts twice. Lead the town wisely." },
  mafia: { name: "Mafia", icon: "fedora", blurb: "Pick a victim each night with your crew. Blend in by day.", act: "Choose tonight's target" },
  godfather: { name: "Godfather", icon: "crown", blurb: "The boss. Your pick is final and you look innocent to the Detective.", act: "Choose tonight's target. Your call is final" },
  framer: { name: "Framer", icon: "brush", blurb: "Frame someone each night so the Detective sees them as mafia.", act: "Choose someone to frame" },
  jester: { name: "Jester", icon: "mask", blurb: "Get the town to vote you out and you win alone. Be suspicious." },
  serialkiller: { name: "Serial Killer", icon: "knife", blurb: "Strike every night. Be the last one standing.", act: "Choose tonight's victim" },
};
// Timer lengths match the server's modes (PROTOCOL 7.3); they only size the timer bar.
const MODE = {
  classic: { name: "Classic", icon: "cup", night: 45, day: 150, desc: "The timeless game with five roles" },
  crazy: { name: "Crazy", icon: "spiral", night: 60, day: 180, desc: "All ten roles. Chaos guaranteed" },
  gore: { name: "Gore", icon: "drop", night: 45, day: 150, desc: "Classic roles, cartoon-gruesome tales" },
  speed: { name: "Speed", icon: "bolt", night: 20, day: 60, desc: "Classic roles, lightning timers" },
};
const WIN = {
  town: "The Town wins. Puddleton sleeps safe tonight.", mafia: "The Mafia wins. The town belongs to the family now.",
  jester: "The Jester wins. They wanted the rope all along.", serialkiller: "The Serial Killer wins. Nobody is left to scream.",
  draw: "A draw. The streets fall silent, forever.",
};
const TALES = {
  classic: {
    night: ["{p} was found tucked in bed, a little too permanently. They were the {r}.", "A fedora was left on {p}'s doorstep. {p} won't be needing breakfast. They were the {r}.", "{p} went out for midnight cocoa and never came back. They were the {r}."],
    lynch: ["The town has spoken. {p} is marched out past the bakery. They were the {r}.", "With a sad little wave, {p} is voted out of Puddleton. They were the {r}."],
    left: ["{p} packed a little suitcase and caught the last ferry home. They were the {r}."],
    quiet: ["Morning. Everyone wakes up with all their toes. Nobody died last night.", "A peaceful night. Only the crickets were plotting."],
    saved: ["Someone was attacked last night, but an Angel got there first.", "A shield of light popped over a rooftop at midnight. Someone was saved."],
    nolynch: ["The town couldn't agree. Everyone shuffles home, side-eyeing each other.", "No majority, no exile. The Mafia smiles under its hat."],
  },
  crazy: {
    night: ["Kaboom, sort of. {p} was launched into the stratosphere by mysterious forces. They were the {r}.", "{p} slipped on a banana peel that was definitely placed there on purpose. They were the {r}.", "{p} vanished in a puff of glitter and bad decisions. They were the {r}."],
    lynch: ["The mob grabs pitchforks and party hats. Bye, {p}. They were the {r}.", "{p} is yeeted out of town by popular demand. They were the {r}."],
    left: ["{p} wandered off to chase a butterfly and never came back. They were the {r}."],
    quiet: ["Chaos took the night off. Everybody lives. Suspicious.", "Against all odds, nobody died. The town is confused."],
    saved: ["An attack bounced off a glowing bubble last night. Someone owes an Angel a muffin.", "Someone nearly got got. An Angel said no."],
    nolynch: ["Everyone voted for everyone. Democracy has left the chat.", "The vote dissolved into a pillow fight. No exile today."],
  },
  gore: {
    night: ["{p} was found splattered across the bakery wall like strawberry jam. They were the {r}.", "Only {p}'s little shoes remained, still warm and dripping. They were the {r}.", "The streetlamp flickered over what used to be {p}. Squish. They were the {r}."],
    lynch: ["The town drags {p} to the old well. A splash, then a crunch. They were the {r}.", "{p} meets the guillotine of the village square. Thunk. They were the {r}."],
    left: ["{p} slipped into the fog and was never seen again. They were the {r}."],
    quiet: ["The gutters run clean this morning. Nobody died, yet.", "Blood was expected. None was spilled. The night is hungry."],
    saved: ["A blade met a halo last night, and the halo won. Someone was saved.", "Something tried to carve a doorway open. An Angel slammed it shut."],
    nolynch: ["The rope swings empty. The crowd groans, unsatisfied.", "No one hangs today. The crows are disappointed."],
  },
  speed: {
    night: ["{p} is down. Role: {r}.", "Lights out for {p}. They were the {r}."],
    lynch: ["Voted out: {p}, the {r}.", "{p} gets the boot. {r}."],
    left: ["{p} left. {r}."],
    quiet: ["Nobody died. Keep moving."],
    saved: ["An Angel saved someone. Next."],
    nolynch: ["No exile. Next."],
  },
};
// Our own words for a few refusals; anything else uses the server's msg.
const SAY = {
  E_RATE: "One message a second, please.", E_DUP: "You just said that.", E_SLOWED: "Slow down a little: one message every 3 seconds for now.",
  E_MUTED: "You are muted for now, so phrase chat only.", E_TEXT: "Messages need 1 to 200 characters.", E_PHRASE: "That phrase is not available.",
  E_WHISPER_OFF: "Whispers are not available here.", E_DEAD: "The dead can only watch.", E_CHAT_DISABLED: "The Town Square is closed this game.",
  E_TRIAL: "Only the accused may speak during the trial.", E_PLAYERS: "Need at least 4 players who are here right now.",
  E_ONLINE: "You can only remove players who are offline.", E_PASS_NEEDED: "A private room needs a pass of 3 to 32 characters.",
  E_REPORT: "You already reported that player in this game.",
};
const CHAT_ERRORS = ["E_RATE", "E_DUP", "E_SLOWED", "E_MUTED", "E_TEXT", "E_PHRASE", "E_PHRASE_ONLY", "E_WHISPER_OFF", "E_WHISPER_PREF", "E_CHAT_DISABLED", "E_TRIAL", "E_DEAD", "E_ALIVE"];
// Short text for each sound sting, shown when "Captions for sounds" is on.
const CAPTIONS = {
  knock: "Knock, knock", kill: "A knock, then a thud", save: "A magic shield hums", peek: "Tiptoes, then a stamp", shot: "A slingshot zips",
  dream: "A soft lullaby", night: "A low night chime", dawn: "Birds sing at sunrise", trial: "The gavel bangs, the crowd murmurs",
  exile: "A long falling whistle", victory: "A happy fanfare", rattle: "Your door rattles",
};
// The report dialog's reasons, as the server's report reasons.
const REPORT_AS = { language: "inappropriate", bullying: "harassment", cheating: "cheating", sharing: "inappropriate", asking: "grooming", name: "name", other: "other" };
// Phrases whose blanks are all different kinds (the phrase wheel fills one player and one role at most).
const PHRASE_CATALOG = PHRASES.filter((p) => new Set(p.args).size === p.args.length);

const world = createWorld($("#world")), home = town(world, 0, 0, 0);
["villager", "mayor", "angel", "detective"].forEach((r, i) => addBean(world, home, r, i + 2, i * 1.3 - 2, 2.6 + (i % 2) * 0.8));
world.ticks.push((t) => { const a = app.calm ? 0.25 : Math.sin(t * 0.08) * 0.6; world.camera.position.set(Math.sin(a) * 19, 5.5, Math.cos(a) * 19); world.camera.lookAt(0, 1.6, 0); });

const newMeta = () => ({ mode: "classic", narrator: "bot", dealt: false, deadline: 0, seats: [], host: "", tally: { cast: 0, alive: 0 }, pending: [], rigged: false });
const app = {
  band: "child", guest: null, me: null, name: "", look: savedLook(), trying: null, rack: "body",
  link: null, code: "", cls: "13+", you: null, pass: "", lobby: null, offset: 0, settingsCache: { communityChat: true },
  view: null, gm: null, meta: newMeta(), mode: "classic", target: undefined, lastPhaseKey: "", dmWith: "", seenDms: 0, finalRoles: null, revealed: false,
  looks: Object.create(null), screen: "home", wardrobeFrom: "home", logSeen: 0, afterReveal: false, phaseTotal: 0, fresh: true,
  lastSend: 0, slowUntil: 0, calm: false, reconnect: null, leaving: false, replaying: false, replayCache: null, creditsOn: false,
};

// ---------- helpers ----------
const hash = (s) => [...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);
const roleName = (r) => (r ? ROLE[r]?.name || "Unknown" : "Unknown");
const serverNow = () => Date.now() + app.offset;
function toast(msg) { const t = $("#toast"); t.textContent = msg; t.hidden = false; clearTimeout(toast.t); toast.t = setTimeout(() => (t.hidden = true), 3200); }
// Every screen gets its own place: the island for the intro, pixel scenes (scenes/*.svg) everywhere else.
const SCENES = { wardrobe: "boutique", choose: "study", lobby: "dock", shuffle: "rooftops" };
function setScene(name) {
  document.body.classList.toggle("scened", !!name);
  world.run(!name);
  const box = $("#scene");
  if (box.dataset.name === (name || "")) return;
  box.dataset.name = name || "";
  if (!name) { box.innerHTML = ""; return; }
  const l = document.createElement("i");
  l.style.backgroundImage = sceneUrl(name);
  box.append(l);
  setTimeout(() => { while (box.children.length > 1) box.firstElementChild.remove(); }, 800);
}
// Each scene comes in both looks (tools/scenes.py): smooth in scenes/, chunky pixels in scenes/low/. A change swaps it in place.
const sceneUrl = (name) => `url(scenes/${quality() === "low" ? "low/" : ""}${name}.svg)`;
onQuality(() => { const box = $("#scene"); if (box.dataset.name) for (const l of box.children) l.style.backgroundImage = sceneUrl(box.dataset.name); });
function show(id) {
  const moved = app.screen !== id, prev = $(".screen.active");
  app.screen = id;
  if (moved && prev && prev.id !== id) { prev.classList.add("leaving"); clearTimeout(prev.leaveT); prev.leaveT = setTimeout(() => prev.classList.remove("leaving"), 280); }
  $$(".screen").forEach((s) => s.classList.toggle("active", s.id === id));
  if (id !== "game") setScene(SCENES[id] || null);
  if (id !== "wardrobe") { mirror.run(false); previewTok++; wstage?.run(false); }
  if (id !== "game") document.body.classList.remove("replaying");
  updateHud();
  if (moved) scrollTo(0, 0);
}
function updateHud() {
  const id = app.screen, inRoom = !!app.code && !!app.link;
  $("#hudHelp").hidden = id === "home";
  $("#hudMark").style.visibility = id === "home" ? "hidden" : "";
  $("#endRoomBtn").hidden = !(inRoom && amHost() && (id === "lobby" || id === "game") && !app.replaying);
  $("#profileBtn").hidden = !(id === "home" || id === "lobby");
  const back = id === "wardrobe" || id === "choose" || (inRoom && (id === "lobby" || id === "game" || id === "shuffle"));
  $("#backBtn").hidden = !back || app.replaying;
  $("#backBtn").setAttribute("aria-label", id === "lobby" || id === "shuffle" ? "Leave the room" : id === "game" ? "Leave the game" : "Back");
}
function players() { return app.view ? app.view.players.map((p) => p.id) : app.meta.seats.length ? app.meta.seats.map((s) => s.id) : (app.lobby?.players || []).map((p) => p.id); }
function bean(id, role, dead = false, size = 72, cls = "") {   // portraits are 128px renders
  const look = app.looks[id] || BEAN_COLORS[Math.max(0, players().indexOf(id)) % BEAN_COLORS.length];
  return `<img class="bean ${cls}" alt="" width="${size}" height="${size}" src="${portrait(role, look, dead)}">`;
}
const seatOf = (id) => app.meta.seats.find((s) => s.id === id) || app.lobby?.players.find((p) => p.id === id) || null;
const cardOf = (id) => seatOf(id)?.card || "";
function setLooks(list) { for (const p of list || []) { const l = cleanLook(p.look); if (l) app.looks[p.id] = l; } }
function amHost() {
  if (!app.you) return false;
  const h = app.view || app.gm ? app.meta.host : app.lobby ? app.lobby.host : app.meta.host;
  return app.you.gm ? h === "" : !!app.you.id && h === app.you.id;
}
const noWhispers = () => app.you?.band === "child" || app.cls === "kids" || app.band === "child";
const nameOk = (n) => /^[A-Za-z0-9_@]{1,16}$/.test(n);

// ---------- settings: muted and blocked players, display, chat prefs ----------
const muteKey = (id) => cardOf(id) || "id:" + id;
const isMuted = (id) => !!id && id !== app.you?.id && getSettings().chat.muted.some((p) => p.id === muteKey(id));
const isBlocked = (id) => !!id && getSettings().chat.blocked.some((p) => p.id === muteKey(id));
const readSet = (k) => { try { return new Set(JSON.parse(localStorage.getItem(k)) || []); } catch { return new Set(); } };
const writeSet = (k, set) => { try { localStorage.setItem(k, JSON.stringify([...set])); } catch { /* blocked */ } };
let blockedPrev = getSettings().chat.blocked.map((p) => p.id);
// Unblocking in the settings sends "unblock" now if that player is in this room, or the next time we meet them.
function syncBlocks() {
  if (!app.link?.live) return;
  const pending = readSet("pad-unblock"), list = getSettings().chat.blocked, seats = app.view || app.gm ? app.meta.seats : app.lobby?.players || [];
  for (const s of seats) {
    if (!s.card) continue;
    if (pending.has(s.card)) { app.link.send({ t: "unblock", id: s.id }); pending.delete(s.card); }
    else if (list.some((p) => p.id === s.card) && !(app.you?.blocks || []).includes(s.id)) app.link.send({ t: "block", id: s.id });
  }
  writeSet("pad-unblock", pending);
  // blocks the server remembers from earlier rooms show up in the settings list too
  const add = (app.you?.blocks || []).map((id) => ({ id: cardOf(id), name: id })).filter((p) => p.id && !pending.has(p.id) && !list.some((q) => q.id === p.id));
  if (add.length) setSetting("chat.blocked", [...list, ...add]);
}
function applyDisplay(s = getSettings()) {
  app.calm = calmScreens(s);
  applyQuality(s.display.quality);
  const p = { shake: s.display.screenShake, flash: s.display.flashing, calm: app.calm };
  stage?.setPrefs(p); wstage?.setPrefs(p);
}
function sendPrefs(s = getSettings()) {
  if (!app.link?.live) return;
  const adult = app.band === "adult";
  app.link.send({ t: "prefs", whisper: s.chat.whisper, ...(adult ? { freeChat: !!s.chat.strangers, filter: s.chat.filter === "strict" ? "strict" : "default" } : {}) });
}
onChange(({ path, settings: s }) => {
  if (path === "*" || path.startsWith("display") || path.startsWith("access")) applyDisplay(s);
  if (path === "*" || path === "chat.filter" || path === "chat.strangers" || path === "chat.whisper") sendPrefs(s);
  if (path === "chat.blocked" || path === "*") {
    const now = s.chat.blocked.map((p) => p.id), gone = blockedPrev.filter((id) => !now.includes(id) && !id.startsWith("id:"));
    blockedPrev = now;
    if (gone.length) {
      const pending = readSet("pad-unblock"), seats = app.view || app.gm ? app.meta.seats : app.lobby?.players || [];
      for (const gid of gone) {
        const seat = seats.find((x) => x.card === gid);
        if (seat && app.link?.live) app.link.send({ t: "unblock", id: seat.id }); else pending.add(gid);
      }
      writeSet("pad-unblock", pending);
    }
  }
  if (path === "*" || path.startsWith("chat")) { if (app.view || app.gm) renderTalk(); if (app.screen === "lobby") renderLobby(); }
});
function cue(name) {
  sfx(name);
  const text = CAPTIONS[name];
  if (text && getSettings().access.captions && stage) stage.sound(text);
}

// ---------- the guest pass ----------
function onGuest(r) {
  app.guest = r.guest; app.me = r.me || app.me;
  app.band = r.guest.band;
  applyBandUI();
  const sn = r.me?.sanction;
  if (sn?.type === "ban") app.banned = sn;
  else if (sn?.type === "mute" && sessionStorage.getItem("pad-mute-seen") !== String(sn.until)) {
    sessionStorage.setItem("pad-mute-seen", String(sn.until));
    app.muteNotice = sn;
  }
  if (r.me?.name && !$("#nameInput").value) $("#nameInput").value = r.me.name;
}
function applyBandUI() {
  const child = app.band === "child";
  $("#nameInput").placeholder = child ? "A nickname" : "Biscuit";
  $("#nameHint").textContent = child ? "Use a nickname, not your real name. Letters and numbers only." : "Letters, numbers and _ only.";
  $("#discordLink").hidden = child || !app.band;   // Discord is 13+: never shown to the under 13 band
}
async function needGuest() {
  if (app.banned) { showBan(app.banned); return false; }
  if (guest() && app.guest) return true;
  try { onGuest(await showLoading(ensureGuest(app.band), { label: "Getting your guest pass", settings: getSettings() })); return true; }
  catch (e) { await apiFail(e); return false; }
}
function showBan(b) { return sanction.show({ kind: "banned", reason: sanctionReason(b.reason), until: b.until ? new Date(b.until) : null, playerName: app.name, appealEmail: b.appeal || sanction.APPEAL_EMAIL, settings: getSettings() }); }
const sanctionReason = (r) => ({ filter: "Messages that broke the chat rules", repeated_offences: "Breaking the chat rules again and again", moderator: "A moderator checked a report", test: "A moderator checked a report" })[r] || r || "";
// Shows what went wrong with an HTTP call. Returns the message (also put on the home screen).
async function apiFail(e, { retry } = {}) {
  let msg = e?.message || "Something went sideways.";
  if (e instanceof ApiError) {
    if (e.code === "E_FULL") {
      const v = await overlays.islandFull({ resetAt: new Date(e.body.resetAt || Date.now()), settings: getSettings() });
      if (v === "retry" && retry) return retry();
      return "The island is full for today.";
    }
    if (e.code === "E_BANNED") { app.banned = { reason: e.body.reason, until: e.body.until, appeal: e.body.appeal }; await showBan(app.banned); return "You cannot play right now."; }
    if (e.code === "E_RATE") msg = e.body.msg || "You are making rooms too fast. Try again in a few minutes.";
    if (e.code === "E_TURNSTILE") msg = "The safety check did not work. Please try again.";
  } else if (e?.code === "E_TURNSTILE") msg = e.message;
  else if (e instanceof NetError) msg = "We could not reach the island. Check your connection and try again.";
  $("#homeMsg").textContent = msg;
  return msg;
}

// ---------- the room connection ----------
function hello() {
  const g = guest(), s = getSettings(), adult = app.band === "adult";
  return { t: "hello", v: PROTOCOL, gid: g?.gid, secret: g?.secret, name: app.name, look: app.look, device: device(), band: g?.band,
    ...(app.pass ? { pass: app.pass } : {}), whisper: s.chat.whisper,
    ...(adult ? { freeChat: !!s.chat.strangers, filter: s.chat.filter === "strict" ? "strict" : "default" } : {}) };
}
// Opens the socket to a room. Resolves { ok: true } at the welcome, or { ok: false, code, info, network }.
async function connect(code, { pass = "" } = {}) {
  dropRoom();
  app.pass = pass;
  const link = new RoomLink(code, {
    hello,
    onMessage: (m) => { if (app.link === link) onServer(m); },
    onDrop: (c) => { if (app.link === link) onDrop(c); },
    onEnd: (c, info) => { if (app.link === link) onEnd(c, info); },
  });
  app.link = link;
  try {
    await link.open();
    history.replaceState(null, "", `${location.pathname}?room=${code}`);
    updateHud();
    return { ok: true };
  } catch (r) {
    if (app.link === link) app.link = null;
    return { ok: false, ...r };
  }
}
// What a failed join means, in plain words, with the extra screens some failures need. ctx.retry(pass?) tries again.
async function joinFail(r, { code, retry, inList = false } = {}) {
  const ec = r.info?.code;
  if (r.network) return "We could not reach the island. Check your connection and try again.";
  switch (r.code) {
    case 4000: overlays.updateAvailable({ settings: getSettings() }); return "A new version of Puddleton is ready. Refresh to play.";
    case 4002: $("#nameInput").focus(); return app.band === "child" ? "That name is not allowed. Pick a nickname with no email or phone number in it." : "That name is not allowed. Please pick a different one.";
    case 4003: if (r.info?.t === "sanction") { app.banned = r.info; await showBan(r.info); } return "You cannot play right now.";
    case 4004:
      if (ec === "E_ROOM_FULL") return "That room is full right now.";
      if (!inList && (await overlays.roomNotFound({ code, settings: getSettings() })) === "retry" && retry) return retry();
      return "No room with that code. Double-check it?";
    case 4005: return "You were removed from that room, so you can't rejoin it.";
    case 4006: return "That room is for a different age group.";
    case 4007: {
      if (inList || !retry) return "That room needs its room pass.";
      const ok = await roomlist.passDialog({ id: code, name: `Room ${code}` }, { join: async (_, p) => { const res = await retry(p, true); return res === true ? true : typeof res === "string" ? res : "That pass did not work."; } }, getSettings());
      return ok ? true : "That room needs its room pass.";
    }
    case 4008: return "That room is full. Sixteen is the limit.";
    case 4009: return "That game already started. Try another room.";
    case 4010:
      if (ec === "E_AUTH" && retry && !app.authRetried) {
        app.authRetried = true;
        try { onGuest(await ensureGuest(app.band)); return retry(app.pass); } catch (e) { return apiFail(e); } finally { app.authRetried = false; }
      }
      return "Your guest pass did not work. Reload the page to get a new one.";
    case 4011: return "That room has closed.";
    case 4012: return "You left that room.";
    default: return "Could not join right now. Try again in a moment.";
  }
}
// Join by code (home, invite links, a friend's room). Shows the loading screen while rowing over.
async function joinCode(code, pass = "", inner = false) {
  const res = inner ? await connect(code, { pass }) : await showLoading(connect(code, { pass }), { label: "Rowing to the room", settings: getSettings() });
  if (res.ok) return true;
  if (res.code === 4007 && inner) return pass ? "That pass did not work." : "That room needs its room pass.";
  const msg = await joinFail(res, { code, retry: (p = pass, quiet = false) => joinCode(code, p, quiet) });
  if (typeof msg === "string" && !inner) $("#homeMsg").textContent = msg;
  return msg;
}
async function createRoom(narrator, { visibility = "public", pass = "" } = {}) {
  let r;
  try { r = await call("POST", "/rooms", { turnstile: await turnstileToken(), narrator, device: device() }); }
  catch (e) { return apiFail(e, { retry: () => createRoom(narrator, { visibility, pass }) }); }
  const c = await connect(r.code);
  if (!c.ok) return joinFail(c, { code: r.code });
  if (visibility === "private" && pass) app.link.send({ t: "settings", settings: { visibility: "private", pass } });
  return true;
}
async function quickJoin(exclude = []) {
  let r;
  try { r = await call("POST", "/quickplay", { turnstile: await turnstileToken(), exclude, device: device() }); }
  catch (e) { return apiFail(e, { retry: () => quickJoin(exclude) }); }
  const c = await connect(r.code);
  if (c.ok) return true;
  if ([4004, 4008, 4009].includes(c.code) && exclude.length < 6) return quickJoin([...exclude, r.code]);   // full or started meanwhile: next one
  return joinFail(c, { code: r.code, inList: true });
}
// A drop: the band across the top counts down and tries again (1, 2, 4, 8, then every 10 s), the game stays in view.
function onDrop() {
  if (app.reconnect || app.leaving) return;
  const band = overlays.reconnecting({
    delays: [1, 2, 4, 8, 10], settings: getSettings(),
    onRetry: async () => {
      const link = app.link;
      if (!link) return false;
      try { await link.open(); return true; }
      catch (r) { if (FINAL.has(r.code) && app.link === link) { app.reconnect = null; band.close(); onEnd(r.code, r.info); } return false; }
    },
    onLeave: () => { app.reconnect = null; goHome("You left the room."); },
  });
  app.reconnect = band;
  band.done.then(() => { if (app.reconnect === band) app.reconnect = null; });
}
// The visit ended (PROTOCOL 4.4): say why, then back to town.
function onEnd(code, info) {
  const band = app.reconnect; app.reconnect = null; band?.close();
  const why = info?.reason;
  if (code === 4012 || why === "left") return goHome(app.leaveMsg || "You left the room.");
  if (code === 4000) { overlays.updateAvailable({ settings: getSettings() }); return roomClosed("A new version is ready", "Refresh the page to keep playing."); }
  if (code === 4003) { if (info?.t === "sanction") { app.banned = info; showBan(info); } return roomClosed("You cannot play right now", "Your access to Puddleton is paused."); }
  if (code === 4001) return roomClosed("You joined from somewhere else", "This room is open in another tab or window now, so this one stepped out.");
  if (code === 4005) return roomClosed(why === "vote" ? "The room voted you out" : "The host removed you", "You can't rejoin this room, but there are plenty of others.");
  if (code === 4011 && why === "host" && app.leaveMsg === "You ended the room.") return roomClosed("You ended the room", "Thanks for hosting.");
  if (code === 4011) {
    const t = { host: ["The host ended the room", "Thanks for playing. Start a new room any time."], idle: ["The room closed", "It went quiet for a while, so the island tidied it away."],
      away: ["You were away too long", "The town moved on without you."], banned: ["You cannot play right now", "Your access to Puddleton is paused."] }[why] || ["The room has closed", "Thanks for playing."];
    return roomClosed(...t);
  }
  return roomClosed("You left the room", info?.msg || "The connection to the room ended.");
}
function roomClosed(title, text) {
  dropRoom();
  $("#revealCard").innerHTML = `${ic("door", "huge")}<h2>${esc(title)}</h2><p>${esc(text)}</p><button class="btn" data-home>Back to town</button>`;
  delete $("#reveal").dataset.final;
  $("#reveal").hidden = false;
  updateHud();
}
function goHome(msg = "") {
  dropRoom(); app.leaveMsg = "";
  $("#reveal").hidden = true;
  $("#homeMsg").textContent = msg;
  show("home");
}
// Forgets the room on this page (the socket is closed without a goodbye; use leave() to leave for good).
function dropRoom() {
  if (app.link) { const l = app.link; app.link = null; l.close(); }
  app.reconnect?.close(); app.reconnect = null;
  app.code = ""; app.lobby = null; app.you = null; app.pass = ""; app.leaving = false;
  resetGame();
  phrasewheel.close();
  if (location.search.includes("room=")) history.replaceState(null, "", location.pathname);
  updateHud();
}
function resetGame() {
  app.view = null; app.gm = null; app.meta = newMeta(); app.finalRoles = null; app.revealed = false; app.lastPhaseKey = ""; app.target = undefined;
  app.victoryPlayed = false; app.stagePrev = null; app.stageLog = undefined; app.logSeen = 0; app.seenDms = 0; app.afterReveal = false; app.fresh = true;
  app.replaying = false; $("#replayStop").hidden = true;
  delete $("#reveal").dataset.final;
}
function leaveRoom(msg) {
  if (!app.link) return goHome(msg);
  app.leaving = true; app.leaveMsg = msg;
  app.link.leave();
  setTimeout(() => { if (app.leaving) goHome(msg); }, 2500);
}

// ---------- messages from the server ----------
function onServer(m) {
  if (typeof m.serverNow === "number") app.offset = m.serverNow - Date.now();
  switch (m.t) {
    case "welcome": app.you = m.you; app.cls = m.cls; app.code = m.code; app.fresh = true; return;
    case "you": app.you = m.you; return app.view || app.gm ? renderTalk() : renderLobby();
    case "lobby": return onLobby(m);
    case "shuffle": app.meta.dealt = false; show("shuffle"); return;
    case "view": return onView(m);
    case "gmview": return onGmView(m);
    case "final": app.finalRoles = m.roles; return renderGame();
    case "credits": return onCredits(m);
    case "chat": return onLine(m.ch === "ghost" ? "ghostChat" : "chat", m.line);
    case "dm": return onLine("dms", m.line);
    case "tally": app.meta.tally = { cast: m.cast, alive: m.alive }; return renderVotes();
    case "picks": if (app.view) { app.view.teamPicks = m.teamPicks; renderGame(); } return;
    case "picked": app.target = m.target; return renderGame();
    case "deadline": app.meta.deadline = m.deadline; return renderTimer();
    case "presence": { const s = app.meta.seats.find((x) => x.id === m.id); if (s) s.online = m.online; return renderGame(); }
    case "move": case "emote": return onPresence(m);
    case "notice": return onNotice(m);
    case "rigged": toast("Done. Nobody suspects a thing."); return;
    case "replay": app.replayCache = m; return playReplay(m);
    case "slowed": app.slowUntil = m.until - app.offset; renderTalk(); setTimeout(renderTalk, Math.max(0, app.slowUntil - Date.now()) + 100); return;
    case "sanction":
      if (m.type === "mute") sanction.show({ kind: "muted", reason: sanctionReason(m.reason), until: m.until ? new Date(m.until - app.offset) : null, playerName: app.you?.id || app.name, appealEmail: m.appeal, settings: getSettings() });
      return;
    case "blocked": if (app.you) { const b = new Set(app.you.blocks || []); if (m.on) b.add(m.id); else b.delete(m.id); app.you.blocks = [...b]; } return;
    case "err": return onErr(m);
    case "pong": app.lastPong = Date.now(); return;
    default: return;
  }
}
function onLobby(m) {
  const fromGame = !!(app.view || app.gm || app.meta.seats.length);
  if (fromGame) { resetGame(); $("#reveal").hidden = true; }
  app.lobby = m; app.cls = m.cls; app.code = m.code; app.settingsCache = { ...m.settings };
  setLooks(m.players);
  if (app.fresh) { app.fresh = false; syncBlocks(); }
  renderLobby();
  if (app.screen !== "wardrobe" && !(app.replaying && app.screen === "game")) show("lobby");
}
function takeMeta(m) {
  const before = app.meta.seats.map((s) => s.card).join();
  Object.assign(app.meta, { mode: m.mode, narrator: m.narrator, dealt: m.dealt, deadline: m.deadline, seats: m.seats || [], host: m.host ?? "", tally: m.tally || { cast: 0, alive: 0 } });
  app.mode = m.mode;
  setLooks(m.seats);
  if (m.you) app.you = m.you;
  if (app.fresh || before !== app.meta.seats.map((s) => s.card).join()) { app.fresh = false; syncBlocks(); }
}
function onView(m) {
  takeMeta(m);
  app.view = m.view; app.gm = null;
  if (app.replaying) stopReplay();
  renderGame();
}
function onGmView(m) {
  takeMeta(m);
  app.meta.pending = m.pending || []; app.meta.rigged = !!m.rigged;
  app.gm = m.gm; app.view = null;
  if (app.replaying) stopReplay();
  renderGame();
}
function onLine(list, line) {
  const base = app.view || app.gm;
  if (!base) return;
  (base[list] ||= []).push(line);
  if (base[list].length > 200) base[list].splice(0, base[list].length - 200);
  if (stage && line.text && !isMuted(line.from) && (list === "chat" || (list === "ghostChat" && seesGhosts()))) {
    stage.bubble(line.from, line.text);
    if (line.from !== app.you?.id) sfx("bubble");
  }
  renderTalk();
}
function onNotice(m) {
  if (m.code === "host") toast(m.id && m.id === app.you?.id ? "You are the host now." : m.id ? `${m.id} is the host now.` : "The Grandmaster is the host.");
  else if (m.code === "left") toast({ kicked: `${m.id} was removed from the town.`, away: `${m.id} was away too long and left the town.`, offline: `${m.id} lost their connection and left the town.`, banned: `${m.id} was removed from the town.` }[m.why] || `${m.id} left the town.`);
  else if (m.code === "narrator") toast("The Grandmaster left. The town clock takes over.");
  else if (m.code === "lobby") resetGame();
  updateHud();
}
function onErr(m) {
  if (!app.you) return;   // a refused hello: the join flow explains it once, on the screen the player is on
  const text = m.code === "E_WHISPER_PREF" ? m.msg : SAY[m.code] || m.msg || "That did not work.";
  if (m.code === "E_SLOWED" && !app.slowUntil) app.slowUntil = Date.now() + 3000;
  if (CHAT_ERRORS.includes(m.code) && (app.view || app.gm)) { chatNote(text); return; }
  if (m.code === "E_PASS_NEEDED" || m.code === "E_NOT_ALLOWED") $("#visNote").textContent = text;
  toast(text);
}
function act(a) { app.link?.send({ t: "act", a }); }
function presence(msg) { if (app.view && app.meta.dealt) app.link?.send(msg); }

// ---------- lobby ----------
function renderLobby() {
  const L = app.lobby;
  if (!L) return;
  const me = app.you, host = amHost(), st = L.settings, gm = !!me?.gm, kids = L.cls === "kids";
  const online = L.players.filter((p) => p.online).length, need = Math.max(0, (L.min || 4) - online);
  $("#roomCode").textContent = L.code;
  $("#roomKind").textContent = [kids ? "Kids room" : "13+ room", st.visibility === "private" ? "private, pass needed" : "public", L.quick ? "Quick Play" : "", L.narrator === "human" ? (L.gm ? "Grandmaster narrates" : "waiting for the Grandmaster") : "town clock narrates"].filter(Boolean).join(", ");
  $("#replayBtn").hidden = !(L.lastGame || app.replayCache);
  const votes = L.votekicks || {};
  $("#roster").innerHTML = L.players.map((p) => {
    const mine = p.id === me?.id, who = `${bean(p.id, null, false, 72)}<span class="pname">${esc(p.id)}</span>
      <small>${p.host ? ic("crown") + "Host" : ""}${mine ? (p.host ? ", you" : "You") : ""}${!p.online ? (p.host || mine ? ", " : "") + "Offline" : ""}</small>`;
    return `<li class="${mine ? "me" : ""} ${p.online ? "" : "off"}">${mine ? `<div class="who-btn">${who}</div>` : `<button class="who-btn" data-menu="${esc(p.id)}" aria-label="${esc(p.id)}: report, mute, block${host ? ", remove" : ""}">${who}</button>`}
      ${votes[p.id] ? `<em class="vk">${votes[p.id]} of ${L.kickNeed} votes to remove</em>` : ""}</li>`;
  }).join("") || `<li class="empty">Nobody yet. Share the code.</li>`;
  $("#countLabel").textContent = `${L.players.length} of ${L.max || 16}`;
  $("#rosterNote").textContent = L.players.length > 1 ? (host ? "Tap a player to report, mute, block or remove them." : "Tap a player to report, mute, block or vote to remove them.") : "";
  $("#lobbyWardrobeBtn").hidden = gm;
  $("#hostSettings").hidden = !host;
  $("#guestWait").hidden = host;
  $("#modePicker").innerHTML = Object.entries(MODE).filter(([k]) => !(kids && k === "gore")).map(([k, m]) =>
    `<button class="mode ${k === st.mode ? "on" : ""}" data-mode="${k}" aria-pressed="${k === st.mode}"><b>${m.name}</b><span>${m.desc}</span></button>`).join("");
  $("#chatToggle").checked = !!st.communityChat;
  $("#killerToggle").checked = !!st.victimSeesKiller;
  const priv = st.visibility === "private", draft = app.visDraft === "private" && !priv;
  $$("#visPicker [data-vis]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.vis === (priv || draft ? "private" : "public"))));
  $("#passForm").hidden = !(priv || draft);
  $("#passSave").textContent = priv && st.hasPass ? "Change pass" : "Set pass";
  if (document.activeElement !== $("#passInput") && !draft) $("#passInput").value = "";
  $("#visNote").textContent = draft ? "Pick a pass of 3 to 32 characters, then set it. Share it with your friends." : priv ? "The room shows a lock in Quick Play. Players need the pass to get in." : "Anyone can find this room in Quick Play.";
  $("#secretRow").hidden = kids;
  $("#secretToggle").checked = !!st.secretWhispers; $("#secretToggle").disabled = !priv;
  $("#rigRow").hidden = !(gm && L.narrator === "human");
  $("#rigToggle").checked = !!st.rigged;
  $("#startBtn").disabled = need > 0;
  const countdown = L.countdown ? Math.max(0, Math.ceil((L.countdown - serverNow()) / 1000)) : 0;
  $("#startHint").textContent = countdown ? `Starting by itself in ${countdown}.` : need > 0 ? `Need at least ${L.min || 4} players here. ${online} so far.` : "Everyone in? Let the night begin.";
  $("#guestMode").textContent = MODE[st.mode].name;
  $("#guestModeDesc").textContent = MODE[st.mode].desc + ".";
  $("#guestRules").textContent = [st.communityChat ? "Town Square chat is on" : "Town Square chat is off", kids ? "" : st.secretWhispers ? "whispers are secret" : "the table sees who whispers", st.victimSeesKiller ? "victims see their killer" : ""].filter(Boolean).join(", ") + ".";
  $("#waitText").textContent = countdown ? `Starting in ${countdown}` : L.quick ? "Starts by itself when 6 players are in" : "Waiting for the host to start";
  $("#guestHint").textContent = need > 0 ? `The game needs ${need} more ${need === 1 ? "player" : "players"}.` : "Everyone is here. The host can start any moment.";
  updateHud();
}
function renderCountdown() {
  const L = app.lobby, left = L?.countdown ? Math.max(0, Math.ceil((L.countdown - serverNow()) / 1000)) : 0;
  if (!left) return;
  $("#startHint").textContent = `Starting by itself in ${left}.`;
  $("#waitText").textContent = `Starting in ${left}`;
}
function sendSettings(s) { app.link?.send({ t: "settings", settings: s }); }

// ---------- game ----------
function tale(ev, i) {
  const t = TALES[app.mode] || TALES.classic, list = t[ev.type === "death" ? ev.cause : ev.type] || TALES.classic[ev.type === "death" ? ev.cause : ev.type] || ["{p}."];
  return list[hash(`${i}:${ev.player || ""}`) % list.length].replaceAll("{p}", `<b>${esc(ev.player)}</b>`).replaceAll("{r}", roleName(ev.role));
}
function renderStory(log, winner) {
  const lines = [{ cls: "chapter", html: "Night 1 falls over Puddleton" }];
  const isNight = (e) => e && (e.type === "quiet" || e.type === "saved" || e.cause === "night");
  log.forEach((ev, i) => {
    lines.push({ cls: "", html: tale(ev, i) });
    if (ev.cause === "left") return;   // leaving happens in any phase: no chapter break
    const nightEv = isNight(ev);
    if (i === log.length - 1 && winner) return;
    const next = log.slice(i + 1).find((e) => e.cause !== "left");
    if (nightEv && !isNight(next)) lines.push({ cls: "chapter", html: `Day ${ev.day} dawns` });
    if (!nightEv) lines.push({ cls: "chapter", html: `Night ${ev.day + 1} falls` });
  });
  if (winner) lines.push({ cls: "chapter", html: WIN[winner] });
  const lastTale = [...lines].reverse().find((l) => !l.cls) || lines[0];
  $("#storyNow").innerHTML = winner ? WIN[winner] : log.length ? lastTale.html : "The town locks its doors. Somewhere, a fedora is being dusted off.";
  $("#feed").innerHTML = lines.slice().reverse().map((l) => `<li class="${l.cls}">${l.html}</li>`).join("");
}
function renderTimer() {
  const base = app.gm || app.view;
  if (app.screen === "lobby" && app.lobby?.countdown) renderCountdown();
  const t = $("#timer"), meter = $("#meter");
  if (!base || base.phase === "ended") { t.textContent = ""; meter.hidden = true; return; }
  if (!app.meta.deadline) { t.textContent = app.gm ? "Your call" : "Grandmaster's call"; t.className = "timer small"; meter.hidden = true; return; }
  const ms = Math.max(0, app.meta.deadline - serverNow()), left = Math.ceil(ms / 1000);
  t.textContent = `${Math.floor(left / 60)}:${String(left % 60).padStart(2, "0")}`;
  t.className = left <= 10 ? "timer urgent" : "timer";
  meter.hidden = false;
  $("#meterFill").style.width = `${Math.min(100, (ms / (app.phaseTotal || 1)) * 100)}%`;
}
function renderVotes() {
  const base = app.view || app.gm;
  if (!base) return;
  const tally = base.phase === "day" ? app.meta.tally : null;
  $("#voteCount").textContent = !tally?.alive ? "" : tally.cast < tally.alive ? `${tally.cast} of ${tally.alive} votes in`
    : app.gm || !app.meta.deadline ? "All votes are in." : "All votes are in. The day is ending.";
  if (app.gm && base.phase === "day") setPrompt(tally.cast < tally.alive ? "" : "gold", `${tally.cast} of ${tally.alive} votes in`, tally.cast < tally.alive ? "End the day when the talking is done." : "All votes are in. End the day.");
}
// The banner when night falls or day dawns: what just happened, and what to do next. It never blocks input.
function phaseCard(base, v) {
  const { phase, day, log } = base, fresh = log.slice(app.logSeen), night = phase === "night";
  app.logSeen = log.length;
  if (phase === "ended") return;
  const trial = phase === "trial", lines = trial ? [] : fresh.map((ev, i) => `<p>${tale(ev, log.length - fresh.length + i)}</p>`);
  const clue = (base.clues || []).find((c) => c.night === day);
  if (phase === "day" && clue) lines.push(`<p class="clue">Clue: ${clueText(clue)}</p>`);
  if (v && phase === "day" && v.savedFrom?.night === day) lines.push(`<p class="good">You were attacked last night, and an Angel saved you.</p>`);
  if (v && fresh.some((ev) => ev.player === v.you)) lines.push(`<p class="bad">${v.deathBy?.killer ? `That was you. ${esc(v.deathBy.killer)} got you.` : "That was you."} You are out, but you can keep watching.</p>`);
  else if (v && v.alive) lines.push(`<p class="do">${trial ? (v.accused === v.you ? "You are on trial. Say your last words in the Square." : "Listen to the last words.") : night ? (ROLE[v.role].act ? "You have a move to make tonight." : "You sleep tonight.") : "Talk it over, then vote."}</p>`);
  $("#phaseCardIcon").src = uiIcon(night ? "moon" : "sun");
  $("#phaseCardTitle").textContent = trial ? `The trial of ${base.accused}` : night ? `Night ${day} falls` : `Day ${day} dawns`;
  $("#phaseCardText").innerHTML = lines.join("");
  const card = $("#phaseCard"), hold = fresh.length ? 4600 : 2600;
  card.className = `phasecard ${night ? "night" : "day"}`;
  card.style.setProperty("--hold", `${hold}ms`);
  card.hidden = false;
  void card.offsetWidth;   // restart the animation
  card.classList.add("go");
  clearTimeout(phaseCard.t); phaseCard.t = setTimeout(() => (card.hidden = true), hold);
}
// One banner answers "what do I do now?" at every moment: [frame, title, detail, extra button].
function guide(v, phase, canNight) {
  const t = app.target;
  if (phase === "ended") return ["", "The story is over", "The cast takes a bow, then everyone heads back to the dock."];
  if (!v.alive) return ["rose", "You are out", "You can't vote or talk to the living, but the Ghosts tab lets you chat with the dead."];
  if (phase === "trial") return v.accused === v.you ? ["gold", "Your last words", "You are on trial. Say something in the Square before the verdict."]
    : ["", `${esc(v.accused)} is on trial`, "Listen to their last words. The verdict comes next."];
  if (phase === "night") {
    if (!canNight) return ["", "You are asleep", noWhispers() ? "No night power for you. Wait for dawn." : "No night power for you. Whisper if you like, and wait for dawn."];
    const hide = v.teamPicks ? `<button class="btn small alt" id="hideoutBtn">Hideout</button>` : "";
    return t ? ["teal", `Locked in: ${esc(t)}`, "Tap someone else to change your mind before dawn.", hide] : ["gold", ROLE[v.role].act, "Tap a player or their house.", hide];
  }
  const btn = `<button class="btn small alt" id="abstainBtn">Abstain</button>`;
  if (t === undefined) return ["gold", "Time to vote", "Tap the player you want to send off the island.", btn];
  return ["teal", t ? `You voted for ${esc(t)}` : "You abstain", "Change it any time before the day ends.", btn];
}
const seesGhosts = () => !!app.gm || (app.view && !app.view.alive);

function renderGame() {
  const v = app.view, g = app.gm, base = v || g;
  if (!base || app.replaying) return;
  show("game");
  const { phase, day } = base;
  const key = phase + day;
  if (key !== app.lastPhaseKey) {
    const first = !app.lastPhaseKey;
    const left = Math.max(0, app.meta.deadline - serverNow()), full = (phaseDuration(phase, MODE[app.mode]) || 0) * 1000;
    app.phaseTotal = first ? Math.max(left, full) : left || full;
    app.target = undefined; app.lastPhaseKey = key;
    if (first) { app.logSeen = base.log.length; app.afterReveal = !!v; } else if (phase === "day") app.cardAfterDawn = true; else phaseCard(base, v);
  }
  setScene(phase === "ended" ? "finale" : phase === "night" ? (day % 2 ? "rooftops" : "woods") : (day % 2 ? "square" : "market"));
  $("#phaseLabel").textContent = phase === "ended" ? "The end" : phase === "night" ? `Night ${day}` : phase === "trial" ? "The trial" : `Day ${day}`;
  $("#phaseIcon").src = uiIcon(phase === "night" ? "moon" : "sun");
  $("#modeBadge").textContent = MODE[app.mode].name;
  const dealt = app.meta.dealt, host = amHost();
  $("#dealBtn").hidden = !(g && !dealt);
  $("#advanceBtn").hidden = !(g && dealt && phase !== "ended");
  $("#advanceBtn").textContent = phase === "night" ? "Bring the dawn" : phase === "trial" ? "Deliver the verdict" : "End the day";
  $("#endVoteBtn").hidden = !(!g && host && app.meta.narrator === "bot" && dealt && (phase === "day" || phase === "trial"));
  $("#endVoteBtn").textContent = phase === "trial" ? "Deliver the verdict" : "End voting";
  const offline = app.meta.seats.filter((s) => !s.online && (g ? g.alive[s.id] : v.players.find((p) => p.id === s.id)?.alive));
  $("#hostWhy").textContent = host && offline.length ? `Offline: ${offline.map((s) => s.id).join(", ")}. Tap their card to remove them, or wait.` : "";
  $("#hostTools").hidden = $("#dealBtn").hidden && $("#advanceBtn").hidden && $("#endVoteBtn").hidden && !$("#hostWhy").textContent;
  renderVotes();
  renderTimer();

  const roster = g ? app.meta.seats.map((s) => ({ id: s.id, alive: !!g.alive[s.id], role: g.roles[s.id] })) : v.players;
  const me = v ? v.role : null;
  const canNight = v && v.alive && phase === "night" && ROLE[me].act;
  const canVote = v && v.alive && phase === "day";
  const n = roster.length;
  $("#players").style.setProperty("--b", `${n <= 8 ? 72 : 60}px`);
  $("#players").innerHTML = roster.map((p) => {
    const shown = p.role || app.finalRoles?.[p.id];
    const mine = v && p.id === v.you;
    const clickable = p.alive && (canVote || (canNight && (p.id !== v.you || me === "angel"))) ? "clickable" : "";
    const picked = app.target === p.id && p.alive, accused = base.accused === p.id && phase === "trial";
    const mates = v?.teamPicks ? Object.entries(v.teamPicks).filter(([m, t]) => m !== v.you && t === p.id).map(([m]) => m) : [];
    const seat = app.meta.seats.find((s) => s.id === p.id), off = seat && !seat.online;
    return `<li><button class="pcard ${p.alive ? "" : "dead"} ${picked ? "picked" : ""} ${mine ? "me" : ""} ${clickable} ${off ? "off" : ""}" data-pid="${esc(p.id)}">
      ${picked ? `<span class="ptag">${phase === "night" ? "Your pick" : "Your vote"}</span>` : accused ? `<span class="ptag bad">On trial</span>` : mates.length ? `<span class="ptag bad">${mates.length > 1 ? "Crew pick" : `${esc(mates[0])}'s pick`}</span>` : off && p.alive ? `<span class="ptag off">Offline</span>` : ""}
      ${bean(p.id, shown, !p.alive, 72)}<span class="pname">${esc(p.id)}${mine ? `<span class="vh"> (you)</span>` : ""}</span>
      <span class="prole">${p.alive ? "" : ic("skull")}${shown ? roleName(shown) : ""}</span></button>${mine ? "" : `<button class="pmore" data-menu="${esc(p.id)}" aria-label="More for ${esc(p.id)}">${MORE}</button>`}</li>`;
  }).join("");

  if (v) {
    const r = ROLE[me];
    const mates = MAFIA_TEAM.includes(me) ? v.players.filter((p) => p.id !== v.you && MAFIA_TEAM.includes(p.role)).map((p) => p.id) : [];
    const inv = v.investigations.map((x) => `<li>Night ${x.day}: <b>${esc(x.target)}</b> is <span class="${x.result === "mafia" ? "bad" : "good"}">${x.result}</span></li>`).join("");
    const side = MAFIA_TEAM.includes(me) ? ["bad", "Mafia"] : me === "jester" || me === "serialkiller" ? ["solo", "Plays alone"] : ["good", "Town"];
    $("#roleCard").innerHTML = `<div class="who">${bean(v.you, me, !v.alive, 120)}<div><span class="eyebrow">You are the</span><h3>${r.name}</h3><span class="side ${side[0]}">${side[1]}</span></div></div><p>${r.blurb}</p>
      ${mates.length ? `<p class="team">Your crew: ${mates.map(esc).join(", ")}</p>` : ""}${inv ? `<ul class="inv">${inv}</ul>` : ""}${nightNews(v)}`;
    setPrompt(...guide(v, phase, canNight));
  } else {
    $("#roleCard").innerHTML = `<div class="who">${ic("book", "huge")}<div><span class="eyebrow">You are the</span><h3>Grandmaster</h3></div></div><p>You see every role and every whisper. Tell the story, then move the night along when you are ready.</p>`;
    const left = dealt && phase === "night" ? app.meta.pending : [];
    if (!dealt) setPrompt("gold", "Deal the cards", "Look over the cast first. Everyone is waiting for their role.");
    else if (phase === "night") setPrompt(left.length ? "" : "gold", left.length ? "The town is making its moves" : "Everyone is done", left.length ? `Still deciding: ${left.map(esc).join(", ")}` : "Bring the dawn when your story is ready.");
    else if (phase === "trial") setPrompt("gold", `The trial of ${esc(g.accused)}`, "Let them say their last words, then deliver the verdict.");
    else if (phase === "ended") setPrompt("", "The story is over", "The cast takes a bow, then everyone heads back to the dock.");
  }

  syncStage(v, g, base, roster, phase, day);
  renderStory(base.log, base.winner);
  renderTalk();
  renderDirector(g);
  renderReveal(v);
  victory(base);
  updateHud();
}

function clueText({ trait, value }) {
  const what = trait === "hat" ? (value === "yes" ? "a feather from a hat" : "a smudge where a hat should be, but no hat") :
    trait === "pack" ? (value === "yes" ? "deep backpack strap marks in the mud" : "light footprints, no backpack") : `a ${value} smear of bean jelly on the door`;
  return `the culprit left ${what}.`;
}
// What your own night move did, and what happened to you, shown on your role card the morning after.
function nightNews(v) {
  const out = [], ln = v.lastNight, fresh = ln && ln.night === v.day && v.phase !== "night";
  if (fresh) {
    const t = `<b>${esc(ln.target)}</b>`;
    const say = { killed: `Your target ${t} did not wake up.`, blocked: `${t} survived your attack. Someone was watching over them.`, overruled: `The crew went with a different target than ${t}.`,
      saved: `Your shield on ${t} stopped an attack. You saved them.`, protected: `You watched over ${t}. A quiet night.`, framed: `You framed ${t}. The Detective will see mafia.`,
      mafia: `${t} is mafia.`, innocent: `${t} is innocent.` }[ln.outcome];
    if (say && ln.kind !== "investigate") out.push(say);
  }
  if (v.savedFrom && v.savedFrom.night === v.day && v.phase !== "night") out.push("You were attacked last night, and an Angel saved you.");
  if (v.deathBy) out.push(v.deathBy.killer ? `${esc(v.deathBy.killer)} got you on night ${v.deathBy.night}.` : `You were taken on night ${v.deathBy.night}.`);
  const clue = (v.clues || []).at(-1);
  if (clue) out.push(`Latest clue: ${clueText(clue)}`);
  return out.length ? `<ul class="news">${out.map((x) => `<li>${x}</li>`).join("")}</ul>` : "";
}

// ---------- stage: the live town, private night scenes, dawn, trial, exile, victory ----------
let stage = null;
function ensureStage() {
  if (stage) return stage;
  stage = createStage($("#stage"), { onTap: stageTap });
  applyDisplay();
  return stage;
}
function onPresence(m) {
  if (!stage || m.id === app.you?.id) return;
  if (m.t === "move") stage.walkTo(m.id, m.x, m.z);
  else if (!isMuted(m.id)) { stage.emote(m.id, m.kind, m.target || undefined); sfx("emote"); }
}
const lookOf = (id) => app.looks[id] || DEFAULT_LOOK;
const methodOf = (d) => (d.cause === "serialkiller" ? "serial" : d.cause === "vigilante" ? "vigilante" : killMethod(d.fx || "usual", app.mode));
const livePicks = (v) => Object.fromEntries(Object.entries(v.teamPicks || {}).filter(([, t]) => t));
const ownedEmotes = () => EMOTES.filter((e) => isOwned(e));

function stageTap(hit) {
  const v = app.view;
  if (!v || app.replaying) return;
  if ((hit.type === "bean" || hit.type === "house") && hit.id) {
    const btn = $$(".pcard.clickable").find((b) => b.dataset.pid === hit.id);
    if (btn) return btn.click();
  }
  if (hit.type === "ground" && (v.alive ? v.phase === "day" || v.phase === "trial" : v.phase !== "ended")) {
    stage.walkTo(v.you, hit.x, hit.z); presence({ t: "move", x: hit.x, z: hit.z });
  }
}
function sendEmote(kind) {
  const v = app.view;
  if (!stage || !v || v.phase === "ended") return;
  const target = app.target || null;
  stage.emote(v.you, kind, target || undefined); presence({ t: "emote", kind, target }); sfx("emote");
}
function openHideout() {
  const v = app.view;
  if (!stage || !v?.teamPicks || app.hideoutOpen) return;
  app.hideoutOpen = true;
  stage.playHideout({ members: Object.keys(v.teamPicks), picks: livePicks(v),
    onPick: (id) => { app.target = id; act({ kind: "night", target: id }); renderGame(); } })
    .finally(() => { app.hideoutOpen = false; });
}
// Keeps the town in step with the game, and plays the right scene when the phase turns.
function syncStage(v, g, base, roster, phase, day) {
  const s = ensureStage();
  s.setPlayers(roster.map((p) => ({ id: p.id, look: lookOf(p.id), alive: p.alive, me: !!v && p.id === v.you, role: p.role || app.finalRoles?.[p.id] || undefined, name: p.id })));
  const ghosts = seesGhosts();
  s.showGhosts(ghosts);
  if (ghosts) roster.forEach((p) => { if (!p.alive) s.setGhost(p.id, true); });
  $("#emoteBar").innerHTML = v && phase !== "ended" ? ownedEmotes().map((e) => `<button class="emote" data-emote="${e.id}" aria-label="${e.name}"><img alt="" src="${preview("emote", e.id, lookOf(v.you), 48)}"><span>${e.name}</span></button>`).join("") : "";
  if (app.hideoutOpen && phase === "night") s.setHideoutPicks(livePicks(v));
  const prev = app.stagePrev, fresh = base.log.slice(app.stageLog ?? base.log.length);
  app.stageLog = base.log.length;
  if (prev && prev.phase === phase && prev.day === day) return;
  app.stagePrev = { phase, day };
  if (!prev) { s.setPhase(phase); return; }
  if (phase === "day") dawnScenes(v, base, day, fresh);
  else if (phase === "trial") { s.setPhase("trial"); cue("trial"); s.playTrial({ accused: base.accused }); }
  else {
    const lynch = fresh.find((e) => e.type === "death" && e.cause === "lynch");
    if (lynch) cue("exile");
    (lynch ? s.playExile({ id: lynch.player, mode: app.mode, jester: lynch.role === "jester" }) : Promise.resolve())
      .then(() => { s.setPhase(phase === "ended" ? "ended" : "night"); if (phase === "night") { cue("night"); nightRattle(v, day); } });
  }
}
// Night recap, the same length on every phone, then the dawn everyone shares.
async function dawnScenes(v, base, day, fresh) {
  const s = stage;
  try {
    if (v) {
      const ln = v.lastNight?.night === day ? v.lastNight : null, me = lookOf(v.you);
      if (v.deathBy?.night === day) cue("kill");
      else if (v.savedFrom?.night === day || ln?.kind === "protect") cue("save");
      else if (ln?.kind === "investigate" || ln?.kind === "frame") cue("peek");
      else if (ln?.kind === "shoot") cue("shot");
      else if (ln?.kind === "kill") cue("knock");
      else cue("dream");
      if (v.deathBy?.night === day) await s.playKill({ victim: v.you, killer: v.deathBy.killer, killerLook: v.deathBy.killer ? lookOf(v.deathBy.killer) : undefined, method: methodOf(v.deathBy), showKiller: !!v.deathBy.killer });
      else if (v.savedFrom?.night === day) await s.playSave({ target: v.you, cause: methodOf(v.savedFrom) });
      else if (ln?.kind === "protect") await s.playAngel({ target: ln.target, look: me });
      else if (ln?.kind === "investigate") await s.playPeek({ target: ln.target, result: ln.outcome, look: me });
      else if (ln?.kind === "frame") await s.playFrame({ target: ln.target, look: me });
      else if (ln?.kind === "shoot") await s.playShot({ target: ln.target, hit: ln.outcome === "killed", look: me });
      else if (ln?.kind === "kill") await s.playStalk({ target: ln.target, look: me, role: v.role, outcome: ln.outcome });
      else await s.playDream({ id: v.you });
    }
    const dead = fresh.filter((e) => e.type === "death" && e.cause === "night").map((e) => ({ id: e.player, role: e.role, tomb: lookOf(e.player).tomb }));
    const clue = (base.clues || []).find((c) => c.night === day);
    cue("dawn");
    await s.playDawn({ dead, saved: fresh.some((e) => e.type === "saved"), clue: clue ? stageClue(clue) : undefined });
  } finally {
    s.setPhase("day");
    if (app.cardAfterDawn && (app.view || app.gm)) { app.cardAfterDawn = false; phaseCard(app.view || app.gm, app.view); }
  }
}
// Engine clues (hat, pack, tone) mapped onto the stage's props: a feather, a button, or footprints in a colour.
function stageClue(c) {
  const text = clueText(c).replace(/^./, (x) => x.toUpperCase());
  if (c.trait === "hat") return { trait: "head", value: "cowboy", text };
  if (c.trait === "pack") return { trait: "pack", value: "daypack", text };
  return { trait: "body", value: { warm: "cherry", cool: "cobalt", pale: "snowdrop", dark: "charcoal" }[c.value] || "bubblegum", text };
}
// Some nights, footsteps stop at your door and it rattles. It is random per phone and never tied to real moves.
function nightRattle(v, day) {
  if (!v || !v.alive || hash(`${app.code}:${day}:${v.you}`) % 100 >= 40) return;
  const delay = 5000 + (hash(`${day}:${v.you}:t`) % 12000);
  setTimeout(() => {
    if (!stage || app.view?.phase !== "night" || app.view.day !== day || stage.busy || app.hideoutOpen) return;
    stage.rattle(v.you); cue("rattle");
  }, delay);
}
// The winners dance once the final roles are known.
const won = (r, w) => (w === "mafia" ? MAFIA_TEAM.includes(r) : w === "town" ? !MAFIA_TEAM.includes(r) && r !== "jester" && r !== "serialkiller" : r === w);
function victory(base) {
  if (!stage || app.victoryPlayed || !base.winner || !app.finalRoles) return;
  app.victoryPlayed = true;
  const winners = Object.entries(app.finalRoles).filter(([, r]) => won(r, base.winner)).map(([p]) => p);
  cue("victory");
  stage.playVictory({ winners, team: base.winner, dances: Object.fromEntries(winners.map((p) => [p, lookOf(p).dance])) });
}

// ---------- the end: cast credits, then the dock; the replay waits in the lobby ----------
async function onCredits(m) {
  const until = m.until - app.offset, t0 = Date.now();
  setLooks(m.cast);
  // let the exile and a little of the victory dance play first
  while (stage?.busy && Date.now() - t0 < 9000) await sleep(250);
  await sleep(Math.max(1500, Math.min(4000, until - Date.now() - 14000)));
  if (app.creditsOn) return;
  app.creditsOn = true;
  try {
    await credits.play({
      players: m.cast.map((c) => ({ id: c.id, name: c.id, role: c.role, look: lookOf(c.id), alive: c.alive })),
      winner: m.winner, winnerText: WIN[m.winner], mode: app.mode, localId: app.you?.id || null,
      duration: Math.max(12000, until - Date.now()), portrait: (role, look) => portrait(role, look), settings: getSettings(),
    });
  } finally {
    app.creditsOn = false;
    if (app.lobby && !app.view && !app.gm && app.link) show("lobby");
  }
}
function askReplay() {
  if (app.replayCache) return playReplay(app.replayCache);
  if (!app.link?.send({ t: "replay" })) toast("The replay is not available right now.");
}
// The last game on the stage at double speed: every night's real moves, then each day's exile.
async function playReplay(data) {
  if (!data?.history?.length || app.replaying || app.view || app.gm) { if (!data?.history?.length) toast("There is no replay for that game."); return; }
  const s = ensureStage();
  app.replaying = true;
  document.body.classList.add("replaying");
  show("game");
  $("#replayStop").hidden = false;
  setLooks(data.cast);
  s.skip();
  s.setPlayers(data.cast.map((c) => ({ id: c.id, look: lookOf(c.id), alive: true, me: c.id === app.you?.id, name: c.id })));
  s.showGhosts(false);
  s.setSpeed(2);
  const mode = data.mode || "classic";
  try {
    for (const e of data.history) {
      if (!app.replaying) break;
      if (e.type === "night") {
        s.setPhase("night"); s.caption(`Night ${e.night}`, 1.2); await sleep(500);
        for (const a of e.acts) { if (!app.replaying) break; await replayAct(a, mode, data.roles); }
      } else if (e.lynched) {
        s.setPhase("day"); s.caption(`Day ${e.day}: the town sends ${e.lynched} away`, 2.2);
        await s.playExile({ id: e.lynched, mode, jester: data.roles?.[e.lynched] === "jester" });
      }
    }
    if (app.replaying) { s.setPhase("ended"); s.caption(WIN[data.winner] || "The end", 2.6); await sleep(1600); }
  } finally {
    stopReplay();
  }
}
function stopReplay() {
  app.replaying = false;
  if ($("#replayStop").hidden && !document.body.classList.contains("replaying")) return;
  stage?.skip(); stage?.setSpeed(1);
  $("#replayStop").hidden = true;
  document.body.classList.remove("replaying");
  if (!app.view && !app.gm) show(app.lobby ? "lobby" : "home");
}
function replayAct(a, mode) {
  const look = lookOf(a.actor), who = `${a.actor} the ${roleName(a.role)}`;
  const run = (fn) => { stage.caption(who, 2.6); return fn(); };
  if (a.kind === "kill" && a.outcome === "killed") return run(() => stage.playKill({ victim: a.target, killer: a.actor, killerLook: look, method: a.role === "serialkiller" ? "serial" : killMethod(look.killfx, mode), showKiller: true }));
  if (a.kind === "kill" && a.outcome === "blocked") return run(() => stage.playStalk({ target: a.target, look, role: a.role, outcome: "blocked" }));
  if (a.kind === "shoot") return run(() => stage.playShot({ target: a.target, hit: a.outcome === "killed", look }));
  if (a.kind === "protect" && a.outcome === "saved") return run(() => stage.playAngel({ target: a.target, look }));
  if (a.kind === "investigate") return run(() => stage.playPeek({ target: a.target, result: a.outcome, look }));
  if (a.kind === "frame") return run(() => stage.playFrame({ target: a.target, look }));
  return Promise.resolve();
}

function setPrompt(frame, title, text, extra = "") {
  const box = $("#actionPrompt");
  box.className = `prompt plate ${frame}`;
  box.innerHTML = `${frame === "teal" ? ic("check", "", false) : ""}<div><b>${title}</b><span>${text}</span></div>${extra}`;
}

// ---------- talk: the square, whispers, ghosts; typing or phrases ----------
const canType = () => app.you?.tier === "text" && getSettings().chat.mode === "typing";
function nameBtn(id) { return id === app.you?.id ? esc(id) : `<button class="nm" data-menu="${esc(id)}">${esc(id)}</button>`; }
function lineHtml(m) {
  if (m.whisper) return `<li class="whisper-line">${nameBtn(m.from)} whispered to ${nameBtn(m.to)}</li>`;
  return `<li class="${m.from === app.you?.id ? "mine" : ""}"><b>${nameBtn(m.from)}</b>${esc(m.text)}</li>`;
}
function chatNote(text, pane) {
  const id = pane || ($("#pane-dms").classList.contains("active") ? "dmNote" : $("#pane-ghosts").classList.contains("active") ? "ghostNote" : "chatNote");
  const el = $("#" + id);
  el.textContent = text; el.classList.add("flash");
  clearTimeout(chatNote.t); chatNote.t = setTimeout(() => { el.classList.remove("flash"); renderTalk(); }, 3200);
}
function whyPhrases() {
  const y = app.you;
  if (!y) return "";
  if (y.muted) return "You are muted for now, so phrase chat only.";
  if (y.tier === "text") return "Phrases only is on. Change Chat style in Settings to type.";
  if (y.band === "child" || app.cls === "kids") return "";
  if (y.band === "adult" && app.lobby?.settings?.visibility !== "private" && app.settingsCache.visibility !== "private") return "Public rooms use phrases. Turn on Chat with strangers in Settings to type.";
  return "Public rooms use phrases. Private rooms with a pass allow typing.";
}
function renderTalk() {
  const v = app.view, g = app.gm, base = v || g;
  if (!base) return;
  const phase = base.phase, slowed = app.slowUntil > Date.now();
  const chatOn = v ? v.communityChat : app.settingsCache.communityChat !== false;
  $("#squareTab").hidden = !chatOn;
  $('.tab[data-tab="dms"]').hidden = noWhispers();
  if (!chatOn && $("#squareTab").classList.contains("active")) switchTab(noWhispers() ? "story" : "dms");
  if (noWhispers() && $('.tab[data-tab="dms"]').classList.contains("active")) switchTab("story");
  const visible = (list) => (list || []).filter((m) => m.from === app.you?.id || (!isMuted(m.from) && !(m.whisper && isMuted(m.to))));
  const fill = (sel, list, empty) => { const el = $(sel), atEnd = el.scrollHeight - el.scrollTop - el.clientHeight < 40; el.innerHTML = visible(list).map(lineHtml).join("") || `<li class="empty">${empty}</li>`; if (atEnd || el.dataset.n !== String(list?.length)) el.scrollTop = 1e9; el.dataset.n = String(list?.length || 0); };
  fill("#chatList", base.chat, "The square is quiet.");
  const typing = canType(), phraseNote = typing ? "" : whyPhrases();
  for (const f of ["chat", "dm", "ghost"]) {
    $(`#${f}Form`).classList.toggle("phrases-only", !typing);
    $(`#${f}Input`).hidden = !typing; $(`#${f}Send`).hidden = !typing;
  }
  // the square
  $("#chatForm").hidden = !v;
  const squareOpen = !!v && v.alive && chatOn && (phase === "day" || (phase === "trial" && v.accused === v.you));
  $("#chatInput").disabled = !squareOpen; $('[data-phrase="chat"]').disabled = !squareOpen; $("#chatSend").disabled = !squareOpen;
  if (!$("#chatNote").classList.contains("flash")) {
    $("#chatNote").textContent = !v ? "" : slowed ? SAY.E_SLOWED : !v.alive ? "The living can't hear you. Use the Ghosts tab." : phase === "night" ? (noWhispers() ? "The square closes at night." : "The square closes at night. Whispers still work.")
      : phase === "trial" && v.accused !== v.you ? "Only the accused may speak during the trial." : phraseNote;
  }
  // ghosts
  const ghosts = g && !Object.values(g.alive).includes(false) && !(g.ghostChat || []).length ? null : base.ghostChat;   // the Grandmaster sees it once someone is a ghost
  $("#ghostTab").hidden = !ghosts;
  if (!ghosts && $("#ghostTab").classList.contains("active")) switchTab("story");
  if (ghosts) {
    fill("#ghostList", ghosts, "It is quiet on the other side.");
    $("#ghostForm").hidden = !v || phase === "ended";
    if (!$("#ghostNote").classList.contains("flash")) $("#ghostNote").textContent = slowed ? SAY.E_SLOWED : v ? phraseNote : "";
  }
  // whispers
  if (!noWhispers()) {
    const others = players().filter((p) => p !== app.you?.id), sel = $("#dmTo"), opts = g ? ["", ...others] : others;
    if (sel.dataset.opts !== opts.join()) {
      sel.innerHTML = opts.map((p) => `<option value="${esc(p)}">${p ? "To " + esc(p) : "All whispers"}</option>`).join("");
      sel.dataset.opts = opts.join();
      if (opts.includes(app.dmWith)) sel.value = app.dmWith;
    }
    app.dmWith = sel.value;
    const dms = base.dms || [], thread = dms.filter((d) => (g && !app.dmWith) || d.from === app.dmWith || d.to === app.dmWith);
    $("#dmList").innerHTML = visible(thread).map((d) => `<li class="${d.from === app.you?.id ? "mine" : ""}"><b>${nameBtn(d.from)} to ${nameBtn(d.to)}</b>${esc(d.text)}</li>`).join("") || `<li class="empty">No whispers yet.</li>`;
    $("#dmList").scrollTop = 1e9;
    $("#dmForm").hidden = !v || !v.alive || phase === "ended";
    if (!$("#dmNote").classList.contains("flash")) $("#dmNote").textContent = slowed ? SAY.E_SLOWED : v && v.alive && phase !== "ended" ? (typing ? "The table sees that you whispered, never what you said." : phraseNote || "The table sees that you whispered, never what you said.") : "";
    const incoming = dms.filter((d) => d.to === app.you?.id && !isMuted(d.from)).length;
    if ($('.tab[data-tab="dms"]').classList.contains("active")) app.seenDms = incoming;
    $("#dmBadge").textContent = incoming > app.seenDms ? "1" : "";
  }
}
// One message per second for everyone (three seconds while slowed down); the server enforces the same.
function readyToSend() {
  const gap = app.slowUntil > Date.now() ? 3000 : 1000;
  if (Date.now() - app.lastSend < gap) { chatNote(gap > 1000 ? SAY.E_SLOWED : SAY.E_RATE); return false; }
  app.lastSend = Date.now();
  return true;
}
function sendTyped(kind, input) {
  const text = input.value.trim();
  if (!text) return;
  if (kind === "dm" && !app.dmWith) { chatNote("Pick who to whisper to first.", "dmNote"); return; }
  if (!readyToSend()) return;
  act(kind === "dm" ? { kind, to: app.dmWith, text } : { kind, text });
  input.value = "";
}
async function sendPhrase(where) {
  const kind = where === "dm" ? "dm" : where === "ghost" ? "ghostchat" : "chat";
  if (kind === "dm" && !app.dmWith) { chatNote("Pick who to whisper to first.", "dmNote"); return; }
  const list = players().map((id, i) => ({ id, name: id, color: BEAN_COLORS[i % BEAN_COLORS.length] }));
  const pick = await phrasewheel.open({ catalog: PHRASE_CATALOG, players: list, title: kind === "dm" ? `Whisper to ${app.dmWith}` : kind === "ghostchat" ? "Ghost chat" : "Quick chat", settings: getSettings() });
  if (!pick || !readyToSend()) return;
  const args = (PHRASE_BY_ID[pick.id]?.args || []).map((k) => pick.args[k]);
  act(kind === "dm" ? { kind, to: app.dmWith, phrase: { id: pick.id, args } } : { kind, phrase: { id: pick.id, args } });
}

// ---------- tap a player: report, mute, block, and the host's and table's tools ----------
let menuOpen = false;
function playerMenu(id) {
  if (!id || id === app.you?.id || menuOpen || !app.link) return;
  const inGame = !!(app.view || app.gm), host = amHost(), seat = seatOf(id);
  const alive = app.view ? app.view.players.find((p) => p.id === id)?.alive : app.gm ? !!app.gm.alive[id] : true;
  const muted = isMuted(id), blocked = isBlocked(id), kids = app.cls === "kids" || app.band === "child";
  const items = [["report", "Report", "flag"], [muted ? "unmute" : "mute", muted ? "Unmute" : "Mute", "mute"], [blocked ? "unblock" : "block", blocked ? "Unblock" : "Block", "block"]];
  if (!inGame && host) items.push(["kick", "Remove from the room", "door"]);
  else if (!inGame && !app.you?.gm) items.push(["votekick", `Vote to remove${app.lobby?.votekicks?.[id] ? ` (${app.lobby.votekicks[id]} of ${app.lobby.kickNeed})` : ""}`, "door"]);
  if (inGame && host && seat && !seat.online && alive && (app.view || app.gm).phase !== "ended") items.push(["remove", "Remove from the game (offline)", "door"]);
  const art = (n) => (n === "door" ? uiIcon("door") : icon(n));
  const tid = nextId("pm");
  menuOpen = true;
  const L = layer({ cls: "scr-confirm scr-veil pad-pm", labelledby: tid, settings: getSettings(), escape: () => done() });
  L.el.innerHTML = `<div class="scr-dialog scr-plate pad-pm-box">
      ${bean(id, null, alive === false, 96, "pad-pm-bean")}
      <h2 class="scr-title small" id="${tid}">${esc(id)}</h2>
      ${seat && !seat.online ? `<p class="scr-note">Offline right now</p>` : ""}
      <ul class="scr-menu pad-pm-list">${items.map(([k, t, a]) => `<li><button class="scr-item" data-act="${k}"><img src="${art(a)}" alt="">${esc(t)}</button></li>`).join("")}</ul>
      <div class="scr-actions"><button class="scr-btn dark" data-x>Close</button></div></div>`;
  const done = () => { menuOpen = false; L.close(); };
  L.$("[data-x]").onclick = done;
  L.el.addEventListener("click", async (e) => {
    if (e.target === L.el) return done();
    const k = e.target.closest("[data-act]")?.dataset.act;
    if (!k) return;
    done();
    const name = { id, name: id }, s = getSettings();
    if (k === "report") {
      const r = await reports.report({ target: name, allowNote: !kids, settings: s });
      if (r) app.link?.send({ t: "report", target: id, reason: REPORT_AS[r.reason] || "other", note: `[${reports.reasonText(r.reason)}] ${r.note || ""}`.trim().slice(0, 300) });
    } else if (k === "mute") {
      if (await reports.confirmMute({ target: name, settings: s })) { setSetting("chat.muted", [...getSettings().chat.muted.filter((p) => p.id !== muteKey(id)), { id: muteKey(id), name: id }]); settingsMenu.refresh(); toast(`${id} is muted. Unmute them from their name or in Settings.`); }
    } else if (k === "unmute") { setSetting("chat.muted", getSettings().chat.muted.filter((p) => p.id !== muteKey(id))); settingsMenu.refresh(); }
    else if (k === "block") {
      if (await reports.confirmBlock({ target: name, settings: s })) {
        app.link?.send({ t: "block", id });
        const pending = readSet("pad-unblock"); pending.delete(cardOf(id)); writeSet("pad-unblock", pending);
        setSetting("chat.blocked", [...getSettings().chat.blocked.filter((p) => p.id !== muteKey(id)), { id: muteKey(id), name: id }]);
        settingsMenu.refresh(); toast(`${id} is blocked.`);
      }
    } else if (k === "unblock") { setSetting("chat.blocked", getSettings().chat.blocked.filter((p) => p.id !== muteKey(id))); settingsMenu.refresh(); toast(`${id} is unblocked.`); }
    else if (k === "kick") {
      if (await confirm({ title: `Remove ${id}?`, message: "They leave and cannot rejoin this room.", yes: "Remove", danger: true, art: "door", settings: s })) app.link?.send({ t: "kick", id });
    } else if (k === "votekick") {
      if (await confirm({ title: `Vote to remove ${id}?`, message: "When more than half of the room agrees, they are removed and our team gets a report.", yes: "Vote", danger: true, art: "door", settings: s })) app.link?.send({ t: "votekick", id });
    } else if (k === "remove") {
      if (await confirm({ title: `Remove ${id} from the game?`, message: "They are offline. They leave the town and their role is revealed.", yes: "Remove", danger: true, art: "door", settings: s })) app.link?.send({ t: "kick", id });
    }
    renderTalk();
  });
  L.focus(L.$("[data-act]"));
}

// ---------- the Grandmaster's Director tools ----------
function renderDirector(g) {
  const on = !!(g && app.meta.rigged);
  $("#directorTab").hidden = !on;
  if (!on) return;
  const ids = app.meta.seats.map((s) => s.id), alive = ids.filter((p) => g.alive[p]);
  const angelAlive = alive.some((p) => g.roles[p] === "angel");
  const opt = (list, none) => (none ? `<option value="">Nobody</option>` : "") + list.map((p) => `<option>${esc(p)}</option>`).join("");
  const inGame = [...new Set(Object.values(g.roles))];
  let html = `<p class="note">Players never receive anything when you use these. Outcomes look natural.</p>`;
  if (!app.meta.dealt) {
    html += `<div class="dir"><b>Recast before you deal</b><div class="row"><select id="dWho">${opt(ids)}</select><select id="dRole">${inGame.map((r) => `<option value="${r}">${roleName(r)}</option>`).join("")}</select><button data-rig="setRole">Swap</button></div><span class="hint">Swaps roles with whoever holds that role now.</span></div>`;
  } else if (g.phase === "night") {
    html += `<div class="dir"><b>${ic("skull")}Choose tonight's victim</b><div class="row"><select id="dKill">${opt(alive)}</select><button data-rig="forceKill">Seal it</button></div><span class="hint">Replaces the Mafia's pick, and the Angel can't save them.</span></div>
      <div class="dir"><b>Make someone untouchable</b><div class="row"><select id="dProt">${opt(alive)}</select><button data-rig="protect">Shield</button></div>${angelAlive ? "" : `<span class="hint">The Angel is dead. A quiet night may raise eyebrows.</span>`}</div>
      <div class="dir"><b>Bend the Detective's result</b><div class="row"><button data-rig="fakeMafia">Say mafia</button><button data-rig="fakeInnocent">Say innocent</button></div><span class="hint">If that player dies later, their true role is revealed.</span></div>`;
  } else if (g.phase === "day") {
    html += `<div class="dir"><b>Decide today's verdict</b><div class="row"><select id="dLynch">${opt(alive, true)}</select><button data-rig="forceLynch">Seal it</button></div></div>`;
  }
  const key = g.phase + g.day + app.meta.dealt + alive.length + JSON.stringify(g.roles), pane = $("#pane-director");
  if (pane.dataset.key !== key) { pane.innerHTML = html; pane.dataset.key = key; }
}
function rigClick(kind) {
  const val = (id) => $(id).value;
  const a = { t: "rig" };
  if (kind === "forceKill") Object.assign(a, { op: "forceKill", target: val("#dKill") });
  if (kind === "protect") Object.assign(a, { op: "protect", target: val("#dProt") });
  if (kind === "fakeMafia") Object.assign(a, { op: "fakeResult", result: "mafia" });
  if (kind === "fakeInnocent") Object.assign(a, { op: "fakeResult", result: "innocent" });
  if (kind === "setRole") Object.assign(a, { op: "setRole", player: val("#dWho"), role: val("#dRole") });
  if (kind === "forceLynch") Object.assign(a, { op: "forceLynch", target: val("#dLynch") || null });
  app.link?.send(a);
  $("#pane-director").dataset.key = "";
}

function renderReveal(v) {
  if (!v || app.revealed) return;
  app.revealed = true;
  if (v.phase === "ended") return;
  const r = ROLE[v.role];
  $("#revealCard").innerHTML = `<p class="eyebrow">Your secret identity</p>${bean(v.you, v.role, false, 200, "char")}<h2>${ic(r.icon)}${r.name}</h2><p>${r.blurb}</p><button class="btn" data-dismiss>Got it</button>`;
  $("#reveal").hidden = false;
}

function switchTab(name) {
  $$("[data-tab]").forEach((t) => t.classList.toggle("active", t.dataset.tab === name));
  $$(".pane").forEach((p) => p.classList.toggle("active", p.id === "pane-" + name));
  if (name === "dms") renderTalk();
}

// ---------- manual: story walkthrough on first launch, full book in Help ----------
// first: the automatic first-visit run; when it closes, a "New here?" bubble points at How to play.
function openWalkthrough(first = false) {
  const dlg = $("#manual"), pages = $$("#manualPages .page");
  let i = 0;
  const draw = () => {
    dlg.innerHTML = `<div class="walk">${pages[i].outerHTML}<div class="walk-nav">
      <button class="link" data-walk="-1" ${i ? "" : "hidden"}>Back</button>
      <span class="pips">${pages.map((_, j) => `<i class="${j === i ? "on" : ""}"></i>`).join("")}</span>
      <button class="btn" data-walk="1">${i === pages.length - 1 ? "Let's play" : "Next"}${ic("arrow")}</button></div></div>`;
  };
  dlg.onclick = (e) => {
    const step = e.target.closest("[data-walk]")?.dataset.walk;
    if (!step) return;
    if (+step > 0 && i === pages.length - 1) { dlg.close(); try { localStorage.setItem("pad-manual-seen", "1"); } catch { /* blocked */ } return; }
    i = Math.max(0, i + +step); draw();
  };
  if (first) dlg.addEventListener("close", newHere, { once: true });
  draw(); dlg.showModal();
}
// The How to play tile glows and a speech bubble over it says "New here?", until the player taps it.
function newHere() {
  const tile = $("#home [data-open-help]");
  if (!tile || tile.classList.contains("glow")) return;
  tile.classList.add("glow");
  tile.insertAdjacentHTML("beforeend", `<span class="newhere" aria-hidden="true">New here?</span>`);
  tile.addEventListener("click", () => { tile.classList.remove("glow"); tile.querySelector(".newhere")?.remove(); }, { once: true });
}

// ---------- names ----------
function needName() {
  const raw = $("#nameInput").value.trim(), n = raw.replace(/\s+/g, "");
  if (!n) { $("#homeMsg").textContent = app.band === "child" ? "Pick a nickname first." : "Pick a name first."; $("#nameInput").focus(); return false; }
  if (!nameOk(n)) { $("#homeMsg").textContent = "Names use letters, numbers and _ only, up to 16."; $("#nameInput").focus(); return false; }
  app.name = n;
  try { localStorage.setItem("pad-name", n); } catch { /* blocked */ }
  return true;
}

// ---------- wardrobe ----------
// Every locked item stays locked until the shop exists; "pad-owned" will hold bought item ids.
function savedLook() { try { return cleanLook(JSON.parse(localStorage.getItem("pad-look"))) || { ...DEFAULT_LOOK }; } catch { return { ...DEFAULT_LOOK }; } }
const owned = () => { try { return new Set(JSON.parse(localStorage.getItem("pad-owned") || "[]")); } catch { return new Set(); } };
const isOwned = (item) => !item.locked || owned().has(item.id);
for (const rack of Object.keys(RACKS)) { const it = RACKS[rack].find((i) => i.id === app.look[rack]); if (it && !isOwned(it)) app.look[rack] = DEFAULT_LOOK[rack]; }
try { localStorage.setItem("pad-look", JSON.stringify(app.look)); localStorage.removeItem("pad-admin"); } catch { /* blocked */ }
const mirror = createMirror($("#mirror"));

function openWardrobe() {
  app.wardrobeFrom = app.screen === "lobby" ? "lobby" : "home";
  app.trying = { ...app.look };
  mirror.set(app.trying); mirror.run(true);
  show("wardrobe"); renderWardrobe();
}
function closeWardrobe() { app.trying = { ...app.look }; show(app.wardrobeFrom === "lobby" && app.lobby ? "lobby" : "home"); }
// In the lobby a new outfit goes to the server, which sends the lobby out again.
function syncLook() { if (app.lobby && !app.view && !app.gm && !app.you?.gm) app.link?.send({ t: "look", look: app.look }); }
function thumb(rack, id) {
  const t = app.trying;
  if (rack === "body") return portrait(null, { body: id, head: "none", pack: "none" });
  if (rack === "head") return portrait(null, { body: t.body, head: id, pack: "none" });
  if (rack === "pack") return portrait(null, { body: t.body, head: "none", pack: id }, false, "back");
  return preview(rack, id, t);
}
function renderWardrobe() {
  $$("[data-rack]").forEach((b) => b.classList.toggle("active", b.dataset.rack === app.rack));
  const mine = owned();
  $("#rackList").innerHTML = SHOP[app.rack].map((item) => {
    const locked = item.locked && !mine.has(item.id);
    return `<li><button class="swatch${locked ? " locked" : ""}" data-item="${item.id}" aria-pressed="${(app.rack === "emote" ? app.emotePick : app.trying[app.rack]) === item.id}">
      <img class="bean" alt="" width="84" height="84" src="${thumb(app.rack, item.id)}">${item.name}${locked ? `<img class="lock" alt="Locked" src="${uiIcon("lock")}">` : ""}</button></li>`;
  }).join("");
  updatePreview();
  const item = SHOP[app.rack].find((i) => i.id === (app.rack === "emote" ? app.emotePick : app.trying[app.rack])) || SHOP[app.rack][0];
  $("#lookName").textContent = item.id === "none" ? "" : item.name;
  $("#lockNote").textContent = "";
}
// The preview shows what the selected item really does: the bean for outfits, the house for houses,
// and a live scene on a small stage for kill effects, tombstones, emotes and dances. It loops while selected.
const STAGE_RACKS = ["killfx", "tomb", "emote", "dance"];
let wstage = null, previewTok = 0;
function updatePreview() {
  const rack = app.rack, onStage = STAGE_RACKS.includes(rack);
  if ($("#mirror").offsetWidth) app.mirrorW = $("#mirror").offsetWidth;
  $("#mirror").hidden = onStage; $("#wstageBox").hidden = !onStage;
  $("#wstageBox").style.width = $("#wstageBox").style.height = `${app.mirrorW || 300}px`;
  $(".mirror .eyebrow").textContent = rack === "body" || rack === "head" || rack === "pack" ? "Your bean" : "Preview";
  const tok = ++previewTok;
  if (!onStage) { wstage?.run(false); mirror.set(app.trying, rack === "house" ? "house" : "bean"); mirror.run(true); return; }
  mirror.run(false);
  if (!wstage) { wstage = createStage($("#wstage"), { onTap() {}, wander: false }); applyDisplay(); }
  wstage.run(true); wstage.skip();
  const me = { ...app.trying }, id = rack === "emote" ? app.emotePick || "wave" : me[rack];
  const cast = [{ id: "you", name: "You", look: me, alive: true, me: true },
    ...["Muffin", "Pickle", "Waffle"].map((n, i) => ({ id: n, name: n, look: { ...DEFAULT_LOOK, body: ["mint", "sky", "butter"][i] }, alive: true, me: false }))];
  const loop = async () => {
    if (tok !== previewTok || app.screen !== "wardrobe") return;
    wstage.setPlayers(cast);
    if (rack === "killfx") { wstage.setPhase("night"); await wstage.playKill({ victim: "Muffin", killer: "you", killerLook: me, method: killMethod(id, "classic"), showKiller: true }); }
    else if (rack === "tomb") { wstage.setPhase("night"); await sleep(600); await wstage.playDawn({ dead: [{ id: "you", tomb: id }], saved: false }); await sleep(1200); }
    else if (rack === "dance") { wstage.setPhase("day"); await wstage.playVictory({ winners: ["you"], team: "town", dances: { you: id } }); await sleep(3200); }
    else { wstage.setPhase("day"); wstage.zoom(0.6); await wstage.walkTo("you", 0, 1.4); if (tok !== previewTok) return; wstage.emote("you", id); await sleep(2600); }
    if (tok === previewTok) setTimeout(loop, 700);
  };
  loop();
}
function tryOn(id) {
  const item = SHOP[app.rack].find((i) => i.id === id);
  if (!item) return;
  if (app.rack === "emote") { app.emotePick = id; return renderWardrobe(); }   // emotes are owned, not worn
  app.trying[app.rack] = id;
  if (isOwned(item)) { app.look[app.rack] = id; try { localStorage.setItem("pad-look", JSON.stringify(app.look)); } catch { /* blocked */ } syncLook(); }
  mirror.set(app.trying); renderWardrobe();
  if (!isOwned(item)) notYet(id);
}
function notYet(id) {
  const btn = $$("#rackList [data-item]").find((b) => b.dataset.item === id);
  if (!btn) return;
  const pop = document.createElement("span");
  pop.className = "not-yet"; pop.setAttribute("role", "status"); pop.textContent = "Not yet available";
  btn.append(pop); setTimeout(() => pop.remove(), 1700);
}

// ---------- Quick Play, the room list ----------
async function openQuickPlay() {
  if (!needName() || !(await needGuest())) return;
  let open = true;
  const load = async () => {
    try {
      const r = await call("GET", "/rooms");
      return r.rooms.map((x) => ({ id: x.code, name: `Room ${x.code}`, mode: x.mode, players: x.players, max: 16, narrator: x.narrator, private: x.locked }));
    } catch { return null; }
  };
  const poll = setInterval(async () => { if (!open || document.hidden) return; const rooms = await load(); if (open && rooms) roomlist.update(rooms); }, 10000);
  load().then((rooms) => { if (open) roomlist.update(rooms || []); });
  try {
    await roomlist.open({ rooms: null, settings: getSettings(), on: {
      refresh: load,
      join: async (room, pass) => {
        const c = await connect(room.id, { pass: pass || "" });
        if (c.ok) return true;
        if (c.code === 4007) return pass ? "That pass did not work." : "This room needs its pass.";
        return joinFail(c, { code: room.id, inList: true });
      },
      quickJoin: () => quickJoin(),
      create: (o) => createRoom("bot", o),
    } });
  } finally { open = false; clearInterval(poll); }
}

// ---------- the profile card ----------
async function openProfile() {
  if (!(await needGuest())) return;
  const child = app.band === "child";
  const owned = Object.fromEntries(Object.entries(SHOP).map(([r, list]) => [r, list.filter((i) => isOwned(i)).map((i) => i.id)]));
  const statsOf = (me) => { const s = me?.stats || {}; return { played: s.games || 0, wins: s.wins || 0, roles: Object.fromEntries(Object.entries(s.roles || {}).map(([r, x]) => [r, { played: x.played || 0, wins: x.won || 0 }])) }; };
  const linkOf = (token) => `${location.origin}${location.pathname}#f=${token}`;
  const friendOf = (f) => ({ id: f.gid, name: f.name || "New player", look: f.look || DEFAULT_LOOK, online: !!f.online, room: f.room ? { code: f.room } : null });
  const reqOf = (r) => ({ id: r.gid, name: r.name || "New player", look: r.look || DEFAULT_LOOK });
  let open = true, poll = 0;
  const refresh = async () => {
    if (child) return;
    try { const f = await call("GET", "/friends"); if (open) profile.update({ friends: f.friends.map(friendOf), requests: f.requests.incoming.map(reqOf) }); } catch { /* try again on the next poll */ }
  };
  call("GET", "/me").then((me) => { app.me = me; if (open) profile.update({ stats: statsOf(me), player: { id: me.gid, name: me.name || app.name || $("#nameInput").value || "You", look: app.look } }); }).catch(() => {});
  if (!child) {
    call("POST", "/friends/link").then((l) => open && profile.update({ friendLink: linkOf(l.token) })).catch(() => {});
    refresh();
    poll = setInterval(() => { if (!document.hidden) refresh(); }, 30000);
  }
  try {
    await profile.open({
      player: { id: app.guest?.gid || "", name: app.me?.name || app.name || $("#nameInput").value || "You", look: app.look },
      owned, stats: statsOf(app.me), friendLink: "", friends: [], requests: [], tab: "card", friendsTab: !child, settings: getSettings(),
      on: {
        copy() {},
        ...(navigator.share ? { share: (url) => navigator.share({ title: "Puddleton", text: "Be my friend on Puddleton!", url }).catch(() => {}) } : {}),
        resetLink: async () => { try { return linkOf((await call("POST", "/friends/link/reset")).token); } catch { toast("Could not make a new link right now."); return null; } },
        join: (f) => { profile.close(); if (f.room?.code && needName()) joinCode(f.room.code); },
        remove: (f) => call("POST", "/friends/remove", { gid: f.id }).catch(() => toast("Could not remove that friend right now.")),
        wardrobe: () => { profile.close(); openWardrobe(); },
        accept: async (r) => { const res = await call("POST", "/friends/accept", { gid: r.id }); return friendOf({ ...res.friend, online: false, room: null }); },
        decline: (r) => call("POST", "/friends/decline", { gid: r.id }),
      },
    });
  } finally { open = false; clearInterval(poll); }
}
// A friend link (#f=TOKEN) opened on this device: send the request once the guest pass is ready.
async function redeemFriendLink() {
  const m = location.hash.match(/^#f=([a-z2-7]{24})$/);
  if (!m) return;
  history.replaceState(null, "", location.pathname + location.search);
  if (app.band === "child") { toast("Friend links are not available for your age group."); return; }
  if (!(await needGuest())) return;
  // a brand new player has no name on the server yet: ask, so the other player can see who is asking
  let name = app.me?.name || "";
  if (!name) { name = await askName(); if (name === null) return; }
  try {
    const r = await call("POST", "/friends/redeem", { token: m[1], name });
    const who = (r.to || r.friend)?.name || "that player";
    await notice({ title: r.status === "friends" ? "Friends!" : "Request sent", text: r.status === "friends" ? `You and ${who} are friends now.` : `We asked ${who} to be your friend. You will see them in your friends list once they say yes.` });
  } catch (e) {
    const say = { E_LINK: "That friend link was already used or has run out. Ask for a fresh one.", E_SELF: "That is your own friend link.", E_FRIENDS_FULL: "Your friends list is full.", E_REQUEST_LIMIT: "You have sent a lot of friend requests today. Try again tomorrow.", E_REQUESTS_FULL: "That player has too many requests waiting right now." };
    toast((e instanceof ApiError && say[e.code]) || "Could not open that friend link right now.");
  }
}

// The name to send with a friend request. Resolves with the name, or null if the player closes the dialog.
function askName() {
  return new Promise((resolve) => {
    const tid = nextId("nm");
    const L = layer({ cls: "scr-confirm scr-veil", labelledby: tid, settings: getSettings(), escape: () => end(null) });
    L.el.innerHTML = `<form class="scr-dialog scr-plate" novalidate><img class="scr-art" src="${icon("people")}" alt="">
        <h2 class="scr-title" id="${tid}">Who is asking?</h2>
        <p class="scr-lede">Type the name your friend knows you by, so they can tell the request is from you.</p>
        <label class="scr-field"><span class="scr-label">Your name</span><input class="scr-input" name="n" maxlength="16" autocomplete="nickname" spellcheck="false" value="${esc($("#nameInput").value.trim())}"></label>
        <p class="scr-rl-err" role="alert"></p>
        <div class="scr-actions"><button type="button" class="scr-btn dark" data-no>Not now</button><button type="submit" class="scr-btn">Send request</button></div></form>`;
    const f = L.$("form");
    const end = (v) => { L.close(); resolve(v); };
    L.$("[data-no]").onclick = () => end(null);
    f.onsubmit = (e) => {
      e.preventDefault();
      const n = f.n.value.trim().replace(/\s+/g, "");
      if (!nameOk(n)) { L.$(".scr-rl-err").textContent = "Letters, numbers and _ only, up to 16."; f.n.focus(); return; }
      $("#nameInput").value = n; try { localStorage.setItem("pad-name", n); } catch { /* blocked */ }
      end(n);
    };
    L.focus(f.n);
  });
}
// A short message with one OK button.
function notice({ title, text, art = icon("people") }) {
  return new Promise((resolve) => {
    const tid = nextId("nt");
    const L = layer({ cls: "scr-confirm scr-veil", labelledby: tid, role: "alertdialog", settings: getSettings(), escape: () => end() });
    L.el.innerHTML = `<div class="scr-dialog scr-plate"><img class="scr-art" src="${art}" alt=""><h2 class="scr-title" id="${tid}">${esc(title)}</h2>
      <p class="scr-lede">${esc(text)}</p><div class="scr-actions"><button class="scr-btn" data-ok>OK</button></div></div>`;
    const end = () => { L.close(); resolve(); };
    L.$("[data-ok]").onclick = end;
    L.focus(L.$("[data-ok]"));
  });
}

// ---------- settings ----------
function openSettings(section) {
  settingsMenu.open({
    band: app.band, version: `${VERSION} (protocol ${PROTOCOL})`, section, settings: getSettings(),
    onHowToPlay: () => { settingsMenu.close(); $("#help").hidden = false; },
    onReplayTutorial: () => { settingsMenu.close(); openWalkthrough(); },
    onClearData: clearData,
  });
}
async function clearData() {
  const ok = await confirm({ title: "Clear my data?", message: "This deletes your guest pass, name, look, stats and friends, from this device and from our server. It cannot be undone. Bans and open reports are kept, and your age group stays set.", yes: "Clear my data", danger: true, art: "close", settings: getSettings() });
  if (!ok) return;
  if (guest()) {
    try { await call("POST", "/me/delete", {}); }
    catch (e) { if (!(e instanceof ApiError && e.status === 401)) { toast("We could not reach the island, so nothing was deleted. Try again when you are online."); return; } }
  }
  settingsMenu.close();
  if (app.link) { app.leaving = true; app.link.close(); }
  for (const k of [...STORAGE_KEYS, "pad-settings", "pad-look", "pad-name", "pad-owned", "pad-manual-seen", "pad-unblock", "pad-sound"]) { try { localStorage.removeItem(k); } catch { /* blocked */ } }
  try { sessionStorage.removeItem("pad-mute-seen"); } catch { /* blocked */ }
  location.replace(location.pathname);
}

// ---------- wiring ----------
document.addEventListener("click", async (e) => {
  const t = e.target.closest("button, [data-home]");
  if (!t) return;
  if (t.dataset.menu) return playerMenu(t.dataset.menu);
  if (t.id === "quickBtn") return openQuickPlay();
  if (t.id === "createBtn") { if (needName() && (await needGuest())) { $("#chooseMsg").textContent = "Pick a narrator to open your room."; show("choose"); } return; }
  if (t.dataset.narrator) {
    // same Public or Private (with a room pass) choice as Quick Play's Create a room
    const narrator = t.dataset.narrator;
    await roomlist.createDialog({ create: async (o) => {
      const r = await showLoading(createRoom(narrator, o), { label: "Opening your room", settings: getSettings() });
      return r === true ? true : (typeof r === "string" ? r : "Could not open a room right now.");
    } }, getSettings());
    return;
  }
  if (t.id === "joinBtn") {
    if (!needName() || !(await needGuest())) return;
    const code = $("#codeInput").value.trim().toUpperCase();
    if (!/^[A-Z0-9]{6}$/.test(code)) { $("#homeMsg").textContent = "Room codes have 6 letters and numbers."; return; }
    $("#homeMsg").textContent = "";
    return joinCode(code);
  }
  if (t.id === "gearBtn") return openSettings();
  if (t.id === "profileBtn") return openProfile();
  if (t.hasAttribute("data-home")) return goHome("");
  if (t.id === "hideoutBtn") return openHideout();
  if (t.id === "replayBtn") return askReplay();
  if (t.id === "replayStop") return stopReplay();
  if (t.dataset.emote) return sendEmote(t.dataset.emote);
  if (t.dataset.phrase) return sendPhrase(t.dataset.phrase);
  if (t.id === "backBtn") {
    if (app.screen === "wardrobe") return closeWardrobe();
    if (app.screen === "choose") return show("home");
    if (app.screen === "lobby" || app.screen === "shuffle") {
      if (await confirm({ title: "Leave the room?", message: amHost() ? "Someone else becomes the host. You can rejoin with the code while the game has not started." : "You can rejoin with the code while the game has not started.", yes: "Leave", no: "Stay", art: "door", settings: getSettings() })) leaveRoom("You left the room.");
      return;
    }
    if (app.screen === "game") {
      const over = (app.view || app.gm)?.phase === "ended";
      if (await confirm({ title: "Leave the game?", message: over ? "The cast is about to take a bow." : app.you?.gm ? "The town clock takes over the story." : "You leave the town for good and your role is revealed.", yes: "Leave", no: "Stay", danger: !over, art: "door", settings: getSettings() })) leaveRoom("You left the game.");
      return;
    }
    return;
  }
  if (t.dataset.mode && app.lobby) return sendSettings({ mode: t.dataset.mode });
  if (t.dataset.vis && app.lobby) {
    const st = app.lobby.settings;
    if (t.dataset.vis === "public") { app.visDraft = ""; sendSettings({ visibility: "public" }); }
    else if (st.hasPass) { app.visDraft = ""; sendSettings({ visibility: "private" }); }
    else { app.visDraft = "private"; renderLobby(); $("#passInput").focus(); }
    return;
  }
  if (t.id === "startBtn") return app.link?.send({ t: "start" });
  if (t.id === "dealBtn") return app.link?.send({ t: "deal" });
  if (t.id === "copyBtn") {
    const url = `${location.origin}${location.pathname}?room=${app.code}`;
    if (navigator.share && matchMedia("(pointer: coarse)").matches) navigator.share({ title: "Puddleton", text: `Join my Puddleton game. Room code ${app.code}`, url }).catch(() => {});
    else { navigator.clipboard?.writeText(url).catch(() => {}); toast("Invite link copied"); }
    return;
  }
  if (t.dataset.pid) {
    if (!t.classList.contains("clickable")) return playerMenu(t.dataset.pid === app.you?.id ? "" : t.dataset.pid);
    const id = t.dataset.pid, night = app.view.phase === "night", asked = app.lastPhaseKey;
    if (!night && getSettings().gameplay.confirmVote && !(await confirm({ title: `Vote for ${id}?`, message: "You can change your vote until the day ends.", yes: "Vote", settings: getSettings() }))) return;
    if (!app.view || app.lastPhaseKey !== asked) return;   // the day ended while the question was open
    app.target = id;
    click();
    act(night ? { kind: "night", target: id } : { kind: "vote", target: id });
    return renderGame();
  }
  if (t.id === "abstainBtn") { app.target = null; click(); act({ kind: "vote", target: null }); return renderGame(); }
  if (t.id === "advanceBtn" || t.id === "endVoteBtn") return app.link?.send({ t: "advance" });
  if (t.id === "endRoomBtn") {
    if (await confirm({ title: "End the room?", message: "Everyone goes back to town and this room closes.", yes: "End the room", no: "Keep playing", danger: true, art: "door", settings: getSettings() })) { app.leaveMsg = "You ended the room."; app.link?.send({ t: "endroom" }); }
    return;
  }
  if (t.dataset.tab) return switchTab(t.dataset.tab);
  if (t.id === "wardrobeBtn" || t.id === "lobbyWardrobeBtn") return openWardrobe();
  if (t.dataset.rack) { app.rack = t.dataset.rack; return renderWardrobe(); }
  if (t.dataset.item) return tryOn(t.dataset.item);
  if (t.id === "wardrobeDone") return closeWardrobe();
  if (t.dataset.rig) return rigClick(t.dataset.rig);
  if (t.hasAttribute("data-dismiss")) {
    $("#reveal").hidden = true;
    if (app.afterReveal && app.view) { app.afterReveal = false; phaseCard(app.view, app.view); }   // role seen: the first night begins
    return;
  }
  if (t.hasAttribute("data-open-help")) { $("#help").hidden = false; return; }
  if (t.hasAttribute("data-close-help")) { $("#help").hidden = true; return; }
});
$("#chatToggle").onchange = (e) => sendSettings({ communityChat: e.target.checked });
$("#killerToggle").onchange = (e) => sendSettings({ victimSeesKiller: e.target.checked });
$("#secretToggle").onchange = (e) => sendSettings({ secretWhispers: e.target.checked });
$("#rigToggle").onchange = (e) => sendSettings({ rigged: e.target.checked });
$("#passForm").onsubmit = (e) => {
  e.preventDefault();
  const pass = $("#passInput").value.trim();
  if ([...pass].length < 3 || [...pass].length > 32) { $("#visNote").textContent = SAY.E_PASS_NEEDED; return; }
  app.visDraft = "";
  sendSettings({ visibility: "private", pass });
  $("#passInput").value = "";
  toast("Room pass set. Share it with your friends.");
};
$("#ghostForm").onsubmit = (e) => { e.preventDefault(); sendTyped("ghostchat", $("#ghostInput")); };
$("#chatForm").onsubmit = (e) => { e.preventDefault(); sendTyped("chat", $("#chatInput")); };
$("#dmForm").onsubmit = (e) => { e.preventDefault(); sendTyped("dm", $("#dmInput")); };
$("#dmTo").onchange = () => { app.dmWith = $("#dmTo").value; renderTalk(); };
$("#codeInput").addEventListener("keydown", (e) => { if (e.key === "Enter") $("#joinBtn").click(); });

$("#nameInput").value = (() => { try { return localStorage.getItem("pad-name") || ""; } catch { return ""; } })();
const inviteCode = (new URLSearchParams(location.search).get("room") || (/^#[A-Za-z0-9]{6}$/.test(location.hash) ? location.hash.slice(1) : "")).toUpperCase().slice(0, 6);
$("#codeInput").value = inviteCode;
$("#heroBeans").innerHTML = ["mafia", "angel", "detective", "jester", "godfather"].map((r, i) => `<img class="bean" alt="" width="88" height="88" src="${portrait(r, BEAN_COLORS[i])}">`).join("");
$$("[data-role]").forEach((el, i) => el.insertAdjacentHTML("afterbegin", `<img class="bean" alt="" width="44" height="44" src="${portrait(el.dataset.role, BEAN_COLORS[i % 8])}">`));
setInterval(renderTimer, 500);
// Icons the connection screens need when the network is already gone: fetch them now (both looks), while it is still here.
const keepIcons = ["high", "low"].flatMap((q) => [icon("refresh", q), uiIcon("close", q), uiIcon("help", q), uiIcon("door", q)]).map((src) => Object.assign(new Image(), { src }));
initSound($("#soundBtn"));
applyDisplay();
watchBattery();
// Keep the screen awake during a game, and pick the game back up when the player returns to the tab.
const wake = () => { if ("wakeLock" in navigator && document.visibilityState === "visible") navigator.wakeLock.request("screen").catch(() => {}); };
document.addEventListener("click", wake, { once: true });
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState !== "visible") return;
  if (app.code) wake();
  if (app.reconnect) return app.reconnect.retry();
  // a phone that slept may hold a dead socket: ask for a pong and reconnect if none comes
  if (app.link?.live) {
    const link = app.link, asked = Date.now();
    link.send({ t: "ping" });
    setTimeout(() => { if (app.link === link && link.live && !(app.lastPong >= asked)) link.ws?.close(4900, "no pong"); }, 5000);
  }
});
let offlineCard = null;
addEventListener("offline", () => { if (!offlineCard) { offlineCard = overlays.offline({ settings: getSettings() }); offlineCard.done.then(() => { offlineCard = null; }); } });
addEventListener("online", () => { offlineCard?.close(); app.reconnect?.retry(); });
if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => {});

// ---------- start up: one start screen (the age question over it on a first visit), then home ----------
// Sound needs no title screen: audio.mjs starts it on the first tap or key anywhere.
(async function startup() {
  begin([
    { label: "Checking the ferry timetable", run: () => call("GET", "/version", null, { auth: false }).then((v) => { if (v?.protocol !== PROTOCOL) app.updateNeeded = true; }, () => {}) },
    { label: "Getting your guest pass", weight: 2, run: async () => {
      app.band = await agegate.show({ settings: getSettings(), over: true });   // first visit only; at once after that
      applyBandUI();
      await ensureGuest(app.band).then(onGuest, (e) => { app.guestError = e; });
    } },
    { label: "Waking the beans", run: () => Promise.race([Promise.all([document.fonts?.ready, sleep(300)]), sleep(4000)]) },
  ]);
  try { await started; } catch (e) { console.error(e); }
  document.body.classList.remove("booting");
  show("home");
  if (app.updateNeeded) overlays.updateAvailable({ settings: getSettings() });
  if (app.banned) await showBan(app.banned);
  else if (app.guestError) await apiFail(app.guestError);
  if (app.muteNotice) { const m = app.muteNotice; app.muteNotice = null; await sanction.show({ kind: "muted", reason: sanctionReason(m.reason), until: m.until ? new Date(m.until) : null, playerName: app.name, appealEmail: m.appeal, settings: getSettings() }); }
  let seen = false;
  try { seen = !!localStorage.getItem("pad-manual-seen"); } catch { /* blocked */ }
  if (!seen) openWalkthrough(true);
  redeemFriendLink();
  if (inviteCode) { $("#homeMsg").textContent = `Invited to room ${inviteCode}. Pick a name and tap Join.`; ($("#nameInput").value ? $("#joinBtn") : $("#nameInput")).focus(); }
})();

// For the automated tests only: a read-only peek at the state, and a way to drop the socket like a lost signal.
window.__pad = { get app() { return app; }, get stage() { return stage; }, drop() { app.link?.ws?.close(4900, "test drop"); } };
