// The wardrobe: bean colors, head pieces and backpacks, all modelled in code in the same pixel style as the beans.
import * as THREE from "three";
import { quality, onQuality } from "./quality.mjs";

const grad = new THREE.DataTexture(new Uint8Array([80, 160, 255]), 3, 1, THREE.RedFormat);
grad.minFilter = grad.magFilter = THREE.NearestFilter; grad.needsUpdate = true;
const mats = {};
const toon = (c) => (mats[c] ??= new THREE.MeshToonMaterial({ color: c, gradientMap: grad }));
const flat = (c) => (mats["f" + c] ??= new THREE.MeshBasicMaterial({ color: c }));
const mesh = (geo, mat, x = 0, y = 0, z = 0) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); return m; };
const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);
const cyl = (a, b, h, s = 12) => new THREE.CylinderGeometry(a, b, h, s);
const cone = (r, h, s = 10) => new THREE.ConeGeometry(r, h, s);
const ball = (r, w = 10, h = 8) => new THREE.SphereGeometry(r, w, h);
const dome = (r) => new THREE.SphereGeometry(r, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2);
const turn = (m, x = 0, y = 0, z = 0) => { m.rotation.set(x, y, z); return m; };
const squash = (m, x = 1, y = 1, z = 1) => { m.scale.set(x, y, z); return m; };

// ---------- catalog ----------
export const BODIES = [
  { id: "bubblegum", name: "Bubblegum", colors: ["#ff9db5"] },
  { id: "sky", name: "Sky", colors: ["#8fd6ff"] },
  { id: "butter", name: "Butter", colors: ["#ffd97a"] },
  { id: "mint", name: "Mint", colors: ["#a5ecb0"] },
  { id: "lilac", name: "Lilac", colors: ["#cdb4ff"] },
  { id: "peach", name: "Peach", colors: ["#ffb98a"] },
  { id: "seafoam", name: "Seafoam", colors: ["#8fe8d8"] },
  { id: "orchid", name: "Orchid", colors: ["#f3a0f7"] },
  { id: "snowdrop", name: "Snowdrop", colors: ["#f4f1ff"] },
  { id: "cocoa", name: "Cocoa", colors: ["#b98a6a"] },
  { id: "cherry", name: "Cherry", colors: ["#ff6b6b"] },
  { id: "limefizz", name: "Lime Fizz", colors: ["#c8f26a"] },
  { id: "cobalt", name: "Cobalt", colors: ["#6f8dff"] },
  { id: "charcoal", name: "Charcoal", colors: ["#5a5370"] },
  { id: "frostbite", name: "Frostbite", colors: ["#ffffff", "#4f9dff", "#16307e"], locked: true },
  { id: "strawberrymilk", name: "Strawberry Milk", colors: ["#ffd0e1", "#e8384f", "#5e0820"], locked: true },
  { id: "cottoncandy", name: "Cotton Candy", colors: ["#ffb3d9", "#8fd6ff", "#1f4f9a"], locked: true },
  { id: "glowstick", name: "Glowstick", colors: ["#ff7ad0", "#c6ff2e", "#2f6400"], locked: true },
  { id: "wraith", name: "Wraith", colors: ["#a6ffbf", "#4a2a70", "#0c0518"], locked: true },
];

