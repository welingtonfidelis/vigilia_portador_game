/**
 * Bolhas verdes subindo do herói envenenado (M3.4): cada dose acende mais algumas. Só enfeite; o
 * número de doses vem do estado.
 */
import * as THREE from 'three';

/** Bolha redonda (sem textura, o ponto sairia quadrado). */
function bubble(): THREE.Texture | null {
  if (typeof document === 'undefined') return null;
  const c = document.createElement('canvas');
  c.width = c.height = 32;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(16, 16, 2, 16, 16, 15);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.6, 'rgba(255,255,255,0.55)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 32, 32);
  return new THREE.CanvasTexture(c);
}

const PER_DOSE = 5;
const MAX = 5 * PER_DOSE;

export class VenomFx {
  readonly points: THREE.Points;
  private seeds: Float32Array;
  private geo: THREE.BufferGeometry;

  constructor() {
    this.geo = new THREE.BufferGeometry();
    this.geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(MAX * 3), 3));
    this.seeds = new Float32Array(MAX * 3);
    let s = 7;
    const r = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
    for (let i = 0; i < MAX; i++) this.seeds.set([r() * Math.PI * 2, r(), 0.25 + r() * 0.3], i * 3);
    const mat = new THREE.PointsMaterial({ color: 0xa6e05a, size: 0.4, map: bubble(), transparent: true, opacity: 0.95, depthWrite: false, blending: THREE.AdditiveBlending });
    this.points = new THREE.Points(this.geo, mat);
    this.points.frustumCulled = false;
    this.points.visible = false;
  }

  update(time: number, doses: number): void {
    const n = Math.min(MAX, doses * PER_DOSE);
    this.points.visible = n > 0;
    if (!n) return;
    const pos = this.geo.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < n; i++) {
      const a = this.seeds[i * 3]!, phase = this.seeds[i * 3 + 1]!, rad = this.seeds[i * 3 + 2]!;
      // Sobe do peito até acima da cabeça e recomeça, girando devagar em volta do herói.
      const t = (phase + time * 0.55) % 1;
      const ang = a + time * 0.8;
      pos.setXYZ(i, Math.cos(ang) * rad, 0.6 + t * 1.9, Math.sin(ang) * rad);
    }
    this.geo.setDrawRange(0, n);
    pos.needsUpdate = true;
  }
}
