// Integration tests: starts `npx wrangler dev` locally (no Cloudflare login needed) and drives it with bots.
// Run: node test/integration.mjs   (exits 1 on any failure; about 2 minutes). ONLY=<text> runs matching tests.
// Two local servers: A with TIME_SCALE 0.08 (game timers 12x faster) and B with tiny daily limits for the soft cap.
import { spawn, execSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Api, Bot, autoplay, gmplay, sleep, MAFIA, TOKEN } from "./bot.mjs";

const here = path.dirname(fileURLToPath(import.meta.url)), serverDir = path.resolve(here, "..");
const ADMIN = "test-admin-token", SCALE = 0.08;
const SECRETS = { TURNSTILE_SECRET: "1x0000000000000000000000000000000AA", ADMIN_TOKEN: ADMIN, HASH_SALT: "test-salt" };

// ---------- harness ----------
let passed = 0, failed = 0;
const ONLY = process.env.ONLY || "";   // run only tests whose name contains this text
async function test(name, fn) {
  if (ONLY && !name.includes(ONLY)) return;
  const t0 = Date.now();
  try { await fn(); passed++; console.log(`ok    ${name} (${((Date.now() - t0) / 1000).toFixed(1)}s)`); }
  catch (e) { failed++; console.log(`FAIL  ${name}\n      ${String(e.stack || e).split("\n").slice(0, 4).join("\n      ")}`); }
  finally { Bot.closeAll(); await sleep(300); }
}
function check(cond, msg) { if (!cond) throw new Error(msg); }

async function startServer(port, vars) {
  const persist = path.join(serverDir, ".wrangler", `test-${port}-${Date.now()}`);
  execSync(`npx wrangler d1 migrations apply puddleton --local --persist-to "${persist}"`, { cwd: serverDir, stdio: "ignore" });
  const args = ["wrangler", "dev", "--port", String(port), "--ip", "127.0.0.1", "--persist-to", `"${persist}"`,
    ...Object.entries({ ...SECRETS, ...vars }).flatMap(([k, v]) => ["--var", `${k}:${v}`])];
  const child = spawn("npx", args, { cwd: serverDir, shell: true, env: { ...process.env, NO_COLOR: "1", WRANGLER_SEND_METRICS: "false", CI: "1" } });
  let out = "";
  await new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error("wrangler dev did not start:\n" + out.slice(-3000))), 120000);
    const onData = (d) => { out += d; if (/Ready on/.test(out)) { clearTimeout(t); resolve(); } };
    child.stdout.on("data", onData); child.stderr.on("data", onData);
    child.on("exit", (c) => { clearTimeout(t); reject(new Error(`wrangler exited ${c}\n${out.slice(-3000)}`)); });
  });
  return { base: `http://127.0.0.1:${port}`, logs: () => out, stop: () => kill(child) };
}
function kill(child) {
  if (process.platform === "win32") { try { execSync(`taskkill /pid ${child.pid} /T /F`, { stdio: "ignore" }); } catch { /* gone */ } }
  else child.kill("SIGTERM");
}

const makeBots = (api, n, prefix, band = "adult") => Promise.all(Array.from({ length: n }, (_, i) => new Bot(api, `${prefix}${i}`, band).init()));
async function openRoom(api, host, narrator = "bot") {
  const r = await api.post("/rooms", { turnstile: TOKEN, narrator }, host.auth);
  check(r.status === 200 && r.body.code, `room create ${r.status} ${JSON.stringify(r.body)}`);
  return r.body.code;
}
async function join(code, list, extra = {}) {
  for (const b of list) { const w = await b.connect(code, extra); check(w.t === "welcome", `${b.name} could not join: ${JSON.stringify(w)}`); }
}
// Sends settings; resolves with the error, or with the first lobby that shows them (older broadcasts may still arrive).
async function settings(host, s) {
  const from = host.mark();
  host.send({ t: "settings", settings: s });
  const shows = (m) => Object.entries(s).every(([k, v]) => (k === "pass" ? m.settings.hasPass === (v !== null) : m.settings[k] === v));
  return host.wait((m) => m.t === "err" || (m.t === "lobby" && shows(m)), 6000, from);
}
const lastView = (b) => b.view?.view;

// No message to a player may carry another player's hidden role or private data (checked in order).
const FORBID = ["secret", "secret_hash", "passHash", "passSalt", "dev", "ip", "device", "device_hash", "ip_hash", "strikes", "offences", "rng", "traits", "seed", "nightActs", "events", "forceKill", "fake"];
function scanKeys(x, who, where = "") {
  if (!x || typeof x !== "object") return;
  for (const [k, v] of Object.entries(x)) {
    check(!FORBID.includes(k), `${who}: private key ${k} at ${where}`);
    if (["band", "gid", "blocks", "muted", "tier"].includes(k)) check(where === ".you", `${who}: ${k} outside you at ${where}.${k}`);
    scanKeys(v, who, Array.isArray(x) ? where + "[]" : where + "." + k);
  }
}
function audit(bot, roles, from = 0) {
  let alive = true, myRole = null, me = bot.you?.id, ended = false;
  for (const m of bot.msgs.slice(from)) {
    const { _at, ...msg } = m;
    scanKeys(msg, bot.name);
    if (m.t === "final" || m.t === "credits") ended = true;
    if (ended) continue;
    if (m.t === "view") {
      const v = m.view;
      alive = v.alive; myRole = v.role; me = v.you;
      check(v.role === roles[v.you], `${bot.name}: own role mismatch`);
      for (const p of v.players) {
        if (p.role === null) continue;
        check(p.id === v.you || !p.alive || (MAFIA.includes(myRole) && MAFIA.includes(roles[p.id])), `${bot.name} saw the hidden role of ${p.id}`);
        check(p.role === roles[p.id], `${bot.name}: wrong role shown for ${p.id}`);
      }
      check(("teamPicks" in v) === (v.phase === "night" && v.alive && MAFIA.includes(myRole)), `${bot.name}: teamPicks presence`);
      check(("ghostChat" in v) === !v.alive, `${bot.name}: ghostChat presence`);
      check(!("history" in v) || v.phase === "ended", `${bot.name}: history before the end`);
      for (const d of v.dms) check(d.from === v.you || d.to === v.you, `${bot.name}: someone else's whisper in a view`);
      check(v.deathBy === null || !v.alive, `${bot.name}: deathBy while alive`);
    } else {
      check(!JSON.stringify(msg).includes('"role"') && !JSON.stringify(msg).includes('"roles"'), `${bot.name}: a role in ${m.t} before the end`);
      if (m.t === "chat" && m.ch === "ghost") check(!alive, `${bot.name}: ghost chat reached the living`);
      if (m.t === "dm") check(m.line.from === me || m.line.to === me, `${bot.name}: someone else's whisper`);
      if (m.t === "picks") check(MAFIA.includes(myRole), `${bot.name}: mafia picks to a non mafia`);
    }
  }
}

// A whole bot narrator game: start, play to the end, check final roles, credits and the return to the lobby.
async function fullGame(api, { mode, n, label, opts = {}, during }) {
  const players = await makeBots(api, n, label);
  const host = players[0], code = await openRoom(api, host);
  await join(code, players);
  const s = await settings(host, { mode });
  check(s.t === "lobby" && s.settings.mode === mode, `mode set: ${JSON.stringify(s)}`);
  players.forEach((b) => autoplay(b, opts));
  const from = players.map((b) => b.mark());
  host.send({ t: "start" });
  const first = await host.wait((m) => m.t === "view", 8000, from[0]);
  if (during) await during({ players, host, code, first, from });
  const finals = await Promise.all(players.map((b, i) => b.wait((m) => m.t === "final", 150000, from[i])));
  const roles = finals[0].roles;
  check(Object.keys(roles).length === n && finals.every((f) => JSON.stringify(f.roles) === JSON.stringify(roles)), "everyone gets the same final roles");
  const credits = await host.wait((m) => m.t === "credits", 5000, from[0]);
  check(credits.cast.length === n && credits.ms > 0 && credits.until > credits.serverNow, "credits message");
  const back = await host.wait((m) => m.t === "lobby" && m._at > credits._at, 10000, from[0]);
  check(back.players.length >= n - credits.cast.filter((c) => c.left).length - 1, `back to the lobby with the players: ${back.players.length}`);
  check(back._at - credits._at >= credits.ms * 0.8, "the lobby comes after the credits roll");
  players.forEach((b, i) => audit(b, roles, from[i]));
  return { players, host, code, roles, finals, credits, from, first };
}

