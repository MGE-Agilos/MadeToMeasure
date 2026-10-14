import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// Décor de « Made to Measure » : un plateau de bureau en maquette (unités du kit Kenney : bureau = 0,38 de haut,
// personnage ≈ 0,86, soit une échelle 1:2). Ouvert sur l'avant et la droite, comme une maison de poupée.
//   x ∈ [-3, 3] (gauche → droite), z ∈ [-2, 2] (fond → spectateur), sol à y = 0
// Tout le mobilier fixe est fusionné (un maillage par couleur) ; une grille d'occupation du sol sert à planifier
// les trajets des personnages sans jamais traverser un meuble.

const srgb = (r, g, b) => new THREE.Color().setRGB(r, g, b, THREE.SRGBColorSpace);
const gltf = new GLTFLoader();
const BASE = 'assets/kenney/';

// charte Beyond Data (beyond-data.group) : marine, anneau violet / cyan / vert, police Urbanist
export const BRAND = {
  navy: srgb(0.012, 0.024, 0.286), navy2: new THREE.Color('#2d2f67'), grey: new THREE.Color('#abacc2'), light: new THREE.Color('#e6e6f4'),
  purple: new THREE.Color('#850fea'), cyan: new THREE.Color('#4eeaff'), green: new THREE.Color('#2ce3a0'), rival: new THREE.Color('#ff5a1f'),
  css: { navy: '#030649', navy2: '#2d2f67', grey: '#abacc2', light: '#e6e6f4', purple: '#850fea', cyan: '#4eeaff', green: '#2ce3a0', rival: '#ff5a1f' },
  font: 'Urbanist, system-ui, sans-serif',
};

// logo (SVG du site) chargé comme image, pour être dessiné dans des textures
export const loadImage = (src) => new Promise((ok, ko) => { const i = new Image(); i.onload = () => ok(i); i.onerror = ko; i.src = src; });
export const logos = Promise.all([loadImage('assets/brand/beyond-data-logo.svg'), loadImage('assets/brand/beyond-data-mark.svg')])
  .then(([logo, mark]) => ({ logo, mark }));

export const OFFICE = { x0: -3, x1: 3, z0: -2, z1: 2 };

// postes de travail : position du siège (là où s'assoit le personnage) et direction du regard (yaw)
export const SEATS = {
  dev1: { x: -0.95, z: -1.05, yaw: Math.PI },      // développeurs face au mur du fond (on voit leurs écrans)
  dev2: { x: 0.05, z: -1.05, yaw: Math.PI },
  dev3: { x: 1.05, z: -1.05, yaw: Math.PI },
  sales1: { x: -1.95, z: -0.55, yaw: Math.PI / 2 }, // commerciaux, de profil, tournés vers l'équipe
  sales2: { x: -1.95, z: 0.55, yaw: Math.PI / 2 },
};
export const DOOR = { x: -3, z: 1.5 }; // porte dans le mur de gauche

