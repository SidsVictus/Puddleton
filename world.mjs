// A floating-island dream world rendered in 3D at low resolution, so every frame is pixel art.
import * as THREE from "three";

export const BEAN_COLORS = ["#ff9db5", "#8fd6ff", "#ffd97a", "#a5ecb0", "#cdb4ff", "#ffb98a", "#8fe8d8", "#f3a0f7"];
const grad = new THREE.DataTexture(new Uint8Array([80, 160, 255]), 3, 1, THREE.RedFormat);
grad.minFilter = grad.magFilter = THREE.NearestFilter; grad.needsUpdate = true;
const mats = {};
const toon = (c) => (mats[c] ??= new THREE.MeshToonMaterial({ color: c, gradientMap: grad }));
const flat = (c) => (mats["f" + c] ??= new THREE.MeshBasicMaterial({ color: c }));
const mesh = (geo, mat, x = 0, y = 0, z = 0) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); return m; };
const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);
const cyl = (a, b, h, s = 12) => new THREE.CylinderGeometry(a, b, h, s);
const winMat = new THREE.MeshBasicMaterial({ color: "#ffd98a" });

// ---------- characters ----------
function hat(g, color, band, brim = 0.46, h = 0.3) {
  g.add(mesh(cyl(brim, brim, 0.05), toon(color), 0, 1.02, 0), mesh(cyl(0.25, 0.3, h), toon(color), 0, 1.04 + h / 2, 0), mesh(cyl(0.31, 0.31, 0.07), flat(band), 0, 1.09, 0));
}
const GEAR = {
  villager(g) { const a = mesh(box(0.22, 0.06, 0.1), toon("#5ad16b"), 0.1, 1.22, 0), b = a.clone(); a.rotation.z = 0.6; b.position.x = -0.1; b.rotation.z = -0.6; g.add(a, b); },
  angel(g) {
    const halo = mesh(new THREE.TorusGeometry(0.26, 0.045, 6, 14), flat("#ffd84a"), 0, 1.42, 0); halo.rotation.x = Math.PI / 2; g.add(halo);
    for (const s of [-1, 1]) { const w = mesh(box(0.3, 0.38, 0.06), flat("#ffffff"), s * 0.62, 0.62, -0.1); w.rotation.z = -s * 0.4; g.add(w); }
  },
  detective(g) {
    hat(g, "#8a5a34", "#5e3b1f", 0.44, 0.26);
    const cigar = mesh(cyl(0.035, 0.035, 0.26, 6), toon("#6b4326"), 0.14, 0.47, 0.56); cigar.rotation.x = Math.PI / 2;
    const glass = mesh(new THREE.TorusGeometry(0.13, 0.03, 6, 12), flat("#9be7ff"), 0.64, 0.52, 0.2);
    g.add(cigar, mesh(box(0.06, 0.06, 0.06), flat("#ff8a3c"), 0.14, 0.47, 0.7), glass, mesh(box(0.05, 0.22, 0.05), toon("#6b4326"), 0.64, 0.3, 0.2));
  },
  vigilante(g) { g.add(mesh(cyl(0.47, 0.5, 0.1), flat("#e8384f"), 0, 0.88, 0), mesh(box(0.08, 0.26, 0.05), flat("#e8384f"), -0.44, 0.74, -0.2)); },
  mayor(g) { g.add(mesh(cyl(0.42, 0.42, 0.05), toon("#2a2438"), 0, 1.02, 0), mesh(cyl(0.26, 0.26, 0.5), toon("#2a2438"), 0, 1.29, 0), mesh(cyl(0.27, 0.27, 0.08), flat("#ffd84a"), 0, 1.1, 0)); },
  mafia(g) { hat(g, "#2a2438", "#e8384f"); },
  godfather(g) { hat(g, "#2a2438", "#ffd84a"); g.add(mesh(box(0.32, 0.07, 0.05), flat("#1c1330"), 0, 0.53, 0.45), mesh(box(0.1, 0.1, 0.06), flat("#e8384f"), 0.22, 0.28, 0.4)); },
  framer(g) {
    const beret = mesh(new THREE.SphereGeometry(0.38, 10, 8), toon("#b04de0"), 0.06, 1.06, 0); beret.scale.y = 0.38; beret.rotation.z = -0.2;
    g.add(beret, mesh(box(0.05, 0.5, 0.05), toon("#8a5a34"), 0.62, 0.5, 0.2), mesh(box(0.09, 0.12, 0.09), flat("#ff6b9a"), 0.62, 0.8, 0.2));
  },
  jester(g) {
    for (const [s, c] of [[-1, "#8f4bff"], [1, "#ffcf3f"]]) {
      const cone = mesh(new THREE.ConeGeometry(0.2, 0.56, 6), toon(c), s * 0.27, 1.2, 0); cone.rotation.z = -s * 0.8;
      g.add(cone, mesh(box(0.1, 0.1, 0.1), flat("#ffd84a"), s * 0.5, 1.38, 0));
    }
  },
  serialkiller(g) {
    const hood = mesh(new THREE.SphereGeometry(0.56, 12, 10, 0, Math.PI * 2, 0, Math.PI * 0.6), toon("#2b2540"), 0, 0.55, 0); hood.scale.set(1, 1.12, 0.95); hood.rotation.x = -0.55;
    g.add(hood, mesh(box(0.06, 0.32, 0.03), flat("#dfe6f5"), 0.62, 0.6, 0.2), mesh(box(0.08, 0.14, 0.05), toon("#6b4326"), 0.62, 0.38, 0.2));
  },
};

