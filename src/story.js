import * as THREE from 'three';
import { NavGrid } from './nav.js';
import { SEATS, DOOR, BRAND } from './office.js';

// Mise en scène de « Made to Measure ». evaluate(t) place chaque élément à l'instant t (secondes du film).
//  ACT 1 — BEFORE      0 – 30,5   bureau BI, lumière froide, projets rares : une développeuse va au café, le commercial
//                                 constate un Kanban presque vide
//  ACT 2 — NOW        30,5 – 63,5 l'assistant IA arrive, les écrans codent ; la commerciale présente les applications,
//                                 un développeur fait avancer les cartes du Kanban
//  ACT 3 — THE FUTURE 63,5 – 117  la ville des clients ; les commerciaux sortent ; un développeur accueille les projets
// Chaque personnage suit une chorégraphie (assis → se lève → marche → reste → revient s'asseoir), et chaque marche suit
// un trajet planifié (A*) qui contourne meubles et fauteuils. Les effets autour du spectateur sont dans events.js.
export const DURATION = 117;

const smooth = (a, b, x) => { const t = THREE.MathUtils.clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const pulse = (a, b, c, d, x) => smooth(a, b, x) * (1 - smooth(c, d, x)); // monte de a à b, redescend de c à d
const lerpAngle = (a, b, k) => a + Math.atan2(Math.sin(b - a), Math.cos(b - a)) * k;
const yawOf = (v) => Math.atan2(v.x, v.z);
const V = (x, z) => new THREE.Vector3(x, 0, z);

export const T = {
  act2: 30.5, act3: 63.5,
  orbVisit: [38.6, 40.1, 41.6],          // l'IA passe d'un poste à l'autre : l'écran se met à coder
  appsOut: [49.4, 57.6],                 // les applications tournent autour du spectateur
  swivel: [95.4, 97.0],                  // les développeurs restés assis se retournent vers le spectateur
  fadeOut: [112, 116.5],
};
const SEAT_Y = 0.255;   // dessus de l'assise des fauteuils de bureau
const R = 0.13;         // rayon d'un personnage (planification)
const SPEED = 0.75;     // vitesse de marche (unités/s) : pas vif
const ACC = 0.45;       // durée d'accélération / de freinage
const STRIDE = 0.72;    // distance parcourue par cycle de marche (2 pas)
const WALK_CLIP = 1.33;
const UP = 1.1, DOWN = 1.9; // se lever, se rasseoir (demi-tour compris)
// en se levant, chacun pousse son fauteuil sur le côté, à l'écart de son chemin
const ROLL = { dev1: [0.32, 0.1], dev2: [0.32, 0.1], dev3: [-0.32, 0.1], sales1: [-0.1, -0.28], sales2: [-0.1, -0.28] };
const SPOTS = {
  coffee: V(1.8, 0.58),      // devant la machine à café (comptoir à droite)
  board: V(2.05, -1.52),     // devant le Kanban
  front: V(0.3, 0.42),       // à l'avant du bureau, face au spectateur
};
const DOOR_IN = V(DOOR.x + 0.35, DOOR.z), DOOR_OUT = V(DOOR.x - 0.45, DOOR.z);

// chorégraphies : ['up', t] se lever · ['go', [points], {walk, exit}] marcher · ['stay', jusqu'à, {anim, face}] · ['down'] se rasseoir
// face : point [x, z] du bureau, ou 'viewer' (le spectateur)
const SCRIPT = {
  dev3: [
    ['up', 3.4], ['go', [SPOTS.coffee]], ['stay', 7.4, { anim: 'Idle_Loop', face: [2.6, 0.45] }],
    ['stay', 9.4, { anim: 'Interact', face: [2.6, 0.45] }], ['stay', 11.6, { anim: 'Idle_Loop', face: 'viewer' }],
    ['go', ['seat']], ['down'],
  ],
  sales2: [
    ['up', 16.2], ['go', [SPOTS.board], { walk: 'Walk_Formal_Loop' }], ['stay', 27.6, { anim: 'Idle_Loop', face: [2.2, -2.0] }],
    ['stay', 31.6, { anim: 'Idle_Talking_Loop', face: 'viewer' }], ['go', ['seat'], { walk: 'Walk_Formal_Loop' }], ['down'],
    ['up', 78.9], ['go', [V(-2.45, 1.15), DOOR_IN, DOOR_OUT], { walk: 'Walk_Formal_Loop', exit: true }],
  ],
  sales1: [
    ['up', 43.6], ['go', [SPOTS.front], { walk: 'Walk_Formal_Loop' }], ['stay', 57.4, { anim: 'Idle_Talking_Loop', face: 'viewer' }],
    ['go', ['seat'], { walk: 'Walk_Formal_Loop' }], ['down'],
    ['up', 79.4], ['go', [V(-2.5, 0.0), V(-2.55, 1.0), DOOR_IN, DOOR_OUT], { walk: 'Walk_Formal_Loop', exit: true }],
  ],
  dev2: [
    ['up', 56.8], ['go', [SPOTS.board]], ['stay', 65.2, { anim: 'Interact', face: [2.2, -2.0] }],
    ['go', ['seat']], ['down'],
  ],
  dev1: [
    ['up', 88.0], ['go', [SPOTS.board]], ['stay', 97.3, { anim: 'Interact', face: [2.2, -2.0] }],
    ['stay', 104, { anim: 'own:Wave', face: 'viewer' }], ['stay', 200, { anim: 'Idle_Loop', face: 'viewer' }],
  ],
};

export class Story {
  constructor({ set, cast, scene, lights, renderer, stage }) {
    Object.assign(this, { set, cast, scene, lights, renderer, stage });
    this.nav = new NavGrid(set.blocked);
    this.chairRest = Object.fromEntries(Object.entries(set.chairs).map(([k, c]) => [k, { p: c.position.clone(), yaw: c.rotation.y }]));
    this.buildChoreography();
    this.lookCur = {};
    this.sunDir = new THREE.Vector3();
  }

  standSpot(k) { return V(SEATS[k].x, SEATS[k].z); }

  // fauteuils comme obstacles : position de repos et position repoussée (prudent : les deux à la fois)
  chairObstacles(except) {
    const out = [];
    for (const k of Object.keys(SEATS)) {
      const s = SEATS[k], [rx, rz] = ROLL[k];
      if (k !== except) out.push({ x: s.x, z: s.z + 0.02, r: 0.17 });
      out.push({ x: s.x + rx, z: s.z + rz, r: 0.16 });
      if (k.startsWith('dev') && k !== except) out.push({ x: s.x, z: s.z + 0.18, r: 0.17 }); // fauteuil pivoté (fin)
    }
    return out;
  }

  buildChoreography() {
    this.phases = {};
    this.exitTime = {};
    for (const [k, script] of Object.entries(SCRIPT)) {
      const ph = [];
      let t = 0, pos = this.standSpot(k), yaw = SEATS[k].yaw;
      ph.push({ kind: 'sit', t0: -1e9 });
      for (const [kind, a, opts = {}] of script) {
        if (kind === 'up') {
          ph[ph.length - 1].t1 = a;
          ph.push({ kind: 'up', t0: a, t1: a + UP, pos: pos.clone(), yaw });
          t = a + UP;
        } else if (kind === 'go') {
          const pts = a.map((p) => (p === 'seat' ? this.standSpot(k) : p));
          const route = this.nav.plan([pos, ...pts], R, 0.03, this.chairObstacles(k));
          const L = route.length, dur = L / SPEED + ACC;
          ph.push({ kind: 'go', t0: t, t1: t + dur, route, L, walk: opts.walk ?? 'Walk_Loop', exit: !!opts.exit, yaw0: yaw });
          if (opts.exit) {
            let d = 0;
            while (d < L && route.point(d).x > DOOR.x + 0.02) d += 0.01;
            this.exitTime[k] = t + this.timeAtDist(d, L, dur);
          }
          pos = route.point(L);
          yaw = yawOf(route.tangent(L, 0.18));
          t += dur;
        } else if (kind === 'stay') {
          ph.push({ kind: 'stay', t0: t, t1: a, pos: pos.clone(), yaw0: yaw, ...opts });
          t = a;
        } else if (kind === 'down') {
          ph.push({ kind: 'down', t0: t, t1: t + DOWN, pos: pos.clone(), yaw0: yaw });
          t += DOWN;
          yaw = SEATS[k].yaw;
          ph.push({ kind: 'sit', t0: t });
        }
      }
      ph[ph.length - 1].t1 ??= 1e9;
      this.phases[k] = ph;
    }
    for (const k of Object.keys(SEATS)) if (!this.phases[k]) this.phases[k] = [{ kind: 'sit', t0: -1e9, t1: 1e9 }];
  }

  // trapèze de vitesse : accélère, avance, freine
  distAt(u, L, dur) {
    if (u <= 0) return 0;
    if (u >= dur) return L;
    if (u < ACC) return SPEED * u * u / (2 * ACC);
    if (u > dur - ACC) return L - SPEED * (dur - u) ** 2 / (2 * ACC);
    return SPEED * ACC / 2 + SPEED * (u - ACC);
  }
  timeAtDist(d, L, dur) { let lo = 0, hi = dur; for (let i = 0; i < 30; i++) { const m = (lo + hi) / 2; if (this.distAt(m, L, dur) < d) lo = m; else hi = m; } return lo; }
  phaseAt(k, t) { const ph = this.phases[k]; for (const p of ph) if (t >= p.t0 && t < p.t1) return p; return ph[ph.length - 1]; }
  seatedAt(k, t) { return this.phaseAt(k, t).kind === 'sit'; }

  evaluate(t, dt, head, headDir) {
    if (this.debug) return this.debug(t, this);
    this.t = t;
    this.head = head;
    this.lighting(t);
    this.screens(t, dt);
    this.chairs(t);
    for (const k of Object.keys(SEATS)) this.person(k, t, dt, head);
  }

  // --- lumière : froide et terne (avant), claire (maintenant), dorée (le futur) -------------------------
  lighting(t) {
    const { hemi, sun, fill, backdrop } = this.lights;
    const a2 = smooth(T.act2, T.act2 + 6, t), a3 = smooth(T.act3, T.act3 + 5, t);
    const mix3 = (c1, c2, c3) => new THREE.Color(c1).lerp(new THREE.Color(c2), a2).lerp(new THREE.Color(c3), a3);
    hemi.color.copy(mix3(0xaab4d0, 0xf4f2ff, 0xffe2c4));
    hemi.groundColor.copy(mix3(0x1c1e30, 0x3a3550, 0x40304a));
    hemi.intensity = THREE.MathUtils.lerp(THREE.MathUtils.lerp(1.0, 1.7, a2), 1.45, a3);
    sun.color.copy(mix3(0xb8c6ff, 0xfff3e2, 0xffb36e));
    sun.intensity = THREE.MathUtils.lerp(THREE.MathUtils.lerp(1.1, 2.6, a2), 2.4, a3);
    fill.intensity = THREE.MathUtils.lerp(0.5, 0.8, a2);
    // le soleil entre par les fenêtres du fond ; il descend vers l'horizon dans le dernier acte
    this.sunDir.set(-0.5, 1.0, 0.75).lerp(new THREE.Vector3(-1.0, 0.5, 0.45), a3).normalize(); // avant-gauche, plus rasant à la fin
    const root = this.set.root;
    const c = root.getWorldPosition(new THREE.Vector3()), s = root.getWorldScale(new THREE.Vector3()).x;
    sun.position.copy(c).addScaledVector(this.sunDir, 12 * s);
    sun.target.position.copy(c);
    const sh = sun.shadow.camera, r = 4.3 * s;
    if (sh.right !== r) { sh.left = sh.bottom = -r; sh.right = sh.top = r; sh.near = 0.5 * s; sh.far = 25 * s; sh.updateProjectionMatrix(); }
    backdrop.material.uniforms.top.value.copy(BRAND.navy).lerp(new THREE.Color(0x0b1a6e), a2).lerp(new THREE.Color(0x2d1f5c), a3);
    // fondus d'ouverture et de fin
    const fade = smooth(0, 2.2, t) * (1 - smooth(T.fadeOut[0], T.fadeOut[1], t));
    this.renderer.toneMappingExposure = (THREE.MathUtils.lerp(0.85, 1.12, a2)) * (this.exposureBoost ?? 1) * fade + 0.0001;
    this.fade = fade;
  }

  // --- écrans : tableaux de bord, puis code qui défile dès que l'IA est passée ----------------------------
  screens(t, dt) {
    const set = this.set;
    for (const s of set.screens) {
      const i = ['dev1', 'dev2', 'dev3'].indexOf(s.key);
      let coding;
      if (i >= 0) coding = t >= T.orbVisit[i] && t < T.act3 + 1 || t > 90;
      else coding = t > 52 && t < T.act3 + 1;
      const map = coding ? set.code[i >= 0 ? i : (s.key === 'sales1' ? 3 : 4)] : (s.mat.userData.dash ??= s.mat.map);
      if (s.mat.map !== map) { s.mat.map = map; s.mat.needsUpdate = true; }
      if (coding) map.offset.y = (map.offset.y - dt * (t < T.act3 ? 0.35 : 0.2)) % 1;
      // flash au moment où l'IA touche l'écran
      const flash = i >= 0 ? pulse(T.orbVisit[i] - 0.15, T.orbVisit[i], T.orbVisit[i] + 0.1, T.orbVisit[i] + 0.6, t) : 0;
      s.mat.color.setScalar(1 + flash * 1.5);
      // en « avant », les écrans sont un peu ternes
      s.mat.color.multiplyScalar(THREE.MathUtils.lerp(0.82, 1, smooth(T.act2, T.act2 + 4, t)));
    }
  }


  // --- fauteuils : repoussés quand on se lève, ramenés quand on se rassoit ; pivot des développeurs à la fin -------------
  rollAmount(k, t) {
    let w = 0;
    for (const p of this.phases[k]) {
      if (p.kind === 'up' && t >= p.t0) w = smooth(p.t0 + 0.1, p.t0 + 0.9, t);
      if (p.kind === 'down' && t >= p.t0) w = 1 - smooth(p.t0 + 0.9, p.t1, t);
    }
    return w;
  }
  swivel(k, t) { return k.startsWith('dev') && this.seatedAt(k, T.swivel[1]) ? smooth(T.swivel[0] + 0.4, T.swivel[1], t) : 0; }

  chairs(t) {
    for (const [k, c] of Object.entries(this.set.chairs)) {
      const rest = this.chairRest[k], [rx, rz] = ROLL[k];
      const w = this.rollAmount(k, t);
      c.position.copy(rest.p).add(V(rx * w, rz * w));
      c.rotation.y = rest.yaw + 0.35 * w * Math.sign(rx || 1);
      if (this.swivel(k, t) > 0 || (k.startsWith('dev') && this.seatedAt(k, T.swivel[1]) && t > T.swivel[0])) {
        c.position.z += 0.16 * smooth(T.swivel[0], T.swivel[0] + 0.6, t);
        c.rotation.y += Math.PI * this.swivel(k, t);
      }
    }
  }

  // pose assise : le bassin se pose sur l'assise du fauteuil
  sit(p, chairPos, w = 1) {
    if (w <= 0) return;
    p.root.updateMatrixWorld(true);
    const pel = this.set.root.worldToLocal(p.bones.get('Hips').getWorldPosition(new THREE.Vector3()));
    const fwd = new THREE.Vector3(Math.sin(p.root.rotation.y), 0, Math.cos(p.root.rotation.y));
    const target = new THREE.Vector3(chairPos.x, SEAT_Y + 0.07, chairPos.z).addScaledVector(fwd, 0.02);
    p.root.position.add(target.sub(pel).multiplyScalar(w));
  }

  // regard lissé (la tête glisse vers sa cible)
  look(k, p, target, dt, w = 0.85) {
    if (!target) return;
    const cur = this.lookCur[k] ??= target.clone();
    if (dt > 0.5) cur.copy(target); else cur.lerp(target, 1 - Math.exp(-dt * 4));
    p.lookAt(cur, w, 1.0);
  }

  officeToWorld(x, y, z) { return this.set.root.localToWorld(new THREE.Vector3(x, y, z)); }
  headOffice(head) { return this.set.root.worldToLocal(head.clone()); }

  // --- un personnage à l'instant t ----------------------------------------------------------------------------
  person(k, t, dt, head) {
    const p = this.cast[k];
    const ph = this.phaseAt(k, t);
    p.root.visible = !(this.exitTime[k] !== undefined && t >= this.exitTime[k]);
    if (!p.root.visible) return;
    if (ph.kind === 'sit') return k.startsWith('dev') ? this.seatedDev(k, t, dt, head) : this.seatedSales(k, t, dt, head);
    const s = SEATS[k], ev = this.events;
    const chairPos = this.chairRest[k].p;
    let target = null, lookW = 0.75;

    if (ph.kind === 'up') {
      // se lève de son fauteuil (qui part sur le côté)
      p.root.position.copy(ph.pos);
      p.root.rotation.y = s.yaw;
      p.pose([['Sitting_Exit', Math.min(1.029, (t - ph.t0) * 1.03 / UP), 1]]);
      this.sit(p, chairPos, 1 - smooth(ph.t0, ph.t0 + UP * 0.95, t));
      target = this.officeToWorld(s.x + Math.sin(s.yaw) * 0.8, 0.5, s.z + Math.cos(s.yaw) * 0.8);
    } else if (ph.kind === 'go') {
      const dur = ph.t1 - ph.t0, d = this.distAt(t - ph.t0, ph.L, dur);
      const pos = ph.route.point(d);
      const tan = ph.route.tangent(THREE.MathUtils.clamp(d, 0.15, ph.L - 0.15), 0.18);
      p.root.position.copy(pos);
      p.root.rotation.y = lerpAngle(ph.yaw0, yawOf(tan), smooth(ph.t0, ph.t0 + 0.6, t));
      const speed = (this.distAt(t - ph.t0 + 0.05, ph.L, dur) - this.distAt(t - ph.t0 - 0.05, ph.L, dur)) / 0.1;
      const w = THREE.MathUtils.clamp(speed / SPEED, 0, 1);
      // les pas suivent la distance parcourue (pas de glissade)
      p.pose([['Idle_Loop', t, 1 - w], [ph.walk, (d / STRIDE) * WALK_CLIP, w]]);
      const ahead = ph.route.point(d + 0.6);
      target = this.officeToWorld(ahead.x, 0.7, ahead.z);
      if (k === 'sales1' && ph.exit && t > ph.t0 + 1.2 && t < ph.t0 + 2.6) target = head; // un regard au spectateur en sortant
    } else if (ph.kind === 'stay') {
      p.root.position.copy(ph.pos);
      const hl = this.headOffice(head);
      const faceYaw = ph.face === 'viewer' ? yawOf(hl.clone().sub(ph.pos).setY(0)) : yawOf(V(ph.face[0], ph.face[1]).sub(ph.pos));
      p.root.rotation.y = lerpAngle(ph.yaw0, faceYaw, smooth(ph.t0, ph.t0 + 0.7, t));
      const dur = p.clipDur(ph.anim);
      const tt = ph.anim === 'Interact' ? ((t - ph.t0) % dur) : t - ph.t0;
      const blendIn = smooth(ph.t0, ph.t0 + 0.35, t);
      // animation d'origine (salut) : jouée par-dessus la pose de repos (les os qu'elle n'anime pas restent naturels)
      const own = ph.anim.startsWith('own:');
      p.pose([['Idle_Loop', t, own ? 1 : 1 - blendIn], [ph.anim, tt, blendIn]]);
      target = ph.face === 'viewer' ? head : this.officeToWorld(ph.face[0], 0.65, ph.face[1]);
      if (ev && k === 'sales2' && t > 30.8 && t < 33.6) target = ev.orbWorld();                    // l'IA arrive !
      if (ev && k === 'sales1') target = ev.appWorld(Math.floor(t / 1.8) % 4);                     // elle présente chaque application
      if (ev && k === 'dev1' && t > 91.6 && t < 96.5) target = t % 3 < 1.6 ? ev.boardWorld() : head; // les projets arrivent
      lookW = 0.85;
    } else if (ph.kind === 'down') {
      // demi-tour, puis s'assoit ; le fauteuil revient sous lui
      const u = t - ph.t0;
      p.root.position.copy(ph.pos);
      p.root.rotation.y = lerpAngle(ph.yaw0, s.yaw, smooth(0, 0.6, u));
      const sitT = Math.max(0, u - 0.6);
      p.pose([['Idle_Loop', t, 1 - smooth(0.5, 0.8, u)], ['Sitting_Enter', Math.min(1.29, sitT * 1.3 / (DOWN - 0.6)), smooth(0.5, 0.8, u)]]);
      this.sit(p, chairPos, smooth(0.6, DOWN, u));
      target = this.officeToWorld(s.x + Math.sin(s.yaw) * 0.8, 0.5, s.z + Math.cos(s.yaw) * 0.8);
    }
    this.look(k, p, target, dt, lookW);
  }

  // --- développeurs, assis ----------------------------------------------------------------------------------------
  seatedDev(k, t, dt, head) {
    const p = this.cast[k], s = SEATS[k], i = ['dev1', 'dev2', 'dev3'].indexOf(k);
    const chair = this.set.chairs[k];
    const sw = this.swivel(k, t);
    p.root.position.set(chair.position.x, 0, chair.position.z);
    p.root.rotation.y = s.yaw + Math.PI * sw;
    const ev = this.events;
    // frappe : lente avant, rapide après le passage de l'IA ; pause pour regarder les merveilles
    const watchOrb = pulse(31, 32, 37.5, T.orbVisit[i] - 0.4, t);
    const watchApps = pulse(T.appsOut[0] + 0.3 + i * 0.2, T.appsOut[0] + 1.2, T.appsOut[1], T.appsOut[1] + 1, t);
    const watchCity = pulse(66.5, 67.5, 89, 90.5, t);
    const watchMate = pulse(18.4, 19.0, 21.5, 22.5, t) * (k === 'dev2' ? 1 : 0); // le commercial passe derrière lui
    const type = (1 - watchOrb) * (1 - watchApps) * (1 - watchCity) * (1 - watchMate) * (1 - smooth(T.swivel[0], T.swivel[0] + 0.4, t));
    const talk = Math.max(watchApps, watchCity * 0.6, pulse(58.3, 59, 62, 63, t) * (k === 'dev2' ? 0 : 1));
    const phase = i * 0.37;
    const layers = [['Sitting_Idle_Loop', t + phase, 1 - talk], ['Sitting_Talking_Loop', t + phase, talk]];
    // acclamation finale : on salue le spectateur (bras seuls, toujours assis)
    const cheer = sw > 0 ? smooth(T.swivel[1] - 0.2, T.swivel[1] + 0.4, t) : 0;
    if (cheer > 0) layers.push(['own:Wave', (t - T.swivel[1]) * (0.9 + i * 0.12) + i * 0.3, cheer, 'arms']);
    p.pose(layers);
    this.sit(p, chair.position);
    // mains sur le clavier
    const speed = t < T.act2 ? 5 : 12;
    const kb = new THREE.Vector3(s.x, 0.405, s.z - 0.33);
    const tapL = Math.max(0, Math.sin(t * speed + i)) * 0.012, tapR = Math.max(0, Math.sin(t * speed * 1.13 + i + 1.7)) * 0.012;
    const L = this.officeToWorld(kb.x - 0.06, kb.y + tapL, kb.z + 0.03), Rr = this.officeToWorld(kb.x + 0.06, kb.y + tapR, kb.z + 0.03);
    const poleL = this.officeToWorld(s.x - 0.32, 0.25, s.z + 0.05), poleR = this.officeToWorld(s.x + 0.32, 0.25, s.z + 0.05);
    // juste après s'être rassis, les mains reviennent progressivement au clavier
    const back = this.phases[k].filter((q) => q.kind === 'sit' && q.t0 > 0 && t >= q.t0).pop();
    p.hands(L, Rr, poleL, poleR, type * (back ? smooth(back.t0, back.t0 + 0.8, t) : 1));
    // regard
    let target = this.officeToWorld(s.x, 0.6, s.z - 0.55); // son écran
    if (watchMate > 0.3) target = this.cast.sales2.root.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(0, 0.12, 0));
    if (ev && watchOrb > 0.3) target = ev.orbWorld();
    if (ev && t > T.orbVisit[i] - 0.5 && t < T.orbVisit[i] + 1.2) target = ev.orbWorld();
    if (ev && watchApps > 0.3) target = ev.appWorld(i);
    if (ev && t > 61.8 && t < 64.8 && k !== 'dev2') target = this.cast.dev2.root.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(0, 0.12, 0));
    if (ev && watchCity > 0.3) target = t > 79 && t < 85.5 ? this.cast.sales2.root.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(0, 0.1, 0)) : ev.cityWorld(i * 4 + 1);
    if (ev && t > 91.5 && t < T.swivel[0]) target = ev.boardWorld();
    if (t > T.swivel[1] - 0.3 && sw > 0) target = head;
    this.look(k, p, target, dt);
  }

  // --- commerciaux, assis -----------------------------------------------------------------------------------------
  seatedSales(k, t, dt, head) {
    const p = this.cast[k], s = SEATS[k];
    const chair = this.set.chairs[k];
    const ev = this.events;
    p.root.position.set(chair.position.x, 0, chair.position.z);
    p.root.rotation.y = s.yaw;
    const talk = pulse(67.5, 68.5, 77.5, 78.5, t) * 0.7 + (k === 'sales2' ? pulse(49.6, 50.5, 57.2, 58.2, t) : 0);
    p.pose([['Sitting_Idle_Loop', t + (k === 'sales1' ? 0.6 : 0), 1 - talk], ['Sitting_Talking_Loop', t, talk]]);
    this.sit(p, chair.position);
    // elle travaille sur son portable (avant) ; lui attend des projets
    const type = k === 'sales1' ? (1 - pulse(16.6, 17.4, 28, 29, t)) * (1 - smooth(30.8, 31.6, t)) : 0;
    const lap = new THREE.Vector3(s.x + 0.3, 0.405, s.z);
    const tap = (o) => Math.max(0, Math.sin(t * 4 + o)) * 0.01;
    p.hands(this.officeToWorld(lap.x, lap.y + tap(0), lap.z - 0.055), this.officeToWorld(lap.x, lap.y + tap(1.9), lap.z + 0.055),
      this.officeToWorld(s.x + 0.05, 0.25, s.z - 0.3), this.officeToWorld(s.x + 0.05, 0.25, s.z + 0.3), type);
    let target = k === 'sales1' ? this.officeToWorld(s.x + 0.4, 0.5, s.z) : this.officeToWorld(s.x + 1.2, 0.45, s.z - 0.3);
    if (k === 'sales1' && t > 16.5 && t < 29) target = this.cast.sales2.root.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(0, 0.12, 0));
    if (ev && t > 31 && t < 37.5) target = ev.orbWorld();
    if (ev && t > 47 && t < 58) target = k === 'sales2' ? this.cast.sales1.root.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(0, 0.12, 0)) : ev.appWorld(3);
    if (ev && t > 66.8 && t < 78.5) target = ev.cityWorld(k === 'sales1' ? 6 : 10);
    if (t > 64.5 && t < 66.5) target = head;
    this.look(k, p, target, dt);
  }
}
