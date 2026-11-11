import { createGame, applyAction, playerView, gmView, nightPending, allVoted, MAFIA_TEAM } from "./engine/engine.mjs";
import { createWorld, town, addBean, portrait, BEAN_COLORS } from "./world.mjs";
import { initSound } from "./audio.mjs";

const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const ic = () => "";   // this design uses type and character portraits, no icon sheet
const PREFIX = "puddleton-after-dark-";
const ALPHA = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const RESERVED = ["gm"];

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
    quiet: ["Morning. Everyone wakes up with all their toes. Nobody died last night.", "A peaceful night. Only the crickets were plotting."],
    nolynch: ["The town couldn't agree. Everyone shuffles home, side-eyeing each other.", "No majority, no exile. The Mafia smiles under its hat."],
  },
  crazy: {
    night: ["Kaboom, sort of. {p} was launched into the stratosphere by mysterious forces. They were the {r}.", "{p} slipped on a banana peel that was definitely placed there on purpose. They were the {r}.", "{p} vanished in a puff of glitter and bad decisions. They were the {r}."],
    lynch: ["The mob grabs pitchforks and party hats. Bye, {p}. They were the {r}.", "{p} is yeeted out of town by popular demand. They were the {r}."],
    quiet: ["Chaos took the night off. Everybody lives. Suspicious.", "Against all odds, nobody died. The town is confused."],
    nolynch: ["Everyone voted for everyone. Democracy has left the chat.", "The vote dissolved into a pillow fight. No exile today."],
  },
  gore: {
    night: ["{p} was found splattered across the bakery wall like strawberry jam. They were the {r}.", "Only {p}'s little shoes remained, still warm and dripping. They were the {r}.", "The streetlamp flickered over what used to be {p}. Squish. They were the {r}."],
    lynch: ["The town drags {p} to the old well. A splash, then a crunch. They were the {r}.", "{p} meets the guillotine of the village square. Thunk. They were the {r}."],
    quiet: ["The gutters run clean this morning. Nobody died, yet.", "Blood was expected. None was spilled. The night is hungry."],
    nolynch: ["The rope swings empty. The crowd groans, unsatisfied.", "No one hangs today. The crows are disappointed."],
  },
  speed: {
    night: ["{p} is down. Role: {r}.", "Lights out for {p}. They were the {r}."],
    lynch: ["Voted out: {p}, the {r}.", "{p} gets the boot. {r}."],
    quiet: ["Nobody died. Keep moving."],
    nolynch: ["No exile. Next."],
  },
};
const ERR = {
  E_PHASE: "Not right now.", E_DEAD: "The dead can only watch.", E_NO_ABILITY: "Your role has no night power. Sleep tight.",
  E_TARGET: "You can't pick that one.", E_TEXT: "Messages need 1 to 500 characters.", E_CHAT_DISABLED: "The Town Square is closed this game.",
  E_ENDED: "The game is over.", E_NOT_RIGGED: "Not available.", E_UNKNOWN: "Something went sideways.",
};

const world = createWorld($("#world")), home = town(world, 0, 0, 0);
["villager", "mayor", "angel", "detective"].forEach((r, i) => addBean(world, home, r, i + 2, i * 1.3 - 2, 2.6 + (i % 2) * 0.8));
world.ticks.push((t) => { const a = Math.sin(t * 0.08) * 0.6; world.camera.position.set(Math.sin(a) * 19, 5.5, Math.cos(a) * 19); world.camera.lookAt(0, 1.6, 0); });

const app = {
  name: "", id: "", host: false, gmHuman: false, code: "", peer: null, hostConn: null,
  conns: new Map(), tokens: new Map(), lastMsg: new Map(),
  lobby: [], settings: { mode: "classic", communityChat: true, rigged: false },
  state: null, dealt: false, view: null, gm: null, mode: "classic", deadline: 0, target: undefined,
  lastPhaseKey: "", dmWith: "", seenDms: 0, finalRoles: null, revealed: false, retries: 0,
};