const HEAD = {
  cap(g) {
    g.add(squash(mesh(dome(0.37), toon("#e8384f"), 0, 0.94, 0), 1, 0.75, 1),
      turn(mesh(box(0.4, 0.035, 0.3), toon("#e8384f"), 0, 0.96, 0.4), 0.12), mesh(box(0.08, 0.05, 0.08), flat("#ffffff"), 0, 1.23, 0));
  },
  beanie(g) {
    g.add(squash(mesh(dome(0.4), toon("#3fb8a8"), 0, 0.9, 0), 1, 0.85, 1), mesh(cyl(0.41, 0.41, 0.13), toon("#2a8a7e"), 0, 0.94, 0), mesh(ball(0.1, 8, 6), toon("#ffffff"), 0, 1.27, 0));
  },
  bandana(g) {
    g.add(mesh(cyl(0.36, 0.41, 0.15), toon("#3a6fd8"), 0, 0.93, 0));
    for (const s of [-1, 1]) g.add(turn(mesh(box(0.08, 0.2, 0.05), toon("#3a6fd8"), s * 0.07, 0.8, -0.42), 0.3, 0, s * 0.5));
    for (const [x, y] of [[-0.18, 0.95], [0, 0.9], [0.18, 0.95]]) g.add(mesh(box(0.05, 0.05, 0.03), flat("#ffffff"), x, y, 0.37));
  },
  chef(g) {
    g.add(mesh(cyl(0.33, 0.33, 0.16), toon("#ffffff"), 0, 1.02, 0), squash(mesh(ball(0.4), toon("#f6f4ff"), 0, 1.32, 0), 1, 0.72, 1));
    for (const s of [-1, 1]) g.add(squash(mesh(ball(0.22, 8, 6), toon("#f6f4ff"), s * 0.22, 1.34, 0), 1, 0.85, 1));
  },
  cowboy(g) {
    g.add(mesh(cyl(0.58, 0.58, 0.04), toon("#b0743c"), 0, 1.0, 0), mesh(cyl(0.25, 0.3, 0.32), toon("#b0743c"), 0, 1.17, 0), mesh(cyl(0.31, 0.31, 0.07), flat("#5e3b1f"), 0, 1.06, 0),
      mesh(box(0.08, 0.04, 0.4), toon("#8a5a2c"), 0, 1.33, 0));
    for (const s of [-1, 1]) g.add(turn(mesh(box(0.22, 0.04, 0.6), toon("#b0743c"), s * 0.62, 1.07, 0), 0, 0, s * 0.7));
  },
  crown(g) {
    g.add(mesh(cyl(0.3, 0.3, 0.16, 10), toon("#ffcf3f"), 0, 1.06, 0));
    for (let i = 0; i < 5; i++) { const a = (i / 5) * Math.PI * 2; g.add(mesh(cone(0.07, 0.18, 4), toon("#ffcf3f"), Math.sin(a) * 0.27, 1.22, Math.cos(a) * 0.27)); }
    g.add(mesh(box(0.08, 0.08, 0.04), flat("#e8384f"), 0, 1.06, 0.3), mesh(box(0.06, 0.06, 0.04), flat("#4f9dff"), -0.17, 1.06, 0.25), mesh(box(0.06, 0.06, 0.04), flat("#4f9dff"), 0.17, 1.06, 0.25));
  },
  pirate(g) {
    g.add(mesh(cyl(0.28, 0.33, 0.24), toon("#2a2438"), 0, 1.13, 0));
    for (let i = 0; i < 3; i++) { const a = (i / 3) * Math.PI * 2; const b = turn(mesh(box(0.5, 0.2, 0.05), toon("#2a2438"), Math.sin(a) * 0.32, 1.1, Math.cos(a) * 0.32), -0.35, a, 0); b.rotation.order = "YXZ"; g.add(b); }
    g.add(mesh(box(0.1, 0.09, 0.03), flat("#f6f4ff"), 0, 1.17, 0.35), mesh(box(0.42, 0.03, 0.03), flat("#ffcf3f"), 0, 1.0, 0.36));
  },
  wizard(g) {
    g.add(mesh(cyl(0.5, 0.5, 0.04), toon("#4a3fd0"), 0, 1.01, 0), turn(mesh(cone(0.34, 0.8), toon("#4a3fd0"), 0.05, 1.42, 0), 0, 0, -0.15));
    for (const [x, y, z] of [[0.08, 1.3, 0.25], [-0.12, 1.15, 0.27], [0.12, 1.55, 0.13]]) g.add(mesh(box(0.07, 0.07, 0.03), flat("#ffe14a"), x, y, z));
  },
  viking(g) {
    g.add(squash(mesh(dome(0.4), toon("#a8b0c0"), 0, 0.9, 0), 1, 0.8, 1), mesh(cyl(0.41, 0.41, 0.08), toon("#8a6a3a"), 0, 0.93, 0), mesh(box(0.06, 0.32, 0.04), toon("#8a6a3a"), 0, 1.06, 0.33));
    for (const s of [-1, 1]) g.add(turn(mesh(cone(0.08, 0.34, 8), toon("#f5ecd0"), s * 0.44, 1.15, 0), 0, 0, -s * 0.9));
  },
  party(g) {
    g.add(turn(mesh(cone(0.2, 0.48), toon("#ff7ad9"), 0.06, 1.33, 0), 0, 0, -0.2), mesh(ball(0.07, 8, 6), toon("#ffe14a"), 0.12, 1.58, 0));
    for (const [y, c] of [[1.2, "#8fd6ff"], [1.36, "#ffe14a"]]) g.add(turn(mesh(cyl(0.16 - (y - 1.2) * 0.5, 0.17 - (y - 1.2) * 0.5, 0.04), flat(c), 0.04 + (y - 1.2) * 0.2, y, 0), 0, 0, -0.2));
  },
  propeller(g) {
    ["#e8384f", "#ffcf3f", "#4f9dff", "#5ad16b"].forEach((c, i) => {
      const q = new THREE.Mesh(new THREE.SphereGeometry(0.38, 4, 6, (i * Math.PI) / 2, Math.PI / 2, 0, Math.PI / 2), toon(c)); q.position.y = 0.92; q.scale.y = 0.8; g.add(q);
    });
    const spin = new THREE.Group(); spin.position.y = 1.32; spin.userData.anim = "spin";
    spin.add(mesh(box(0.6, 0.03, 0.08), toon("#ffcf3f")), mesh(box(0.08, 0.06, 0.08), toon("#e8384f")));
    g.add(mesh(cyl(0.025, 0.025, 0.14, 6), toon("#2a2438"), 0, 1.24, 0), spin);
  },
  bunny(g) {
    g.add(mesh(cyl(0.38, 0.38, 0.05), toon("#ffffff"), 0, 1.0, 0));
    for (const s of [-1, 1]) {
      const ear = new THREE.Group(); ear.position.set(s * 0.16, 1.05, 0); ear.rotation.z = s === 1 ? -0.9 : 0.1;
      ear.add(squash(mesh(ball(0.1, 8, 6), toon("#ffffff"), 0, 0.26, 0), 1, 3, 0.6), squash(mesh(ball(0.05, 6, 6), flat("#ffb3cf"), 0, 0.26, 0.05), 1, 4, 0.4));
      g.add(ear);
    }
  },
  cat(g) {
    for (const s of [-1, 1]) {
      g.add(turn(mesh(cone(0.14, 0.24, 4), toon("#2a2438"), s * 0.22, 1.1, 0), 0, Math.PI / 4, -s * 0.35),
        turn(mesh(cone(0.07, 0.13, 4), flat("#ff9db5"), s * 0.22, 1.08, 0.07), 0, Math.PI / 4, -s * 0.35));
    }
  },
  witch(g) {
    g.add(mesh(cyl(0.56, 0.56, 0.04), toon("#3a2550"), 0, 1.01, 0), mesh(cyl(0.22, 0.3, 0.3), toon("#3a2550"), 0, 1.17, 0),
      turn(mesh(cyl(0.08, 0.22, 0.3), toon("#3a2550"), 0.05, 1.44, 0), 0, 0, -0.3), turn(mesh(cone(0.08, 0.24, 8), toon("#3a2550"), 0.17, 1.66, 0), 0, 0, -0.8),
      mesh(cyl(0.31, 0.31, 0.07), flat("#7dff9a"), 0, 1.06, 0), mesh(box(0.1, 0.1, 0.03), flat("#ffcf3f"), 0, 1.06, 0.31));
  },
  sombrero(g) {
    g.add(mesh(cyl(0.72, 0.62, 0.08, 16), toon("#f2c14e"), 0, 1.0, 0), mesh(cyl(0.18, 0.28, 0.38), toon("#f2c14e"), 0, 1.22, 0),
      mesh(cyl(0.285, 0.285, 0.06), flat("#e8384f"), 0, 1.07, 0), mesh(cyl(0.26, 0.26, 0.05), flat("#5ad16b"), 0, 1.13, 0), mesh(cyl(0.725, 0.725, 0.03, 16), flat("#e8384f"), 0, 1.04, 0));
  },
  bucket(g) {
    g.add(mesh(cyl(0.3, 0.34, 0.2), toon("#8fae6a"), 0, 1.07, 0), mesh(cyl(0.34, 0.52, 0.12), toon("#8fae6a"), 0, 0.98, 0), mesh(cyl(0.345, 0.345, 0.04), flat("#5e7a3e"), 0, 1.0, 0));
  },
  flowers(g) {
    const cols = ["#ff9db5", "#ffffff", "#ffe14a", "#cdb4ff"];
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2, x = Math.sin(a) * 0.35, z = Math.cos(a) * 0.33;
      g.add(mesh(ball(0.08, 6, 5), toon(cols[i % 4]), x, 0.98, z), mesh(box(0.06, 0.03, 0.1), toon("#5ad16b"), Math.sin(a + 0.35) * 0.36, 0.95, Math.cos(a + 0.35) * 0.34));
    }
  },
  headphones(g) {
    g.add(mesh(new THREE.TorusGeometry(0.53, 0.04, 6, 16, Math.PI), toon("#2a2438"), 0, 0.66, 0));
    for (const s of [-1, 1]) g.add(turn(mesh(cyl(0.15, 0.15, 0.12), toon("#7de8c8"), s * 0.52, 0.66, 0), 0, 0, Math.PI / 2), turn(mesh(cyl(0.1, 0.1, 0.13), flat("#2a2438"), s * 0.55, 0.66, 0), 0, 0, Math.PI / 2));
  },
  horns(g) {
    for (const s of [-1, 1]) {
      g.add(turn(mesh(cyl(0.06, 0.085, 0.14, 8), toon("#e8384f"), s * 0.22, 1.08, 0.05), 0, 0, -s * 0.35), turn(mesh(cone(0.06, 0.16, 8), toon("#e8384f"), s * 0.28, 1.21, 0.05), 0, 0, -s * 0.75));
    }
  },
  grad(g) {
    g.add(mesh(cyl(0.3, 0.33, 0.16), toon("#2a2438"), 0, 1.05, 0), turn(mesh(box(0.68, 0.04, 0.68), toon("#2a2438"), 0, 1.15, 0), 0, Math.PI / 4, 0),
      mesh(box(0.06, 0.04, 0.06), flat("#ffcf3f"), 0, 1.18, 0), mesh(box(0.03, 0.3, 0.03), flat("#ffcf3f"), 0.36, 1.02, 0.2));
  },
};
export const HEADS = [
  { id: "none", name: "Nothing" },
  { id: "cap", name: "Ball Cap" }, { id: "beanie", name: "Cozy Beanie" }, { id: "bandana", name: "Trail Bandana" },
  { id: "chef", name: "Chef's Toque", locked: true }, { id: "cowboy", name: "Ranch Hat", locked: true }, { id: "crown", name: "Royal Crown", locked: true },
  { id: "pirate", name: "Pirate Tricorn", locked: true }, { id: "wizard", name: "Starry Wizard", locked: true }, { id: "viking", name: "Viking Helm", locked: true },
  { id: "party", name: "Party Cone", locked: true }, { id: "propeller", name: "Propeller Cap", locked: true }, { id: "bunny", name: "Bunny Ears", locked: true },
  { id: "cat", name: "Kitty Ears", locked: true }, { id: "witch", name: "Witch Hat", locked: true }, { id: "sombrero", name: "Fiesta Sombrero", locked: true },
  { id: "bucket", name: "Bucket Hat", locked: true }, { id: "flowers", name: "Flower Crown", locked: true }, { id: "headphones", name: "Beat Headphones", locked: true },
  { id: "horns", name: "Devil Horns", locked: true }, { id: "grad", name: "Graduation Cap", locked: true },
];

// Bat wing: membrane with scalloped trailing edge between four finger tips, bones on top, a claw at the wrist.
let wingGeo;
const membrane = new THREE.MeshToonMaterial({ color: "#5a3480", gradientMap: grad, side: THREE.DoubleSide });
function batWing() {
  const tips = [[0.82, 0.18], [0.64, -0.1], [0.44, -0.16], [0.22, -0.17]], dips = [[0.62, 0.1], [0.53, 0.0], [0.33, -0.05], [0.1, -0.05]];
  if (!wingGeo) {
    const sh = new THREE.Shape(); sh.moveTo(0, 0.1); sh.lineTo(0.62, 0.36); sh.lineTo(tips[0][0], tips[0][1]);
    for (let i = 1; i < 4; i++) sh.quadraticCurveTo(dips[i - 1][0], dips[i - 1][1], tips[i][0], tips[i][1]);
    sh.quadraticCurveTo(dips[3][0], dips[3][1], 0, -0.08); sh.closePath();
    wingGeo = new THREE.ShapeGeometry(sh, 8);
  }
  const w = new THREE.Group(); w.add(new THREE.Mesh(wingGeo, membrane));
  const bone = (x1, y1, x2, y2, r = 0.02) => {
    const len = Math.hypot(x2 - x1, y2 - y1), b = mesh(box(len, r, r * 1.6), toon("#22142e"), (x1 + x2) / 2, (y1 + y2) / 2, 0);
    b.rotation.z = Math.atan2(y2 - y1, x2 - x1); w.add(b);
  };
  bone(0, 0.1, 0.62, 0.36, 0.03);
  for (const [x, y] of tips) bone(0.62, 0.36, x, y);
  const claw = mesh(cone(0.03, 0.08, 5), toon("#efe6ff"), 0.63, 0.41, 0); w.add(claw);
  return w;
}

