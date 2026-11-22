// Puddleton theme: a composed 16-bar loop in D minor at 58 BPM, synthesized live with the Web Audio API.
// Fully original (no samples, no files), so there is nothing to license.
// Form: chords D minor, Bb, G minor, A | A, G minor, Bb, D minor (a palindrome), played twice.
// Pass 1 is music box + bass + drums; pass 2 adds the whistled melody, whose last bar mirrors its first.
// Volumes follow the settings (screens/prefs.mjs, "audio"): master, music, effects, and mute everything.
// Buses: music and effects each have their own gain (and reverb), both feed the master gain.
import { getSettings, setSetting, onChange } from "./screens/prefs.mjs";

const BPM = 58, STEP = 60 / BPM / 4, PEAK = 0.7;
const hz = (m) => 440 * 2 ** ((m - 69) / 12);
try { if (localStorage.getItem("pad-sound") === "off") { localStorage.removeItem("pad-sound"); setSetting("audio.muted", true); } } catch { /* storage blocked */ }   // the old sound toggle
let vol = { ...getSettings().audio };
export const soundOn = () => !vol.muted && vol.master > 0;
const level = () => (soundOn() ? (vol.master / 100) * PEAK : 0);

const CHORDS = [   // [bass root, chord tones for pad and music box]
  [38, [62, 65, 69]], [34, [62, 65, 70]], [31, [62, 67, 70]], [33, [61, 64, 67, 70]],
  [33, [61, 64, 67, 70]], [31, [62, 67, 70]], [34, [62, 65, 70]], [38, [62, 65, 69]],
];
const MELODY = [   // one note per quarter, null = rest
  [74, null, 77, 76], [74, null, 69, null], [70, 69, 67, null], [69, null, 73, null],
  [76, null, 73, 69], [67, 69, 70, null], [69, null, 74, null], [76, 77, 74, null],
];
const ARP = [0, 2, 1, 2];                    // music box: which chord tone on each beat
const BASS_HITS = { 0: 1, 8: 0.7 };

let ctx, master, music, fx, verb, fverb, echo, padBus, noiseBuf, started = false, step = 0, nextTime = 0;

function setup() {
  ctx = new (window.AudioContext || window.webkitAudioContext)({ latencyHint: "playback" });
  const phone = matchMedia("(pointer: coarse)").matches || innerWidth < 900;
  const comp = ctx.createDynamicsCompressor(); comp.threshold.value = -20; comp.knee.value = 12; comp.ratio.value = 6;
  master = ctx.createGain(); master.gain.value = 0; master.connect(comp).connect(ctx.destination);
  music = ctx.createGain(); music.gain.value = vol.music / 100; music.connect(master);
  fx = ctx.createGain(); fx.gain.value = vol.effects / 100; fx.connect(master);
  const len = Math.floor(ctx.sampleRate * (phone ? 3 : 7)), ir = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let c = 0; c < 2; c++) { const d = ir.getChannelData(c); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len) ** 3; }
  verb = ctx.createConvolver(); verb.buffer = ir;
  const wet = ctx.createGain(); wet.gain.value = 0.8; verb.connect(wet).connect(music);
  fverb = ctx.createConvolver(); fverb.buffer = ir;   // the stings' own reverb, so they follow the effects volume
  const fwet = ctx.createGain(); fwet.gain.value = 0.8; fverb.connect(fwet).connect(fx);
  echo = ctx.createDelay(1); echo.delayTime.value = STEP * 3;     // dotted-eighth echo for the music box
  const fb = ctx.createGain(); fb.gain.value = 0.55; const tone = ctx.createBiquadFilter(); tone.frequency.value = 1800;
  echo.connect(tone).connect(fb).connect(echo); tone.connect(music); tone.connect(verb);
  padBus = ctx.createBiquadFilter(); padBus.type = "lowpass"; padBus.Q.value = 2; padBus.frequency.value = 700;
  const lfo = ctx.createOscillator(), ld = ctx.createGain(); lfo.frequency.value = 1 / (STEP * 16 * 8); ld.gain.value = 350;
  lfo.connect(ld).connect(padBus.frequency); lfo.start();
  const pg = ctx.createGain(); pg.gain.value = 0.55; padBus.connect(pg); pg.connect(music); pg.connect(verb);
  noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
  const nd = noiseBuf.getChannelData(0); for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
  // cold wind: looping noise through a slowly wandering band-pass
  const wind = ctx.createBufferSource(), bp = ctx.createBiquadFilter(), wg = ctx.createGain(), sw = ctx.createOscillator(), sd = ctx.createGain();
  wind.buffer = noiseBuf; wind.loop = true; bp.type = "bandpass"; bp.Q.value = 7; bp.frequency.value = 450; wg.gain.value = 0.07;
  sw.frequency.value = 0.04; sd.gain.value = 300; sw.connect(sd).connect(bp.frequency); sw.start();
  wind.connect(bp).connect(wg); wg.connect(music); wg.connect(verb); wind.start();
  // a ghostly tritone shimmer (G sharp over the D minor), breathing in and out
  const sh = ctx.createOscillator(), shg = ctx.createGain(), tr = ctx.createOscillator(), td = ctx.createGain();
  sh.frequency.value = hz(80); shg.gain.value = 0.006; tr.frequency.value = 0.09; td.gain.value = 0.006;
  tr.connect(td).connect(shg.gain); sh.connect(shg).connect(verb); sh.start(); tr.start();
}