// ---------- helpers ----------
const hash = (s) => [...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);
const roleName = (r) => (r ? ROLE[r].name : "Unknown");
const randHex = () => [...crypto.getRandomValues(new Uint8Array(12))].map((b) => b.toString(16).padStart(2, "0")).join("");
function toast(msg) { const t = $("#toast"); t.textContent = msg; t.hidden = false; clearTimeout(toast.t); toast.t = setTimeout(() => (t.hidden = true), 2600); }
function show(id) { $$(".screen").forEach((s) => s.classList.toggle("active", s.id === id)); $("#phaseWrap").hidden = id !== "game"; }
function makeCode() { const a = crypto.getRandomValues(new Uint32Array(6)); return [...a].map((x) => ALPHA[x % ALPHA.length]).join(""); }
function cleanId(name) { return name.replace(/[^A-Za-z0-9_]/g, "").slice(0, 16) || "Bean" + Math.floor(Math.random() * 900 + 100); }
function uniqueId(base, taken) {
  let id = base, n = 2;
  while (taken.includes(id) || RESERVED.includes(id)) id = base.slice(0, 14) + n++;
  return id;
}
function players() { return app.state ? app.state.setup.players : app.view ? app.view.players.map((p) => p.id) : app.lobby; }
function bean(id, role, dead = false, size = 72, cls = "") {   // portraits are 128px renders
  const px = size, color = BEAN_COLORS[Math.max(0, players().indexOf(id)) % BEAN_COLORS.length];
  return `<img class="bean ${cls}" alt="" width="${px}" height="${px}" src="${portrait(role, color, dead)}">`;
}
const seatKey = (code) => `pad-seat-${code}`;

// ---------- host ----------
function hostRoom(narrator) {
  if (app.host) return;
  app.host = true;
  app.gmHuman = narrator === "human";
  if (app.gmHuman) app.id = "";
  const open = () => {
    const code = makeCode(), peer = new Peer(PREFIX + code);
    peer.on("open", () => {
      app.peer = peer; app.code = code;
      app.lobby = app.gmHuman ? [] : [app.id];
      location.hash = code;
      renderLobby(); show("lobby");
    });
    peer.on("error", (e) => { if (e.type === "unavailable-id") { peer.destroy(); open(); } else toast("Connection trouble: " + e.type); });
    peer.on("connection", (conn) => conn.on("data", (msg) => hostReceive(conn, msg)));
  };
  open();
}

function seatOf(conn) { return [...app.conns].find(([, c]) => c === conn)?.[0]; }

function hostReceive(conn, msg) {
  if (msg?.t === "hello") {
    if (seatOf(conn)) return;                                   // one seat per connection
    const seat = msg.seat;
    if (seat && typeof seat.id === "string" && app.tokens.get(seat.id) === seat.token) {
      const old = app.conns.get(seat.id);                       // rejoin: the token proves the seat
      if (old && old !== conn) old.close();
      attach(conn, seat.id, seat.token);
      return app.state ? (app.dealt ? pushViews() : conn.send({ t: "shuffle" })) : broadcastLobby();
    }
    if (app.state) return conn.send({ t: "err", msg: "That game already started." });
    if (app.lobby.length >= 16) return conn.send({ t: "err", msg: "The room is full. Sixteen is the limit." });
    const id = uniqueId(cleanId(String(msg.name || "")), app.lobby);
    const token = randHex();
    app.tokens.set(id, token);
    app.lobby.push(id);
    attach(conn, id, token);
    return broadcastLobby();
  }
  const id = seatOf(conn);
  if (!id || msg?.t !== "act" || !app.dealt) return;
  if (msg.a?.kind === "chat" || msg.a?.kind === "dm") {         // gentle rate limit for messages
    const now = Date.now();
    if (now - (app.lastMsg.get(id) || 0) < 600) return conn.send({ t: "err", msg: "Easy there. One message at a time." });
    app.lastMsg.set(id, now);
  }
  const r = playerAct(id, msg.a);
  if (!r.ok) conn.send({ t: "err", msg: ERR[r.error.code] || r.error.message });
}