const PACK = {
  daypack(g) {
    g.add(mesh(box(0.56, 0.6, 0.26), toon("#5b7bd5"), 0, 0.6, -0.54), mesh(box(0.4, 0.24, 0.08), toon("#7d98e6"), 0, 0.48, -0.7), mesh(box(0.42, 0.03, 0.02), flat("#2a2438"), 0, 0.82, -0.68));
  },
  mini(g) {
    g.add(mesh(box(0.36, 0.36, 0.18), toon("#ff9db5"), 0, 0.66, -0.5), mesh(ball(0.06, 6, 5), flat("#ffe14a"), 0, 0.66, -0.6));
    for (let i = 0; i < 5; i++) { const a = (i / 5) * Math.PI * 2; g.add(mesh(ball(0.05, 6, 5), flat("#ffffff"), Math.sin(a) * 0.08, 0.66 + Math.cos(a) * 0.08, -0.6)); }
  },
  explorer(g) {
    g.add(mesh(box(0.6, 0.82, 0.3), toon("#6a8a45"), 0, 0.7, -0.56), turn(mesh(cyl(0.13, 0.13, 0.74), toon("#c9a46a"), 0, 1.18, -0.56), 0, 0, Math.PI / 2),
      mesh(box(0.44, 0.22, 0.08), toon("#56733a"), 0, 0.5, -0.74), mesh(cyl(0.07, 0.07, 0.24, 8), toon("#9be7ff"), 0.36, 0.5, -0.56));
  },
  teddy(g) {
    g.add(squash(mesh(ball(0.32), toon("#a8703f"), 0, 0.64, -0.6), 1, 1, 0.6), mesh(ball(0.1, 8, 6), toon("#a8703f"), -0.22, 0.92, -0.6), mesh(ball(0.1, 8, 6), toon("#a8703f"), 0.22, 0.92, -0.6),
      squash(mesh(ball(0.11, 8, 6), toon("#e3c08f"), 0, 0.58, -0.78), 1, 0.8, 0.5), mesh(box(0.06, 0.04, 0.03), flat("#1c1330"), 0, 0.62, -0.84),
      mesh(box(0.05, 0.05, 0.03), flat("#1c1330"), -0.1, 0.74, -0.78), mesh(box(0.05, 0.05, 0.03), flat("#1c1330"), 0.1, 0.74, -0.78));
  },
  rocket(g) {
    g.add(mesh(box(0.34, 0.4, 0.14), toon("#8a86a0"), 0, 0.66, -0.5));
    for (const s of [-1, 1]) {
      const flame = mesh(cone(0.08, 0.2, 6), flat("#ff8a3c"), s * 0.17, 0.2, -0.6); flame.rotation.x = Math.PI; flame.userData.anim = "flicker";
      g.add(mesh(cyl(0.12, 0.12, 0.52), toon("#dfe6f5"), s * 0.17, 0.62, -0.6), mesh(cone(0.12, 0.18), toon("#e8384f"), s * 0.17, 0.97, -0.6), mesh(cyl(0.09, 0.12, 0.08), toon("#5a5370"), s * 0.17, 0.33, -0.6), flame);
    }
  },
  turtle(g) {
    g.add(squash(turn(mesh(dome(0.46), toon("#5aa84f"), 0, 0.6, -0.36), -Math.PI / 2), 1, 1, 0.9));
    for (const [x, y] of [[0, 0.6], [-0.2, 0.78], [0.2, 0.78], [-0.2, 0.42], [0.2, 0.42]]) g.add(mesh(box(0.15, 0.13, 0.04), flat("#3f7a3a"), x, y, x === 0 ? -0.79 : -0.73));
  },
  bat(g) {
    g.add(squash(mesh(ball(0.2), toon("#3a2550"), 0, 0.7, -0.52), 1, 1.1, 0.7));
    for (const s of [-1, 1]) {
      const hinge = new THREE.Group(); hinge.position.set(s * 0.12, 0.78, -0.58); hinge.userData.anim = "flap"; hinge.userData.side = s;
      const wing = batWing(); wing.scale.x = s; wing.rotation.y = s * 0.35;
      hinge.add(wing); g.add(hinge);
    }
  },
  chest(g) {
    g.add(mesh(box(0.56, 0.36, 0.3), toon("#8a5a34"), 0, 0.56, -0.56), squash(turn(mesh(cyl(0.15, 0.15, 0.56, 10, 1), toon("#8a5a34"), 0, 0.74, -0.56), 0, 0, Math.PI / 2), 1, 1, 1));
    for (const x of [-0.2, 0.2]) g.add(mesh(box(0.06, 0.38, 0.32), toon("#ffcf3f"), x, 0.6, -0.56));
    g.add(mesh(box(0.1, 0.12, 0.04), flat("#ffcf3f"), 0, 0.66, -0.73));
  },
  boba(g) {
    g.add(mesh(cyl(0.22, 0.17, 0.56), toon("#e8c39e"), 0, 0.62, -0.58), squash(mesh(dome(0.23), toon("#f6f4ff"), 0, 0.9, -0.58), 1, 0.4, 1),
      turn(mesh(cyl(0.035, 0.035, 0.46, 6), toon("#ff7ad9"), 0.08, 1.1, -0.58), 0, 0, -0.25));
    for (const [x, y] of [[-0.1, 0.4], [0.02, 0.38], [0.12, 0.42], [-0.04, 0.47], [0.08, 0.5]]) g.add(mesh(ball(0.045, 6, 5), flat("#2a1a14"), x, y, -0.76));
  },
  coffin(g) {
    const lid = mesh(cyl(0.24, 0.17, 0.72, 6), toon("#3a2b48"), 0, 0.62, -0.54); lid.scale.z = 0.38; g.add(lid);
    g.add(mesh(box(0.05, 0.34, 0.03), flat("#cfc6e6"), 0, 0.68, -0.64), mesh(box(0.2, 0.05, 0.03), flat("#cfc6e6"), 0, 0.76, -0.64));
  },
};
export const PACKS = [
  { id: "none", name: "Nothing" },
  { id: "daypack", name: "Everyday Daypack" },
  { id: "mini", name: "Mini Bloom", locked: true }, { id: "explorer", name: "Explorer Rucksack", locked: true }, { id: "teddy", name: "Teddy Pack", locked: true },
  { id: "rocket", name: "Rocket Pack", locked: true }, { id: "turtle", name: "Turtle Shell", locked: true }, { id: "bat", name: "Bat Wings", locked: true },
  { id: "chest", name: "Treasure Chest", locked: true }, { id: "boba", name: "Boba Pack", locked: true }, { id: "coffin", name: "Tiny Coffin", locked: true },
];
// ---------- shop catalogs: houses, kill signatures, tombstones, emotes, victory dances ----------
export const HOUSES = [
  { id: "match", name: "Matches my bean" },
  { id: "paint-rosehip", name: "Rosehip", color: "#e0607e", locked: true }, { id: "paint-tangerine", name: "Tangerine Dream", color: "#ff9d4d", locked: true },
  { id: "paint-honeycomb", name: "Honeycomb", color: "#f2c14e", locked: true }, { id: "paint-pistachio", name: "Pistachio", color: "#9fd67a", locked: true },
  { id: "paint-lagoon", name: "Lagoon", color: "#3fb8a8", locked: true }, { id: "paint-bluebell", name: "Bluebell", color: "#6a8fe8", locked: true },
  { id: "paint-plumjam", name: "Plum Jam", color: "#8a5ad0", locked: true }, { id: "paint-marshmallow", name: "Marshmallow", color: "#f6f0ff", locked: true },
  { id: "paint-slate", name: "Storm Slate", color: "#5f6480", locked: true }, { id: "paint-ink", name: "Midnight Ink", color: "#2f2a55", locked: true },
  { id: "mushroom", name: "Mushroom Cottage", locked: true }, { id: "lighthouse", name: "Lighthouse", locked: true },
  { id: "haunted", name: "Haunted Mansion", locked: true }, { id: "bakery", name: "Bakery", locked: true },
];
// The Mafia's signature move, shown to the victim. "usual" plays the free move for the room's mode (see killMethod).
export const KILLFX = [
  { id: "usual", name: "The Usual" },
  { id: "fedora", name: "Fedora Shadow", mode: "classic" }, { id: "shove", name: "Long Way Down", mode: "gore" }, { id: "mallet", name: "Squeaky Mallet", mode: "crazy" },
  { id: "piano", name: "Falling Piano", locked: true }, { id: "anvil", name: "Anvil Drop", locked: true }, { id: "muffin", name: "Poisoned Muffin", locked: true },
  { id: "banana", name: "Banana Peel", locked: true }, { id: "duck", name: "Rubber Duck", locked: true }, { id: "tickle", name: "Tickle Attack", locked: true },
  { id: "pie", name: "Pie Bomb", locked: true }, { id: "boot", name: "Giant Boot", locked: true }, { id: "bees", name: "Angry Bees", locked: true },
];
export const TOMBS = [
  { id: "stone", name: "Plain Stone" },
  { id: "ghostpop", name: "Ghost Pop", locked: true }, { id: "bloom", name: "Flower Bloom", locked: true }, { id: "shatter", name: "Pixel Shatter", locked: true },
  { id: "casket", name: "Cozy Casket", locked: true }, { id: "ufo", name: "UFO Beam", locked: true },
];
// Emotes are owned items, not part of a look.
export const EMOTES = [
  { id: "wave", name: "Wave" }, { id: "shrug", name: "Shrug" }, { id: "laugh", name: "Laugh" }, { id: "point", name: "Point" }, { id: "sweat", name: "Sweat" },
  { id: "heart", name: "Heart", locked: true }, { id: "steam", name: "Angry Steam", locked: true }, { id: "sleepy", name: "Sleepy", locked: true },
  { id: "cry", name: "Cry", locked: true }, { id: "spin", name: "Spin", locked: true },
];
export const DANCES = [
  { id: "hop", name: "Bean Bounce" },
  { id: "stomp", name: "Puddle Stomp", locked: true }, { id: "wiggle", name: "Jelly Wiggle", locked: true }, { id: "twirl", name: "Twirlybird", locked: true },
  { id: "moonwaddle", name: "Moonwaddle", locked: true }, { id: "flip", name: "Flapjack Flip", locked: true },
];
export const RACKS = { body: BODIES, head: HEADS, pack: PACKS, house: HOUSES, killfx: KILLFX, tomb: TOMBS, dance: DANCES };   // one rack per look key
export const SHOP = { ...RACKS, emote: EMOTES };   // everything the shop sells
export const DEFAULT_LOOK = { body: "bubblegum", head: "none", pack: "none", house: "match", killfx: "usual", tomb: "stone", dance: "hop" };
export const kit = { toon, flat, mesh, box, cyl, cone, ball, dome, turn, squash, grad };   // shared pixel modelling helpers (used by stage.mjs)

