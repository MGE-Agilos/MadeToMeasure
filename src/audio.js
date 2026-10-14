import * as THREE from 'three';

// Bruitages spatialisés : chaque son est émis depuis l'objet qui le produit (chauves-souris derrière
// le spectateur, Biscuit qui aboie, fantôme qui passe à côté de lui…). Les fichiers manquants sont ignorés.
//   cues : [instant (s), fichier, objet émetteur, volume, distance de référence (m)]
export class SpatialSounds {
  constructor(camera, base = 'assets/sfx/') {
    this.base = base;
    this.listener = new THREE.AudioListener();
    camera.add(this.listener);
    this.loader = new THREE.AudioLoader();
    this.cues = [];
    this.lastT = -1;
  }

  async add(time, file, emitter, volume = 1, refDistance = 0.6) {
    try {
      const buffer = await this.loader.loadAsync(this.base + file);
      const sound = new THREE.PositionalAudio(this.listener);
      sound.setBuffer(buffer);
      sound.setRefDistance(refDistance);
      sound.setRolloffFactor(1.2);
      sound.setDistanceModel('inverse');
      sound.setVolume(volume);
      emitter.add(sound);
      this.cues.push({ time, sound, played: false });
    } catch { /* fichier absent : pas de son pour cet événement */ }
  }

  resume() { return this.listener.context.resume(); }

  stopAll() {
    for (const c of this.cues) { if (c.sound.isPlaying) c.sound.stop(); c.played = false; }
    this.lastT = -1;
  }

  // déclenche les sons dont l'instant vient d'être franchi
  update(t, playing) {
    if (!playing) { this.lastT = t; return; }
    if (t < this.lastT - 0.5) this.stopAll(); // retour en arrière (film relancé)
    for (const c of this.cues) {
      if (!c.played && this.lastT < c.time && t >= c.time) { c.sound.play(); c.played = true; }
    }
    this.lastT = t;
  }
}