function attach(conn, id, token) {
  app.conns.set(id, conn);
  conn.send({ t: "welcome", id, token, code: app.code });
  conn.on("close", () => {
    if (app.conns.get(id) !== conn) return;
    app.conns.delete(id);
    if (!app.state) { app.lobby = app.lobby.filter((p) => p !== id); app.tokens.delete(id); broadcastLobby(); }
  });
}

function broadcastLobby() {
  const msg = { t: "lobby", players: app.lobby, mode: app.settings.mode, code: app.code };
  for (const c of app.conns.values()) c.send(msg);
  renderLobby();
}

function playerAct(id, a) {
  const kind = a?.kind;
  const action =
    kind === "night" ? { type: "night", actor: id, target: a.target } :
    kind === "vote" ? { type: "vote", actor: id, target: a.target ?? null } :
    kind === "chat" ? { type: "chat", from: id, text: a.text } :
    kind === "dm" ? { type: "dm", from: id, to: a.to, text: a.text } : null;
  if (!action) return { ok: false, error: { code: "E_UNKNOWN", message: "bad action" } };
  return hostApply(action);
}

const phaseSeconds = () => { const m = MODE[app.state.setup.mode]; return app.state.phase === "night" ? m.night : m.day; };

// broadcast=false is used for Director moves: players receive nothing, so nothing hints at them.
function hostApply(action, broadcast = true) {
  const before = app.state.phase + app.state.day;
  const r = applyAction(app.state, action);
  if (!r.result.ok) return r.result;
  app.state = r.state;
  if (before !== app.state.phase + app.state.day) { app.deadline = Date.now() + phaseSeconds() * 1000; broadcast = true; }
  if (!app.gmHuman && app.state.phase !== "ended") {
    const done = app.state.phase === "night" ? nightPending(app.state).length === 0 : allVoted(app.state);
    if (done) app.deadline = Math.min(app.deadline, Date.now() + 4000);
  }
  if (broadcast) pushViews(); else { app.gm = gmView(app.state); renderGame(); }
  return r.result;
}

function startGame() {
  if (app.state) return;
  const seed = crypto.getRandomValues(new Uint32Array(1))[0] % 2147483647;
  app.state = createGame({
    mode: app.settings.mode, players: [...app.lobby], narrator: app.gmHuman ? "human" : "bot",
    rigged: app.gmHuman && app.settings.rigged, communityChat: app.settings.communityChat, seed,
  });
  app.mode = app.state.setup.mode;
  if (app.gmHuman) {                                            // the Grandmaster deals by hand
    for (const c of app.conns.values()) c.send({ t: "shuffle" });
    app.gm = gmView(app.state);
    renderGame();
  } else deal();
}

function deal() {
  app.dealt = true;
  app.deadline = Date.now() + phaseSeconds() * 1000;
  setInterval(() => {
    if (!app.gmHuman && app.state.phase !== "ended" && Date.now() >= app.deadline) hostApply({ type: "advance", by: "gm" });
  }, 500);
  pushViews();
}

function pushViews() {
  const st = app.state, ended = st.phase === "ended";
  const deadline = app.gmHuman ? 0 : app.deadline;              // a human Grandmaster keeps their own time
  for (const [id, c] of app.conns) {
    c.send({ t: "view", view: playerView(st, id), mode: st.setup.mode, deadline, players: st.setup.players });
    if (ended) c.send({ t: "final", roles: st.roles });
  }
  if (app.gmHuman) app.gm = gmView(st); else app.view = playerView(st, app.id);
  if (ended) app.finalRoles = st.roles;
  renderGame();
}

