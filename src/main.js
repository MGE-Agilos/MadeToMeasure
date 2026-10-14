import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { buildOffice, BRAND } from './office.js';
import { buildCast } from './cast.js';
import { Story, DURATION } from './story.js';
import { Events, CUES } from './events.js';
import { SpatialSounds } from './audio.js';

// « Made to Measure » — film Beyond Data pour les commerciaux, en réalité augmentée sur téléphone (Android/Chrome)
// ou dans un casque Quest. Le bureau en maquette est posé sur une table ; la mise en scène est jouée en direct,
// synchronisée sur la bande-son (voix off anglaise + musique + bruitages).
//   ?t=55   fige l'instant (tests)     ?cam=x,y,z,cx,cy,cz   caméra de test

const params = new URLSearchParams(location.search);
const consoleError = console.error.bind(console);
const send = (t) => { if (import.meta.env.DEV) fetch('/__log', { method: 'POST', body: t }).catch(() => {}); };
const log = (m, err = false) => { (err ? consoleError : console.log)(m); send(`${err ? 'ERREUR ' : ''}[pitch] ${m}`); };
console.error = (...a) => { consoleError(...a); send('ERREUR ' + a.map(String).join(' ').slice(0, 4000)); };
addEventListener('error', (e) => log(`${e.message} (${e.filename}:${e.lineno})`, true));
addEventListener('unhandledrejection', (e) => log(`Promesse rejetée : ${e.reason?.message || e.reason}`, true));

const ui = { vr: document.getElementById('enter-vr'), ar: document.getElementById('enter-ar'), status: document.getElementById('status') };
const setStatus = (t, err = false) => { ui.status.textContent = t; ui.status.classList.toggle('error', err); };

// ---------------------------------------------------------------------------
// Rendu
// ---------------------------------------------------------------------------
const canvas = document.getElementById('scene');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight, false);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.1;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.xr.enabled = true;
renderer.xr.setReferenceSpaceType('local-floor');

const scene = new THREE.Scene();
// fond « studio » aux couleurs de la marque (caché en réalité augmentée)
const backdrop = new THREE.Mesh(new THREE.SphereGeometry(60, 48, 24), new THREE.ShaderMaterial({
  side: THREE.BackSide, depthWrite: false,
  uniforms: { top: { value: BRAND.navy.clone() }, bottom: { value: new THREE.Color(0x000000) }, tint: { value: new THREE.Color(1, 1, 1) } },
  vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: 'uniform vec3 top; uniform vec3 bottom; uniform vec3 tint; varying vec3 vP; void main(){ gl_FragColor = vec4(mix(bottom, top, smoothstep(-0.4, 0.6, vP.y)) * tint, 1.0); }',
}));
backdrop.renderOrder = -10;
scene.add(backdrop);

const stage = new THREE.Group(); // tout le film, dans le repère de la pièce
scene.add(stage);
const TABLE_HEIGHT = 0.72, STAGE_DISTANCE = 1.3;

const camera = new THREE.PerspectiveCamera(55, innerWidth / innerHeight, 0.01, 200);
camera.position.set(0.35, 1.45, 0.25);
const controls = new OrbitControls(camera, canvas);
controls.target.set(0, TABLE_HEIGHT + 0.12, -STAGE_DISTANCE);
controls.enableDamping = true;
controls.update();
const cam = params.get('cam')?.split(',').map(Number);
if (cam?.length === 6) { camera.position.set(cam[0], cam[1], cam[2]); controls.target.set(cam[3], cam[4], cam[5]); controls.update(); }

// lumières : soleil par les fenêtres (ombres), ciel, appoint côté spectateur
const hemi = new THREE.HemisphereLight(0xdfe6ff, 0x2a2c40, 1.6);
const sun = new THREE.DirectionalLight(0xffffff, 2.2);
sun.castShadow = true;
sun.shadow.mapSize.set(1024, 1024);
sun.shadow.bias = -0.0005;
sun.shadow.normalBias = 0.01;
const fill = new THREE.DirectionalLight(0xffffff, 0.7);
scene.add(hemi, sun, sun.target, fill);
const lights = { hemi, sun, fill, backdrop };

