// Spike: toy-plastic 3D look, top-down-ish camera, ink painted into the floor.
// Idea borrowed from how inkwave-aah.pages.dev does it: flat bright blocks + soft light + AO + bloom,
// and the paint itself (glossy, raised) carries the richness.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/RoundedBoxGeometry.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

const Q = new URLSearchParams(location.search);
const FX = Q.get('fx') !== '0';
const AO = FX && Q.get('ao') !== '0';

const W = 20, L = 40;                    // arena size in metres (x, z)
const TEAM = [0xffb21e, 0x8a4dff];        // 0 = us (bottom, +z), 1 = them (top, -z)
const TEAM_CSS = ['#ffb21e', '#8a4dff'];
const TEAM_DARK = ['#d9780a', '#5427c9'];

const renderer = new THREE.WebGLRenderer({ antialias: !FX, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, parseFloat(Q.get('pr') || '2')));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
const SKY = new THREE.Color(0xf6b27a);
scene.background = SKY;
scene.fog = new THREE.Fog(0xe7a2a0, 38, 95);

const camera = new THREE.PerspectiveCamera(30, innerWidth / innerHeight, 1, 200);

// ---------- light ----------
scene.add(new THREE.HemisphereLight(0xcfe3ff, 0xffc79a, 1.15));
const sun = new THREE.DirectionalLight(0xffd9a8, 2.4);
sun.position.set(-14, 16, 8);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
const sc = sun.shadow.camera; sc.left = -16; sc.right = 16; sc.top = 16; sc.bottom = -16; sc.near = 1; sc.far = 60;
sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.03;
scene.add(sun, sun.target);

// ---------- paintable floor ----------
const PXM = 48;                           // canvas pixels per metre
const CW = W * PXM, CH = L * PXM;
function mkCanvas() { const c = document.createElement('canvas'); c.width = CW; c.height = CH; return c; }
const colC = mkCanvas(), hgtC = mkCanvas(), rghC = mkCanvas();
const colX = colC.getContext('2d'), hgtX = hgtC.getContext('2d'), rghX = rghC.getContext('2d');

function rnd(a, b) { return a + Math.random() * (b - a); }

(function paintBase() {
  colX.fillStyle = '#d8d1e6'; colX.fillRect(0, 0, CW, CH);
  // soft tile mottling
  const T = PXM * 2;
  for (let y = 0; y < CH; y += T) for (let x = 0; x < CW; x += T) {
    const k = rnd(-9, 9) | 0;
    colX.fillStyle = `rgb(${216 + k},${209 + k},${230 + k})`;
    colX.fillRect(x + 2, y + 2, T - 4, T - 4);
  }
  // grout
  colX.fillStyle = '#b9b0cf';
  for (let x = 0; x <= CW; x += T) colX.fillRect(x - 2, 0, 4, CH);
  for (let y = 0; y <= CH; y += T) colX.fillRect(0, y - 2, CW, 4);
  // centre line + home zones tint
  colX.fillStyle = 'rgba(255,255,255,.55)'; colX.fillRect(0, CH / 2 - 4, CW, 8);
  colX.fillStyle = 'rgba(255,178,30,.10)'; colX.fillRect(0, CH - 8 * PXM, CW, 8 * PXM);
  colX.fillStyle = 'rgba(138,77,255,.10)'; colX.fillRect(0, 0, CW, 8 * PXM);
  hgtX.fillStyle = '#000'; hgtX.fillRect(0, 0, CW, CH);
  rghX.fillStyle = '#d0d0d0'; rghX.fillRect(0, 0, CW, CH);
})();

const colTex = new THREE.CanvasTexture(colC), hgtTex = new THREE.CanvasTexture(hgtC), rghTex = new THREE.CanvasTexture(rghC);
colTex.colorSpace = THREE.SRGBColorSpace;
for (const t of [colTex, hgtTex, rghTex]) t.anisotropy = 8;

