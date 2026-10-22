/**
 * Sala da Cripta montada com as peças do KayKit Dungeon (grid de 4 m): piso 16 × 16, parede do
 * fundo com a porta por onde os esqueletos entram, parede da esquerda com a porta do herói, tochas
 * e enfeites sorteados pela semente visual da sala. O lado da câmera fica aberto.
 *
 * No Ato II (M3.2), a mesma sala vira as Minas Inundadas: a pedra recolorida para azul-petróleo, as
 * paredes escoradas, chão de terra, lanternas no lugar das tochas, trilhos com carrinho, minério de
 * ferro-negro e poças de água com luz fria.
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { actOf } from '../sim/index.ts';
import type { RoomKind } from '../sim/index.ts';
import { load } from './assets.ts';
import { blackIronPile, mineCart, rails } from './minecart.ts';
import { paletteMaterial } from './palette.ts';
import type { PaletteSpec } from './palette.ts';

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

/** Peças das minas: a pedra cinza do atlas vira azul-petróleo, e a madeira das escoras escurece. */
const MINE_PALETTE: PaletteSpec = {
  grid: [8, 4],
  remap: {
    '0:0': 0x33474b,
    '0:1': 0x6c8a8c,
    '0:5': 0x66706c,
    '0:7': 0x56483c,
    '0:2': 0x7a4a2f,
    '0:4': 0x583925,
  },
};

/** Nome solto é peça do KayKit Dungeon; com barra, é o arquivo de outro pack. */
async function piece(name: string, mine: boolean): Promise<THREE.Object3D> {
  const dungeon = !name.includes('/');
  const g = await load(dungeon ? `dungeon/${name}.gltf` : name);
  const o = g.scene.clone();
  if (mine && dungeon) {
    o.traverse((c) => {
      const m = c as THREE.Mesh;
      if (m.isMesh) m.material = paletteMaterial(m.material as THREE.MeshStandardMaterial, 'minas', MINE_PALETTE);
    });
  }
  return o;
}

const puddleMat = new THREE.MeshStandardMaterial({
  color: 0x5a8f9c, roughness: 0.04, metalness: 0, transparent: true, opacity: 0.6, emissive: 0x15414d, emissiveIntensity: 0.6,
});
const wetMat = new THREE.MeshStandardMaterial({ color: 0x1d2a2c, roughness: 0.3, transparent: true, opacity: 0.45 });

/** Poça d'água: uma elipse rente ao chão, quase espelhada (as luzes brilham nela), com a borda de terra molhada. */
function puddle(x: number, z: number, rx: number, rz: number, rot: number): THREE.Group {
  const g = new THREE.Group();
  for (const [mat, k, y] of [[wetMat, 1.25, 0.125], [puddleMat, 1, 0.135]] as const) {
    const m = new THREE.Mesh(new THREE.CircleGeometry(1, 20), mat);
    m.rotation.set(-Math.PI / 2, 0, rot);
    m.scale.set(rx * k, rz * k, 1);
    m.position.set(x, y, z);
    g.add(m);
  }
  g.userData.floor = true;
  return g;
}

function torchLight(x: number, y: number, z: number): THREE.PointLight {
  const l = new THREE.PointLight(0xff9a4a, 14, 13, 1.7);
  l.position.set(x, y, z);
  return l;
}

/**
 * Monta a sala. `kind` muda os enfeites (baú, santuário, prisioneiro); `remains` põe a pilha caída;
 * o andar escolhe o ato (Cripta ou Minas). A vila é outra cena (town.ts).
 */