// ---------------------------------------------------------------------------
// Chargement
// ---------------------------------------------------------------------------
setStatus('Loading the office…');
await document.fonts.load('700 40px Urbanist').catch(() => {});
const set = await buildOffice();
stage.add(set.root);
setStatus('Loading the team…');
const cast = await buildCast(set);

// maquette : 6 × 4 unités ≈ 1,2 × 0,8 m sur la table (casque)
let officeScale = 0.2;
function placeOffice() {
  set.root.scale.setScalar(officeScale);
  set.root.position.set(0, TABLE_HEIGHT + 0.3 * officeScale, -STAGE_DISTANCE); // le socle (0,3) repose sur la table
  set.root.updateMatrixWorld(true);
  const c = set.root.getWorldPosition(new THREE.Vector3());
  sun.position.copy(c).add(new THREE.Vector3(-1.2, 2.2, 1.4).multiplyScalar(stage.scale.x || 1));
  sun.target.position.copy(c);
  const sh = sun.shadow.camera, r = 4.2 * officeScale * stage.scale.x;
  sh.left = sh.bottom = -r; sh.right = sh.top = r; sh.near = 0.01; sh.far = 10 * stage.scale.x;
  sh.updateProjectionMatrix();
  fill.position.copy(c).add(new THREE.Vector3(0.8, 1.2, 2.5));
}
placeOffice();

const story = new Story({ set, cast, scene, lights, renderer, stage });
const events = new Events({ scene, stage, set, cast, story });
await events.ready;
story.events = events;

// préparation de tous les matériaux dès le chargement (pas de saccade à la première apparition)
{
  const hidden = [];
  scene.traverse((o) => { if (!o.visible) { hidden.push(o); o.visible = true; } });
  await renderer.compileAsync(scene, camera);
  for (const o of hidden) o.visible = false;
}

// bruitages spatialisés, émis depuis les objets qui les produisent
const sfx = new SpatialSounds(camera, 'assets/sfx/');
await Promise.all(events.sounds().map(([t, file, emitter, vol, ref]) => sfx.add(t, file, emitter, vol, ref)));

// ---------------------------------------------------------------------------
// Son et horloge du film
// ---------------------------------------------------------------------------
const audio = new Audio('assets/soundtrack.m4a');
audio.preload = 'auto';
let playing = false, startedAt = 0;
let frozen = params.has('t') ? Number(params.get('t')) : null;
function filmTime() {
  if (frozen !== null) return frozen;
  if (!playing) return 0;
  return audio.duration && !audio.paused ? audio.currentTime : (performance.now() - startedAt) / 1000;
}
async function play() {
  sfx.stopAll();
  sfx.resume();
  audio.currentTime = 0;
  startedAt = performance.now();
  playing = true;
  try { await audio.play(); } catch (e) { log(`audio : ${e.message}`, true); }
}

// ---------------------------------------------------------------------------
// Casque (Quest) : VR ou passthrough
// ---------------------------------------------------------------------------
let xrFrames = 0;
async function enterXR(mode) {
  let session = null;
  try {
    session = await navigator.xr.requestSession(mode, { requiredFeatures: ['local-floor'], optionalFeatures: ['hand-tracking', 'layers'] });
    renderer.xr.setFramebufferScaleFactor(1.0);
    renderer.xr.setFoveation(0.5);
    backdrop.visible = mode !== 'immersive-ar';
    ui.vr.disabled = ui.ar.disabled = true;
    session.addEventListener('end', () => { backdrop.visible = true; ui.vr.disabled = false; ui.ar.disabled = !arSupported; audio.pause(); playing = false; });
    await renderer.xr.setSession(session);
    try { if (session.supportedFrameRates?.includes(72)) await session.updateTargetFrameRate(72); } catch {}
    xrFrames = 0;
    play();
    setTimeout(() => { if (renderer.xr.getSession() === session) log(`XR ${mode} : ${xrFrames} images en 10 s`); }, 10000);
  } catch (err) {
    log(`WebXR : ${err.message}`, true);
    setStatus(`WebXR: ${err.message}`, true);
    session?.end().catch(() => {});
  }
}
let arSupported = false;
const isPhone = /Android|iPhone|iPad/i.test(navigator.userAgent) && !/OculusBrowser|Quest/i.test(navigator.userAgent);
ui.vr.addEventListener('click', () => enterXR('immersive-vr'));
ui.ar.addEventListener('click', () => (isPhone ? enterPhoneAR() : enterXR('immersive-ar')));
document.getElementById('play-2d')?.addEventListener('click', play);
if (navigator.xr) {
  navigator.xr.isSessionSupported('immersive-vr').then((ok) => { ui.vr.disabled = !ok; });
  navigator.xr.isSessionSupported('immersive-ar').then((ok) => {
    arSupported = ok; ui.ar.disabled = !ok;
    if (isPhone && !ok) setStatus('Augmented reality is not available on this phone: use Chrome on Android with "Google Play Services for AR".', true);
  });
} else if (isPhone) setStatus('Augmented reality needs Chrome on Android (WebXR). On iPhone, use the preview button.', true);