function voice(type, freq, t, dur, peak, dest, attack = 0.005, detune = 0) {
  const o = ctx.createOscillator(), g = ctx.createGain();
  o.type = type; o.frequency.value = freq; o.detune.value = detune;
  g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(peak, t + attack); g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
  o.connect(g).connect(dest); o.start(t); o.stop(t + dur + 0.05); return o;
}
function noise(t, dur, peak, type, freq, dest) {
  const s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
  s.buffer = noiseBuf; f.type = type; f.frequency.value = freq;
  g.gain.setValueAtTime(peak, t); g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
  s.connect(f).connect(g).connect(dest); s.start(t); s.stop(t + dur + 0.05);
}

function play(s, t) {
  const bar = Math.floor(s / 16) % 16, i = s % 16, [root, tones] = CHORDS[bar % 8], second = bar >= 8;
  if (i === 0) for (const m of tones) for (const d of [-8, 7]) voice("sawtooth", hz(m - 12), t, STEP * 16 + 0.6, 0.02, padBus, 0.8, d);
  if (i in BASS_HITS) {   // sub sine plus a quiet octave triangle so the bass reads on phone speakers
    voice("sine", hz(root), t, STEP * 7, 0.45 * BASS_HITS[i], music, 0.04);
    voice("triangle", hz(root + 12), t, STEP * 5, 0.06 * BASS_HITS[i], music, 0.04);
  }
  if (i === 0 || i === 2) {   // heartbeat: a slow lub-dub
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.frequency.setValueAtTime(110, t); o.frequency.exponentialRampToValueAtTime(40, t + 0.16);
    g.gain.setValueAtTime(i ? 0.35 : 0.6, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.38);
    o.connect(g).connect(music); o.start(t); o.stop(t + 0.42);
  }
  if (i === 8 && bar % 2) noise(t, 0.3, 0.08, "bandpass", 1300, verb);   // a distant knock, every other bar
  if (i % 4 === 0) {   // warped music box: one note per beat, slightly out of tune
    const m = tones[ARP[i / 4]] + 12;
    voice("sine", hz(m), t, 1.6, 0.06, echo, 0.005, Math.random() * 24 - 12);
    voice("sine", hz(m) * 3.01, t, 0.3, 0.012, echo);
    voice("sine", hz(m), t, 1.6, 0.03, music);
  }
  if (second && i % 4 === 0) {   // whistled melody: soft square, vibrato, low-passed
    const m = MELODY[bar % 8][i / 4];
    if (m !== null) {
      const o = ctx.createOscillator(), f = ctx.createBiquadFilter(), g = ctx.createGain(), vib = ctx.createOscillator(), vd = ctx.createGain();
      o.type = "square"; o.frequency.value = hz(m); f.type = "lowpass"; f.frequency.value = 1400;
      vib.frequency.value = 3.6; vd.gain.value = 14;
      o.detune.setValueAtTime(0, t + STEP * 2.5); o.detune.linearRampToValueAtTime(-45, t + STEP * 4);   // each note sags at the end vib.connect(vd).connect(o.detune);
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.05, t + 0.06); g.gain.setValueAtTime(0.05, t + STEP * 3); g.gain.linearRampToValueAtTime(0, t + STEP * 4);
      o.connect(f).connect(g); g.connect(music); g.connect(verb);
      o.start(t); vib.start(t); o.stop(t + STEP * 4 + 0.05); vib.stop(t + STEP * 4 + 0.05);
    }
  }
}