export function makeBean(role, color = BEAN_COLORS[0], dead = false) {
  const g = new THREE.Group(), ink = flat("#1c1330");
  const body = mesh(new THREE.SphereGeometry(0.5, 12, 10), toon(dead ? "#8d879c" : color), 0, 0.55, 0); body.scale.set(1, 1.12, 0.92); g.add(body);
  for (const s of [-1, 1]) {
    g.add(mesh(box(0.11, dead ? 0.04 : 0.17, 0.05), role === "serialkiller" && !dead ? flat("#ff3b5c") : ink, s * 0.2, 0.66, 0.43),
      mesh(box(0.1, 0.06, 0.04), flat("#ff8fb0"), s * 0.32, 0.5, 0.37), mesh(box(0.16, 0.1, 0.2), ink, s * 0.18, 0.04, 0.02));
  }
  g.add(mesh(box(0.1, 0.04, 0.05), ink, 0, 0.48, 0.45));
  GEAR[role]?.(g);
  return g;
}

// Renders a character to a small canvas once and returns it as an image URL (used by the game UI).
let studio; const shots = new Map();
export function portrait(role, color, dead = false) {
  const key = `${role}|${color}|${dead}`;
  if (shots.has(key)) return shots.get(key);
  if (!studio) {
    const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: false, preserveDrawingBuffer: true }); renderer.setSize(170, 170, false);   // finer portraits: 170px renders, shown 1:1
    const scene = new THREE.Scene(), cam = new THREE.OrthographicCamera(-1.1, 1.1, 2.05, -0.15, 0.1, 20); cam.position.z = 5;
    const sun = new THREE.DirectionalLight("#fff", 1.8); sun.position.set(-2, 3, 4);
    scene.add(new THREE.HemisphereLight("#ffffff", "#6a5a9a", 1.7), sun);
    studio = { renderer, scene, cam };
  }
  const b = makeBean(role, color, dead); b.rotation.y = 0.12;
  studio.scene.add(b); studio.renderer.render(studio.scene, studio.cam); studio.scene.remove(b);
  const url = studio.renderer.domElement.toDataURL(); shots.set(key, url); return url;
}

