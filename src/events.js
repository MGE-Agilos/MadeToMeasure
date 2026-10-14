import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { BRAND, canvasTexture, logos, SEATS, DOOR } from './office.js';
import { T } from './story.js';

// Tout ce qui se passe autour du spectateur (repère de la pièce, groupe « stage » ; spectateur au départ en (0, 1,6, 0),
// maquette devant lui en z ≈ −1,3). Inviter à regarder partout :
//   11,6  BEFORE — pages du calendrier qui s'envolent autour de lui et tombent à ses pieds
//   15    le cadenas de l'éditeur descend du plafond, enchaîne les écrans          (en haut)
//   30,6  NOW — l'assistant IA (l'anneau Beyond Data) arrive de derrière, au-dessus de sa tête
//   38,6  les applications se construisent en hologrammes ; 47 : l'IA brise le cadenas, les débris tombent (en bas)
//   49,4  les applications font le tour du spectateur                              (gauche, derrière, droite)
//   58,5  l'IA se démultiplie : une par développeur, le Kanban s'emballe
//   66,8  THE FUTURE — la ville des clients surgit tout autour de lui ; tours des concurrents (orange, même IA)
//   74    les concurrents partent les premiers ; 84 : nos commerciaux deviennent des comètes, de client en client
//   91,5  les projets gagnés reviennent au-dessus de sa tête jusqu'au Kanban ; 97,5 confettis ; 102,5 carton final

