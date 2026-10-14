import * as THREE from 'three';

// Planification de trajectoires sans collision, calculée une fois au chargement.
// Grille d'occupation du décor (scene.js) → grille « gonflée » du rayon du personnage → A* (8 voisins)
// → raccourcis en ligne droite là où c'est libre → lissage (Chaikin) vérifié → polyligne échantillonnée.
// Le personnage suit ensuite cette polyligne : il ne pénètre jamais dans un objet.

export class NavGrid {
  constructor(blocked) {
    Object.assign(this, blocked); // cell, min, n, data
    this.inflated = new Map();
  }

  idx(x, z) { return [Math.floor((x - this.min) / this.cell), Math.floor((z - this.min) / this.cell)]; }
  center(i, j) { return [this.min + (i + 0.5) * this.cell, this.min + (j + 0.5) * this.cell]; }

  // grille où chaque cellule libre est à au moins « radius » de tout obstacle
  layer(radius) {
    const key = radius.toFixed(3);
    if (this.inflated.has(key)) return this.inflated.get(key);
    const { n, data, cell } = this;
    const r = Math.ceil(radius / cell), r2 = (radius / cell + 0.5) ** 2;
    const out = new Uint8Array(n * n);
    const offs = [];
    for (let dj = -r; dj <= r; dj++) for (let di = -r; di <= r; di++) if (di * di + dj * dj <= r2) offs.push([di, dj]);
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
      if (!data[j * n + i]) continue;
      for (const [di, dj] of offs) {
        const a = i + di, b = j + dj;
        if (a >= 0 && b >= 0 && a < n && b < n) out[b * n + a] = 1;
      }
    }
    this.inflated.set(key, out);
    return out;
  }

  free(layer, x, z) {
    const [i, j] = this.idx(x, z);
    return i >= 0 && j >= 0 && i < this.n && j < this.n && !layer[j * this.n + i];
  }

  segmentFree(layer, a, b) {
    const d = Math.hypot(b.x - a.x, b.z - a.z), steps = Math.max(1, Math.ceil(d / (this.cell * 0.5)));
    for (let k = 0; k <= steps; k++) if (!this.free(layer, a.x + (b.x - a.x) * k / steps, a.z + (b.z - a.z) * k / steps)) return false;
    return true;
  }

  // cellule libre la plus proche (si un point de passage tombe dans un obstacle)
  nearestFree(layer, x, z) {
    if (this.free(layer, x, z)) return new THREE.Vector3(x, 0, z);
    for (let rad = 1; rad < 40; rad++) {
      let best = null, bd = Infinity;
      const [ci, cj] = this.idx(x, z);
      for (let j = cj - rad; j <= cj + rad; j++) for (let i = ci - rad; i <= ci + rad; i++) {
        if (Math.max(Math.abs(i - ci), Math.abs(j - cj)) !== rad || i < 0 || j < 0 || i >= this.n || j >= this.n || layer[j * this.n + i]) continue;
        const [cx, cz] = this.center(i, j), d = Math.hypot(cx - x, cz - z);
        if (d < bd) { bd = d; best = new THREE.Vector3(cx, 0, cz); }
      }
      if (best) return best;
    }
    return new THREE.Vector3(x, 0, z);
  }

  astar(layer, a, b) {
    const { n } = this;
    const [si, sj] = this.idx(a.x, a.z), [gi, gj] = this.idx(b.x, b.z);
    const start = sj * n + si, goal = gj * n + gi;
    const g = new Float32Array(n * n).fill(Infinity), came = new Int32Array(n * n).fill(-1), closed = new Uint8Array(n * n);
    const h = (k) => { const dx = Math.abs((k % n) - gi), dz = Math.abs(Math.floor(k / n) - gj); return Math.max(dx, dz) + 0.414 * Math.min(dx, dz); };
    const open = [[h(start), start]]; // tas binaire minimal
    const push = (e) => { open.push(e); let c = open.length - 1; while (c > 0) { const p = (c - 1) >> 1; if (open[p][0] <= open[c][0]) break; [open[p], open[c]] = [open[c], open[p]]; c = p; } };
    const pop = () => { const top = open[0], last = open.pop(); if (open.length) { open[0] = last; let c = 0; for (;;) { const l = 2 * c + 1, r = l + 1; let m = c; if (l < open.length && open[l][0] < open[m][0]) m = l; if (r < open.length && open[r][0] < open[m][0]) m = r; if (m === c) break; [open[m], open[c]] = [open[c], open[m]]; c = m; } } return top; };
    g[start] = 0;
    const nb = [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1], [1, 1, 1.414], [1, -1, 1.414], [-1, 1, 1.414], [-1, -1, 1.414]];
    while (open.length) {
      const [, k] = pop();
      if (k === goal) break;
      if (closed[k]) continue;
      closed[k] = 1;
      const i = k % n, j = Math.floor(k / n);
      for (const [di, dj, c] of nb) {
        const a2 = i + di, b2 = j + dj;
        if (a2 < 0 || b2 < 0 || a2 >= n || b2 >= n) continue;
        const k2 = b2 * n + a2;
        if (layer[k2] || closed[k2]) continue;
        if (di && dj && (layer[j * n + a2] || layer[b2 * n + i])) continue; // pas de coupe en diagonale
        const ng = g[k] + c;
        if (ng < g[k2]) { g[k2] = ng; came[k2] = k; push([ng + h(k2), k2]); }
      }
    }
    if (came[goal] < 0 && goal !== start) return [a.clone(), b.clone()];
    const cells = [];
    for (let k = goal; k >= 0; k = came[k]) { cells.push(k); if (k === start) break; }
    cells.reverse();
    const pts = cells.map((k) => { const [x, z] = this.center(k % n, Math.floor(k / n)); return new THREE.Vector3(x, 0, z); });
    pts[0] = a.clone(); pts[pts.length - 1] = b.clone();
    return pts;
  }

  // trajet complet passant par des points de passage, simplifié et lissé, échantillonné tous les « step »
  // extra : obstacles supplémentaires [{x, z, r}] (ex. un personnage immobile à contourner)
  plan(waypoints, radius, step = 0.04, extra = []) {
    let layer = this.layer(radius);
    if (extra.length) {
      layer = layer.slice();
      for (const o of extra) {
        const rr = o.r + radius, [ci, cj] = this.idx(o.x, o.z), k = Math.ceil(rr / this.cell);
        for (let j = cj - k; j <= cj + k; j++) for (let i = ci - k; i <= ci + k; i++) {
          if (i < 0 || j < 0 || i >= this.n || j >= this.n) continue;
          const [x, z] = this.center(i, j);
          if (Math.hypot(x - o.x, z - o.z) <= rr) layer[j * this.n + i] = 1;
        }
      }
    }
    const wps = waypoints.map((p) => this.nearestFree(layer, p.x, p.z));
    let pts = [wps[0]];
    for (let i = 0; i < wps.length - 1; i++) pts.push(...this.astar(layer, wps[i], wps[i + 1]).slice(1));
    // raccourcis : on saute les points intermédiaires tant que la ligne droite reste libre
    const simple = [pts[0]];
    let i = 0;
    while (i < pts.length - 1) {
      let j = pts.length - 1;
      while (j > i + 1 && !this.segmentFree(layer, pts[i], pts[j])) j--;
      simple.push(pts[j]);
      i = j;
    }
    // lissage de Chaikin, conservé seulement s'il reste hors des obstacles
    let smooth = simple;
    for (let it = 0; it < 4; it++) {
      const next = [smooth[0]];
      for (let k = 0; k < smooth.length - 1; k++) {
        const a = smooth[k], b = smooth[k + 1];
        next.push(a.clone().lerp(b, 0.25), a.clone().lerp(b, 0.75));
      }
      next.push(smooth[smooth.length - 1]);
      let ok = true;
      for (let k = 0; k < next.length - 1 && ok; k++) ok = this.segmentFree(layer, next[k], next[k + 1]);
      if (!ok) break;
      smooth = next;
    }
    return new Route(smooth, step);
  }
}

