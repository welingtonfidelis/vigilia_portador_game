/**
 * Sala da Cripta montada com as peças do KayKit Dungeon (grid de 4 m): piso 16 × 16, parede do
 * fundo com a porta por onde os esqueletos entram, parede da esquerda com a porta do herói, tochas
 * e enfeites sorteados pela semente visual da sala. O lado da câmera fica aberto.
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { RoomKind } from '../sim/index.ts';
import { load } from './assets.ts';

export const DUNGEON_PIECES = [
  'floor_tile_large', 'floor_tile_large_rocks', 'floor_dirt_large', 'wall', 'wall_doorway', 'wall_cracked', 'wall_arched',
  'wall_broken', 'wall_shelves', 'wall_window_closed', 'pillar', 'pillar_decorated', 'column', 'torch_mounted', 'torch_lit', 'chest',
  'chest_gold', 'barrel_large', 'barrel_small', 'barrel_small_stack', 'box_large', 'box_small', 'box_stacked', 'crates_stacked',
  'rubble_large', 'rubble_half', 'banner_red', 'banner_patternA_red', 'banner_thin_red', 'coin_stack_small', 'coin_stack_medium',
  'candle_lit', 'candle_triple', 'table_medium_broken', 'table_small', 'chair', 'stool', 'sword_shield_broken', 'keyring_hanging',
  'bottle_A_green', 'trunk_medium_A',
].map((n) => `dungeon/${n}.gltf`);

/** Onde ficam as portas (o 3D usa para a fila de esqueletos e a entrada do herói). */
export const ENEMY_DOOR = new THREE.Vector3(2, 0, -8);
export const HERO_DOOR = new THREE.Vector3(-8, 0, 2);

export interface BuiltRoom {
  group: THREE.Group;
  torches: THREE.PointLight[];
  remainsSpot: THREE.Vector3 | null;
}

function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

async function piece(name: string): Promise<THREE.Object3D> {
  const g = await load(`dungeon/${name}.gltf`);
  return g.scene.clone();
}

function torchLight(x: number, y: number, z: number): THREE.PointLight {
  const l = new THREE.PointLight(0xff9a4a, 14, 13, 1.7);
  l.position.set(x, y, z);
  return l;
}