// ---------- world ----------
const SKY = { night: ["#070620", "#1d1650", "#4a2f7a"], dawn: ["#2b3a8c", "#c86a8a", "#ffc38a"] };
export function createWorld(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false });
  const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(42, 1, 0.1, 500);
  const u = { top: { value: new THREE.Color() }, mid: { value: new THREE.Color() }, low: { value: new THREE.Color() } };
  const sky = new THREE.Mesh(new THREE.SphereGeometry(300, 16, 12), new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false, uniforms: u,
    vertexShader: "varying float h; void main(){ h = normalize(position).y; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }",
    fragmentShader: `uniform vec3 top; uniform vec3 mid; uniform vec3 low; varying float h;
      float b2(vec2 a){ a = floor(a); return fract(a.x / 2.0 + a.y * a.y * 0.75); }
      void main(){ float t = clamp(h * 1.5 + 0.38, 0.0, 1.0);
        float q = clamp(floor(t * 9.0 + b2(0.5 * gl_FragCoord.xy) * 0.25 + b2(gl_FragCoord.xy)) / 9.0, 0.0, 1.0);   // ordered dither between bands
        gl_FragColor = vec4(q < 0.5 ? mix(low, mid, q * 2.0) : mix(mid, top, q * 2.0 - 1.0), 1.0);
        #include <colorspace_fragment>
      }`,
  }));
  scene.fog = new THREE.Fog("#4a2f7a", 30, 150);
  const hemi = new THREE.HemisphereLight("#b9b0ff", "#2a1a4a", 1), sun = new THREE.DirectionalLight("#c4ccff", 1.2);
  sun.position.set(-8, 14, 6);
  const moon = new THREE.Group();
  moon.add(mesh(new THREE.CircleGeometry(17, 24), new THREE.MeshBasicMaterial({ color: "#fff3c8", fog: false })));
  for (const [x, y, r] of [[-5, 4, 3.4], [6, -3, 2.4], [1, 8, 1.6], [-3, -8, 2]]) moon.add(mesh(new THREE.CircleGeometry(r, 12), new THREE.MeshBasicMaterial({ color: "#ecd9a2", fog: false }), x, y, 0.1));
  const stars = [0, 1, 2].map(() => {
    const p = new Float32Array(450);
    for (let i = 0; i < 450; i += 3) { const a = Math.random() * 6.28, e = Math.random() * 1.4 - 0.15; p.set([Math.cos(a) * Math.cos(e) * 280, Math.sin(e) * 280, Math.sin(a) * Math.cos(e) * 280], i); }
    const g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.BufferAttribute(p, 3));
    return new THREE.Points(g, new THREE.PointsMaterial({ color: "#fff", size: 1, sizeAttenuation: false, fog: false, transparent: true }));
  });
  const cloudMat = new THREE.MeshBasicMaterial({ color: "#3b3470" }), clouds = [];
  for (let i = 0; i < 26; i++) {   // a sea of clouds below the islands
    const c = new THREE.Group();
    for (let k = 0; k < 4; k++) c.add(mesh(box(5 + Math.random() * 5, 1.2 + Math.random(), 3 + Math.random() * 3), cloudMat, k * 3 - 5, Math.random(), Math.random() * 2));
    c.position.set(Math.random() * 160 - 80, -9 - Math.random() * 8, 20 - Math.random() * 130); c.userData.v = 0.4 + Math.random() * 0.8;
    clouds.push(c); scene.add(c);
  }
  const lanternMat = new THREE.MeshBasicMaterial({ color: "#ffc45a", fog: false, transparent: true }), lanterns = [];
  for (let i = 0; i < 40; i++) {   // paper lanterns drifting up through the night
    const x = (3 + Math.random() * 22) * (Math.random() < 0.5 ? -1 : 1);
    const l = mesh(box(0.22, 0.3, 0.22), lanternMat, x, Math.random() * 30 - 6, 12 - Math.random() * 90); l.userData.v = 0.3 + Math.random() * 0.5;
    lanterns.push(l); scene.add(l);
  }
  scene.add(sky, hemi, sun, moon, ...stars);

  const w = { scene, camera, renderer, islands: [], beans: [], ticks: [], day: 0, setDay(v) { w.target = v; }, target: 0 };
  const fit = () => {
    const cw = canvas.clientWidth || 1, ch = canvas.clientHeight || 1, px = Math.max(1, Math.round(ch / 400));   // finer pixels: about 400 rows tall
    renderer.setSize(Math.ceil(cw / px), Math.ceil(ch / px), false); camera.aspect = cw / ch; camera.updateProjectionMatrix(); w.onFit?.(cw, ch);
  };
  new ResizeObserver(fit).observe(canvas); fit();
  const clock = new THREE.Clock(), c1 = new THREE.Color(), c2 = new THREE.Color(), wp = new THREE.Vector3();
  renderer.setAnimationLoop(() => {
    const dt = Math.min(clock.getDelta(), 0.1), t = clock.elapsedTime;
    w.day += (w.target - w.day) * (1 - Math.exp(-dt * 1.5));
    for (const tick of w.ticks) tick(t, dt);
    ["top", "mid", "low"].forEach((k, i) => u[k].value.copy(c1.set(SKY.night[i])).lerp(c2.set(SKY.dawn[i]), w.day));
    scene.fog.color.copy(u.low.value);
    hemi.intensity = 1 + w.day * 0.9; sun.color.set("#c4ccff").lerp(c2.set("#ffd9a8"), w.day);
    cloudMat.color.set("#3b3470").lerp(c2.set("#ffd0c2"), w.day); winMat.color.set("#ffd98a").lerp(c2.set("#6b5a8a"), w.day);
    lanternMat.opacity = 1 - w.day;
    sky.position.copy(camera.position);
    stars.forEach((s, i) => { s.position.copy(camera.position); s.material.opacity = (0.35 + 0.65 * Math.abs(Math.sin(t * (0.25 + i * 0.15) + i))) * (1 - w.day); });
    moon.position.copy(camera.position).add(wp.set(-90, 120 - w.day * 150, -220)); moon.lookAt(camera.position);
    for (const c of clouds) { c.position.x += c.userData.v * dt * 0.5; if (c.position.x > 85) c.position.x = -85; }
    for (const l of lanterns) { l.position.y += l.userData.v * dt * 0.5; if (l.position.y > 26) l.position.y = -6; }
    for (const g of w.islands) g.position.y = g.userData.y + Math.sin(t * 0.35 + g.userData.ph) * 0.15;
    w.beans.forEach((b, i) => {   // everyone turns to watch the camera, with a little hop
      b.getWorldPosition(wp); b.rotation.y = Math.atan2(camera.position.x - wp.x, camera.position.z - wp.z);
      b.position.y = b.userData.y + Math.abs(Math.sin(t * 1.1 + i * 1.7)) * 0.05;
    });
    renderer.render(scene, camera);
  });
  return w;
}