// ---------- guest ----------
function joinRoom(code) {
  app.code = code;
  const peer = app.peer || new Peer();
  app.peer = peer;
  const connect = () => {
    const conn = peer.connect(PREFIX + code, { reliable: true });
    app.hostConn = conn;
    conn.on("open", () => {
      app.retries = 0;
      const saved = JSON.parse(sessionStorage.getItem(seatKey(code)) || "null");
      conn.send({ t: "hello", name: app.name, seat: saved });
    });
    conn.on("data", guestReceive);
    conn.on("close", () => { if (app.hostConn === conn) retry(connect); });
  };
  peer.on("error", (e) => {
    if (e.type === "peer-unavailable" && (app.view || app.lobby.length)) return retry(connect);
    $("#homeMsg").textContent = e.type === "peer-unavailable" ? "No room with that code. Double-check it?" : "Connection trouble: " + e.type;
  });
  if (peer.open) connect(); else peer.on("open", connect);
}

function retry(connect) {
  if (++app.retries > 6) {
    $("#revealCard").innerHTML = `${ic("door", "huge")}<h2>The host has left</h2><p>This game can't continue without them.</p><button class="btn" onclick="location.href='play.html'">Back to town</button>`;
    $("#reveal").hidden = false;
    return;
  }
  toast("Lost the host. Reconnecting...");
  setTimeout(connect, 2500);
}

function guestReceive(msg) {
  if (msg.t === "welcome") { app.id = msg.id; sessionStorage.setItem(seatKey(msg.code), JSON.stringify({ id: msg.id, token: msg.token })); }
  else if (msg.t === "lobby") { app.lobby = msg.players; app.settings.mode = msg.mode; app.code = msg.code; renderLobby(); show("lobby"); }
  else if (msg.t === "shuffle") show("shuffle");
  else if (msg.t === "view") { app.view = msg.view; app.mode = msg.mode; app.deadline = msg.deadline; app.lobby = msg.players; renderGame(); }
  else if (msg.t === "final") { app.finalRoles = msg.roles; renderGame(); }
  else if (msg.t === "err") { toast(msg.msg); $("#homeMsg").textContent = msg.msg; }
}

function act(a) {
  if (app.host) { const r = playerAct(app.id, a); if (!r.ok) toast(ERR[r.error.code] || r.error.message); }
  else app.hostConn?.send({ t: "act", a });
}

// ---------- lobby ----------
function renderLobby() {
  $("#roomCode").textContent = app.code;
  $("#roster").innerHTML = app.lobby.map((p) => `<li>${bean(p, null, false, 72)}<span>${esc(p)}${p === app.id ? " (you)" : ""}</span></li>`).join("")
    || `<li class="note">Nobody yet. Send the code.</li>`;
  $("#countLabel").textContent = `${app.lobby.length} of 16`;
  $("#hostSettings").hidden = !app.host;
  $("#guestWait").hidden = app.host;
  $("#guestMode").innerHTML = `${ic(MODE[app.settings.mode].icon)} ${MODE[app.settings.mode].name}`;
  $("#rigRow").hidden = !(app.host && app.gmHuman);
  $("#startBtn").disabled = app.lobby.length < 4;
  $("#startHint").textContent = app.lobby.length < 4 ? `Need at least 4 players. ${app.lobby.length} so far.` : "Everyone in? Let the night begin.";
  $("#modePicker").innerHTML = Object.entries(MODE).map(([k, m]) =>
    `<button class="mode ${k === app.settings.mode ? "on" : ""}" data-mode="${k}">${ic(m.icon)}<b>${m.name}</b><span>${m.desc}</span></button>`).join("");
}

// ---------- game ----------
function tale(ev, i) {
  const t = TALES[app.mode] || TALES.classic, list = t[ev.type === "death" ? ev.cause : ev.type];
  return list[hash(`${i}:${ev.player || ""}`) % list.length].replaceAll("{p}", `<b>${esc(ev.player)}</b>`).replaceAll("{r}", roleName(ev.role));
}