export async function buildRoom(look: number, kind: RoomKind, remains: boolean, floor = 1): Promise<BuiltRoom> {
  if (actOf(floor) >= 2) return buildMine(look, kind, remains, floor);
  const group = new THREE.Group();
  const torches: THREE.PointLight[] = [];
  const r = rng(look);
  const put = async (name: string, x: number, z: number, rotY = 0, y = 0, scale = 1) => {
    const o = await piece(name, false);
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

/** Sala das Minas Inundadas (andares 11 a 20): a mesma planta da Cripta, com outra cara. */
async function buildMine(look: number, kind: RoomKind, remains: boolean, floor: number): Promise<BuiltRoom> {
  const group = new THREE.Group();
  const torches: THREE.PointLight[] = [];
  const r = rng(look);
  const tasks: Promise<unknown>[] = [];
  const place = (o: THREE.Object3D, x: number, z: number, rotY: number, y: number, scale: number, flat: boolean) => {
    o.userData.floor = flat;
    o.position.set(x, y, z);
    o.rotation.y = rotY;
    if (scale !== 1) o.scale.setScalar(scale);
    group.add(o);
  };
  const put = (name: string, x: number, z: number, rotY = 0, y = 0, scale = 1) => {
    tasks.push(piece(name, true).then((o) => place(o, x, z, rotY, y, scale, name.startsWith('floor_'))));
  };
  // Chão de terra, às vezes com pedras.
  for (const x of [-6, -2, 2, 6]) {
    for (const z of [-6, -2, 2, 6]) put(r() < 0.4 ? 'floor_dirt_large_rocky' : 'floor_dirt_large', x, z, Math.floor(r() * 4) * (Math.PI / 2));
  }
  // Paredes escoradas, com as portas no mesmo lugar da Cripta.
  for (const x of [-6, -2, 2, 6]) {
    const name = x === ENEMY_DOOR.x ? 'wall_doorway_scaffold' : (['wall_scaffold', 'wall_scaffold', 'wall_cracked', 'wall', 'wall_window_closed_scaffold'] as const)[Math.floor(r() * 5)]!;
    put(name, x, -8);
  }
  for (const z of [-6, -2, 2, 6]) put(z === HERO_DOOR.z ? 'wall_doorway_scaffold' : r() < 0.55 ? 'wall_scaffold' : r() < 0.4 ? 'wall_cracked' : 'wall', -8, z, Math.PI / 2);
  put('pillar', -8, -8);
  put('pillar', 8, -8);
  put('pillar', -8, 8);
  // Lanternas penduradas nas escoras, com luz mais amarela que a das tochas.
  for (const [x, z, rot] of [[-4, -7.3, 0], [6, -7.3, 0], [-7.3, -2, Math.PI / 2]] as const) {
    put('tools/lantern.gltf', x, z, rot, 2.5, 1.1);
    const l = new THREE.PointLight(0xffc477, 14, 13, 1.7);
    l.position.set(x + (rot ? 0.5 : 0), 3, z + (rot ? 0 : 0.5));
    torches.push(l);
    group.add(l);
  }
  // Trilhos ao longo do fundo, com o carrinho de minério parado neles.
  const railZ = -5.4;
  const track = rails(-7.6, 7.6);
  track.position.z = railZ;
  group.add(track);
  const cartX = r() < 0.5 ? -4.8 : 5.4;
  tasks.push(mineCart(true).then((c) => place(c, cartX, railZ, r() < 0.5 ? 0 : Math.PI, 0, 1, false)));
  if (floor % 5 === 0) tasks.push(mineCart(r() < 0.5).then((c) => place(c, -cartX * 0.9, railZ, 0, 0, 1, false)));
  // Minério, pedra e ferramentas, no fundo e na esquerda (o lado da câmera fica livre).
  const props: [string, number, number, number?][] = [
    ['Stone_Chunks_Large', -6.4, -6.6, 1], ['ferro', 6.6, -6.7], ['resource/Wood_Planks_Stack_Small.gltf', -6.7, -0.4, 1.3],
    ['barrel_large', 6.8, -4.2], ['keg', -6.5, 4.6, 0.7], ['tools/bucket_metal.gltf', -5.6, -3.8, 1], ['ferro', -6.6, 1.4],
    ['Stone_Chunks_Small', 2.8, -6.9, 1], ['rubble_half', -6.6, -2.6, 0.7], ['box_stacked', 6.3, -6.6],
  ];
  for (const [name, x, z, scale] of props) {
    if (r() > 0.6) continue;
    const rot = r() * Math.PI * 2;
    if (name === 'ferro') tasks.push(blackIronPile(r() < 0.5 ? 'resource/Iron_Nuggets.gltf' : 'resource/Iron_Nugget_Large.gltf').then((o) => place(o, x, z, rot, 0, 1.6, false)));
    else put(name.startsWith('Stone') ? `resource/${name}.gltf` : name, x, z, rot, 0, scale ?? 1);
  }
  // A picareta encostada na parede da esquerda.
  if (r() < 0.6) put('tools/pickaxe.gltf', -7.2, 4.2, Math.PI / 2 + 0.3, 0.2, 1);
  // Uma escora solta na esquerda do fundo, como um arco de madeira.
  if (r() < 0.5) put('wall_open_scaffold', -6, -3.6, 0, 0, 1);
  // Poças com luz fria; na sala da Couraça Submersa, uma poça grande de onde ela sai.
  const spots: [number, number][] = [[-3.4, 3.4], [3.8, 2.6], [0.4, -3.4], [4.6, -2.4], [-2.6, -0.6]];
  const n = 2 + Math.floor(r() * 2);
  for (let i = 0; i < n; i++) {
    const [x, z] = spots.splice(Math.floor(r() * spots.length), 1)[0]!;
    group.add(puddle(x, z, 0.8 + r() * 0.8, 0.6 + r() * 0.5, r() * Math.PI));
  }
  const bossPool = kind === 'chefe' && floor === 20;
  if (bossPool) group.add(puddle(2.4, -3.6, 3.6, 2.4, 0.2));
  const cold = new THREE.PointLight(0x6cc8ff, bossPool ? 9 : 5, bossPool ? 10 : 7, 1.8);
  cold.position.set(bossPool ? 2.4 : 0, 1.2, bossPool ? -3.6 : 0);
  group.add(cold);
  if (kind === 'bau') put('chest_gold', 5.8, -4.2, -0.5);
  if (kind === 'santuario') {
    put('pillar_decorated', 0, -5, 0, 0, 0.6);
    put('candle_triple', -1.2, -4.6);
    put('candle_triple', 1.2, -4.6);
    const l = new THREE.PointLight(0x9fd8ff, 10, 9, 1.6);
    l.position.set(0, 2.2, -4.2);
    group.add(l);
  }
  if (kind === 'prisioneiro') {
    put('keyring_hanging', -7.5, -4.6, Math.PI / 2, 2.2);
    put('stool', -5.2, -5.4);
  }
  if (kind === 'chefe') put('sword_shield_broken', -3, -5.8, 0.6);
  let remainsSpot: THREE.Vector3 | null = null;
  if (remains) {
    remainsSpot = new THREE.Vector3(-3.4, 0, -2.6);
    put('sword_shield_broken', remainsSpot.x, remainsSpot.z, 0.7);
    put('coin_stack_small', remainsSpot.x + 0.9, remainsSpot.z + 0.4);
    const l = new THREE.PointLight(0xffd27a, 6, 4, 2);
    l.position.set(remainsSpot.x, 0.8, remainsSpot.z);
    group.add(l);
  }
  await Promise.all(tasks);
  for (const c of group.children) {
    c.updateMatrix();
    c.matrixAutoUpdate = false;
  }
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
