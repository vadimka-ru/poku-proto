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
const CLOSE = Q.get('close') === '1';
const AO = FX && Q.get('ao') !== '0';

const W = 20, L = 40;                    // arena size in metres (x, z)
const TEAM = [0xffb21e, 0x8a4dff];        // 0 = us (bottom, +z), 1 = them (top, -z)
const TEAM_CSS = ['#ffb21e', '#8a4dff'];
const TEAM_DARK = ['#d9780a', '#5427c9'];

const renderer = new THREE.WebGLRenderer({ antialias: !FX, powerPreference: 'high-performance' });
const PR_MAX = Math.min(devicePixelRatio, parseFloat(Q.get('pr') || '2')), PR_FIXED = Q.has('pr');
let pr = PR_FIXED ? PR_MAX : Math.min(PR_MAX, 1.5);
renderer.setPixelRatio(pr);
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
const PXM = 36;                           // canvas pixels per metre
const CW = W * PXM, CH = L * PXM;
function mkCanvas() { const c = document.createElement('canvas'); c.width = CW; c.height = CH; return c; }
// two canvases: colour, and one packed map (R = ink height for bump, G = roughness for gloss) so a splat uploads 2 textures, not 3
const colC = mkCanvas(), pkC = mkCanvas();
const colX = colC.getContext('2d'), pkX = pkC.getContext('2d');

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
  pkX.fillStyle = 'rgb(0,208,0)'; pkX.fillRect(0, 0, CW, CH);
})();

const colTex = new THREE.CanvasTexture(colC), pkTex = new THREE.CanvasTexture(pkC);
pkTex.generateMipmaps = false; pkTex.minFilter = THREE.LinearFilter;
colTex.colorSpace = THREE.SRGBColorSpace;
colTex.anisotropy = 8;