function renderStory(log, winner) {
  const lines = [{ cls: "chapter", html: "Night 1 falls over Puddleton" }];
  log.forEach((ev, i) => {
    lines.push({ cls: "", html: tale(ev, i) });
    const nightEv = ev.type === "quiet" || ev.cause === "night";
    if (i === log.length - 1 && winner) return;
    if (nightEv && log[i + 1]?.cause !== "night") lines.push({ cls: "chapter", html: `Day ${ev.day} dawns` });
    if (!nightEv) lines.push({ cls: "chapter", html: `Night ${ev.day + 1} falls` });
  });
  if (winner) lines.push({ cls: "chapter", html: WIN[winner] });
  const lastTale = [...lines].reverse().find((l) => !l.cls) || lines[0];
  $("#storyNow").innerHTML = winner ? WIN[winner] : log.length ? lastTale.html : "The town locks its doors. Somewhere, a fedora is being dusted off.";
  $("#feed").innerHTML = lines.slice().reverse().map((l) => `<li class="${l.cls}">${l.html}</li>`).join("");
}

function renderTimer() {
  const base = app.gm || app.view;
  const left = Math.max(0, Math.ceil((app.deadline - Date.now()) / 1000));
  const t = $("#timer");
  if (!base || base.phase === "ended") { t.textContent = ""; return; }
  if (!app.deadline) { t.innerHTML = app.gm ? "" : `${ic("eye")} Grandmaster's call`; t.classList.remove("urgent"); return; }
  t.innerHTML = `${ic("clock")} ${Math.floor(left / 60)}:${String(left % 60).padStart(2, "0")}`;
  t.classList.toggle("urgent", left <= 10);
}

function renderGame() {
  const v = app.view, g = app.gm, base = v || g;
  if (!base) return;
  show("game");
  const { phase, day } = base;
  if (phase + day !== app.lastPhaseKey) { app.target = undefined; app.lastPhaseKey = phase + day; }
  world.setDay(phase === "day" ? 1 : 0);
  $("#phaseLabel").textContent = phase === "ended" ? "The end" : phase === "night" ? `Night ${day}` : `Day ${day}`;
  $("#modeBadge").textContent = MODE[app.mode].name;
  $("#dealBtn").hidden = !(g && !app.dealt);
  $("#advanceBtn").hidden = !(g && app.dealt && phase !== "ended");
  $("#advanceBtn").innerHTML = phase === "night" ? `${ic("sun")}Bring the dawn` : `${ic("moon")}End the day`;
  renderTimer();

  const roster = g ? app.state.setup.players.map((id) => ({ id, alive: g.alive[id], role: g.roles[id] })) : v.players;
  const me = v ? v.role : null;
  const canNight = v && v.alive && phase === "night" && ROLE[me].act;
  const canVote = v && v.alive && phase === "day";
  $("#players").innerHTML = roster.map((p) => {
    const shown = p.role || app.finalRoles?.[p.id];
    const clickable = p.alive && (canVote || (canNight && (p.id !== v.you || me === "angel"))) ? "clickable" : "";
    return `<li><button class="pcard ${p.alive ? "" : "dead"} ${app.target === p.id ? "picked" : ""} ${clickable}" data-pid="${esc(p.id)}">
      ${bean(p.id, shown, !p.alive, 72)}<span class="pname">${esc(p.id)}${v && p.id === v.you ? " (you)" : ""}</span>
      <span class="prole">${shown ? `${ic(ROLE[shown].icon)}${roleName(shown)}` : ""}</span></button></li>`;
  }).join("");

  if (v) {
    const r = ROLE[me];
    const mates = MAFIA_TEAM.includes(me) ? v.players.filter((p) => p.id !== v.you && MAFIA_TEAM.includes(p.role)).map((p) => p.id) : [];
    const inv = v.investigations.map((x) => `<li>Night ${x.day}: <b>${esc(x.target)}</b> is <span class="${x.result === "mafia" ? "bad" : "good"}">${x.result}</span></li>`).join("");
    $("#roleCard").innerHTML = `<div class="who">${bean(v.you, me, !v.alive, 120)}<span class="eyebrow">You are the</span><h3>${ic(r.icon)}${r.name}</h3></div><p>${r.blurb}</p>
      ${mates.length ? `<p class="team">Your crew: ${mates.map(esc).join(", ")}</p>` : ""}${inv ? `<ul class="inv">${inv}</ul>` : ""}
      ${v.alive ? "" : `<p class="ghosty">You're out. Enjoy the show.</p>`}`;
    $("#actionPrompt").innerHTML = phase === "ended" || !v.alive ? "" :
      canNight ? `${r.act}${app.target ? `: <b>${esc(app.target)}</b>` : ""}` :
      phase === "night" ? "You're asleep. Whisper, plot, or just listen to the rain." :
      `Tap a player to vote${app.target !== undefined ? `. Your vote: <b>${app.target ? esc(app.target) : "abstain"}</b>` : ""}<button class="link" id="abstainBtn">Abstain</button>`;
  } else {
    $("#roleCard").innerHTML = `<div class="who">${ic("eye", "huge")}<span class="eyebrow">You are the</span><h3>Grandmaster</h3></div><p>You see every role and every whisper. Tell the story, then move the night along when you are ready.</p>`;
    $("#actionPrompt").textContent = !app.dealt ? "Look over the cast, then deal the cards." : phase === "night" ? `Still deciding: ${nightPending(app.state).join(", ") || "everyone is done"}` : phase === "day" ? `Votes in: ${Object.keys(app.state.votes).length} of ${roster.filter((p) => p.alive).length}` : "";
  }

  renderStory(base.log, base.winner);
  renderTalk(v, g, phase);
  renderDirector(g);
  renderReveal(v, base);
}