// ---------------------------------------------------------------------------
// Réalité augmentée sur téléphone : on vise une table, on touche l'écran, la maquette s'y pose
// ---------------------------------------------------------------------------
const overlay = document.getElementById('ar-overlay');
const arHint = document.getElementById('ar-hint');
const reticle = new THREE.Mesh(
  new THREE.RingGeometry(0.06, 0.08, 40).rotateX(-Math.PI / 2),
  new THREE.MeshBasicMaterial({ color: BRAND.cyan, transparent: true, opacity: 0.9, depthTest: false, toneMapped: false }),
);
reticle.matrixAutoUpdate = false;
reticle.visible = false;
scene.add(reticle);
let phoneScale = 0.4;   // maquette ≈ 50 cm de large
let hitSource = null, placed = false;
const anchor = new THREE.Vector3(), anchorYaw = { v: 0 };

function placeStage() {
  const S = phoneScale;
  stage.scale.setScalar(S);
  stage.rotation.set(0, anchorYaw.v, 0);
  // le dessous du socle repose sur la surface visée
  const officeLocal = new THREE.Vector3(0, TABLE_HEIGHT, -STAGE_DISTANCE).multiplyScalar(S).applyAxisAngle(new THREE.Vector3(0, 1, 0), anchorYaw.v);
  stage.position.copy(anchor).sub(officeLocal);
  stage.updateMatrixWorld(true);
  story.lightScale = S;
  placeOffice();
}

function resetStage() {
  stage.position.set(0, 0, 0); stage.rotation.set(0, 0, 0); stage.scale.setScalar(1); stage.visible = true;
  story.lightScale = 1; story.exposureBoost = 1;
  placeOffice();
}

async function enterPhoneAR() {
  let session = null;
  try {
    // débloque le son pendant le geste de l'utilisateur
    audio.muted = true; audio.play().then(() => { audio.pause(); audio.muted = false; }).catch(() => {});
    sfx.resume();
    session = await navigator.xr.requestSession('immersive-ar', {
      requiredFeatures: ['hit-test'],
      optionalFeatures: ['dom-overlay', 'local-floor'],
      domOverlay: { root: overlay },
    });
    renderer.xr.setReferenceSpaceType('local');
    await renderer.xr.setSession(session);
    backdrop.visible = false;
    story.exposureBoost = 1.15;
    stage.visible = false;
    placed = false;
    overlay.hidden = false;
    arHint.textContent = 'Point at a table or the floor, then tap the screen to place the office.';
    const viewer = await session.requestReferenceSpace('viewer');
    hitSource = await session.requestHitTestSource({ space: viewer });
    session.addEventListener('select', () => {
      if (placed || !reticle.visible) return;
      anchor.setFromMatrixPosition(reticle.matrix);
      const camPos = renderer.xr.getCamera().getWorldPosition(new THREE.Vector3());
      anchorYaw.v = Math.atan2(camPos.x - anchor.x, camPos.z - anchor.z); // la maquette fait face au téléphone
      placed = true;
      reticle.visible = false;
      stage.visible = true;
      placeStage();
      arHint.textContent = 'Walk around the table. Look up, left, right… things happen all around you!';
      setTimeout(() => { if (placed) arHint.textContent = ''; }, 6000);
      play();
    });
    session.addEventListener('end', () => {
      hitSource = null; overlay.hidden = true; reticle.visible = false; backdrop.visible = true;
      renderer.xr.setReferenceSpaceType('local-floor');
      resetStage();
      audio.pause(); playing = false;
    });
    log('AR téléphone démarrée');
  } catch (err) {
    log(`AR téléphone : ${err.message}`, true);
    setStatus(`AR: ${err.message}`, true);
    session?.end().catch(() => {});
  }
}

