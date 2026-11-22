// The live stage: a close-up toy town where the beans live, walk, chat, and where every night action plays out
// as a short cutscene. Rendered smooth at the screen's own resolution, or in square pixels in the Low picture quality
// (see sharpness() in world.mjs).
// See STAGE.md for the API.
import * as THREE from "three";
import { makeBean, portrait, sharpness } from "./world.mjs";
import { kit, animate, cleanLook, DEFAULT_LOOK, bodyColors, buildHouse, buildProp, buildTomb, iconCanvas, smoothIcon, pixelPass, HEADS, PACKS, BODIES, HOUSES, wearsHat } from "./cosmetics.mjs";
import { quality, onQuality } from "./quality.mjs";

const { toon, flat, mesh, box, cyl, cone, ball, dome, turn, squash } = kit;
const PI = Math.PI, TAU = PI * 2;
const rnd = (a = 1, b) => (b === undefined ? Math.random() * a : a + Math.random() * (b - a));
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const E = {
  lin: (k) => k, in: (k) => k * k, in3: (k) => k * k * k, out: (k) => 1 - (1 - k) * (1 - k), out3: (k) => 1 - (1 - k) ** 3,
  io: (k) => (k < 0.5 ? 2 * k * k : 1 - (-2 * k + 2) ** 2 / 2),
  back: (k) => 1 + 2.7 * (k - 1) ** 3 + 1.7 * (k - 1) ** 2,
  bounce: (k) => { const n = 7.5625, d = 2.75; return k < 1 / d ? n * k * k : k < 2 / d ? n * (k -= 1.5 / d) * k + 0.75 : k < 2.5 / d ? n * (k -= 2.25 / d) * k + 0.9375 : n * (k -= 2.625 / d) * k + 0.984375; },
};

// Sky, light and glass colours for each phase; the stage eases between them.
const PHASES = {
  night: { sky: ["#070620", "#1d1650", "#3f2a74"], hs: "#a79dff", hg: "#2a1a4a", hi: 1.25, sc: "#b4bcff", si: 1.1, cloud: "#3b3470", star: 1, lamp: 1, orb: "#fff3c8", oy: 0.5, glass: "#2a2548" },
  dawn: { sky: ["#2b3a8c", "#c86a8a", "#ffc38a"], hs: "#ffd9c8", hg: "#5a3a6a", hi: 1.5, sc: "#ffcfa0", si: 1.5, cloud: "#ffd0c2", star: 0.15, lamp: 0.3, orb: "#ffb46a", oy: 0.1, glass: "#6b5a8a" },
  day: { sky: ["#2f7fe0", "#7cc4ff", "#d8f2ff"], hs: "#ffffff", hg: "#7a6aa8", hi: 1.75, sc: "#fff4dc", si: 1.9, cloud: "#ffffff", star: 0, lamp: 0, orb: "#fff7b0", oy: 0.55, glass: "#8fc8ee" },
  trial: { sky: ["#1c1440", "#6a2f6a", "#d0706a"], hs: "#ffc8b0", hg: "#3a2050", hi: 1.25, sc: "#ffb088", si: 1.3, cloud: "#c87a8a", star: 0.3, lamp: 0.8, orb: "#ff8a5a", oy: 0.08, glass: "#5a4a7a" },
  ended: { sky: ["#3a2a8c", "#e87aa8", "#ffe0a0"], hs: "#fff0d8", hg: "#6a4a8a", hi: 1.7, sc: "#ffe0b0", si: 1.7, cloud: "#ffe0d0", star: 0.2, lamp: 0.6, orb: "#ffe08a", oy: 0.25, glass: "#8a7aa8" },
};

// Particle looks. c: colours, sp: speed range, up: upward kick, g: gravity, s: size range (world units), ttl: life range, drag, grow: size change per second, sway.
const KINDS = {
  spark: { c: ["#fff7c2", "#ffd84a", "#ff9d3c", "#ffffff"], sp: [2.2, 5.5], up: 2.2, g: -10, s: [0.06, 0.11], ttl: [0.25, 0.55], drag: 1 },
  dust: { c: ["#d9cdb8", "#bfb39c", "#efe6d2"], sp: [0.3, 1.2], up: 0.7, g: 0.5, s: [0.1, 0.2], ttl: [0.35, 0.8], drag: 2.5, grow: -0.12 },
  smoke: { c: ["#6b6680", "#8d879c", "#4a4560"], sp: [0.2, 0.9], up: 1.3, g: 1, s: [0.16, 0.3], ttl: [0.7, 1.3], drag: 1.6, grow: 0.22 },
  cloud: { c: ["#ffffff", "#f1ecff", "#dcd4f6"], sp: [0.3, 1.4], up: 0.8, g: 0.3, s: [0.2, 0.38], ttl: [0.6, 1.2], drag: 2, grow: 0.1 },
  confetti: { c: ["#ff5d8f", "#ffe14a", "#7cc8ff", "#7dffd0", "#c9a0ff", "#ff9d3c", "#ffffff"], sp: [1.8, 5.5], up: 4.6, g: -5.5, s: [0.08, 0.13], ttl: [1.2, 2.3], drag: 1.7, sway: 3 },
  feather: { c: ["#ffffff", "#ece8ff", "#ffe6f2"], sp: [0.5, 1.8], up: 1.6, g: -1.2, s: [0.09, 0.14], ttl: [1.3, 2.4], drag: 2.4, sway: 2.2 },
  magic: { c: ["#ffffff", "#9be7ff", "#d8f6ff", "#ffe9a0"], sp: [0.3, 1.5], up: 1.2, g: 0.6, s: [0.05, 0.1], ttl: [0.5, 1.2], drag: 1.6 },
  splat: { c: ["#ff9db5"], sp: [1.5, 4.8], up: 3.2, g: -11, s: [0.1, 0.2], ttl: [0.5, 1.0], drag: 0.8 },
  water: { c: ["#7cc8ff", "#bfe6ff", "#ffffff", "#4f9dff"], sp: [1.2, 3.6], up: 3.4, g: -11, s: [0.07, 0.13], ttl: [0.4, 0.9], drag: 0.6 },
  petal: { c: ["#ff9db5", "#ffe14a", "#ffffff", "#cdb4ff", "#ffb3d9"], sp: [0.8, 2.6], up: 2.6, g: -2, s: [0.08, 0.13], ttl: [1.1, 2], drag: 2, sway: 2.6 },
  shard: { c: ["#7de8ff", "#ff7ad9", "#f4f1ff", "#4f9dff"], sp: [2, 5.5], up: 3, g: -8, s: [0.09, 0.16], ttl: [0.5, 1.1], drag: 1 },
  fire: { c: ["#ffe14a", "#ff9d3c", "#ff5d3c", "#ffffff"], sp: [1.5, 5], up: 2.5, g: 2, s: [0.12, 0.26], ttl: [0.25, 0.6], drag: 2.4, grow: -0.2 },
  bee: { c: ["#ffe14a", "#1c1330", "#ffcf3f"], sp: [1.5, 4], up: 0.6, g: 0, s: [0.06, 0.09], ttl: [0.25, 0.5], drag: 0.5, sway: 9 },
  firefly: { c: ["#f6ff8a", "#c8ff6a", "#fff7c2"], sp: [0.1, 0.4], up: 0.25, g: 0, s: [0.05, 0.08], ttl: [1.6, 3], drag: 0.3, sway: 1.6 },
  keys: { c: ["#ffffff", "#1c1330", "#ffffff", "#ffe14a"], sp: [2, 5.5], up: 4, g: -10, s: [0.08, 0.14], ttl: [0.6, 1.1], drag: 0.8 },
};
for (const k of Object.values(KINDS)) k.c = k.c.map((c) => new THREE.Color(c));
const MAXP = 720;

const CSS = `
.stg-ui{position:absolute;left:0;top:0;width:100%;height:100%;overflow:hidden;pointer-events:none;user-select:none;-webkit-user-select:none;font-family:"Jersey 20","Courier New",monospace;z-index:2}
.stg-ui *{box-sizing:border-box}
.stg-flash,.stg-fade{position:absolute;left:0;top:0;width:100%;height:100%;opacity:0}
.stg-fade{background:#05030f}
.stg-bar{position:absolute;left:0;right:0;height:8%;background:#05030f;transition:transform .32s steps(6)}
.stg-bar.t{top:0;transform:translateY(-102%)}.stg-bar.b{bottom:0;transform:translateY(102%)}
.stg-ui.cine .stg-bar{transform:none}
.stg-cap{position:absolute;left:5%;right:5%;bottom:12%;text-align:center;color:#fff6dc;font-size:clamp(24px,5.4vmin,46px);line-height:1;letter-spacing:.5px;
 text-shadow:2px 0 0 #1c1330,-2px 0 0 #1c1330,0 2px 0 #1c1330,0 -2px 0 #1c1330,2px 2px 0 #1c1330,-2px 2px 0 #1c1330,2px -2px 0 #1c1330,-2px -2px 0 #1c1330,0 5px 0 #1c1330;
 opacity:0;transform:translateY(10px);transition:opacity .18s steps(3),transform .18s steps(3)}
.stg-cap.on{opacity:1;transform:none}
.stg-snd{position:absolute;left:8px;top:8px;max-width:70%;padding:3px 8px 4px;background:rgba(10,8,32,.86);box-shadow:0 0 0 2px #06041a;color:#fff6dc;font:700 13px/1.3 "DM Sans",system-ui,sans-serif;font-style:italic;opacity:0;transition:opacity .2s;pointer-events:none;z-index:4}
.stg-snd.on{opacity:1}
.stg-bub{position:absolute;left:0;top:0;max-width:min(240px,58%);padding:4px 9px 6px;background:#fffdf4;color:#1c1330;font-size:clamp(19px,2.7vmin,28px);line-height:1;letter-spacing:.3px;
 border:2px solid #1c1330;box-shadow:3px 3px 0 rgba(28,19,48,.4);visibility:hidden;overflow-wrap:anywhere;will-change:transform}
.stg-bub::after{content:"";position:absolute;left:50%;bottom:-7px;width:10px;height:10px;margin-left:-5px;background:#fffdf4;border:2px solid #1c1330;border-left:0;border-top:0;transform:rotate(45deg)}
.stg-bub.on{visibility:visible;animation:stg-pop .16s steps(4)}
@keyframes stg-pop{from{opacity:0;margin-top:8px}to{opacity:1;margin-top:0}}
.stg-desk{position:absolute;left:50%;top:50%;width:0;height:0}
.stg-file{position:absolute;left:0;top:0;width:300px;height:360px;margin:0;transform:translate(-50%,-50%) rotate(-4deg);visibility:hidden}
.stg-file.on{visibility:visible;animation:stg-slam .24s steps(5) both}
@keyframes stg-slam{from{transform:translate(-50%,-150%) rotate(18deg) scale(2.4);opacity:0}to{transform:translate(-50%,-50%) rotate(-4deg) scale(1);opacity:1}}
.stg-folder{position:absolute;left:0;top:7%;width:100%;height:93%;background:#e9c88a;border:3px solid #1c1330;box-shadow:6px 6px 0 rgba(10,6,24,.55)}
.stg-tab{position:absolute;left:8%;top:0;width:38%;height:9%;background:#e9c88a;border:3px solid #1c1330;border-bottom:0;font-size:15px;color:#6b4326;text-align:center;line-height:1.3}
.stg-paper{position:absolute;left:7%;right:7%;top:8%;bottom:6%;background:#fffaf0;border:3px solid #1c1330}
.stg-paper h4{margin:6% 0 0;text-align:center;font-size:30px;font-weight:400;color:#1c1330;letter-spacing:2px}
.stg-photo{display:block;width:46%;margin:3% auto 0;aspect-ratio:1;background:#cfe3ff;border:3px solid #1c1330;image-rendering:auto;object-fit:cover}
html[data-quality="low"] .stg-photo{image-rendering:pixelated}
.stg-line{height:3px;margin:6% 12% 0;background:#c9bfae}
.stg-line.s{margin-right:40%}
.stg-clip{position:absolute;left:50%;top:3%;width:22%;height:7%;margin-left:-11%;background:#a8b0c0;border:3px solid #1c1330}
.stg-stamp{position:absolute;left:50%;top:60%;padding:2px 12px 4px;border:5px solid currentColor;font-size:50px;letter-spacing:3px;line-height:1;white-space:nowrap;
 transform:translate(-50%,-50%) rotate(-13deg);visibility:hidden;background:rgba(255,250,240,.82)}
.stg-stamp.on{visibility:visible;animation:stg-stamp .16s steps(4) both}
.stg-stamp.mafia{color:#d81f3f}.stg-stamp.innocent{color:#1f9a4d}
@keyframes stg-stamp{from{transform:translate(-50%,-50%) rotate(-13deg) scale(3.2);opacity:0}to{transform:translate(-50%,-50%) rotate(-13deg) scale(1);opacity:1}}
`;

// Merges every still mesh under root into one mesh per material (fewer draw calls). Meshes under a "keep" object stay as they are.
function bake(root, keep = []) {
  root.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(root.matrixWorld).invert(), m4 = new THREE.Matrix4(), groups = new Map(), dead = [];
  root.traverse((o) => {
    if (!o.isMesh || o.material.map || o.material.transparent) return;
    for (let p = o; p && p !== root; p = p.parent) if (keep.includes(p)) return;
    const g = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone(); g.applyMatrix4(m4.multiplyMatrices(inv, o.matrixWorld));
    if (!groups.has(o.material)) groups.set(o.material, []);
    groups.get(o.material).push(g); dead.push(o);
  });
  for (const o of dead) { o.parent.remove(o); o.geometry.dispose(); }
  for (const [mat, list] of groups) {
    let n = 0; for (const g of list) n += g.attributes.position.count;
    const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), col = mat.vertexColors ? new Float32Array(n * 3) : null; let off = 0;
    for (const g of list) {
      pos.set(g.attributes.position.array, off); nor.set(g.attributes.normal.array, off); if (col && g.attributes.color) col.set(g.attributes.color.array, off);
      off += g.attributes.position.count * 3; g.dispose();
    }
    const geo = new THREE.BufferGeometry(); geo.setAttribute("position", new THREE.BufferAttribute(pos, 3)); geo.setAttribute("normal", new THREE.BufferAttribute(nor, 3));
    if (col) geo.setAttribute("color", new THREE.BufferAttribute(col, 3));
    root.add(new THREE.Mesh(geo, mat));
  }
  return root;
}
// Frees the geometry (and any material flagged as its own) of a throwaway object.
function trash(o) {
  o.parent?.remove(o);
  o.traverse((m) => { if (m.geometry && !m.geometry.userData.shared) m.geometry.dispose(); if (m.material?.userData.own) { m.material.map?.dispose(); m.material.dispose(); } });
}
// A tiny tiling pixel texture, drawn at runtime. Low keeps its texels square; High smooths them (mipmapped, so far
// ground does not shimmer). Live ones follow a change of picture quality.
const pixelTexs = new Set();
onQuality(() => pixelTexs.forEach(texels));
function texels(t) {
  const low = quality() === "low";
  t.magFilter = low ? THREE.NearestFilter : THREE.LinearFilter; t.minFilter = low ? THREE.NearestFilter : THREE.LinearMipmapLinearFilter;
  t.generateMipmaps = !low; t.needsUpdate = true;
}
function pixelTexture(size, paint, repeat) {
  const c = document.createElement("canvas"); c.width = c.height = size; paint(c.getContext("2d"), size);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; texels(t);
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeat, repeat); }
  pixelTexs.add(t); t.addEventListener("dispose", () => pixelTexs.delete(t));
  return t;
}
const speckle = (base, dots) => (x, n) => {
  x.fillStyle = base; x.fillRect(0, 0, n, n);
  for (const [c, count, w] of dots) { x.fillStyle = c; for (let i = 0; i < count; i++) x.fillRect(Math.floor(Math.random() * n), Math.floor(Math.random() * n), w, 1); }
};
const cobble = (x, n) => {
  x.fillStyle = "#b7a98f"; x.fillRect(0, 0, n, n);
  for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) { x.fillStyle = ["#d8cdb4", "#cfc3a8", "#e2d8c2", "#c9bc9e"][(r * 3 + c * 5) % 4]; x.fillRect(c * 8 + (r % 2 ? 4 : 0) + 1, r * 8 + 1, 6, 6); if (r % 2 && c === 3) x.fillRect(1 - 4, r * 8 + 1, 6, 6); }
};
const shadowMat = new THREE.MeshBasicMaterial({ color: "#0b0818" });
const sootMat = new THREE.MeshBasicMaterial({ color: "#2a2438" });
const boneMat = new THREE.MeshBasicMaterial({ color: "#ffffff" });
const blobGeo = new THREE.CircleGeometry(0.42, 12); blobGeo.rotateX(-PI / 2); blobGeo.userData.shared = true;
const blobMat = new THREE.MeshBasicMaterial({ color: "#0b0818", transparent: true, opacity: 0.28, depthWrite: false });
const ghostMats = new Map();
const ghostMat = (m) => {
  if (!ghostMats.has(m)) { const g = m.clone(); g.transparent = true; g.opacity = 0.5; g.color.lerp(new THREE.Color("#dff2ff"), 0.55); ghostMats.set(m, g); }
  return ghostMats.get(m);
};
const colorCache = {};
const col = (c) => (colorCache[c] ||= new THREE.Color(c));

