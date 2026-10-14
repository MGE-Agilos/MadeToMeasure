import * as THREE from 'three';
import { NavGrid } from './nav.js';
import { SEATS, DOOR, BRAND } from './office.js';

// Mise en scène de « Made to Measure ». evaluate(t) place chaque élément à l'instant t (secondes du film).
//  ACT 1 — BEFORE      0 – 30,5   bureau BI, lumière froide, tableaux de bord Qlik / Power BI, projets rares
//  ACT 2 — NOW        30,5 – 63,5 l'assistant IA arrive, les écrans codent, les applications se construisent
//  ACT 3 — THE FUTURE 63,5 – 117  la ville des clients, les concurrents, les commerciaux sortent ; projets gagnés
// (les effets autour du spectateur sont dans events.js)
export const DURATION = 117;

const smooth = (a, b, x) => { const t = THREE.MathUtils.clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const pulse = (a, b, c, d, x) => smooth(a, b, x) * (1 - smooth(c, d, x)); // monte de a à b, redescend de c à d
const lerpAngle = (a, b, k) => a + Math.atan2(Math.sin(b - a), Math.cos(b - a)) * k;
const yawOf = (v) => Math.atan2(v.x, v.z);

export const T = {
  act2: 30.5, act3: 63.5,
  orbVisit: [38.6, 40.1, 41.6],          // l'IA passe d'un poste à l'autre : l'écran se met à coder
  appsOut: [49.4, 57.6],                 // les applications tournent autour du spectateur
  stand: { sales2: 78.9, sales1: 79.4 }, // les commerciaux se lèvent…
  walk: { sales2: 80.1, sales1: 80.8 },  // … et partent
  swivel: [95.4, 97.0],                  // les développeurs se retournent vers le spectateur
  fadeOut: [112, 116.5],
};
const SEAT_Y = 0.255;   // dessus de l'assise des fauteuils de bureau
const ROLL = { x: 0.1, z: 0.28 }; // les commerciaux repoussent leur fauteuil sur le côté (à l'écart du chemin)
const SPEED = 0.55;     // vitesse de marche (unités/s)
const STRIDE = 0.72;    // distance parcourue par cycle de marche (2 pas)
const WALK_CLIP = 1.33;

export class Story {
  constructor({ set, cast, scene, lights, renderer, stage }) {
    Object.assign(this, { set, cast, scene, lights, renderer, stage });
    this.nav = new NavGrid(set.blocked);
    // positions de départ des fauteuils
    this.chairRest = Object.fromEntries(Object.entries(set.chairs).map(([k, c]) => [k, { p: c.position.clone(), yaw: c.rotation.y }]));
    // trajets des commerciaux jusqu'à la porte, planifiés autour des meubles (et des fauteuils reculés)
    const rolled = (k) => { const s = SEATS[k]; return { x: s.x - ROLL.x, z: s.z - ROLL.z, r: 0.15 }; };
    const R = 0.13;
    const doorIn = new THREE.Vector3(DOOR.x + 0.35, 0, DOOR.z), doorOut = new THREE.Vector3(DOOR.x - 0.45, 0, DOOR.z);
    this.routes = {
      sales2: this.nav.plan([new THREE.Vector3(SEATS.sales2.x, 0, SEATS.sales2.z), new THREE.Vector3(-2.45, 0, 1.15), doorIn, doorOut], R, 0.03, [rolled('sales2')]),
      sales1: this.nav.plan([new THREE.Vector3(SEATS.sales1.x, 0, SEATS.sales1.z), new THREE.Vector3(-2.5, 0, 0.0), new THREE.Vector3(-2.55, 0, 1.0), doorIn, doorOut], R, 0.03, [rolled('sales1'), rolled('sales2')]),
    };
    // instant où chacun franchit la porte (il disparaît dans un éclat de lumière : events.js lance sa comète)
    this.exitTime = {};
    for (const k of ['sales1', 'sales2']) {
      const r = this.routes[k];
      let d = 0;
      while (d < r.length && r.point(d).x > DOOR.x + 0.02) d += 0.01;
      this.exitTime[k] = this.walkTimeFor(k, d);
    }
    this.lookCur = {};
    this.sunDir = new THREE.Vector3();
  }

  // distance parcourue (avec démarrage progressif) → instant
  walkDist(k, t) {
    const t0 = T.walk[k], acc = 0.5;
    const u = t - t0;
    if (u <= 0) return 0;
    return u < acc ? SPEED * u * u / (2 * acc) : SPEED * (acc / 2 + (u - acc));
  }
  walkTimeFor(k, d) { const acc = 0.5, dAcc = SPEED * acc / 2; return T.walk[k] + (d < dAcc ? Math.sqrt(2 * acc * d / SPEED) : acc + (d - dAcc) / SPEED); }

  evaluate(t, dt, head, headDir) {
    if (this.debug) return this.debug(t, this);
    this.t = t;
    this.head = head;
    this.lighting(t);
    this.screens(t, dt);
    this.chairs(t);
    for (const k of ['dev1', 'dev2', 'dev3']) this.dev(k, t, dt, head);
    for (const k of ['sales1', 'sales2']) this.sales(k, t, dt, head);
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

  // --- fauteuils : ceux des commerciaux reculent quand ils se lèvent ; ceux des développeurs pivotent ----------------
  chairs(t) {
    for (const [k, c] of Object.entries(this.set.chairs)) {
      const rest = this.chairRest[k];
      c.position.copy(rest.p);
      c.rotation.y = rest.yaw;
      if (k.startsWith('sales')) {
        const back = smooth(T.stand[k] + 0.1, T.stand[k] + 0.9, t);
        c.position.x -= ROLL.x * back; c.position.z -= ROLL.z * back;
        c.rotation.y += 0.35 * back * (k === 'sales1' ? 1 : -1);
      } else {
        const sw = this.swivel(t);
        c.position.z += 0.16 * smooth(T.swivel[0], T.swivel[0] + 0.6, t);
        c.rotation.y += Math.PI * sw;
      }
    }
  }
  swivel(t) { return smooth(T.swivel[0] + 0.4, T.swivel[1], t); }

  // pose assise : le bassin se pose sur l'assise du fauteuil
  sit(p, chair, w = 1) {
    p.root.updateMatrixWorld(true);
    const pel = this.set.root.worldToLocal(p.bones.get('Hips').getWorldPosition(new THREE.Vector3()));
    const fwd = new THREE.Vector3(Math.sin(p.root.rotation.y), 0, Math.cos(p.root.rotation.y));
    const target = new THREE.Vector3(chair.position.x, SEAT_Y + 0.07, chair.position.z).addScaledVector(fwd, 0.02);
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

  // --- développeurs -------------------------------------------------------------------------------------
  dev(k, t, dt, head) {
    const p = this.cast[k], s = SEATS[k], i = ['dev1', 'dev2', 'dev3'].indexOf(k);
    const chair = this.set.chairs[k];
    const sw = this.swivel(t);
    p.root.position.set(chair.position.x, 0, chair.position.z);
    p.root.rotation.y = s.yaw + Math.PI * sw;
    const ev = this.events;
    // frappe : lente avant, rapide après le passage de l'IA ; pause pour regarder les merveilles
    const watchOrb = pulse(31, 32, 37.5, T.orbVisit[i] - 0.4, t);
    const watchApps = pulse(T.appsOut[0] + 0.3 + i * 0.2, T.appsOut[0] + 1.2, T.appsOut[1], T.appsOut[1] + 1, t);
    const watchCity = pulse(66.5, 67.5, 89, 90.5, t);
    const type = (1 - watchOrb) * (1 - watchApps) * (1 - watchCity) * (1 - smooth(T.swivel[0], T.swivel[0] + 0.4, t));
    const talk = Math.max(watchApps, watchCity * 0.6, pulse(58.3, 59, 62, 63, t));
    const phase = i * 0.37;
    const layers = [['Sitting_Idle_Loop', t + phase, 1 - talk], ['Sitting_Talking_Loop', t + phase, talk]];
    // acclamation finale : on salue le spectateur (bras seuls, toujours assis)
    const cheer = smooth(T.swivel[1] - 0.2, T.swivel[1] + 0.4, t);
    if (cheer > 0) layers.push(['own:Wave', (t - T.swivel[1]) * (0.9 + i * 0.12) + i * 0.3, cheer, 'arms']);
    p.pose(layers);
    this.sit(p, chair);
    // mains sur le clavier
    const speed = t < T.act2 ? 5 : 12;
    const kb = new THREE.Vector3(s.x, 0.405, s.z - 0.33);
    const tapL = Math.max(0, Math.sin(t * speed + i)) * 0.012, tapR = Math.max(0, Math.sin(t * speed * 1.13 + i + 1.7)) * 0.012;
    const L = this.officeToWorld(kb.x - 0.06, kb.y + tapL, kb.z + 0.03), Rr = this.officeToWorld(kb.x + 0.06, kb.y + tapR, kb.z + 0.03);
    const poleL = this.officeToWorld(s.x - 0.32, 0.25, s.z + 0.05), poleR = this.officeToWorld(s.x + 0.32, 0.25, s.z + 0.05);
    // les cibles sont « derrière » le développeur quand il a pivoté : la frappe est coupée avant
    p.hands(L, Rr, poleL, poleR, type);
    // regard
    let target = this.officeToWorld(s.x, 0.6, s.z - 0.55); // son écran
    if (ev && watchOrb > 0.3) target = ev.orbWorld();
    if (ev && t > T.orbVisit[i] - 0.5 && t < T.orbVisit[i] + 1.2) target = ev.orbWorld();
    if (ev && watchApps > 0.3) target = ev.appWorld(i);
    if (ev && watchCity > 0.3) target = t > 79 && t < 85.5 ? this.cast.sales2.root.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(0, 0.1, 0)) : ev.cityWorld(i * 4 + 1);
    if (ev && t > 91.5 && t < T.swivel[0]) target = ev.boardWorld();
    if (t > T.swivel[1] - 0.3) target = head;
    this.look(k, p, target, dt);
  }

  // --- commerciaux --------------------------------------------------------------------------------------
  sales(k, t, dt, head) {
    const p = this.cast[k], s = SEATS[k];
    const chair = this.set.chairs[k];
    const ev = this.events;
    const stand = T.stand[k], walk0 = T.walk[k];
    p.root.visible = t < this.exitTime[k];
    if (!p.root.visible) return;
    if (t < stand) {
      // assis à son poste
      p.root.position.set(chair.position.x, 0, chair.position.z);
      p.root.rotation.y = s.yaw;
      const talk = pulse(49.6, 50.5, 57.2, 58.2, t) + pulse(67.5, 68.5, 77.5, 78.5, t) * 0.7;
      p.pose([['Sitting_Idle_Loop', t + (k === 'sales1' ? 0.6 : 0), 1 - talk], ['Sitting_Talking_Loop', t, talk]]);
      this.sit(p, chair);
      // elle travaille sur son portable (avant) ; lui attend des projets
      const type = k === 'sales1' ? (1 - pulse(22.6, 23.4, 28, 29, t)) * (1 - smooth(30.8, 31.6, t)) : 0;
      const lap = new THREE.Vector3(s.x + 0.3, 0.405, s.z);
      const tap = (o) => Math.max(0, Math.sin(t * 4 + o)) * 0.01;
      p.hands(this.officeToWorld(lap.x, lap.y + tap(0), lap.z - 0.055), this.officeToWorld(lap.x, lap.y + tap(1.9), lap.z + 0.055),
        this.officeToWorld(s.x + 0.05, 0.25, s.z - 0.3), this.officeToWorld(s.x + 0.05, 0.25, s.z + 0.3), type);
      let target = k === 'sales1' ? this.officeToWorld(s.x + 0.4, 0.5, s.z) : this.officeToWorld(s.x + 1.2, 0.45, s.z - 0.3);
      if (ev && t > 21.5 && t < 29.5) target = ev.boardWorld();
      if (ev && t > 31 && t < 37.5) target = ev.orbWorld();
      if (ev && t > 47 && t < 58) target = ev.appWorld(k === 'sales1' ? 3 : 1);
      if (ev && t > 66.8 && t < 78.5) target = ev.cityWorld(k === 'sales1' ? 6 : 10);
      if (t > 64.5 && t < 66.5) target = head;
      this.look(k, p, target, dt);
      return;
    }
    // se lève, puis marche vers la porte en suivant son trajet planifié
    const r = this.routes[k];
    const d = this.walkDist(k, t);
    const pos = r.point(d);
    const tan = r.tangent(Math.max(d, 0.15), 0.18);
    const up = smooth(stand, stand + 1.0, t);
    const walkW = smooth(walk0 - 0.1, walk0 + 0.35, t);
    let yaw = lerpAngle(s.yaw, yawOf(tan), smooth(walk0 - 0.3, walk0 + 0.5, t));
    const exitT = Math.min(1.03 - 1e-3, (t - stand) * 1.03 / 1.1);
    const layers = t < walk0 ? [['Sitting_Exit', exitT, 1]] : [['Idle_Loop', t, 1 - walkW], ['Walk_Formal_Loop', (d / STRIDE) * WALK_CLIP, walkW]];
    if (t >= walk0 && t < walk0 + 0.4) layers.unshift(['Sitting_Exit', 1.02, 1 - walkW]);
    const rest = this.chairRest[k].p, start = r.point(0);
    if (t < walk0) p.root.position.set(THREE.MathUtils.lerp(rest.x, start.x, up), 0, THREE.MathUtils.lerp(rest.z, start.z, up));
    else p.root.position.copy(pos);
    p.root.rotation.y = yaw;
    p.pose(layers);
    // pendant le lever, le bassin quitte l'assise
    if (t < walk0 + 0.4) this.sit(p, { position: rest }, 1 - smooth(stand, stand + 1.05, t));
    // il / elle regarde où il va, puis la porte ; un regard au spectateur en passant
    const ahead = r.point(d + 0.6);
    let target = this.officeToWorld(ahead.x, 0.7, ahead.z);
    if (k === 'sales1' && t > walk0 + 1.2 && t < walk0 + 2.6) target = head;
    this.look(k, p, target, dt, 0.7);
  }
}
