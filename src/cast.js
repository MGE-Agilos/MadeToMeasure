import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';

// Personnages de « Made to Measure » (Quaternius, CC0) : deux commerciaux en costume, trois développeurs.
// Leurs propres animations (marche, salut…) sont complétées par la bibliothèque Quaternius UAL (assis, parler,
// marche « formelle », danse…), transférée sur leur squelette en espace « modèle » (même méthode que La Lanterne).

const gltf = new GLTFLoader();
const _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _v = new THREE.Vector3();
export const HEIGHT = 0.86; // unités du kit (échelle 1:2)

// os UAL → os Quaternius (les points des noms sont retirés par three.js : « UpperArm.L » → « UpperArmL »)
const MAP = { pelvis: 'Hips', spine_01: 'Abdomen', spine_02: 'Torso', spine_03: 'Chest', neck_01: 'Neck', head: 'Head' };
for (const [s, S] of [['l', 'L'], ['r', 'R']]) {
  Object.assign(MAP, { [`clavicle_${s}`]: `Shoulder${S}`, [`upperarm_${s}`]: `UpperArm${S}`, [`lowerarm_${s}`]: `LowerArm${S}`, [`hand_${s}`]: `Wrist${S}`,
    [`thigh_${s}`]: `UpperLeg${S}`, [`calf_${s}`]: `LowerLeg${S}`, [`foot_${s}`]: `Foot${S}` });
  for (const [f, F] of [['index', 'Index'], ['middle', 'Middle'], ['ring', 'Ring'], ['pinky', 'Pinky'], ['thumb', 'Thumb']]) for (const k of [1, 2, 3]) MAP[`${f}_0${k}_${s}`] = `${F}${k}${S}`;
}
// segment de chaque os (vers son enfant), pour aligner les poses de référence
const CHILD = { pelvis: 'spine_01', spine_01: 'spine_02', spine_02: 'spine_03', spine_03: 'neck_01', neck_01: 'head' };
for (const s of ['l', 'r']) {
  Object.assign(CHILD, { [`clavicle_${s}`]: `upperarm_${s}`, [`upperarm_${s}`]: `lowerarm_${s}`, [`lowerarm_${s}`]: `hand_${s}`, [`hand_${s}`]: `middle_01_${s}`,
    [`thigh_${s}`]: `calf_${s}`, [`calf_${s}`]: `foot_${s}` });
  for (const f of ['index', 'middle', 'ring', 'pinky', 'thumb']) { CHILD[`${f}_01_${s}`] = `${f}_02_${s}`; CHILD[`${f}_02_${s}`] = `${f}_03_${s}`; }
}

const modelQuat = (obj, rootInvQ, out) => out.copy(rootInvQ).multiply(obj.getWorldQuaternion(_q2));

class Retargeter {
  constructor(src, tgt) {
    this.src = src; this.tgt = tgt;
    src.updateMatrixWorld(true); tgt.updateMatrixWorld(true);
    this.srcInv = src.getWorldQuaternion(new THREE.Quaternion()).invert();
    this.tgtInv = tgt.getWorldQuaternion(new THREE.Quaternion()).invert();
    const srcBones = new Map(); src.traverse((o) => { if (o.isBone) srcBones.set(o.name === 'Head' ? 'head' : o.name, o); });
    const tgtBones = new Map(); tgt.traverse((o) => { if (o.isBone) tgtBones.set(o.name, o); });
    this.bones = tgtBones;
    const posIn = (o, root) => root.worldToLocal(o.getWorldPosition(new THREE.Vector3()));
    this.items = [];
    for (const [sName, tName] of Object.entries(MAP)) {
      const s = srcBones.get(sName), bone = tgtBones.get(tName);
      if (!s || !bone) continue;
      const tgtRest = modelQuat(bone, this.tgtInv, new THREE.Quaternion());
      const item = { bone, src: s, parent: bone.parent, srcRestInv: modelQuat(s, this.srcInv, new THREE.Quaternion()).invert() };
      const c = CHILD[sName], tc = c && tgtBones.get(MAP[c]), sc = c && srcBones.get(c);
      const swing = new THREE.Quaternion();
      if (tc && sc) swing.setFromUnitVectors(posIn(tc, tgt).sub(posIn(bone, tgt)).normalize(), posIn(sc, src).sub(posIn(s, src)).normalize());
      item.tgtRef = swing.multiply(tgtRest);
      this.items.push(item);
    }
    const depth = (o) => { let d = 0; while (o.parent) { d++; o = o.parent; } return d; };
    this.items.sort((a, b) => depth(a.bone) - depth(b.bone));
    this.modelQ = new Map();
    this.srcPelvis = srcBones.get('pelvis'); this.tgtPelvis = tgtBones.get('Hips');
    this.srcPelvisRest = posIn(this.srcPelvis, src); this.tgtPelvisRest = posIn(this.tgtPelvis, tgt);
    this.legRatio = this.tgtPelvisRest.y / this.srcPelvisRest.y;
  }