// ---------- picture quality (quality.mjs) ----------
// The Low look draws a 3D view at one render pixel per 3 CSS pixels with no anti-aliasing, and the page grows it back
// with square pixels (image-rendering: pixelated). Anti-aliasing is fixed when a WebGL context is made, so pixelPass()
// draws the scene into a small target without it and then copies that to the canvas pixel for pixel.
// (Nothing here touches the page or WebGL at load: the server imports this file for its catalogs.)
export const LOW_RATIO = 1 / 3;
export function pixelPass(renderer) {
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.MeshBasicMaterial({ blending: THREE.NoBlending, depthTest: false, depthWrite: false }));
  const solo = new THREE.Scene(), cam2 = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1); solo.add(quad);
  let rt = null;   // an sRGB target, so dark night skies keep smooth bands
  return {
    render(scene, cam) {
      const { width: w, height: h } = renderer.domElement;
      if (!rt) { rt = new THREE.WebGLRenderTarget(w, h, { colorSpace: THREE.SRGBColorSpace, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, generateMipmaps: false }); quad.material.map = rt.texture; quad.material.needsUpdate = true; }
      else if (rt.width !== w || rt.height !== h) rt.setSize(w, h);
      renderer.setRenderTarget(rt); renderer.render(scene, cam); renderer.setRenderTarget(null);
      const info = renderer.info, auto = info.autoReset; info.autoReset = false; renderer.render(solo, cam2); info.autoReset = auto;   // stats keep the scene's counts
    },
    dispose() { rt?.dispose(); quad.geometry.dispose(); quad.material.dispose(); },
  };
}
// 3D-made images on the page (portraits, shop previews). Each remembers how to draw itself again: in the new look when
// the quality changes, and to suit the width the page really shows it at once that is known (callers only guess the
// size; in Low that is about 3 CSS pixels per image pixel). again(width in CSS px, or 0 when unknown) returns the image URL.
const made = new Map();
let fitting = 0, following = false;
export const lowSize = (w, min = 16) => Math.max(min, Math.round(w / 12) * 4);   // image pixels across for w CSS px, in steps of 4
export function madeImage(url, again) {
  made.set(url, again);
  if (!following) { following = true; onQuality(() => redraw(true)); }
  if (!fitting) fitting = requestAnimationFrame(() => { fitting = 0; redraw(false); });   // runs before the next paint
  return url;
}
function redraw(all) {
  for (const img of document.images) {
    const src = img.getAttribute("src"), again = src && made.get(src), w = again ? img.clientWidth : 0;
    if (!again || (!all && !w)) continue;
    const url = again(w); if (url !== src) { made.set(url, again); img.src = url; }
  }
}

// Keeps only ids the catalog knows, so a look from the network can never inject anything. Missing keys get defaults.
export function cleanLook(l) {
  if (!l || typeof l !== "object") return null;
  const out = {};
  for (const rack of Object.keys(RACKS)) out[rack] = RACKS[rack].some((i) => i.id === l[rack]) ? l[rack] : DEFAULT_LOOK[rack];
  return out;
}
// Which kill scene to play: the player's signature if it is a real move, else the free move for the room's mode.
export function killMethod(id, mode = "classic") {
  const item = KILLFX.find((k) => k.id === id);
  if (item && id !== "usual") return id;
  return (KILLFX.find((k) => k.mode === mode) || KILLFX[1]).id;
}
export const bodyColors = (body) => BODIES.find((b) => b.id === body)?.colors || [typeof body === "string" && body[0] === "#" ? body : BODIES[0].colors[0]];

// ---------- building ----------
const gradMats = {};
export function bodyMaterial(body) {
  const item = BODIES.find((b) => b.id === body);
  if (!item) return toon(body || BODIES[0].colors[0]);   // plain hex, for beans with no chosen look
  if (item.colors.length === 1) return toon(item.colors[0]);
  return (gradMats[body] ??= new THREE.MeshToonMaterial({ color: "#ffffff", vertexColors: true, gradientMap: grad }));
}
// Gradient bodies blend from the top colour down through each stop, ending in a deep shade at the feet.
export function bodyGeometry(body) {
  const item = BODIES.find((b) => b.id === body), stops = item?.colors.length > 1 ? item.colors.map((c) => new THREE.Color(c)) : null;
  const geo = stops ? new THREE.SphereGeometry(0.5, 16, 16) : new THREE.SphereGeometry(0.5, 12, 10);
  if (stops) {
    const c = new THREE.Color(), pos = geo.attributes.position, out = [], last = stops.length - 1;
    for (let i = 0; i < pos.count; i++) {
      const t = Math.min(0.999, Math.max(0, 0.5 - pos.getY(i))) * last, k = Math.floor(t);   // 0 at the top, last at the bottom
      c.copy(stops[k]).lerp(stops[k + 1], t - k); out.push(c.r, c.g, c.b);
    }
    geo.setAttribute("color", new THREE.Float32BufferAttribute(out, 3));
  }
  return geo;
}
export function dress(g, look) { HEAD[look.head]?.(g); PACK[look.pack]?.(g); }
export const wearsHat = (look) => !!HEAD[look?.head];

// Moves the living parts (propellers, flames, wings) of a dressed bean.
export function animate(g, t) {
  g.traverse((o) => {
    const a = o.userData.anim;
    if (a === "spin") o.rotation.y = t * 9;
    else if (a === "flicker") o.scale.y = 0.7 + Math.abs(Math.sin(t * 23 + o.position.x * 9)) * 0.6;
    else if (a === "flap") o.rotation.y = o.userData.side * Math.sin(t * 6) * 0.5;
  });
}