const floorMat = new THREE.MeshStandardMaterial({
  map: colTex, bumpMap: hgtTex, bumpScale: 2.2, roughnessMap: rghTex, roughness: 1, metalness: 0.0,
});
const floor = new THREE.Mesh(new THREE.PlaneGeometry(W, L).rotateX(-Math.PI / 2), floorMat);
floor.receiveShadow = true;
scene.add(floor);

// slab body under the floor + sea
const slab = new THREE.Mesh(new RoundedBoxGeometry(W + 1.2, 2.2, L + 1.2, 4, 0.4), new THREE.MeshStandardMaterial({ color: 0xf2ecff, roughness: 0.8 }));
slab.position.y = -1.12; slab.receiveShadow = true; scene.add(slab);
const sea = new THREE.Mesh(new THREE.PlaneGeometry(400, 400).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x3a8fd9, roughness: 0.25, metalness: 0.1 }));
sea.position.y = -1.6; scene.add(sea);

function gx(x) { return (x + W / 2) * PXM; }
function gz(z) { return (z + L / 2) * PXM; }

function blobPath(ctx, cx, cy, r, pts, wob) {
  const a = [];
  for (let i = 0; i < pts; i++) { const t = i / pts * Math.PI * 2; const rr = r * (1 - wob + Math.random() * wob * 2); a.push([cx + Math.cos(t) * rr, cy + Math.sin(t) * rr]); }
  ctx.beginPath();
  for (let i = 0; i < pts; i++) {
    const p = a[i], n = a[(i + 1) % pts];
    const mx = (p[0] + n[0]) / 2, my = (p[1] + n[1]) / 2;
    if (i === 0) ctx.moveTo(mx, my); else ctx.quadraticCurveTo(p[0], p[1], mx, my);
  }
  const p0 = a[0], n0 = a[1];
  ctx.quadraticCurveTo(p0[0], p0[1], (p0[0] + n0[0]) / 2, (p0[1] + n0[1]) / 2);
  ctx.closePath();
}

let dirty = true;
function splat(x, z, r, team) {
  const cx = gx(x), cy = gz(z), R = r * PXM;
  const sat = [];
  const n = 3 + (Math.random() * 3 | 0);
  for (let i = 0; i < n; i++) { const t = Math.random() * 6.283, d = R * rnd(1.15, 2.1); sat.push([cx + Math.cos(t) * d, cy + Math.sin(t) * d, R * rnd(0.08, 0.22)]); }
  const rays = [];
  const m = 3 + (Math.random() * 3 | 0);
  for (let i = 0; i < m; i++) { const t = Math.random() * 6.283; rays.push([t, R * rnd(0.9, 1.25), R * rnd(0.12, 0.2)]); }

  const body = (ctx, grow) => {
    blobPath(ctx, cx, cy, R * grow, 12, 0.14); ctx.fill();
    for (const [t, len, w] of rays) { ctx.beginPath(); ctx.ellipse(cx + Math.cos(t) * len * 0.62, cy + Math.sin(t) * len * 0.62, len * 0.4 * grow, w * grow, t, 0, 6.283); ctx.fill(); }
    for (const [sx, sy, sr] of sat) { ctx.beginPath(); ctx.arc(sx, sy, sr * grow, 0, 6.283); ctx.fill(); }
  };
  colX.fillStyle = TEAM_DARK[team]; body(colX, 1.05);
  colX.fillStyle = TEAM_CSS[team]; body(colX, 0.93);
  colX.fillStyle = 'rgba(255,255,255,.18)'; body(colX, 0.55);
  hgtX.fillStyle = '#7a7a7a'; body(hgtX, 1.0);
  hgtX.fillStyle = '#fff'; body(hgtX, 0.8);
  rghX.fillStyle = '#2a2a2a'; body(rghX, 1.03);
  dirty = true;
}