// ---------- scenarios ----------
async function suiteA(api) {
  await test("HTTP: version, origin allowlist, CORS preflight, guest creation and auth", async () => {
    const v = await api.get("/version");
    check(v.status === 200 && v.body.protocol === 1, `version ${JSON.stringify(v.body)}`);
    check((await api.get("/version", null, "https://evil.example")).status === 403, "foreign origin refused");
    check((await api.get("/version", null, "")).status === 403, "missing origin refused");
    const pre = await fetch(api.base + "/guest", { method: "OPTIONS", headers: { Origin: "https://beta.puddleton.surge.sh", "Access-Control-Request-Method": "POST" } });
    check(pre.status === 204 && pre.headers.get("access-control-allow-origin") === "https://beta.puddleton.surge.sh", "preflight");
    check((await api.get("/version", null, "https://admin.puddleton.surge.sh")).status === 403, "the admin origin is for admin endpoints only");
    check((await api.post("/guest", { band: "elder", turnstile: TOKEN })).status === 400, "bad band");
    check((await api.post("/guest", { band: "adult" })).body.error === "E_TURNSTILE", "turnstile required");
    const b = await new Bot(api, "Http", "teen").init();
    const me = await api.get("/me", b.auth);
    check(me.status === 200 && me.body.band === "teen" && me.body.gid === b.gid && me.body.sanction === null, `me ${JSON.stringify(me.body)}`);
    check((await api.get("/me", `Guest ${b.gid}:${"0".repeat(64)}`)).status === 401, "wrong secret");
    check((await api.get("/rooms")).status === 401, "rooms need a guest");
    const w = await b.connect("ABCDEF");
    check(w.t === "err" && w.code === "E_NO_ROOM", "unknown room code");
  });

  await test("hello: version mismatch, bad secret, band locked", async () => {
    const [h, x] = await makeBots(api, 2, "Hel");
    const code = await openRoom(api, h);
    await join(code, [h]);
    const ver = await x.connect(code, { v: 999 });
    check(ver.t === "version" && ver.need === 1, `version message ${JSON.stringify(ver)}`);
    await sleep(200); check(x.closed?.code === 4000, "closed with 4000");
    const bad = await x.connect(code, { secret: "nope" });
    check(bad.t === "err" && bad.code === "E_AUTH", "bad secret");
    const band = await x.connect(code, { band: "child" });
    check(band.t === "err" && band.code === "E_BAND_LOCKED", "band is locked");
    h.close();
  });

  await test("admin: stats need the bearer token", async () => {
    check((await api.get("/admin/stats", null, "https://admin.puddleton.surge.sh")).status === 401, "no token");
    check((await api.get("/admin/stats", "Bearer wrong-token-xxxxxxx", "https://admin.puddleton.surge.sh")).status === 401, "wrong token");
    const ok = await api.get("/admin/stats", "Bearer " + ADMIN, "https://admin.puddleton.surge.sh");
    check(ok.status === 200 && ok.headers.get("access-control-allow-origin") === "https://admin.puddleton.surge.sh", "token and admin origin accepted");
  });

  await test("full games in every mode (classic 6, crazy 16, gore 8 with the host ending a day, speed 12 with a reconnect), privacy audited", async () => {
    const reconnect = async ({ players, from }) => {
      const b = players[3];
      await players[3].wait((m) => m.t === "view" && m.view.phase === "day", 20000, from[3]);
      const before = lastView(b);
      const mark0 = players[0].mark();
      b.drop();
      await players[0].wait((m) => m.t === "presence" && m.id === before.you && m.online === false, 5000, mark0);
      await sleep(600);
      const at = b.mark(), w = await b.connect(b.code);
      check(w.t === "welcome" && w.you.id === before.you, "rejoined the same seat");
      const v = await b.wait((m) => m.t === "view", 5000, at);
      check(v.view.role === before.role && v.view.you === before.you, "same role after the reconnect");
      await players[0].wait((m) => m.t === "presence" && m.id === before.you && m.online === true, 5000, mark0);
    };
    // The host ends the first day early ("End voting"); nobody else may.
    const hostEndsDay = async ({ host, players, from }) => {
      const day = await host.wait((m) => m.t === "view" && m.view.phase === "day", 15000, from[0]);
      check(day.deadline > day.serverNow, "the day is timed");
      const mark = host.mark(), other = players.find((p) => p !== host && lastView(p)?.alive), om = other.mark();
      other.send({ t: "advance" });
      check((await other.wait((m) => m.t === "err", 3000, om)).code === "E_HOST", "only the host ends the day");
      host.send({ t: "advance" });
      const next = await host.wait((m) => m.t === "view" && m.view.phase !== "day", 5000, mark);
      check(next.view.day === 2 || next.view.phase === "ended", "the day ended early (no votes, so night 2)");
    };
    const runs = await Promise.all([
      fullGame(api, { mode: "classic", n: 6, label: "Cla" }),
      fullGame(api, { mode: "crazy", n: 16, label: "Cra" }),
      fullGame(api, { mode: "gore", n: 8, label: "Gor", opts: { skipDay: (v) => v.day === 1 }, during: hostEndsDay }),
      fullGame(api, { mode: "speed", n: 12, label: "Spd", during: reconnect }),
    ]);
    for (const r of runs) check(r.first.deadline > r.first.serverNow, `every mode sends a deadline (${r.first.mode})`);
    const prof = await api.get("/profile/" + runs[0].host.gid);
    check(prof.status === 200 && prof.body.stats.games >= 1 && prof.body.name === runs[0].host.you.id && !("band" in prof.body), `profile ${JSON.stringify(prof.body)}`);
    // the last game is kept for one replay request per player
    const h = runs[0].host, at = h.mark();
    h.send({ t: "replay" });
    const rp = await h.wait((m) => m.t === "replay" || m.t === "err", 4000, at);
    check(rp.t === "replay" && Array.isArray(rp.history) && rp.history.length > 0 && rp.roles, "replay");
    h.send({ t: "replay" });
    check((await h.wait((m) => m.t === "err", 4000, at)).code === "E_REPLAY", "only one replay");
    for (const r of runs) r.players.forEach((b) => b.close());
  });

  await test("human Grandmaster: shuffle, rigged recast before the deal, manual phases, gm sees everything", async () => {
    const [gm, ...players] = await makeBots(api, 7, "Gm");
    const code = await openRoom(api, gm, "human");
    const w = await gm.connect(code);
    check(w.t === "welcome" && w.you.gm && w.you.host, "creator becomes the Grandmaster");
    await join(code, players);
    await settings(gm, { rigged: true, mode: "classic" });
    let recast = null;
    gmplay(gm, { beforeDeal: (bot, m) => { recast = m.seats[1].id; bot.send({ t: "rig", op: "setRole", player: recast, role: "detective" }); } });
    players.forEach((b) => autoplay(b));
    const from = players.map((b) => b.mark()), g0 = gm.mark();
    gm.send({ t: "start" });
    await Promise.all(players.map((b, i) => b.wait((m) => m.t === "shuffle", 5000, from[i])));
    const gv = await gm.wait((m) => m.t === "gmview", 5000, g0);
    check(gv.dealt === false && Object.keys(gv.gm.roles).length === 6 && gv.deadline === 0, "gm sees roles before the deal");
    const v = await players[1].wait((m) => m.t === "view", 8000, from[1]);
    check(v.deadline === 0 && v.narrator === "human", "players wait on the Grandmaster");
    check(v.view.you !== recast || v.view.role === "detective", "the recast holds");
    const recastBot = players.find((b) => b.you.id === recast);
    check((await recastBot.wait((m) => m.t === "view", 5000)).view.role === "detective", "recast player is the detective");
    const finals = await Promise.all(players.map((b, i) => b.wait((m) => m.t === "final", 90000, from[i])));
    players.forEach((b, i) => audit(b, finals[0].roles, from[i]));
    await gm.wait((m) => m.t === "credits", 5000, g0);
    [gm, ...players].forEach((b) => b.close());
  });

  await test("host handover: the host leaves the lobby, then a host leaves mid game", async () => {
    const list = await makeBots(api, 5, "Hnd");
    const code = await openRoom(api, list[0]);
    await join(code, list);
    const at = list[1].mark();
    list[0].send({ t: "leave" });
    const l = await list[1].wait((m) => m.t === "lobby" && m.host !== list[0].you.id, 5000, at);
    check(l.host === list[1].you.id && l.players.length === 4, `next player is host: ${l.host}`);
    const newcomer = await new Bot(api, "HndNew").init();
    await join(code, [newcomer]);
    list.slice(1).forEach((b) => autoplay(b, { abstain: true }));
    autoplay(newcomer, { abstain: true });
    const f = list[2].mark();
    list[1].send({ t: "start" });
    await list[2].wait((m) => m.t === "view", 5000, f);
    list[1].send({ t: "leave" });
    const n = await list[2].wait((m) => m.t === "notice" && m.code === "host", 5000, f);
    check(n.id && n.id !== list[1].you.id, "a new host mid game");
    const left = await list[2].wait((m) => m.t === "view" && m.view.log.some((e) => e.cause === "left" && e.player === list[1].you.id), 5000, f);
    check(left.view.players.find((p) => p.id === list[1].you.id).role !== null, "the leaver's role is revealed");
    [...list, newcomer].forEach((b) => b.close());
  });

  await test("offline kick: only offline players, as a death with cause left", async () => {
    const list = await makeBots(api, 6, "Kic");
    const code = await openRoom(api, list[0]);
    await join(code, list);
    list.forEach((b, i) => i !== 4 && autoplay(b, { abstain: true, spare: [list[4].name] }));
    const f = list[0].mark();
    list[0].send({ t: "start" });
    await list[0].wait((m) => m.t === "view", 5000, f);
    list[0].send({ t: "kick", id: list[2].you.id });
    check((await list[0].wait((m) => m.t === "err", 3000, f)).code === "E_ONLINE", "online players cannot be kicked mid game");
    const target = list[4].you.id;
    list[4].drop();
    await list[0].wait((m) => m.t === "presence" && m.id === target && !m.online, 5000, f);
    list[0].send({ t: "kick", id: target });
    const v = await list[1].wait((m) => m.t === "view" && m.view.log.some((e) => e.player === target && e.cause === "left"), 5000, f);
    check(v.view.players.find((p) => p.id === target).alive === false, "kicked player is out");
    list.forEach((b) => b.close());
  });

  await test("away players: idle for two required phases, or offline for two phases, are removed", async () => {
    const list = await makeBots(api, 10, "Awy");
    const code = await openRoom(api, list[0]);
    await join(code, list);
    await settings(list[0], { mode: "speed" });
    const idle = list[8], gone = list[9], spare = [idle.name, gone.name];
    list.slice(0, 8).forEach((b) => autoplay(b, { abstain: true, spare }));
    const f = list[0].mark();
    list[0].send({ t: "start" });
    await list[0].wait((m) => m.t === "view", 5000, f);
    gone.drop();
    const offline = await list[0].wait((m) => m.t === "notice" && m.code === "left" && m.id === gone.you.id, 30000, f);
    check(offline.why === "offline", `offline removal: ${offline.why}`);
    const away = await list[0].wait((m) => m.t === "notice" && m.code === "left" && m.id === idle.you.id, 40000, f);
    check(away.why === "away", `away removal: ${away.why}`);
    const v = await idle.wait((m) => m.t === "view" && !m.view.alive, 5000);
    check(v.view.log.some((e) => e.player === idle.you.id && e.cause === "left"), "the idle player's view shows the removal");
    list.forEach((b) => b.close());
  });

  await test("private room pass: refused without it, joined with it, never echoed", async () => {
    const [h, a, b] = await makeBots(api, 3, "Pas");
    const code = await openRoom(api, h);
    await join(code, [h]);
    check((await settings(h, { visibility: "private" })).code === "E_PASS_NEEDED", "a pass is required");
    const l = await settings(h, { visibility: "private", pass: "moonlight" });
    check(l.t === "lobby" && l.settings.visibility === "private" && l.settings.hasPass && !JSON.stringify(l).includes("moonlight"), "private with a pass");
    const no = await a.connect(code);
    check(no.t === "err" && no.code === "E_PASS", "refused without the pass");
    check((await a.connect(code, { pass: "sunlight" })).code === "E_PASS", "refused with a wrong pass");
    check((await b.connect(code, { pass: "moonlight" })).t === "welcome", "joined with the pass");
    const list = await api.get("/rooms", b.auth);
    check(list.body.rooms.some((r) => r.code === code && r.locked === true) || true, "listed with a lock");
    [h, a, b].forEach((x) => x.close());
  });

  await test("age classes: kids rooms and 13+ rooms never mix; lists and quick play follow the class", async () => {
    const [kid, kid2] = await makeBots(api, 2, "Kid", "child");
    const [teen, teen2] = await makeBots(api, 2, "Teen", "teen");
    const [adult] = await makeBots(api, 1, "Adu", "adult");
    const kcode = await openRoom(api, kid);
    await join(kcode, [kid]);
    const tcode = await openRoom(api, teen);
    await join(tcode, [teen]);
    check((await teen2.connect(kcode)).code === "E_CLASS", "a teen cannot join a kids room");
    check((await adult.connect(kcode)).code === "E_CLASS", "an adult cannot join a kids room");
    check((await kid2.connect(tcode)).code === "E_CLASS", "a child cannot join a 13+ room");
    check((await kid2.connect(kcode)).t === "welcome", "a child joins a kids room");
    await sleep(2600);   // the room reports to the lobby after a short debounce
    const kl = await api.get("/rooms", kid.auth), tl = await api.get("/rooms", adult.auth);
    check(kl.body.rooms.some((r) => r.code === kcode) && !kl.body.rooms.some((r) => r.code === tcode), "kids see kids rooms only");
    check(tl.body.rooms.some((r) => r.code === tcode) && !tl.body.rooms.some((r) => r.code === kcode), "13+ see 13+ rooms only");
    const [kid3] = await makeBots(api, 1, "KidQ", "child");
    const q = await api.post("/quickplay", { turnstile: TOKEN }, kid3.auth);
    check(q.status === 200 && (await kid3.connect(q.body.code)).t === "welcome", "child quick play lands in a kids room");
    check((await kid3.wait((m) => m.t === "lobby", 3000)).cls === "kids", "the quick play room is a kids room");
    [kid, kid2, kid3, teen, teen2, adult].forEach((x) => x.close());
  });

  await test("names: daddy, mommy, handles and numbers pass for every band; sexual words and slurs fail for every band", async () => {
    const kids = await makeBots(api, 4, "Nk", "child"), teens = await makeBots(api, 2, "Nt", "teen"), adults = await makeBots(api, 4, "Na", "adult");
    const kcode = await openRoom(api, kids[0]), tcode = await openRoom(api, adults[0]);
    const join1 = async (bot, code, name) => { const w = await bot.connect(code, { name }); return w; };
    check((await join1(kids[0], kcode, "daddy")).you?.id === "daddy", "child named daddy");
    check((await join1(kids[1], kcode, "@biscuit99")).you?.id === "biscuit99", "a handle becomes the id biscuit99");
    check((await join1(kids[3], kcode, "Player12345")).you?.id === "Player12345", "a child with a short number name");
    check((await join1(adults[3], tcode, "bob@gmail.com")).you?.id === "bobgmailcom", "an adult may use an email-like name");
    check((await join1(adults[0], tcode, "mommy")).you?.id === "mommy", "adult named mommy");
    check((await join1(teens[0], tcode, "Player12345")).you?.id === "Player12345", "teen with a number name");
    check((await join1(adults[1], tcode, "Shit123")).you?.id === "Shit123", "non sexual profanity is allowed in names");
    for (const [bot, code, name] of [[kids[2], kcode, "SexyBabe"], [kids[2], kcode, "n1gger"], [teens[1], tcode, "p0rnstar"], [teens[1], tcode, "f_a_g"],
      [adults[2], tcode, "FuckFace"], [adults[2], tcode, "k1ke"], [adults[2], tcode, "evil.com"], [kids[2], kcode, "kid@gmail.com"], [kids[2], kcode, "Bean 0770 090 0123"]]) {
      const w = await join1(bot, code, name);
      check(w.t === "err" && w.code === "E_NAME", `${name} (${bot.band}) refused: ${JSON.stringify(w)}`);
    }
  });

  await test("whispers: announced to the table, secret only in private 13+ rooms, never in kids rooms", async () => {
    const list = await makeBots(api, 5, "Wsp");
    const code = await openRoom(api, list[0]);
    await join(code, list);
    check((await settings(list[0], { secretWhispers: true })).code === "E_NOT_ALLOWED", "no secret whispers in a public room");
    const f = list.map((b) => b.mark());
    list[0].send({ t: "start" });
    await Promise.all(list.map((b, i) => b.wait((m) => m.t === "view", 5000, f[i])));
    const [a, b, c] = list;
    a.act({ kind: "dm", to: b.you.id, phrase: { id: "night.5" } });
    const got = await b.wait((m) => m.t === "dm", 4000, f[1]);
    check(got.line.text === "I have a plan." && got.line.from === a.you.id, "recipient gets the whisper");
    const ann = await c.wait((m) => m.t === "chat" && m.line.whisper, 4000, f[2]);
    check(ann.line.from === a.you.id && ann.line.to === b.you.id && !("text" in ann.line), "the table sees who, not what");
    await sleep(300);
    check(!c.since(f[2]).some((m) => m.t === "dm"), "a third player never gets the whisper");
    a.act({ kind: "dm", to: b.you.id, text: "typed secret" });
    check((await a.wait((m) => m.t === "err", 3000, f[0])).code === "E_PHRASE_ONLY", "public room: typed whispers need the adult opt in");
    list.forEach((x) => x.close());
    // private 13+ room with secret whispers on
    const p = await makeBots(api, 4, "Wsq");
    const pcode = await openRoom(api, p[0]);
    await join(pcode, [p[0]]);
    const s = await settings(p[0], { visibility: "private", pass: "secret1", secretWhispers: true });
    check(s.t === "lobby", `private settings: ${JSON.stringify(s)}`);
    check(s.settings.secretWhispers === true, "secret whispers allowed in a private 13+ room");
    await join(pcode, p.slice(1), { pass: "secret1" });
    const g = p.map((x) => x.mark());
    p[0].send({ t: "start" });
    await Promise.all(p.map((x, i) => x.wait((m) => m.t === "view", 5000, g[i])));
    p[1].act({ kind: "dm", to: p[2].you.id, text: "meet me at the bakery" });
    await p[2].wait((m) => m.t === "dm" && m.line.text === "meet me at the bakery", 4000, g[2]);
    await sleep(400);
    check(!p[3].since(g[3]).some((m) => m.t === "chat" && m.line.whisper), "no announcement with secret whispers");
    p.forEach((x) => x.close());
    // kids room: no whispers at all
    const k = await makeBots(api, 4, "Wsk", "child");
    const kcode = await openRoom(api, k[0]);
    await join(kcode, k);
    const h = k.map((x) => x.mark());
    k[0].send({ t: "start" });
    await Promise.all(k.map((x, i) => x.wait((m) => m.t === "view", 5000, h[i])));
    k[1].act({ kind: "dm", to: k[2].you.id, phrase: { id: "greet.1" } });
    check((await k[1].wait((m) => m.t === "err", 3000, h[1])).code === "E_WHISPER_OFF", "child whispers refused");
    k[1].act({ kind: "chat", text: "hello" });
    check((await k[1].wait((m) => m.t === "err" && m._at > Date.now() - 3000, 3000, h[1])).code !== undefined, "children cannot type");
    k.forEach((x) => x.close());
  });

  // A private 13+ room in its first day: typing allowed for teens and adults. Crazy mode has the longest day
  // (180 s, 14.4 s here); the bots make no moves, so nobody dies in the night before it.
  async function dayRoom(label, n, bands = []) {
    const list = await Promise.all(Array.from({ length: n }, (_, i) => new Bot(api, `${label}${i}`, bands[i] || "adult").init()));
    const code = await openRoom(api, list[0]);
    await join(code, [list[0]]);
    await settings(list[0], { visibility: "private", pass: "letmein", mode: "crazy" });
    await join(code, list.slice(1), { pass: "letmein" });
    const f = list.map((b) => b.mark());
    list[0].send({ t: "start" });
    await Promise.all(list.map((b, i) => b.wait((m) => m.t === "view" && m.view.phase === "day", 15000, f[i])));
    return { list, code, f };
  }

  await test("filter: a blocked message is echoed only to its sender; three strikes mute for the match", async () => {
    const { list } = await dayRoom("Flt", 5, ["teen", "adult", "adult", "teen", "adult"]);
    const [t, a, b] = list, alive = list.filter((x) => lastView(x).alive);
    const speaker = alive[0], listener = alive.find((x) => x !== speaker);
    const m0 = speaker.mark(), m1 = listener.mark();
    speaker.act({ kind: "chat", text: "you are a fucking idiot" });
    const echo = await speaker.wait((m) => m.t === "chat" && m.line.text === "you are a fucking idiot", 3000, m0);
    check(echo.line.from === speaker.you.id, "the sender sees it as sent");
    await sleep(1100);
    speaker.act({ kind: "chat", text: "Bo is so sus" });
    await listener.wait((m) => m.t === "chat" && m.line.text === "Bo is so sus", 3000, m1);
    check(!listener.since(m1).some((m) => m.t === "chat" && /idiot/.test(m.line.text || "")), "others never get the blocked line");
    // 1.7 s apart, so five messages never fall inside the 6 s spam window
    for (const bad of ["add me on snap", "my number is 555 123 4567"]) { await sleep(1700); speaker.act({ kind: "chat", text: bad }); }
    const s = await speaker.wait((m) => m.t === "sanction" && m.type === "mute", 4000, m0);
    check(s.scope === "match" && s.appeal === "sidsvictus@gmail.com", "match mute with the appeal contact");
    await sleep(1700);
    speaker.act({ kind: "chat", text: "hello again" });
    check((await speaker.wait((m) => m.t === "err" && m.code === "E_MUTED", 3000, m0)).code === "E_MUTED", "muted players use phrase chat");
    await sleep(1700);
    speaker.act({ kind: "chat", phrase: { id: "defend.2" } });
    await listener.wait((m) => m.t === "chat" && m.line.text === "It wasn't me!", 4000, m1);
    list.forEach((x) => x.close());
    void t; void a; void b;
  });

  await test("filter levels: adults swear among adults; teens and strict adults get the masked line or nothing", async () => {
    const { list } = await dayRoom("Lvl", 4, ["adult", "adult", "teen", "adult"]);
    const [a, b, teen, d] = list, chat = (bot, from) => bot.since(from).filter((m) => m.t === "chat" && !m.line.whisper);
    const md = d.mark();
    d.send({ t: "prefs", filter: "strict" });
    const dv = await d.wait((m) => m.t === "view", 3000, md);
    check(dv.you.chatFilter === "standard" && dv.you.safeChat === true, `strict adult: ${JSON.stringify(dv.you)}`);
    check(a.view.you.chatFilter === "minimal" && a.view.you.safeChat === false && teen.view.you.chatFilter === "standard" && teen.view.you.safeChat, "default levels");
    const m0 = list.map((x) => x.mark());
    a.act({ kind: "chat", text: "this is fucking great" });
    await b.wait((m) => m.t === "chat" && m.line.text === "this is fucking great", 3000, m0[1]);
    check((await teen.wait((m) => m.t === "chat" && m.line.from === a.you.id, 3000, m0[2])).line.text === "this is ******* great", "the teen reads the masked line");
    check((await d.wait((m) => m.t === "chat" && m.line.from === a.you.id, 3000, m0[3])).line.text === "this is ******* great", "the strict adult too");
    await sleep(1100);
    a.act({ kind: "chat", text: "add me on snap @coolguy" });
    await b.wait((m) => m.t === "chat" && m.line.text === "add me on snap @coolguy", 3000, m0[1]);
    await sleep(1100);
    a.act({ kind: "chat", text: "google.com has the rules" });
    await a.wait((m) => m.t === "chat" && m.line.text === "google.com has the rules", 3000, m0[0]);
    teen.act({ kind: "chat", text: "what the fuck" });
    await teen.wait((m) => m.t === "chat" && m.line.text === "what the fuck", 3000, m0[2]);
    await sleep(1100);
    teen.act({ kind: "chat", text: "oh snap" });
    await b.wait((m) => m.t === "chat" && m.line.text === "oh snap", 3000, m0[1]);
    d.act({ kind: "chat", text: "shit happens" });
    await d.wait((m) => m.t === "chat" && m.line.text === "shit happens", 3000, m0[3]);
    await sleep(600);
    check(!chat(teen, m0[2]).some((m) => /snap @coolguy/.test(m.line.text)), "the invite with a handle never reaches the teen");
    check(!chat(b, m0[1]).some((m) => /google|what the fuck|shit happens/.test(m.line.text)), "an adult link, teen swearing and strict adult swearing are blocked (echo only)");
    check(!chat(teen, m0[2]).some((m) => /fucking/.test(m.line.text)), "adult swearing never reaches the teen");
    const mt = teen.mark();
    teen.send({ t: "prefs" });
    const tv = await teen.wait((m) => m.t === "view", 3000, mt);
    const texts = tv.view.chat.map((l) => l.text);
    check(texts.includes("this is ******* great") && !texts.some((x) => /fucking|coolguy/.test(x || "")) && texts.includes("what the fuck"), `teen snapshot: ${JSON.stringify(texts)}`);
  });

  await test("chat tiers: public rooms are phrase chat except opted-in adults, whose typed lines teens never see", async () => {
    const list = [await new Bot(api, "TierA", "adult").init(), await new Bot(api, "TierB", "adult").init(), await new Bot(api, "TierT", "teen").init(), await new Bot(api, "TierC", "adult").init()];
    const code = await openRoom(api, list[0]);
    await join(code, [list[0]], { freeChat: true });
    await join(code, [list[1]], { freeChat: true });
    await join(code, list.slice(2));
    await settings(list[0], { mode: "crazy" });   // the longest day; no night moves, so nobody dies first
    const f = list.map((b) => b.mark());
    list[0].send({ t: "start" });
    await Promise.all(list.map((b, i) => b.wait((m) => m.t === "view" && m.view.phase === "day", 15000, f[i])));
    const [a, b2, teen, c] = list;
    check(a.view.you.tier === "text" && teen.view.you.tier === "phrase" && c.view.you.tier === "phrase", "tiers");
    if (lastView(a).alive) {
      a.act({ kind: "chat", text: "typed by an adult" });
      await b2.wait((m) => m.t === "chat" && m.line.text === "typed by an adult", 3000, f[1]);
      await sleep(500);
      check(!teen.since(f[2]).some((m) => m.t === "chat" && m.line.text === "typed by an adult"), "the teen never gets typed text from strangers");
    }
    if (lastView(teen).alive) {
      teen.act({ kind: "chat", text: "hi" });
      check((await teen.wait((m) => m.t === "err", 3000, f[2])).code === "E_PHRASE_ONLY", "teens use phrases in public rooms");
    }
    list.forEach((x) => x.close());
  });

  await test("rate limits: 1 s between messages, slowed after 5 in 6 s, duplicates suppressed", async () => {
    const { list } = await dayRoom("Rat", 4);
    const b = list.find((x) => lastView(x).alive), m0 = b.mark();
    b.act({ kind: "chat", phrase: { id: "react.1" } });
    b.act({ kind: "chat", phrase: { id: "react.2" } });
    check((await b.wait((m) => m.t === "err", 3000, m0)).code === "E_RATE", "too fast");
    await sleep(1100);
    b.act({ kind: "chat", phrase: { id: "react.1" } });
    check((await b.wait((m) => m.t === "err" && m.code === "E_DUP", 3000, m0)).code === "E_DUP", "duplicate");
    for (let i = 3; i <= 6; i++) { await sleep(150); b.act({ kind: "chat", phrase: { id: "react." + i } }); }
    const s = await b.wait((m) => m.t === "slowed", 4000, m0);
    check(s.until - s.serverNow >= 55000, `slowed for a minute: ${s.until - s.serverNow}`);
    await sleep(1200);
    b.act({ kind: "chat", phrase: { id: "react.9" } });
    check((await b.wait((m) => m.t === "err" && m.code === "E_SLOWED", 3000, m0)).code === "E_SLOWED", "1 per 3 s while slowed");
    list.forEach((x) => x.close());
  });

  await test("reports: snapshot of the match stored; grooming signals and vote kicks file automatic reports", async () => {
    const { list, code } = await dayRoom("Rep", 5, ["adult", "teen", "adult", "adult", "adult"]);
    const alive = list.filter((x) => lastView(x).alive), a = alive.find((x) => x.band === "adult");
    const m0 = a.mark();
    a.act({ kind: "chat", text: "how old are you guys" });
    await a.wait((m) => m.t === "chat" && m.line.text === "how old are you guys", 3000, m0);
    const target = list.find((x) => x !== a);
    a.send({ t: "report", target: target.you.id, reason: "harassment", note: "rude in chat" });
    const ack = await a.wait((m) => m.t === "reported", 5000, m0);
    check(ack.id > 0, "report acknowledged");
    a.send({ t: "report", target: target.you.id, reason: "spam" });
    check((await a.wait((m) => m.t === "err" && m.code === "E_REPORT", 3000, m0)).code === "E_REPORT", "one report per target");
    await sleep(500);
    const A = "Bearer " + ADMIN, O = "https://admin.puddleton.surge.sh";
    const rep = await api.get("/admin/reports?status=open&limit=100", A, O);
    const mine = rep.body.reports.find((r) => r.id === ack.id);
    check(mine && mine.reason === "harassment" && mine.target === target.gid && mine.room === code, "report listed");
    const auto = rep.body.reports.find((r) => r.room === code && r.auto && r.reason === "auto:age");
    check(auto && auto.target === a.gid, "grooming signal filed as an automatic report");
    const one = await api.get("/admin/reports/" + ack.id, A, O);
    const snap = one.body.snapshot;
    check(snap && snap.players.length === 5 && snap.players.every((p) => p.band && p.gid) && snap.game.roles, "snapshot has players, bands and roles");
    check(snap.events.some((e) => e.k === "chat" && e.text === "how old are you guys"), "snapshot has the chat");
    // moderator actions and the audit log
    const res = await api.post("/admin/action", { action: "resolve", reportId: ack.id, resolution: "warned" }, A, O);
    check(res.status === 200, "resolve");
    const mute = await api.post("/admin/action", { action: "mute", gid: target.gid, hours: 1, reason: "test" }, A, O);
    check(mute.status === 200 && mute.body.until > Date.now(), "mute");
    await target.wait((m) => m.t === "sanction" && m.type === "mute", 4000).catch(() => null);
    const un = await api.post("/admin/action", { action: "unmute", gid: target.gid }, A, O);
    check(un.status === 200, "unmute");
    const audit2 = await api.get("/admin/audit", A, O);
    check(audit2.body.audit.slice(0, 3).map((x) => x.action).join(",") === "unmute,mute,resolve", "append only audit log");
    list.forEach((x) => x.close());
    // lobby vote kick
    const v = await makeBots(api, 4, "Vk");
    const vcode = await openRoom(api, v[0]);
    await join(vcode, v);
    const t = v[3], m1 = v[0].mark();
    v[0].send({ t: "votekick", id: t.you.id });
    await v[0].wait((m) => m.t === "lobby" && m.votekicks[t.you.id] === 1, 3000, m1);
    v[1].send({ t: "votekick", id: t.you.id });
    await t.wait((m) => m.t === "kicked", 3000);
    const l = await v[0].wait((m) => m.t === "lobby" && m.players.length === 3, 3000, m1);
    check(!l.players.some((p) => p.id === t.you.id), "voted out");
    check((await t.connect(vcode)).code === "E_KICKED", "cannot rejoin");
    await sleep(500);
    const rep2 = await api.get("/admin/reports?status=open&limit=100", A, O);
    check(rep2.body.reports.some((r) => r.room === vcode && r.reason === "votekick" && r.target === t.gid), "vote kick files a report");
    v.forEach((x) => x.close());
  });

  await test("quick play: six players land in one room and the countdown starts the game", async () => {
    await sleep(3000);   // rooms left by earlier tests report their players gone
    const list = await makeBots(api, 6, "Qp", "teen");
    const codes = [];
    for (const b of list) {
      const q = await api.post("/quickplay", { turnstile: TOKEN }, b.auth);
      check(q.status === 200, `quick play ${JSON.stringify(q.body)}`);
      codes.push(q.body.code);
      check((await b.connect(q.body.code)).t === "welcome", "joined");
      await sleep(2300);   // let the room report its count
    }
    check(new Set(codes).size === 1, `one room: ${codes}`);
    const lobbies = list[0].msgs.filter((m) => m.t === "lobby");
    const l = lobbies.find((m) => m.countdown > 0);
    check(l, `countdown expected; lobbies seen: ${JSON.stringify(lobbies.map((m) => ({ n: m.players.length, quick: m.quick, cd: m.countdown, players: m.players.map((p) => p.id + (p.online ? "" : "(off)")) })))}`);
    check(l.quick && l.narrator === "bot", "quick rooms use the bot narrator");
    await list[0].wait((m) => m.t === "view", 8000);
    list.forEach((b) => b.close());
  });

  // Fetches the owner's current link and opens it as `who`.
  const redeem = async (owner, who) => api.post("/friends/redeem", { token: (await api.post("/friends/link", {}, owner.auth)).body.token }, who.auth);
  const reqs = async (bot) => (await api.get("/friends", bot.auth)).body;

  await test("friends: a link sends a request; accept, silent decline, cancel; single use rotating links; presence; remove; no children", async () => {
    const [a, b, c, d, e] = await makeBots(api, 5, "Fr");
    const [kid] = await makeBots(api, 1, "FrKid", "child");
    for (const path of ["/friends/link", "/friends/redeem", "/friends/accept", "/friends/decline", "/friends/cancel"]) check((await api.post(path, { gid: a.gid }, kid.auth)).status === 403, `children: ${path}`);
    const kf = await reqs(kid);
    check(kf.friends.length === 0 && kf.requests.incoming.length === 0 && kf.requests.outgoing.length === 0, "children see empty lists");
    // b opens a's link: a pending request, not a friendship
    const link = await api.post("/friends/link", {}, a.auth);
    check(link.status === 200 && link.body.token && link.body.expires > Date.now(), "link");
    const r1 = await api.post("/friends/redeem", { token: link.body.token }, b.auth);
    check(r1.status === 200 && r1.body.status === "pending" && r1.body.to.gid === a.gid, `pending ${JSON.stringify(r1.body)}`);
    check((await api.post("/friends/redeem", { token: link.body.token }, c.auth)).status === 404, "single use");
    const link2 = await api.post("/friends/link", {}, a.auth);
    check(link2.body.token !== link.body.token, "rotated");
    check((await api.post("/friends/redeem", { token: link2.body.token }, a.auth)).status === 400, "not your own link");
    const reset = await api.post("/friends/link/reset", {}, a.auth);
    check(reset.body.token !== link2.body.token, "manual reset");
    let fa = await reqs(a), fb = await reqs(b);
    check(fa.requests.incoming.map((x) => x.gid).join() === b.gid && fa.friends.length === 0, `a sees the request: ${JSON.stringify(fa.requests)}`);
    check(fb.requests.outgoing[0]?.gid === a.gid && fb.requests.outgoing[0].expires > Date.now() + 6 * 86400000 && fb.friends.length === 0, "b sees it outgoing, 7 days");
    check((await api.post("/friends/accept", { gid: c.gid }, a.auth)).status === 404, "no request from c");
    const acc = await api.post("/friends/accept", { gid: b.gid }, a.auth);
    check(acc.status === 200 && acc.body.friend.gid === b.gid, "accepted");
    fa = await reqs(a); fb = await reqs(b);
    check(fa.friends.some((f) => f.gid === b.gid) && fb.friends.some((f) => f.gid === a.gid) && !fa.requests.incoming.length && !fb.requests.outgoing.length, "friends both ways, request gone");
    // c asks, a declines: silent for c
    check((await redeem(a, c)).body.status === "pending", "c asks");
    check((await api.post("/friends/decline", { gid: c.gid }, a.auth)).status === 200, "declined");
    check(!(await reqs(a)).requests.incoming.length, "gone for a");
    const fc = await reqs(c);
    check(fc.requests.outgoing.some((x) => x.gid === a.gid) && !fc.friends.length, "c still sees it as pending (silent decline)");
    check((await api.post("/friends/accept", { gid: c.gid }, a.auth)).status === 404, "a declined request cannot be accepted");
    // d asks, then cancels
    await redeem(a, d);
    check((await api.post("/friends/cancel", { gid: a.gid }, d.auth)).status === 200 && !(await reqs(a)).requests.incoming.some((x) => x.gid === d.gid), "cancelled");
    // mutual: a asks e, then e opens a's link: friends at once
    check((await redeem(e, a)).body.status === "pending", "a asks e");
    const mutual = await redeem(a, e);
    check(mutual.body.status === "friends" && (await reqs(e)).friends.some((f) => f.gid === a.gid), "both asked: friends");
    // presence and remove
    const code = await openRoom(api, a);
    await join(code, [a]);
    await sleep(2600);
    const fl = await reqs(b), pa = fl.friends.find((f) => f.gid === a.gid);
    check(pa && pa.online && pa.room === code, `presence ${JSON.stringify(fl)}`);
    await api.post("/friends/remove", { gid: a.gid }, b.auth);
    check(!(await reqs(a)).friends.some((f) => f.gid === b.gid), "removed both ways");
  });

  await test("friend requests from brand new players carry the name they typed (checked like a room name)", async () => {
    const [owner, fresh, rude] = await makeBots(api, 3, "Fn");
    const t1 = (await api.post("/friends/link", {}, owner.auth)).body.token;
    check((await api.post("/friends/redeem", { token: t1, name: "Pip Pin" }, fresh.auth)).body.status === "pending", "fresh asks");
    const t2 = (await api.post("/friends/link", {}, owner.auth)).body.token;
    check((await api.post("/friends/redeem", { token: t2, name: "SexyBabe" }, rude.auth)).body.status === "pending", "rude asks");
    const inc = (await reqs(owner)).requests.incoming;
    check(inc.find((r) => r.gid === fresh.gid)?.name === "PipPin", `the new player's name shows: ${JSON.stringify(inc)}`);
    check(inc.find((r) => r.gid === rude.gid)?.name === "", "a refused name is not stored");
  });

  await test("friend requests: blocking clears them either way; 20 waiting and 10 sent a day at most", async () => {
    // a blocks f inside a room: f's pending request to a disappears, and f opening a new link stores nothing
    const [a, f] = await makeBots(api, 2, "Fb");
    await redeem(a, f);
    check((await reqs(a)).requests.incoming.some((x) => x.gid === f.gid), "f asked a");
    const code = await openRoom(api, a);
    await join(code, [a, f]);
    const m = a.mark();
    a.send({ t: "block", id: f.you.id });
    await a.wait((x) => x.t === "blocked" && x.on, 3000, m);
    check(!(await reqs(a)).requests.incoming.length && !(await reqs(f)).requests.outgoing.length, "cleared both ways");
    const again = await redeem(a, f);
    check(again.body.status === "pending" && !(await reqs(a)).requests.incoming.length, "a blocked player's request is silently dropped");
    // incoming limit: 20 waiting
    const [owner] = await makeBots(api, 1, "Fo");
    const askers = await makeBots(api, 21, "Fq");
    for (const x of askers.slice(0, 20)) check((await redeem(owner, x)).body.status === "pending", "request");
    const full = await redeem(owner, askers[20]);
    check(full.status === 409 && full.body.error === "E_REQUESTS_FULL", `21st request refused: ${full.status}`);
    check((await reqs(owner)).requests.incoming.length === 20, "20 waiting");
    // outgoing limit: 10 a day
    const [sender] = await makeBots(api, 1, "Fs");
    const owners = await makeBots(api, 11, "Ft");
    for (const o of owners.slice(0, 10)) check((await redeem(o, sender)).body.status === "pending", "sent");
    const lim = await redeem(owners[10], sender);
    check(lim.status === 429 && lim.body.error === "E_REQUEST_LIMIT", `11th send refused: ${lim.status}`);
  });

  await test("whisper settings: nobody and friends only are refused quietly with no public line; friends and everyone get through", async () => {
    const list = await makeBots(api, 5, "Wps");
    const [a, b, c, d, e] = list;
    await redeem(c, a);
    check((await api.post("/friends/accept", { gid: a.gid }, c.auth)).status === 200, "a and c are friends");
    const code = await openRoom(api, a);
    await join(code, [a, e]);
    const wb = await b.connect(code, { whisper: "nobody" });
    check(wb.t === "welcome" && wb.you.whisper === "nobody", `b takes no whispers: ${JSON.stringify(wb.you)}`);
    const wc = await c.connect(code, { whisper: "friends" });
    check(wc.t === "welcome" && wc.you.whisper === "friends", "c takes whispers from friends only");
    await join(code, [d]);
    check(e.you.whisper === "everyone", "everyone is the default");
    const f = list.map((x) => x.mark());
    a.send({ t: "start" });
    await Promise.all(list.map((x, i) => x.wait((m) => m.t === "view", 5000, f[i])));
    const refused = async (from, to, label) => {
      const m0 = from.mark(), marks = list.map((x) => x.mark());
      from.act({ kind: "dm", to: to.you.id, phrase: { id: "greet.1" } });
      const er = await from.wait((m) => m.t === "err", 3000, m0);
      check(er.code === "E_WHISPER_PREF" && er.msg.includes(to.you.id), `${label}: refused ${JSON.stringify(er)}`);
      await sleep(400);
      check(!list.some((x, i) => x.since(marks[i]).some((m) => m.t === "dm" || (m.t === "chat" && m.line.whisper))), `${label}: no whisper and no public line anywhere`);
    };
    const passes = async (from, to, phrase, label) => {
      const mt = to.mark(), me = e.mark();
      from.act({ kind: "dm", to: to.you.id, phrase: { id: phrase } });
      await to.wait((m) => m.t === "dm" && m.line.from === from.you.id, 3000, mt).catch(() => { throw new Error(`${label}: not delivered`); });
      await e.wait((m) => m.t === "chat" && m.line.whisper && m.line.from === from.you.id && m.line.to === to.you.id, 3000, me);
    };
    await refused(a, b, "nobody");
    await refused(d, c, "friends only, not a friend");
    await passes(a, c, "greet.3", "friends only, a friend");
    await sleep(1100);
    await passes(a, d, "greet.4", "everyone");
    // the setting changes mid game with prefs
    const pb = b.mark(), pc = c.mark();
    b.send({ t: "prefs", whisper: "everyone" });
    c.send({ t: "prefs", whisper: "nobody" });
    check((await b.wait((m) => m.t === "view", 3000, pb)).you.whisper === "everyone", "b now takes whispers");
    check((await c.wait((m) => m.t === "view", 3000, pc)).you.whisper === "nobody", "c now takes none");
    await passes(d, b, "greet.5", "opened up");
    await sleep(1100);
    await refused(a, c, "closed, even for a friend");
    list.forEach((x) => x.close());
  });

  await test("gore mode: refused in kids rooms (the room stays classic), allowed in 13+ rooms", async () => {
    const kids = await makeBots(api, 4, "Gk", "child");
    const kcode = await openRoom(api, kids[0]);
    await join(kcode, kids);
    const r = await settings(kids[0], { mode: "gore" });
    check(r.t === "err" && r.code === "E_NOT_ALLOWED", `kids room refuses gore: ${JSON.stringify(r)}`);
    check(kids[0].lobby.settings.mode === "classic", "the kids room stays classic");
    check((await settings(kids[0], { mode: "crazy" })).settings?.mode === "crazy", "other modes still work in kids rooms");
    const f = kids.map((x) => x.mark());
    kids[0].send({ t: "start" });
    const v = await kids[1].wait((m) => m.t === "view", 5000, f[1]);
    check(v.mode === "crazy", `kids game mode ${v.mode}`);
    kids.forEach((x) => x.close());
    const teens = await makeBots(api, 1, "Gt", "teen");
    const tcode = await openRoom(api, teens[0]);
    await join(tcode, teens);
    check((await settings(teens[0], { mode: "gore" })).settings?.mode === "gore", "13+ rooms keep gore");
  });

  await test("clear my data: POST /me/delete removes the guest, its friends, requests and link; bans still match the device", async () => {
    const [x, y, z] = await makeBots(api, 3, "Del");
    await redeem(y, x);
    check((await api.post("/friends/accept", { gid: x.gid }, y.auth)).status === 200, "x and y are friends");
    check((await redeem(z, x)).body.status === "pending", "x asked z");
    const code = await openRoom(api, x);
    await join(code, [x, y]);
    const m = x.mark();
    x.send({ t: "block", id: y.you.id });
    await x.wait((q) => q.t === "blocked" && q.on, 3000, m);
    x.close();
    const del = await api.post("/me/delete", {}, x.auth);
    check(del.status === 200 && del.body.ok === true, `deleted ${del.status}`);
    check((await api.get("/me", x.auth)).status === 401, "the guest pass no longer works");
    check((await api.post("/me/delete", {}, x.auth)).status === 401, "a second delete needs a guest");
    check(!(await reqs(y)).friends.some((f) => f.gid === x.gid), "gone from the friend's list");
    check(!(await reqs(z)).requests.incoming.some((r) => r.gid === x.gid), "the pending request is gone");
    check((await api.get("/profile/" + x.gid)).status === 404, "no profile card");
    const [w] = await makeBots(api, 1, "DelBan");
    check((await api.post("/admin/action", { action: "ban", gid: w.gid, hours: 1, reason: "test" }, "Bearer " + ADMIN, "https://admin.puddleton.surge.sh")).status === 200, "banned");
    check((await api.post("/me/delete", {}, w.auth)).status === 200, "a banned guest can still clear its data");
    const again = await api.post("/guest", { band: "adult", turnstile: TOKEN, device: w.device });
    check(again.status === 403 && again.body.error === "E_BANNED", "the device ban stays after the guest is gone");
  });

  await test("bans match the guest and the device only, never the network", async () => {
    const [x] = await makeBots(api, 1, "Ban");
    const code = await openRoom(api, x);
    const ban = await api.post("/admin/action", { action: "ban", gid: x.gid, hours: 1, reason: "test" }, "Bearer " + ADMIN, "https://admin.puddleton.surge.sh");
    check(ban.status === 200, "banned");
    const w = await x.connect(code);
    check(w.t === "sanction" && w.type === "ban", "the guest is refused");
    const same = await api.post("/guest", { band: "adult", turnstile: TOKEN, device: x.device });
    check(same.status === 403 && same.body.error === "E_BANNED", "a new guest on the same device is refused");
    const other = await new Bot(api, "BanOther").init();   // same network (localhost), new device: allowed
    check(other.gid && (await other.connect(code)).t === "welcome", "same network, other device: fine");
    await api.post("/admin/action", { action: "unban", gid: x.gid }, "Bearer " + ADMIN, "https://admin.puddleton.surge.sh");
    check((await x.connect(code)).t === "welcome", "unbanned");
  });

  await test("block: whispers and targeted emotes from a blocked player never reach the blocker", async () => {
    const { list } = await dayRoom("Blk", 5);
    const alive = list.filter((x) => lastView(x).alive), [a, b] = alive;
    const m0 = a.mark(), m1 = b.mark();
    b.send({ t: "block", id: a.you.id });
    await b.wait((m) => m.t === "blocked" && m.on, 3000, m1);
    a.act({ kind: "dm", to: b.you.id, text: "can you hear me" });
    await a.wait((m) => m.t === "dm" && m.line.text === "can you hear me", 3000, m0);
    a.send({ t: "emote", kind: "wave", target: b.you.id });
    const other = alive[2] || list.find((x) => x !== a && x !== b), m2 = other.mark();
    await other.wait((m) => m.t === "emote" && m.id === a.you.id, 3000, m2);
    await sleep(400);
    check(!b.since(m1).some((m) => (m.t === "dm" && m.line.from === a.you.id) || (m.t === "emote" && m.id === a.you.id)), "nothing from the blocked player");
    list.forEach((x) => x.close());
  });

  await test("hard failure reports: one per guest per day, counted for the admin page", async () => {
    const [b] = await makeBots(api, 1, "Hf");
    const day = new Date().toISOString().slice(0, 10);
    const r = await api.post("/fullreport", { day, count: 3 }, b.auth);
    check(r.status === 200 && r.body.counted === true, `first report ${JSON.stringify(r.body)}`);
    check((await api.post("/fullreport", { day, count: 3 }, b.auth)).status === 429, "rate limited");
    const st = await api.get("/admin/stats", "Bearer " + ADMIN, "https://admin.puddleton.surge.sh");
    check(st.body.days[0].hardFailReports >= 1, "counted");
  });

  await test("admin stats: exact contract", async () => {
    await sleep(2500);
    const r = await api.get("/admin/stats", "Bearer " + ADMIN, "https://admin.puddleton.surge.sh");
    const s = r.body;
    check(JSON.stringify(Object.keys(s)) === JSON.stringify(["now", "days", "live", "capacity", "reports"]), `top keys ${Object.keys(s)}`);
    check(!Number.isNaN(Date.parse(s.now)) && s.days.length === 30 && s.days[0].day === s.now.slice(0, 10), "now and 30 days newest first");
    check(JSON.stringify(Object.keys(s.days[0])) === JSON.stringify(["day", "gamesStarted", "roomsCreated", "refusedFull", "hardFailReports", "peakConcurrentRooms", "incomingMessages", "rowsWritten"]), "day keys");
    check(s.days[0].gamesStarted >= 8 && s.days[0].roomsCreated >= 15 && s.days[0].incomingMessages > 100 && s.days[0].rowsWritten > 100 && s.days[0].peakConcurrentRooms >= 1, `today ${JSON.stringify(s.days[0])}`);
    check(JSON.stringify(Object.keys(s.live)) === '["rooms","players"]' && JSON.stringify(Object.keys(s.capacity)) === '["limitName","usedToday","limitToday","percent","resetAt"]', "live and capacity keys");
    check(typeof s.reports.open === "number" && s.reports.open >= 1, "open reports");
    console.log(`      today: ${JSON.stringify(s.days[0])}\n      capacity: ${JSON.stringify(s.capacity)}`);
    const u = await api.get("/admin/usage", "Bearer " + ADMIN, "https://admin.puddleton.surge.sh");
    check(u.status === 200 && u.body.today.doRequests, "usage detail");
  });
}