function renderTalk(v, g, phase) {
  const chatOn = v ? v.communityChat : app.state.setup.communityChat;
  $("#squareTab").hidden = !chatOn;
  if (!chatOn && $("#squareTab").classList.contains("active")) switchTab("dms");
  const chat = (v || g).chat;
  $("#chatList").innerHTML = chat.map((m) => `<li><b>${esc(m.from)}</b>${esc(m.text)}</li>`).join("") || `<li class="empty">The square is quiet.</li>`;
  $("#chatList").scrollTop = 1e9;
  $("#chatForm").hidden = !v;
  $("#chatInput").disabled = !(v && v.alive && phase === "day");
  $("#chatNote").textContent = !v ? "" : !v.alive ? "Ghosts can't talk." : phase === "night" ? "The square closes at night. Whispers still work." : "";

  const dms = (v || g).dms, others = players().filter((p) => p !== app.id), sel = $("#dmTo");
  const opts = g ? ["", ...others] : others;
  if (sel.options.length !== opts.length) {
    sel.innerHTML = opts.map((p) => `<option value="${esc(p)}">${p ? "To " + esc(p) : "All whispers"}</option>`).join("");
    if (opts.includes(app.dmWith)) sel.value = app.dmWith;
  }
  app.dmWith = sel.value;
  const thread = dms.filter((d) => (g && !app.dmWith) || d.from === app.dmWith || d.to === app.dmWith);
  $("#dmList").innerHTML = thread.map((d) => `<li class="${d.from === app.id ? "mine" : ""}"><b>${esc(d.from)} to ${esc(d.to)}</b>${esc(d.text)}</li>`).join("") || `<li class="empty">No whispers yet.</li>`;
  $("#dmList").scrollTop = 1e9;
  $("#dmForm").hidden = !v || !v.alive || v.phase === "ended";
  const incoming = dms.filter((d) => d.to === app.id).length;
  if ($('.tab[data-tab="dms"]').classList.contains("active")) app.seenDms = incoming;
  $("#dmBadge").textContent = incoming > app.seenDms ? "1" : "";
}