// ---------- houses ----------
// Paints a geometry top to bottom through the colour stops (the same blend gradient beans use).
function shade(geo, colors) {
  geo.computeBoundingBox();
  const { min, max } = geo.boundingBox, stops = colors.map((c) => new THREE.Color(c)), last = stops.length - 1, c = new THREE.Color(), pos = geo.attributes.position, out = [];
  for (let i = 0; i < pos.count; i++) {
    const t = Math.min(0.999, Math.max(0, (max.y - pos.getY(i)) / (max.y - min.y))) * last, k = Math.floor(t);
    c.copy(stops[k]).lerp(stops[k + 1], t - k); out.push(c.r, c.g, c.b);
  }
  geo.setAttribute("color", new THREE.Float32BufferAttribute(out, 3));
  return geo;
}
const gradWall = new THREE.MeshToonMaterial({ color: "#ffffff", vertexColors: true, gradientMap: grad });
const wall = (geo, colors, x, y, z) => (colors.length > 1 ? mesh(shade(geo, colors), gradWall, x, y, z) : mesh(geo, toon(colors[0]), x, y, z));
// A door on a hinge (u.door swings open with rotation.y), with a doorway behind it that glows with the house lights.
function door(g, u, z, w = 0.44, h = 0.74, color = "#8a5a34", x = 0) {
  const hinge = new THREE.Group(); hinge.position.set(x - w / 2, 0.12, z + 0.03);
  hinge.add(mesh(box(w, h, 0.05), toon(color), w / 2, h / 2, 0), mesh(box(w - 0.12, 0.05, 0.02), toon("#5e3b1f"), w / 2, h * 0.62, 0.03), mesh(box(0.06, 0.06, 0.05), flat("#ffcf3f"), w - 0.08, h * 0.45, 0.04));
  g.add(mesh(box(w + 0.12, h + 0.06, 0.04), toon("#f6f0ff"), x, 0.12 + h / 2 + 0.03, z - 0.005), mesh(box(w, h, 0.04), u.win, x, 0.12 + h / 2, z + 0.004), hinge,
    mesh(box(w + 0.3, 0.1, 0.34), toon("#b9b3c8"), x, 0.05, z + 0.2));
  u.door = hinge; u.doorX = x; u.doorZ = z;
}
function pane(g, u, x, y, z, w = 0.34, h = 0.4) {
  g.add(mesh(box(w + 0.1, h + 0.1, 0.04), toon("#f6f0ff"), x, y, z), mesh(box(w, h, 0.04), u.win, x, y, z + 0.012),
    mesh(box(w, 0.03, 0.02), toon("#f6f0ff"), x, y, z + 0.035), mesh(box(0.03, h, 0.02), toon("#f6f0ff"), x, y, z + 0.035));
}
function cottage(g, u, colors) {
  const roof = turn(mesh(cone(1.62, 1.15, 4), toon("#3a2756"), 0, 2.18, 0), 0, Math.PI / 4, 0);
  g.add(mesh(box(1.96, 0.12, 1.76), toon("#8d879c"), 0, 0.06, 0), wall(new THREE.BoxGeometry(1.8, 1.5, 1.6, 1, 6, 1), colors, 0, 0.82, 0), mesh(box(2.02, 0.08, 1.82), toon("#f6f0ff"), 0, 1.6, 0), roof,
    mesh(box(0.28, 0.62, 0.28), toon("#9a7a6a"), 0.52, 2.2, -0.25), mesh(box(0.36, 0.08, 0.36), toon("#5e4a44"), 0.52, 2.53, -0.25));
  door(g, u, 0.8);
  for (const s of [-1, 1]) pane(g, u, s * 0.56, 0.98, 0.8);
  g.add(mesh(box(0.5, 0.1, 0.12), toon("#8a5a34"), 0.56, 0.7, 0.88));
  for (const [x, c] of [[0.42, "#ff9db5"], [0.56, "#ffe14a"], [0.7, "#ffffff"]]) g.add(mesh(box(0.09, 0.09, 0.09), flat(c), x, 0.79, 0.88));
  Object.assign(u, { top: 2.75, smoke: [0.52, 2.6, -0.25], window: [0.56, 0.98, 0.82], roost: [0, 2.7, 0] });
}
const SKIN = {
  mushroom(g, u) {
    g.add(mesh(cyl(0.82, 0.98, 1.25, 10), toon("#f4e6c8"), 0, 0.62, 0), squash(mesh(dome(1.5), toon("#e8384f"), 0, 1.15, 0), 1, 0.78, 1), mesh(cyl(1.5, 1.3, 0.1, 12), toon("#fff3dc"), 0, 1.13, 0),
      turn(mesh(cyl(0.1, 0.12, 0.5, 6), toon("#f4e6c8"), 0.55, 2.2, -0.2), 0, 0, -0.2), mesh(box(0.56, 0.86, 0.3), toon("#f4e6c8"), 0, 0.5, 0.8));
    for (const [a, e, r] of [[0.3, 0.6, 0.24], [1.5, 0.95, 0.2], [2.6, 0.5, 0.26], [3.9, 0.85, 0.22], [5.1, 0.55, 0.25], [0.9, 1.3, 0.2], [4.6, 1.25, 0.16], [5.9, 0.25, 0.2], [0.75, 0.2, 0.17]]) {
      g.add(squash(mesh(ball(r, 8, 6), toon("#ffffff"), Math.sin(a) * Math.cos(e) * 1.46, 1.15 + Math.sin(e) * 1.14, Math.cos(a) * Math.cos(e) * 1.46), 1, 0.6, 1));
    }
    door(g, u, 0.95, 0.4, 0.66, "#b0743c"); pane(g, u, 0.55, 0.75, 0.74, 0.2, 0.24); pane(g, u, -0.55, 0.75, 0.74, 0.2, 0.24);
    Object.assign(u, { top: 2.45, smoke: [0.6, 2.5, -0.2], window: [0.55, 0.75, 0.78], roost: [0, 2.3, 0] });
  },
  lighthouse(g, u) {
    g.add(mesh(cyl(0.98, 1.08, 0.3, 10), toon("#8d879c"), 0, 0.15, 0));
    for (let i = 0; i < 4; i++) g.add(mesh(cyl(0.8 - (i + 1) * 0.07, 0.8 - i * 0.07, 0.62, 10), toon(i % 2 ? "#e8384f" : "#f6f0ff"), 0, 0.61 + i * 0.62, 0));
    g.add(mesh(cyl(0.72, 0.72, 0.08, 10), toon("#2a2438"), 0, 2.82, 0), mesh(cyl(0.38, 0.38, 0.46, 8), u.win, 0, 3.08, 0), mesh(cone(0.56, 0.5, 8), toon("#e8384f"), 0, 3.56, 0),
      mesh(ball(0.07, 6, 5), flat("#ffcf3f"), 0, 3.86, 0), mesh(box(0.62, 0.92, 0.36), toon("#f6f0ff"), 0, 0.58, 0.72), mesh(box(0.7, 0.08, 0.44), toon("#e8384f"), 0, 1.06, 0.72));
    for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; g.add(mesh(box(0.04, 0.3, 0.04), toon("#2a2438"), Math.sin(a) * 0.68, 2.98, Math.cos(a) * 0.68)); }
    door(g, u, 0.9, 0.4, 0.68, "#3a6fd8"); pane(g, u, 0, 1.75, 0.6, 0.2, 0.26);
    Object.assign(u, { top: 3.9, smoke: [0, 3.9, 0], window: [0, 1.75, 0.64], roost: [0, 3.8, 0] });
  },
  haunted(g, u) {
    u.lit = "#a4ff7a";
    g.add(mesh(box(1.9, 0.12, 1.7), toon("#4a4560"), 0, 0.06, 0), mesh(box(1.5, 1.9, 1.5), toon("#5a4a78"), 0.12, 1.07, 0), turn(mesh(cone(1.32, 1.3, 4), toon("#241a3a"), 0.12, 2.67, 0), 0, Math.PI / 4, 0),
      mesh(box(0.62, 2.7, 0.62), toon("#4d3f6a"), -0.72, 1.47, 0.3), turn(mesh(cone(0.56, 0.9, 4), toon("#241a3a"), -0.72, 3.27, 0.3), 0, Math.PI / 4, 0),
      turn(mesh(box(0.22, 0.7, 0.22), toon("#3a3050"), 0.6, 2.6, -0.2), 0, 0, -0.25), mesh(box(0.05, 0.3, 0.05), toon("#1c1330"), -0.72, 3.85, 0.3), mesh(box(0.2, 0.1, 0.03), flat("#1c1330"), -0.63, 3.93, 0.3));
    door(g, u, 0.75, 0.44, 0.8, "#2f2540", 0.12);
    pane(g, u, 0.6, 1.4, 0.75, 0.3, 0.36); pane(g, u, -0.72, 2.2, 0.61, 0.22, 0.34); pane(g, u, -0.72, 1.0, 0.61, 0.22, 0.3);
    g.add(turn(mesh(box(0.5, 0.07, 0.03), toon("#8a5a34"), 0.6, 1.45, 0.8), 0, 0, 0.35), turn(mesh(box(0.5, 0.07, 0.03), toon("#6b4326"), 0.6, 1.33, 0.8), 0, 0, -0.3));
    for (const x of [-1.05, -0.4, 0.75, 1.1]) g.add(mesh(box(0.05, 0.36, 0.05), toon("#1c1330"), x, 0.2, 1.1), mesh(cone(0.05, 0.1, 4), toon("#1c1330"), x, 0.43, 1.1));
    Object.assign(u, { top: 3.8, smoke: [0.68, 3.0, -0.2], window: [-0.72, 1.0, 0.65], roost: [0.12, 3.28, 0] });
  },
  bakery(g, u) {
    u.lit = "#ffe2a0";
    g.add(mesh(box(2.06, 0.12, 1.76), toon("#b9a48a"), 0, 0.06, 0), mesh(box(1.9, 1.4, 1.6), toon("#ffe9c4"), 0, 0.82, 0), mesh(box(2.0, 0.3, 1.7), toon("#c9774a"), 0, 1.67, 0), mesh(box(1.6, 0.26, 1.3), toon("#b0603c"), 0, 1.95, 0),
      mesh(box(0.3, 0.7, 0.3), toon("#9a7a6a"), -0.6, 2.2, -0.3), mesh(box(0.38, 0.08, 0.38), toon("#5e4a44"), -0.6, 2.58, -0.3));
    for (let i = 0; i < 8; i++) g.add(turn(mesh(box(0.238, 0.05, 0.5), toon(i % 2 ? "#ffffff" : "#ff8fb0"), -0.833 + i * 0.238, 1.28, 1.0), 0.45, 0, 0));
    g.add(mesh(box(0.9, 0.34, 0.06), toon("#8a5a34"), 0, 1.72, 0.86), mesh(new THREE.TorusGeometry(0.09, 0.035, 5, 10), toon("#e8b06a"), -0.14, 1.72, 0.9), mesh(new THREE.TorusGeometry(0.09, 0.035, 5, 10), toon("#e8b06a"), 0.14, 1.72, 0.9),
      squash(mesh(dome(0.42), toon("#c98a4a"), 0.35, 2.08, 0), 1, 0.8, 1), mesh(cyl(0.36, 0.3, 0.2, 10), toon("#ff8fb0"), 0.35, 2.0, 0), mesh(ball(0.09, 6, 5), toon("#e8384f"), 0.35, 2.46, 0));
    door(g, u, 0.8, 0.44, 0.74, "#c9774a"); pane(g, u, 0.6, 0.78, 0.8, 0.46, 0.5); pane(g, u, -0.6, 0.78, 0.8, 0.46, 0.5);
    for (const [x, c] of [[0.48, "#e8b06a"], [0.62, "#ff9db5"], [0.74, "#c98a4a"], [-0.5, "#c98a4a"], [-0.68, "#f6f0ff"]]) g.add(mesh(ball(0.06, 6, 5), toon(c), x, 0.62, 0.86));
    Object.assign(u, { top: 2.6, smoke: [-0.6, 2.7, -0.3], window: [0.6, 0.78, 0.84], roost: [-0.3, 2.08, 0.2] });
  },
};
// One house for a look. The front faces +z and the door is at local x = userData.doorX. userData carries the moving
// parts: door (hinge group), win (this house's own window material), lit (window light colour), top, smoke, window.
export function buildHouse(look) {
  const g = new THREE.Group(), id = look?.house, item = HOUSES.find((h) => h.id === id);
  const u = g.userData = { win: new THREE.MeshBasicMaterial({ color: "#ffd98a" }), lit: "#ffd98a", doorX: 0 };
  if (SKIN[id]) SKIN[id](g, u); else cottage(g, u, item?.color ? [item.color] : bodyColors(look?.body));
  return g;
}