overlay?.addEventListener('beforexrselect', (e) => e.preventDefault()); // les boutons ne posent pas la maquette
document.getElementById('ar-smaller')?.addEventListener('click', () => { phoneScale = Math.max(0.1, phoneScale / 1.25); if (placed) placeStage(); });
document.getElementById('ar-bigger')?.addEventListener('click', () => { phoneScale = Math.min(1.5, phoneScale * 1.25); if (placed) placeStage(); });
document.getElementById('ar-move')?.addEventListener('click', () => { placed = false; stage.visible = false; arHint.textContent = 'Point at a new spot and tap the screen.'; });
document.getElementById('ar-replay')?.addEventListener('click', () => { if (placed) play(); });
document.getElementById('ar-exit')?.addEventListener('click', () => renderer.xr.getSession()?.end());

function updateReticle() {
  if (!hitSource || placed) return;
  const hits = renderer.xr.getFrame()?.getHitTestResults(hitSource);
  if (hits?.length) {
    reticle.matrix.fromArray(hits[0].getPose(renderer.xr.getReferenceSpace()).transform.matrix);
    reticle.visible = true;
  } else reticle.visible = false;
}

if (isPhone) {
  ui.vr.hidden = true;
  ui.ar.textContent = 'Start in augmented reality';
  ui.ar.classList.remove('secondary');
}

// manettes du Quest : A = relancer, stick droit ↑↓ = taille de la maquette
const pressed = new Map();
function handleInput(dt) {
  for (const src of renderer.xr.getSession()?.inputSources ?? []) {
    const gp = src.gamepad;
    if (!gp || src.handedness !== 'right') continue;
    const a = !!gp.buttons[4]?.pressed;
    if (a && !pressed.get('A')) play();
    pressed.set('A', a);
    const y = Math.abs(gp.axes[3] ?? 0) > 0.2 ? gp.axes[3] : 0;
    if (y) { officeScale = THREE.MathUtils.clamp(officeScale * (1 - y * dt * 0.6), 0.08, 0.5); placeOffice(); }
  }
}

addEventListener('resize', () => {
  if (renderer.xr.isPresenting) return;
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight, false);
});

const timer = new THREE.Timer();
const headPos = new THREE.Vector3(), headDir = new THREE.Vector3();
renderer.setAnimationLoop((time) => {
  timer.update(time);
  const dt = Math.min(timer.getDelta(), 0.1);
  if (renderer.xr.isPresenting) { handleInput(dt); updateReticle(); xrFrames++; } else controls.update();
  const t = Math.min(filmTime(), DURATION);
  const viewCam = renderer.xr.isPresenting ? renderer.xr.getCamera() : camera;
  viewCam.getWorldPosition(headPos);
  viewCam.getWorldDirection(headDir);
  story.evaluate(t, dt, headPos, headDir);
  events.evaluate(t, dt, headPos, headDir);
  sfx.update(t, playing && frozen === null);
  renderer.render(scene, camera);
});

setStatus(isPhone ? 'Ready. Tap "Start in augmented reality", then point at a table.' : 'Ready. Put on the headset, or press Preview.');
log('pitch chargé');
window.__pitch = { freeze: (v) => { frozen = v; }, renderer, scene, camera, controls, set, cast, story, events, stage, CUES, phone: { placeStage, anchor, anchorYaw, scale: (v) => { phoneScale = v; } } };
