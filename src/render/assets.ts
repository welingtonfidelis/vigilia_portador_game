/**
 * Carrega os glTF do KayKit (public/assets/kaykit), compartilha um material por textura e gera,
 * uma vez por faixa de tier, a textura recolorida do metal (docs/VIGILIA-PORTADOR.md §3.3).
 */
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import type { GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';

const ROOT = `${import.meta.env.BASE_URL}assets/kaykit/`;
const loader = new GLTFLoader();
const cache = new Map<string, Promise<GLTF>>();

export function load(path: string): Promise<GLTF> {
  let p = cache.get(path);
  if (!p) {
    p = loader.loadAsync(ROOT + path).then((g) => {
      shareMaterials(g.scene, path.split('/')[0]!);
      return g;
    });
    cache.set(path, p);
  }
  return p;
}

/**
 * Um material por pack e nome (adventurers:knight, dungeon:texture…): os glTF que apontam para o mesmo
 * atlas dividem a GPU, e dois packs com o mesmo nome de material não se confundem.
 */
const shared = new Map<string, THREE.MeshStandardMaterial>();

function shareMaterials(root: THREE.Object3D, pack: string): void {
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    const out = mats.map((m) => {
      const std = m as THREE.MeshStandardMaterial;
      const key = `${pack}:${std.name || 'sem-nome'}`;
      const have = shared.get(key);
      if (have) {
        if (std !== have) std.dispose();
        return have;
      }
      std.metalness = 0;
      std.roughness = 0.85;
      if (std.map) {
        std.map.anisotropy = 4;
        std.map.colorSpace = THREE.SRGBColorSpace;
      }
      shared.set(key, std);
      return std;
    });
    mesh.material = Array.isArray(mesh.material) ? out : out[0]!;
  });
}

/**
 * Faixas de tier (iguais aos nomes dos itens): ferro, aço, bronze, ferro-negro, ouro.
 * Cada faixa recolore os pixels de metal (cinzas, de saturação baixa) e escurece o couro no ferro-negro.
 */
const BANDS: { metal: [number, number, number] | null; gain: number; leather: number }[] = [
  { metal: null, gain: 1, leather: 1 },
  { metal: [0.72, 0.84, 1.05], gain: 1.12, leather: 1 },
  { metal: [1.05, 0.7, 0.4], gain: 1.15, leather: 1 },
  { metal: [0.5, 0.57, 0.74], gain: 1.05, leather: 0.75 },
  { metal: [1.15, 0.9, 0.38], gain: 1.25, leather: 1 },
];

const recolored = new Map<string, THREE.MeshStandardMaterial>();

function imageOf(tex: THREE.Texture): CanvasImageSource | null {
  const img = tex.image as CanvasImageSource | undefined;
  return img ?? null;
}

/** Material do atlas `base` recolorido para a faixa `band` (0 = original). */
export function bandMaterial(base: THREE.MeshStandardMaterial, band: number): THREE.MeshStandardMaterial {
  if (band <= 0 || !base.map) return base;
  const key = `${base.name}:${band}`;
  const have = recolored.get(key);
  if (have) return have;
  const img = imageOf(base.map);
  const mat = base.clone();
  mat.name = key;
  if (img) {
    const w = (img as { width: number }).width;
    const h = (img as { height: number }).height;
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
    ctx.drawImage(img, 0, 0);
    const data = ctx.getImageData(0, 0, w, h);
    const px = data.data;
    const b = BANDS[Math.min(band, BANDS.length - 1)]!;
    for (let i = 0; i < px.length; i += 4) {
      const r = px[i]! / 255, g = px[i + 1]! / 255, bl = px[i + 2]! / 255;
      const max = Math.max(r, g, bl), min = Math.min(r, g, bl);
      const l = (max + min) / 2;
      const s = max === min ? 0 : (max - min) / (1 - Math.abs(2 * l - 1));
      if (b.metal && s < 0.2 && l > 0.14 && l < 0.92) {
        const lum = 0.3 * r + 0.59 * g + 0.11 * bl;
        px[i] = Math.min(255, lum * b.metal[0] * b.gain * 255);
        px[i + 1] = Math.min(255, lum * b.metal[1] * b.gain * 255);
        px[i + 2] = Math.min(255, lum * b.metal[2] * b.gain * 255);
      } else if (b.leather !== 1 && s >= 0.2 && r > bl) {
        px[i] = px[i]! * b.leather;
        px[i + 1] = px[i + 1]! * b.leather;
        px[i + 2] = px[i + 2]! * b.leather;
      }
    }
    ctx.putImageData(data, 0, 0);
    const tex = new THREE.CanvasTexture(canvas);
    tex.flipY = base.map.flipY;
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    tex.wrapS = base.map.wrapS;
    tex.wrapT = base.map.wrapT;
    mat.map = tex;
  }
  recolored.set(key, mat);
  return mat;
}

/** Cópia do material com brilho próprio (lendária); a intensidade pulsa em pulseLegendary(). */
const glowing = new Set<THREE.MeshStandardMaterial>();

export function legendaryMaterial(base: THREE.MeshStandardMaterial, color = 0xffb347): THREE.MeshStandardMaterial {
  const mat = base.clone();
  mat.name = `${base.name}:lenda`;
  mat.emissive = new THREE.Color(color);
  mat.emissiveMap = base.map;
  mat.emissiveIntensity = 0.6;
  glowing.add(mat);
  return mat;
}

export function releaseLegendary(mat: THREE.Material): void {
  if (glowing.delete(mat as THREE.MeshStandardMaterial)) mat.dispose();
}

export function pulseLegendary(time: number): void {
  const k = 0.45 + 0.35 * (0.5 + 0.5 * Math.sin(time * Math.PI * 2 * 0.8));
  for (const m of glowing) m.emissiveIntensity = k;
}

/** Todas as animações de um conjunto, por nome. */
export async function clips(path: string): Promise<Map<string, THREE.AnimationClip>> {
  const g = await load(path);
  return new Map(g.animations.map((a) => [a.name, a]));
}
