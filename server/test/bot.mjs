// A scripted Puddleton client for the integration tests. Uses Node's global WebSocket (Node 22+), which accepts
// custom headers, so the bots can send the Origin a browser would send.
export const ORIGIN = "http://localhost:8080";
export const TOKEN = "XXXX.DUMMY.TOKEN.XXXX";   // Turnstile test token (the test secret accepts it)
export const MAFIA = ["mafia", "godfather", "framer"];
export const NIGHT = ["mafia", "godfather", "angel", "detective", "vigilante", "serialkiller", "framer"];
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export class Api {
  constructor(base) { this.base = base; }
  async req(method, path, body, auth, origin = ORIGIN) {
    const headers = { ...(origin ? { Origin: origin } : {}), ...(auth ? { Authorization: auth } : {}), ...(body ? { "Content-Type": "application/json" } : {}) };
    const r = await fetch(this.base + path, { method, headers, body: body ? JSON.stringify(body) : undefined });
    let json = null;
    try { json = await r.json(); } catch { /* empty */ }
    return { status: r.status, body: json, headers: r.headers };
  }
  get(path, auth, origin) { return this.req("GET", path, null, auth, origin); }
  post(path, body, auth, origin) { return this.req("POST", path, body, auth, origin); }
}

let seq = 0;
export class Bot {
  static all = [];
  static closeAll() { for (const b of Bot.all.splice(0)) b.close(); }
  constructor(api, name, band = "adult") {
    Bot.all.push(this);
    this.api = api; this.name = name; this.band = band;
    this.msgs = []; this.handlers = []; this.waiters = [];
    this.device = `dev-${name}-${Date.now()}-${seq++}`;
  }
  async init() {
    const r = await this.api.post("/guest", { band: this.band, turnstile: TOKEN, device: this.device });
    if (r.status !== 200) throw new Error(`guest failed ${r.status} ${JSON.stringify(r.body)}`);
    Object.assign(this, { gid: r.body.gid, secret: r.body.secret, auth: `Guest ${r.body.gid}:${r.body.secret}` });
    return this;
  }
  on(fn) { this.handlers.push(fn); }
  // Opens the socket and says hello. Resolves with the first welcome, err, version or sanction message.
  connect(code, extra = {}) {
    this.code = code;
    this.closed = null;
    if (this.ws) { const old = this.ws; this.ws = null; clearInterval(this.pinger); try { old.close(); } catch { /* closed */ } }
    const ws = (this.ws = new WebSocket(this.api.base.replace(/^http/, "ws") + "/ws/" + code, { headers: { Origin: ORIGIN } }));
    const from = this.msgs.length;
    ws.onopen = () => {
      ws.send(JSON.stringify({ t: "hello", v: 1, gid: this.gid, secret: this.secret, name: this.name, look: { body: "mint", head: "none" }, device: this.device, ...extra }));
      // keepalive like a real client: the server answers "ping" with "pong" without waking the room
      clearInterval(this.pinger);
      this.pinger = setInterval(() => { if (ws.readyState === 1) ws.send("ping"); }, 20000);
      this.pinger.unref?.();
    };
    ws.onmessage = (e) => {
      if (ws !== this.ws) return;
      if (e.data === "pong") return;
      let m;
      try { m = JSON.parse(e.data); } catch { m = { t: "raw", data: e.data }; }
      m._at = Date.now();
      this.msgs.push(m);
      if (m.t === "welcome") this.you = m.you;
      if (m.t === "you") this.you = m.you;
      if (m.t === "lobby") this.lobby = m;
      if (m.t === "view") this.view = m;
      if (m.t === "gmview") this.gm = m;
      for (const h of this.handlers) { try { h(m, this); } catch (err) { console.log("handler error", err); } }
      this.waiters = this.waiters.filter((w) => !w(m));
    };
    ws.onclose = (e) => { if (ws === this.ws) this.closed = { code: e.code, reason: e.reason }; this.waiters = this.waiters.filter((w) => !w({ t: "_closed", code: e.code })); };
    ws.onerror = () => {};
    return this.wait((m) => ["welcome", "err", "version", "sanction", "closed"].includes(m.t), 10000, from);
  }
  send(obj) { if (this.ws && this.ws.readyState === 1) this.ws.send(JSON.stringify(obj)); }
  act(a) { this.send({ t: "act", a }); }
  mark() { return this.msgs.length; }
  // The first message from index `from` on that matches, waiting up to `ms`.
  wait(pred, ms = 8000, from = 0) {
    const hit = this.msgs.slice(from).find(pred);
    if (hit) return Promise.resolve(hit);
    return new Promise((resolve, reject) => {
      const t = setTimeout(() => { this.waiters = this.waiters.filter((w) => w !== fn); reject(new Error(`${this.name}: timed out waiting (${pred.toString().slice(0, 120)})`)); }, ms);
      const fn = (m) => { if (m.t !== "_closed" && pred(m)) { clearTimeout(t); resolve(m); return true; } return false; };
      this.waiters.push(fn);
    });
  }
  since(from, pred = () => true) { return this.msgs.slice(from).filter(pred); }
  close() { const ws = this.ws; this.ws = null; clearInterval(this.pinger); try { ws?.close(); } catch { /* closed */ } }
  drop() { this.close(); }   // a disconnect without a leave message
}