export function canvasTexture(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d');
  draw(g, w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  t.userData = { canvas: c, g };
  return t;
}

export function glowTexture() {
  return canvasTexture(128, 128, (g, s) => {
    const grad = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    grad.addColorStop(0, 'rgba(255,255,255,1)');
    grad.addColorStop(0.2, 'rgba(255,255,255,0.55)');
    grad.addColorStop(0.5, 'rgba(255,255,255,0.12)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, s, s);
  });
}

// --- contenus d'écran ----------------------------------------------------------------------------
const rr = (g, x, y, w, h, r) => { g.beginPath(); g.roundRect(x, y, w, h, r); g.fill(); };

// tableau de bord « BI classique » : palette Qlik (vert) ou Power BI (jaune/noir)
export function dashboardTexture(kind) {
  const qlik = kind === 'qlik';
  return canvasTexture(320, 200, (g, w, h) => {
    g.fillStyle = qlik ? '#f2f4f3' : '#f3f2f1'; g.fillRect(0, 0, w, h);
    g.fillStyle = qlik ? '#00873d' : '#252423'; g.fillRect(0, 0, w, 24);
    g.fillStyle = qlik ? '#ffffff' : '#f2c811'; g.font = 'bold 14px system-ui, sans-serif';
    g.fillText(qlik ? 'Qlik Sense · Sales overview' : 'Power BI · Monthly report', 10, 17);
    const pal = qlik ? ['#00873d', '#52a35a', '#99c24d', '#265a7a'] : ['#118dff', '#12239e', '#e66c37', '#6b007b'];
    for (let i = 0; i < 3; i++) {
      g.fillStyle = '#ffffff'; rr(g, 10 + i * 102, 32, 94, 40, 4);
      g.fillStyle = pal[i]; g.font = 'bold 18px system-ui'; g.fillText(['1.2M', '87%', '+4.1%'][i], 18 + i * 102, 60);
    }
    g.fillStyle = '#ffffff'; rr(g, 10, 80, 190, 110, 4); rr(g, 208, 80, 102, 110, 4);
    for (let i = 0; i < 8; i++) { const v = 20 + ((i * 37) % 60); g.fillStyle = pal[i % 2]; g.fillRect(22 + i * 22, 180 - v, 14, v); }
    const cx = 259, cy = 135; let a = -Math.PI / 2;
    [0.42, 0.28, 0.18, 0.12].forEach((p, i) => { g.fillStyle = pal[i]; g.beginPath(); g.moveTo(cx, cy); g.arc(cx, cy, 40, a, a + p * Math.PI * 2); g.fill(); a += p * Math.PI * 2; });
  });
}

// écran de code qui défile (texture haute, on fait glisser offset.y)
export function codeTexture(seed) {
  const t = canvasTexture(256, 1024, (g, w, h) => {
    g.fillStyle = '#14161c'; g.fillRect(0, 0, w, h);
    let s = seed;
    const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
    const cols = ['#c792ea', '#82aaff', '#c3e88d', '#f78c6c', '#89ddff', '#ffcb6b', '#a6accd'];
    for (let y = 8; y < h; y += 11) {
      let x = 8 + Math.floor(r() * 4) * 12;
      const n = 1 + Math.floor(r() * 5);
      for (let k = 0; k < n && x < w - 10; k++) { const len = 10 + r() * 50; g.fillStyle = cols[Math.floor(r() * cols.length)]; g.fillRect(x, y, len, 5); x += len + 6; }
    }
  });
  t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(1, 0.2);
  return t;
}

// --- chargement et pose des modèles --------------------------------------------------------------
const cache = new Map();
function load(path) {
  if (!cache.has(path)) cache.set(path, gltf.loadAsync(BASE + path).then((g) => g.scene));
  return cache.get(path);
}

// place un modèle : (x, z) = centre de son emprise au sol, yaw = rotation autour de Y
async function put(parent, name, x, z, yaw = 0, { y = 0, s = 1, kit = 'furniture' } = {}) {
  const src = await load(`${kit}/${name}.glb`);
  const inner = src.clone(true);
  const box = new THREE.Box3().setFromObject(inner);
  const c = box.getCenter(new THREE.Vector3());
  inner.position.set(-c.x, -box.min.y, -c.z);
  const outer = new THREE.Group();
  outer.add(inner);
  outer.position.set(x, y, z);
  outer.rotation.y = yaw;
  outer.scale.setScalar(s);
  outer.userData.model = name;
  outer.userData.size = box.getSize(new THREE.Vector3()).multiplyScalar(s);
  parent.add(outer);
  return outer;
}

export async function buildOffice() {
  const root = new THREE.Group();
  root.name = 'office';
  const statics = new THREE.Group(); // mobilier fixe (fusionné plus bas)
  const set = { root, screens: [], chairs: {}, glow: glowTexture() };
  const P = (...a) => put(statics, ...a);
  const jobs = [];

  // --- sol et murs -----------------------------------------------------------------------------
  for (let x = -3; x < 3; x++) for (let z = -2; z < 2; z++) jobs.push(P('floorFull', x + 0.5, z + 0.5));
  for (let x = -3; x < 3; x++) jobs.push(P(x === -2 || x === 0 ? 'wallWindow' : 'wall', x + 0.5, -2.025)); // mur du fond
  for (let z = -2; z < 2; z++) jobs.push(P(z === 1 ? 'wallDoorway' : 'wall', -3.025, z + 0.5, Math.PI / 2)); // mur de gauche, porte vers l'avant

  // --- postes des développeurs (bureau, écran, clavier) ------------------------------------------------
  for (const k of ['dev1', 'dev2', 'dev3']) {
    const s = SEATS[k];
    jobs.push(P('desk', s.x, s.z - 0.42, 0));
    jobs.push(P('computerKeyboard', s.x, s.z - 0.33, 0, { y: 0.38 }));
    jobs.push(P('computerMouse', s.x + 0.22, s.z - 0.33, 0, { y: 0.38 }));
    jobs.push(put(root, 'computerScreen', s.x, s.z - 0.52, 0, { y: 0.38 }).then((o) => set.screens.push({ key: k, obj: o })));
    jobs.push(put(root, 'chairDesk', s.x, s.z + 0.02, Math.PI).then((o) => { set.chairs[k] = o; }));
  }
  jobs.push(P('plantSmall2', -0.45, -1.62, 0, { y: 0.38 }));
  jobs.push(P('plantSmall1', 1.42, -1.62, 0, { y: 0.38 }));

  // --- postes des commerciaux (portables) ------------------------------------------------------------
  for (const k of ['sales1', 'sales2']) {
    const s = SEATS[k];
    jobs.push(P('desk', s.x + 0.42, s.z, Math.PI / 2));
    jobs.push(put(root, 'laptop', s.x + 0.36, s.z, -Math.PI / 2, { y: 0.38 }).then((o) => set.screens.push({ key: k, obj: o })));
    jobs.push(put(root, 'chairDesk', s.x - 0.02, s.z, Math.PI / 2).then((o) => { set.chairs[k] = o; }));
  }
  jobs.push(P('coatRackStanding', -2.72, -1.72));
  jobs.push(P('bookcaseOpen', -2.82, -1.05, Math.PI / 2));

  // --- coin réunion (avant) et coin café (droite) --------------------------------------------------------
  jobs.push(P('rugRectangle', 0.35, 1.05, 0));
  jobs.push(P('tableGlass', 0.35, 1.05));
  jobs.push(P('chair', -0.2, 1.05, Math.PI / 2));
  jobs.push(P('chair', 0.9, 1.05, -Math.PI / 2));
  jobs.push(P('chair', 0.1, 1.55, Math.PI));
  jobs.push(P('chair', 0.6, 1.55, Math.PI));
  jobs.push(P('kitchenBar', 2.55, 0.35, -Math.PI / 2));
  jobs.push(P('kitchenBar', 2.55, 0.78, -Math.PI / 2));
  jobs.push(P('kitchenCoffeeMachine', 2.62, 0.4, -Math.PI / 2, { y: 0.42 }));
  jobs.push(P('stoolBar', 2.15, 0.35, Math.PI / 2));
  jobs.push(P('stoolBar', 2.15, 0.8, Math.PI / 2));
  jobs.push(P('pottedPlant', 2.7, 1.6));
  jobs.push(P('pottedPlant', 2.72, -1.72));
  jobs.push(P('trashcan', 1.65, -1.75));
  jobs.push(P('loungeSofa', 2.55, -0.85, -Math.PI / 2));
  await Promise.all(jobs);

  // --- fusion du mobilier fixe : un maillage par couleur de matériau ----------------------------------------
  statics.updateMatrixWorld(true);
  const byColor = new Map();
  statics.traverse((o) => {
    if (!o.isMesh) return;
    const m = o.material;
    const key = m.color.getHexString() + (m.map ? m.map.uuid : '');
    if (!byColor.has(key)) byColor.set(key, { mat: m, geos: [] });
    const g = o.geometry.clone().applyMatrix4(o.matrixWorld);
    for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k);
    if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
    byColor.get(key).geos.push(g.index ? g.toNonIndexed() : g);
  });
  const all = [];
  for (const { mat, geos } of byColor.values()) {
    const material = new THREE.MeshStandardMaterial({ color: mat.color, map: mat.map, roughness: 0.85, metalness: 0 });
    const mesh = new THREE.Mesh(mergeGeometries(geos, false), material);
    mesh.castShadow = mesh.receiveShadow = true;
    root.add(mesh);
    all.push(mesh);
  }
  // meubles mobiles (écrans, chaises) : mêmes réglages
  root.traverse((o) => {
    if (!o.isMesh || all.includes(o)) return;
    o.material = new THREE.MeshStandardMaterial({ color: o.material.color, roughness: 0.8, metalness: 0 });
    o.castShadow = o.receiveShadow = true;
  });

  // --- socle de la maquette ---------------------------------------------------------------------
  const plinth = new THREE.Mesh(new THREE.BoxGeometry(6.3, 0.3, 4.3), new THREE.MeshStandardMaterial({ color: BRAND.navy, roughness: 0.55 }));
  plinth.position.set(0, -0.15, 0);
  plinth.receiveShadow = true;
  const trim = new THREE.Mesh(new THREE.BoxGeometry(6.34, 0.03, 4.34), new THREE.MeshStandardMaterial({ color: BRAND.cyan, emissive: BRAND.cyan, emissiveIntensity: 0.6, roughness: 0.4 }));
  trim.position.set(0, -0.02, 0);
  root.add(plinth, trim);
  set.plinth = plinth;

  // --- logo Beyond Data : étiquette sur l'avant du socle et enseigne sur le mur de gauche --------------------
  const { logo } = await logos;
  const logoTex = canvasTexture(1024, 200, (g, w, h) => { g.drawImage(logo, 0, 0, w, h); });
  const label = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 1.6 * 200 / 1024), new THREE.MeshBasicMaterial({ map: logoTex, transparent: true }));
  label.position.set(0, -0.15, 2.152);
  const sign = new THREE.Group();
  const signBack = new THREE.Mesh(new THREE.BoxGeometry(1.25, 0.3, 0.02), new THREE.MeshStandardMaterial({ color: BRAND.navy, roughness: 0.5 }));
  const signLogo = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 1.1 * 200 / 1024), new THREE.MeshBasicMaterial({ map: logoTex, transparent: true, toneMapped: false }));
  signLogo.position.z = 0.012;
  sign.add(signBack, signLogo);
  sign.position.set(-2.97, 0.95, -0.1);
  sign.rotation.y = Math.PI / 2;
  root.add(label, sign);
  set.logoTex = logoTex;

  // --- contenus des écrans -------------------------------------------------------------------------
  set.dash = { qlik: dashboardTexture('qlik'), pbi: dashboardTexture('pbi') };
  set.code = [11, 23, 37, 41, 53].map(codeTexture);
  set.screens.sort((a, b) => a.key.localeCompare(b.key));
  set.screens.forEach((s, i) => {
    const laptop = s.key.startsWith('sales');
    const box = new THREE.Box3().setFromObject(s.obj);
    const size = box.getSize(new THREE.Vector3());
    const mat = new THREE.MeshBasicMaterial({ map: i % 2 ? set.dash.pbi : set.dash.qlik, toneMapped: false });
    const plane = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), mat);
    s.obj.add(plane);
    s.obj.updateMatrixWorld(true);
    // la face de l'écran est tournée vers la chaise : plan collé devant elle (ajusté en repère local)
    if (laptop) { plane.scale.set(0.22, 0.13, 1); plane.position.set(0, 0.095, 0.035); plane.rotation.x = -0.18; }
    else { plane.scale.set(0.35, 0.2, 1); plane.position.set(0, 0.185, 0.012); }
    s.plane = plane; s.mat = mat; s.size = size;
  });

  // --- tableau Kanban (mur du fond, à droite) et calendrier (au-dessus des développeurs) ----------------------
  const board = new THREE.Group();
  board.position.set(2.35, 0.48, -1.97);
  const boardTex = canvasTexture(512, 256, (g, w, h) => {
    g.fillStyle = '#fbfbf8'; g.fillRect(0, 0, w, h);
    g.strokeStyle = '#c9ccd2'; g.lineWidth = 3; g.strokeRect(2, 2, w - 4, h - 4);
    g.fillStyle = '#2b2f36'; g.font = 'bold 22px system-ui, sans-serif'; g.textAlign = 'center';
    ['TO DO', 'IN PROGRESS', 'DONE'].forEach((t, i) => { g.fillText(t, w / 6 + (i * w) / 3, 30); if (i) { g.fillStyle = '#d5d8de'; g.fillRect((i * w) / 3 - 1, 8, 2, h - 16); g.fillStyle = '#2b2f36'; } });
  });
  const boardMesh = new THREE.Mesh(new THREE.PlaneGeometry(1.15, 0.58), new THREE.MeshStandardMaterial({ map: boardTex, roughness: 0.7 }));
  boardMesh.position.y = 0.29;
  const frame = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.63, 0.02), new THREE.MeshStandardMaterial({ color: srgb(0.55, 0.57, 0.6), roughness: 0.5, metalness: 0.4 }));
  frame.position.set(0, 0.29, -0.012);
  board.add(frame, boardMesh);
  root.add(board);
  set.board = { group: board, w: 1.15, h: 0.58, cards: [] };

  const calendar = new THREE.Group();
  calendar.position.set(-0.5, 0.62, -1.96);
  const calBack = new THREE.Mesh(new THREE.PlaneGeometry(0.32, 0.38), new THREE.MeshStandardMaterial({ color: srgb(0.92, 0.92, 0.9) }));
  calendar.add(calBack);
  root.add(calendar);
  set.calendar = calendar;

  // --- grille d'occupation du sol (cellules de 0,05 marquées là où un meuble a de la matière entre 0,08 et 0,7) --
  {
    const cell = 0.05, min = -3.5, n = Math.ceil(7 / cell);
    const data = new Uint8Array(n * n);
    const mark = (x, y, z) => {
      if (y < 0.08 || y > 0.7) return; // au-dessus des dalles du sol (0,05) et des tapis
      const i = Math.floor((x - min) / cell), j = Math.floor((z - min) / cell);
      if (i >= 0 && j >= 0 && i < n && j < n) data[j * n + i] = 1;
    };
    const A = new THREE.Vector3(), B = new THREE.Vector3(), C = new THREE.Vector3(), Q = new THREE.Vector3();
    const scan = (geo, matrix) => {
      const pos = geo.attributes.position;
      const idx = geo.index;
      const count = idx ? idx.count : pos.count;
      const v = (k, out) => out.fromBufferAttribute(pos, idx ? idx.getX(k) : k).applyMatrix4(matrix);
      for (let k = 0; k < count; k += 3) {
        v(k, A); v(k + 1, B); v(k + 2, C);
        const steps = Math.min(40, Math.ceil(Math.max(A.distanceTo(B), A.distanceTo(C), B.distanceTo(C)) / (cell * 0.7)));
        for (let u = 0; u <= steps; u++) for (let w = 0; w <= steps - u; w++) {
          Q.copy(A).multiplyScalar(1 - (u + w) / steps).addScaledVector(B, u / steps).addScaledVector(C, w / steps);
          mark(Q.x, Q.y, Q.z);
        }
      }
    };
    const I = new THREE.Matrix4();
    for (const m of all) scan(m.geometry, I);
    // les chaises des commerciaux bougent : elles sont gérées à part (obstacles ajoutés au moment voulu)
    root.updateMatrixWorld(true);
    for (const [k, c] of Object.entries(set.chairs)) if (!k.startsWith('sales')) c.traverse((o) => { if (o.isMesh) scan(o.geometry, o.matrixWorld); });
    for (const s of set.screens) s.obj.traverse((o) => { if (o.isMesh && o !== s.plane) scan(o.geometry, o.matrixWorld); });
    // murs : bande pleine (porte exceptée)
    for (let x = -3.05; x <= 3.05; x += cell / 2) for (let z = -2.06; z <= -1.98; z += cell / 2) mark(x, 0.3, z);
    for (let z = -2.05; z <= 2.05; z += cell / 2) if (z < 1.08 || z > 1.92) for (let x = -3.07; x <= -2.98; x += cell / 2) mark(x, 0.3, z);
    set.blocked = { cell, min, n, data };
  }
  return set;
}