// ---------- blocks (toy plastic) ----------
const solids = []; // {x,z,hx,hz}
const matCache = {};
function mat(c) { return matCache[c] || (matCache[c] = new THREE.MeshStandardMaterial({ color: c, roughness: 0.55, metalness: 0.0 })); }
function block(x, z, w, d, h, color, rad = 0.18) {
  const m = new THREE.Mesh(new RoundedBoxGeometry(w, h, d, 3, Math.min(rad, w / 2.2, d / 2.2, h / 2.2)), mat(color));
  m.position.set(x, h / 2, z); m.castShadow = true; m.receiveShadow = true; scene.add(m);
  solids.push({ x, z, hx: w / 2, hz: d / 2 });
  return m;
}
const CREAM = 0xfff1d6, TEAL = 0x35c7b4, PINK = 0xff7aa8, SKYB = 0x6bb8ff, MINT = 0xa4e6a0, CORAL = 0xff8f6b;
// mirrored cover: left/right + centre
const cover = [
  [-6, 0, 3, 1.4, 1.4, TEAL], [6, 0, 3, 1.4, 1.4, TEAL],
  [0, -6, 2, 1.6, 1.0, CREAM], [0, 6, 2, 1.6, 1.0, CREAM],
  [-7, 7, 1.4, 4, 1.2, PINK], [7, -7, 1.4, 4, 1.2, PINK],
  [7, 7, 1.4, 4, 1.2, SKYB], [-7, -7, 1.4, 4, 1.2, SKYB],
  [0, 10, 5, 1.1, 1.0, MINT], [0, -10, 5, 1.1, 1.0, MINT],
  [-3.2, 13, 1.1, 1.1, 1.1, CORAL], [3.2, 13, 1.1, 1.1, 1.1, CORAL],
  [-3.2, -13, 1.1, 1.1, 1.1, CORAL], [3.2, -13, 1.1, 1.1, 1.1, CORAL],
];
for (const c of cover) block(...c);
// outer rim
const rim = 0xfff8ea;
block(0, L / 2 + 0.3, W + 1.2, 0.7, 0.55, rim, 0.15); block(0, -L / 2 - 0.3, W + 1.2, 0.7, 0.55, rim, 0.15);
block(W / 2 + 0.3, 0, 0.7, L, 0.55, rim, 0.15); block(-W / 2 - 0.3, 0, 0.7, L, 0.55, rim, 0.15);

// barrels
const barrelGeo = new THREE.CylinderGeometry(0.45, 0.45, 0.9, 20);
for (const [x, z, c] of [[-9, 4, 0xff5d5d], [-8.4, 5.2, 0xffd34a], [9, -4, 0xff5d5d], [8.4, -5.2, 0xffd34a], [9, 14, 0x6bb8ff], [-9, -14, 0x6bb8ff]]) {
  const b = new THREE.Mesh(barrelGeo, mat(c)); b.position.set(x, 0.45, z); b.castShadow = true; b.receiveShadow = true; scene.add(b);
  solids.push({ x, z, hx: 0.45, hz: 0.45 });
}

// bases: tower + glowing crystal
const crystals = [];
function base(z, team) {
  const g = new THREE.Group(); g.position.set(0, 0, z);
  const col = TEAM[team];
  const b1 = new THREE.Mesh(new RoundedBoxGeometry(4.4, 1.2, 3.2, 4, 0.3), mat(0xfff1d6)); b1.position.y = 0.6;
  const b2 = new THREE.Mesh(new RoundedBoxGeometry(3.2, 1.2, 2.4, 4, 0.3), mat(col)); b2.position.y = 1.8;
  const b3 = new THREE.Mesh(new RoundedBoxGeometry(2.0, 0.9, 1.6, 4, 0.25), mat(0xfff1d6)); b3.position.y = 2.85;
  const cr = new THREE.Mesh(new THREE.OctahedronGeometry(0.75), new THREE.MeshStandardMaterial({ color: col, emissive: col, emissiveIntensity: 0.9, roughness: 0.2 }));
  cr.position.y = 4.1; cr.scale.y = 1.35;
  for (const m of [b1, b2, b3, cr]) { m.castShadow = true; m.receiveShadow = true; g.add(m); }
  const pl = new THREE.PointLight(col, 18, 9, 2); pl.position.y = 4.1; g.add(pl);
  scene.add(g); crystals.push(cr);
  solids.push({ x: 0, z, hx: 2.2, hz: 1.6 });
}
base(L / 2 - 3.2, 0); base(-L / 2 + 3.2, 1);