function scheduler() {
  if (ctx.state !== "running") return;   // nothing to schedule until the first tap lets sound play
  if (nextTime < ctx.currentTime) nextTime = ctx.currentTime + 0.05;   // never schedule in the past after a stall
  while (nextTime < ctx.currentTime + 1.2) { play(step, nextTime); step++; nextTime += STEP; }
}

function start() {
  if (started || !soundOn()) return;
  if (!ctx) setup();
  started = true;
  nextTime = ctx.currentTime + 0.1; step = 0;
  setInterval(scheduler, 250);
  master.gain.setValueAtTime(0, ctx.currentTime); master.gain.linearRampToValueAtTime(level(), ctx.currentTime + 3);
  ctx.resume().catch(() => {});
}

// Applies { master, music, effects, muted } (0 to 100 each, muted a boolean); missing fields keep their value.
export function applyAudio(a = {}) {
  vol = { ...vol, ...a };
  if (!ctx) { start(); return; }
  const t = ctx.currentTime;
  music.gain.setTargetAtTime(vol.music / 100, t, 0.05);
  fx.gain.setTargetAtTime(vol.effects / 100, t, 0.05);
  master.gain.cancelScheduledValues(t); master.gain.setValueAtTime(master.gain.value, t); master.gain.linearRampToValueAtTime(level(), t + (soundOn() ? 0.4 : 0.3));
  if (soundOn()) { start(); ctx.resume().catch(() => {}); }
}
// The quick mute on the HUD: the same switch as "Mute everything" in the settings.
export function setSound(on) { setSetting("audio.muted", !on); }

// Scene stings, synthesised like the music (no audio files). They play through the effects bus.
const SFX = {
  knock(t) { for (const d of [0, 0.22]) { noise(t + d, 0.09, 0.5, "lowpass", 380, fx); voice("triangle", 110, t + d, 0.12, 0.25, fx); } },
  kill(t) {
    SFX.knock(t);
    voice("square", hz(38), t + 0.7, 0.9, 0.16, fx); voice("sawtooth", hz(39), t + 0.7, 0.9, 0.1, fverb);
    noise(t + 0.7, 0.5, 0.45, "lowpass", 900, fx); voice("sine", hz(26), t + 0.7, 1.4, 0.4, fx, 0.01);
  },
  save(t) {
    const o = voice("sine", hz(72), t, 1.1, 0.14, fverb, 0.05); o.frequency.exponentialRampToValueAtTime(hz(96), t + 0.9);
    [84, 88, 91, 96].forEach((m, i) => voice("triangle", hz(m), t + 0.15 + i * 0.09, 0.5, 0.08, fverb));
    noise(t + 1.0, 0.12, 0.25, "highpass", 2500, fx);
  },
  peek(t) {
    [76, 79, 76, 81].forEach((m, i) => voice("triangle", hz(m), t + i * 0.28, 0.12, 0.08, fx));
    noise(t + 1.5, 0.18, 0.6, "lowpass", 500, fx); voice("square", hz(43), t + 1.5, 0.25, 0.14, fx);
  },
  shot(t) { const o = voice("square", 900, t, 0.25, 0.08, fx); o.frequency.exponentialRampToValueAtTime(220, t + 0.25); noise(t + 0.3, 0.15, 0.4, "bandpass", 1800, fx); },
  dream(t) { [74, 77, 81, 77, 74, 72].forEach((m, i) => voice("sine", hz(m), t + i * 0.42, 0.9, 0.05, fverb, 0.08)); },
  night(t) { [62, 57, 50].forEach((m, i) => voice("sine", hz(m), t + i * 0.5, 2.4, 0.09, fverb, 0.02)); noise(t, 2.5, 0.08, "bandpass", 500, fverb); },
  dawn(t) {
    [62, 66, 69, 74, 78].forEach((m, i) => voice("triangle", hz(m), t + i * 0.12, 1.3, 0.07, fverb, 0.01));
    for (let i = 0; i < 3; i++) { const o = voice("sine", hz(93), t + 0.9 + i * 0.25, 0.09, 0.04, fx); o.frequency.exponentialRampToValueAtTime(hz(100), t + 0.99 + i * 0.25); }
  },
  trial(t) { for (const d of [0, 0.32]) { noise(t + d, 0.1, 0.7, "lowpass", 600, fx); voice("triangle", 150, t + d, 0.1, 0.3, fx); } for (let i = 0; i < 14; i++) noise(t + 0.8 + i * 0.06, 0.05, 0.12 + i * 0.012, "bandpass", 300, fx); },
  exile(t) { const o = voice("sine", hz(84), t, 1.4, 0.1, fx, 0.02); o.frequency.exponentialRampToValueAtTime(hz(55), t + 1.4); noise(t, 1.2, 0.2, "bandpass", 900, fverb); },
  victory(t) { [62, 66, 69, 74, 69, 74, 78].forEach((m, i) => { voice("square", hz(m), t + i * 0.14, 0.3, 0.05, fx); voice("triangle", hz(m - 12), t + i * 0.14, 0.4, 0.06, fverb); }); },
  rattle(t) {
    for (let i = 0; i < 4; i++) noise(t + i * 0.32, 0.12, 0.22, "lowpass", 260, fx);
    for (let i = 0; i < 3; i++) { noise(t + 1.5 + i * 0.17, 0.07, 0.4, "lowpass", 700, fx); voice("triangle", 140, t + 1.5 + i * 0.17, 0.06, 0.12, fx); }
  },
  bubble(t) { const o = voice("sine", hz(84), t, 0.08, 0.06, fx); o.frequency.exponentialRampToValueAtTime(hz(91), t + 0.08); },
  emote(t) { voice("triangle", hz(79), t, 0.1, 0.07, fx); voice("triangle", hz(86), t + 0.07, 0.12, 0.06, fx); },
};
export function sfx(name) {
  if (!soundOn() || !ctx || ctx.state !== "running" || !SFX[name]) return;
  SFX[name](ctx.currentTime + 0.02);
}