  apply() {
    this.src.updateMatrixWorld(true);
    this.tgt.updateWorldMatrix(true, false);
    this.tgtInv.copy(this.tgt.getWorldQuaternion(_q)).invert();
    this.srcInv.copy(this.src.getWorldQuaternion(_q)).invert();
    const mq = this.modelQ;
    mq.clear();
    for (const it of this.items) {
      const parentQ = mq.get(it.parent) ?? modelQuat(it.parent, this.tgtInv, new THREE.Quaternion());
      const q = modelQuat(it.src, this.srcInv, new THREE.Quaternion()).multiply(it.srcRestInv).multiply(it.tgtRef);
      it.bone.quaternion.copy(parentQ.clone().invert().multiply(q));
      mq.set(it.bone, q);
    }
    const sp = this.src.worldToLocal(this.srcPelvis.getWorldPosition(_v));
    const target = this.tgtPelvisRest.clone().add(sp.sub(this.srcPelvisRest).multiplyScalar(this.legRatio));
    this.tgt.localToWorld(target);
    this.tgtPelvis.parent.updateMatrixWorld(true);
    this.tgtPelvis.position.copy(this.tgtPelvis.parent.worldToLocal(target));
  }
}

// orienter un os pour que son segment (vers « child ») pointe vers une position monde
function aimBone(bone, child, targetWorld) {
  bone.updateWorldMatrix(true, true);
  const from = child.getWorldPosition(new THREE.Vector3()).sub(bone.getWorldPosition(_v)).normalize();
  const to = targetWorld.clone().sub(bone.getWorldPosition(_v)).normalize();
  const delta = new THREE.Quaternion().setFromUnitVectors(from, to);
  const wq = bone.getWorldQuaternion(new THREE.Quaternion());
  const pq = bone.parent.getWorldQuaternion(new THREE.Quaternion());
  bone.quaternion.copy(pq.invert().multiply(delta.multiply(wq)));
}

// IK à deux os (épaule → coude → poignet) : la main va sur la cible, le coude vers « pole »
function twoBoneIK(upper, lower, hand, target, pole) {
  upper.updateWorldMatrix(true, true);
  const S = upper.getWorldPosition(new THREE.Vector3()), E = lower.getWorldPosition(new THREE.Vector3()), W = hand.getWorldPosition(new THREE.Vector3());
  const a = S.distanceTo(E), b = E.distanceTo(W);
  const toT = target.clone().sub(S);
  const d = THREE.MathUtils.clamp(toT.length(), Math.abs(a - b) + 1e-4, a + b - 1e-4);
  const dir = toT.normalize();
  const cosA = (a * a + d * d - b * b) / (2 * a * d);
  const bend = pole.clone().sub(S).projectOnPlane(dir).normalize();
  const elbow = S.clone().addScaledVector(dir, a * cosA).addScaledVector(bend, a * Math.sqrt(Math.max(0, 1 - cosA * cosA)));
  aimBone(upper, lower, elbow);
  aimBone(lower, hand, S.clone().addScaledVector(dir, d));
}