// ---------- control point: tug-of-war bar, same rules as the 2D fight ----------
// bar -1..1 (+1 = we hold it fully); standing alone on it moves the bar your way, both on it = contested (frozen), full bar = round won, two rounds win the bout
const PT = { x: 0, z: 0, r: 2.6 }, BAR_SECONDS = 9;
let bar = 0; const score = [0, 0]; let banner = '', bannerT = 0;
const ptC = document.createElement('canvas'); ptC.width = ptC.height = 512;
const ptX = ptC.getContext('2d'), ptTex = new THREE.CanvasTexture(ptC); ptTex.colorSpace = THREE.SRGBColorSpace; ptTex.anisotropy = 8;
const ptMesh = new THREE.Mesh(new THREE.PlaneGeometry(PT.r * 2.5, PT.r * 2.5).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: ptTex, transparent: true, depthWrite: false }));
ptMesh.position.set(PT.x, 0.02, PT.z); scene.add(ptMesh);
const ptLight = new THREE.PointLight(0xffdca0, 14, 12, 2); ptLight.position.set(PT.x, 2.2, PT.z); scene.add(ptLight);
let ptKey = '';
function drawPoint(contested, t) {
  const k = `${(bar * 100) | 0}|${contested}|${contested ? ((t * 8) | 0) % 2 : 0}`;
  if (k === ptKey) return; ptKey = k;
  const c = 256, R = c / 1.25, ctx = ptX; ctx.clearRect(0, 0, 512, 512);
  ctx.lineWidth = 22;
  ctx.strokeStyle = contested && (((t * 8) | 0) % 2) ? '#ff6b6b' : '#fff7e0'; ctx.globalAlpha = 0.85;
  ctx.beginPath(); ctx.arc(c, c, R, 0, 7); ctx.stroke(); ctx.globalAlpha = 1;
  if (Math.abs(bar) > 0.005) {
    ctx.strokeStyle = bar > 0 ? TEAM_CSS[0] : TEAM_CSS[1]; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.arc(c, c, R, -Math.PI / 2, -Math.PI / 2 + Math.abs(bar) * Math.PI * 2); ctx.stroke();
    ctx.globalAlpha = 0.16 * Math.abs(bar) + 0.05; ctx.fillStyle = bar > 0 ? TEAM_CSS[0] : TEAM_CSS[1]; ctx.beginPath(); ctx.arc(c, c, R - 16, 0, 7); ctx.fill(); ctx.globalAlpha = 1;
  }
  ctx.fillStyle = '#fff7e0'; ctx.beginPath(); ctx.moveTo(c, c - 26); ctx.lineTo(c + 18, c); ctx.lineTo(c, c + 26); ctx.lineTo(c - 18, c); ctx.closePath(); ctx.fill();
  ptTex.needsUpdate = true;
}
function onPoint(p) { return Math.hypot(p.x - PT.x, p.z - PT.z) < PT.r; }
function endRound(w) {
  score[w]++; bar = 0; banner = score[w] >= 2 ? (w === 0 ? 'YOU WIN THE BOUT' : 'THEY WIN THE BOUT') : (w === 0 ? 'ROUND TO YOU' : 'ROUND TO THEM'); bannerT = 2.5;
  if (score[w] >= 2) score[0] = score[1] = 0;
  heroRoot.position.set(0, 0, 11); enemyRoot.position.set(0, 0, -11);
}

// ---------- heroes: Poku built from rounded primitives (cream cat, pink ear tips, blue-violet shirt, orange pack) ----------
const heroRoot = new THREE.Group(); scene.add(heroRoot);
const enemyRoot = new THREE.Group(); scene.add(enemyRoot);
heroRoot.position.set(0, 0, 11); enemyRoot.position.set(0, 0, -11);

function ring(team) {
  const r = new THREE.Mesh(new THREE.RingGeometry(0.62, 0.82, 32).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: TEAM[team], transparent: true, opacity: 0.95 }));
  r.position.y = 0.03; return r;
}
heroRoot.add(ring(0)); enemyRoot.add(ring(1));

