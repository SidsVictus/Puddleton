// Puddleton theme: a composed 16-bar loop in D minor at 58 BPM, synthesized live with the Web Audio API.
// Fully original (no samples, no files), so there is nothing to license.
// Form: chords D minor, Bb, G minor, A | A, G minor, Bb, D minor (a palindrome), played twice.
// Pass 1 is music box + bass + drums; pass 2 adds the whistled melody, whose last bar mirrors its first.
const KEY = "pad-sound", BPM = 58, STEP = 60 / BPM / 4;
const hz = (m) => 440 * 2 ** ((m - 69) / 12);
export const soundOn = () => localStorage.getItem(KEY) !== "off";

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

let ctx, master, verb, echo, padBus, noiseBuf, started = false, step = 0, nextTime = 0;

function setup() {
  ctx = new (window.AudioContext || window.webkitAudioContext)();
  const comp = ctx.createDynamicsCompressor(); comp.threshold.value = -16; comp.ratio.value = 4;
  master = ctx.createGain(); master.gain.value = 0; master.connect(comp).connect(ctx.destination);
  const len = ctx.sampleRate * 7, ir = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let c = 0; c < 2; c++) { const d = ir.getChannelData(c); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len) ** 3; }
  verb = ctx.createConvolver(); verb.buffer = ir;
  const wet = ctx.createGain(); wet.gain.value = 0.8; verb.connect(wet).connect(master);
  echo = ctx.createDelay(1); echo.delayTime.value = STEP * 3;     // dotted-eighth echo for the music box
  const fb = ctx.createGain(); fb.gain.value = 0.55; const tone = ctx.createBiquadFilter(); tone.frequency.value = 1800;
  echo.connect(tone).connect(fb).connect(echo); tone.connect(master); tone.connect(verb);
  padBus = ctx.createBiquadFilter(); padBus.type = "lowpass"; padBus.Q.value = 2; padBus.frequency.value = 700;
  const lfo = ctx.createOscillator(), ld = ctx.createGain(); lfo.frequency.value = 1 / (STEP * 16 * 8); ld.gain.value = 350;
  lfo.connect(ld).connect(padBus.frequency); lfo.start();
  const pg = ctx.createGain(); pg.gain.value = 0.55; padBus.connect(pg); pg.connect(master); pg.connect(verb);
  noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
  const nd = noiseBuf.getChannelData(0); for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
  // cold wind: looping noise through a slowly wandering band-pass
  const wind = ctx.createBufferSource(), bp = ctx.createBiquadFilter(), wg = ctx.createGain(), sw = ctx.createOscillator(), sd = ctx.createGain();
  wind.buffer = noiseBuf; wind.loop = true; bp.type = "bandpass"; bp.Q.value = 7; bp.frequency.value = 450; wg.gain.value = 0.07;
  sw.frequency.value = 0.04; sd.gain.value = 300; sw.connect(sd).connect(bp.frequency); sw.start();
  wind.connect(bp).connect(wg); wg.connect(master); wg.connect(verb); wind.start();
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
    voice("sine", hz(root), t, STEP * 7, 0.45 * BASS_HITS[i], master, 0.04);
    voice("triangle", hz(root + 12), t, STEP * 5, 0.06 * BASS_HITS[i], master, 0.04);
  }
  if (i === 0 || i === 2) {   // heartbeat: a slow lub-dub
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.frequency.setValueAtTime(110, t); o.frequency.exponentialRampToValueAtTime(40, t + 0.16);
    g.gain.setValueAtTime(i ? 0.35 : 0.6, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.38);
    o.connect(g).connect(master); o.start(t); o.stop(t + 0.42);
  }
  if (i === 8 && bar % 2) noise(t, 0.3, 0.08, "bandpass", 1300, verb);   // a distant knock, every other bar
  if (i % 4 === 0) {   // warped music box: one note per beat, slightly out of tune
    const m = tones[ARP[i / 4]] + 12;
    voice("sine", hz(m), t, 1.6, 0.06, echo, 0.005, Math.random() * 24 - 12);
    voice("sine", hz(m) * 3.01, t, 0.3, 0.012, echo);
    voice("sine", hz(m), t, 1.6, 0.03, master);
  }
  if (second && i % 4 === 0) {   // whistled melody: soft square, vibrato, low-passed
    const m = MELODY[bar % 8][i / 4];
    if (m !== null) {
      const o = ctx.createOscillator(), f = ctx.createBiquadFilter(), g = ctx.createGain(), vib = ctx.createOscillator(), vd = ctx.createGain();
      o.type = "square"; o.frequency.value = hz(m); f.type = "lowpass"; f.frequency.value = 1400;
      vib.frequency.value = 3.6; vd.gain.value = 14;
      o.detune.setValueAtTime(0, t + STEP * 2.5); o.detune.linearRampToValueAtTime(-45, t + STEP * 4);   // each note sags at the end vib.connect(vd).connect(o.detune);
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.05, t + 0.06); g.gain.setValueAtTime(0.05, t + STEP * 3); g.gain.linearRampToValueAtTime(0, t + STEP * 4);
      o.connect(f).connect(g); g.connect(master); g.connect(verb);
      o.start(t); vib.start(t); o.stop(t + STEP * 4 + 0.05); vib.stop(t + STEP * 4 + 0.05);
    }
  }
}