// ---------- props for kill signatures ----------
const rx = (m, a) => { m.rotation.x = a; return m; };
const PROP = {
  fedora(g) { g.add(mesh(cyl(0.46, 0.46, 0.05), toon("#2a2438"), 0, 0.03, 0), mesh(cyl(0.25, 0.3, 0.3), toon("#2a2438"), 0, 0.2, 0), mesh(cyl(0.31, 0.31, 0.07), flat("#e8384f"), 0, 0.1, 0)); },
  usual(g) {   // a fedora with a question mark: whatever the room's mode calls for
    PROP.fedora(g);
    for (const [x, y, w, h] of [[0, 1.0, 0.26, 0.08], [0.13, 0.9, 0.08, 0.2], [0.03, 0.78, 0.16, 0.08], [-0.02, 0.68, 0.08, 0.14], [-0.02, 0.5, 0.08, 0.08], [-0.13, 0.94, 0.08, 0.1]]) g.add(mesh(box(w, h, 0.06), flat("#ffcf3f"), x, y, 0));
  },
  shove(g) {   // a boxing glove on a spring
    g.add(squash(mesh(ball(0.34), toon("#e8384f"), 0, 0.62, 0.1), 1, 1.1, 1), mesh(ball(0.14, 8, 6), toon("#e8384f"), -0.3, 0.6, 0.12), mesh(cyl(0.2, 0.24, 0.2), toon("#ffffff"), 0, 0.26, 0.1));
    for (let i = 0; i < 3; i++) g.add(rx(mesh(new THREE.TorusGeometry(0.12, 0.03, 5, 10), toon("#8d879c"), 0, 0.04 + i * 0.06, 0.1), Math.PI / 2));
  },
  mallet(g) {
    g.add(mesh(cyl(0.05, 0.05, 0.9, 6), toon("#b0743c"), 0, 0.45, 0), turn(mesh(cyl(0.26, 0.26, 0.6, 10), toon("#e8384f"), 0, 0.95, 0), 0, 0, Math.PI / 2));
    for (const s of [-1, 1]) g.add(turn(mesh(cyl(0.28, 0.28, 0.08, 10), toon("#ffcf3f"), s * 0.3, 0.95, 0), 0, 0, Math.PI / 2));
  },
  piano(g) {
    g.add(mesh(box(1.5, 0.75, 0.55), toon("#2a2438"), 0, 0.75, -0.1), mesh(box(1.5, 0.12, 0.4), toon("#2a2438"), 0, 0.66, 0.3), mesh(box(1.36, 0.05, 0.3), toon("#ffffff"), 0, 0.74, 0.32),
      mesh(box(1.56, 0.06, 0.62), toon("#4a4560"), 0, 1.15, -0.1), mesh(box(0.5, 0.2, 0.03), flat("#ffcf3f"), 0, 0.95, 0.18));
    for (let i = 0; i < 10; i++) if (i % 7 !== 2 && i % 7 !== 6) g.add(mesh(box(0.07, 0.04, 0.16), flat("#1c1330"), -0.61 + i * 0.136, 0.78, 0.26));
    for (const x of [-0.66, 0.66]) g.add(mesh(box(0.1, 0.62, 0.1), toon("#2a2438"), x, 0.31, 0.38), mesh(box(0.1, 0.4, 0.5), toon("#2a2438"), x, 0.2, -0.1));
  },
  anvil(g) {
    g.add(mesh(box(0.8, 0.16, 0.5), toon("#4a4560"), 0, 0.08, 0), mesh(box(0.4, 0.3, 0.3), toon("#5a5370"), 0, 0.3, 0), mesh(box(1.0, 0.26, 0.46), toon("#6b6680"), 0.05, 0.58, 0),
      turn(mesh(cone(0.2, 0.5, 6), toon("#6b6680"), -0.68, 0.6, 0), 0, 0, Math.PI / 2), mesh(box(0.9, 0.04, 0.4), toon("#8d879c"), 0.07, 0.72, 0));
  },
  muffin(g) {
    g.add(mesh(cyl(0.3, 0.22, 0.34, 10), toon("#c98a4a"), 0, 0.17, 0), squash(mesh(ball(0.38), toon("#8a5ad0"), 0, 0.42, 0), 1, 0.72, 1), mesh(ball(0.07, 6, 5), flat("#a4ff7a"), 0, 0.72, 0));
    for (const [x, y, z] of [[0.2, 0.52, 0.2], [-0.22, 0.48, 0.18], [0.05, 0.6, 0.27], [-0.1, 0.62, -0.2], [0.26, 0.45, -0.12]]) g.add(mesh(box(0.08, 0.08, 0.08), flat("#a4ff7a"), x, y, z));
    for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; g.add(mesh(box(0.03, 0.3, 0.03), toon("#a8703f"), Math.sin(a) * 0.27, 0.17, Math.cos(a) * 0.27)); }
  },
  banana(g) {
    g.add(mesh(cyl(0.06, 0.09, 0.3, 6), toon("#ffe14a"), 0, 0.2, 0), mesh(box(0.06, 0.08, 0.06), toon("#8a5a34"), 0, 0.38, 0));
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + 0.4, p = mesh(box(0.14, 0.04, 0.42), toon("#ffe14a"), Math.sin(a) * 0.2, 0.06, Math.cos(a) * 0.2); p.rotation.order = "YXZ"; p.rotation.set(0.35, a, 0);
      const q = mesh(box(0.1, 0.02, 0.3), toon("#fff3b0"), Math.sin(a) * 0.2, 0.09, Math.cos(a) * 0.2); q.rotation.order = "YXZ"; q.rotation.set(0.35, a, 0); g.add(p, q);
    }
  },
  duck(g) {
    g.add(squash(mesh(ball(0.32), toon("#ffe14a"), 0, 0.26, 0), 1.15, 0.8, 1), mesh(ball(0.2), toon("#ffe14a"), 0.2, 0.56, 0), mesh(box(0.16, 0.07, 0.14), toon("#ff8a3c"), 0.42, 0.53, 0),
      turn(mesh(cone(0.12, 0.2, 5), toon("#ffe14a"), -0.36, 0.38, 0), 0, 0, 0.9));
    for (const s of [-1, 1]) g.add(mesh(box(0.05, 0.06, 0.03), flat("#1c1330"), 0.3, 0.62, s * 0.15), squash(mesh(ball(0.14, 6, 5), toon("#f2c14e"), -0.02, 0.3, s * 0.27), 1.2, 0.7, 0.5));
  },
  tickle(g) {   // one enormous feather
    const f = new THREE.Group(); f.rotation.z = -0.5; f.position.y = 0.1;
    f.add(mesh(cyl(0.025, 0.025, 1.1, 5), toon("#f2c14e"), 0, 0.55, 0), squash(mesh(ball(0.26), toon("#ffffff"), 0, 0.72, 0), 1, 1.75, 0.2), squash(mesh(ball(0.2), toon("#ffb3d9"), 0, 1.0, 0), 1, 1.2, 0.22));
    g.add(f);
  },
  pie(g) {
    g.add(mesh(cyl(0.42, 0.3, 0.14, 12), toon("#a8b0c0"), 0, 0.07, 0), squash(mesh(dome(0.38), toon("#fff3dc"), 0, 0.14, 0), 1, 0.55, 1), mesh(ball(0.09, 6, 5), toon("#e8384f"), 0, 0.38, 0),
      turn(mesh(cyl(0.015, 0.015, 0.2, 4), toon("#2a2438"), 0.05, 0.52, 0), 0, 0, -0.4), mesh(box(0.06, 0.06, 0.06), flat("#ffcf3f"), 0.1, 0.62, 0));
    for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; g.add(mesh(ball(0.08, 6, 5), toon("#ffffff"), Math.sin(a) * 0.3, 0.2, Math.cos(a) * 0.3)); }
  },
  boot(g) {
    g.add(mesh(cyl(0.3, 0.26, 0.8, 10), toon("#8a5a34"), -0.1, 0.66, 0), mesh(box(0.9, 0.34, 0.56), toon("#8a5a34"), 0.18, 0.25, 0), squash(mesh(ball(0.3), toon("#8a5a34"), 0.55, 0.28, 0), 1, 0.85, 0.95),
      mesh(box(1.12, 0.1, 0.62), toon("#2a2438"), 0.2, 0.05, 0), mesh(cyl(0.33, 0.33, 0.1, 10), toon("#5e3b1f"), -0.1, 1.06, 0));
    for (let i = 0; i < 3; i++) g.add(mesh(box(0.2, 0.03, 0.03), flat("#ffcf3f"), 0.16, 0.44 + i * 0.14, 0.27 - i * 0.01));
  },
  bees(g) {
    for (let i = 0; i < 5; i++) g.add(mesh(cyl(0.16 + Math.sin(((i + 1) / 5) * Math.PI) * 0.22, 0.16 + Math.sin((i / 5) * Math.PI) * 0.22, 0.15, 10), toon(i % 2 ? "#e8a02c" : "#ffcf3f"), 0, 0.1 + i * 0.15, 0));
    g.add(rx(mesh(cyl(0.1, 0.1, 0.05, 8), flat("#3a2550"), 0, 0.3, 0.33), Math.PI / 2), mesh(box(0.05, 0.14, 0.05), toon("#8a5a34"), 0, 0.9, 0));
    for (const [x, y, z] of [[0.5, 0.7, 0.1], [-0.45, 0.5, 0.2], [0.3, 1.0, 0.25]]) g.add(mesh(box(0.1, 0.08, 0.08), flat("#ffcf3f"), x, y, z), mesh(box(0.03, 0.08, 0.085), flat("#1c1330"), x, y, z), mesh(box(0.08, 0.02, 0.14), flat("#ffffff"), x, y + 0.05, z));
  },
};
export function buildProp(id) { const g = new THREE.Group(); (PROP[id] || PROP.fedora)(g); return g; }