const FUR = 0xffd9bd, EAR = 0xff8fa3, EYE = 0x2a1f4a, SHOE = 0x3a2f55;
function part(geo, color, x, y, z, parent, rough = 0.6) {
  const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color, roughness: rough }));
  m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true; parent.add(m); return m;
}
function makePoku(team) {
  const g = new THREE.Group();            // faces +z
  const body = new THREE.Group(); g.add(body);
  const shirt = team === 0 ? 0x5b5bff : 0x8a4dff;
  part(new RoundedBoxGeometry(0.62, 0.62, 0.5, 3, 0.2), shirt, 0, 0.68, 0, body);                 // torso
  const head = new THREE.Group(); head.position.y = 1.32; body.add(head);
  part(new RoundedBoxGeometry(0.98, 0.82, 0.86, 4, 0.3), FUR, 0, 0, 0, head);                     // big head
  for (const s of [-1, 1]) {
    const ear = new THREE.Group(); ear.position.set(s * 0.3, 0.52, -0.02); ear.rotation.z = -s * 0.18; head.add(ear);
    part(new RoundedBoxGeometry(0.26, 0.4, 0.2, 2, 0.1), FUR, 0, 0, 0, ear);
    part(new RoundedBoxGeometry(0.12, 0.2, 0.06, 2, 0.04), EAR, 0, 0.04, 0.09, ear);
    part(new THREE.SphereGeometry(0.075, 10, 8), EYE, s * 0.22, 0.02, 0.42, head).scale.set(0.9, 1.5, 0.5);   // eyes
    part(new THREE.SphereGeometry(0.09, 10, 8), 0xff9aa8, s * 0.36, -0.14, 0.38, head).scale.set(1, 0.65, 0.4); // cheeks
  }
  part(new THREE.SphereGeometry(0.05, 8, 6), 0xff7f93, 0, -0.08, 0.43, head);                      // nose
  part(new RoundedBoxGeometry(0.42, 0.5, 0.2, 3, 0.09), 0xff7a3d, 0, 0.7, -0.34, body);            // backpack
  const tail = new THREE.Group(); tail.position.set(0, 0.45, -0.28); body.add(tail);
  part(new THREE.CapsuleGeometry(0.07, 0.4, 4, 8), FUR, 0, 0.18, -0.12, tail).rotation.x = -0.5;
  const legs = [];
  for (const s of [-1, 1]) {
    const leg = new THREE.Group(); leg.position.set(s * 0.17, 0.36, 0); g.add(leg);
    part(new RoundedBoxGeometry(0.2, 0.34, 0.2, 2, 0.08), FUR, 0, -0.1, 0, leg);
    part(new RoundedBoxGeometry(0.24, 0.14, 0.34, 2, 0.06), SHOE, 0, -0.3, 0.05, leg);
    legs.push(leg);
    const arm = new THREE.Group(); arm.position.set(s * 0.4, 0.85, 0); body.add(arm);
    part(new RoundedBoxGeometry(0.17, 0.4, 0.17, 2, 0.07), FUR, 0, -0.14, 0, arm);
    legs.push(arm);
  }
  g.userData = { body, head, legs, tail };
  return g;
}
const pokuMe = makePoku(0), pokuFoe = makePoku(1);
pokuMe.scale.setScalar(1.4); pokuFoe.scale.setScalar(1.4);
heroRoot.add(pokuMe); enemyRoot.add(pokuFoe);
const catPivot = { me: pokuMe, foe: pokuFoe };
function animate(p, speed, t) {
  const u = p.userData, k = Math.min(speed / 4, 1), w = t * 12;
  u.body.position.y = Math.abs(Math.sin(w)) * 0.11 * k;
  u.body.scale.set(1 + Math.sin(w * 2) * 0.03 * k, 1 - Math.sin(w * 2) * 0.03 * k, 1);
  u.head.rotation.z = Math.sin(w) * 0.06 * k;
  u.legs[0].rotation.x = Math.sin(w) * 0.7 * k; u.legs[1].rotation.x = -Math.sin(w) * 0.7 * k;
  u.legs[2].rotation.x = -Math.sin(w) * 0.5 * k; u.legs[3].rotation.x = Math.sin(w) * 0.5 * k;
  u.tail.rotation.y = Math.sin(t * 5) * 0.4;
  u.body.position.y += Math.sin(t * 3) * 0.015 * (1 - k);
}