// polyligne paramétrée par la distance parcourue, avec direction lissée
export class Route {
  constructor(points, step) {
    const dense = [points[0].clone()];
    for (let i = 0; i < points.length - 1; i++) {
      const a = points[i], b = points[i + 1], d = a.distanceTo(b), k = Math.max(1, Math.ceil(d / step));
      for (let s = 1; s <= k; s++) dense.push(a.clone().lerp(b, s / k));
    }
    this.pts = dense;
    this.cum = [0];
    for (let i = 1; i < dense.length; i++) this.cum.push(this.cum[i - 1] + dense[i].distanceTo(dense[i - 1]));
    this.length = this.cum[this.cum.length - 1];
  }

  point(d) {
    d = THREE.MathUtils.clamp(d, 0, this.length);
    let lo = 0, hi = this.cum.length - 1;
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (this.cum[m] < d) lo = m; else hi = m; }
    const t = (d - this.cum[lo]) / Math.max(1e-6, this.cum[hi] - this.cum[lo]);
    return this.pts[lo].clone().lerp(this.pts[hi], t);
  }

  // direction moyenne sur une fenêtre : pas de saccade dans les virages
  tangent(d, window = 0.25) {
    const a = this.point(Math.max(0, d - window)), b = this.point(Math.min(this.length, d + window));
    const v = b.sub(a).setY(0);
    return v.lengthSq() > 1e-8 ? v.normalize() : new THREE.Vector3(0, 0, 1);
  }
}