/** Monta a sala. `kind` muda os enfeites (baú, santuário, prisioneiro); `remains` põe a pilha caída. A vila é outra cena (town.ts). */
export async function buildRoom(look: number, kind: RoomKind, remains: boolean): Promise<BuiltRoom> {
  const group = new THREE.Group();
  const torches: THREE.PointLight[] = [];
  const r = rng(look);
  const put = async (name: string, x: number, z: number, rotY = 0, y = 0, scale = 1) => {
    const o = await piece(name);
    o.userData.floor = name.startsWith('floor_');
    o.position.set(x, y, z);
    o.rotation.y = rotY;
    if (scale !== 1) o.scale.setScalar(scale);
    o.updateMatrix();
    o.matrixAutoUpdate = false;
    o.traverse((c) => {
      c.updateMatrix();
      c.matrixAutoUpdate = false;
    });
    group.add(o);
    return o;
  };
  const tasks: Promise<unknown>[] = [];
  // Piso 4 × 4 de 4 m.
  for (const x of [-6, -2, 2, 6]) {
    for (const z of [-6, -2, 2, 6]) {
      const name = 'floor_tile_large';
      r();
      tasks.push(put(name, x, z, Math.floor(r() * 4) * (Math.PI / 2)));
    }
  }
  // Parede do fundo (z = −8) com a porta dos inimigos em x = 2.
  for (const x of [-6, -2, 2, 6]) {
    const name = x === ENEMY_DOOR.x ? 'wall_doorway' : (['wall', 'wall', 'wall_cracked', 'wall_arched', 'wall_shelves', 'wall_window_closed'] as const)[Math.floor(r() * 6)]!;
    tasks.push(put(name, x, -8));
  }
  // Parede da esquerda (x = −8) com a porta do herói em z = 2.
  for (const z of [-6, -2, 2, 6]) {
    const name = z === HERO_DOOR.z ? 'wall_doorway' : r() < 0.25 ? 'wall_cracked' : 'wall';
    tasks.push(put(name, -8, z, Math.PI / 2));
  }
  tasks.push(put('pillar', -8, -8), put('pillar_decorated', 8, -8), put('pillar', -8, 8));
  // Tochas na parede do fundo e na da esquerda.
  for (const [x, z, rot] of [[-4, -7.5, 0], [6, -7.5, 0], [-7.5, -2, Math.PI / 2]] as const) {
    tasks.push(put('torch_mounted', x, z, rot, 2.4));
    const l = torchLight(x + (rot ? 0.7 : 0), 3.1, z + (rot ? 0 : 0.7));
    torches.push(l);
    group.add(l);
  }
  tasks.push(put(r() < 0.5 ? 'banner_red' : 'banner_patternA_red', -2, -7.9, 0, 0));
  {
    // Enfeites só no fundo e na esquerda: o lado da câmera (x e z positivos) fica livre.
    const props: [string, number, number][] = [
      ['barrel_large', -6.4, -6.2], ['barrel_small', -5.2, -6.8], ['box_stacked', 6.4, -6.4], ['crates_stacked', -6.6, 4.8],
      ['rubble_half', -6.5, -2.2], ['column', -5.4, -4.4], ['box_small', 5.2, -6.8], ['table_medium_broken', -6.2, 0.2],
      ['stool', -5.0, 0.9], ['candle_lit', -6.6, -4.6], ['barrel_small_stack', 6.8, -4.4],
    ];
    for (const [name, x, z] of props) if (r() < 0.55) tasks.push(put(name, x, z, r() * Math.PI * 2));
    if (kind === 'bau') tasks.push(put('chest_gold', 5.8, -5.6, -0.5), put('coin_stack_medium', 4.6, -6.2));
    if (kind === 'santuario') {
      tasks.push(put('pillar_decorated', 0, -5, 0, 0, 0.6), put('candle_triple', -1.2, -4.6), put('candle_triple', 1.2, -4.6));
      const l = new THREE.PointLight(0x9fd8ff, 10, 9, 1.6);
      l.position.set(0, 2.2, -4.2);
      group.add(l);
    }
    if (kind === 'prisioneiro') tasks.push(put('keyring_hanging', -7.5, -4.6, Math.PI / 2, 2.2), put('chair', -6.0, -4.4, 1.4), put('stool', -5.2, -5.4));
    if (kind === 'chefe') tasks.push(put('banner_thin_red', 6, -7.9), put('banner_thin_red', -6, -7.9), put('sword_shield_broken', -3, -5.5, 0.6));
  }
  let remainsSpot: THREE.Vector3 | null = null;
  if (remains) {
    remainsSpot = new THREE.Vector3(-3.4, 0, -2.6);
    tasks.push(put('sword_shield_broken', remainsSpot.x, remainsSpot.z, 0.7), put('coin_stack_small', remainsSpot.x + 0.9, remainsSpot.z + 0.4));
    const l = new THREE.PointLight(0xffd27a, 6, 4, 2);
    l.position.set(remainsSpot.x, 0.8, remainsSpot.z);
    group.add(l);
  }
  await Promise.all(tasks);
  return { group: mergeStatic(group), torches, remainsSpot };
}

const KEEP_ATTRS = ['position', 'normal', 'uv'];

/**
 * Junta as peças fixas numa malha por material (o piso à parte, sem projetar sombra): a sala cai
 * de ~60 chamadas de desenho para 2 ou 3. As luzes continuam soltas.
 */
export function mergeStatic(group: THREE.Group): THREE.Group {
  group.updateMatrixWorld(true);
  const buckets = new Map<string, { mat: THREE.Material; floor: boolean; geos: THREE.BufferGeometry[] }>();
  const out = new THREE.Group();
  const lights: THREE.Object3D[] = [];
  for (const child of group.children) {
    if ((child as THREE.Light).isLight) {
      lights.push(child);
      continue;
    }
    const floor = !!child.userData.floor;
    child.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      const mat = m.material as THREE.Material;
      const key = `${mat.uuid}:${floor}`;
      let b = buckets.get(key);
      if (!b) buckets.set(key, (b = { mat, floor, geos: [] }));
      const g = m.geometry.clone();
      for (const name of Object.keys(g.attributes)) if (!KEEP_ATTRS.includes(name)) g.deleteAttribute(name);
      g.applyMatrix4(m.matrixWorld);
      b.geos.push(g);
    });
  }
  for (const b of buckets.values()) {
    const indexed = b.geos.filter((g) => !!g.index);
    const plain = b.geos.filter((g) => !g.index);
    for (const list of [indexed, plain]) {
      if (!list.length) continue;
      const merged = mergeGeometries(list, false);
      if (!merged) continue;
      const mesh = new THREE.Mesh(merged, b.mat);
      mesh.receiveShadow = true;
      mesh.castShadow = !b.floor;
      mesh.matrixAutoUpdate = false;
      out.add(mesh);
    }
    for (const g of b.geos) g.dispose();
  }
  for (const l of lights) out.add(l);
  return out;
}