// Plays a bot narrator game: one move per phase. Votes go to the first living player not spared (or the next
// one if that is the bot itself), so days end in a trial. opts: spare (never targeted), abstain, idle, skipDay(v).
export function autoplay(bot, opts = {}) {
  bot.on((m) => {
    if (m.t === "picked") bot.confirmed = m.target;
    if (m.t !== "view" || opts.idle) return;
    const v = m.view;
    if (!v.alive || v.phase === "ended" || !m.dealt || v.phase === "trial") return;
    const key = v.phase + v.day, alive = v.players.filter((p) => p.alive).map((p) => p.id), spare = opts.spare || [];
    if (bot.acted === key && (bot.confirmed === undefined || alive.includes(bot.confirmed))) return;
    if (bot.acted !== key) bot.confirmed = undefined;
    bot.acted = key;
    if (v.phase === "night") {
      if (!NIGHT.includes(v.role)) return;
      const mates = v.players.filter((p) => p.role && MAFIA.includes(p.role)).map((p) => p.id);
      const t = MAFIA.includes(v.role) ? alive.find((p) => !mates.includes(p) && !spare.includes(p))
        : v.role === "angel" ? v.you : alive.find((p) => p !== v.you && !spare.includes(p));
      if (t) bot.act({ kind: "night", target: t });
    } else if (v.phase === "day") {
      if (opts.skipDay && opts.skipDay(v)) return;
      if (opts.abstain) return bot.act({ kind: "vote", target: null });
      const pool = alive.filter((p) => !spare.includes(p));
      const t = pool[0] === v.you ? pool[1] : pool[0];
      bot.act({ kind: "vote", target: t ?? null });
    }
  });
}

// The human Grandmaster: deals, then moves the story on once everyone has acted or voted.
export function gmplay(bot, opts = {}) {
  bot.on((m) => {
    if (m.t !== "gmview") return;
    if (!m.dealt) { if (!bot.dealt) { bot.dealt = true; opts.beforeDeal?.(bot, m); setTimeout(() => bot.send({ t: "deal" }), 100); } return; }
    const g = m.gm;
    if (g.phase === "ended") return;
    const key = g.phase + g.day;
    if (bot.advanced === key) return;
    const ready = g.phase === "night" ? m.pending.length === 0 : g.phase === "day" ? m.tally.cast >= m.tally.alive : true;
    if (ready) { bot.advanced = key; setTimeout(() => bot.send({ t: "advance" }), 60); }
  });
}