// ---------- tombstones ----------
function slab(g, color = "#9a94aa", dark = "#6b6680") {
  g.add(mesh(box(0.8, 0.12, 0.4), toon(dark), 0, 0.06, 0), mesh(box(0.58, 0.55, 0.2), toon(color), 0, 0.39, 0), turn(mesh(new THREE.CylinderGeometry(0.29, 0.29, 0.2, 12, 1, false, 0, Math.PI), toon(color), 0, 0.66, 0), Math.PI / 2, Math.PI / 2, 0),
    mesh(box(0.06, 0.3, 0.02), flat(dark), 0, 0.56, 0.105), mesh(box(0.22, 0.06, 0.02), flat(dark), 0, 0.62, 0.105));
}
const TOMB = {
  stone(g) { slab(g); g.add(mesh(box(0.14, 0.08, 0.1), toon("#4f9a5a"), 0.3, 0.15, 0.16), mesh(box(0.1, 0.06, 0.1), toon("#4f9a5a"), -0.32, 0.14, 0.14)); },
  ghostpop(g) {
    slab(g, "#b9b3d8", "#7a7498");
    const gh = new THREE.Group(); gh.position.set(0.2, 1.0, 0); g.userData.float = gh;
    gh.add(squash(mesh(dome(0.2), flat("#f4f1ff"), 0, 0.12, 0), 1, 1.1, 1), mesh(cyl(0.2, 0.22, 0.2, 10), flat("#f4f1ff"), 0, 0.03, 0));
    for (let i = 0; i < 3; i++) gh.add(rx(mesh(cone(0.07, 0.12, 5), flat("#f4f1ff"), -0.13 + i * 0.13, -0.12, 0), Math.PI));
    for (const s of [-1, 1]) gh.add(mesh(box(0.05, 0.08, 0.03), flat("#1c1330"), s * 0.08, 0.14, 0.19));
    gh.add(mesh(box(0.06, 0.05, 0.03), flat("#1c1330"), 0, 0.03, 0.2)); g.add(gh);
  },
  bloom(g) {
    slab(g, "#a8b89a", "#6f8a66");
    const cols = ["#ff9db5", "#ffe14a", "#ffffff", "#cdb4ff", "#ff8a3c"];
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2, r = 0.42 + (i % 2) * 0.1, x = Math.sin(a) * r, z = Math.cos(a) * r * 0.7 + 0.05, h = 0.14 + (i % 3) * 0.06;
      g.add(mesh(box(0.03, h, 0.03), toon("#4f9a5a"), x, h / 2, z), mesh(ball(0.075, 6, 5), toon(cols[i % 5]), x, h + 0.04, z), mesh(box(0.04, 0.04, 0.04), flat("#ffcf3f"), x, h + 0.1, z));
    }
    g.add(turn(mesh(box(0.05, 0.6, 0.03), toon("#4f9a5a"), -0.2, 0.45, 0.11), 0, 0, 0.4), mesh(ball(0.07, 6, 5), toon("#ff9db5"), -0.3, 0.7, 0.12), mesh(ball(0.06, 6, 5), toon("#ffffff"), -0.1, 0.4, 0.12));
  },
  shatter(g) {
    const cols = ["#7de8ff", "#ff7ad9", "#f4f1ff", "#4f9dff", "#c9a0ff"]; let k = 0;
    for (let y = 0; y < 5; y++) for (let x = 0; x < 4; x++) {
      if (y === 4 && (x === 0 || x === 3)) continue;
      const off = (k * 7919) % 5; k++;
      g.add(mesh(box(0.14, 0.14, 0.14), flat(cols[off]), -0.255 + x * 0.17 + (off === 1 ? 0.06 : 0), 0.1 + y * 0.17 + (off === 3 ? 0.05 : 0), off === 2 ? 0.08 : 0));
    }
    g.add(mesh(box(0.09, 0.09, 0.09), flat("#7de8ff"), 0.5, 0.75, 0.05), mesh(box(0.07, 0.07, 0.07), flat("#ff7ad9"), -0.48, 0.45, 0.1), mesh(box(0.06, 0.06, 0.06), flat("#f4f1ff"), 0.42, 1.0, 0));
  },
  casket(g) {
    const lid = mesh(cyl(0.34, 0.24, 0.95, 6), toon("#7a4e2a"), 0, 0.52, 0); lid.scale.z = 0.4; lid.rotation.x = -0.12;
    g.add(mesh(box(0.8, 0.08, 0.5), toon("#5e4a44"), 0, 0.04, 0), lid, mesh(box(0.05, 0.36, 0.03), flat("#ffcf3f"), 0, 0.62, 0.15), mesh(box(0.22, 0.05, 0.03), flat("#ffcf3f"), 0, 0.7, 0.14));
  },
  ufo(g) {
    slab(g, "#8fa8a0", "#5a7a72");
    const u = new THREE.Group(); u.position.y = 1.35; g.userData.float = u;
    u.add(squash(mesh(ball(0.42, 12, 6), toon("#a8b0c0"), 0, 0, 0), 1, 0.28, 1), mesh(dome(0.2), flat("#9be7ff"), 0, 0.06, 0), mesh(cyl(0.16, 0.1, 0.06, 8), flat("#a4ff7a"), 0, -0.12, 0));
    for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; u.add(mesh(box(0.06, 0.05, 0.06), flat(i % 2 ? "#ffe14a" : "#ff7ad9"), Math.sin(a) * 0.36, -0.02, Math.cos(a) * 0.36)); }
    g.add(u, mesh(new THREE.CylinderGeometry(0.12, 0.3, 0.5, 8, 1, true), beam, 0, 1.0, 0));
  },
};
const beam = new THREE.MeshBasicMaterial({ color: "#a4ff7a", transparent: true, opacity: 0.35, depthWrite: false });
export function buildTomb(id) { const g = new THREE.Group(); (TOMB[id] || TOMB.stone)(g); return g; }

