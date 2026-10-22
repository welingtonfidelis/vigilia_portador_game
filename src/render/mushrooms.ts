/**
 * Cogumelos do Jardim de Fungos (M3.3), feitos em código: tronco, chapéu e pintas que brilham. Vão
 * nas salas do Ato III e, com o ato vencido, na horta da porta do alquimista.
 */
import * as THREE from 'three';

/** Cores dos chapéus (violeta, verde doente e ferrugem) e das pintas que brilham. */
const CAPS = [0x7b4fa8, 0x5d8a3c, 0x9a5a3a, 0x4f6fa0];
const SPOTS = [0xb8ff7a, 0x7ae8ff, 0xe0a0ff];

const stemMat = new THREE.MeshStandardMaterial({ color: 0xd8cdb4, roughness: 0.85 });
const capMats = CAPS.map((c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.6 }));
const spotMats = SPOTS.map((c) => new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: 1.6, roughness: 0.4 }));

const stemGeo = new THREE.CylinderGeometry(0.32, 0.42, 1, 8);
// Chapéu: meia esfera achatada.
const capGeo = new THREE.SphereGeometry(1, 14, 7, 0, Math.PI * 2, 0, Math.PI / 2);
const spotGeo = new THREE.SphereGeometry(0.09, 6, 4);

/**
 * Um cogumelo de altura `h` (o chapéu tem de 0,35 a 0,5 × h de raio). `seed` escolhe as cores, a inclinação e
 * onde ficam as pintas.
 */
export function mushroom(h: number, seed: number): THREE.Group {
  let s = seed >>> 0;
  const r = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
  const g = new THREE.Group();
  const stem = new THREE.Mesh(stemGeo, stemMat);
  stem.scale.set(h * 0.32, h, h * 0.32);
  stem.position.y = h / 2;
  g.add(stem);
  const capR = h * (0.35 + 0.15 * r());
  const cap = new THREE.Mesh(capGeo, capMats[Math.floor(r() * capMats.length)]!);
  cap.scale.set(capR, capR * 0.55, capR);
  cap.position.y = h * 0.96;
  g.add(cap);
  const spot = spotMats[Math.floor(r() * spotMats.length)]!;
  const n = 5 + Math.floor(r() * 4);
  for (let i = 0; i < n; i++) {
    const a = r() * Math.PI * 2, up = 0.25 + r() * 0.6;
    const d = new THREE.Mesh(spotGeo, spot);
    d.scale.setScalar(capR * (0.7 + r() * 0.6));
    d.position.set(Math.cos(a) * Math.cos(up) * capR, cap.position.y + Math.sin(up) * capR * 0.55, Math.sin(a) * Math.cos(up) * capR);
    g.add(d);
  }
  g.rotation.set((r() - 0.5) * 0.25, r() * Math.PI * 2, (r() - 0.5) * 0.25);
  g.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.isMesh) m.castShadow = m.receiveShadow = true;
  });
  return g;
}

/** Cor da luz que um tufo de cogumelos dá (a das pintas). */
export function glowColor(seed: number): number {
  return SPOTS[seed % SPOTS.length]!;
}