// ---------- input ----------
const keys = new Set();
addEventListener('keydown', e => keys.add(e.code));
addEventListener('keyup', e => keys.delete(e.code));
const mouse = new THREE.Vector2(0, 0); let firing = false;
renderer.domElement.addEventListener('pointermove', e => { mouse.set(e.clientX / innerWidth * 2 - 1, -(e.clientY / innerHeight) * 2 + 1); });
renderer.domElement.addEventListener('pointerdown', e => { firing = true; mouse.set(e.clientX / innerWidth * 2 - 1, -(e.clientY / innerHeight) * 2 + 1); });
addEventListener('pointerup', () => { firing = false; });

// touch: left half = virtual stick, right half = aim + fire
const stick = { id: null, ox: 0, oy: 0, x: 0, y: 0 };
let aimId = null;
const dom = renderer.domElement;
dom.addEventListener('touchstart', e => {
  e.preventDefault();
  for (const t of e.changedTouches) {
    if (t.clientX < innerWidth / 2 && stick.id === null) { stick.id = t.identifier; stick.ox = t.clientX; stick.oy = t.clientY; stick.x = stick.y = 0; }
    else if (aimId === null) { aimId = t.identifier; mouse.set(t.clientX / innerWidth * 2 - 1, -(t.clientY / innerHeight) * 2 + 1); firing = true; }
  }
}, { passive: false });
dom.addEventListener('touchmove', e => {
  e.preventDefault();
  for (const t of e.changedTouches) {
    if (t.identifier === stick.id) { stick.x = THREE.MathUtils.clamp((t.clientX - stick.ox) / 60, -1, 1); stick.y = THREE.MathUtils.clamp((t.clientY - stick.oy) / 60, -1, 1); }
    else if (t.identifier === aimId) mouse.set(t.clientX / innerWidth * 2 - 1, -(t.clientY / innerHeight) * 2 + 1);
  }
}, { passive: false });
const touchEnd = e => {
  for (const t of e.changedTouches) {
    if (t.identifier === stick.id) { stick.id = null; stick.x = stick.y = 0; }
    if (t.identifier === aimId) { aimId = null; firing = false; }
  }
};
dom.addEventListener('touchend', touchEnd); dom.addEventListener('touchcancel', touchEnd);

const ray = new THREE.Raycaster(); const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
const aimPt = new THREE.Vector3(0, 0, 0);
function updateAim() {
  ray.setFromCamera(mouse, camera);
  ray.ray.intersectPlane(groundPlane, aimPt);
}

// ---------- shots ----------
const shots = [];
const shotGeo = new THREE.SphereGeometry(0.16, 10, 8);
function shoot(from, to, team, r) {
  const m = new THREE.Mesh(shotGeo, new THREE.MeshStandardMaterial({ color: TEAM[team], emissive: TEAM[team], emissiveIntensity: 0.8 }));
  m.position.copy(from); m.position.y = 1.0; scene.add(m);
  const dist = Math.min(from.distanceTo(to), 9);
  const dir = new THREE.Vector3().subVectors(to, from).setY(0).normalize();
  const target = from.clone().addScaledVector(dir, dist);
  shots.push({ m, a: new THREE.Vector3(from.x, 1, from.z), b: target, t: 0, dur: 0.12 + dist * 0.028, team, r });
}

function resolve(p, rad) {
  for (const s of solids) {
    const dx = p.x - s.x, dz = p.z - s.z;
    const ox = s.hx + rad - Math.abs(dx), oz = s.hz + rad - Math.abs(dz);
    if (ox > 0 && oz > 0) { if (ox < oz) p.x += Math.sign(dx || 1) * ox; else p.z += Math.sign(dz || 1) * oz; }
  }
  p.x = THREE.MathUtils.clamp(p.x, -W / 2 + rad, W / 2 - rad);
  p.z = THREE.MathUtils.clamp(p.z, -L / 2 + rad, L / 2 - rad);
}