function renderDirector(g) {
  const on = !!(g && app.state.setup.rigged);
  $("#directorTab").hidden = !on;
  if (!on) return;
  const st = app.state, alive = st.setup.players.filter((p) => st.alive[p]);
  const angelAlive = alive.some((p) => st.roles[p] === "angel");
  const opt = (list, none) => (none ? `<option value="">Nobody</option>` : "") + list.map((p) => `<option>${esc(p)}</option>`).join("");
  const inGame = [...new Set(Object.values(st.roles))];
  let html = `<p class="note">Players never receive anything when you use these. Outcomes look natural.</p>`;
  if (!app.dealt) {
    html += `<div class="dir"><b>${ic("sparkle")}Recast before you deal</b><div class="row"><select id="dWho">${opt(st.setup.players)}</select><select id="dRole">${inGame.map((r) => `<option value="${r}">${roleName(r)}</option>`).join("")}</select><button data-rig="setRole">Swap</button></div><span class="hint">Swaps roles with whoever holds that role now.</span></div>`;
  } else if (st.phase === "night") {
    html += `<div class="dir"><b>${ic("skull")}Choose tonight's victim</b><div class="row"><select id="dKill">${opt(alive)}</select><button data-rig="forceKill">Seal it</button></div><span class="hint">Replaces the Mafia's pick, and the Angel can't save them.</span></div>
      <div class="dir"><b>${ic("shield")}Make someone untouchable</b><div class="row"><select id="dProt">${opt(alive)}</select><button data-rig="protect">Shield</button></div>${angelAlive ? "" : `<span class="hint">The Angel is dead. A quiet night may raise eyebrows.</span>`}</div>
      <div class="dir"><b>${ic("glass")}Bend the Detective's result</b><div class="row"><button data-rig="fakeMafia">Say mafia</button><button data-rig="fakeInnocent">Say innocent</button></div><span class="hint">If that player dies later, their true role is revealed.</span></div>`;
  } else if (st.phase === "day") {
    html += `<div class="dir"><b>${ic("gavel")}Decide today's verdict</b><div class="row"><select id="dLynch">${opt(alive, true)}</select><button data-rig="forceLynch">Seal it</button></div></div>`;
  }
  const key = st.phase + st.day + app.dealt + alive.length, pane = $("#pane-director");
  if (pane.dataset.key !== key) { pane.innerHTML = html; pane.dataset.key = key; }
}

function rigClick(kind) {
  const val = (id) => $(id).value;
  const a = { type: "rig", by: "gm" };
  if (kind === "forceKill") Object.assign(a, { op: "forceKill", target: val("#dKill") });
  if (kind === "protect") Object.assign(a, { op: "protect", target: val("#dProt") });
  if (kind === "fakeMafia") Object.assign(a, { op: "fakeResult", result: "mafia" });
  if (kind === "fakeInnocent") Object.assign(a, { op: "fakeResult", result: "innocent" });
  if (kind === "setRole") Object.assign(a, { op: "setRole", player: val("#dWho"), role: val("#dRole") });
  if (kind === "forceLynch") Object.assign(a, { op: "forceLynch", target: val("#dLynch") || null });
  const r = hostApply(a, false);
  toast(r.ok ? "Done. Nobody suspects a thing." : ERR[r.error.code] || r.error.message);
  $("#pane-director").dataset.key = "";
  renderGame();
}

function renderReveal(v, base) {
  const box = $("#reveal");
  if (v && !app.revealed) {
    app.revealed = true;
    const r = ROLE[v.role];
    $("#revealCard").innerHTML = `<p class="eyebrow">Your secret identity</p>${bean(v.you, v.role, false, 200, "char")}<h2>${ic(r.icon)}${r.name}</h2><p>${r.blurb}</p><button class="btn" data-dismiss>Got it</button>`;
    box.hidden = false;
  } else if (base.winner && app.finalRoles && !box.dataset.final) {
    box.dataset.final = "1";
    const all = Object.entries(app.finalRoles).map(([p, r]) => `<div>${bean(p, r, false, 64)}<span>${esc(p)}</span><small>${roleName(r)}</small></div>`).join("");
    $("#revealCard").innerHTML = `<p class="eyebrow">The end</p><h2>${WIN[base.winner]}</h2><div class="endcast">${all}</div><button class="btn" onclick="location.href='play.html'">${ic("sparkle")}Play again</button>`;
    box.hidden = false;
  }
}

function switchTab(name) {
  $$(".tab").forEach((t) => t.classList.toggle("active", t.dataset.tab === name));
  $$(".pane").forEach((p) => p.classList.toggle("active", p.id === "pane-" + name));
  if (name === "dms") renderGame();
}