function scheduler() {
  while (nextTime < ctx.currentTime + 0.25) { play(step, nextTime); step++; nextTime += STEP; }
}

function start() {
  if (started || !soundOn()) return;
  if (!ctx) setup();
  started = true;
  nextTime = ctx.currentTime + 0.1; step = 0;
  setInterval(scheduler, 50);
  master.gain.setValueAtTime(0, ctx.currentTime); master.gain.linearRampToValueAtTime(0.85, ctx.currentTime + 3);
  ctx.resume().catch(() => {});
}

export function setSound(on) {
  localStorage.setItem(KEY, on ? "on" : "off");
  if (on) { start(); ctx.resume(); master.gain.cancelScheduledValues(ctx.currentTime); master.gain.linearRampToValueAtTime(0.85, ctx.currentTime + 1); }
  else if (master) { master.gain.cancelScheduledValues(ctx.currentTime); master.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.6); }
}

// subtle UI click: a soft, low wooden tick
export function click() {
  if (!soundOn() || !ctx || ctx.state !== "running") return;
  const t = ctx.currentTime, o = ctx.createOscillator(), g = ctx.createGain(), f = ctx.createBiquadFilter();
  o.type = "triangle"; o.frequency.setValueAtTime(520, t); o.frequency.exponentialRampToValueAtTime(260, t + 0.06);
  f.type = "lowpass"; f.frequency.value = 1800;
  g.gain.setValueAtTime(0.12, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.09);
  o.connect(f).connect(g).connect(ctx.destination); o.start(t); o.stop(t + 0.1);
}

// Music starts on load. Browsers that block sound until the visitor interacts keep the context
// suspended; it then resumes on the very first tap, click or key press anywhere on the page.
export function initSound(toggle) {
  const label = () => {
    if (!toggle) return;
    const on = soundOn();
    toggle.setAttribute("aria-label", on ? "Mute sound" : "Turn sound on"); toggle.setAttribute("aria-pressed", String(on));
    toggle.innerHTML = `<svg viewBox="0 0 16 16" width="24" height="24" shape-rendering="crispEdges" fill="currentColor" aria-hidden="true">
      <rect x="1" y="6" width="3" height="4"/><rect x="4" y="5" width="1" height="6"/><rect x="5" y="4" width="1" height="8"/><rect x="6" y="3" width="1" height="10"/><rect x="7" y="2" width="1" height="12"/>${on
      ? '<rect x="10" y="6" width="1" height="4"/><rect x="12" y="4" width="1" height="2"/><rect x="13" y="6" width="1" height="4"/><rect x="12" y="10" width="1" height="2"/>'
      : '<rect x="10" y="5" width="1" height="1"/><rect x="11" y="6" width="1" height="1"/><rect x="12" y="7" width="2" height="2"/><rect x="14" y="9" width="1" height="1"/><rect x="15" y="10" width="1" height="1"/><rect x="14" y="6" width="1" height="1"/><rect x="15" y="5" width="1" height="1"/><rect x="11" y="9" width="1" height="1"/><rect x="10" y="10" width="1" height="1"/>'}</svg>`;
  };
  label();
  toggle?.addEventListener("click", (e) => { e.stopPropagation(); setSound(!soundOn()); label(); });
  start();
  const evs = ["pointerdown", "keydown", "touchend"];
  const wake = () => {
    if (soundOn()) { start(); ctx?.resume(); }
    if (ctx?.state === "running") evs.forEach((ev) => removeEventListener(ev, wake, true));
  };
  evs.forEach((ev) => addEventListener(ev, wake, true));
  document.addEventListener("click", (e) => { if (e.target.closest("button:not(:disabled), a, .mode, .option, .pcard")) click(); }, true);
}