async function buildPerson(file, ual) {
  const g = await gltf.loadAsync(`assets/chars/${file}.glb`);
  const model = g.scene;
  const box = new THREE.Box3().setFromObject(model);
  const s = HEIGHT / (box.max.y - box.min.y);
  model.scale.setScalar(s);
  model.position.y = -box.min.y * s;
  const root = new THREE.Group();
  root.name = file;
  root.add(model);
  model.traverse((o) => {
    if (!o.isMesh) return;
    o.castShadow = true; o.receiveShadow = true; o.frustumCulled = false;
    o.material = new THREE.MeshStandardMaterial({ color: o.material.color, roughness: 0.75, metalness: 0, flatShading: false });
  });
  // source UAL (copie indépendante, invisible) à la même taille
  const src = SkeletonUtils.clone(ual.scene);
  const sbox = new THREE.Box3().setFromObject(src);
  src.scale.setScalar(HEIGHT / (sbox.max.y - sbox.min.y));
  const mixer = new THREE.AnimationMixer(src);
  const actions = {};
  for (const c of ual.animations) { const a = mixer.clipAction(c); a.play(); a.setEffectiveWeight(0); actions[c.name] = a; }
  src.updateMatrixWorld(true);
  const retarget = new Retargeter(src, model);
  // animations propres au modèle (Wave, Interact, Walk…), échantillonnées directement : un AnimationMixer ne réécrit
  // un os que si sa valeur a changé depuis l'image précédente, or le transfert UAL vient de les écraser
  const ownClips = {};
  for (const c of g.animations) {
    const tracks = [];
    for (const tr of c.tracks) {
      const [node, prop] = tr.name.split('.');
      const bone = model.getObjectByName(node);
      if (bone && prop === 'quaternion') tracks.push({ bone, interp: tr.createInterpolant() });
    }
    ownClips[c.name.split('|').pop()] = { duration: c.duration, tracks };
  }
  const bones = retarget.bones;
  const clipDur = (n) => (n.startsWith('own:') ? ownClips[n.slice(4)]?.duration : actions[n]?.getClip().duration) ?? 1;

  return {
    root, model, bones, retarget, clipDur,
    // layers : [[clip, temps, poids, masque?], …] — « own:Wave » = animation d'origine du modèle, mélangée par-dessus
    // la pose UAL (masque « arms » : bras seulement, ex. saluer en restant assis)
    pose(layers) {
      for (const a of Object.values(actions)) a.setEffectiveWeight(0);
      let ownW = 0, ownMask = null, ownClip = null, ownTime = 0;
      for (const [n, time, w, mask] of layers) {
        if (w <= 0) continue;
        if (n.startsWith('own:')) {
          ownClip = ownClips[n.slice(4)];
          if (!ownClip) continue;
          const d = ownClip.duration;
          ownTime = ((time % d) + d) % d;
          ownW += w;
          ownMask = mask === 'arms' ? /Shoulder|Arm|Wrist|Index|Middle|Ring|Pinky|Thumb/ : null;
          continue;
        }
        const a = actions[n];
        if (!a) continue;
        a.enabled = true;
        a.setEffectiveWeight(w);
        const d = a.getClip().duration;
        a.time = /Loop|Idle|Walk|Run|Wave/.test(n) ? ((time % d) + d) % d : THREE.MathUtils.clamp(time, 0, d - 1e-3);
      }
      mixer.update(0);
      retarget.apply();
      if (ownW > 0 && ownClip) {
        // mélange : de la pose UAL vers la pose d'origine, os par os (les os non animés gardent la pose UAL)
        const w = Math.min(1, ownW), q = new THREE.Quaternion();
        for (const { bone, interp } of ownClip.tracks) {
          if (ownMask && !ownMask.test(bone.name)) continue;
          q.fromArray(interp.evaluate(ownTime));
          bone.quaternion.slerp(q, w);
        }
      }
    },
    // mains sur le clavier (frappe) : IK des deux bras vers des cibles monde
    hands(left, right, poleL, poleR, w = 1) {
      if (w <= 0) return;
      const arm = ['UpperArmL', 'LowerArmL', 'UpperArmR', 'LowerArmR'].map((n) => bones.get(n));
      const saved = arm.map((b) => b.quaternion.clone());
      twoBoneIK(arm[0], arm[1], bones.get('WristL'), left, poleL);
      twoBoneIK(arm[2], arm[3], bones.get('WristR'), right, poleR);
      if (w < 1) arm.forEach((b, i) => b.quaternion.copy(saved[i].slerp(b.quaternion.clone(), w)));
    },
    // tête vers une cible monde (limité, mélangé)
    lookAt(target, weight = 1, max = 0.9) {
      const head = bones.get('Head');
      head.updateWorldMatrix(true, false);
      const wq = head.getWorldQuaternion(new THREE.Quaternion());
      const rootQ = root.getWorldQuaternion(new THREE.Quaternion());
      const fwd = new THREE.Vector3(0, 0, 1).applyQuaternion(rootQ);
      const to = target.clone().sub(head.getWorldPosition(new THREE.Vector3())).normalize();
      let q = new THREE.Quaternion().setFromUnitVectors(fwd, to); // rotation du regard « corps » vers la cible
      const ang = 2 * Math.acos(Math.min(1, Math.abs(q.w)));
      if (ang > max) q = new THREE.Quaternion().slerp(q, max / ang);
      q = new THREE.Quaternion().slerp(q, weight);
      const pq = head.parent.getWorldQuaternion(new THREE.Quaternion());
      head.quaternion.copy(pq.invert().multiply(q.multiply(wq)));
    },
  };
}

export const PEOPLE = { sales1: 'sales_woman', sales2: 'sales_man', dev1: 'dev_man', dev2: 'dev_woman', dev3: 'dev_man2' };

export async function buildCast(set) {
  const ual = await gltf.loadAsync('assets/chars/ual.glb');
  const entries = await Promise.all(Object.entries(PEOPLE).map(async ([k, f]) => [k, await buildPerson(f, ual)]));
  const cast = Object.fromEntries(entries);
  for (const p of Object.values(cast)) set.root.add(p.root);
  return cast;
}