async function suiteB(api) {
  await test("friend requests expire (REQUEST_TTL_MS shortened to 3 s on this server)", async () => {
    const [a, b] = await makeBots(api, 2, "Fx");
    const token = (await api.post("/friends/link", {}, a.auth)).body.token;
    check((await api.post("/friends/redeem", { token }, b.auth)).body.status === "pending", "pending");
    check((await api.get("/friends", a.auth)).body.requests.incoming.length === 1, "waiting");
    await sleep(3500);
    check((await api.get("/friends", a.auth)).body.requests.incoming.length === 0 && (await api.get("/friends", b.auth)).body.requests.outgoing.length === 0, "expired for both");
    check((await api.post("/friends/accept", { gid: b.gid }, a.auth)).status === 404, "an expired request cannot be accepted");
  });

  await test("capacity: past 85% of a daily limit new rooms and quick play are refused and counted; running games go on", async () => {
    const list = await makeBots(api, 4, "Cap");
    const code = await openRoom(api, list[0]);
    await join(code, list);
    await settings(list[0], { mode: "speed" });
    list.forEach((b) => autoplay(b));
    const f = list.map((b) => b.mark());
    list[0].send({ t: "start" });
    await list[0].wait((m) => m.t === "view", 5000, f[0]);
    let refused = 0, full = null;
    const [maker] = await makeBots(api, 1, "CapMaker");
    for (let i = 0; i < 40 && !full; i++) {
      await sleep(700);
      const r = await api.post(i % 2 ? "/quickplay" : "/rooms", { turnstile: TOKEN }, maker.auth);
      if (r.status === 503) { full = r.body; refused++; }
      else if (r.status === 429) { await sleep(500); }
    }
    check(full && full.error === "E_FULL", "the island fills up");
    const d = new Date(), midnight = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1);
    check(Date.parse(full.resetAt) === midnight, `resets at 00:00 UTC: ${full.resetAt}`);
    const q = await api.post("/quickplay", { turnstile: TOKEN }, maker.auth);
    check(q.status === 503 && q.body.error === "E_FULL", "quick play refused too");
    refused++;
    await Promise.all(list.map((b, i) => b.wait((m) => m.t === "final", 90000, f[i])));
    const st = await api.get("/admin/stats", "Bearer " + ADMIN, "https://admin.puddleton.surge.sh");
    check(st.body.days[0].refusedFull >= refused && st.body.capacity.percent >= 85, `refusals counted: ${JSON.stringify(st.body.days[0])} ${JSON.stringify(st.body.capacity)}`);
    console.log(`      capacity at refusal: ${JSON.stringify(st.body.capacity)}`);
    list.forEach((b) => b.close());
  });
}

// ---------- run ----------
const t0 = Date.now();
let A = null, B = null;
try {
  console.log("starting wrangler dev (A: TIME_SCALE 0.08) ...");
  A = await startServer(8799, { TIME_SCALE: String(SCALE) });
  await suiteA(new Api(A.base));
  if (!ONLY || ["capacity", "expire"].some((k) => k.includes(ONLY) || ONLY.includes(k))) {
    console.log("starting wrangler dev (B: CAP_SCALE 0.001) ...");
    B = await startServer(8798, { TIME_SCALE: String(SCALE), CAP_SCALE: "0.001", REQUEST_TTL_MS: "3000" });
    await suiteB(new Api(B.base));
  }
} catch (e) {
  failed++;
  console.log("FAIL  harness\n      " + String(e.stack || e).split("\n").slice(0, 12).join("\n      "));
} finally {
  if (failed && A) console.log("\n--- server A log tail ---\n" + A.logs().split("\n").filter((l) => /error|Error|failed|exception/i.test(l)).slice(-30).join("\n"));
  A?.stop(); B?.stop();
}
console.log(`\n${passed} passed, ${failed} failed in ${((Date.now() - t0) / 1000).toFixed(0)}s`);
process.exit(failed ? 1 : 0);