// ---------- manual: story walkthrough on first launch, full book in Help ----------
function openWalkthrough() {
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
    if (+step > 0 && i === pages.length - 1) { dlg.close(); localStorage.setItem("pad-manual-seen", "1"); return; }
    i = Math.max(0, i + +step); draw();
  };
  draw(); dlg.showModal();
}

// ---------- wiring ----------
function needName() {
  const n = $("#nameInput").value.trim();
  if (!n) { $("#homeMsg").textContent = "Pick a name first."; return false; }
  app.name = n; app.id = uniqueId(cleanId(n), []); localStorage.setItem("pad-name", n);
  return true;
}

document.addEventListener("click", (e) => {
  const t = e.target.closest("button");
  if (!t) return;
  if (t.id === "createBtn" && needName()) show("choose");
  else if (t.dataset.narrator) hostRoom(t.dataset.narrator);
  else if (t.id === "joinBtn" && needName()) {
    const code = $("#codeInput").value.trim().toUpperCase();
    if (code.length !== 6) $("#homeMsg").textContent = "Room codes have 6 characters.";
    else { $("#homeMsg").textContent = "Knocking on the door..."; joinRoom(code); }
  } else if (t.dataset.mode) { app.settings.mode = t.dataset.mode; broadcastLobby(); }
  else if (t.id === "startBtn") startGame();
  else if (t.id === "dealBtn" && !app.dealt) deal();
  else if (t.id === "copyBtn") { navigator.clipboard?.writeText(`${location.origin}${location.pathname}#${app.code}`); toast("Invite link copied"); }
  else if (t.dataset.pid && t.classList.contains("clickable")) {
    app.target = t.dataset.pid;
    act(app.view.phase === "night" ? { kind: "night", target: t.dataset.pid } : { kind: "vote", target: t.dataset.pid });
    renderGame();
  } else if (t.id === "abstainBtn") { app.target = null; act({ kind: "vote", target: null }); renderGame(); }
  else if (t.id === "advanceBtn") hostApply({ type: "advance", by: "gm" });
  else if (t.dataset.tab) switchTab(t.dataset.tab);
  else if (t.dataset.rig) rigClick(t.dataset.rig);
  else if (t.hasAttribute("data-dismiss")) $("#reveal").hidden = true;
  else if (t.hasAttribute("data-open-help")) $("#help").hidden = false;
  else if (t.hasAttribute("data-close-help")) $("#help").hidden = true;
});
$("#chatToggle").onchange = (e) => { app.settings.communityChat = e.target.checked; };
$("#rigToggle").onchange = (e) => { app.settings.rigged = e.target.checked; };
$("#dmTo").onchange = () => { app.dmWith = $("#dmTo").value; renderGame(); };
$("#chatForm").onsubmit = (e) => { e.preventDefault(); const text = $("#chatInput").value.trim(); if (text) act({ kind: "chat", text }); $("#chatInput").value = ""; };
$("#dmForm").onsubmit = (e) => { e.preventDefault(); const text = $("#dmInput").value.trim(); if (text && app.dmWith) act({ kind: "dm", to: app.dmWith, text }); $("#dmInput").value = ""; };

$("#nameInput").value = localStorage.getItem("pad-name") || "";
$("#codeInput").value = location.hash.slice(1, 7).toUpperCase();
$("#heroBeans").innerHTML = ["mafia", "angel", "detective", "jester", "godfather"].map((r, i) => `<img class="bean" alt="" width="88" height="88" src="${portrait(r, BEAN_COLORS[i])}">`).join("");
$$("[data-role]").forEach((el, i) => el.insertAdjacentHTML("afterbegin", `<img class="bean" alt="" width="44" height="44" src="${portrait(el.dataset.role, BEAN_COLORS[i % 8])}">`));
setInterval(renderTimer, 500);
initSound($("#soundBtn"));
if (!localStorage.getItem("pad-manual-seen")) openWalkthrough();
if ("wakeLock" in navigator) document.addEventListener("click", () => navigator.wakeLock.request("screen").catch(() => {}), { once: true });
if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js");