const smooth = (a, b, x) => { const t = THREE.MathUtils.clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const pulse = (a, b, c, d, x) => smooth(a, b, x) * (1 - smooth(c, d, x));
const V = (x, y, z) => new THREE.Vector3(x, y, z);
const rnd = (() => { let s = 21; return () => ((s = (s * 16807) % 2147483647) / 2147483647); })();
const gltf = new GLTFLoader();

export const CUES = {
  office: 0.3, pages: 11.5, lock: 15.5, orb: 30.6, build: 38.6, break: 47.0, apps: 49.5, multiply: 58.5,
  city: 66.8, rivalsGlow: 68.5, rivals: 74.0, lost: [76.4, 76.9], cards: 91.8, cheer: 97.4, endCard: 102.5,
};

// --- textes ------------------------------------------------------------------------------------------------
function textTexture(lines, { w = 1024, h = 256, bg = null } = {}) {
  return canvasTexture(w, h, (g) => {
    if (bg) { g.fillStyle = bg; g.beginPath(); g.roundRect(4, 4, w - 8, h - 8, 36); g.fill(); }
    for (const l of lines) {
      g.font = `${l.weight ?? 800} ${l.size}px ${BRAND.font}`;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      if (l.gradient) {
        const m = g.measureText(l.text).width;
        const grad = g.createLinearGradient(w / 2 - m / 2, 0, w / 2 + m / 2, 0);
        grad.addColorStop(0, BRAND.css.purple); grad.addColorStop(0.5, BRAND.css.cyan); grad.addColorStop(1, BRAND.css.green);
        g.fillStyle = grad;
      } else g.fillStyle = l.color ?? '#ffffff';
      if (l.spacing) g.letterSpacing = `${l.spacing}px`;
      g.fillText(l.text, w / 2, l.y);
      g.letterSpacing = '0px';
    }
  });
}

// anneau Beyond Data (violet / cyan / vert) en 3D : l'assistant IA
function brandRing(radius, tube, colors = [BRAND.green, BRAND.purple, BRAND.cyan], intensity = 1.4) {
  const g = new THREE.Group();
  const gap = 0.16;
  const arcs = [[-Math.PI / 2 + gap / 2, Math.PI - gap], [Math.PI / 2 + gap / 2, Math.PI / 2 - gap], [Math.PI + gap / 2, Math.PI / 2 - gap]];
  arcs.forEach(([start, len], i) => {
    const m = new THREE.Mesh(new THREE.TorusGeometry(radius, tube, 10, 40, len), new THREE.MeshStandardMaterial({ color: colors[i], emissive: colors[i], emissiveIntensity: intensity, roughness: 0.3 }));
    m.rotation.z = start;
    g.add(m);
  });
  return g;
}

// interfaces des applications « sur mesure » (hologrammes)
function appTexture(kind) {
  const C = BRAND.css;
  return canvasTexture(384, 256, (g, w, h) => {
    g.fillStyle = 'rgba(3,6,73,0.92)'; g.beginPath(); g.roundRect(0, 0, w, h, 18); g.fill();
    g.strokeStyle = C.cyan; g.lineWidth = 4; g.beginPath(); g.roundRect(2, 2, w - 4, h - 4, 16); g.stroke();
    g.fillStyle = '#ffffff'; g.font = `800 26px ${BRAND.font}`; g.textAlign = 'left';
    const title = { portal: 'Client portal', mobile: 'Field app', flow: 'Automation', ai: 'AI assistant' }[kind];
    g.fillText(title, 20, 40);
    g.fillStyle = C.cyan; g.font = `600 15px ${BRAND.font}`; g.fillText('made to measure', 22, 62);
    if (kind === 'portal') {
      for (let i = 0; i < 3; i++) { g.fillStyle = [C.purple, C.cyan, C.green][i]; g.beginPath(); g.roundRect(20 + i * 118, 82, 106, 64, 10); g.fill(); }
      g.fillStyle = 'rgba(255,255,255,0.18)'; for (let i = 0; i < 3; i++) g.fillRect(20, 162 + i * 26, 344, 16);
    } else if (kind === 'mobile') {
      g.fillStyle = '#ffffff'; g.beginPath(); g.roundRect(140, 72, 104, 172, 16); g.fill();
      g.fillStyle = C.navy; g.fillRect(150, 92, 84, 22);
      [C.green, C.cyan, C.purple].forEach((c, i) => { g.fillStyle = c; g.fillRect(150, 124 + i * 36, 84, 26); });
    } else if (kind === 'flow') {
      const nodes = [[60, 120], [180, 90], [180, 170], [310, 130]];
      g.strokeStyle = C.green; g.lineWidth = 4;
      [[0, 1], [0, 2], [1, 3], [2, 3]].forEach(([a, b]) => { g.beginPath(); g.moveTo(...nodes[a]); g.lineTo(...nodes[b]); g.stroke(); });
      nodes.forEach(([x, y], i) => { g.fillStyle = [C.purple, C.cyan, C.cyan, C.green][i]; g.beginPath(); g.arc(x, y, 22, 0, Math.PI * 2); g.fill(); });
    } else {
      g.fillStyle = 'rgba(255,255,255,0.9)'; g.beginPath(); g.roundRect(20, 82, 230, 44, 14); g.fill();
      g.fillStyle = C.cyan; g.beginPath(); g.roundRect(134, 140, 230, 44, 14); g.fill();
      g.fillStyle = 'rgba(255,255,255,0.9)'; g.beginPath(); g.roundRect(20, 198, 180, 40, 14); g.fill();
      g.fillStyle = C.navy; g.font = `700 16px ${BRAND.font}`; g.fillText('Forecast next quarter?', 34, 109); g.fillText('Done. +12% in Q3', 148, 167);
    }
  });
}

function monthTexture(m, active = true) {
  const names = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
  return canvasTexture(128, 152, (g, w, h) => {
    g.fillStyle = '#fbfbf8'; g.fillRect(0, 0, w, h);
    g.fillStyle = active ? '#d23c3c' : '#9aa0aa'; g.fillRect(0, 0, w, 38);
    g.fillStyle = '#fff'; g.font = `800 26px ${BRAND.font}`; g.textAlign = 'center'; g.fillText(names[m % 12], w / 2, 29);
    g.fillStyle = '#c7cad0';
    for (let r = 0; r < 4; r++) for (let c = 0; c < 6; c++) g.fillRect(10 + c * 19, 52 + r * 24, 13, 13);
  });
}

function bubbleTexture(kind) {
  return canvasTexture(128, 128, (g, w) => {
    const col = kind === 'won' ? BRAND.css.green : kind === 'lost' ? BRAND.css.rival : '#ffffff';
    g.fillStyle = col; g.beginPath(); g.arc(w / 2, w / 2 - 6, 52, 0, Math.PI * 2); g.fill();
    g.beginPath(); g.moveTo(w / 2 - 14, 100); g.lineTo(w / 2, 124); g.lineTo(w / 2 + 14, 100); g.fill();
    g.fillStyle = kind === 'open' ? BRAND.css.navy : '#ffffff';
    g.font = `800 ${kind === 'open' ? 74 : 64}px ${BRAND.font}`; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(kind === 'won' ? '✓' : kind === 'lost' ? '✕' : '?', w / 2, w / 2 - 2);
  });
}

export class Events {
  constructor({ scene, stage, set, cast, story }) {
    Object.assign(this, { scene, stage, set, cast, story });
    this.ready = this.build();
  }

  // repère maquette → repère de la pièce (stage)
  O(x, y, z) { this.set.root.updateMatrix(); return V(x, y, z).applyMatrix4(this.set.root.matrix); }
  toWorld(v) { return this.stage.localToWorld(v.clone()); }
  sprite(color, size, opacity = 1) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.set.glow, color, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity }));
    s.scale.setScalar(size);
    return s;
  }

  async build() {
    const st = this.stage;
    this.officeTop = () => this.O(0, 1.35, 0);

    // --- titres des actes -----------------------------------------------------------------------------------------
    const title = (text, sub) => {
      const tex = textTexture([{ text, size: 120, y: 112, spacing: 14 }, { text: sub, size: 40, y: 200, weight: 600, color: BRAND.css.cyan }]);
      const m = new THREE.Mesh(new THREE.PlaneGeometry(0.96, 0.24), new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, toneMapped: false }));
      m.renderOrder = 10; m.visible = false; st.add(m);
      return m;
    };
    this.titles = [
      { mesh: title('BEFORE', 'Business intelligence, one vendor at a time'), t: [0.6, 1.6, 4.6, 5.6] },
      { mesh: title('NOW', 'AI coding assistants join the team'), t: [30.8, 31.6, 35.2, 36.2] },
      { mesh: title('THE FUTURE', 'The race for clients has started'), t: [63.8, 64.6, 67.4, 68.4] },
    ];

    // --- carton final ------------------------------------------------------------------------------------------
    const { logo } = await logos;
    const endTex = canvasTexture(1024, 600, (g, w) => {
      g.drawImage(logo, w / 2 - 330, 40, 660, 129);
      g.textAlign = 'center'; g.textBaseline = 'middle';
      g.font = `800 120px ${BRAND.font}`;
      const grad = g.createLinearGradient(160, 0, 860, 0);
      grad.addColorStop(0, BRAND.css.purple); grad.addColorStop(0.5, BRAND.css.cyan); grad.addColorStop(1, BRAND.css.green);
      g.textAlign = 'left';
      const a = g.measureText('Made to ').width, b = g.measureText('Measure').width, x0 = w / 2 - (a + b) / 2;
      g.fillStyle = '#ffffff'; g.fillText('Made to ', x0, 290);
      const grad2 = g.createLinearGradient(x0 + a, 0, x0 + a + b, 0);
      grad2.addColorStop(0, BRAND.css.purple); grad2.addColorStop(0.5, BRAND.css.cyan); grad2.addColorStop(1, BRAND.css.green);
      g.fillStyle = grad2; g.fillText('Measure', x0 + a, 290);
      g.textAlign = 'center';
      g.fillStyle = '#ffffff'; g.font = `700 54px ${BRAND.font}`; g.fillText('Be first. Bring us the projects.', w / 2, 420);
      g.fillStyle = BRAND.css.grey; g.font = `600 34px ${BRAND.font}`; g.fillText('We build them. Fast, tailored, vendor-free.', w / 2, 500);
    });
    this.endCard = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 0.47), new THREE.MeshBasicMaterial({ map: endTex, transparent: true, depthWrite: false, toneMapped: false }));
    this.endCard.renderOrder = 10; this.endCard.visible = false;
    this.endBack = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.55), new THREE.MeshBasicMaterial({ color: BRAND.navy, transparent: true, opacity: 0.85, depthWrite: false }));
    this.endBack.renderOrder = 9; this.endBack.visible = false;
    st.add(this.endBack, this.endCard);

    // --- calendrier : les mois défilent et s'envolent ---------------------------------------------------------
    this.months = Array.from({ length: 13 }, (_, m) => monthTexture(m));
    const calPage = new THREE.Mesh(new THREE.PlaneGeometry(0.26, 0.31), new THREE.MeshStandardMaterial({ map: this.months[0], roughness: 0.8 }));
    calPage.position.z = 0.004;
    this.set.calendar.add(calPage);
    this.calPage = calPage;
    this.pages = [];
    for (let i = 0; i < 9; i++) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(0.052, 0.062), new THREE.MeshStandardMaterial({ map: this.months[i], side: THREE.DoubleSide, roughness: 0.8 }));
      m.visible = false;
      st.add(m);
      this.pages.push({ mesh: m, t0: CUES.pages + 0.1 + i * 0.42, ang: (i % 2 ? 1 : -1) * (0.5 + i * 0.32), spin: V(rnd() * 6, rnd() * 6, rnd() * 6), curve: null });
    }

    // --- cadenas de l'éditeur + chaînes vers les écrans ----------------------------------------------------------------
    const metal = new THREE.MeshStandardMaterial({ color: 0xc3c8d6, metalness: 0.6, roughness: 0.3, emissive: 0x30344a, emissiveIntensity: 0.6 });
    const lock = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.12, 0.055), new THREE.MeshStandardMaterial({ color: 0x9aa1b5, metalness: 0.55, roughness: 0.35, emissive: 0x2a2e44, emissiveIntensity: 0.6 }));
    const hole = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.06, 16), new THREE.MeshBasicMaterial({ color: 0x0c0d14 }));
    hole.rotation.x = Math.PI / 2;
    const shackle = new THREE.Group();
    const arc = new THREE.Mesh(new THREE.TorusGeometry(0.048, 0.013, 12, 24, Math.PI), metal);
    arc.position.y = 0.09;
    const legL = new THREE.Mesh(new THREE.CylinderGeometry(0.013, 0.013, 0.06, 12), metal); legL.position.set(-0.048, 0.06, 0);
    const legR = legL.clone(); legR.position.x = 0.048;
    shackle.add(arc, legL, legR);
    const plate = textTexture([{ text: 'VENDOR LOCK-IN', size: 92, y: 128, color: '#ffffff' }], { bg: '#20232e' });
    const label = new THREE.Mesh(new THREE.PlaneGeometry(0.15, 0.0375), new THREE.MeshBasicMaterial({ map: plate, transparent: true }));
    label.position.set(0, -0.09, 0.03);
    lock.add(body, hole, shackle, label);
    lock.visible = false;
    st.add(lock);
    this.lock = { group: lock, shackle, body, label };
    // chaînes : maillons instanciés le long d'une courbe pendante, du cadenas à chaque écran
    const linkGeo = new THREE.TorusGeometry(0.011, 0.0035, 6, 12);
    this.chainTargets = this.set.screens.map((s) => s.plane);
    const LINKS = 16;
    this.chains = new THREE.InstancedMesh(linkGeo, metal, LINKS * this.chainTargets.length);
    this.chains.frustumCulled = false;
    this.chains.visible = false;
    st.add(this.chains);
    this.LINKS = LINKS;
    this.debris = Array.from({ length: LINKS * this.chainTargets.length }, () => ({ v: V((rnd() - 0.5) * 1.4, 0.6 + rnd() * 0.8, (rnd() - 0.5) * 1.4), spin: V(rnd() * 9, rnd() * 9, rnd() * 9) }));
    const plaqueWords = ['LICENSES', 'LIMITS', 'ROADMAP'];
    this.plaques = plaqueWords.map((w, i) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(0.1, 0.025), new THREE.MeshBasicMaterial({ map: textTexture([{ text: w, size: 120, y: 128, color: '#ffd7c4' }], { bg: '#3a2a2a' }), transparent: true, side: THREE.DoubleSide }));
      m.visible = false; st.add(m);
      return { mesh: m, chain: [0, 2, 4][i] };
    });

    // --- l'assistant IA : anneau Beyond Data ----------------------------------------------------------------------
    const makeOrb = (rival = false) => {
      const g = new THREE.Group();
      const ring = rival ? brandRing(0.045, 0.011, [BRAND.rival, BRAND.rival, BRAND.rival], 1.6) : brandRing(0.045, 0.011);
      g.add(ring);
      const halo = this.sprite(rival ? BRAND.rival : BRAND.cyan, 0.28, 0.55);
      const core = this.sprite(new THREE.Color(1, 1, 1), 0.05, 0.9);
      g.add(halo, core);
      g.userData = { ring, halo, core };
      g.visible = false;
      st.add(g);
      return g;
    };
    this.orb = makeOrb();
    this.orbClones = [0, 1, 2].map(() => makeOrb());
    const camStart = V(0, 1.6, 0);
    this.orbArrive = new THREE.CatmullRomCurve3([V(0.5, 2.5, 1.3), V(0.15, 2.05, 0.45), V(-0.05, 1.7, -0.25), this.O(0, 1.9, 0.3)], false, 'centripetal');
    void camStart;

    // --- applications en hologramme ---------------------------------------------------------------------------------
    this.apps = ['portal', 'mobile', 'flow', 'ai'].map((kind, i) => {
      const grp = new THREE.Group();
      const panel = new THREE.Mesh(new THREE.PlaneGeometry(0.21, 0.14), new THREE.MeshBasicMaterial({ map: appTexture(kind), transparent: true, depthWrite: false, side: THREE.DoubleSide, toneMapped: false }));
      const scan = new THREE.Mesh(new THREE.PlaneGeometry(0.23, 0.006), new THREE.MeshBasicMaterial({ color: BRAND.cyan, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
      const glow = this.sprite(BRAND.cyan, 0.42, 0.25);
      grp.add(glow, panel, scan);
      grp.visible = false;
      st.add(grp);
      const seat = [SEATS.dev1, SEATS.dev2, SEATS.dev3, SEATS.sales1][i];
      const home = i < 3 ? this.O(seat.x, 1.05, seat.z - 0.45) : this.O(seat.x + 0.35, 1.0, seat.z + 0.5);
      return { grp, panel, scan, glow, home, built: i < 3 ? T.orbVisit[i] + 0.25 : 43.4 };
    });

    // --- Kanban : cartes de projets ---------------------------------------------------------------------------------
    const board = this.set.board;
    const cardColors = [BRAND.purple, BRAND.cyan, BRAND.green];
    const cardGeo = new THREE.PlaneGeometry(0.11, 0.07);
    this.cards = [];
    const addCard = (keys, appear, color) => {
      const m = new THREE.Mesh(cardGeo, new THREE.MeshStandardMaterial({ color, roughness: 0.6, emissive: color, emissiveIntensity: 0.15 }));
      m.visible = false;
      board.group.add(m);
      this.cards.push({ mesh: m, keys, appear });
    };
    // avant : peu de projets
    addCard([[0, 1]], 0, cardColors[0]); addCard([[0, 1]], 0, cardColors[1]); addCard([[0, 0]], 0, cardColors[2]);
    addCard([[0, 2]], 0, cardColors[1]); addCard([[0, 2]], 0, cardColors[0]);
    // maintenant : la capacité est démultipliée
    for (let i = 0; i < 6; i++) { const a = 58.6 + i * 0.35; addCard([[a, 0], [a + 1.0 + i * 0.15, 1], [a + 2.2 + i * 0.25, 2]], a, cardColors[i % 3]); }
    this.board = board;

    // --- la ville des clients (et des concurrents) ---------------------------------------------------------------------
    const names = ['building-a', 'building-b', 'building-c', 'building-d', 'building-e', 'building-f', 'building-g', 'building-h', 'building-i', 'building-j', 'building-k', 'building-l'];
    const rivalNames = ['building-skyscraper-a', 'building-skyscraper-c', 'building-skyscraper-e'];
    const load = (n) => gltf.loadAsync(`assets/kenney/city/${n}.glb`).then((g) => g.scene);
    const [clientModels, rivalModels] = await Promise.all([Promise.all(names.map(load)), Promise.all(rivalNames.map(load))]);
    const center = this.O(0, 0, 0);
    const baseY = this.O(0, -0.3, 0).y; // dessous du socle = plan de la table
    this.city = [];
    // 15 emplacements en couronne autour de la maquette ; on laisse libre la place du spectateur (vers +z)
    const slots = [];
    for (let k = 0; k < 15; k++) slots.push(Math.PI + (k - 7) * (2 * Math.PI - 1.0) / 14.6);
    const rivalSlots = [2, 7, 12];
    let ci = 0, ri = 0;
    slots.forEach((ang, k) => {
      const rival = rivalSlots.includes(k);
      const src = rival ? rivalModels[ri++] : clientModels[ci++ % clientModels.length];
      const model = src.clone(true);
      model.traverse((o) => {
        if (!o.isMesh) return;
        o.material = o.material.clone();
        o.material.emissive = (rival ? BRAND.rival : BRAND.cyan).clone();
        o.material.emissiveIntensity = 0.08;
        o.castShadow = false;
      });
      const radius = (k % 2 ? 1.45 : 1.62) + (rival ? 0.12 : 0);
      const pos = V(center.x + Math.sin(ang) * radius, baseY, center.z + Math.cos(ang) * radius);
      const grp = new THREE.Group();
      grp.position.copy(pos);
      grp.rotation.y = ang + Math.PI; // façade vers la maquette
      const sc = rival ? 0.19 : 0.23;
      model.scale.setScalar(sc);
      grp.add(model);
      const pad = new THREE.Mesh(new THREE.RingGeometry(0.15, 0.17, 40).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: rival ? BRAND.rival : BRAND.cyan, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false }));
      pad.position.y = 0.003;
      grp.add(pad);
      const height = new THREE.Box3().setFromObject(model).max.y;
      grp.visible = false;
      st.add(grp);
      const b = { grp, model, pad, rival, ang, height, top: pos.clone().add(V(0, height + 0.06, 0)), rise: CUES.city + 0.15 + (((ang - Math.PI) / (2 * Math.PI)) + 0.5) * 1.6 };
      if (rival) {
        b.orb = makeOrb(true);
        b.orb.scale.setScalar(0.8);
      } else {
        b.bubble = new THREE.Sprite(new THREE.SpriteMaterial({ map: null, transparent: true, depthWrite: false, toneMapped: false }));
        b.bubble.scale.setScalar(0.07);
        b.bubble.visible = false;
        st.add(b.bubble);
      }
      this.city.push(b);
    });
    this.clients = this.city.filter((b) => !b.rival);
    this.rivals = this.city.filter((b) => b.rival);
    this.bubbleTex = { open: bubbleTexture('open'), won: bubbleTexture('won'), lost: bubbleTexture('lost') };

    // --- la course : comètes des concurrents (orange) et de nos commerciaux (couleurs de la marque) ------------------------------
    // clients numérotés dans l'ordre de la couronne ; on choisit qui gagne quoi
    const C = this.clients;
    const door = this.O(DOOR.x - 0.1, 0.45, DOOR.z);
    this.door = door;
    const ex2 = this.story.exitTime.sales2, ex1 = this.story.exitTime.sales1;
    // trajets de saut en saut (départ, arrivée, cible)
    const hop = (from, to, t0, t1, color, rival) => ({ from, to, t0, t1, color, rival });
    this.comets = [];
    // les concurrents, partis avant nous
    const r0 = this.rivals[0], r1 = this.rivals[1], r2 = this.rivals[2];
    this.comets.push(hop(r0, C[1], 74.0, 76.4, BRAND.rival, true));
    this.comets.push(hop(r1, C[5], 74.3, 76.9, BRAND.rival, true));
    this.comets.push(hop(r2, C[8], 86.6, 90.0, BRAND.rival, true));             // gagne aussi un client
    this.comets.push(hop(r1, C[6], 86.0, 89.6, BRAND.rival, true));             // course serrée : on arrive avant
    // nos deux commerciaux : de client en client
    const path2 = [C[0], C[2], C[3], C[4]], path1 = [C[6], C[7], C[9], C[10], C[11]];
    const chain = (path, t0, dur, col) => { let prev = null; path.forEach((c, i) => { const a = t0 + i * dur; this.comets.push(hop(prev ?? 'door', c, a, a + dur * (i ? 0.8 : 1.15), col, false)); prev = c; }); };
    chain(path2, ex2 + 0.15, 1.45, BRAND.cyan);
    chain(path1, ex1 + 0.15, 1.3, BRAND.green);
    // résultat pour chaque client : gagné / perdu, et à quel moment
    for (const c of this.comets) {
      if (c.to.won !== undefined) continue;
      const first = this.comets.filter((o) => o.to === c.to).sort((a, b) => a.t1 - b.t1)[0];
      c.to.won = !first.rival; c.to.decided = first.t1;
    }
    for (const c of this.comets) c.loser = c.to.decided < c.t1 - 1e-3; // arrivé trop tard : s'éteint
    const TRAIL = 14;
    for (const c of this.comets) {
      c.head = this.sprite(c.color, 0.09, 1);
      c.core = this.sprite(new THREE.Color(1, 1, 1), 0.035, 1);
      c.trail = Array.from({ length: TRAIL }, (_, k) => { const s = this.sprite(c.color, 0.07 * (1 - k / TRAIL), 0.7 * (1 - k / TRAIL)); st.add(s); return s; });
      st.add(c.head, c.core);
    }
    this.doorFlash = this.sprite(BRAND.cyan, 0.3, 1);
    this.doorFlash.position.copy(door);
    st.add(this.doorFlash);
    // les projets gagnés reviennent au Kanban (au-dessus de la tête du spectateur pour ceux de derrière)
    this.projectFlights = [];
    const won = this.clients.filter((c) => c.won).sort((a, b) => a.decided - b.decided);
    won.forEach((c, i) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(0.11 * 0.9, 0.07 * 0.9), new THREE.MeshBasicMaterial({ color: cardColors[i % 3], side: THREE.DoubleSide, toneMapped: false }));
      const glow = this.sprite(cardColors[i % 3], 0.12, 0.6);
      m.add(glow);
      m.visible = false;
      st.add(m);
      const t0 = Math.max(c.decided + 0.6, 91.6 + i * 0.55), t1 = t0 + 2.4;
      this.projectFlights.push({ mesh: m, from: c, t0, t1 });
      // la carte apparaît dans « TO DO », puis avance dans les colonnes
      const a = t1;
      addCard([[a, 0], [Math.max(a + 2.2, 99.6 + i * 0.35), 1], [Math.max(a + 4.2, 101.8 + i * 0.4), 2]], a, cardColors[i % 3]);
    });

    // --- confettis ---------------------------------------------------------------------------------------------
    const N = 160;
    this.confetti = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.014, 0.009), new THREE.MeshBasicMaterial({ side: THREE.DoubleSide, toneMapped: false }), N);
    this.confetti.frustumCulled = false;
    this.confettiSeeds = Array.from({ length: N }, (_, i) => {
      this.confetti.setColorAt(i, [BRAND.purple, BRAND.cyan, BRAND.green, new THREE.Color(1, 1, 1)][i % 4]);
      return { x: (rnd() - 0.5) * 2.6, z: (rnd() - 0.5) * 2.4, y0: 1.9 + rnd() * 0.9, sp: 0.18 + rnd() * 0.2, ph: rnd() * 6.28, rot: V(rnd() * 6, rnd() * 6, rnd() * 6), t0: 97.4 + rnd() * 1.4 };
    });
    this.confetti.visible = false;
    st.add(this.confetti);
  }

  // positions utiles à la mise en scène (repère monde)
  orbWorld() { return this.toWorld(this.orb.position); }
  appWorld(i) { return this.toWorld(this.apps[i].grp.position); }
  cityWorld(i) { const c = this.city[i % this.city.length]; return this.toWorld(c.top); }
  boardWorld() { return this.board.group.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(0, 0.3 * this.set.root.getWorldScale(new THREE.Vector3()).x, 0)); }

  // sons : [instant, fichier, émetteur, volume, distance de référence]
  sounds() {
    const at = (p) => { const o = new THREE.Object3D(); o.position.copy(p); this.stage.add(o); return o; };
    const list = [
      [CUES.office, 'office.mp3', at(this.O(0, 0.5, -0.5)), 0.6, 1.2],
      [CUES.pages, 'pages.mp3', this.set.calendar, 1.0, 0.8],
      [CUES.lock, 'lock.mp3', this.lock.group, 1.0, 0.8],
      [CUES.orb, 'orb.mp3', this.orb, 1.0, 0.8],
      [CUES.build, 'build.mp3', this.apps[1].grp, 0.9, 0.8],
      [CUES.break, 'break.mp3', this.lock.group, 1.0, 0.9],
      [CUES.apps, 'apps.mp3', this.apps[0].grp, 0.9, 0.6],
      [CUES.multiply, 'build.mp3', this.board.group, 0.6, 0.8],
      [CUES.city, 'city.mp3', at(V(0, 0.8, 0.6)), 1.0, 1.5],
      [CUES.rivals, 'rivals.mp3', this.rivals[0].grp, 1.0, 1.0],
      [CUES.lost[0], 'lost.mp3', this.clients[1].grp, 0.8, 0.8],
      [CUES.lost[1], 'lost.mp3', this.clients[5].grp, 0.8, 0.8],
      [this.story.exitTime.sales2 - 0.5, 'door.mp3', at(this.door), 0.9, 0.6],
      [this.story.exitTime.sales2, 'launch.mp3', at(this.door), 1.0, 0.8],
      [this.story.exitTime.sales1, 'launch.mp3', at(this.door), 0.8, 0.8],
      [CUES.cards, 'cards.mp3', this.board.group, 1.0, 1.0],
      [CUES.cheer, 'cheer.mp3', this.cast.dev2.root, 1.0, 0.8],
    ];
    // un tintement à chaque client gagné, un son sourd à chaque client perdu (après les deux premiers)
    for (const c of this.clients) if (c.decided) list.push([c.decided, c.won ? 'win.mp3' : 'lost.mp3', c.grp, c.won ? 0.7 : 0.6, 0.7]);
    return list.filter(([t], i, arr) => arr.findIndex((o) => Math.abs(o[0] - t) < 0.01 && o[1] === arr[i][1]) === i);
  }

  evaluate(t, dt, head) {
    if (!this.city) return;
    const st = this.stage;
    const headL = st.worldToLocal(head.clone());
    const fade = this.story.fade ?? 1;
    const face = (obj, k = 1) => { const yaw = Math.atan2(headL.x - obj.position.x, headL.z - obj.position.z); obj.rotation.set(0, yaw * k, 0); };

    // titres
    for (const { mesh, t: [a, b, c, d] } of this.titles) {
      const k = pulse(a, b, c, d, t);
      mesh.visible = k > 0.001;
      if (!mesh.visible) continue;
      mesh.position.copy(this.officeTop()).add(V(0, 0.02 * (1 - k) + (t - a) * 0.006, 0));
      face(mesh);
      mesh.material.opacity = k;
    }
    // carton final
    {
      const k = pulse(CUES.endCard, CUES.endCard + 1.2, 114.5, 116.5, t);
      this.endCard.visible = this.endBack.visible = k > 0.001;
      if (k > 0.001) {
        const p = this.officeTop().add(V(0, 0.08, 0.1));
        this.endCard.position.copy(p); this.endBack.position.copy(p).add(V(0, 0, -0.005));
        face(this.endCard); face(this.endBack);
        this.endBack.position.addScaledVector(V(Math.sin(this.endBack.rotation.y), 0, Math.cos(this.endBack.rotation.y)), -0.004);
        this.endCard.material.opacity = k; this.endBack.material.opacity = 0.85 * k;
        this.endCard.scale.setScalar(0.9 + 0.1 * k);
      }
    }

    this.evalCalendar(t, headL);
    this.evalLock(t, dt);
    this.evalOrb(t, headL);
    this.evalApps(t, headL);
    this.evalCards(t);
    this.evalCity(t, headL);
    this.evalConfetti(t);
    void fade;
  }

  // --- calendrier ------------------------------------------------------------------------------------------------
  evalCalendar(t, headL) {
    // la page affichée avance d'un mois à chaque page arrachée
    const n = this.pages.filter((p) => t >= p.t0).length;
    const map = this.months[Math.min(12, n)];
    if (this.calPage.material.map !== map) { this.calPage.material.map = map; this.calPage.material.needsUpdate = true; }
    const calW = this.set.calendar.getWorldPosition(new THREE.Vector3());
    const calL = this.stage.worldToLocal(calW);
    for (const p of this.pages) {
      const u = (t - p.t0) / 4.6;
      p.mesh.visible = u > 0 && u < 1;
      if (!p.mesh.visible) { if (u <= 0) p.curve = null; continue; }
      if (!p.curve) {
        // vole vers le spectateur, tourne autour de sa tête, tombe à ses pieds
        const a = p.ang;
        p.curve = new THREE.CatmullRomCurve3([
          calL.clone(), calL.clone().add(V(0.1 * Math.sign(a), 0.25, 0.35)),
          headL.clone().add(V(Math.sin(a) * 0.55, -0.05, -0.45)),
          headL.clone().add(V(Math.sin(a) * 0.75, -0.1, Math.cos(a) * 0.35)),
          headL.clone().add(V(Math.sin(a * 1.3) * 0.7, -0.8, 0.25 + Math.cos(a) * 0.4)),
          V(headL.x + Math.sin(a * 1.6) * 0.6, 0.02, headL.z + 0.2 + Math.cos(a) * 0.5),
        ], false, 'centripetal');
      }
      p.mesh.position.copy(p.curve.getPointAt(Math.min(1, u * 1.05)));
      p.mesh.rotation.set(p.spin.x * u * 3, p.spin.y * u * 3, p.spin.z * u * 3);
      p.mesh.material.opacity = 1;
    }
  }

  // --- cadenas ---------------------------------------------------------------------------------------------------
  evalLock(t, dt) {
    const { group, shackle, body, label } = this.lock;
    const home = this.O(0, 2.2, -0.2);
    const drop = smooth(14.9, 15.6, t);
    const brk = CUES.break;
    group.visible = t > 14.8 && t < brk + 4.5;
    this.chains.visible = t > 15.5 && t < brk + 4.5;
    for (const p of this.plaques) p.mesh.visible = t > 16.2 && t < brk;
    if (!group.visible) return;
    const bounce = t > 15.6 ? Math.exp(-(t - 15.6) * 6) * Math.sin((t - 15.6) * 22) * 0.02 : 0;
    const shake = pulse(45.2, 45.8, brk - 0.05, brk, t) * Math.sin(t * 60) * 0.012;
    group.position.copy(home).add(V(shake, (1 - drop) * 1.4 + bounce, 0));
    group.rotation.set(0, 0, shake * 3);
    shackle.position.set(0, 0, 0); shackle.rotation.set(0, 0, 0);
    body.visible = label.visible = true;
    const fall = Math.max(0, t - brk);
    if (fall > 0) {
      // l'anneau saute, le corps tombe jusqu'au sol
      shackle.position.set(0.05 * fall, 0.5 * fall - 0.9 * fall * fall, 0);
      shackle.rotation.z = fall * 5;
      const y = Math.max(-group.position.y + 0.03, -0.9 * fall * fall * 1.1);
      body.position.y = y; label.position.y = -0.09 + y; label.rotation.z = fall * 2;
      group.position.y = home.y;
    } else { body.position.y = 0; label.position.y = -0.09; label.rotation.z = 0; }
    const fadeOut = 1 - smooth(brk + 3.5, brk + 4.5, t);
    group.scale.setScalar(Math.max(1e-3, fadeOut));
    // chaînes : du dessous du cadenas vers chaque écran, apparition progressive, puis éclatement
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = V(1, 1, 1);
    const grow = smooth(15.5, 16.6, t);
    const anchor = home.clone().add(V(0, (1 - drop) * 1.4 - 0.07, 0));
    let idx = 0;
    this.chainTargets.forEach((plane, ci) => {
      const end = this.stage.worldToLocal(plane.getWorldPosition(new THREE.Vector3()));
      const mid = anchor.clone().lerp(end, 0.5).add(V(0, -0.12, 0));
      const curve = new THREE.QuadraticBezierCurve3(anchor, mid, end);
      for (let k = 0; k < this.LINKS; k++) {
        const u = (k + 0.5) / this.LINKS;
        let p = curve.getPointAt(u * grow);
        const tan = curve.getTangentAt(Math.min(1, u * grow + 1e-3));
        q.setFromUnitVectors(V(1, 0, 0), tan).multiply(new THREE.Quaternion().setFromAxisAngle(V(1, 0, 0), k % 2 ? Math.PI / 2 : 0));
        if (fall > 0) {
          const d = this.debris[idx];
          p = p.clone().add(d.v.clone().multiplyScalar(fall * 0.35)).add(V(0, -1.2 * fall * fall, 0));
          p.y = Math.max(0.01, p.y);
          q.setFromEuler(new THREE.Euler(d.spin.x * fall, d.spin.y * fall, d.spin.z * fall));
        }
        s.setScalar(fadeOut > 0 ? Math.max(1e-3, fadeOut) : 1e-3);
        m.compose(p, q, s);
        this.chains.setMatrixAt(idx++, m);
      }
      const pl = this.plaques.find((x) => x.chain === ci);
      if (pl) { pl.mesh.position.copy(curve.getPointAt(0.55)).add(V(0, -0.03, 0)); pl.mesh.rotation.set(0, Math.atan2(-pl.mesh.position.x, -pl.mesh.position.z) + Math.PI, Math.sin(t * 1.3 + ci) * 0.08); }
    });
    this.chains.instanceMatrix.needsUpdate = true;
    void dt;
  }

  // --- l'assistant IA ---------------------------------------------------------------------------------------------
  orbPath(t, headL) {
    const hover = this.O(0, 1.75, 0.25);
    const bob = V(Math.sin(t * 1.3) * 0.015, Math.sin(t * 2.1) * 0.012, 0);
    if (t < 34) return this.orbArrive.getPointAt(smooth(CUES.orb, 34, t));
    const screen = (i) => this.stage.worldToLocal(this.set.screens.find((s) => s.key === `dev${i + 1}`).plane.getWorldPosition(new THREE.Vector3())).add(V(0, 0.03, 0.04));
    const lockP = this.O(0, 2.2, -0.2);
    // étapes : [instant, position]
    const keys = [[34, hover], [37.8, hover], [T.orbVisit[0], screen(0)], [T.orbVisit[1], screen(1)], [T.orbVisit[2], screen(2)], [43.3, hover], [45.6, lockP.clone().add(V(0, 0.18, 0.12))], [CUES.break - 0.05, lockP.clone().add(V(0, 0.02, 0.06))], [48.4, hover]];
    if (t < 49.4) {
      let i = 0; while (i < keys.length - 1 && t > keys[i + 1][0]) i++;
      if (i >= keys.length - 1) return keys[keys.length - 1][1].clone().add(bob);
      const [t0, a] = keys[i], [t1, b] = keys[i + 1];
      const k = smooth(t0, t1, t);
      return a.clone().lerp(b, k).add(V(0, Math.sin(k * Math.PI) * 0.06, 0)).add(bob.multiplyScalar(1 - Math.sin(k * Math.PI)));
    }
    // mène la ronde des applications autour du spectateur, puis revient
    if (t < 57.6) {
      const k = smooth(49.4, 50.4, t) * (1 - smooth(56.6, 57.6, t));
      const ang = this.appAngle(t) + 0.55;
      const orbit = headL.clone().add(V(Math.sin(ang) * 0.62, 0.12, Math.cos(ang) * 0.62));
      return hover.clone().lerp(orbit, k);
    }
    // dernier acte : au-dessus du Kanban
    const boardP = this.O(2.35, 1.35, -1.6);
    return hover.clone().lerp(boardP, smooth(59.5, 61.5, t)).add(bob);
  }

  appAngle(t) { return Math.PI + (t - 49.4) * 0.9; } // part de devant (−z) et fait le tour

  evalOrb(t, headL) {
    const o = this.orb;
    o.visible = t > CUES.orb && fadeVisible(t);
    if (o.visible) {
      o.position.copy(this.orbPath(t, headL));
      const { ring, halo, core } = o.userData;
      ring.rotation.y = t * 1.6;
      ring.rotation.x = Math.sin(t * 0.7) * 0.3;
      const talk = pulse(34.2, 34.5, 36.6, 36.9, t) * (0.5 + 0.5 * Math.sin(t * 18));
      const arrive = smooth(CUES.orb, CUES.orb + 1.2, t);
      o.scale.setScalar(arrive * (1 + 0.12 * talk));
      halo.material.opacity = 0.45 + 0.35 * talk + 0.4 * pulse(CUES.break - 0.2, CUES.break, CUES.break + 0.2, CUES.break + 0.8, t);
      core.material.opacity = 0.7 + 0.3 * talk;
    }
    // l'IA se démultiplie : une copie au-dessus de chaque développeur
    this.orbClones.forEach((c, i) => {
      c.visible = t > CUES.multiply && fadeVisible(t);
      if (!c.visible) return;
      const s = [SEATS.dev1, SEATS.dev2, SEATS.dev3][i];
      const k = smooth(CUES.multiply, CUES.multiply + 1.2, t);
      const target = this.O(s.x, 1.25, s.z - 0.2).add(V(0, Math.sin(t * 2 + i) * 0.01, 0));
      c.position.copy(this.orb.position).lerp(target, k);
      c.userData.ring.rotation.y = t * (2 + i * 0.4) + i;
      c.scale.setScalar(0.55 * k);
    });
  }

  // --- applications ---------------------------------------------------------------------------------------------
  evalApps(t, headL) {
    this.apps.forEach((a, i) => {
      const build = smooth(a.built, a.built + 1.1, t);
      const gone = smooth(T.act3 - 0.5, T.act3 + 0.8, t);
      a.grp.visible = build > 0.001 && gone < 0.999;
      if (!a.grp.visible) return;
      // construction : le panneau se déploie de bas en haut, une ligne de balayage le parcourt
      a.panel.scale.set(1, Math.max(0.01, build), 1);
      a.panel.position.y = -0.07 * (1 - build);
      a.scan.position.y = -0.07 + 0.14 * build;
      a.scan.visible = build < 0.999;
      const op = 1 - gone;
      a.panel.material.opacity = 0.95 * op;
      a.glow.material.opacity = 0.25 * op;
      // ronde autour du spectateur
      const k = smooth(T.appsOut[0] + i * 0.15, T.appsOut[0] + 1.2 + i * 0.15, t) * (1 - smooth(T.appsOut[1] - 1 + i * 0.1, T.appsOut[1] + 0.2 + i * 0.1, t));
      const ang = this.appAngle(t) - i * (Math.PI / 2);
      const orbit = headL.clone().add(V(Math.sin(ang) * 0.6, -0.04 + Math.sin(t * 1.5 + i) * 0.04, Math.cos(ang) * 0.6));
      a.grp.position.copy(a.home).lerp(orbit, k).add(V(0, Math.sin(t * 1.4 + i) * 0.008, 0));
      const yaw = Math.atan2(headL.x - a.grp.position.x, headL.z - a.grp.position.z);
      a.grp.rotation.set(0, yaw, 0);
      a.grp.scale.setScalar(1 + 0.35 * k);
    });
  }

  // --- Kanban -----------------------------------------------------------------------------------------------------
  evalCards(t) {
    const colAt = (card, time) => { let c = -1; for (const [kt, col] of card.keys) if (time >= kt - 1e-6) c = col; return c; };
    const slotPos = (time, card) => {
      const col = colAt(card, time);
      if (col < 0) return null;
      // cartes présentes dans cette colonne, dans l'ordre d'arrivée
      const same = this.cards.filter((c) => colAt(c, time) === col && time >= c.appear - 1e-6);
      const entry = (c) => { let e = 0; for (const [kt, cl] of c.keys) if (cl === col && kt <= time) e = kt; return e; };
      same.sort((a, b) => entry(a) - entry(b) || this.cards.indexOf(a) - this.cards.indexOf(b));
      const slot = same.indexOf(card);
      const sub = slot % 2, row = Math.floor(slot / 2);
      return V(-0.383 + col * 0.383 + (sub ? 0.062 : -0.062), 0.47 - Math.min(row, 5) * 0.082 - (row > 5 ? 0.01 * (row - 5) : 0), 0.004 + slot * 0.0004);
    };
    for (const card of this.cards) {
      card.mesh.visible = t >= card.appear;
      if (!card.mesh.visible) continue;
      const now = slotPos(t, card);
      if (!now) { card.mesh.visible = false; continue; }
      // glisse depuis la position précédente (changement de colonne ou cartes qui se réorganisent)
      let last = card.appear;
      for (const [kt] of card.keys) if (kt <= t) last = kt;
      const prev = slotPos(last - 0.01, card) ?? now;
      const k = smooth(last, last + 0.45, t);
      card.mesh.position.copy(prev).lerp(now, k);
      const pop = smooth(card.appear, card.appear + 0.3, t);
      card.mesh.scale.setScalar(Math.max(0.01, pop));
    }
  }

  // --- la ville, la course, les projets ---------------------------------------------------------------------------------
  evalCity(t, headL) {
    const on = t > CUES.city - 0.2 && fadeVisible(t);
    for (const b of this.city) {
      const k = smooth(b.rise, b.rise + 1.2, t);
      b.grp.visible = on && k > 0.001;
      if (b.orb) b.orb.visible = b.grp.visible;
      if (b.bubble) b.bubble.visible = false;
      if (!b.grp.visible) continue;
      b.model.scale.y = (b.rival ? 0.19 : 0.23) * Math.max(0.01, k);
      b.pad.material.opacity = 0.35 + 0.65 * (1 - k) + 0.2 * Math.sin(t * 3 + b.ang);
      if (b.rival) {
        // la même IA, chez les concurrents
        b.orb.position.copy(b.top).add(V(0, 0.05 + Math.sin(t * 2 + b.ang) * 0.01, 0));
        b.orb.userData.ring.rotation.y = t * 1.8 + b.ang;
        const glow = pulse(CUES.rivalsGlow, CUES.rivalsGlow + 0.6, 72, 73, t);
        b.orb.scale.setScalar(0.8 * k * (1 + 0.5 * glow));
        b.orb.userData.halo.material.opacity = 0.5 + 0.5 * glow;
        continue;
      }
      // bulles « ? » (besoin), puis ✓ (gagné) ou ✕ (pris par un concurrent)
      const ask = smooth(84.9 + b.ang * 0.05, 85.6 + b.ang * 0.05, t);
      const decided = b.decided !== undefined && t >= b.decided;
      const lostEarly = b.decided !== undefined && b.decided < 80;
      const show = decided ? 1 : (lostEarly ? 0 : ask);
      if (show > 0.01) {
        b.bubble.visible = true;
        const map = decided ? (b.won ? this.bubbleTex.won : this.bubbleTex.lost) : this.bubbleTex.open;
        if (b.bubble.material.map !== map) { b.bubble.material.map = map; b.bubble.material.needsUpdate = true; }
        const popK = decided ? 1 + 0.4 * pulse(b.decided, b.decided + 0.15, b.decided + 0.2, b.decided + 0.6, t) : 1;
        b.bubble.position.copy(b.top).add(V(0, 0.06 + Math.sin(t * 2.2 + b.ang) * 0.008, 0));
        b.bubble.scale.setScalar(0.12 * show * popK);
      }
      // l'immeuble prend la couleur du gagnant
      const tint = decided ? (b.won ? BRAND.green : BRAND.rival) : BRAND.cyan;
      const glowK = decided ? 0.35 + 0.25 * pulse(b.decided, b.decided + 0.2, b.decided + 0.4, b.decided + 1.4, t) : 0.08;
      b.model.traverse((o) => { if (o.isMesh) { o.material.emissive.copy(tint); o.material.emissiveIntensity = glowK; } });
      b.pad.material.color.copy(tint);
    }

    // comètes
    const doorPos = this.door;
    this.doorFlash.visible = false;
    for (const k of ['sales1', 'sales2']) {
      const e = this.story.exitTime[k];
      const f = pulse(e - 0.15, e, e + 0.1, e + 0.7, t);
      if (f > 0.01) { this.doorFlash.visible = true; this.doorFlash.scale.setScalar(0.35 * f); this.doorFlash.material.color.copy(k === 'sales1' ? BRAND.green : BRAND.cyan); }
    }
    const posOf = (c, u) => {
      const a = c.from === 'door' ? doorPos : (c.from.rival ? c.from.top.clone().add(V(0, 0.05, 0)) : c.from.top);
      const b = c.to.top;
      const p = a.clone().lerp(b, u);
      const lift = 0.35 + a.distanceTo(b) * 0.25;
      p.y += Math.sin(u * Math.PI) * lift;
      return p;
    };
    for (const c of this.comets) {
      const dur = c.t1 - c.t0;
      const u = (t - c.t0) / dur;
      const fizz = c.loser ? smooth(c.to.decided, c.to.decided + 0.4, t) : 0; // arrivé trop tard : s'éteint
      const visible = on && u > 0 && u < 1.15 && fizz < 1;
      c.head.visible = c.core.visible = visible && u < 1;
      for (let k = 0; k < c.trail.length; k++) {
        const uk = u - k * 0.022 / dur * 1.6;
        const v = visible && uk > 0 && uk < 1;
        c.trail[k].visible = v;
        if (v) { c.trail[k].position.copy(posOf(c, smooth(0, 1, uk))); c.trail[k].material.opacity = 0.7 * (1 - k / c.trail.length) * (1 - fizz); }
      }
      if (c.head.visible) {
        const p = posOf(c, smooth(0, 1, u));
        c.head.position.copy(p); c.core.position.copy(p);
        c.head.material.opacity = 1 - fizz; c.core.material.opacity = 1 - fizz;
      }
    }

    // les projets gagnés volent jusqu'au Kanban
    const boardL = this.stage.worldToLocal(this.board.group.getWorldPosition(new THREE.Vector3())).add(V(0, 0.08, 0.02));
    for (const f of this.projectFlights) {
      const u = (t - f.t0) / (f.t1 - f.t0);
      f.mesh.visible = u > 0 && u < 1;
      if (!f.mesh.visible) continue;
      const a = f.from.top, b = boardL;
      // passe au-dessus du spectateur : point de contrôle entre la tête et la maquette
      const ctrl = headL.clone().lerp(a.clone().lerp(b, 0.5), 0.45).add(V(0, 0.55, 0));
      const k = smooth(0, 1, u);
      const p = new THREE.QuadraticBezierCurve3(a, ctrl, b).getPoint(k);
      f.mesh.position.copy(p);
      f.mesh.rotation.set(Math.sin(t * 3) * 0.3, t * 4, 0);
      f.mesh.scale.setScalar(1 - 0.5 * smooth(0.8, 1, u));
    }
  }

  evalConfetti(t) {
    const on = t > 97.3 && t < 108;
    this.confetti.visible = on;
    if (!on) return;
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = V(1, 1, 1);
    const c = this.O(0, 0, 0);
    this.confettiSeeds.forEach((d, i) => {
      const u = Math.max(0, t - d.t0);
      const y = d.y0 - u * d.sp;
      const p = V(c.x + d.x * 0.55 + Math.sin(u * 2 + d.ph) * 0.05, y, c.z + d.z * 0.55 + Math.cos(u * 1.7 + d.ph) * 0.05);
      q.setFromEuler(new THREE.Euler(d.rot.x * u, d.rot.y * u, d.rot.z * u));
      s.setScalar(t < d.t0 || y < c.y - 0.05 ? 1e-4 : 1);
      m.compose(p, q, s);
      this.confetti.setMatrixAt(i, m);
    });
    this.confetti.instanceMatrix.needsUpdate = true;
  }
}

const fadeVisible = (t) => t < T.fadeOut[1];