const floorMat = new THREE.MeshStandardMaterial({
  map: colTex, bumpMap: pkTex, bumpScale: 2.2, roughnessMap: pkTex, roughness: 1, metalness: 0.0,
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
  pkX.fillStyle = 'rgb(122,42,0)'; body(pkX, 1.03);
  pkX.fillStyle = 'rgb(255,42,0)'; body(pkX, 0.8);
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

// Voxel look: every body part is one InstancedMesh of small rounded cubes, coloured per voxel (fur jitter = fluff, face painted on the front layer).
// Fine-voxel cat: parts are voxelised from an inside() test in metres at ~3-4 cm, meshed from exposed faces, with SMOOTHED normals
// (taken from the local occupancy), so the surface reads round and soft while the silhouette keeps a fine fuzzy stepping.
const voxMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.92, vertexColors: true });
function hash3(i, j, k) { const h = Math.sin(i * 127.1 + j * 311.7 + k * 74.7) * 43758.5453; return h - Math.floor(h); }
const FACES = [
  [[1, 0, 0], [[1, 0, 1], [1, 0, 0], [1, 1, 0], [1, 1, 1]]], [[-1, 0, 0], [[0, 0, 0], [0, 0, 1], [0, 1, 1], [0, 1, 0]]],
  [[0, 1, 0], [[0, 1, 1], [1, 1, 1], [1, 1, 0], [0, 1, 0]]], [[0, -1, 0], [[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1]]],
  [[0, 0, 1], [[0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]]], [[0, 0, -1], [[1, 0, 0], [0, 0, 0], [0, 1, 0], [1, 1, 0]]],
];
// min/max: bounding box in the part's own frame (metres); v: voxel size; inside(x,y,z,i,j,k); color(x,y,z,ctx) -> hex
function voxelPart(min, max, v, inside, color, smooth = 0.8) {
  const nx = Math.ceil((max[0] - min[0]) / v), ny = Math.ceil((max[1] - min[1]) / v), nz = Math.ceil((max[2] - min[2]) / v);
  const occ = new Uint8Array(nx * ny * nz), at = (i, j, k) => (i < 0 || j < 0 || k < 0 || i >= nx || j >= ny || k >= nz) ? 0 : occ[(i * ny + j) * nz + k];
  for (let i = 0; i < nx; i++) for (let j = 0; j < ny; j++) for (let k = 0; k < nz; k++)
    if (inside(min[0] + (i + 0.5) * v, min[1] + (j + 0.5) * v, min[2] + (k + 0.5) * v, i, j, k)) occ[(i * ny + j) * nz + k] = 1;
  const R = 3, pos = [], nor = [], col = [], idx = [], c = new THREE.Color(), n = new THREE.Vector3(), fn = new THREE.Vector3();
  const cache = new Map();
  const smoothN = (a, b, cc, out) => {                       // direction away from the local mass of occupied cells
    const key = (a * (ny + 1) + b) * (nz + 1) + cc; const hit = cache.get(key);
    if (hit) return out.copy(hit);
    let mx = 0, my = 0, mz = 0;
    for (let di = -R; di < R; di++) for (let dj = -R; dj < R; dj++) for (let dk = -R; dk < R; dk++)
      if (at(a + di, b + dj, cc + dk)) { mx += di + 0.5; my += dj + 0.5; mz += dk + 0.5; }
    out.set(-mx, -my, -mz); if (out.lengthSq() < 1e-6) out.set(0, 0, 0); else out.normalize();
    cache.set(key, out.clone()); return out;
  };
  for (let i = 0; i < nx; i++) for (let j = 0; j < ny; j++) for (let k = 0; k < nz; k++) {
    if (!at(i, j, k)) continue;
    for (const [d, quad] of FACES) {
      if (at(i + d[0], j + d[1], k + d[2])) continue;
      const x = min[0] + (i + 0.5) * v, y = min[1] + (j + 0.5) * v, z = min[2] + (k + 0.5) * v;
      c.setHex(color(x, y, z, { front: d[2] === 1, back: d[2] === -1, top: d[1] === 1, side: d[0] !== 0 }, i, j, k));
      const f = 0.975 + hash3(i, j, k) * 0.05; c.multiplyScalar(f);
      const base = pos.length / 3; fn.set(d[0], d[1], d[2]);
      for (const q of quad) {
        pos.push(min[0] + (i + q[0]) * v, min[1] + (j + q[1]) * v, min[2] + (k + q[2]) * v);
        smoothN(i + q[0], j + q[1], k + q[2], n);
        n.multiplyScalar(smooth).addScaledVector(fn, 1 - smooth).normalize(); nor.push(n.x, n.y, n.z); col.push(c.r, c.g, c.b);
      }
      idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); geo.setIndex(idx);
  const mesh = new THREE.Mesh(geo, voxMat); mesh.castShadow = true; mesh.receiveShadow = true; return mesh;
}
const FWHITE = 0xffffff, FPINK = 0xf6a3ac, FNOSE = 0xe27d92, FBLACK = 0x14111b, FBROWN = 0x8a5a36, DFBROWN = 0x5e3b22, FGOLD = 0xf0b838;
const se = (x, y, z, a, b, c, p) => Math.pow(Math.abs(x / a), p) + Math.pow(Math.abs(y / b), p) + Math.pow(Math.abs(z / c), p);   // rounded-box field, <=1 inside
const rr = (x, y, x0, x1, y0, y1, r) => {                                                                                       // rounded rectangle test
  if (x < x0 || x > x1 || y < y0 || y > y1) return false;
  const cx = Math.min(Math.max(x, x0 + r), x1 - r), cy = Math.min(Math.max(y, y0 + r), y1 - r); return (x - cx) ** 2 + (y - cy) ** 2 <= r * r;
};

function makePoku(team) {
  const g = new THREE.Group();                  // faces +z, origin on the floor
  const tunic = team === 0 ? 0x5d52b8 : 0x45407a, scarfC = team === 0 ? 0xdb3b3b : 0x8a4dff;
  const BV = 0.04, HV = 0.032;
  const body = new THREE.Group(); body.position.y = 0.3; g.add(body);   // pivot at the hips

  // torso: tunic, belt + buckle, chest strap
  const torso = voxelPart([-0.34, -0.28, -0.26], [0.34, 0.28, 0.26], BV,
    (x, y, z, i, j, k) => se(x, y, z, 0.31, 0.26, 0.23, 3.4) <= 1 + (hash3(i, j, k) - 0.5) * 0.08,
    (x, y, z, c) => {
      if (y > -0.17 && y < -0.1) return (c.front && Math.abs(x) < 0.06) ? FGOLD : DFBROWN;
      if (c.front && y > -0.1 && Math.abs(x + y * 0.8 - 0.05) < 0.05) return FBROWN;
      return tunic;
    });
  torso.position.set(0, 0.26, 0); body.add(torso);

  const bag = voxelPart([-0.11, -0.11, -0.08], [0.11, 0.11, 0.08], BV * 0.8,
    (x, y, z) => se(x, y, z, 0.1, 0.1, 0.07, 4) <= 1,
    (x, y, z, c) => (y > 0.05 ? DFBROWN : (c.front && Math.abs(x) < 0.025 && Math.abs(y) < 0.03 ? FGOLD : FBROWN)));
  bag.position.set(0.4, 0.1, 0.12); body.add(bag);

  const scarf = voxelPart([-0.4, -0.08, -0.33], [0.4, 0.08, 0.33], BV * 0.8,
    (x, y, z) => (x / 0.36) ** 2 + (z / 0.29) ** 2 <= 1 && Math.abs(y) <= 0.065 - 0.02 * ((x / 0.36) ** 2),
    () => scarfC);
  scarf.position.set(0, 0.53, 0); body.add(scarf);
  const capeG = new THREE.Group(); capeG.position.set(0, 0.55, -0.25); body.add(capeG);
  const cape = voxelPart([-0.36, -0.58, -0.05], [0.36, 0.02, 0.05], BV * 0.8,
    (x, y, z, i, j, k) => Math.abs(x) <= 0.26 + (-y) * 0.12 && y > -0.5 + hash3(i, 0, k) * 0.07 - Math.abs(x) * 0.06 && Math.abs(z) <= 0.04,
    () => scarfC);
  capeG.add(cape);

  // head: wide soft block, fur tufts, tall eyes with a highlight, square cheeks, small nose
  const head = new THREE.Group(); head.position.y = 0.97; body.add(head);
  const face = voxelPart([-0.78, -0.56, -0.5], [0.78, 0.56, 0.5], HV,
    (x, y, z, i, j, k) => {
      if (se(x, y, z, 0.6, 0.5, 0.46, 4.6) <= 1 + (hash3(i, j, k) - 0.5) * 0.06) return true;
      const ax = Math.abs(x);
      return ax >= 0.5 && ax <= 0.74 && y >= -0.4 && y <= -0.04 && Math.abs(z) <= 0.2 && (ax - 0.5) <= (y + 0.4) * 0.62 && hash3(i, j, k) > 0.28;
    },
    (x, y, z, c) => {
      if (z > 0.12 && !c.back) {
        const ax = Math.abs(x);
        if (rr(ax, y, 0.14, 0.33, -0.14, 0.17, 0.06)) return (y > 0.07 && (x > 0 ? ax > 0.26 : ax < 0.21)) ? 0xffffff : FBLACK;
        if (rr(ax, y, 0.37, 0.5, -0.28, -0.15, 0.03)) return FPINK;
        if (y > -0.2 && y < -0.15 && ax < 0.055) return FNOSE;
        if (y > -0.235 && y <= -0.2 && ax < 0.028) return FNOSE;
      }
      return FWHITE;
    });
  head.add(face);
  const ears = [];
  for (const s of [-1, 1]) {
    const ear = new THREE.Group(); ear.position.set(s * 0.37, 0.42, -0.03); ear.rotation.z = -s * 0.3; head.add(ear);
    const hw = (y) => 0.19 * (1 - Math.pow(Math.max(y, 0) / 0.48, 1.5));
    const em = voxelPart([-0.2, 0, -0.08], [0.2, 0.5, 0.08], HV,
      (x, y, z) => y >= 0 && Math.abs(x) <= hw(y) && Math.abs(z) <= 0.07 * (1 - y / 0.7),
      (x, y, z, c) => (z > 0 && !c.back && y > 0.04 && y < 0.34 && Math.abs(x) <= hw(y) - 0.05 ? FPINK : FWHITE));
    ear.add(em); ears.push(ear);
  }

  // arms: purple sleeve, white cuff and paw
  const arms = [];
  for (const s of [-1, 1]) {
    const arm = new THREE.Group(); arm.position.set(s * 0.4, 0.46, 0.02); body.add(arm);
    const am = voxelPart([-0.1, -0.46, -0.1], [0.1, 0.06, 0.1], BV * 0.85,
      (x, y, z) => se(x, y + 0.2, z, 0.085, 0.26, 0.085, 3) <= 1, (x, y) => (y > -0.15 ? tunic : FWHITE));
    arm.add(am); arms.push(arm);
  }
  const legs = [];
  for (const s of [-1, 1]) {
    const leg = new THREE.Group(); leg.position.set(s * 0.15, 0.3, 0); g.add(leg);
    const lm = voxelPart([-0.12, -0.34, -0.12], [0.12, 0.04, 0.2], BV * 0.85,
      (x, y, z) => (y > -0.22 ? se(x, y + 0.1, z, 0.085, 0.14, 0.085, 3) <= 1 : se(x, y + 0.28, z - 0.04, 0.1, 0.07, 0.15, 3) <= 1),
      (x, y) => (y < -0.25 ? DFBROWN : FWHITE));
    leg.add(lm); legs.push(leg);
  }

  // tail: fat soft tube curling up behind
  const tpts = []; for (let sT = 0; sT <= 1.001; sT += 0.02) tpts.push([0.13 * Math.sin(sT * 4), 0.02 + 0.52 * sT * sT, -0.55 * sT, 0.075 * (1 - 0.15 * sT)]);
  const tail = new THREE.Group(); tail.position.set(0, 0.08, -0.22); body.add(tail);
  tail.add(voxelPart([-0.26, -0.06, -0.7], [0.26, 0.64, 0.1], BV * 0.85,
    (x, y, z) => tpts.some(p => (p[0] - x) ** 2 + (p[1] - y) ** 2 + (p[2] - z) ** 2 < p[3] * p[3]), () => FWHITE));

  g.userData = { body, head, arms, legs, tail, capeG, ears, ph: Math.random() * 6, k: 0, yaw: 0 };
  return g;
}
const pokuMe = makePoku(0), pokuFoe = makePoku(1);
pokuMe.scale.setScalar(1.3); pokuFoe.scale.setScalar(1.3);
heroRoot.add(pokuMe); enemyRoot.add(pokuFoe);
const catPivot = { me: pokuMe, foe: pokuFoe };
const angDiff = (a, b) => Math.atan2(Math.sin(b - a), Math.cos(b - a));
// Cat gait: a bounding gallop driven by distance covered. Stretch in the air, squash on landing, front paws together then back legs together,
// spine pitching, head leading, ears swept back, tail whipping, cape streaming. Facing eases toward where you run (or where you aim while shooting).
function animate(p, speed, wantYaw, t, dt) {
  const u = p.userData;
  u.k += (Math.min(speed / 4.5, 1) - u.k) * (1 - Math.exp(-12 * dt)); const k = u.k;
  u.yaw += angDiff(u.yaw, wantYaw) * (1 - Math.exp(-14 * dt)); p.rotation.y = u.yaw;
  u.ph += speed * dt * 1.55; const w = u.ph, s1 = Math.sin(w), c1 = Math.cos(w), air = Math.max(0, s1), land = Math.max(0, -s1);
  u.body.position.y = 0.3 + (Math.abs(s1) * 0.3 - 0.04) * k + Math.sin(t * 2.6) * 0.012 * (1 - k);
  u.body.rotation.x = (0.2 + c1 * 0.2) * k;
  u.body.scale.set(1 - air * 0.07 * k + land * 0.06 * k, 1 - land * 0.14 * k + air * 0.03 * k + Math.sin(t * 2.6) * 0.012 * (1 - k), 1 + air * 0.2 * k - land * 0.05 * k);
  u.head.rotation.x = (-0.3 - c1 * 0.16) * k; u.head.rotation.z = Math.sin(t * 1.6) * 0.04 * (1 - k) + Math.sin(w) * 0.05 * k;
  u.arms[0].rotation.x = u.arms[1].rotation.x = -s1 * 1.15 * k - 0.1 * (1 - k) + Math.sin(t * 2.6 + 1) * 0.03 * (1 - k);
  u.legs[0].rotation.x = u.legs[1].rotation.x = s1 * 1.0 * k;
  u.tail.rotation.x = -0.2 - 0.5 * k - c1 * 0.15 * k; u.tail.rotation.y = Math.sin(t * 2.2) * (0.4 - 0.15 * k) + Math.sin(w * 2) * 0.25 * k;
  u.capeG.rotation.x = 0.15 + 0.8 * k + Math.sin(w * 1.5) * 0.15 * k;
  const fl = Math.sin(t * 0.7) > 0.96 ? 0.25 : 0;                             // an occasional ear flick at rest
  u.ears[0].rotation.x = u.ears[1].rotation.x = -0.45 * k; u.ears[0].rotation.z = 0.3 + k * 0.12 - fl; u.ears[1].rotation.z = -0.3 - k * 0.12;
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
    gtao.updateGtaoMaterial({ radius: 0.9, distanceExponent: 1.4, thickness: 1.2, scale: 1.1, samples: 8 });
    gtao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 6, rings: 2, samples: 8 });
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
const bot = { dir: new THREE.Vector3(1, 0, 0), t: 0, shootT: 0, moving: true, face: 0, faceT: 0 };
let frames = 0, fpsT = 0, ema = 1 / 60, prT = 0, prUp = 0; const dts = [];
const hud = document.getElementById('hud');
let shotT = 0, lastUp = 0;

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
  const aimYaw = toAim.lengthSq() > 0.01 ? Math.atan2(toAim.x, toAim.z) : pokuMe.userData.yaw;
  const heroYaw = (firing || mv.lengthSq() < 0.01) ? aimYaw : Math.atan2(mv.x, mv.z);
  shotT -= dt;
  if (firing && shotT <= 0) { shotT = 0.1; const j = new THREE.Vector3(rnd(-0.9, 0.9), 0, rnd(-0.9, 0.9)); shoot(heroRoot.position, aimPt.clone().add(j), 0, rnd(0.55, 0.95)); }
  if (mv.lengthSq() > 0 && Math.random() < dt * 14) splat(heroRoot.position.x, heroRoot.position.z, rnd(0.35, 0.6), 0); // swim-ish trail

  animate(pokuMe, heroSpeed, heroYaw, t, dt); animate(pokuFoe, bot.moving ? 4.2 : 0, bot.faceT > 0 ? bot.face : Math.atan2(bot.dir.x, bot.dir.z), t, dt); bot.faceT -= dt;

  // bot
  bot.t -= dt; bot.shootT -= dt;
  if (bot.t <= 0) {
    bot.t = rnd(0.6, 1.4);
    if (!onPoint(enemyRoot.position) || Math.random() < 0.3) bot.dir.set(PT.x - enemyRoot.position.x, 0, PT.z - enemyRoot.position.z).normalize();
    else { const a = Math.random() * 6.283; bot.dir.set(Math.cos(a), 0, Math.sin(a)).multiplyScalar(0.35); }
  }
  enemyRoot.position.addScaledVector(bot.dir, 4.2 * dt); resolve(enemyRoot.position, 0.5); bot.moving = bot.dir.lengthSq() > 0.2;
  if (bot.shootT <= 0) {
    bot.shootT = 0.14;
    const tgt = (Math.random() < 0.5 ? heroRoot.position.clone() : new THREE.Vector3(enemyRoot.position.x + rnd(-6, 6), 0, enemyRoot.position.z + rnd(1, 8))).add(new THREE.Vector3(rnd(-1.5, 1.5), 0, rnd(-1.5, 1.5)));
    shoot(enemyRoot.position, tgt, 1, rnd(0.55, 0.95));
    bot.face = Math.atan2(tgt.x - enemyRoot.position.x, tgt.z - enemyRoot.position.z); bot.faceT = 0.35;
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

  if (dirty && t - lastUp > 0.06) { colTex.needsUpdate = pkTex.needsUpdate = true; dirty = false; lastUp = t; }
  for (const c of crystals) { c.rotation.y = t * 0.8; c.position.y = 4.1 + Math.sin(t * 2) * 0.12; }

  // camera: tilted ~58°, follows hero, tops out at arena edges
  camTarget.lerp(heroRoot.position, 1 - Math.pow(0.001, dt));
  const cz = THREE.MathUtils.clamp(camTarget.z, -L / 2 + 4, L / 2 - 4), cx = THREE.MathUtils.clamp(camTarget.x, -3, 3);
  if (CLOSE) { camera.position.set(heroRoot.position.x, 5.5, heroRoot.position.z + 5.2); camera.lookAt(heroRoot.position.x, 1.1, heroRoot.position.z); }
  else { camera.position.set(cx, 25, cz + 15.5); camera.lookAt(cx, 0, cz); }
  sun.position.set(cx - 14, 16, cz + 8); sun.target.position.set(cx, 0, cz); sun.target.updateMatrixWorld();

  if (composer) composer.render(); else renderer.render(scene, camera);

  dts.push(dt); if (dts.length > 300) dts.shift();
  // adaptive resolution: drop the render scale quickly when frames are slow, creep back up when there is room
  ema += (dt - ema) * 0.05; prT += dt;
  if (!PR_FIXED && prT > 1.2) {
    prT = 0;
    if (ema > 1 / 50 && pr > 0.75) pr = Math.max(0.75, pr - 0.2); else if (ema < 1 / 59 && pr < PR_MAX && ++prUp >= 4) pr = Math.min(PR_MAX, pr + 0.1);
    if (ema > 1 / 50) prUp = 0;
    if (Math.abs(renderer.getPixelRatio() - pr) > 0.01) { renderer.setPixelRatio(pr); if (composer) { composer.setPixelRatio(pr); composer.setSize(innerWidth, innerHeight); } else renderer.setSize(innerWidth, innerHeight); prUp = 0; }
  }
  frames++; fpsT += dt;
  if (fpsT > 0.5) { const avg = dts.reduce((a, b) => a + b, 0) / dts.length, worst = Math.max(...dts);
    hud.innerHTML = `<div style="font:700 22px system-ui">${score[0]} : ${score[1]}${bannerT > 0 ? ' · ' + banner : ''}</div>`+`<b style="font-size:18px">${(1 / avg) | 0} fps</b> (worst frame ${(worst * 1000) | 0} ms) · ${innerWidth}x${innerHeight} @${renderer.getPixelRatio()}x · fx ${FX ? (AO ? 'ao+bloom' : 'bloom') : 'off'}<br>WASD/mouse · touch: left stick, right = aim+fire`; frames = 0; fpsT = 0; }
  requestAnimationFrame(frame);
}
frame();

window.__spike = { renderer, get bar() { return bar; }, set bar(v) { bar = v; }, get ptKey() { return ptKey; }, splat, heroRoot, enemyRoot, camera, scene };