export function island(w, x, y, z, r) {
  const g = new THREE.Group(), rock = mesh(new THREE.ConeGeometry(r * 0.84, r * 1.5, 9), toon("#5a4a78"), 0, -1.15 - r * 0.75, 0); rock.rotation.x = Math.PI;
  g.add(mesh(cyl(r, r * 0.88, 0.7, 14), toon("#4f9a5a"), 0, -0.35, 0), mesh(cyl(r * 0.9, r * 0.82, 0.5, 14), toon("#7a5a3f"), 0, -0.9, 0), rock);
  g.position.set(x, y, z); g.userData = { y, ph: Math.random() * 6 }; w.scene.add(g); w.islands.push(g); return g;
}
export function house(g, x, z, color, h = 1.6, win = winMat) {
  const hs = new THREE.Group(), roof = mesh(new THREE.ConeGeometry(1.35, 1, 4), toon("#3a2756"), 0, h + 0.5, 0); roof.rotation.y = Math.PI / 4;
  hs.add(mesh(box(1.6, h, 1.5), toon(color), 0, h / 2, 0), roof, mesh(box(0.34, 0.6, 0.04), flat("#2a1a40"), 0, 0.3, 0.76));
  for (const s of [-1, 1]) hs.add(mesh(box(0.3, 0.38, 0.04), win, s * 0.48, h * 0.62, 0.76));
  hs.position.set(x, 0, z); g.add(hs); return hs;
}
export function tree(g, x, z, color = "#f29bc0", s = 1) {
  const t = new THREE.Group(); t.add(mesh(cyl(0.1, 0.15, 0.8, 6), toon("#6b4326"), 0, 0.4, 0), mesh(new THREE.SphereGeometry(0.62, 8, 6), toon(color), 0, 1.15, 0), mesh(new THREE.SphereGeometry(0.42, 8, 6), toon(color), 0.3, 1.6, 0.1));
  t.position.set(x, 0, z); t.scale.setScalar(s); g.add(t); return t;
}
export function lamp(g, x, z, color = "#ffc45a", power = 5) {
  const light = new THREE.PointLight(color, power, 7); light.position.set(x, 1.7, z);
  g.add(mesh(cyl(0.05, 0.07, 1.6, 6), toon("#1c1330"), x, 0.8, z), mesh(box(0.26, 0.26, 0.26), flat(color), x, 1.7, z), light); return light;
}
export function addBean(w, g, role, i, x, z, y = 0) {
  const b = makeBean(role, BEAN_COLORS[i % 8]); b.position.set(x, y, z); b.userData.y = y; g.add(b); w.beans.push(b); return b;
}
export function town(w, x, y, z) {
  const g = island(w, x, y, z, 6.2);
  [[-3, -2, "#c96a8f"], [0, -3.4, "#6a7fd0"], [3, -2, "#d0a05a"], [-3.6, 1.4, "#6ab0a0"], [3.6, 1.6, "#9a6ad0"]].forEach(([hx, hz, c], i) => house(g, hx, hz, c, 1.4 + (i % 3) * 0.5));
  tree(g, -1.4, 0.4); tree(g, 1.8, -0.2, "#7fd6a0"); tree(g, 0.4, 3.4, "#f29bc0", 0.8); lamp(g, -0.6, 2.2); lamp(g, 2.4, 3);
  return g;
}