export function createStage(canvas, options = {}) {
  const opt = { wander: true, onTap: null, ...options };
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" }), sharp = sharpness(), pass = pixelPass(renderer);
  canvas.style.touchAction = "none";
  const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(38, 1, 0.3, 900);
  const v1 = new THREE.Vector3(), v2 = new THREE.Vector3(), v3 = new THREE.Vector3();
  let W = 1, H = 1, tanV = 0.34, tanH = 0.34, disposed = false;

  // ---------- sky, light, weather ----------
  const u = { top: { value: new THREE.Color() }, mid: { value: new THREE.Color() }, low: { value: new THREE.Color() }, dither: { value: 0 } };
  const sky = new THREE.Mesh(new THREE.SphereGeometry(600, 16, 12), new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false, uniforms: u,
    vertexShader: "varying float h; void main(){ h = normalize(position).y; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }",
    fragmentShader: `uniform vec3 top; uniform vec3 mid; uniform vec3 low; uniform float dither; varying float h;
      float b2(vec2 a){ a = floor(a); return fract(a.x / 2.0 + a.y * a.y * 0.75); }
      void main(){ float q = clamp(h * 1.6 + 0.42, 0.0, 1.0);   // High: a smooth blend. Low: 9 bands with an ordered dither between them
        if (dither > 0.5) q = clamp(floor(q * 9.0 + b2(0.5 * gl_FragCoord.xy) * 0.25 + b2(gl_FragCoord.xy)) / 9.0, 0.0, 1.0);
        gl_FragColor = vec4(q < 0.5 ? mix(low, mid, q * 2.0) : mix(mid, top, q * 2.0 - 1.0), 1.0);
        #include <colorspace_fragment>
      }`,
  }));
  const hemi = new THREE.HemisphereLight("#ffffff", "#7a6aa8", 1.7), sun = new THREE.DirectionalLight("#fff4dc", 1.9); sun.position.set(-6, 12, 7);
  const fxLight = new THREE.PointLight("#ffffff", 0, 10, 1.4), spotLight = new THREE.PointLight("#fff0c0", 0, 7, 1.2);
  const orbMat = new THREE.MeshBasicMaterial({ color: "#fff3c8", fog: false, depthWrite: false }), orb = new THREE.Mesh(new THREE.CircleGeometry(26, 20), orbMat);
  const starMats = [0, 1].map(() => new THREE.PointsMaterial({ color: "#ffffff", size: 2, sizeAttenuation: false, fog: false, transparent: true, depthWrite: false }));
  const stars = starMats.map((m) => {
    const p = new Float32Array(360);
    for (let i = 0; i < 360; i += 3) { const a = rnd(TAU), e = rnd(-0.1, 1.4); p[i] = Math.cos(a) * Math.cos(e) * 560; p[i + 1] = Math.sin(e) * 560; p[i + 2] = Math.sin(a) * Math.cos(e) * 560; }
    const g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.BufferAttribute(p, 3));
    const s = new THREE.Points(g, m); s.frustumCulled = false; return s;
  });
  const cloudMat = new THREE.MeshBasicMaterial({ color: "#ffffff" }), clouds = [];
  for (let i = 0; i < 22; i++) {
    const c = new THREE.Group(), high = i >= 16;
    for (let k = 0; k < 3; k++) c.add(mesh(box(rnd(5, 10), rnd(1.2, 2.2), rnd(3, 6)), cloudMat, k * 3.5 - 4, rnd(0.8), rnd(2)));
    bake(c);
    const a = rnd(TAU), r = high ? rnd(70, 130) : rnd(22, 80); c.position.set(Math.cos(a) * r, high ? rnd(16, 40) : rnd(-16, -7), Math.sin(a) * r); c.userData.v = rnd(0.3, 0.9);
    clouds.push(c); scene.add(c);
  }
  scene.add(sky, hemi, sun, fxLight, spotLight, orb, ...stars);
  const env = { top: u.top.value, mid: u.mid.value, low: u.low.value, hs: hemi.color, hg: hemi.groundColor, sc: sun.color, cloud: cloudMat.color, orb: orbMat.color, glass: new THREE.Color(), hi: 1, si: 1, star: 0, lamp: 0, oy: 0.5 };
  let phase = "day", envT = PHASES.day, dim = 1, dimT = 1;
  const lampMat = new THREE.MeshBasicMaterial({ color: "#5a5370" }), glowMat = new THREE.MeshBasicMaterial({ color: "#ffc45a", transparent: true, opacity: 0, depthWrite: false });
  function stepEnv(k) {
    env.top.lerp(col(envT.sky[0]), k); env.mid.lerp(col(envT.sky[1]), k); env.low.lerp(col(envT.sky[2]), k);
    env.hs.lerp(col(envT.hs), k); env.hg.lerp(col(envT.hg), k); env.sc.lerp(col(envT.sc), k); env.cloud.lerp(col(envT.cloud), k); env.orb.lerp(col(envT.orb), k); env.glass.lerp(col(envT.glass), k);
    for (const key of ["hi", "si", "star", "lamp", "oy"]) env[key] += (envT[key] - env[key]) * k;
    dim += (dimT - dim) * Math.min(1, k * 3);
    hemi.intensity = env.hi * dim; sun.intensity = env.si * dim;
    lampMat.color.copy(col("#5a5370")).lerp(col("#ffd070"), env.lamp); glowMat.opacity = env.lamp * 0.42;
  }
  stepEnv(1);

  // ---------- special effects: pooled pixel particles, shock rings, pixel icons ----------
  const pp = new Float32Array(MAXP * 3).fill(-999), pc = new Float32Array(MAXP * 3), ps = new Float32Array(MAXP), pv = new Float32Array(MAXP * 3);
  const pl = new Float32Array(MAXP), pg = new Float32Array(MAXP), pd = new Float32Array(MAXP), pw = new Float32Array(MAXP), py = new Float32Array(MAXP), ph = new Float32Array(MAXP);
  const pGeo = new THREE.BufferGeometry(), pPos = new THREE.BufferAttribute(pp, 3), pCol = new THREE.BufferAttribute(pc, 3), pSize = new THREE.BufferAttribute(ps, 1);
  pPos.setUsage(THREE.DynamicDrawUsage); pSize.setUsage(THREE.DynamicDrawUsage); pCol.setUsage(THREE.DynamicDrawUsage);
  pGeo.setAttribute("position", pPos); pGeo.setAttribute("tint", pCol); pGeo.setAttribute("size", pSize);
  const pMat = new THREE.ShaderMaterial({
    uniforms: { scale: { value: 200 } },
    vertexShader: `attribute float size; attribute vec3 tint; varying vec3 vc; uniform float scale;
      void main(){ vc = tint; vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_Position = size <= 0.0 ? vec4(2.0, 2.0, 2.0, 1.0) : projectionMatrix * mv; gl_PointSize = max(1.0, floor(size * scale / -mv.z + 0.5)); }`,
    fragmentShader: "varying vec3 vc; void main(){ gl_FragColor = vec4(vc, 1.0);\n#include <colorspace_fragment>\n}",
  });
  const points = new THREE.Points(pGeo, pMat); points.frustumCulled = false; scene.add(points);
  let pHead = 0, pLive = 0, skipping = false;
  function emit(x, y, z, vx, vy, vz, c, size, ttl, g, drag, grow, sway) {
    const i = pHead, j = i * 3; pHead = (pHead + 1) % MAXP;
    pp[j] = x; pp[j + 1] = y; pp[j + 2] = z; pv[j] = vx; pv[j + 1] = vy; pv[j + 2] = vz; pc[j] = c.r; pc[j + 1] = c.g; pc[j + 2] = c.b;
    ps[i] = size; pl[i] = ttl; pg[i] = g; pd[i] = drag; pw[i] = grow; py[i] = sway; ph[i] = Math.random() * TAU; pLive = MAXP; pCol.needsUpdate = true;
  }
  // burst("spark", x, y, z, count, { r: spread, c: colour or colours, sp: speed x, up: lift x, s: size x, dx, dy, dz: push, flat: ring on the ground })
  function burst(kind, x, y, z, n = 8, o = null) {
    if (skipping) return;
    const K = KINDS[kind], r = o?.r ?? 0.15, sp = o?.sp ?? 1, up = o?.up ?? 1, sm = o?.s ?? 1, oc = o?.c;
    for (let i = 0; i < n; i++) {
      const a = Math.random() * TAU, v = rnd(K.sp[0], K.sp[1]) * sp, h = o?.flat ? 1 : rnd(0.25, 1);
      const c = oc ? col(typeof oc === "string" ? oc : oc[(Math.random() * oc.length) | 0]) : K.c[(Math.random() * K.c.length) | 0];
      emit(x + rnd(-r, r), y + rnd(-r, r) * (o?.flat ? 0.1 : 1), z + rnd(-r, r), Math.cos(a) * v * h + (o?.dx || 0), K.up * rnd(0.35, 1) * up + (o?.dy || 0), Math.sin(a) * v * h + (o?.dz || 0),
        c, rnd(K.s[0], K.s[1]) * sm, rnd(K.ttl[0], K.ttl[1]), K.g, K.drag, K.grow || 0, K.sway || 0);
    }
  }
  function stepParticles(dt, t) {
    if (!pLive) return;
    let live = 0;
    for (let i = 0, j = 0; i < MAXP; i++, j += 3) {
      if (pl[i] <= 0) continue;
      pl[i] -= dt;
      if (pl[i] <= 0) { ps[i] = 0; continue; }
      live++;
      const d = Math.max(0, 1 - pd[i] * dt);
      pv[j] *= d; pv[j + 2] *= d; pv[j + 1] = pv[j + 1] * d + pg[i] * dt;
      pp[j] += pv[j] * dt + (py[i] ? Math.sin(t * py[i] + ph[i]) * dt * 0.7 : 0); pp[j + 1] += pv[j + 1] * dt; pp[j + 2] += pv[j + 2] * dt;
      if (pg[i] < -3 && pp[j + 1] < 0.04 && pv[j + 1] < 0 && pp[j] * pp[j] + pp[j + 2] * pp[j + 2] < rim * rim) { pp[j + 1] = 0.04; pv[j + 1] *= -0.35; pv[j] *= 0.5; pv[j + 2] *= 0.5; }
      if (pw[i]) ps[i] = Math.max(0.03, ps[i] + pw[i] * dt);
    }
    pLive = live; pPos.needsUpdate = true; pSize.needsUpdate = true;
  }
  const ringGeo = new THREE.RingGeometry(0.8, 1, 24); ringGeo.userData.shared = true;
  const rings = Array.from({ length: 8 }, () => { const m = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, side: THREE.DoubleSide })); m.visible = false; m.userData = { t: 0, dur: 0, r0: 0, r1: 0, up: false }; scene.add(m); return m; });
  let ringHead = 0;
  // An expanding shock ring. Flat on the ground by default; upright rings face the camera.
  function ring(x, y, z, color = "#ffffff", r1 = 2, dur = 0.4, r0 = 0.2, upright = false) {
    if (skipping) return;
    const m = rings[ringHead]; ringHead = (ringHead + 1) % rings.length;
    m.position.set(x, y, z); m.material.color.set(color); m.visible = true; Object.assign(m.userData, { t: 0, dur, r0, r1, up: upright });
    if (!upright) m.rotation.set(-PI / 2, 0, 0);
  }
  const iconTex = {}, iconMap = (n) => (iconTex[(sharp.low ? "low-" : "") + n] ||= sharp.low   // Low: the icon's own 10 x 10 pixels, kept square
    ? Object.assign(new THREE.CanvasTexture(iconCanvas(n)), { colorSpace: THREE.SRGBColorSpace, magFilter: THREE.NearestFilter, minFilter: THREE.NearestFilter, generateMipmaps: false })
    : Object.assign(new THREE.CanvasTexture(smoothIcon(n)), { colorSpace: THREE.SRGBColorSpace }));
  const icons = Array.from({ length: 20 }, () => { const s = new THREE.Sprite(new THREE.SpriteMaterial({ transparent: true, depthTest: false, depthWrite: false })); s.visible = false; s.renderOrder = 9; s.userData = { t: 0, ttl: 0, s: 1, vx: 0, vy: 0, vz: 0, sway: 0 }; scene.add(s); return s; });
  let iconHead = 0;
  // A floating pixel icon (heart, zed, bang, quest, anger, drop, note, star, skull, ha, hand, swirl, arrow).
  function icon(name, x, y, z, o = null) {
    if (skipping) return null;
    const s = icons[iconHead]; iconHead = (iconHead + 1) % icons.length;
    s.material.map = iconMap(name); s.material.opacity = 1; s.material.needsUpdate = true; s.position.set(x, y, z); s.visible = true; s.scale.setScalar(0.01);
    Object.assign(s.userData, { t: 0, ttl: o?.ttl ?? 1, s: o?.s ?? 0.55, vx: o?.vx || 0, vy: o?.vy ?? 0.7, vz: o?.vz || 0, sway: o?.sway || 0 });
    return s;
  }
  function stepFx(dt, t) {
    for (const m of rings) {
      if (!m.visible) continue;
      const d = m.userData; d.t += dt; const k = d.t / d.dur;
      if (k >= 1) { m.visible = false; continue; }
      m.scale.setScalar(d.r0 + (d.r1 - d.r0) * E.out3(k)); m.material.opacity = 1 - k * k; if (d.up) m.quaternion.copy(camera.quaternion);
    }
    for (const s of icons) {
      if (!s.visible) continue;
      const d = s.userData; d.t += dt;
      if (d.t >= d.ttl) { s.visible = false; continue; }
      s.position.x += d.vx * dt + (d.sway ? Math.sin(t * 5 + d.s * 40) * d.sway * dt : 0); s.position.y += d.vy * dt; s.position.z += d.vz * dt;
      s.scale.setScalar(d.s * (d.t < 0.14 ? E.back(d.t / 0.14) : 1)); s.material.opacity = Math.min(1, (d.ttl - d.t) / 0.2);
    }
  }
  let speedMul = 1, shakeA = 0, flashA = 0, flashRate = 1, timeScale = 1, slowLeft = 0, lightLeft = 0, lightDur = 1, lightPow = 0;
  // Player settings (setPrefs): screen shake, bright flashes, and reduced motion (no shake, no slow motion, camera cuts
  // instead of camera moves, no strolling beans).
  const prefs = { shake: true, flash: true, calm: false };
  const shake = (a) => { if (!skipping && prefs.shake && !prefs.calm) shakeA = Math.max(shakeA, a); };
  const slowmo = (scale, realDur) => { if (!skipping && !prefs.calm) { timeScale = scale; slowLeft = realDur; } };
  function flash(color = "#ffffff", a = 0.8, dur = 0.25) { if (skipping || !prefs.flash) return; ui.flash.style.background = color; flashA = a; flashRate = a / dur; }
  // A short burst of coloured light at a point (explosions, magic, zaps).
  function glow(x, y, z, color, power = 12, dur = 0.4) { if (skipping) return; fxLight.position.set(x, y, z); fxLight.color.set(color); lightPow = power; lightLeft = lightDur = dur; }
  // The classic hit: shake, flash, dust ring and sparks.
  function impact(x, y, z, power = 1) {
    shake(0.16 * power); flash("#ffffff", Math.min(0.9, 0.45 * power), 0.18); ring(x, 0.06, z, "#fff6dc", 1.6 * power, 0.35);
    burst("dust", x, y + 0.1, z, Math.round(10 * power), { flat: true, sp: 2.2 * power, r: 0.3 }); burst("spark", x, y + 0.2, z, Math.round(8 * power));
  }

  // ---------- overlay: flash, fade, cinema bars, captions, speech bubbles, the case file ----------
  if (!document.getElementById("stg-css")) { const st = document.createElement("style"); st.id = "stg-css"; st.textContent = CSS; document.head.appendChild(st); }
  const el = (cls, parent, tag = "div") => { const e = document.createElement(tag); e.className = cls; parent.appendChild(e); return e; };
  const host = canvas.parentElement;
  if (getComputedStyle(host).position === "static") host.style.position = "relative";
  const root = el("stg-ui", host);
  const ui = { root, bubbles: [], flash: null, fade: null, cap: null };
  for (let i = 0; i < 6; i++) ui.bubbles.push({ el: el("stg-bub", root), P: null, until: 0, w: 0, h: 0, x: -1, y: -1, pos: null });
  ui.cap = el("stg-cap", root); ui.flash = el("stg-flash", root); ui.fade = el("stg-fade", root); ui.snd = el("stg-snd", root);
  ui.desk = el("stg-desk", root); ui.file = el("stg-file", ui.desk);
  ui.file.innerHTML = '<div class="stg-tab">CASE FILE</div><div class="stg-folder"><div class="stg-paper"><h4>SUSPECT</h4><img class="stg-photo" alt=""><div class="stg-line"></div><div class="stg-line s"></div><div class="stg-line"></div></div><div class="stg-clip"></div></div><div class="stg-stamp"></div>';
  ui.stamp = ui.file.querySelector(".stg-stamp"); ui.photo = ui.file.querySelector(".stg-photo");
  el("stg-bar t", root); el("stg-bar b", root);
  let fadeV = 0, capUntil = 0;
  const cine = (on) => root.classList.toggle("cine", on);
  const setFade = (v) => { fadeV = v; ui.fade.style.opacity = v; };
  const fadeTo = (v, dur) => { const a = fadeV; return tween(dur, (k) => setFade(a + (v - a) * k), E.lin); };
  function caption(text, dur = 2.4) { ui.cap.textContent = text; ui.cap.classList.toggle("on", !!text); capUntil = text ? now + dur : 0; }
  // Captions for sounds: a short line in the top corner, apart from the scene captions. Real time, not scene time.
  let sndTimer = 0;
  function sound(text, seconds = 2.2) { clearTimeout(sndTimer); ui.snd.textContent = text || ""; ui.snd.classList.toggle("on", !!text); if (text) sndTimer = setTimeout(() => ui.snd.classList.remove("on"), seconds * 1000); }

  // ---------- time: skippable tweens for cutscenes, plain timers for ambient life ----------
  let now = 0;
  const tweens = [], timers = [];
  function tween(dur, fn, ease = E.io) {
    if (skipping || dur <= 0 || disposed) { if (fn) fn(1, 1); return Promise.resolve(); }
    return new Promise((res) => tweens.push({ t: 0, dur, fn, ease, res }));
  }
  const wait = (s) => tween(s, null);
  const sleep = (s) => new Promise((res) => timers.push({ t: now + s, res }));   // not skippable
  function stepTime(dt) {
    for (let i = tweens.length - 1; i >= 0; i--) {
      const tw = tweens[i]; tw.t += dt; const k = Math.min(1, tw.t / tw.dur);
      if (tw.fn) tw.fn(tw.ease(k), k);
      if (k >= 1) { tweens[i] = tweens[tweens.length - 1]; tweens.pop(); tw.res(); }
    }
    for (let i = timers.length - 1; i >= 0; i--) if (timers[i].t <= now) { const tm = timers[i]; timers[i] = timers[timers.length - 1]; timers.pop(); tm.res(); }
  }

  // ---------- camera ----------
  const camPos = new THREE.Vector3(0, 8, 14), camLook = new THREE.Vector3(0, 0.6, 0), orbP = new THREE.Vector3(), orbL = new THREE.Vector3();
  let camLock = false, yaw = 0, ringR = 5.5, rim = 9, plaza = 3.2, zoom = 1;
  function orbitPose(p, l) {
    const tall = camera.aspect < 1, pitch = tall ? 0.8 : 0.6;
    const d = Math.max((tall ? Math.max(3.6, ringR - 1.4) : ringR + 2.2) / tanH, ((ringR + 1.7) * Math.sin(pitch) + 1.7) / tanV) * zoom;
    l.set(0, 0.7, 0); p.set(Math.sin(yaw) * Math.cos(pitch) * d, 0.7 + Math.sin(pitch) * d, Math.cos(yaw) * Math.cos(pitch) * d);
  }
  function camTo(px, py2, pz, lx, ly, lz, dur = 0.5, ease = E.io) {
    camLock = true;
    if (prefs.calm) dur = 0;
    const ax = camPos.x, ay = camPos.y, az = camPos.z, bx = camLook.x, by = camLook.y, bz = camLook.z;
    return tween(dur, (k) => { camPos.set(ax + (px - ax) * k, ay + (py2 - ay) * k, az + (pz - az) * k); camLook.set(bx + (lx - bx) * k, by + (ly - by) * k, bz + (lz - bz) * k); }, ease);
  }
  // The drawing buffer: W x H CSS pixels at the current sharpness. Particles are sized in world units, so their scale follows it.
  // Low draws square pixels, but the hideout map keeps one render pixel per CSS pixel so the names on it stay readable.
  function sizeBuffer() {
    canvas.style.imageRendering = sharp.low ? "pixelated" : "auto";
    for (const m of starMats) m.size = sharp.low ? 3 : 2;   // sizes are scaled by the pixel ratio: one square pixel in Low
    u.dither.value = sharp.low ? 1 : 0;
    renderer.setPixelRatio(sharp.low && hide ? 1 : sharp.ratio); renderer.setSize(W, H, false); pMat.uniforms.scale.value = canvas.height / (2 * tanV);
  }
  function fit() {
    const cw = canvas.clientWidth || 1, ch = canvas.clientHeight || 1;
    W = cw; H = ch;
    camera.aspect = cw / ch; camera.fov = camera.aspect >= 1 ? 38 : Math.min(66, 38 + (1 - camera.aspect) * 54); camera.updateProjectionMatrix();
    tanV = Math.tan((camera.fov * PI) / 360); tanH = tanV * camera.aspect; sizeBuffer();
    Object.assign(root.style, { left: canvas.offsetLeft + "px", top: canvas.offsetTop + "px", width: cw + "px", height: ch + "px" });
    hcam.aspect = camera.aspect; hcam.fov = camera.fov; hcam.updateProjectionMatrix(); ui.desk.style.transform = `scale(${Math.min((cw * 0.78) / 300, (ch * 0.6) / 360).toFixed(3)})`;
    if (!camLock) { orbitPose(camPos, camLook); }
  }

  // ---------- actors: beans that walk, emote and dance ----------
  const actors = [];
  const pose = { x: 0, y: 0, rx: 0, ry: 0, rz: 0, sx: 1, sy: 1, eye: 1, mid: false, hL: false, Lx: 0, Ly: 0, Lz: 0, hR: false, Rx: 0, Ry: 0, Rz: 0 };
  function makeActor(role, look, o = {}) {
    const g = new THREE.Group(), b = makeBean(role, look); g.add(b);
    const feet = b.children.filter((c) => Math.abs(c.position.y - 0.04) < 0.001 && Math.abs(Math.abs(c.position.x) - 0.18) < 0.001);
    const eyes = b.children.filter((c) => Math.abs(c.position.y - 0.66) < 0.001 && Math.abs(c.position.z - 0.43) < 0.001);
    const hands = [-1, 1].map((s) => { const h = mesh(ball(0.12, 6, 5), toon("#ffffff"), s * 0.56, 0.45, 0.1); h.visible = false; b.add(h); return h; });
    const blob = new THREE.Mesh(blobGeo, blobMat); blob.position.y = 0.05; g.add(blob);
    const body = b.children[0], moving = [body, ...feet, ...eyes, ...hands]; b.traverse((m) => { if (m.userData.anim) moving.push(m); });
    bake(b, moving);   // everything that never moves on its own becomes one mesh per material
    if (o.shadow) b.traverse((m) => { if (m.isMesh) m.material = shadowMat; });
    if (o.ghost) { b.traverse((m) => { if (m.isMesh) m.material = ghostMat(m.material); }); blob.visible = false; }
    const mats = []; b.traverse((m) => { if (m.isMesh) mats.push(m, m.material); });
    const a = { g, b, body, feet, eyes, hands, blob, mats, ghost: !!o.ghost, face: 0, walk: null, step: rnd(TAU), ph: rnd(TAU), manual: false, emote: null, dance: null, danceT: 0, beat: 0,
      idle: rnd(1, 5), blink: rnd(1, 5), eyeS: 1, tall: wearsHat(look) || !!role, live: look?.head === "propeller" || look?.pack === "rocket" || look?.pack === "bat" };
    scene.add(g); actors.push(a); return a;
  }
  function dropActor(a) { const i = actors.indexOf(a); if (i >= 0) actors.splice(i, 1); if (a.walk) a.walk.res(); trash(a.g); }
  const paint = (a, mat) => { for (let i = 0; i < a.mats.length; i += 2) a.mats[i].material = mat || a.mats[i + 1]; };   // paint(a) restores
  function resetBean(a) {
    a.manual = false; a.emote = null; a.b.position.set(0, 0, 0); a.b.rotation.set(0, 0, 0); a.b.scale.set(1, 1, 1); a.g.position.y = 0; a.g.scale.setScalar(1); a.blob.visible = !a.ghost; a.blob.scale.setScalar(1);
    paint(a); for (const h of a.hands) h.visible = false; for (const e of a.eyes) e.scale.y = 1; a.eyeS = 1;
  }
  // Where a point in a bean's own space (x: its right, z: its front) is in the world.
  function local(a, lx, ly, lz, out = v1) { const r = a.g.rotation.y, c = Math.cos(r), s = Math.sin(r); return out.set(a.g.position.x + c * lx + s * lz, a.g.position.y + a.b.position.y + ly, a.g.position.z - s * lx + c * lz); }
  function walk(a, x, z, speed = 2.4, sneak = false) {
    if (a.walk) a.walk.res();
    return new Promise((res) => { a.walk = { x, z, speed, sneak, res, scene: false }; });
  }
  const faceTo = (a, x, z) => { a.face = Math.atan2(x - a.g.position.x, z - a.g.position.z); };
  const snap = (a) => { a.g.rotation.y = a.face; };

  const EMOTE = {
    wave: { dur: 1.7, icon: "hand", fn(a, t, P) { P.hR = true; P.Rx = 0.62 + Math.sin(t * 13) * 0.15; P.Ry = 1.02 + Math.abs(Math.sin(t * 13)) * 0.05; P.Rz = 0.12; P.rz -= 0.1; P.y += Math.abs(Math.sin(t * 6.5)) * 0.06; } },
    shrug: { dur: 1.5, icon: "quest", fn(a, t, P) { const k = Math.min(1, t / 0.18) * Math.min(1, (1.5 - t) / 0.18); P.hL = P.hR = true; P.Lx = -0.74; P.Rx = 0.74; P.Ly = P.Ry = 0.48 + k * 0.34; P.Lz = P.Rz = 0.15; P.sy += k * 0.08; P.rz += Math.sin(t * 5) * 0.06 * k; } },
    laugh: { dur: 1.9, icon: "ha", every: 0.42, fn(a, t, P) { P.y += Math.abs(Math.sin(t * 17)) * 0.1; P.rx -= 0.24; P.eye = 0.2; P.sy += Math.sin(t * 34) * 0.03; } },
    point: { dur: 1.7, icon: "bang", fn(a, t, P) { const k = E.back(Math.min(1, t / 0.18)); P.hR = true; P.Rx = 0.3; P.Ry = 0.64; P.Rz = 0.25 + k * 0.5 + Math.sin(t * 9) * 0.03; P.rx += 0.14 * k; } },
    sweat: { dur: 1.9, icon: "drop", every: 0.5, fn(a, t, P, e) { P.x = Math.sin(t * 46) * 0.03; P.sy -= 0.04; P.eye = 0.6; if (t > e.p * 0.16) { e.p++; local(a, rnd(-0.4, 0.4), 1.0, 0.3); burst("water", v1.x, v1.y, v1.z, 1, { sp: 0.3, up: 0.3 }); } } },
    heart: { dur: 1.9, icon: "heart", every: 0.38, fn(a, t, P) { P.rz += Math.sin(t * 5) * 0.15; P.y += Math.abs(Math.sin(t * 5)) * 0.09; P.eye = 0.25; } },
    steam: { dur: 1.9, icon: "anger", fn(a, t, P, e) { P.x = Math.sin(t * 52) * 0.04; P.sy += Math.sin(t * 20) * 0.04; P.y += Math.abs(Math.sin(t * 10)) * 0.06; if (t > e.p * 0.1) { e.p++; local(a, e.p % 2 ? 0.45 : -0.45, 1.0, 0); burst("cloud", v1.x, v1.y, v1.z, 1, { sp: 0.6, up: 2, s: 0.7, dx: (e.p % 2 ? 1 : -1) * Math.cos(a.g.rotation.y) }); } } },
    sleepy: { dur: 2.3, icon: "zed", every: 0.55, fn(a, t, P) { const k = Math.min(1, t / 0.4); P.rz += 0.24 * k + Math.sin(t * 2) * 0.04; P.eye = 0.12; P.sy -= 0.05 * k; } },
    cry: { dur: 2.1, icon: "drop", fn(a, t, P, e) { P.eye = 0.3; P.y += Math.abs(Math.sin(t * 12)) * 0.03; P.rx += 0.12; if (t > e.p * 0.06) { e.p++; const s = e.p % 2 ? 1 : -1; local(a, s * 0.24, 0.7, 0.42); burst("water", v1.x, v1.y, v1.z, 1, { sp: 0.25, up: 0.55, dx: s * 1.5 * Math.cos(a.g.rotation.y), dz: -s * 1.5 * Math.sin(a.g.rotation.y) }); } } },
    spin: { dur: 1.3, icon: "swirl", fn(a, t, P) { const k = t / 1.3; P.ry = E.io(k) * TAU * 3; P.y += Math.sin(k * PI) * 0.45; P.hL = P.hR = true; P.Lx = -0.76; P.Rx = 0.76; P.Ly = P.Ry = 0.62; P.Lz = P.Rz = 0; } },
  };
  const hands = (P, lx, ly, rx2, ry2, z = 0.12) => { P.hL = P.hR = true; P.Lx = lx; P.Ly = ly; P.Rx = rx2; P.Ry = ry2; P.Lz = P.Rz = z; };
  const DANCE = {
    hop(a, t, P) { const s = Math.abs(Math.sin(t * 6)); P.y += s * 0.38; P.sy += s * 0.06 - (1 - s) * 0.12; hands(P, -0.62, 0.7 + s * 0.4, 0.62, 0.7 + s * 0.4); },
    stomp(a, t, P) {
      const s = Math.sin(t * 7); P.rz += s * 0.3; P.x = s * 0.14; P.y += Math.abs(Math.cos(t * 7)) * 0.14; hands(P, -0.66, 0.5 - s * 0.2, 0.66, 0.5 + s * 0.2);
      const beat = Math.floor((t * 7) / PI + 0.5); if (beat !== a.beat) { a.beat = beat; local(a, s > 0 ? 0.3 : -0.3, 0, 0); burst("dust", v1.x, 0.1, v1.z, 4, { flat: true, sp: 1.6 }); }
    },
    wiggle(a, t, P) { const s = Math.sin(t * 9); P.sx = 1 + s * 0.14; P.sy = 1 - s * 0.14; P.rz += Math.sin(t * 4.5) * 0.22; hands(P, -0.64 - s * 0.06, 0.55 + s * 0.24, 0.64 + s * 0.06, 0.55 - s * 0.24, 0.2); },
    twirl(a, t, P) { P.ry = t * 9; P.y += 0.12 + Math.abs(Math.sin(t * 3)) * 0.34; P.rz += 0.12; hands(P, -0.78, 0.7, 0.78, 0.7, 0); },
    moonwaddle(a, t, P) { const k = (t % 2.4) / 2.4, c = Math.cos(k * TAU); P.x = Math.sin(k * TAU) * 0.75; P.ry = c > 0 ? -PI / 2 : PI / 2; P.rx -= 0.16; P.y += Math.abs(Math.sin(t * 11)) * 0.05; P.hR = true; P.Rx = 0.3; P.Ry = 1.05; P.Rz = 0.3; },
    flip(a, t, P) {
      const k = (t % 1.3) / 1.3;
      if (k < 0.62) { const j = k / 0.62; P.y += Math.sin(j * PI) * 1.05; P.rx = -E.io(j) * TAU; P.mid = true; hands(P, -0.7, 0.6, 0.7, 0.6); }
      else { const j = (k - 0.62) / 0.38; P.sy -= Math.sin(j * PI) * 0.16; hands(P, -0.6, 0.6 + j * 0.5, 0.6, 0.6 + j * 0.5); }
    },
  };
  function stepActor(a, dt, t) {
    const g = a.g;
    if (!g.visible) return;
    const w = a.walk;
    if (w) {
      const dx = w.x - g.position.x, dz = w.z - g.position.z, d = Math.hypot(dx, dz), len = w.speed * dt;
      if (d <= len || d < 0.02) { g.position.x = w.x; g.position.z = w.z; a.walk = null; w.res(); }
      else {
        g.position.x += (dx / d) * len; g.position.z += (dz / d) * len; a.face = Math.atan2(dx, dz);
        const before = Math.sin(a.step); a.step += dt * (w.sneak ? 8 : 5 + w.speed * 2.6);
        if (!a.ghost && before * Math.sin(a.step) < 0) burst("dust", g.position.x, 0.1, g.position.z, w.sneak ? 1 : 2, { sp: 0.5, s: 0.8 });
      }
    }
    let turnBy = a.face - g.rotation.y; turnBy = ((((turnBy + PI) % TAU) + TAU) % TAU) - PI; g.rotation.y += turnBy * Math.min(1, dt * 14);
    if (a.live) animate(a.b, t);
    if (a.manual) return;
    const P = pose; P.x = P.y = P.rx = P.ry = P.rz = 0; P.sx = P.sy = P.eye = 1; P.mid = P.hL = P.hR = false;
    if (a.walk) {
      const s = Math.sin(a.step);
      if (a.walk.sneak) { P.y = Math.abs(s) * 0.26; P.rx = 0.2; P.sy = 1 - Math.abs(Math.cos(a.step)) * 0.08; } else { P.y = Math.abs(s) * 0.11; P.rz = s * 0.13; }
      if (a.feet.length === 2) { a.feet[0].position.z = 0.02 + s * 0.14; a.feet[1].position.z = 0.02 - s * 0.14; }
    } else P.sy = 1 + Math.sin(t * 2.4 + a.ph) * 0.022;
    if (a.ghost) { P.y += 0.42 + Math.sin(t * 1.8 + a.ph) * 0.1; P.rz += Math.sin(t * 1.1 + a.ph) * 0.07; }
    a.blink -= dt; if (a.blink < 0) { P.eye = 0.15; if (a.blink < -0.12) a.blink = rnd(2, 5.5); }
    const e = a.emote;
    if (e) {
      e.t += dt;
      if (e.t >= e.def.dur) a.emote = null;
      else {
        e.def.fn(a, e.t, P, e);
        if (e.def.every ? e.t >= e.n * e.def.every : e.n === 0) { e.n++; icon(e.def.icon, g.position.x + rnd(-0.3, 0.3), P.y + (a.tall ? 1.85 : 1.55), g.position.z, { vy: 0.8, ttl: 1, sway: 0.5 }); }
      }
    } else if (a.dance) a.dance(a, (a.danceT += dt), P);
    const b = a.b;
    b.position.set(P.x, P.y, 0); b.rotation.set(P.rx, P.ry, P.rz); b.scale.set(P.sx, P.sy, P.sx);
    if (P.mid) { b.position.y += 0.55 * (1 - Math.cos(P.rx)); b.position.z -= 0.55 * Math.sin(P.rx); }
    a.hands[0].visible = P.hL; if (P.hL) a.hands[0].position.set(P.Lx, P.Ly, P.Lz);
    a.hands[1].visible = P.hR; if (P.hR) a.hands[1].position.set(P.Rx, P.Ry, P.Rz);
    if (a.eyeS !== P.eye) { a.eyeS = P.eye; for (const eye of a.eyes) eye.scale.y = P.eye; }
  }

  // ---------- the town: an island, a square, one house per player ----------
  const players = new Map();
  let order = [], town = null, podium = null, podV = 0, podT = 0, spotCone = null, spotOn = false, builtSig = "", nightAt = 0, victory = false, ghostsShown = true;
  const lit = (P) => (!P.alive ? 0 : phase === "night" || phase === "day" ? 0 : 1);
  // A point in a house's own space (x: to its right seen from the square, z: out of the front door) in the world.
  const hw = (P, lx, ly, lz, out = v1) => out.set(P.x + lx * P.nz + lz * P.nx, ly, P.z - lx * P.nx + lz * P.nz);
  function clearTown() {
    for (const P of players.values()) { dropActor(P.a); if (P.ghostA) dropActor(P.ghostA); P.hu.win.dispose(); }
    players.clear(); order = [];
    if (town) { town.traverse((m) => { if (m.isMesh) { m.geometry.dispose(); if (m.material.userData.own) { m.material.map?.dispose(); m.material.dispose(); } } }); scene.remove(town); town = null; }
  }
  function buildTown(list) {
    clearTown();
    const n = list.length; ringR = Math.max(5.5, n * 0.56); rim = ringR + 3.3; plaza = ringR - 2.6;
    town = new THREE.Group(); scene.add(town);
    const own = (m) => { m.userData.own = true; return m; };
    const grassMat = own(new THREE.MeshToonMaterial({ gradientMap: kit.grad, map: pixelTexture(32, speckle("#62b064", [["#52a05c", 90, 2], ["#78c474", 60, 1], ["#93d680", 12, 1]]), Math.round(rim)) }));
    const stoneMat = own(new THREE.MeshToonMaterial({ gradientMap: kit.grad, map: pixelTexture(32, cobble, Math.max(2, Math.round(plaza * 0.9))) }));
    const rock = mesh(cone(rim * 0.84, rim * 1.35, 9), toon("#5a4a78"), 0, -1.6 - rim * 0.67, 0); rock.rotation.x = PI;
    town.add(mesh(cyl(rim, rim * 0.95, 0.8, 28), grassMat, 0, -0.4, 0), mesh(cyl(plaza, plaza, 0.06, 28), stoneMat, 0, 0.01, 0));
    const decor = new THREE.Group(); town.add(decor);
    decor.add(mesh(cyl(rim * 0.96, rim * 0.82, 0.9, 28), toon("#7a5a3f"), 0, -1.2, 0), rock, mesh(cyl(plaza + 0.16, plaza + 0.16, 0.04, 28), toon("#9a8f7a"), 0, 0, 0), mesh(cyl(1.1, 1.1, 0.03, 20), toon("#efe4c8"), 0, 0.04, 0), mesh(cyl(0.8, 0.8, 0.03, 20), toon("#d9c8a0"), 0, 0.045, 0));
    const treeCols = ["#f29bc0", "#7fd6a0", "#ffc978", "#9ad0f0"];
    list.forEach((p, i) => {
      const ang = ((i + 0.5) / n) * TAU, x = Math.sin(ang) * ringR, z = Math.cos(ang) * ringR, look = cleanLook(p.look) || { ...DEFAULT_LOOK };
      const house = buildHouse(look), hu = house.userData; bake(house, [hu.door]);
      house.position.set(x, 0, z); house.rotation.y = Math.atan2(-x, -z); town.add(house);
      const P = { id: p.id, name: p.name || "", look, role: p.role || null, me: !!p.me, alive: true, i, ang, x, z, nx: -x / ringR, nz: -z / ringR, house, hu, a: null, ghostA: null, ghostOn: false, tomb: null, inside: phase === "night", light: 0, lightT: 0, door: 0, doorT: 0, tok: 0 };
      P.a = makeActor(P.role, look); players.set(p.id, P); order.push(P); settle(P, true);
      const path = mesh(box(0.8, 0.03, ringR - 0.9 - plaza), toon("#d9c8a0"), Math.sin(ang) * (plaza + (ringR - 0.9 - plaza) / 2), 0.012, Math.cos(ang) * (plaza + (ringR - 0.9 - plaza) / 2)); path.rotation.y = ang; decor.add(path);
      const mid = ((i + 1) / n) * TAU, tr = ringR + (n > 10 ? 1.7 : 1.1), tx = Math.sin(mid) * tr, tz = Math.cos(mid) * tr, tc = treeCols[i % 4], ts = 0.9 + ((i * 7) % 5) * 0.08;
      if (i === n - 1) { /* keep the camera's side of the square open */ } else if (i % 3 !== 2) decor.add(mesh(cyl(0.1 * ts, 0.16 * ts, 0.9 * ts, 6), toon("#6b4326"), tx, 0.45 * ts, tz), mesh(ball(0.66 * ts, 8, 6), toon(tc), tx, 1.25 * ts, tz), mesh(ball(0.44 * ts, 8, 6), toon(tc), tx + 0.3 * ts, 1.75 * ts, tz + 0.1));
      else decor.add(squash(mesh(ball(0.5, 8, 6), toon("#4f9a5a"), tx, 0.25, tz), 1.2, 0.8, 1), mesh(ball(0.32, 8, 6), toon("#62b064"), tx + 0.45, 0.2, tz + 0.1));
    });
    for (let k = 0; k < 4; k++) {   // lamps between houses, clear of every door's sight line
      const a = ((Math.round(((k + 0.5) * n) / 4)) / n) * TAU, x = Math.sin(a) * (ringR - 0.7), z = Math.cos(a) * (ringR - 0.7);
      decor.add(mesh(cyl(0.05, 0.08, 1.7, 6), toon("#2a2438"), x, 0.85, z), mesh(box(0.34, 0.06, 0.34), toon("#2a2438"), x, 1.92, z), mesh(box(0.2, 0.08, 0.2), toon("#2a2438"), x, 1.62, z));
      const glow = new THREE.Mesh(blobGeo, glowMat); glow.scale.setScalar(3.4); glow.position.set(x, 0.07, z); town.add(mesh(box(0.26, 0.26, 0.26), lampMat, x, 1.77, z), glow);
    }
    const petals = ["#ff9db5", "#ffe14a", "#ffffff", "#cdb4ff", "#ff8a3c"];
    for (let i = 0; i < 70; i++) {   // flowers and tufts in the grass
      const a = rnd(TAU), r = rnd(plaza + 0.5, rim - 0.4), x = Math.sin(a) * r, z = Math.cos(a) * r;
      if (order.some((P) => Math.hypot(P.x - x, P.z - z) < 1.5)) continue;
      if (i % 2) decor.add(mesh(box(0.05, 0.14, 0.05), toon("#3f8a4c"), x, 0.07, z), mesh(box(0.1, 0.1, 0.1), flat(petals[i % 5]), x, 0.18, z));
      else decor.add(mesh(box(0.2, 0.1, 0.06), toon("#4f9a5a"), x, 0.05, z), mesh(box(0.06, 0.16, 0.06), toon("#4f9a5a"), x + 0.04, 0.08, z));
    }
    bake(decor);
    podium = new THREE.Group(); podium.add(mesh(cyl(1.02, 1.12, 0.22, 16), toon("#b9b3c8"), 0, 0.11, 0), mesh(cyl(0.82, 0.88, 0.3, 16), toon("#e8e2f4"), 0, 0.37, 0), mesh(cyl(0.9, 0.9, 0.06, 16), toon("#ffcf3f"), 0, 0.24, 0));
    bake(podium); podium.visible = false; podium.position.y = -0.7; town.add(podium);
    spotCone = mesh(new THREE.CylinderGeometry(0.25, 1.5, 9, 16, 1, true), own(new THREE.MeshBasicMaterial({ color: "#fff2b8", transparent: true, opacity: 0.2, depthWrite: false, side: THREE.DoubleSide })), 0, 5, 0); spotCone.visible = false; town.add(spotCone);
    podV = podT = 0; spotOn = false; victory = false;
  }
  // Puts a bean where its state says it should be: asleep indoors, standing outside its door, or gone.
  function settle(P, place) {
    const a = P.a; resetBean(a); a.dance = null;
    if (a.walk) { const w = a.walk; a.walk = null; w.res(); }
    a.g.visible = P.alive && !P.inside;
    if (place || P.inside) { hw(P, P.hu.doorX, 0, P.inside ? P.hu.doorZ - 0.3 : 2.5); a.g.position.set(v1.x, 0, v1.z); a.face = Math.atan2(P.nx, P.nz); snap(a); }
    P.doorT = 0; P.lightT = lit(P);
  }
  function setTomb(P, on, style) {
    if (P.tomb) { trash(P.tomb); P.tomb = null; }
    if (!on) return null;
    const t = P.tomb = buildTomb(style || P.look.tomb); hw(P, -1.25, 0, 1.55); t.position.copy(v1); t.rotation.y = Math.atan2(P.nx, P.nz) + 0.25; t.userData.spin = (style || P.look.tomb) === "ufo"; town.add(t); return t;
  }
  function setAlive(P, alive) {
    if (P.alive === alive) return;
    P.alive = alive; P.tok++; P.inside = alive && phase === "night";
    setTomb(P, !alive); settle(P, true);
    if (alive) setGhost(P.id, false);
  }
  async function goHome(P, delay, k) {
    const tok = ++P.tok; P.lightT = 1;
    await sleep(delay); if (P.tok !== tok) return;
    if (!P.inside) {
      P.a.dance = null; hw(P, P.hu.doorX, 0, P.hu.doorZ + 0.75); await walk(P.a, v1.x, v1.z, 3.2); if (P.tok !== tok) return;
      P.doorT = 1; hw(P, P.hu.doorX, 0, P.hu.doorZ - 0.3); await walk(P.a, v1.x, v1.z, 2.2); if (P.tok !== tok) return;
      P.inside = true; P.a.g.visible = false; P.doorT = 0;
    }
    await sleep(Math.max(0.35, nightAt + 2.6 + k * 0.28 - now)); if (P.tok !== tok) return;
    P.lightT = 0;
  }
  async function comeOut(P, delay) {
    const tok = ++P.tok;
    await sleep(delay); if (P.tok !== tok) return;
    if (P.inside) {
      P.lightT = 1; settle(P); P.inside = false; P.a.g.visible = true; P.lightT = 1; P.doorT = 1;
      await sleep(0.22); if (P.tok !== tok) return;
      hw(P, P.hu.doorX * 0.5, 0, 2.5); await walk(P.a, v1.x, v1.z, 2.3); if (P.tok !== tok) return;
      P.doorT = 0;
    }
    P.lightT = lit(P);
  }
  function stepTown(dt, t) {
    for (const P of order) {
      if (P.light !== P.lightT) P.light += clamp(P.lightT - P.light, -dt * 5, dt * 5);
      P.hu.win.color.copy(env.glass).lerp(col(P.hu.lit), P.light);
      if (P.door !== P.doorT) { P.door += (P.doorT - P.door) * Math.min(1, dt * 16); if (Math.abs(P.door - P.doorT) < 0.005) P.door = P.doorT; P.hu.door.rotation.y = -P.door * 1.9; }
      const f = P.tomb?.userData.float; if (f) { f.position.y += Math.sin(t * 2.2 + P.i) * dt * 0.12; if (P.tomb.userData.spin) f.rotation.y = t * 2.4; }
      const a = P.a;   // daytime strolls
      if (opt.wander && !prefs.calm && phase === "day" && !cur && P.alive && !P.inside && !P.me && !a.walk && !a.emote && (a.idle -= dt) < 0) {
        a.idle = rnd(2.5, 8); const an = rnd(TAU), r = Math.sqrt(Math.random()) * (plaza - 0.5); walk(a, Math.sin(an) * r, Math.cos(an) * r, 1.3);
      }
      const gh = P.ghostA;
      if (gh && gh.g.visible && !cur && !gh.walk && (gh.idle -= dt) < 0) { gh.idle = rnd(2, 6); const an = rnd(TAU), r = Math.sqrt(Math.random()) * (plaza + 1); walk(gh, Math.sin(an) * r, Math.cos(an) * r, 0.8); }
    }
    if (podV !== podT) { podV += clamp(podT - podV, -dt * 2.2, dt * 2.2); podium.visible = podV > 0; podium.position.y = -0.62 * (1 - E.out(podV)); }
    if (env.lamp > 0.6 && !hide && (flyT -= dt) < 0) { flyT = 0.16; const an = rnd(TAU), r = rnd(1, rim - 1); burst("firefly", Math.sin(an) * r, rnd(0.4, 1.6), Math.cos(an) * r, 1, { r: 0 }); }
    if (victory && (confT -= dt) < 0) { confT = 0.09; burst("confetti", rnd(-plaza, plaza), 6.5, rnd(-plaza, plaza), 2, { sp: 0.4, up: 0 }); }
  }
  let confT = 0, flyT = 0;

  // ---------- cutscene plumbing ----------
  let cur = null, chain = Promise.resolve(), hide = null;
  // Runs one scene at a time, in order. Whatever a scene borrows (props, extra beans, the camera) is handed back when it ends.
  function play(fn, bars = true) {
    if (hide) closeHideout();
    if (bars) pending++;
    const run = async () => {
      if (bars) pending--;
      if (disposed) return;
      const sc = cur = { temps: [], actors: [], touched: new Set(), undo: [], hidden: [] };
      if (bars) cine(true);
      if (fadeV > 0) fadeTo(0, 0.25);
      try { await fn(sc); } catch (err) { console.error("stage scene failed", err); }
      for (const o of sc.temps) trash(o);
      for (const a of sc.actors) dropActor(a);
      for (const f of sc.undo) f();
      for (const h of sc.hidden) h.visible = true;
      for (const P of sc.touched) settle(P);
      if (fadeV > 0.9) orbitPose(camPos, camLook);   // a scene that ended in the dark cuts straight back to the town
      tweens.length = 0; skipping = false; cur = null; camLock = false; timeScale = 1; slowLeft = 0; dimT = spotOn ? 0.5 : 1; cine(false); caption("");
      ui.file.classList.remove("on"); ui.stamp.classList.remove("on");
    };
    return (chain = chain.then(run));
  }
  function skip() {
    if (hide) closeHideout();
    if (!cur || skipping) return;
    skipping = true; shakeA = 0; flashA = 0; ui.flash.style.opacity = 0; timeScale = 1; slowLeft = 0;
    for (const a of actors) if (a.walk?.scene) { const w = a.walk; a.walk = null; a.g.position.x = w.x; a.g.position.z = w.z; w.res(); }
    while (tweens.length) { const tw = tweens.pop(); if (tw.fn) tw.fn(1, 1); tw.res(); }
  }
  const temp = (o, x = 0, y = 0, z = 0) => { o.position.set(x, y, z); scene.add(o); cur.temps.push(o); return o; };
  const held = (a, o, x, y, z) => { o.position.set(x, y, z); a.b.add(o); cur.temps.push(o); return o; };   // a prop carried by a bean
  const extra = (role, look, o) => { const a = makeActor(role, look || DEFAULT_LOOK, o); cur.actors.push(a); return a; };
  function go(a, x, z, speed = 3, sneak = false) {
    if (skipping) { a.g.position.x = x; a.g.position.z = z; return Promise.resolve(); }
    const p = walk(a, x, z, speed, sneak); a.walk.scene = true; return p;
  }
  const goH = (a, P, lx, lz, speed, sneak) => { hw(P, lx, 0, lz, v2); return go(a, v2.x, v2.z, speed, sneak); };
  const putH = (o, P, lx, ly, lz) => { hw(P, lx, ly, lz, v2); o.position.copy(v2); return o; };
  // Frames a house: camera and look-at are given in the house's own space; tall screens stand further back.
  function shot(P, cx, cy, cz, lx, ly, lz, dur = 0.55, ease = E.io) {
    let far = Math.max(1, 0.33 / tanH); hw(P, lx, ly, lz, v3);
    for (let i = 0; i < 6; i++) { hw(P, lx + (cx - lx) * far, ly + (cy - ly) * far, lz + (cz - lz) * far, v2); if (far <= 1 || Math.hypot(v2.x, v2.z) < ringR + 0.4) break; far = Math.max(1, far - 0.1); }   // stay on the island
    for (const Q of order) { const near = Q !== P && Math.hypot(Q.x - v2.x, Q.z - v2.z) < 3; if (near) cur.hidden.push(Q.house); if (near || cur.hidden.includes(Q.house)) Q.house.visible = !near; }   // a house the camera stands in steps aside
    return camTo(v2.x, v2.y, v2.z, v3.x, v3.y, v3.z, dur, ease);
  }
  // Frames a point in the square from the current orbit side.
  function shotAt(x, y, z, dist, height, dur = 0.6, ease = E.io) {
    const far = Math.min(Math.max(1, 0.36 / tanH), Math.max(1, (ringR + 1.2) / dist)), d = dist * far;
    return camTo(x + Math.sin(yaw) * d, y + height * far, z + Math.cos(yaw) * d, x, y, z, dur, ease);
  }
  // Square scenes are shot from the gap between two houses, so no roof is ever in the way.
  const snapYaw = () => { const st = TAU / (order.length || 1); yaw = Math.round(yaw / st) * st; };
  // Throws an object along an arc to a point; each(q) can add spin.
  function arc(o, x, y, z, h, dur, each, ease = E.lin) {
    const ax = o.position.x, ay = o.position.y, az = o.position.z;
    return tween(dur, (k) => { o.position.set(ax + (x - ax) * k, ay + (y - ay) * k + 4 * h * k * (1 - k), az + (z - az) * k); if (each) each(k); }, ease);
  }
  const bodyOf = (P) => bodyColors(P.look.body)[0];
  const myPlayer = () => order.find((p) => p.me) || order[0];
  function dizzy(a) { local(a, 0, 1.3, 0); for (let i = 0; i < 3; i++) icon("star", v1.x + (i - 1) * 0.35, v1.y + (i % 2) * 0.15, v1.z, { vy: 0.3, vx: (i - 1) * 0.5, ttl: 0.9, s: 0.4 }); }
  // Falls over sideways with a bounce.
  function topple(a, dir = 1, dur = 0.42) {
    a.manual = true; const b = a.b, r0 = b.rotation.z;
    return tween(dur, (k) => { const th = r0 + (dir * PI / 2 - r0) * k; b.rotation.z = th; b.rotation.x = 0; b.position.y = 0.46 * Math.abs(Math.sin(th)); }, E.bounce)
      .then(() => burst("dust", a.g.position.x, 0.1, a.g.position.z, 7, { flat: true, sp: 1.5 }));
  }
  function flatten(a, h = 0.1) { a.manual = true; a.b.rotation.set(0, 0, 0); a.b.position.set(0, 0, 0); a.b.scale.set(1.55, h, 1.55); a.blob.visible = false; for (const hd of a.hands) hd.visible = false; }
  const act = (a, kind) => { a.emote = { def: EMOTE[kind], t: 0, n: 0, p: 0 }; };
  function makeShield() {
    const g = new THREE.Group(), own = (m) => { m.userData.own = true; return m; };
    const outer = new THREE.Mesh(new THREE.SphereGeometry(1, 18, 12), own(new THREE.MeshBasicMaterial({ color: "#8fe0ff", transparent: true, opacity: 0.3, depthWrite: false })));
    const inner = new THREE.Mesh(new THREE.SphereGeometry(0.97, 18, 12), own(new THREE.MeshBasicMaterial({ color: "#ffffff", transparent: true, opacity: 0.22, depthWrite: false, side: THREE.BackSide })));
    g.add(inner, outer, turn(mesh(box(0.2, 0.045, 0.02), flat("#ffffff"), -0.5, 0.62, 0.62), -0.6, -0.6, 0.5), turn(mesh(box(0.07, 0.045, 0.02), flat("#ffffff"), -0.66, 0.46, 0.62), -0.4, -0.7, 0.9));
    g.userData.mats = [outer.material, inner.material]; g.scale.setScalar(0.01); return g;
  }
  const fadeShield = (s, dur = 0.35) => tween(dur, (k) => { s.userData.mats[0].opacity = 0.3 * (1 - k); s.userData.mats[1].opacity = 0.22 * (1 - k); s.scale.multiplyScalar(1 + 0.004); }, E.lin).then(() => { s.visible = false; });
  function makeTub() {
    const g = new THREE.Group();
    g.add(mesh(box(1.6, 0.5, 1.2), toon("#ffffff"), 0, 0.37, 0), mesh(box(1.72, 0.08, 1.32), toon("#e8e2f4"), 0, 0.64, 0), mesh(box(1.44, 0.04, 1.04), flat("#7cc8ff"), 0, 0.67, 0),
      mesh(cyl(0.03, 0.03, 0.4, 5), toon("#ffcf3f"), 0.66, 0.85, -0.4), mesh(box(0.2, 0.05, 0.05), toon("#ffcf3f"), 0.58, 1.04, -0.4));
    for (const [x, z] of [[-0.65, -0.45], [0.65, -0.45], [-0.65, 0.45], [0.65, 0.45]]) g.add(mesh(ball(0.1, 6, 5), toon("#ffcf3f"), x, 0.1, z));
    return g;
  }

  // ---------- night: the kill, seen by the victim ----------
  async function dropKill(c, id, size) {
    const { P, v, k } = c;
    await c.knock(); goH(k, P, 5, 2.6, 6); await c.out();
    const x = v.g.position.x, z = v.g.position.z, o = temp(buildProp(id), x, 11, z), sh = temp(new THREE.Mesh(blobGeo, blobMat), x, 0.07, z);
    o.scale.setScalar(size); o.rotation.y = v.g.rotation.y + (id === "boot" ? -PI / 2 : 0); sh.scale.setScalar(0.3);
    icon("quest", x, 1.75, z, { ttl: 0.6 }); v.manual = true;
    tween(0.5, (q) => { sh.scale.setScalar(0.3 + q * 2.4 * size); v.b.rotation.x = -0.4 * Math.min(1, q * 2); }, E.out);
    await wait(0.34); slowmo(0.3, 0.26);
    await tween(0.3, (q) => { o.position.y = 11 - 10.9 * q; }, E.in);
    flatten(v); sh.visible = false; impact(x, 0, z, 1.6); burst("splat", x, 0.25, z, 24, { c: c.color }); ring(x, 0.08, z, c.color, 2.6, 0.5);
    if (id === "piano") { burst("keys", x, 0.9, z, 28); o.rotation.z = 0.1; for (let i = 0; i < 3; i++) icon("note", x + (i - 1) * 0.7, 1.6, z, { vy: 1.3, vx: (i - 1) * 0.6, ttl: 0.9, sway: 1 }); }
    await tween(0.16, (q) => { o.position.y = 0.1 + Math.sin(q * PI) * 0.3; }, E.lin);
    if (id === "boot") { await wait(0.25); await tween(0.5, (q) => { o.position.y = 0.1 + q * 9; }, E.in); }
    dizzy(v); await wait(id === "boot" ? 0.3 : 0.6);
  }
  const KILL = {
    async fedora(c) {
      const { P, k, dx, dz } = c;
      await c.knock(); P.doorT = 1; hw(P, dx, 0.6, dz + 0.4); glow(v1.x, v1.y, v1.z, "#ffd98a", 8, 0.9); await wait(0.15);
      await goH(k, P, dx, dz + 0.5, 3); await wait(0.3);   // a fedora in the doorway, dark against the light
      await goH(k, P, dx, dz - 0.3, 3); k.g.visible = false; P.doorT = 0; await wait(0.1);
      hw(P, dx, 0.3, dz + 0.3); shake(0.16); burst("dust", v1.x, v1.y, v1.z, 8, { sp: 1.2 }); await wait(0.15);
      const [wx, wy, wz] = c.hu.window;
      for (let i = 0; i < 3; i++) {   // a scuffle behind the curtains
        P.light = P.lightT = 0.1; shake(0.07); hw(P, wx + rnd(-0.3, 0.3), wy + 0.5, wz + 0.2); icon(i === 1 ? "bang" : "star", v1.x, v1.y, v1.z, { ttl: 0.4, s: 0.45 });
        await wait(0.1); P.light = P.lightT = 1; await wait(0.09);
      }
      P.light = P.lightT = 0; flash("#ff3b5c", 0.4, 0.3); hw(P, ...c.hu.smoke); burst("smoke", v1.x, v1.y, v1.z, 8); await wait(0.3);
    },
    async shove(c) {
      const { P, v, k } = c;
      await c.knock(); await c.out(); faceTo(k, v.g.position.x, v.g.position.z); icon("quest", v.g.position.x, 1.75, v.g.position.z, { ttl: 0.5 }); await wait(0.2);
      k.manual = true;
      await tween(0.2, (q) => { k.b.rotation.x = -0.35 * q; k.b.position.z = -0.25 * q; }, E.out);
      await tween(0.09, (q) => { k.b.rotation.x = -0.35 + 0.8 * q; k.b.position.z = -0.25 + 0.85 * q; }, E.in);
      impact(v.g.position.x, 0.6, v.g.position.z, 1); slowmo(0.25, 0.2); v.manual = true; v.blob.visible = false;
      tween(0.25, (q) => { k.b.rotation.x = 0.45 * (1 - q); k.b.position.z = 0.6 * (1 - q); });
      shot(P, 4.2, 6.2, 8, -1, 1.2, -2.6, 0.5, E.out);
      hw(P, -2.4, 0, -(rim - ringR) - 2.4, v3);
      await arc(v.g, v3.x, -7, v3.z, 6.8, 1.0, (q) => { const th = -q * TAU * 3; v.b.rotation.x = th; v.b.position.y = 0.55 * (1 - Math.cos(th)); v.b.position.z = -0.55 * Math.sin(th); if (Math.random() < 0.5) burst("dust", v.g.position.x, v.g.position.y + 0.5, v.g.position.z, 1, { sp: 0.2 }); });
      burst("cloud", v3.x, -3, v3.z, 16, { sp: 2, r: 0.8 }); icon("star", v3.x, -1.2, v3.z, { vy: 0.4, ttl: 0.6, s: 0.8 }); v.g.visible = false; await wait(0.35);
    },
    anvil: (c) => dropKill(c, "anvil", 1.5),
    piano: (c) => dropKill(c, "piano", 1.35),
    boot: (c) => dropKill(c, "boot", 2.6),
    async mallet(c) {
      const { P, v, k } = c;
      await c.knock(); await c.out(); faceTo(k, v.g.position.x, v.g.position.z);
      const m = held(k, buildProp("mallet"), 0, 0.35, 0.42); m.scale.setScalar(1.15); m.rotation.x = -0.3; icon("quest", v.g.position.x, 1.75, v.g.position.z, { ttl: 0.5 });
      k.manual = true;
      await tween(0.32, (q) => { m.rotation.x = -0.3 - q * 1.1; k.b.rotation.x = -0.25 * q; k.b.position.y = q * 0.15; }, E.out);
      slowmo(0.3, 0.16);
      await tween(0.11, (q) => { m.rotation.x = -1.4 + q * 2.95; k.b.rotation.x = -0.25 + 0.5 * q; k.b.position.y = 0.15 * (1 - q); }, E.in);
      const x = v.g.position.x, z = v.g.position.z; flatten(v, 0.3); impact(x, 0.3, z, 1.3); ring(x, 0.5, z, "#ff9db5", 2.4, 0.45, 0.3, true); icon("bang", x, 1.3, z, { ttl: 0.6, s: 0.8 });
      burst("splat", x, 0.3, z, 12, { c: c.color });
      await tween(0.3, (q) => { m.rotation.x = 1.55 - Math.sin(q * PI) * 0.5; k.b.rotation.x = 0.25 * (1 - q); v.b.scale.y = 0.3 - Math.sin(q * PI) * 0.08; }, E.lin);
      dizzy(v); await wait(0.55);
    },
    async pie(c) {
      const { P, v, k, dx, dz } = c;
      await c.knock(); await c.out(); faceTo(k, v.g.position.x, v.g.position.z);
      local(k, 0, 0.8, 0.5); const pie = temp(buildProp("pie"), v1.x, v1.y, v1.z); hw(P, dx, 0.42, dz + 1.25, v3);
      await arc(pie, v3.x, v3.y, v3.z, 0.5, 0.25); icon("heart", v.g.position.x, 1.75, v.g.position.z, { ttl: 0.6 }); goH(k, P, 6.5, 3.4, 7);
      for (let i = 0; i < 3; i++) { burst("spark", v3.x + 0.1, v3.y + 0.62, v3.z, 3, { sp: 0.35, up: 0.6 }); if (i === 1) icon("bang", v.g.position.x, 1.75, v.g.position.z, { ttl: 0.4 }); await wait(0.13); }
      slowmo(0.2, 0.16); await wait(0.05);
      const x = v3.x, z = v3.z; pie.visible = false; flash("#fff6dc", 1, 0.4); shake(0.55); glow(x, 1, z, "#ffb03c", 40, 0.5); ring(x, 0.08, z, "#fff6dc", 4, 0.5); ring(x, 0.8, z, "#ffb03c", 3, 0.4, 0.3, true);
      burst("fire", x, 0.7, z, 30, { sp: 1.5, r: 0.3 }); burst("smoke", x, 0.9, z, 18, { r: 0.5 }); burst("splat", x, 0.7, z, 34, { c: ["#fff3dc", "#ffffff", "#ffe9a0", "#e8384f"], sp: 1.4 });
      paint(v, sootMat); for (const e of v.eyes) e.material = boneMat; v.manual = true;
      await tween(0.4, (q) => { v.b.position.y = Math.sin(Math.min(1, q * 2.5) * PI) * 0.35; for (const e of v.eyes) e.scale.y = q > 0.5 && q < 0.7 ? 0.15 : 1; if (Math.random() < 0.3) burst("smoke", x + rnd(-0.3, 0.3), 1.1, z - 0.4, 1, { s: 0.6 }); }, E.lin);
      await topple(v); await wait(0.3);
    },
    async muffin(c) {
      const { P, v, k, dx, dz } = c;
      const muff = temp(buildProp("muffin")); putH(muff, P, dx, 0.1, dz + 1.3); muff.scale.setScalar(0.01);
      await c.knock(); tween(0.15, (q) => muff.scale.setScalar(q), E.back); goH(k, P, 5.2, 2.8, 6.5); await wait(0.1);
      await c.out(); icon("heart", v.g.position.x, 1.75, v.g.position.z, { ttl: 0.6 }); await goH(v, P, dx, dz + 0.95, 2.4); v.manual = true;
      let n = 0;
      await tween(0.36, (q, raw) => { v.b.rotation.x = 0.25 + Math.sin(raw * PI * 6) * 0.2; muff.scale.setScalar(1 - raw); if (raw > n * 0.25) { n++; burst("dust", muff.position.x, 0.45, muff.position.z, 3, { c: ["#c98a4a", "#8a5ad0"], sp: 0.8 }); } }, E.lin);
      v.b.rotation.x = 0; await wait(0.18);
      v.body.material = toon("#86c75a"); const x = v.g.position.x, z = v.g.position.z; icon("quest", x, 1.75, z, { ttl: 0.5 }); n = 0;
      await tween(0.55, (q, raw) => { v.b.rotation.z = Math.sin(raw * 22) * 0.25 * raw; v.b.scale.y = 1 + Math.sin(raw * 30) * 0.07; if (raw > n * 0.1) { n++; burst("magic", x + rnd(-0.3, 0.3), 1.1, z, 2, { c: ["#a4ff7a", "#7dbf5a", "#d8ffb0"], up: 1.6 }); } }, E.lin);
      icon("skull", x, 1.8, z, { ttl: 1, s: 0.7, vy: 0.5 }); await topple(v, -1); burst("magic", x, 0.5, z, 10, { c: ["#a4ff7a", "#7dbf5a"] }); await wait(0.35);
    },
    async banana(c) {
      const { P, v, k, dx, dz } = c;
      const peel = temp(buildProp("banana")); putH(peel, P, dx, 0.06, dz + 1.55); peel.scale.setScalar(0.01);
      await c.knock(); tween(0.15, (q) => peel.scale.setScalar(q * 1.4), E.back); goH(k, P, 4.6, 2.6, 6.5); await wait(0.1);
      await c.out(); await goH(v, P, dx, dz + 1.5, 3.4);
      v.manual = true; slowmo(0.35, 0.3); icon("bang", v.g.position.x, 1.8, v.g.position.z, { ttl: 0.5 });
      hw(P, dx + 2.2, 0.06, dz + 3.2, v3); arc(peel, v3.x, v3.y, v3.z, 2.4, 0.8, (q) => { peel.rotation.x = q * 9; });
      await tween(0.55, (q) => { const th = -q * TAU * 1.25; v.b.rotation.x = th; v.b.position.y = Math.sin(q * PI) * 1.5 + 0.5 * (1 - Math.cos(th)); v.b.position.z = -0.5 * Math.sin(th) - 0.5 + q * 0.3; }, E.lin);
      local(v, 0, 0, -0.6); impact(v1.x, 0, v1.z, 1); dizzy(v); act(k, "laugh"); await wait(0.7);
    },
    async duck(c) {   // the victim is having an evening soak in the garden; no knock needed
      const { P, v, k, dx, dz } = c;
      const tub = temp(makeTub()); putH(tub, P, dx + 1.75, 0, dz + 1.7); tub.rotation.y = P.house.rotation.y;
      v.g.visible = true; v.manual = true; v.blob.visible = false; putH(v.g, P, dx + 1.75, 0.2, dz + 1.7); P.lightT = 1;
      shot(P, 2.6, 2.1, 8, 1.3, 0.9, 1.4, 0.6);
      const x = tub.position.x, z = tub.position.z; let n = 0;
      const soak = tween(1.25, (q, raw) => { v.b.position.y = Math.sin(raw * 9) * 0.04; v.b.rotation.z = Math.sin(raw * 6) * 0.1; if (raw > n * 0.12) { n++; burst("cloud", x + rnd(-0.6, 0.6), 0.75, z + rnd(-0.4, 0.4), 1, { sp: 0.2, s: 0.5, up: 0.6 }); if (n % 4 === 1) icon("note", x + rnd(-0.4, 0.4), 1.8, z, { ttl: 0.7, sway: 1 }); } }, E.lin);
      await goH(k, P, dx + 3.6, dz + 2.2, 3.4, true); faceTo(k, x, z); await soak;
      local(k, 0, 0.9, 0.4); const d = temp(buildProp("duck"), v1.x, v1.y, v1.z); d.scale.setScalar(0.75); burst("spark", v1.x, v1.y, v1.z, 5, { c: ["#9be7ff", "#ffffff"], sp: 0.5 });
      await arc(d, x - 0.35, 0.68, z + 0.3, 1.5, 0.42, (q) => { d.rotation.z = q * TAU; }); d.rotation.z = 0;
      burst("water", x, 0.8, z, 16); icon("quest", x, 1.9, z, { ttl: 0.4 }); await wait(0.28);
      for (let i = 0; i < 7; i++) {
        paint(v, i % 2 ? boneMat : shadowMat); flash(i % 2 ? "#ffffff" : "#9be7ff", 0.55, 0.08); shake(0.14); glow(x, 1.2, z, "#9be7ff", 30, 0.1);
        burst("spark", x + rnd(-0.5, 0.5), 1, z, 5, { c: ["#9be7ff", "#ffffff", "#ffe14a"] }); v.b.position.y = 0.25 * (i % 2); await wait(0.075);
      }
      paint(v, sootMat); for (const e of v.eyes) e.material = boneMat; burst("smoke", x, 1.1, z, 12, { r: 0.4 }); goH(k, P, 7, 3.5, 6);
      await tween(0.55, (q) => { v.g.position.y = 0.2 - q * 0.75; d.position.y = 0.68 + Math.sin(q * 12) * 0.03; d.rotation.y = q * 2; }, E.in);
      icon("skull", x, 1.3, z, { ttl: 0.8, s: 0.7, vy: 0.5 }); await wait(0.35);
    },
    async tickle(c) {
      const { v, k } = c;
      await c.knock(); await c.out(); faceTo(k, v.g.position.x, v.g.position.z);
      const f = held(k, buildProp("tickle"), 0.1, 0.25, 0.45); f.rotation.x = 1.0; v.manual = true; for (const e of v.eyes) e.scale.y = 0.2;
      const x = v.g.position.x, z = v.g.position.z; let n = 0;
      await tween(1.2, (q, raw) => {
        const amp = 0.4 + raw; f.rotation.z = Math.sin(raw * 60) * 0.4; v.b.position.y = Math.abs(Math.sin(raw * 42)) * 0.16 * amp; v.b.rotation.z = Math.sin(raw * 35) * 0.24 * amp; v.b.rotation.x = -0.2;
        if (raw > n * 0.14) { n++; icon("ha", x + rnd(-0.6, 0.6), 1.6 + rnd(0.3), z, { ttl: 0.6, vy: 1, s: 0.5 + raw * 0.3 }); burst("feather", x + 0.3, 0.9, z + 0.3, 1); burst("water", x, 1, z, 1, { sp: 0.5 }); }
      }, E.lin);
      flash("#fff6dc", 0.3, 0.2); icon("skull", x, 1.9, z, { ttl: 0.9, s: 0.7, vy: 0.5 }); for (const e of v.eyes) e.scale.y = 1;
      await topple(v); burst("feather", x, 0.8, z, 16); await wait(0.4);
    },
    async bees(c) {
      const { P, v, k, dx, dz } = c;
      await c.knock(); await c.out(); faceTo(k, v.g.position.x, v.g.position.z);
      local(k, 0, 1.2, 0.3); const hive = temp(buildProp("bees"), v1.x, v1.y, v1.z); hive.scale.setScalar(0.8); hw(P, dx + 0.3, 0.05, dz + 1.3, v3);
      await arc(hive, v3.x, v3.y, v3.z, 1.4, 0.32, (q) => { hive.rotation.z = q * 5; });
      hive.visible = false; burst("splat", v3.x, 0.3, v3.z, 14, { c: ["#ffcf3f", "#e8a02c"] }); shake(0.12); goH(k, P, 6, 3.2, 7);
      v.manual = true; let n = 0;
      await tween(1.1, (q, raw) => {
        const an = raw * TAU * 2; hw(P, dx + Math.sin(an) * 1.0, 0, dz + 1.7 + Math.cos(an) * 0.7, v2); v.face = Math.atan2(v2.x - v.g.position.x, v2.z - v.g.position.z); v.g.position.x = v2.x; v.g.position.z = v2.z;
        v.b.position.y = Math.abs(Math.sin(raw * 44)) * 0.14; v.b.rotation.z = Math.sin(raw * 44) * 0.16;
        burst("bee", v2.x, 1.0, v2.z, 2, { r: 0.55 });
        if (raw > n * 0.22) { n++; icon(n % 2 ? "drop" : "bang", v2.x, 1.8, v2.z, { ttl: 0.5, s: 0.45 }); }
      }, E.lin);
      const x = v.g.position.x, z = v.g.position.z; icon("skull", x, 1.9, z, { ttl: 0.9, s: 0.7, vy: 0.5 }); burst("bee", x, 0.9, z, 14, { r: 0.6 }); await topple(v); await wait(0.35);
    },
    async serial(c) {
      const { v, k } = c;
      await c.knock(); await c.out(); faceTo(k, v.g.position.x, v.g.position.z); await wait(0.15);
      local(k, 0.62, 0.8, 0.25); icon("star", v1.x, v1.y, v1.z, { vy: 0, ttl: 0.35, s: 0.6 }); flash("#ffffff", 0.4, 0.12); slowmo(0.35, 0.25); await wait(0.14);
      const x = v.g.position.x, z = v.g.position.z; k.manual = true;
      for (let i = 0; i < 3; i++) {
        const s = temp(mesh(box(3, 0.1, 0.02), flat("#ffffff")), x, 0.65, z); s.quaternion.copy(camera.quaternion); s.rotateZ([0.75, -0.6, 0.12][i]); s.translateZ(0.8);
        tween(0.2, (q) => { s.scale.set(Math.min(1, q * 4), 1.6 * (1 - q) + 0.01, 1); }, E.lin).then(() => { s.visible = false; });
        flash("#ff3b5c", 0.45, 0.1); shake(0.16); burst("splat", x, 0.7, z, 7, { c: c.color }); k.b.position.z = 0.5; k.b.rotation.x = 0.3;
        await wait(0.06); k.b.position.z = 0; k.b.rotation.x = 0; await wait(0.07);
      }
      v.body.material = toon("#8d879c"); v.manual = true; for (const e of v.eyes) e.scale.y = 0.2;
      await wait(0.2); await topple(v); burst("splat", x, 0.4, z, 12, { c: c.color }); await wait(0.4);
    },
    async vigilante(c) { await sling(c.P, c.k, true); },
  };
  function playKill({ victim, killer, killerLook, method = "fedora", showKiller = true } = {}) {
    return play(async (sc) => {
      const P = players.get(victim); if (!P) return;
      const v = P.a, hu = P.hu, dx = hu.doorX, dz = hu.doorZ, role = method === "serial" ? "serialkiller" : method === "vigilante" ? "vigilante" : "mafia";
      const seen = cleanLook(killerLook) || players.get(killer)?.look || { ...DEFAULT_LOOK, body: "charcoal" };
      // a hidden killer is a plain shadow in the role's hat: no outfit to recognise. The classic move always wears the fedora.
      const k = extra(role, !showKiller ? { body: "charcoal" } : method === "fedora" ? { ...seen, head: "none" } : seen, { shadow: !showKiller });
      sc.touched.add(P); P.tok++; resetBean(v); v.g.visible = false; putH(v.g, P, dx, 0, dz - 0.3); v.face = Math.atan2(P.nx, P.nz); snap(v);
      putH(k.g, P, 3.9, 0, 3.0); P.lightT = 0;
      const c = {
        P, v, k, hu, dx, dz, color: bodyOf(P),
        async knock() {   // the attacker walks up and knocks; the lights come on
          await goH(k, P, dx + 1.0, dz + 1.3, 5.2); hw(P, dx, 0, dz, v2); faceTo(k, v2.x, v2.z); k.manual = true;
          for (let i = 0; i < 2; i++) {
            await tween(0.07, (q) => { k.b.position.z = q * 0.3; k.b.rotation.x = q * 0.25; }, E.in);
            hw(P, dx + 0.15, 0.6, dz + 0.15); burst("spark", v1.x, v1.y, v1.z, 4, { sp: 0.5 }); shake(0.06); P.door = 0.06;
            await tween(0.08, (q) => { k.b.position.z = 0.3 * (1 - q); k.b.rotation.x = 0.25 * (1 - q); }, E.out);
          }
          k.manual = false; P.lightT = 1; hw(P, hu.window[0], hu.window[1] + 0.55, hu.window[2] + 0.2); icon("bang", v1.x, v1.y, v1.z, { ttl: 0.5, s: 0.45 }); await wait(0.08);
        },
        async out() { P.doorT = 1; v.g.visible = true; await wait(0.06); await goH(v, P, dx, dz + 0.75, 3.6); },   // the victim answers the door
      };
      if (method !== "vigilante" && method !== "duck") shot(P, 1.3, 2.1, 7.6, 0.3, 1.05, 1.0, 0.5);
      await (KILL[method] || KILL.fedora)(c);
      P.lightT = 0; await fadeTo(1, 0.2); await wait(0.15);
    });
  }

  // ---------- night: the other roles ----------
  // The Vigilante on a rooftop with a slingshot. Used for their own view (playShot) and for the victim's.
  async function sling(P, k, hit) {
    const Q = order[(P.i + 1) % order.length], r = Q.hu.roost || [0, Q.hu.top - 0.3, 0], [wx, wy, wz] = P.hu.window;
    hw(Q, r[0], r[1], r[2]); k.g.position.copy(v1); k.blob.visible = false; hw(P, wx, wy, wz, v3); const tx = v3.x, ty = v3.y, tz = v3.z; faceTo(k, tx, tz); snap(k); k.manual = true;
    const fork = held(k, new THREE.Group(), 0.3, 0.55, 0.5);
    fork.add(mesh(cyl(0.035, 0.035, 0.3, 5), toon("#8a5a34"), 0, 0, 0), turn(mesh(cyl(0.03, 0.03, 0.26, 5), toon("#8a5a34"), -0.09, 0.24, 0), 0, 0, 0.45), turn(mesh(cyl(0.03, 0.03, 0.26, 5), toon("#8a5a34"), 0.09, 0.24, 0), 0, 0, -0.45));
    const band = mesh(box(0.3, 0.03, 0.03), flat("#e8384f"), 0, 0.34, 0); fork.add(band);
    await shot(Q, 1.4, r[1] + 1.2, 6.2, r[0], r[1] + 0.5, 0, 0.55);
    await tween(0.4, (q) => { k.b.rotation.x = -0.3 * q; band.position.z = -0.3 * q; band.scale.z = 1 + q * 6; }, E.out);
    local(k, 0.3, 0.9, 0.5); const peb = temp(mesh(ball(0.09, 6, 5), toon("#b9b3c8")), v1.x, v1.y, v1.z);
    slowmo(0.3, 0.15); k.b.rotation.x = 0.2; band.position.z = 0; band.scale.z = 1; burst("dust", v1.x, v1.y, v1.z, 4, { sp: 0.6 });
    shot(P, 1.2, 2.0, 7, 0.3, 1.05, 0.9, 0.36, E.io);
    const mx = hit ? tx : tx + P.nz * 0.5, my = hit ? ty : ty + 0.75, mz = hit ? tz : tz - P.nx * 0.5;
    await arc(peb, mx, my, mz, 0.5, 0.36, () => burst("magic", peb.position.x, peb.position.y, peb.position.z, 1, { sp: 0.1, up: 0, c: "#ffffff", s: 0.8 }), E.in);
    if (hit) {
      peb.visible = false; shake(0.22); flash("#ffffff", 0.5, 0.15); burst("shard", tx, ty, tz, 14, { c: ["#bfe6ff", "#ffffff", "#8fc8ee"], sp: 0.7 }); burst("spark", tx, ty, tz, 6);
      P.light = P.lightT = 1; icon("bang", tx, ty + 0.6, tz, { ttl: 0.4, s: 0.6 }); await wait(0.2);
      for (let i = 0; i < 3; i++) icon("star", tx + (i - 1) * 0.35, ty + 0.5, tz + 0.1, { vy: 0.4, vx: (i - 1) * 0.5, ttl: 0.8, s: 0.4 });
      await wait(0.25); P.light = P.lightT = 0; icon("skull", tx, ty + 0.4, tz + 0.1, { ttl: 1, s: 0.7, vy: 0.6 }); await wait(0.55);
    } else {
      shake(0.08); burst("spark", mx, my, mz, 8); ring(mx, my, mz, "#fff6dc", 0.8, 0.3, 0.1, true);
      arc(peb, mx + P.nx * 3 + 2, my + 5, mz + P.nz * 3, 1.5, 0.7); await wait(0.3);
      P.lightT = 1; icon("quest", tx, ty + 0.6, tz + 0.1, { ttl: 0.9, s: 0.6 }); await wait(0.85);
    }
  }
  function playShot({ target, hit = true, look } = {}) {
    return play(async (sc) => {
      const P = players.get(target); if (!P) return; sc.touched.add(P);
      await sling(P, extra("vigilante", cleanLook(look) || myPlayer().look), hit); await wait(0.15);
    });
  }
  function playSave({ target, cause } = {}) {
    return play(async (sc) => {
      const P = players.get(target); if (!P) return; sc.touched.add(P);
      const k = extra(cause === "serial" ? "serialkiller" : "mafia", { ...DEFAULT_LOOK, body: "charcoal" }, { shadow: true }), R = Math.max(2.1, P.hu.top * 0.8), top = 0.7 + R;
      putH(k.g, P, 6.5, 0, 4.2); shot(P, 1.6, 2.5, 9.2, 0.3, 1.5, 0.8, 0.6);
      const sh = temp(makeShield(), P.x, 0.7, P.z); await wait(0.3);
      ring(P.x, 0.08, P.z, "#9be7ff", R * 1.5, 0.5); glow(P.x, 2.4, P.z + 0, "#9be7ff", 18, 0.7); burst("magic", P.x, 1.5, P.z, 20, { r: 1.5 });
      await tween(0.4, (q) => sh.scale.setScalar(R * q), E.back);
      const wobble = () => tween(0.45, (q, raw) => { const w = Math.sin(raw * 22) * 0.09 * (1 - raw); sh.scale.set(R * (1 + w), R * (1 - w), R * (1 + w)); }, E.lin);
      const boing = (x, y, z) => { ring(x, y, z, "#ffffff", 1.6, 0.35, 0.2, true); burst("spark", x, y, z, 12, { c: ["#9be7ff", "#ffffff", "#d8f6ff"] }); shake(0.2); flash("#bfefff", 0.45, 0.18); wobble(); };
      if (cause === "piano" || cause === "anvil" || cause === "boot") {
        goH(k, P, 3.4, 3.4, 5);
        const o = temp(buildProp(cause), P.x, 12, P.z); o.scale.setScalar(cause === "boot" ? 2.2 : 1.35);
        await wait(0.2); await tween(0.32, (q) => { o.position.y = 12 - (12 - top) * q; }, E.in);
        boing(P.x, top, P.z); icon("bang", k.g.position.x, 1.8, k.g.position.z, { ttl: 0.6 });
        hw(P, 7, 0, 3, v3); await arc(o, v3.x, 14, v3.z, 2, 0.6, (q) => { o.rotation.z = q * 7; o.rotation.x = q * 4; }, E.out);
      } else if (cause === "vigilante") {
        k.g.visible = false; hw(P, 7, 6, 5); const peb = temp(mesh(ball(0.1, 6, 5), toon("#b9b3c8")), v1.x, v1.y, v1.z);
        hw(P, 0.9, 1.6, R * 0.8, v3); await wait(0.2); await arc(peb, v3.x, v3.y, v3.z, 0.4, 0.3, null, E.in); boing(v3.x, v3.y, v3.z);
        hw(P, 5, 0, 6, v2); await arc(peb, v2.x, 9, v2.z, 2, 0.6);
      } else {
        const id = ["mallet", "pie", "muffin", "tickle", "bees", "duck", "banana"].includes(cause) ? cause : null;
        if (id) { const pr = held(k, buildProp(id), 0, id === "mallet" || id === "tickle" ? 0.4 : 1.15, id === "mallet" || id === "tickle" ? 0.45 : 0); pr.scale.setScalar(0.8); if (id === "mallet" || id === "tickle") pr.rotation.x = 0.6; }
        await goH(k, P, 0.9, R + 0.2, 7); local(k, 0, 0.7, 0.5); boing(v1.x, v1.y, v1.z); k.manual = true; k.blob.visible = false;
        hw(P, 3.8, 0, R + 2.6, v3);
        await arc(k.g, v3.x, 0, v3.z, 1.8, 0.55, (q) => { const th = q * TAU; k.b.rotation.x = th; k.b.position.y = 0.55 * (1 - Math.cos(th)); k.b.position.z = -0.55 * Math.sin(th); });
        k.b.rotation.x = 0; k.b.position.set(0, 0, 0); k.b.scale.set(1.25, 0.7, 1.25); impact(v3.x, 0, v3.z, 0.7); dizzy(k); await wait(0.3);
        k.b.scale.set(1, 1, 1); k.manual = false; k.blob.visible = true; goH(k, P, 9, 6, 7);
      }
      icon("heart", P.x, top + 0.5, P.z, { ttl: 0.9, s: 0.8 }); burst("magic", P.x, top, P.z, 12, { r: 1 }); await wait(0.55);
      await fadeShield(sh);
    });
  }
  function playAngel({ target, look } = {}) {
    return play(async (sc) => {
      const P = players.get(target); if (!P) return; sc.touched.add(P);
      const a = extra("angel", cleanLook(look) || myPlayer().look), R = Math.max(2.1, P.hu.top * 0.8), top = P.hu.top; a.blob.visible = false; a.manual = true;
      hw(P, -7, top + 4.5, 2, v3); a.g.position.copy(v3); const sx = v3.x, sy = v3.y, sz = v3.z; hw(P, 0, top + 1.3, 1.0, v3); const hx = v3.x, hy = v3.y, hz = v3.z;
      a.face = Math.atan2(hx - sx, hz - sz); snap(a); shot(P, 1.4, 3.4, 11.5, 0.2, top * 0.5 + 1.6, 0.6, 0.6);
      const trail = () => { if (Math.random() < 0.7) burst("magic", a.g.position.x, a.g.position.y + 0.4, a.g.position.z, 1, { sp: 0.3, up: 0.2 }); };
      await tween(0.95, (q, raw) => { a.g.position.set(sx + (hx - sx) * q, sy + (hy - sy) * q + Math.sin(raw * PI) * 0.8, sz + (hz - sz) * q); a.b.rotation.x = 0.45 * (1 - q); trail(); }, E.out3);
      a.face = Math.atan2(P.nx, P.nz); a.b.rotation.x = 0;
      const orb2 = temp(mesh(ball(0.3, 10, 8), flat("#d8f6ff")), hx, hy - 0.25, hz); orb2.scale.setScalar(0.01); glow(hx, hy, hz, "#bfefff", 14, 0.8);
      await tween(0.3, (q, raw) => { orb2.scale.setScalar(q); a.g.position.y = hy + Math.sin(raw * PI) * 0.15; if (Math.random() < 0.5) burst("magic", hx, hy - 0.25, hz, 1, { r: 0.4 }); }, E.back);
      await tween(0.3, (q) => { orb2.position.set(hx + (P.x - hx) * q, hy - 0.25 + (0.9 - hy) * q, hz + (P.z - hz) * q); }, E.in);
      orb2.visible = false; const sh = temp(makeShield(), P.x, 0.7, P.z);
      ring(P.x, 0.08, P.z, "#9be7ff", R * 1.6, 0.55); flash("#d8f6ff", 0.5, 0.3); glow(P.x, 2.2, P.z, "#9be7ff", 20, 0.7); burst("magic", P.x, 1.4, P.z, 26, { r: 1.5 }); burst("feather", hx, hy, hz, 10);
      tween(0.45, (q) => sh.scale.setScalar(R * q), E.back);
      await tween(0.55, (q, raw) => { a.b.rotation.y = q * TAU * 2; a.g.position.y = hy + Math.sin(raw * PI) * 0.5; trail(); }, E.io);
      hw(P, 7, top + 6, 1, v3); const ex = v3.x, ey = v3.y, ez = v3.z; a.face = Math.atan2(ex - hx, ez - hz);
      await tween(0.6, (q) => { a.g.position.set(hx + (ex - hx) * q, hy + (ey - hy) * q, hz + (ez - hz) * q); a.b.rotation.x = 0.4 * q; trail(); }, E.in);
      await wait(0.2); await fadeShield(sh);
    });
  }
  function playPeek({ target, result = "innocent", look } = {}) {
    return play(async (sc) => {
      const P = players.get(target); if (!P) return; sc.touched.add(P);
      const d = extra("detective", cleanLook(look) || myPlayer().look), [wx, wy, wz] = P.hu.window, low = wy < 1.3 ? wy : 0.95;
      putH(d.g, P, wx + 3.6, 0, wz + 2.6); shot(P, wx + 1.1, 1.9, 7, wx + 0.2, 0.95, 0.9, 0.6);
      await goH(d, P, wx + 0.2, wz + 0.85, 3, true); hw(P, wx, 0, wz, v3); faceTo(d, v3.x, v3.z); d.manual = true;
      const mag = held(d, new THREE.Group(), 0.12, low - 0.1, 0.62); mag.scale.setScalar(0.01);
      mag.add(mesh(new THREE.TorusGeometry(0.2, 0.045, 6, 14), toon("#ffcf3f")), mesh(new THREE.CircleGeometry(0.19, 12), flat("#bfefff"), 0, 0, -0.01), mesh(box(0.07, 0.3, 0.06), toon("#8a5a34"), 0, -0.36, 0));
      P.lightT = 0.4;
      await tween(0.25, (q) => { d.b.rotation.x = 0.2 * q; mag.scale.setScalar(q); }, E.back);
      local(d, 0.12, low + 0.1, 0.7); icon("star", v1.x, v1.y, v1.z, { vy: 0, ttl: 0.4, s: 0.5 }); flash("#ffffff", 0.25, 0.12);
      await tween(0.5, (q, raw) => { mag.position.x = 0.12 + Math.sin(raw * TAU) * 0.12; d.b.position.y = Math.abs(Math.sin(raw * TAU)) * 0.05; }, E.lin);
      icon("bang", d.g.position.x, 1.9, d.g.position.z, { ttl: 0.6, s: 0.6 });
      const guilty = result === "mafia";
      ui.photo.src = portrait(null, P.look); ui.stamp.textContent = guilty ? "MAFIA" : "INNOCENT"; ui.stamp.className = "stg-stamp " + (guilty ? "mafia" : "innocent");
      if (!skipping) ui.file.classList.add("on");
      await wait(0.22); shake(0.25); flash("#ffffff", 0.45, 0.15);
      await wait(0.45); if (!skipping) ui.stamp.classList.add("on");
      await wait(0.14); shake(0.4); flash(guilty ? "#ff3b5c" : "#7dffb0", 0.5, 0.25);
      await wait(0.95);
    });
  }
  function playFrame({ target, look } = {}) {
    return play(async (sc) => {
      const P = players.get(target); if (!P) return; sc.touched.add(P);
      const f = extra("framer", cleanLook(look) || myPlayer().look), dx = P.hu.doorX, dz = P.hu.doorZ;
      putH(f.g, P, dx + 4.2, 0, dz + 3); shot(P, 1.3, 1.9, 7, 0.3, 0.85, 1.1, 0.6);
      await goH(f, P, dx + 0.8, dz + 1.35, 3.2, true); hw(P, dx, 0, dz + 0.5, v3); const x = v3.x, z = v3.z; faceTo(f, x, z); await wait(0.15);
      local(f, 0.2, 0.95, 0.4); const hat = temp(buildProp("fedora"), v1.x, v1.y, v1.z); hat.scale.setScalar(0.55);
      await arc(hat, x, 0.1, z, 0.55, 0.36, (q) => { hat.rotation.x = q * TAU; }); hat.rotation.x = 0;
      burst("smoke", x, 0.25, z, 9, { c: ["#b04de0", "#8f4bff", "#d9a0ff"], s: 0.7, sp: 1.3 }); ring(x, 0.08, z, "#b04de0", 1.3, 0.4); shake(0.06);
      act(f, "laugh"); await wait(0.55); f.emote = null;
      goH(f, P, dx + 7, dz + 1.6, 4, true); await wait(0.3); shot(P, 0.5, 1.1, 4.6, dx, 0.3, dz + 0.5, 0.8); await wait(0.75);
      icon("star", x + 0.2, 0.5, z, { vy: 0, ttl: 0.45, s: 0.45 }); burst("magic", x, 0.3, z, 8, { c: ["#d9a0ff", "#ffffff"] }); await wait(0.6);
    });
  }
  // The killer's own view of the night: sneak to the door, knock, and see how it went. Same framing and length as the others.
  function playStalk({ target, look, role = "mafia", outcome = "killed" } = {}) {
    return play(async (sc) => {
      const P = players.get(target); if (!P) return; sc.touched.add(P);
      const k = extra(role, cleanLook(look) || myPlayer().look), hu = P.hu, dx = hu.doorX, dz = hu.doorZ;
      putH(k.g, P, dx + 4.4, 0, dz + 3.2); P.lightT = 0; shot(P, 1.3, 2.0, 7.4, 0.3, 0.9, 1.0, 0.5);
      await goH(k, P, dx + 1.0, dz + 1.3, 3.0, true);
      if (outcome === "overruled") {
        act(k, "shrug"); caption("The crew picked another door tonight.", 1.8); await wait(1.2); k.emote = null;
        goH(k, P, dx + 6, dz + 2.4, 3.4, true); await wait(0.7); return;
      }
      hw(P, dx, 0, dz, v2); faceTo(k, v2.x, v2.z); k.manual = true;
      for (let i = 0; i < 2; i++) {
        await tween(0.07, (q) => { k.b.position.z = q * 0.3; k.b.rotation.x = q * 0.25; }, E.in);
        hw(P, dx + 0.15, 0.6, dz + 0.15); burst("spark", v1.x, v1.y, v1.z, 4, { sp: 0.5 }); shake(0.05); P.door = 0.06;
        await tween(0.08, (q) => { k.b.position.z = 0.3 * (1 - q); k.b.rotation.x = 0.25 * (1 - q); }, E.out);
      }
      k.manual = false; P.lightT = 1; await wait(0.3);
      if (outcome === "blocked") {   // a shield of light throws the attacker back
        hw(P, dx, 1.3, dz + 0.3, v3); const sx = v3.x, sy = v3.y, sz = v3.z;
        glow(sx, sy, sz, "#ffe9a8", 14, 0.6); ring(sx, sy, sz, "#ffe9a8", 2.2, 0.5, 0.3, true); flash("#fff6d8", 0.35, 0.18); shake(0.14);
        burst("magic", sx, sy, sz, 16, { c: ["#ffe9a8", "#ffffff", "#9be7ff"], sp: 1.6 });
        icon("bang", k.g.position.x, 1.7, k.g.position.z, { ttl: 0.6, s: 0.6 });
        await goH(k, P, dx + 2.8, dz + 3.2, 8); act(k, "sweat"); caption("A shield of light. Someone is watching over them.", 2);
        await wait(1.1); k.emote = null;
      } else {   // in they go: the door shuts, the lights stutter, then darkness
        P.doorT = 1; await wait(0.15); await goH(k, P, dx, dz + 0.3, 3.4); k.g.visible = false; P.doorT = 0;
        for (let i = 0; i < 5; i++) {
          P.lightT = i % 2 ? 1 : 0; shake(0.07);
          hw(P, hu.window[0], hu.window[1] + 0.4, hu.window[2] + 0.2); burst("dust", v1.x, v1.y, v1.z, 3, { sp: 0.7 });
          await wait(0.13);
        }
        P.lightT = 0; hw(P, dx, 1.7, dz + 0.4, v3); icon("skull", v3.x, v3.y, v3.z, { ttl: 0.9, s: 0.6 }); await wait(0.7);
      }
      P.lightT = 0; await fadeTo(1, 0.2); await wait(0.15);
    });
  }
  // Footsteps and a rattling door at night: pure atmosphere, played at random on any house, never tied to real moves.
  const nap = (s) => new Promise((r) => setTimeout(r, s * 1000));
  async function rattle(id) {
    const P = players.get(id); if (!P || disposed || phase !== "night") return;
    const dx = P.hu.doorX, dz = P.hu.doorZ;
    for (let j = 0; j < 3; j++) { P.door = 0.09; hw(P, dx, 0.5, dz + 0.2); burst("dust", v1.x, v1.y, v1.z, 2, { sp: 0.5 }); shake(0.03); await nap(0.17); }
    hw(P, dx + 0.5, 1.4, dz + 0.6); icon("quest", v1.x, v1.y, v1.z, { ttl: 0.9, s: 0.45 });
  }
  const DREAMS = ["sheep", "snore", "talk"];
  const MUMBLES = ["zzz... not the muffins...", "five more minutes...", "mmm... jelly...", "who took my hat...", "zzz... I counted them twice...", "no, YOU look suspicious..."];
  function makeSheep() {
    const g = new THREE.Group();
    g.add(squash(mesh(ball(0.2, 8, 6), toon("#ffffff"), 0, 0.22, 0), 1.25, 1, 1), mesh(ball(0.1, 6, 5), toon("#3a3050"), 0.26, 0.28, 0), mesh(ball(0.08, 6, 5), toon("#ffffff"), 0.2, 0.38, 0), mesh(ball(0.07, 6, 5), toon("#ffffff"), -0.25, 0.26, 0));
    for (const x of [-0.12, 0.12]) g.add(mesh(box(0.05, 0.14, 0.05), toon("#3a3050"), x, 0.05, 0.06), mesh(box(0.05, 0.14, 0.05), toon("#3a3050"), x, 0.05, -0.06));
    return g;
  }
  // What a player with no night action sees: their own house, dreaming. The same framing and length as every other night scene.
  function playDream({ kind, id } = {}) {
    return play(async (sc) => {
      const P = players.get(id) || myPlayer(); if (!P) return;
      if (!DREAMS.includes(kind)) kind = DREAMS[(Math.random() * 3) | 0];
      const top = P.hu.top, s = P.hu.smoke; hw(P, s[0], s[1], s[2], v3); const cx = v3.x, cy = v3.y, cz = v3.z;
      const zed = (big) => icon("zed", cx + rnd(-0.1, 0.1), cy + 0.2, cz, { vy: 0.9, vx: 0.25, ttl: 1.3, s: big ? 0.75 : 0.5, sway: 0.6 });
      shot(P, 1.1, 2.6, 9, 0.2, kind === "sheep" ? 2.1 : 1.6, 0.6, 0.6); await wait(0.45);
      if (kind === "sheep") {
        const yaw2 = P.house.rotation.y, cy2 = Math.min(top, 3) + 0.95, cl = temp(new THREE.Group()); putH(cl, P, -0.5, cy2, 0.9); cl.rotation.y = yaw2; cl.scale.setScalar(0.01);
        for (const [x, y, r] of [[-1.0, 0, 0.5], [-0.4, 0.2, 0.62], [0.3, 0.25, 0.66], [0.95, 0.02, 0.5], [0, -0.15, 0.6], [-0.6, -0.2, 0.45], [0.6, -0.2, 0.45]]) cl.add(mesh(ball(r, 8, 6), flat(r > 0.55 ? "#ffffff" : "#eee9ff"), x, y, -0.3));
        for (const x of [-0.25, 0, 0.25]) cl.add(mesh(box(0.06, 0.34, 0.06), toon("#8a5a34"), x, -0.02, 0.32));
        cl.add(mesh(box(0.64, 0.05, 0.04), toon("#b0743c"), 0, 0.06, 0.32), mesh(box(0.64, 0.05, 0.04), toon("#b0743c"), 0, -0.07, 0.32));
        for (let i = 0; i < 3; i++) { const p = temp(mesh(ball(0.1 + i * 0.07, 6, 5), flat("#ffffff"))); putH(p, P, s[0] + (0.75 - s[0]) * ((i + 1) / 4), s[1] + 0.2 + (cy2 - 0.35 - s[1]) * ((i + 1) / 4), s[2] + (0.9 - s[2]) * ((i + 1) / 4)); p.scale.setScalar(0.01); tween(0.2 + i * 0.1, (q) => p.scale.setScalar(q), E.back); }
        await wait(0.25); await tween(0.3, (q) => cl.scale.setScalar(q * 0.85), E.back); zed();
        for (let i = 0; i < 3; i++) {
          const sp = makeSheep(); sp.position.set(-1.15, -0.2, 0.34); cl.add(sp); caption(["One...", "Two...", "Three..."][i], 0.75);
          await tween(0.62, (q) => { sp.position.x = -1.15 + q * 2.3; sp.position.y = -0.2 + Math.sin(q * PI) * 0.62; sp.rotation.z = (0.5 - q) * 0.8; }, E.lin);
          sp.visible = false; burst("cloud", cl.position.x + P.nz * 0.95, cl.position.y - 0.1, cl.position.z - P.nx * 0.95, 3, { sp: 0.4, s: 0.6 }); if (i === 1) zed(true); await wait(0.1);
        }
        await tween(0.2, (q) => cl.scale.setScalar(0.85 * (1 - q * 0.99)), E.in); cl.visible = false;
      } else if (kind === "snore") {
        const h = P.house; sc.undo.push(() => h.scale.set(1, 1, 1));
        for (let i = 0; i < 3; i++) {
          await tween(0.45, (q) => h.scale.set(1 + q * 0.06, 1 + q * 0.09, 1 + q * 0.06), E.io);
          zed(true); burst("cloud", cx, cy, cz, 4, { sp: 0.7, up: 1.6, s: 0.7 }); shake(0.07); ring(P.x, 0.08, P.z, "#ffffff", 2.6, 0.5, 1.2);
          await tween(0.32, (q) => h.scale.set(1.06 - q * 0.06, 1.09 - q * 0.09, 1.06 - q * 0.06), E.out); if (i < 2) await wait(0.08);
        }
        const [wx, wy, wz] = P.hu.window, bub = temp(mesh(ball(0.3, 10, 8), Object.assign(new THREE.MeshBasicMaterial({ color: "#bfefff", transparent: true, opacity: 0.55, depthWrite: false }), { userData: { own: true } }))); putH(bub, P, wx, wy, wz + 0.3); bub.scale.setScalar(0.01);
        await tween(0.4, (q) => bub.scale.setScalar(q), E.out); bub.visible = false; burst("magic", bub.position.x, bub.position.y, bub.position.z, 10); ring(bub.position.x, bub.position.y, bub.position.z, "#bfefff", 0.8, 0.3, 0.2, true); await wait(0.25);
      } else {
        const lines = MUMBLES.slice().sort(() => Math.random() - 0.5);
        for (let i = 0; i < 2; i++) {
          if (!skipping) say(P, lines[i], 1.35, true); zed(i === 1);
          await tween(0.3, (q, raw) => { P.house.rotation.z = Math.sin(raw * TAU) * 0.03; }, E.lin); P.house.rotation.z = 0; await wait(1.2);
        }
        hush();
      }
      await wait(0.2);
    });
  }

  // ---------- speech bubbles ----------
  function say(P, text, dur, atHouse) {
    text = String(text ?? "").replace(/\s+/g, " ").trim(); if (!text) return;
    if (text.length > 90) text = text.slice(0, 88) + "...";
    const b = ui.bubbles.find((q) => q.P === P) || ui.bubbles.find((q) => !q.P) || ui.bubbles.reduce((m, q) => (q.until < m.until ? q : m));
    b.P = P; b.house = !!atHouse; b.until = now + (dur ?? clamp(1.6 + text.length * 0.06, 2.4, 6)); b.el.textContent = text;
    b.el.classList.remove("on"); b.w = b.el.offsetWidth; b.h = b.el.offsetHeight; b.x = b.y = -1; b.el.classList.add("on");
  }
  const hush = () => { for (const b of ui.bubbles) { b.until = 0; b.P = null; b.el.classList.remove("on"); } };
  function stepBubbles() {
    for (const b of ui.bubbles) {
      const P = b.P; if (!P) continue;
      if (b.until <= now || hide) { b.el.classList.remove("on"); b.P = null; continue; }
      const a = !P.alive && P.ghostA && P.ghostA.g.visible ? P.ghostA : P.a;
      if (b.house || !a.g.visible) v1.set(P.x, P.hu.top + 0.25, P.z); else v1.set(a.g.position.x, a.g.position.y + a.b.position.y + (a.tall ? 1.8 : 1.45), a.g.position.z);
      v1.project(camera);
      const top = root.classList.contains("cine") ? Math.ceil(H * 0.08) + 4 : 4;   // keep clear of the cinema bar during a scene
      const x = Math.round(clamp((v1.x * 0.5 + 0.5) * W - b.w / 2, 4, W - b.w - 4)), y = Math.round(Math.max(top, (-v1.y * 0.5 + 0.5) * H - b.h - 12));
      if (x !== b.x || y !== b.y) { b.x = x; b.y = y; b.el.style.transform = `translate(${x}px,${y}px)`; }
    }
  }

  // ---------- dawn ----------
  const TOMBFX = {
    stone(x, z) { impact(x, 0, z, 0.7); },
    ghostpop(x, z) {
      flash("#ffffff", 0.35, 0.2); ring(x, 0.6, z, "#ffffff", 1.8, 0.45, 0.2, true); burst("cloud", x, 0.7, z, 16, { sp: 1.6 });
      for (let i = 0; i < 3; i++) icon("skull", x + (i - 1) * 0.5, 1.2, z, { vy: 1 + i * 0.2, vx: (i - 1) * 0.4, ttl: 1, s: 0.45, sway: 1 });
    },
    bloom(x, z) { ring(x, 0.08, z, "#7dffb0", 2, 0.5); burst("petal", x, 0.5, z, 32, { sp: 1.2 }); icon("heart", x, 1.5, z, { ttl: 1, s: 0.6 }); glow(x, 1, z, "#ffb3d9", 10, 0.5); },
    shatter(x, z) { flash("#7de8ff", 0.4, 0.15); shake(0.25); burst("shard", x, 0.6, z, 38, { sp: 1.2 }); ring(x, 0.5, z, "#ff7ad9", 2, 0.35, 0.2, true); },
    casket(x, z) { impact(x, 0, z, 1.3); burst("smoke", x, 0.4, z, 12, { sp: 1.6 }); },
    ufo(x, z) {
      glow(x, 2, z, "#a4ff7a", 26, 1); ring(x, 0.08, z, "#a4ff7a", 2.2, 0.6); burst("magic", x, 0.5, z, 22, { c: ["#a4ff7a", "#ffffff", "#d8ffb0"], up: 2.6 });
      const beam = temp(mesh(new THREE.CylinderGeometry(0.2, 0.75, 9, 10, 1, true), Object.assign(new THREE.MeshBasicMaterial({ color: "#a4ff7a", transparent: true, opacity: 0.4, depthWrite: false, side: THREE.DoubleSide }), { userData: { own: true } })), x, 4.6, z);
      tween(0.9, (q, raw) => { const w = Math.sin(raw * PI); beam.scale.set(w, 1, w); }, E.lin).then(() => { beam.visible = false; });
    },
  };
  function clueInfo(clue) {
    const { trait, value, text } = clue, name = (rack) => rack.find((i) => i.id === value)?.name || String(value ?? "");
    if (trait === "head" || trait === "hat") return { kind: "feather", text: text || (value === "none" ? "No hat feathers were found at the scene" : `A feather from a ${name(HEADS)} was found`) };
    if (trait === "body" || trait === "color" || trait === "colour") return { kind: "prints", color: BODIES.find((b) => b.id === value)?.colors[0] || "#6b4326", text: text || `Muddy footprints with ${name(BODIES)} smudges were found` };
    if (trait === "pack" || trait === "button") return { kind: "button", text: text || (value === "none" ? "No backpack threads were found at the scene" : `A button from a ${name(PACKS)} was found`) };
    return { kind: "button", text: text || (value ? `A clue was found: ${value}` : "A strange clue was found") };
  }
  function makeClue(info) {
    const g = new THREE.Group();
    if (info.kind === "feather") { const f = buildProp("tickle"); f.scale.setScalar(0.7); f.rotation.set(1.35, 0, 0.6); f.position.y = 0.12; g.add(f); }
    else if (info.kind === "prints") for (let i = 0; i < 5; i++) { const s = i % 2 ? 1 : -1; g.add(mesh(box(0.16, 0.03, 0.24), flat("#5e3b1f"), s * 0.14, 0.03, -0.7 + i * 0.35), mesh(box(0.16, 0.03, 0.09), flat("#5e3b1f"), s * 0.14, 0.03, -0.5 + i * 0.35), mesh(box(0.08, 0.035, 0.1), flat(info.color), s * 0.14 + 0.02, 0.035, -0.68 + i * 0.35)); }
    else { const b = new THREE.Group(); b.add(mesh(cyl(0.26, 0.26, 0.07, 12), toon("#ffcf3f")), mesh(cyl(0.2, 0.2, 0.09, 12), toon("#e8a02c"))); for (const [x, z] of [[-0.07, -0.07], [0.07, -0.07], [-0.07, 0.07], [0.07, 0.07]]) b.add(mesh(box(0.05, 0.1, 0.05), flat("#1c1330"), x, 0, z)); b.rotation.set(1.0, 0, 0.3); b.position.y = 0.22; g.add(b); }
    return g;
  }
  function playDawn({ dead = [], saved = false, clue = null } = {}) {
    return play(async (sc) => {
      const gone = dead.map((d) => players.get(d.id)).filter(Boolean);
      for (const P of gone) { P.alive = false; P.tok++; P.inside = false; P.a.g.visible = false; P.lightT = 0; P.doorT = 0; setGhost(P.id, false); }
      setPhase("dawn"); snapYaw();
      camTo(Math.sin(yaw) * (ringR - 1.4), 2.5, Math.cos(yaw) * (ringR - 1.4), -Math.sin(yaw) * 2, 1.1, -Math.cos(yaw) * 2, 1.2, E.io);
      await wait(Math.min(2.6, 1.3 + order.length * 0.12));
      for (const d of dead) {
        const P = players.get(d.id); if (!P) continue;
        const dx = P.hu.doorX, dz = P.hu.doorZ, style = TOMBFX[d.tomb] ? d.tomb : P.look.tomb;
        shot(P, 0.5, 2.0, 7.6, -0.4, 0.95, 1.2, 0.6); await wait(0.55);
        for (let j = 0; j < 2; j++) { P.door = 0.09; hw(P, dx, 0.5, dz + 0.2); burst("dust", v1.x, v1.y, v1.z, 2, { sp: 0.5 }); shake(0.04); await wait(0.17); }   // the door rattles but stays shut
        hw(P, dx, 1.3, dz + 0.3); icon("quest", v1.x, v1.y, v1.z, { ttl: 0.7, s: 0.5 }); await wait(0.3);
        const t = setTomb(P, true, style), tx = t.position.x, tz = t.position.z; t.position.y = -1.4; shake(0.08);
        await tween(0.5, (q) => { t.position.y = -1.4 * (1 - q); if (Math.random() < 0.6) burst("dust", tx + rnd(-0.4, 0.4), 0.1, tz + rnd(-0.3, 0.3), 1, { sp: 0.8 }); shake(0.03); }, E.back);
        TOMBFX[style](tx, tz);
        const g = extra(d.role || null, P.look, { ghost: true }); g.manual = true; g.g.position.set(tx, 0.2, tz); g.face = Math.atan2(camPos.x - tx, camPos.z - tz); snap(g); g.g.scale.setScalar(0.75);   // their spirit drifts up, in costume when the role is revealed
        tween(1.15, (q, raw) => { g.g.position.y = 0.3 + q * 2.4; g.b.rotation.z = Math.sin(raw * 9) * 0.16; g.g.scale.setScalar(0.75 * Math.min(1, (1 - raw) * 5 + 0.01)); }, E.out).then(() => { g.g.visible = false; });
        await wait(1.3);
      }
      if (saved) {
        const S = players.get(saved), x = S ? S.x : 0, z = S ? S.z : 0, R = S ? Math.max(2.1, S.hu.top * 0.8) : 2.4, y = S ? 0.7 : 1.6;
        if (S) shot(S, 1.5, 2.5, 9.2, 0.3, 1.5, 0.8, 0.6); else shotAt(0, 1.8, 0, 6.6, 2.2, 0.6);
        const sh = temp(makeShield(), x, y, z); await wait(0.3);
        await tween(0.4, (q) => sh.scale.setScalar(R * q), E.back); burst("magic", x, y + R * 0.5, z, 12, { r: R * 0.6 }); await wait(0.4);
        sh.visible = false; flash("#d8f6ff", 0.5, 0.25); shake(0.1); ring(x, y + R * 0.3, z, "#9be7ff", R * 1.7, 0.5, R * 0.8, true);
        burst("magic", x, y + R * 0.3, z, 40, { r: R * 0.7, sp: 1.8 }); burst("confetti", x, y + R * 0.3, z, 16, { c: ["#9be7ff", "#ffffff", "#ffe9a0"], r: R * 0.5 });
        caption("Someone was saved tonight", 1.9); await wait(1.9);
      }
      if (clue) {
        const info = clueInfo(clue), at = gone[0];
        if (at) hw(at, 1.0, 0.05, 2.3, v3); else v3.set(0, 0.07, 0);
        const x = v3.x, z = v3.z, o = temp(makeClue(info), x, v3.y, z); o.rotation.y = at ? at.house.rotation.y : yaw; o.scale.setScalar(0.01);
        if (at) shot(at, 1.6, 1.7, 5.6, 1.0, 0.3, 2.3, 0.7); else shotAt(x, 0.3, z, 3.0, 2.3, 0.7);
        await wait(0.35); ring(x, 0.08, z, "#ffe14a", 1.5, 0.45); burst("magic", x, 0.3, z, 12, { c: ["#ffe14a", "#ffffff", "#fff3b0"] });
        await tween(0.25, (q) => o.scale.setScalar(q), E.back); caption(info.text, 2.5);
        await wait(0.5); icon("star", x + 0.3, 0.6, z, { vy: 0, ttl: 0.45, s: 0.45 }); icon("quest", x, 1.2, z, { ttl: 1.1, s: 0.6, vy: 0.3 }); await wait(2);
      }
      await wait(0.15);
    });
  }

  // ---------- trial and exile ----------
  function spot(on) { spotOn = on; if (spotCone) spotCone.visible = on; spotLight.intensity = on ? 22 : 0; spotLight.position.set(Math.sin(yaw) * 1.2, 3.2, Math.cos(yaw) * 1.2); dimT = on ? 0.5 : 1; }
  function wake(P) { if (P.inside) { P.tok++; P.inside = false; settle(P, true); } }
  function playTrial({ accused } = {}) {
    return play(async () => {
      const P = players.get(accused); if (!P || !P.alive) return;
      if (phase !== "trial") setPhase("trial");
      for (const Q of order) if (Q.alive) { Q.tok++; wake(Q); Q.a.g.position.y = 0; }
      const a = P.a, others = order.filter((Q) => Q.alive && Q !== P); podT = 1; snapYaw();
      others.forEach((Q, i) => {   // the town gathers behind and beside the podium; the camera side stays open
        const an = yaw + PI + ((i + 0.5) / others.length - 0.5) * 3.1, r = Math.min(plaza - 0.3, 2.7 + (i % 2) * 0.8);
        go(Q.a, Math.sin(an) * r, Math.cos(an) * r, 2.8).then(() => faceTo(Q.a, 0, 0));
      });
      shotAt(0, 1.1, 0, 5.6, 2.0, 0.9);
      if (a.walk) { const w = a.walk; a.walk = null; w.res(); }
      const ax = a.g.position.x, az = a.g.position.z, d0 = Math.hypot(ax, az) || 1, sx = (ax / d0) * 1.45, sz = (az / d0) * 1.45;
      faceTo(a, 0, 0); icon("bang", ax, 1.8, az, { ttl: 0.6, s: 0.6 }); await wait(0.3);
      if (d0 > 1.5) {   // lassoed and dragged in, heels dug into the cobbles
        const rope = temp(mesh(box(0.05, 0.05, 1), flat("#c9a46a"))), loop = held(a, mesh(new THREE.TorusGeometry(0.56, 0.045, 5, 14), toon("#c9a46a")), 0, 0.5, 0); loop.rotation.x = PI / 2; a.manual = true;
        await tween(Math.min(1.1, 0.5 + d0 * 0.12), (q, raw) => {
          const x = ax + (sx - ax) * q, z = az + (sz - az) * q; a.g.position.x = x; a.g.position.z = z; a.b.rotation.x = -0.4; a.b.position.y = Math.abs(Math.sin(raw * 40)) * 0.06;
          rope.position.set(x / 2, 0.7, z / 2); rope.lookAt(x, 0.5, z); rope.scale.z = Math.hypot(x, z);
          if (Math.random() < 0.7) burst("dust", x, 0.1, z, 1, { sp: 0.7 });
        }, E.in);
        rope.visible = false; loop.visible = false; a.b.rotation.x = 0;
      }
      a.manual = true; a.blob.visible = false;
      await arc(a.g, 0, 0.52, 0, 1.0, 0.38, (q) => { a.b.rotation.x = 0; a.b.position.y = 0; });
      a.face = yaw; a.blob.visible = true;
      spot(true); flash("#fff6dc", 0.5, 0.2); shake(0.14); ring(0, 0.56, 0, "#fff2b8", 2.6, 0.5); burst("dust", 0, 0.6, 0, 10, { flat: true, sp: 1.5 });
      await tween(0.25, (q) => { a.b.scale.set(1.25 - 0.25 * q, 0.7 + 0.3 * q, 1.25 - 0.25 * q); }, E.back);
      a.manual = false; act(a, "sweat"); shotAt(0, 1.3, 0, 4.4, 1.2, 0.9); await wait(1.0);
    });
  }
  function playExile({ id, mode = "classic", jester = false } = {}) {
    return play(async () => {
      const P = players.get(id); if (!P) return;
      let a = P.a; P.tok++;
      if (!(a.g.position.y > 0.4)) { wake(P); podT = podV = 1; podium.visible = true; podium.position.y = 0; a.g.visible = true; a.g.position.set(0, 0.52, 0); a.face = yaw; snap(a); spot(true); }
      if (a.walk) { const w = a.walk; a.walk = null; w.res(); }
      a.emote = null; snapYaw(); shotAt(0, 1.5, 0, 5.8, 2.0, 0.6);
      const rx2 = Math.cos(yaw), rz2 = -Math.sin(yaw), others = order.filter((Q) => Q.alive && Q !== P);   // screen-right in the world
      if (jester) {   // the hat was a jester cap all along
        await wait(0.5); slowmo(0.3, 0.25);
        const j = makeActor("jester", P.look); j.g.position.copy(a.g.position); j.face = yaw; snap(j); dropActor(a); P.a = a = j; P.role = "jester";
        flash("#ffe14a", 0.7, 0.3); shake(0.25); ring(0, 0.6, 0, "#ffe14a", 3.4, 0.6); spot(false);
        for (const s of [-1, 0, 1]) burst("confetti", s * rx2 * 1.8, 0.8, s * rz2 * 1.8, 26, { up: 1.5 });
        a.dance = DANCE.flip; a.danceT = 0; shotAt(0, 1.5, 0, 4.6, 1.0, 1.2);
        const hues = ["#ff5d8f", "#ffe14a", "#7dffd0", "#7cc8ff", "#c9a0ff"]; let n = 0;
        await tween(2.7, (q, raw) => { if (raw > n * 0.14) { glow(0, 2.6, 0, hues[n % 5], 16, 0.3); n++; burst("confetti", rnd(-2.5, 2.5), 5.5, rnd(-2.5, 2.5), 5, { sp: 0.4, up: 0 }); if (n % 4 === 0) icon("ha", rnd(-0.8, 0.8), 2.2, 0, { ttl: 0.7, s: 0.6 }); } }, E.lin);
        return;
      }
      a.manual = true;
      if (mode === "gore") {   // the catapult
        const phi = yaw + 0.55, fx2 = Math.sin(phi), fz2 = Math.cos(phi), bx = rx2 * 1.75, bz = rz2 * 1.75;
        const cat = temp(new THREE.Group(), bx - fx2 * 1.8, 0, bz - fz2 * 1.8); cat.rotation.y = phi; cat.scale.setScalar(0.01);
        cat.add(mesh(box(1.0, 0.22, 1.7), toon("#8a5a34"), 0, 0.3, 0), mesh(box(0.14, 1.0, 0.14), toon("#6b4326"), -0.42, 0.75, 0), mesh(box(0.14, 1.0, 0.14), toon("#6b4326"), 0.42, 0.75, 0), mesh(box(1.0, 0.12, 0.12), toon("#6b4326"), 0, 1.25, 0));
        for (const [x, z] of [[-0.56, -0.6], [0.56, -0.6], [-0.56, 0.6], [0.56, 0.6]]) cat.add(turn(mesh(cyl(0.24, 0.24, 0.12, 10), toon("#5e3b1f"), x, 0.24, z), 0, 0, PI / 2));
        const arm = new THREE.Group(); arm.position.y = 1.1; arm.rotation.x = 0.45; cat.add(arm);
        arm.add(mesh(box(0.12, 0.12, 2.6), toon("#b0743c"), 0, 0, 0.8), mesh(cyl(0.34, 0.24, 0.22, 10), toon("#5e3b1f"), 0, 0.1, 2.0), mesh(box(0.4, 0.4, 0.4), toon("#6b6680"), 0, -0.1, -0.45));
        burst("dust", cat.position.x, 0.2, cat.position.z, 10, { sp: 1.6 }); await tween(0.3, (q) => cat.scale.setScalar(q), E.back);
        const cup = (th, out) => out.set(cat.position.x + fx2 * 2 * Math.cos(th), 1.1 - 2 * Math.sin(th) + 0.1, cat.position.z + fz2 * 2 * Math.cos(th));
        cup(0.45, v3); await arc(a.g, v3.x, v3.y, v3.z, 0.9, 0.36); a.face = yaw;
        await tween(0.4, (q) => { arm.rotation.x = 0.45 + q * 0.15; cup(arm.rotation.x, v3); a.g.position.copy(v3); }, E.out);
        icon("bang", a.g.position.x, a.g.position.y + 1.6, a.g.position.z, { ttl: 0.5, s: 0.7 }); slowmo(0.25, 0.22); await wait(0.12);
        await tween(0.12, (q) => { arm.rotation.x = 0.6 - q * 1.6; cup(arm.rotation.x, v3); a.g.position.copy(v3); }, E.in);
        shake(0.35); flash("#ffffff", 0.4, 0.15); burst("dust", cat.position.x, 0.2, cat.position.z, 14, { flat: true, sp: 2.2 }); a.blob.visible = false;
        camTo(camPos.x, camPos.y, camPos.z, -fx2 * 3, 3.4, -fz2 * 3, 0.9, E.out);
        tween(0.5, (q) => { arm.rotation.x = -1.0 + Math.sin(q * PI * 3) * 0.2 * (1 - q); }, E.lin);
        await arc(a.g, -fx2 * 30, 9, -fz2 * 30, 6, 1.1, (q) => { const th = q * TAU * 4; a.b.rotation.x = th; a.b.position.y = 0.55 * (1 - Math.cos(th)); a.b.position.z = -0.55 * Math.sin(th); a.g.scale.setScalar(1 - q * 0.75); if (Math.random() < 0.6) burst("cloud", a.g.position.x, a.g.position.y, a.g.position.z, 1, { sp: 0.2, s: 0.5 }); }, E.out);
        icon("star", a.g.position.x, a.g.position.y, a.g.position.z, { vy: 0, ttl: 0.5, s: 3 }); a.g.visible = false; await wait(0.5);
      } else if (mode === "crazy") {   // the boot
        const kx = rx2 * 0.95 - Math.sin(yaw) * 0.3, kz = rz2 * 0.95 - Math.cos(yaw) * 0.3;   // the boot comes from the right, a little behind the podium
        const w = clamp(tanH / 0.5, 0.6, 1);   // on a narrow screen the boot waits closer in, so it is in frame
        const boot = temp(buildProp("boot"), kx * 13, 0.7, kz * 13); boot.scale.setScalar(2.3); boot.rotation.y = Math.atan2(kz, -kx);
        await tween(0.5, (q) => { boot.position.set(kx * (13 - (13 - 4.5 * w) * q), 0.7, kz * (13 - (13 - 4.5 * w) * q)); }, E.out);
        icon("quest", 0, 2.3, 0, { ttl: 0.5, s: 0.7 }); await tween(0.3, (q) => { boot.position.set(kx * (4.5 * w + q * 1.4), 0.7 + q * 0.5, kz * (4.5 * w + q * 1.4)); boot.rotation.z = -0.3 * q; }, E.out);
        slowmo(0.3, 0.2);
        await tween(0.13, (q) => { boot.position.set(kx * (4.5 * w + 1.4 - (4.5 * w - 0.6) * q), 1.2 - 0.5 * q, kz * (4.5 * w + 1.4 - (4.5 * w - 0.6) * q)); boot.rotation.z = -0.3 + 0.75 * q; }, E.in);
        impact(0, 0.9, 0, 1.8); a.blob.visible = false; icon("bang", 0, 2.4, 0, { ttl: 0.5, s: 1 });
        camTo(camPos.x, camPos.y, camPos.z, -kx * 2.5, 3, -kz * 2.5, 0.9, E.out);
        tween(0.7, (q) => { boot.position.set(kx * (2 + 9 * q), 0.7 + q * 3.5, kz * (2 + 9 * q)); boot.rotation.z = 0.45 + q * 0.3; }, E.in);   // and swings back out the way it came
        await arc(a.g, -kx * 22 - Math.sin(yaw) * 14, 9, -kz * 22 - Math.cos(yaw) * 14, 6, 1.1, (q) => { const th = -q * TAU * 5; a.b.rotation.x = th; a.b.position.y = 0.55 * (1 - Math.cos(th)); a.b.position.z = -0.55 * Math.sin(th); a.g.scale.setScalar(1 - q * 0.75); if (Math.random() < 0.6) burst("cloud", a.g.position.x, a.g.position.y, a.g.position.z, 1, { sp: 0.2, s: 0.5 }); }, E.out);
        icon("star", a.g.position.x, a.g.position.y, a.g.position.z, { vy: 0, ttl: 0.5, s: 3 }); a.g.visible = false; await wait(0.5);
      } else {   // the balloon
        const bl = temp(new THREE.Group(), 0, 10, 0);
        bl.add(squash(mesh(ball(0.55, 10, 8), toon("#ff5d6c"), 0, 1.95, 0), 1, 1.15, 1), mesh(cone(0.12, 0.16, 5), toon("#e8384f"), 0, 1.28, 0), mesh(box(0.03, 1.0, 0.03), flat("#ffffff"), 0, 0.78, 0), mesh(box(0.12, 0.2, 0.05), flat("#ffc2c8"), -0.22, 2.2, 0.45));
        await tween(0.65, (q) => { bl.position.y = 10 - 8.65 * q; }, E.out);
        icon("quest", 0, 2.4, 0.3, { ttl: 0.5, s: 0.6 }); await tween(0.25, (q, raw) => { bl.position.y = 1.35 + Math.sin(raw * PI) * 0.12; }, E.lin);
        a.blob.visible = false; camTo(camPos.x, camPos.y + 0.6, camPos.z, rx2 * 1.2, 3.4, rz2 * 1.2, 2.2, E.io);
        others.forEach((Q, i) => { if (i % 2 === 0) act(Q.a, "wave"); });
        await tween(2.3, (q, raw) => {
          const up = raw * raw * 7.5, side = raw * raw * 3 + Math.sin(raw * 7) * 0.25, x = rx2 * side, z = rz2 * side;
          a.g.position.set(x, 0.52 + up, z); bl.position.set(x, 1.35 + up, z); a.b.rotation.z = Math.sin(raw * 10) * 0.14; bl.rotation.z = Math.sin(raw * 10 + 1) * 0.1;
          a.hands[1].visible = true; a.hands[1].position.set(0.62 + Math.sin(raw * 44) * 0.13, 1.0, 0.12);
          if (Math.random() < 0.15) burst("magic", x, 0.6 + up, z, 1, { sp: 0.2 });
        }, E.lin);
        icon("star", a.g.position.x, a.g.position.y + 1, a.g.position.z, { vy: 0, ttl: 0.4, s: 1.2 }); a.g.visible = false; await wait(0.25);
      }
      P.alive = false; resetBean(a); a.g.visible = false; setTomb(P, true); P.lightT = 0; spot(false);
    });
  }

  // ---------- endings ----------
  const keepsakes = [];
  function playVictory({ winners = [], team = "town", dances = null } = {}) {
    return play(async () => {
      setPhase("ended"); spot(false); snapYaw();
      const win = winners.map((id) => players.get(id)).filter(Boolean), rx2 = Math.cos(yaw), rz2 = -Math.sin(yaw), fx2 = Math.sin(yaw), fz2 = Math.cos(yaw);
      const cast = win.map((P) => { if (P.alive) { P.tok++; wake(P); P.a.g.position.y = 0; return P.a; } setGhost(P.id, true); P.ghostA.g.visible = true; return P.ghostA; });
      const per = Math.min(cast.length, win.length > 8 ? 6 : 5);
      cast.forEach((a, i) => {   // winners line up in the middle of the square, facing the camera
        const row = Math.floor(i / per), n = Math.min(per, cast.length - row * per), off = ((i % per) - (n - 1) / 2) * 1.3, f = 0.9 - row * 1.3;
        a.dance = null; go(a, rx2 * off + fx2 * f, rz2 * off + fz2 * f, 3.4).then(() => { a.face = yaw; });
      });
      const rest = order.filter((P) => P.alive && !win.includes(P));
      rest.forEach((P, i) => { P.tok++; wake(P); P.a.g.position.y = 0; const an = yaw + PI + ((i + 0.5) / rest.length - 0.5) * 2.6; go(P.a, Math.sin(an) * (plaza - 0.2), Math.cos(an) * (plaza - 0.2), 2.6).then(() => faceTo(P.a, 0, 0)); });
      shotAt(0, 1.0, 0, 6.4, 2.2, 1.0); await wait(1.25);
      if (team === "mafia") {   // every fedora flips on at once
        slowmo(0.4, 0.3);
        const hats = cast.map((a) => { const h = buildProp("fedora"); a.b.add(h); h.position.set(0, 3, 0); keepsakes.push(h); return h; });
        await tween(0.45, (q) => { cast.forEach((a, i) => { hats[i].position.y = 3 - (3 - (a.tall ? 1.36 : 1.0)) * q; hats[i].rotation.x = (1 - q) * TAU * 2; }); }, E.in);
        flash("#ff3b5c", 0.45, 0.25); shake(0.22);
        for (const a of cast) { burst("spark", a.g.position.x, 1.3, a.g.position.z, 8); ring(a.g.position.x, 0.08, a.g.position.z, "#ff3b5c", 1.4, 0.4); }
        await wait(0.3);
      }
      victory = true; confT = 0; flash("#ffffff", 0.3, 0.2);
      for (const s of [-1, 1]) burst("confetti", rx2 * s * 3.2, 0.6, rz2 * s * 3.2, 34, { up: 1.7, dx: -rx2 * s * 2, dz: -rz2 * s * 2 });
      win.forEach((P, i) => { const a = cast[i]; a.dance = DANCE[dances?.[P.id]] || DANCE[P.look.dance] || DANCE.hop; a.danceT = 0; });
      shotAt(0, 1.0, 0, 5.6, 1.5, 2.4); await wait(2.5);
    });
  }
  function clearKeepsakes() { for (const h of keepsakes) trash(h); keepsakes.length = 0; }

  // ---------- the Mafia hideout: a pinned map of the island, darts for picks ----------
  const hscene = new THREE.Scene(), hcam = new THREE.PerspectiveCamera(38, 1, 0.3, 80), MAP = 192, MAPW = 3.5, MAPY = 2.25;
  hscene.background = new THREE.Color("#0c0814");
  const houseColor = (look) => HOUSES.find((h) => h.id === look.house)?.color || { mushroom: "#e8384f", lighthouse: "#f6f0ff", haunted: "#6a5a8c", bakery: "#ffe2b0" }[look.house] || bodyColors(look.body)[0];
  const mapXY = (P) => [MAP / 2 + (P.x / rim) * 76, MAP / 2 + 6 + (P.z / rim) * 76];
  const mapPoint = (P, out = v1) => { const [mx, my] = mapXY(P); return out.set((mx / MAP - 0.5) * MAPW, MAPY + (0.5 - my / MAP) * MAPW, 0.05); };
  function drawMap(x, members) {
    x.imageSmoothingEnabled = false; x.fillStyle = "#ecd9a8"; x.fillRect(0, 0, MAP, MAP);
    x.fillStyle = "#dcc48c"; for (let i = 0; i < 60; i++) x.fillRect((Math.random() * MAP) | 0, (Math.random() * MAP) | 0, 3, 1);
    x.strokeStyle = "#8a6a3a"; x.lineWidth = 4; x.strokeRect(2, 2, MAP - 4, MAP - 4);
    const cx = MAP / 2, cy = MAP / 2 + 6, disc = (r, c) => { x.fillStyle = c; x.beginPath(); x.arc(cx, cy, r, 0, TAU); x.fill(); };
    disc(84, "#6aa0c8"); disc(80, "#5a9a5c"); disc(77, "#8fcf86"); disc((plaza / rim) * 76 + 2, "#c9b88c"); disc((plaza / rim) * 76, "#e6d8b4");
    x.fillStyle = "#6b4326"; x.font = '16px "Jersey 20", monospace'; x.textAlign = "center"; x.fillText("PUDDLETON", cx, 17);
    for (const P of order) {
      const [mx, my] = mapXY(P), X = Math.round(mx), Y = Math.round(my), c = P.alive ? houseColor(P.look) : "#a8a0a8";
      x.fillStyle = "#1c1330"; x.fillRect(X - 8, Y - 3, 16, 12); x.fillStyle = c; x.fillRect(X - 7, Y - 2, 14, 10);
      const roof = (w, top, c) => { x.fillStyle = c; x.beginPath(); x.moveTo(X - w, Y - 3); x.lineTo(X + w, Y - 3); x.lineTo(X, top); x.fill(); };
      roof(10.5, Y - 9.5, "#1c1330"); roof(8, Y - 7.5, P.alive ? "#4a3470" : "#6b6680");
      x.fillStyle = "#1c1330"; x.fillRect(X - 2, Y + 2, 4, 6); x.fillStyle = P.alive ? "#ffe9a0" : "#6b6680"; x.fillRect(X - 6, Y, 3, 3); x.fillRect(X + 3, Y, 3, 3);
      if (!P.alive) { x.strokeStyle = "#d81f3f"; x.lineWidth = 2; x.beginPath(); x.moveTo(X - 9, Y - 8); x.lineTo(X + 9, Y + 9); x.moveTo(X + 9, Y - 8); x.lineTo(X - 9, Y + 9); x.stroke(); }
      if (members.includes(P.id)) { x.fillStyle = "#1c1330"; x.fillRect(X - 6, Y - 13, 12, 2); x.fillRect(X - 4, Y - 17, 8, 4); x.fillStyle = "#e8384f"; x.fillRect(X - 4, Y - 14, 8, 1); }
      if (P.name) { x.fillStyle = "#3a2a20"; x.font = '11px "Jersey 20", monospace'; x.fillText(P.name.slice(0, 9), X, Y + 19); }
    }
  }
  function makeDart(color) {
    const g = new THREE.Group();
    g.add(turn(mesh(cone(0.035, 0.22, 6), toon("#dfe6f5"), 0, 0, 0.1), -PI / 2, 0, 0), turn(mesh(cyl(0.05, 0.05, 0.3, 6), toon(color), 0, 0, 0.35), PI / 2, 0, 0), mesh(box(0.26, 0.02, 0.2), toon(color), 0, 0, 0.58), mesh(box(0.02, 0.26, 0.2), toon(color), 0, 0, 0.58), mesh(ball(0.085, 6, 5), toon(color), 0, 0, 0.7), mesh(cyl(0.075, 0.075, 0.05, 6), flat("#1c1330"), 0, 0, 0.2).rotateX(PI / 2), mesh(box(0.3, 0.3, 0.02), flat("#1c1330"), 0, 0, 0.47));
    g.scale.setScalar(1.5); return g;
  }
  function setHideoutPicks(picks = {}) {
    if (!hide) return;
    for (const [m, d] of hide.darts) if (picks[m] !== d.target) { trash(d.g); hide.darts.delete(m); }
    for (const m of hide.members) {
      const T = players.get(picks[m]), M = players.get(m); if (!T || !M || hide.darts.has(m)) continue;
      const n = [...hide.darts.values()].filter((d) => d.target === T.id).length, g = makeDart(bodyOf(M)); mapPoint(T, v3);
      const tx = v3.x + (n % 3 - (n ? 1 : 0)) * 0.13, ty = v3.y + 0.04 + (n > 2 ? 0.12 : 0), sx = rnd(-1.5, 1.5), tilt = rnd(-0.25, 0.25);
      g.position.set(sx, 0.4, 7); g.rotation.set(-0.45, tilt + (n ? 0.35 : -0.3), rnd(TAU)); g.rotation.order = "YXZ"; hide.g.add(g); hide.darts.set(m, { g, target: T.id });
      tween(0.2, (q) => { g.position.set(sx + (tx - sx) * q, 0.4 + (ty - 0.4) * q + Math.sin(q * PI) * 0.4, 7 - 7 * q); }, E.in).then(() => { if (!hide) return; shake(0.07); burst("dust", tx, ty, 0.15, 6, { sp: 0.8, s: 0.6, c: ["#ecd9a8", "#ffffff"] }); burst("spark", tx, ty, 0.15, 4, { sp: 0.5 }); });
    }
  }
  function closeHideout() { if (hide && !hide.closed) { hide.closed = true; hide.done(); } }
  let pending = 0;
  // Opens the hideout and stays there until closeHideout(), skip(), a phase change, or the next scene.
  function playHideout({ members = [], picks = {}, onPick = null } = {}) {
    const p = play(async (sc) => {
      const g = new THREE.Group(), own = (m) => { m.userData.own = true; return m; }; hscene.add(g);
      const bricks = (x, n) => { x.fillStyle = "#2a1f38"; x.fillRect(0, 0, n, n); for (let r = 0; r < 4; r++) for (let c = 0; c < 2; c++) { x.fillStyle = ["#4a3558", "#523c60", "#44304f"][(r + c * 2) % 3]; x.fillRect(c * 16 + (r % 2 ? 8 : 0) + 1, r * 8 + 1, 14, 6); if (r % 2 && c === 1) x.fillRect(-7, r * 8 + 1, 14, 6); } };
      const mapCv = document.createElement("canvas"), mx = mapCv.getContext("2d"); mapCv.width = mapCv.height = MAP * 4; mx.scale(4, 4); drawMap(mx, members);   // 4 texels per map unit keeps names and lines sharp
      const mapTex = new THREE.CanvasTexture(mapCv); mapTex.colorSpace = THREE.SRGBColorSpace;
      const lampG = new THREE.Group(); lampG.position.set(0, 6.4, 1.3);
      lampG.add(mesh(box(0.04, 1.6, 0.04), flat("#1c1330"), 0, -0.8, 0), mesh(cone(0.6, 0.4, 10), toon("#3f7a5a"), 0, -1.7, 0), mesh(ball(0.14, 6, 5), flat("#fff2b8"), 0, -1.92, 0));
      const bulb = new THREE.PointLight("#ffd9a0", 34, 14, 1.3); bulb.position.y = -2; lampG.add(bulb);
      g.add(new THREE.HemisphereLight("#8a7ab8", "#1a1026", 1.0), lampG,
        mesh(box(16, 10, 0.3), own(new THREE.MeshToonMaterial({ gradientMap: kit.grad, map: pixelTexture(32, bricks, 7) })), 0, 2.6, -0.3), mesh(box(16, 0.4, 9), toon("#3a2a30"), 0, -1.4, 3.6),
        mesh(new THREE.PlaneGeometry(MAPW, MAPW), own(new THREE.MeshBasicMaterial({ map: mapTex })), 0, MAPY, 0), mesh(box(MAPW + 0.3, MAPW + 0.3, 0.1), toon("#6b4326"), 0, MAPY, -0.08),
        mesh(box(1.2, 1.2, 1.2), toon("#6b4a34"), -3.4, -0.6, 0.6), mesh(box(0.9, 0.9, 0.9), toon("#7a5a3f"), -3.2, 0.45, 0.6), mesh(cyl(0.55, 0.55, 1.3, 10), toon("#5e4a44"), 3.4, -0.55, 0.7), mesh(cyl(0.57, 0.57, 0.1, 10), toon("#2a2438"), 3.4, -0.2, 0.7));
      for (const [px, py] of [[-1, 1], [1, 1], [-1, -1], [1, -1]]) g.add(mesh(ball(0.08, 6, 5), toon("#e8384f"), px * (MAPW / 2 - 0.12), MAPY + py * (MAPW / 2 - 0.12), 0.06));
      const crew = members.map((id) => players.get(id)).filter(Boolean);
      crew.forEach((M, i) => { const a = extra(M.role || "mafia", M.look); hscene.add(a.g); a.g.position.set((i - (crew.length - 1) / 2) * 1.25, -1.2, 0.9); a.face = PI + (i - (crew.length - 1) / 2) * -0.15; snap(a); });
      hscene.add(points);
      const state = hide = { g, members, darts: new Map(), onPick, lampG, closed: false, done: null };
      if (sharp.low) sizeBuffer();
      setFade(0); setHideoutPicks(picks);
      if (pending <= 0) await new Promise((res) => { state.done = res; });
      for (const d of state.darts.values()) trash(d.g);
      hide = null; scene.add(points); trash(g); fadeV = 1; setFade(1);
      if (sharp.low) sizeBuffer();
    }, false);
    return p;
  }

  // ---------- the UI's handles ----------
  function setPhase(p) {
    if (!PHASES[p]) return;
    if (hide && p !== "night") closeHideout();
    phase = p; envT = PHASES[p];
    if (p !== "trial") { podT = 0; spot(false); for (const P of order) P.a.g.position.y = 0; }
    if (p !== "ended") { victory = false; clearKeepsakes(); for (const P of order) { P.a.dance = null; if (P.ghostA) P.ghostA.dance = null; } }
    const alive = order.filter((P) => P.alive);
    if (p === "night") { nightAt = now; alive.forEach((P, k) => goHome(P, k * 0.1, k)); } else alive.forEach((P, k) => comeOut(P, 0.3 + k * 0.16));
  }
  function setPlayers(list = []) {
    list = list.slice(0, 16);
    const sig = JSON.stringify(list.map((p) => [p.id, cleanLook(p.look) || DEFAULT_LOOK, p.role || null, p.name || ""]));
    if (sig !== builtSig) {
      if (cur) { chain = chain.then(() => setPlayers(list)); return; }   // never rebuild the town under a running scene
      hush(); keepsakes.length = 0; buildTown(list); builtSig = sig; orbitPose(camPos, camLook);
    }
    for (const p of list) { const P = players.get(p.id); P.me = !!p.me; setAlive(P, p.alive !== false); }
  }
  function walkTo(id, x, z) {
    const P = players.get(id); if (!P) return Promise.resolve(false);
    const a = P.alive ? P.a : P.ghostA; if (!a || !a.g.visible || (P.alive && P.inside)) return Promise.resolve(false);
    const d = Math.hypot(x, z), max = ringR - 1.7; if (d > max) { x *= max / d; z *= max / d; }
    P.tok++; a.dance = null; return walk(a, x, z, a.ghost ? 1.6 : 2.5).then(() => true);
  }
  function bubble(id, text, seconds) { const P = players.get(id); if (P) say(P, text, seconds, P.alive && P.inside); }
  function emote(id, kind, target) {
    const P = players.get(id), a = P && (P.alive ? P.a : P.ghostA); if (!a || !a.g.visible || !EMOTE[kind]) return;
    const T = players.get(target); if (T) { const ta = T.alive && !T.inside ? T.a.g.position : T; faceTo(a, ta.x, ta.z); }
    act(a, kind);
  }
  function setGhost(id, on) {
    const P = players.get(id); if (!P) return;
    P.ghostOn = !!on && !P.alive;
    if (P.ghostOn && !P.ghostA) { const a = P.ghostA = makeActor(P.role, P.look, { ghost: true }); hw(P, -1.25, 0, 2.4); a.g.position.set(v1.x, 0, v1.z); a.face = Math.atan2(P.nx, P.nz); snap(a); }
    if (P.ghostA) P.ghostA.g.visible = P.ghostOn && ghostsShown;
  }
  function showGhosts(on) { ghostsShown = !!on; for (const P of order) if (P.ghostA) P.ghostA.g.visible = P.ghostOn && ghostsShown; }
  function where(id) { const P = players.get(id); if (!P) return null; const a = P.alive ? P.a : P.ghostA || P.a; return { x: a.g.position.x, z: a.g.position.z, inside: P.inside, home: { x: P.x, z: P.z } }; }

  // ---------- taps and drags ----------
  let ptr = null;
  const ray = (cx, cy, cam) => { const r = canvas.getBoundingClientRect(); v1.set(((cx - r.left) / r.width) * 2 - 1, -(((cy - r.top) / r.height) * 2 - 1), 0.5).unproject(cam).sub(cam.position).normalize(); return v1; };
  const hitBall = (o, d, x, y, z, r) => { const ox = x - o.x, oy = y - o.y, oz = z - o.z, t = ox * d.x + oy * d.y + oz * d.z, d2 = ox * ox + oy * oy + oz * oz - t * t; return t > 0 && d2 < r * r ? t - Math.sqrt(r * r - d2) : Infinity; };
  function tap(cx, cy) {
    if (hide) {
      const d = ray(cx, cy, hcam), o = hcam.position, t = (0.05 - o.z) / d.z, mx = ((o.x + d.x * t) / MAPW + 0.5) * MAP, my = (0.5 - (o.y + d.y * t - MAPY) / MAPW) * MAP;
      let best = null, bd = 22; for (const P of order) { const [px, py] = mapXY(P), q = Math.hypot(px - mx, py - 2 - my); if (q < bd) { bd = q; best = P; } }
      if (best) { mapPoint(best, v3); burst("spark", v3.x, v3.y, 0.2, 5, { sp: 0.4 }); hide.onPick?.(best.id); }
      return;
    }
    if (cur) { skip(); return; }
    const d = ray(cx, cy, camera), o = camera.position; let bt = Infinity, hit = null;
    for (const P of order) {
      const a = P.alive ? P.a : P.ghostA;
      if (a && a.g.visible) { const t = hitBall(o, d, a.g.position.x, a.g.position.y + a.b.position.y + 0.6, a.g.position.z, 0.62) - 0.5; if (t < bt) { bt = t; hit = { type: "bean", id: P.id, x: a.g.position.x, z: a.g.position.z }; } }
      const t = hitBall(o, d, P.x, 1.1, P.z, 1.25); if (t < bt) { bt = t; hit = { type: "house", id: P.id, x: P.x, z: P.z }; }
    }
    if (d.y < 0) { const t = -o.y / d.y, x = o.x + d.x * t, z = o.z + d.z * t; if (t < bt && x * x + z * z < rim * rim) hit = { type: "ground", id: null, x, z }; }
    if (hit && opt.onTap) opt.onTap(hit);
  }
  const onDown = (e) => { ptr = { id: e.pointerId, x: e.clientX, y: e.clientY, lx: e.clientX, moved: false }; };
  const onMove = (e) => {
    if (!ptr || e.pointerId !== ptr.id) return;
    if (!ptr.moved && Math.abs(e.clientX - ptr.x) + Math.abs(e.clientY - ptr.y) > 9) ptr.moved = true;
    if (ptr.moved && !cur) yaw -= (e.clientX - ptr.lx) * 0.008;   // drag to turn the town
    ptr.lx = e.clientX;
  };
  const onUp = (e) => { if (!ptr || e.pointerId !== ptr.id) return; const moved = ptr.moved; ptr = null; if (!moved) tap(e.clientX, e.clientY); else if (!cur) snapYaw(); };   // a drag settles on the nearest gap between houses
  const onCancel = () => { ptr = null; };
  canvas.addEventListener("pointerdown", onDown); canvas.addEventListener("pointermove", onMove); canvas.addEventListener("pointerup", onUp); canvas.addEventListener("pointercancel", onCancel);

  // ---------- the frame ----------
  const clock = new THREE.Clock();
  let running = false, wantRun = true, frames = 0, cost = 0;
  function frame() {
    const t0 = performance.now(), raw = Math.min(clock.getDelta(), 0.1);
    if (sharp.tick(t0)) sizeBuffer();   // a weak device: fewer render pixels
    if (slowLeft > 0 && (slowLeft -= raw) <= 0) timeScale = 1;
    const dt = raw * timeScale * speedMul, t = (now += dt); frames++;
    stepTime(dt); stepEnv(1 - Math.exp(-dt * 2.2)); if (town) stepTown(dt, t);
    for (let i = 0; i < actors.length; i++) stepActor(actors[i], dt, t);
    stepParticles(dt, t); stepFx(dt, t);
    if (lightLeft > 0) { lightLeft -= dt; fxLight.intensity = lightLeft > 0 ? lightPow * (lightLeft / lightDur) : 0; }
    if (!camLock) { orbitPose(orbP, orbL); const k = 1 - Math.exp(-raw * 5); camPos.lerp(orbP, k); camLook.lerp(orbL, k); }
    const cam = hide ? hcam : camera;
    if (hide) { hcam.position.set(0, 1.5, Math.max(2.15 / tanH, 3.45 / tanV)); hcam.lookAt(0, 1.5, 0); hide.lampG.rotation.z = Math.sin(t * 1.3) * 0.06; }
    else { camera.position.copy(camPos); camera.lookAt(camLook); }
    if (shakeA > 0.003) { cam.position.x += (Math.random() - 0.5) * 2 * shakeA; cam.position.y += (Math.random() - 0.5) * 2 * shakeA; shakeA *= Math.exp(-raw * 9); } else shakeA = 0;
    sky.position.copy(camera.position); { const az = Math.atan2(camLook.x - camPos.x, camLook.z - camPos.z) + 0.42; orb.position.copy(camera.position).add(v1.set(Math.sin(az), env.oy, Math.cos(az)).normalize().multiplyScalar(560)); orb.lookAt(camera.position); }
    for (let i = 0; i < stars.length; i++) { stars[i].position.copy(camera.position); starMats[i].opacity = env.star * (0.45 + 0.55 * Math.abs(Math.sin(t * (0.5 + i * 0.4) + i))); }
    for (const c of clouds) { c.position.x += c.userData.v * dt * 0.5; if (c.position.x > 135) c.position.x = -135; }
    if (flashA > 0) { flashA = Math.max(0, flashA - flashRate * raw); ui.flash.style.opacity = flashA; }
    if (!cur && fadeV > 0) setFade(Math.max(0, fadeV - raw * 4));
    if (capUntil && now > capUntil) caption("");
    if (sharp.low) pass.render(hide ? hscene : scene, cam); else renderer.render(hide ? hscene : scene, cam);
    stepBubbles();
    cost += (performance.now() - t0 - cost) * 0.05;   // smoothed CPU time of one frame, for stats
  }
  function sync() {
    const on = wantRun && !document.hidden && !disposed;
    if (on && !running) { clock.getDelta(); renderer.setAnimationLoop(frame); } else if (!on && running) renderer.setAnimationLoop(null);
    running = on;
  }
  const ro = new ResizeObserver(fit); ro.observe(canvas); fit();
  document.addEventListener("visibilitychange", sync); sync();

  function dispose() {
    if (disposed) return;
    skip(); closeHideout(); disposed = true; sync();
    ro.disconnect(); document.removeEventListener("visibilitychange", sync);
    canvas.removeEventListener("pointerdown", onDown); canvas.removeEventListener("pointermove", onMove); canvas.removeEventListener("pointerup", onUp); canvas.removeEventListener("pointercancel", onCancel);
    for (const tm of timers) tm.res(); timers.length = 0;
    clearTown(); for (const a of actors.slice()) dropActor(a);
    for (const m of rings) m.material.dispose(); ringGeo.dispose(); for (const s of icons) s.material.dispose(); for (const k of Object.keys(iconTex)) iconTex[k].dispose();
    for (const c of clouds) c.traverse((m) => m.geometry?.dispose()); for (const s of stars) s.geometry.dispose();
    pGeo.dispose(); pMat.dispose(); sky.geometry.dispose(); sky.material.dispose(); orb.geometry.dispose();
    pass.dispose(); renderer.dispose(); root.remove();
  }
  return {
    setPlayers, setPhase, walkTo, bubble, emote, setGhost, showGhosts, where,
    playKill, playStalk, rattle, playSave, playAngel, playPeek, playFrame, playShot, playDream, playHideout, setHideoutPicks, closeHideout, playDawn, playTrial, playExile, playVictory,
    skip, caption, sound, run(on) { wantRun = !!on; sync(); }, dispose, setSpeed(k) { speedMul = clamp(k, 0.25, 4); },
    setPrefs(p = {}) { for (const k of Object.keys(prefs)) if (k in p) prefs[k] = !!p[k]; if (!prefs.shake || prefs.calm) shakeA = 0; if (!prefs.flash) { flashA = 0; ui.flash.style.opacity = 0; } },
    turn(angle) { yaw = angle; }, zoom(z) { zoom = clamp(z, 0.5, 1.6); },
    fx: { burst, ring, icon, shake, flash, glow, slowmo, impact },
    get busy() { return !!cur; }, get phase() { return phase; }, get stats() { return { frames, ms: +cost.toFixed(2), calls: renderer.info.render.calls, triangles: renderer.info.render.triangles, geometries: renderer.info.memory.geometries, textures: renderer.info.memory.textures, particles: pLive, size: [renderer.domElement.width, renderer.domElement.height], ratio: sharp.ratio }; },
    emotes: Object.keys(EMOTE), dances: Object.keys(DANCE), kills: Object.keys(KILL), dreams: DREAMS,
  };
}