// ---------- pixel icons (emotes and effects), drawn at runtime ----------
const INK = { R: "#ff5d8f", W: "#ffffff", Y: "#ffe14a", B: "#7cc8ff", A: "#ff3b5c", K: "#1c1330", G: "#7dffd0", O: "#ffb03c" };
export const ICONS = {
  heart: [".RR..RR.", "RWRRRRRR", "RRRRRRRR", "RRRRRRRR", ".RRRRRR.", "..RRRR..", "...RR...", "........"],
  zed: ["........", ".WWWWWW.", ".....WW.", "....WW..", "...WW...", "..WW....", ".WWWWWW.", "........"],
  bang: ["...YY...", "...YY...", "...YY...", "...YY...", "...YY...", "........", "...YY...", "........"],
  quest: ["..BBBB..", ".BB..BB.", ".....BB.", "....BB..", "...BB...", "........", "...BB...", "........"],
  anger: ["..A..A..", "..A..A..", "AAA..AAA", "........", "AAA..AAA", "..A..A..", "..A..A..", "........"],
  drop: ["...B....", "...B....", "..BBB...", "..BBB...", ".BBBBB..", ".BWBBB..", "..BBB...", "........"],
  note: ["...YYYY.", "...Y..Y.", "...Y..Y.", "...Y..Y.", ".YYY.YYY", ".YYY.YYY", "........", "........"],
  star: ["...YY...", "...YY...", "YYYYYYYY", ".YYYYYY.", "..YYYY..", ".YYYYYY.", ".YY..YY.", "........"],
  skull: [".WWWWWW.", "WWWWWWWW", "WKKWWKKW", "WKKWWKKW", "WWWKKWWW", ".WWWWWW.", ".WKWWKW.", "........"],
  ha: ["........", "O.O..OO.", "O.O.O..O", "OOO.OOOO", "O.O.O..O", "O.O.O..O", "........", "........"],
  hand: [".W.W.W..", ".W.W.W.W", ".W.W.W.W", ".WWWWWWW", ".WWWWWW.", ".WWWWWW.", "..WWWW..", "........"],
  swirl: [".GGGGG..", "G.....G.", "G..GG.G.", "G.G...G.", "G..GGG..", ".G......", "..GGGGG.", "........"],
  arrow: ["....Y...", "....YY..", "YYYYYYY.", "YYYYYYYY", "YYYYYYY.", "....YY..", "....Y...", "........"],
};
// A 10 x 10 canvas of the icon with a one pixel dark outline, ready to scale up with nearest-neighbour.
const iconCache = {};
export function iconCanvas(name) {
  if (iconCache[name]) return iconCache[name];
  const rows = ICONS[name] || ICONS.star, c = document.createElement("canvas"); c.width = c.height = 10;
  const x2 = c.getContext("2d"), on = (x, y) => rows[y] && rows[y][x] && rows[y][x] !== ".";
  x2.fillStyle = INK.K;
  for (let y = -1; y < 9; y++) for (let x = -1; x < 9; x++) if (!on(x, y) && (on(x - 1, y) || on(x + 1, y) || on(x, y - 1) || on(x, y + 1))) x2.fillRect(x + 1, y + 1, 1, 1);
  for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) if (on(x, y)) { x2.fillStyle = INK[rows[y][x]]; x2.fillRect(x + 1, y + 1, 1, 1); }
  return (iconCache[name] = c);
}
// The High look of an icon: grown to 80 x 80 by three rounds of Scale2x. Same shape and colours, but the stair-stepped
// diagonals become clean slopes, so it can be drawn smooth at any size. (Low draws iconCanvas() itself, nearest-neighbour.)
const smoothCache = {};
export function smoothIcon(name) {
  if (smoothCache[name]) return smoothCache[name];
  const src = iconCanvas(name);
  let n = src.width, px = new Uint32Array(src.getContext("2d").getImageData(0, 0, n, n).data.buffer);
  for (let k = 0; k < 3; k++, n *= 2) {
    const out = new Uint32Array(n * n * 4), at = (x, y) => px[Math.min(n - 1, Math.max(0, y)) * n + Math.min(n - 1, Math.max(0, x))];
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
      const P = at(x, y), A = at(x, y - 1), B = at(x + 1, y), C = at(x - 1, y), D = at(x, y + 1), o = 4 * y * n + 2 * x;
      out[o] = C === A && C !== D && A !== B ? A : P; out[o + 1] = A === B && A !== C && B !== D ? B : P;
      out[o + 2 * n] = D === C && D !== B && C !== A ? C : P; out[o + 2 * n + 1] = B === D && B !== A && D !== C ? D : P;
    }
    px = out;
  }
  const c = document.createElement("canvas"); c.width = c.height = n; c.getContext("2d").putImageData(new ImageData(new Uint8ClampedArray(px.buffer), n, n), 0, 0);
  return (smoothCache[name] = c);
}

// ---------- shop thumbnails ----------
// A plain bean (no role costume) for thumbnails.
function miniBean(look) {
  const g = new THREE.Group(), ink = flat("#1c1330");
  g.add(squash(mesh(bodyGeometry(look.body), bodyMaterial(look.body), 0, 0.55, 0), 1, 1.12, 0.92), mesh(box(0.1, 0.04, 0.05), ink, 0, 0.48, 0.45));
  for (const s of [-1, 1]) g.add(mesh(box(0.11, 0.17, 0.05), ink, s * 0.2, 0.66, 0.43), mesh(box(0.1, 0.06, 0.04), flat("#ff8fb0"), s * 0.32, 0.5, 0.37), mesh(box(0.16, 0.1, 0.2), ink, s * 0.18, 0.04, 0.02));
  dress(g, look);
  return g;
}
export const EMOTE_ICON = { wave: "hand", shrug: "quest", laugh: "ha", point: "arrow", sweat: "drop", heart: "heart", steam: "anger", sleepy: "zed", cry: "drop", spin: "swirl" };
const DANCE_POSE = { hop: [0.3, 0, 0], stomp: [0.05, 0, 0.32], wiggle: [0, 0.3, -0.38], twirl: [0.3, 0.9, 0.22], moonwaddle: [0, -1.1, 0.14], flip: [1.0, 0, 2.75] };
let booth; const thumbs = new Map();
// A small preview image (data URL) of any shop item, for example preview("house", "lighthouse", look).
// look colours the bean or the house it is shown on; size is about the CSS width it is shown at. Results are cached.
export function preview(rack, id, look = DEFAULT_LOOK, size = 96) {
  look = cleanLook(look) || DEFAULT_LOOK;
  const tinted = rack === "head" || rack === "pack" || rack === "emote" || rack === "dance" || (rack === "house" && id === "match");
  const icon = rack === "emote" ? EMOTE_ICON[id] || "star" : ["body", "head", "pack", "house", "killfx", "tomb"].includes(rack) ? null : "note";
  const again = (w) => {
    const n = quality() === "low" ? lowSize(w || size, icon ? 12 : 16) : 0;   // Low: image pixels across
    const key = `${rack}|${id}|${n ? "low" + n : size}|${tinted ? look.body : ""}`;
    if (!thumbs.has(key)) thumbs.set(key, icon && n && n < 24 ? iconShot(icon, n) : shopShot(rack, id, look, size, n));
    return thumbs.get(key);
  };
  return madeImage(again(0), again);
}
// Too small in Low for a bean and its 10 px icon (the in-game emote bar): the icon alone, still about 3 CSS px a pixel.
function iconShot(name, n) {
  const c = document.createElement("canvas"); c.width = c.height = n;
  c.getContext("2d").drawImage(iconCanvas(name), (n - 10) >> 1, (n - 10) >> 1);
  return c.toDataURL();
}
function shopShot(rack, id, look, size, n) {
  if (!booth) {
    const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, preserveDrawingBuffer: true });
    const scene = new THREE.Scene(), cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 50), sun = new THREE.DirectionalLight("#fff", 1.8); sun.position.set(-2, 3, 4);
    scene.add(new THREE.HemisphereLight("#ffffff", "#6a5a9a", 1.7), sun);
    booth = { renderer, scene, cam, pass: pixelPass(renderer), pad: document.createElement("canvas"), bb: new THREE.Box3(), v: new THREE.Vector3() };
  }
  const { renderer, scene, cam, pass, pad, bb, v } = booth, plain = { body: look.body, head: "none", pack: "none" };
  let o, yaw = 0.5, icon = null;
  if (rack === "body") { o = miniBean({ ...plain, body: id }); yaw = 0.12; }
  else if (rack === "head") { o = miniBean({ ...plain, head: id }); yaw = 0.12; }
  else if (rack === "pack") { o = miniBean({ ...plain, pack: id }); yaw = Math.PI * 0.78; }
  else if (rack === "house") o = buildHouse({ body: look.body, house: id });
  else if (rack === "killfx") o = buildProp(id);
  else if (rack === "tomb") o = buildTomb(id);
  else if (rack === "emote") { o = miniBean(plain); yaw = 0.12; icon = EMOTE_ICON[id] || "star"; }
  else { o = new THREE.Group(); const b = miniBean(plain), p = DANCE_POSE[id] || DANCE_POSE.hop; b.position.y = p[0]; b.rotation.set(p[3] || 0, p[1], p[2]); o.add(b); yaw = 0.12; icon = "note"; }
  o.rotation.y = yaw; scene.add(o); o.updateMatrixWorld(true);
  bb.setFromObject(o); bb.getCenter(v);
  const half = Math.max(bb.max.x - bb.min.x, bb.max.y - bb.min.y, 1.5) * (icon ? 0.68 : 0.55), lift = icon ? half * 0.14 : 0;
  cam.left = -half; cam.right = half; cam.top = half; cam.bottom = -half; cam.updateProjectionMatrix();
  cam.position.set(v.x, v.y + lift + (rack === "house" ? 2.2 : rack === "killfx" || rack === "tomb" ? 3.5 : 0), 12); cam.lookAt(v.x, v.y + lift, v.z);
  const px = n || Math.round(size * Math.min(Math.max(window.devicePixelRatio || 1, 1), 2));   // size is in CSS pixels; sharp screens get twice the pixels
  renderer.setSize(px, px, false);
  if (n) pass.render(scene, cam); else renderer.render(scene, cam);
  scene.remove(o); o.traverse((m) => m.geometry && m.geometry.dispose());
  if (!icon) return renderer.domElement.toDataURL();
  // emotes and dances: the bean with a big icon in the corner, smooth in High, its own pixels one to one in Low
  pad.width = pad.height = px; const x2 = pad.getContext("2d"), s = Math.max(2, Math.round(px / 28)), m = Math.round((2 * px) / size);
  x2.imageSmoothingEnabled = false; x2.clearRect(0, 0, px, px); x2.drawImage(renderer.domElement, 0, 0);
  if (n) x2.drawImage(iconCanvas(icon), px - 11, 1);
  else { x2.imageSmoothingEnabled = true; x2.drawImage(smoothIcon(icon), px - 10 * s - m, m, 10 * s, 10 * s); }
  return pad.toDataURL();
}
