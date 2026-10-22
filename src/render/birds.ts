/**
 * Passarinhos (M2.3): dois bandos dando voltas por cima da ilha de dia, batendo as asas. Cada asa é
 * um triângulo, e todas as asas de um lado são desenhadas de uma vez (duas chamadas para todos).
 * Só enfeite: não depende de nada do jogo além da luz do dia.
 */
import * as THREE from 'three';

interface Flock {
  cx: number;
  cz: number;
  radius: number;
  height: number;
  speed: number;
  phase: number;
}

const FLOCKS: Flock[] = [
  { cx: -6, cz: -4, radius: 26, height: 19, speed: 0.11, phase: 0 },
  { cx: 8, cz: 6, radius: 18, height: 24, speed: -0.15, phase: 2.1 },
];
const PER_FLOCK = 5;

function wing(side: 1 | -1): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  // Do corpo até a ponta da asa (para fora em x), um pouco para trás.
  g.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0.35, side * 1.2, 0.05, -0.15, 0, 0, -0.3], 3));
  g.computeVertexNormals();
  return g;
}

export class Birds {
  readonly group = new THREE.Group();
  private left: THREE.InstancedMesh;
  private right: THREE.InstancedMesh;

  constructor() {
    const mat = new THREE.MeshBasicMaterial({ color: 0x2f3236, side: THREE.DoubleSide });
    const n = FLOCKS.length * PER_FLOCK;
    this.left = new THREE.InstancedMesh(wing(-1), mat, n);
    this.right = new THREE.InstancedMesh(wing(1), mat, n);
    for (const m of [this.left, this.right]) {
      m.frustumCulled = false;
      this.group.add(m);
    }
  }

  update(time: number, day: number): void {
    this.group.visible = day > 0.35;
    if (!this.group.visible) return;
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), flap = new THREE.Quaternion(), pos = new THREE.Vector3(), one = new THREE.Vector3(1, 1, 1);
    const up = new THREE.Vector3(0, 1, 0), fwd = new THREE.Vector3(0, 0, 1);
    let k = 0;
    for (const f of FLOCKS) {
      for (let i = 0; i < PER_FLOCK; i++) {
        // Em fila torta: cada um um pouco atrás e para o lado do anterior.
        const a = time * f.speed + f.phase - i * 0.07 * Math.sign(f.speed);
        const r = f.radius + (i % 2 ? 1.6 : -1.6) * Math.ceil(i / 2);
        pos.set(f.cx + Math.cos(a) * r, f.height + Math.sin(time * 0.8 + i * 1.7) * 1.2, f.cz + Math.sin(a) * r);
        // Olha na direção da volta (tangente) e inclina um pouco para dentro.
        const heading = Math.atan2(-Math.sin(a) * Math.sign(f.speed), Math.cos(a) * Math.sign(f.speed));
        q.setFromAxisAngle(up, heading).multiply(new THREE.Quaternion().setFromAxisAngle(fwd, 0.25 * Math.sign(f.speed)));
        const beat = Math.sin(time * 9 + i * 1.3 + f.phase) * 0.6;
        m.compose(pos, q.clone().multiply(flap.setFromAxisAngle(fwd, beat)), one);
        this.left.setMatrixAt(k, m);
        m.compose(pos, q.clone().multiply(flap.setFromAxisAngle(fwd, -beat)), one);
        this.right.setMatrixAt(k, m);
        k++;
      }
    }
    this.left.instanceMatrix.needsUpdate = true;
    this.right.instanceMatrix.needsUpdate = true;
  }
}