// a few pre-existing splats so the first frame already looks lived-in
for (let i = 0; i < 12; i++) splat(rnd(-8, 8), rnd(3, 17), rnd(0.9, 1.9), 0);
for (let i = 0; i < 12; i++) splat(rnd(-8, 8), rnd(-17, -3), rnd(0.9, 1.9), 1);
for (let i = 0; i < 5; i++) splat(rnd(-8, 8), rnd(-3, 3), rnd(0.8, 1.4), i % 2);

// ---------- post ----------
let composer = null, gtao = null;
function buildComposer() {
  composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  if (AO) {
    gtao = new GTAOPass(scene, camera, innerWidth, innerHeight);
    gtao.output = GTAOPass.OUTPUT.Default;
    gtao.updateGtaoMaterial({ radius: 0.9, distanceExponent: 1.4, thickness: 1.2, scale: 1.1, samples: 12 });
    gtao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 6, rings: 2, samples: 12 });
    composer.addPass(gtao);
  }
  composer.addPass(new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.35, 0.6, 0.88));
  composer.addPass(new OutputPass());
}
if (FX) buildComposer();

addEventListener('resize', () => {
  if (!innerWidth || !innerHeight) return;
  renderer.setSize(innerWidth, innerHeight); camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
  if (composer) composer.setSize(innerWidth, innerHeight);
});

// ---------- loop ----------
const clock = new THREE.Clock();
const camTarget = new THREE.Vector3(0, 0, 11);
const bot = { dir: new THREE.Vector3(1, 0, 0), t: 0, shootT: 0 };
let frames = 0, fpsT = 0; const dts = [];
const hud = document.getElementById('hud');
let shotT = 0;

