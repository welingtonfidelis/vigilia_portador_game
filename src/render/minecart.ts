/**
 * Carrinho de mina e trilhos (M3.2), feitos em código: nenhum pack da família tem um. O carrinho
 * vai nas salas das Minas Inundadas e, com o Ato II vencido, na frente do ferreiro da vila; o
 * minério por cima é o das pepitas do Resource Bits, tingido de ferro-negro.
 */
import * as THREE from 'three';
import { load } from './assets.ts';

const wood = new THREE.MeshStandardMaterial({ color: 0x8c5e3c, roughness: 0.9 });
const iron = new THREE.MeshStandardMaterial({ color: 0x3f454c, roughness: 0.55, metalness: 0.55 });
const sleeper = new THREE.MeshStandardMaterial({ color: 0x4a3324, roughness: 0.95 });

/** Caixa com a boca mais larga que o fundo, como a caçamba do carrinho. */
function tub(w: number, h: number, d: number, flare: number): THREE.BufferGeometry {
  const g = new THREE.BoxGeometry(w, h, d);
  const p = g.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) {
    if (p.getY(i) > 0) {
      p.setX(i, p.getX(i) * flare);
      p.setZ(i, p.getZ(i) * flare);
    }
  }
  g.computeVertexNormals();
  return g;
}

const materials = new Map<string, THREE.Material>();

/** Material da pepita tingido de ferro-negro (azul-escuro, um pouco metálico). */
function blackIron(base: THREE.Material): THREE.Material {
  let m = materials.get(base.uuid);
  if (!m) {
    const c = (base as THREE.MeshStandardMaterial).clone();
    c.color = new THREE.Color(0x5e6c80);
    c.metalness = 0.35;
    c.roughness = 0.5;
    materials.set(base.uuid, (m = c));
  }
  return m;
}

/** O carrinho, de frente para +x, com 1,6 m de comprimento; `ore` enche a caçamba de ferro-negro. */
export async function mineCart(ore: boolean): Promise<THREE.Group> {
  const g = new THREE.Group();
  const body = new THREE.Mesh(tub(1.5, 0.75, 1, 1.12), wood);
  body.position.y = 0.72;
  g.add(body);
  // Cintas de ferro nas pontas e no meio.
  for (const x of [-0.78, 0, 0.78]) {
    const band = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.8, 1.16), iron);
    band.position.set(x * 1.04, 0.74, 0);
    g.add(band);
  }
  for (const x of [-0.5, 0.5]) {
    const axle = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.2, 6), iron);
    axle.rotation.x = Math.PI / 2;
    axle.position.set(x, 0.24, 0);
    g.add(axle);
    for (const z of [-0.52, 0.52]) {
      const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.24, 0.1, 12), iron);
      wheel.rotation.x = Math.PI / 2;
      wheel.position.set(x, 0.24, z);
      g.add(wheel);
    }
  }
  if (ore) {
    const pile = (await load('resource/Iron_Nuggets.gltf')).scene.clone();
    pile.scale.setScalar(1.25);
    pile.position.y = 0.98;
    pile.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) m.material = blackIron(m.material as THREE.Material);
    });
    g.add(pile);
  }
  g.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.isMesh) m.castShadow = m.receiveShadow = true;
  });
  return g;
}

/** Trilhos em x, de `x0` a `x1`, com dormentes a cada 0,8 m (bitola de 1,04 m, a das rodas). */
export function rails(x0: number, x1: number): THREE.Group {
  const g = new THREE.Group();
  const len = x1 - x0;
  for (const z of [-0.52, 0.52]) {
    const rail = new THREE.Mesh(new THREE.BoxGeometry(len, 0.08, 0.08), iron);
    rail.position.set((x0 + x1) / 2, 0.12, z);
    g.add(rail);
  }
  for (let x = x0 + 0.3; x < x1; x += 0.8) {
    const s = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.07, 1.5), sleeper);
    s.position.set(x, 0.05, 0);
    g.add(s);
  }
  g.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.isMesh) m.receiveShadow = true;
  });
  return g;
}

/** Ferro-negro solto (pepitas tingidas), para as pilhas de minério das salas. */
export async function blackIronPile(file: string): Promise<THREE.Object3D> {
  const o = (await load(file)).scene.clone();
  o.traverse((c) => {
    const m = c as THREE.Mesh;
    if (m.isMesh) m.material = blackIron(m.material as THREE.Material);
  });
  return o;
}