// subtle UI click: a soft, low wooden tick
export function click() {
  if (!soundOn() || !ctx || ctx.state !== "running") return;
  const t = ctx.currentTime, o = ctx.createOscillator(), g = ctx.createGain(), f = ctx.createBiquadFilter();
  o.type = "triangle"; o.frequency.setValueAtTime(520, t); o.frequency.exponentialRampToValueAtTime(260, t + 0.06);
  f.type = "lowpass"; f.frequency.value = 1800;
  g.gain.setValueAtTime(0.12, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.09);
  o.connect(f).connect(g).connect(fx); o.start(t); o.stop(t + 0.1);
}

// Music starts on load. Browsers that block sound until the visitor interacts keep the context
// suspended; it then resumes on the very first tap, click or key press anywhere on the page.
let relabel = () => {};
onChange(({ path, settings }) => { if (path === "*" || path.startsWith("audio")) { applyAudio(settings.audio); relabel(); } });
export function initSound(toggle) {
  const label = relabel = () => {
    if (!toggle) return;
    const on = soundOn();
    toggle.setAttribute("aria-label", on ? "Mute sound" : "Turn sound on"); toggle.setAttribute("aria-pressed", String(on));
    // both looks in one picture, CSS shows the one in use (.art-lo, .art-hi). Low is an 8 x 8 pixel speaker at 3px a pixel:
    // a 2 x 2 back, a cone flaring to full height, then two waves (on) or an X (muted). High is the same, smooth.
    const lo = "M3 0h1v1h-1zM2 1h2v2h-2zM0 3h4v2h-4zM2 5h2v2h-2zM3 7h1v1h-1z" + (on
      ? "M6 0h1v1h-1zM7 1h1v6h-1zM5 2h1v4h-1zM6 7h1v1h-1z"
      : "M5 2h1v1h-1zM7 2h1v1h-1zM6 3h1v2h-1zM5 5h1v1h-1zM7 5h1v1h-1z");
    toggle.innerHTML = `<svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor" aria-hidden="true">
      <g class="art-lo" shape-rendering="crispEdges" transform="scale(3)"><path d="${lo}"/></g>
      <g class="art-hi"><path d="M3 9.5h3.5L12 4.6v14.8L6.5 14.5H3z" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/><path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" d="${on ? "M15.5 9a4 4 0 0 1 0 6M18.5 6a8.5 8.5 0 0 1 0 12" : "M16 9l6 6M22 9l-6 6"}"/></g></svg>`;
  };
  label();
  toggle?.addEventListener("click", (e) => { e.stopPropagation(); setSound(!soundOn()); });
  start();
  const evs = ["pointerdown", "keydown", "touchend"];
  const wake = () => {
    if (soundOn()) { start(); ctx?.resume(); }
    if (ctx?.state === "running") evs.forEach((ev) => removeEventListener(ev, wake, true));
  };
  evs.forEach((ev) => addEventListener(ev, wake, true));
  document.addEventListener("click", (e) => { if (e.target.closest("button:not(:disabled), a, .mode, .option, .pcard")) click(); }, true);
}