function frame() {
  const dt = Math.min(clock.getDelta(), 0.05);
  const t = clock.elapsedTime;

  // player move
  const mv = new THREE.Vector3((keys.has('KeyD') || keys.has('ArrowRight') ? 1 : 0) - (keys.has('KeyA') || keys.has('ArrowLeft') ? 1 : 0), 0,
    (keys.has('KeyS') || keys.has('ArrowDown') ? 1 : 0) - (keys.has('KeyW') || keys.has('ArrowUp') ? 1 : 0));
  mv.x += stick.x; mv.z += stick.y;
  if (mv.lengthSq() > 1) mv.normalize();
  const heroSpeed = mv.lengthSq() > 0.01 ? 6.5 * Math.min(mv.length(), 1) : 0;
  if (mv.lengthSq() > 0.01) { heroRoot.position.addScaledVector(mv, 6.5 * dt); resolve(heroRoot.position, 0.5); }
  updateAim();
  const toAim = new THREE.Vector3().subVectors(aimPt, heroRoot.position).setY(0);
  if (toAim.lengthSq() > 0.01 && catPivot.me) catPivot.me.rotation.y = Math.atan2(toAim.x, toAim.z);
  shotT -= dt;
  if (firing && shotT <= 0) { shotT = 0.1; const j = new THREE.Vector3(rnd(-0.9, 0.9), 0, rnd(-0.9, 0.9)); shoot(heroRoot.position, aimPt.clone().add(j), 0, rnd(0.55, 0.95)); }
  if (mv.lengthSq() > 0 && Math.random() < dt * 14) splat(heroRoot.position.x, heroRoot.position.z, rnd(0.35, 0.6), 0); // swim-ish trail

  animate(pokuMe, heroSpeed, t); animate(pokuFoe, 4.2, t);

  // bot
  bot.t -= dt; bot.shootT -= dt;
  if (bot.t <= 0) {
    bot.t = rnd(0.6, 1.4);
    if (!onPoint(enemyRoot.position) || Math.random() < 0.3) bot.dir.set(PT.x - enemyRoot.position.x, 0, PT.z - enemyRoot.position.z).normalize();
    else { const a = Math.random() * 6.283; bot.dir.set(Math.cos(a), 0, Math.sin(a)).multiplyScalar(0.35); }
  }
  enemyRoot.position.addScaledVector(bot.dir, 4.2 * dt); resolve(enemyRoot.position, 0.5);
  if (bot.shootT <= 0) {
    bot.shootT = 0.14;
    const tgt = (Math.random() < 0.5 ? heroRoot.position.clone() : new THREE.Vector3(enemyRoot.position.x + rnd(-6, 6), 0, enemyRoot.position.z + rnd(1, 8))).add(new THREE.Vector3(rnd(-1.5, 1.5), 0, rnd(-1.5, 1.5)));
    shoot(enemyRoot.position, tgt, 1, rnd(0.55, 0.95));
    if (catPivot.foe) catPivot.foe.rotation.y = Math.atan2(tgt.x - enemyRoot.position.x, tgt.z - enemyRoot.position.z);
  }

  // control point
  const me = onPoint(heroRoot.position), foe = onPoint(enemyRoot.position), contested = me && foe;
  if (bannerT <= 0) {
    if (me && !foe) bar = Math.min(1, bar + dt / BAR_SECONDS); else if (foe && !me) bar = Math.max(-1, bar - dt / BAR_SECONDS);
    if (bar >= 1) endRound(0); else if (bar <= -1) endRound(1);
  }
  drawPoint(contested, t);
  ptLight.color.setHex(bar > 0.02 ? TEAM[0] : bar < -0.02 ? TEAM[1] : 0xffdca0);
  bannerT -= dt;

  // shots
  for (let i = shots.length - 1; i >= 0; i--) {
    const s = shots[i]; s.t += dt / s.dur;
    const k = Math.min(s.t, 1);
    s.m.position.lerpVectors(s.a, s.b, k); s.m.position.y = 1 + Math.sin(k * Math.PI) * 1.4 - k * 1.0;
    if (s.t >= 1) { splat(s.b.x, s.b.z, s.r, s.team); scene.remove(s.m); s.m.material.dispose(); shots.splice(i, 1); }
  }

  if (dirty) { colTex.needsUpdate = hgtTex.needsUpdate = rghTex.needsUpdate = true; dirty = false; }
  for (const c of crystals) { c.rotation.y = t * 0.8; c.position.y = 4.1 + Math.sin(t * 2) * 0.12; }

  // camera: tilted ~58°, follows hero, tops out at arena edges
  camTarget.lerp(heroRoot.position, 1 - Math.pow(0.001, dt));
  const cz = THREE.MathUtils.clamp(camTarget.z, -L / 2 + 4, L / 2 - 4), cx = THREE.MathUtils.clamp(camTarget.x, -3, 3);
  camera.position.set(cx, 25, cz + 15.5);
  camera.lookAt(cx, 0, cz);
  sun.position.set(cx - 14, 16, cz + 8); sun.target.position.set(cx, 0, cz); sun.target.updateMatrixWorld();

  if (composer) composer.render(); else renderer.render(scene, camera);

  dts.push(dt); if (dts.length > 300) dts.shift();
  frames++; fpsT += dt;
  if (fpsT > 0.5) { const avg = dts.reduce((a, b) => a + b, 0) / dts.length, worst = Math.max(...dts);
    hud.innerHTML = `<div style="font:700 22px system-ui">${score[0]} : ${score[1]}${bannerT > 0 ? ' · ' + banner : ''}</div>`+`<b style="font-size:18px">${(1 / avg) | 0} fps</b> (worst frame ${(worst * 1000) | 0} ms) · ${innerWidth}x${innerHeight} @${renderer.getPixelRatio()}x · fx ${FX ? (AO ? 'ao+bloom' : 'bloom') : 'off'}<br>WASD/mouse · touch: left stick, right = aim+fire`; frames = 0; fpsT = 0; }
  requestAnimationFrame(frame);
}
frame();

window.__spike = { get bar() { return bar; }, set bar(v) { bar = v; }, get ptKey() { return ptKey; }, splat, heroRoot, enemyRoot, camera, scene };
