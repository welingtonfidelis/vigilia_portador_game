/**
 * Sala da Cripta montada com as peças do KayKit Dungeon (grid de 4 m): piso 16 × 16, parede do
 * fundo com a porta por onde os esqueletos entram, parede da esquerda com a porta do herói, tochas
 * e enfeites sorteados pela semente visual da sala. O lado da câmera fica aberto.
 *
 * No Ato II (M3.2), a mesma sala vira as Minas Inundadas: a pedra recolorida para azul-petróleo, as
 * paredes escoradas, chão de terra, lanternas no lugar das tochas, trilhos com carrinho, minério de
 * ferro-negro e poças de água com luz fria.
 *
 * No Ato III (M3.3), o Jardim de Fungos: a pedra violeta e verde doente, paredes quebradas, cogumelos
 * gigantes com pintas que brilham (a luz da sala vem deles), névoa no chão e esporos no ar.
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { actOf } from '../sim/index.ts';
import type { RoomKind } from '../sim/index.ts';
import { load } from './assets.ts';
import { blackIronPile, mineCart, rails } from './minecart.ts';
import { glowColor, mushroom } from './mushrooms.ts';
import { paletteMaterial } from './palette.ts';
import type { PaletteSpec } from './palette.ts';
import { MOTION } from './motion.ts';

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

/** Peças dos Fungos: a pedra vira violeta, o chão, musgo, e a madeira apodrece. */
const FUNGUS_PALETTE: PaletteSpec = {
  grid: [8, 4],
  remap: {
    '0:0': 0x3a3049,
    '0:1': 0x6f6887,
    '0:5': 0x5c6650,
    '0:7': 0x4a4236,
    '0:2': 0x6a5638,
    '0:4': 0x4c3c29,
  },
};

const PALETTES: Record<string, PaletteSpec> = { minas: MINE_PALETTE, fungos: FUNGUS_PALETTE };

/** Nome solto é peça do KayKit Dungeon; com barra, é o arquivo de outro pack. `pal` recolore as do Dungeon. */
async function piece(name: string, pal: keyof typeof PALETTES | null): Promise<THREE.Object3D> {
  const dungeon = !name.includes('/');
  const g = await load(dungeon ? `dungeon/${name}.gltf` : name);
  const o = g.scene.clone();
  if (pal && dungeon) {
    o.traverse((c) => {
      const m = c as THREE.Mesh;
      if (m.isMesh) m.material = paletteMaterial(m.material as THREE.MeshStandardMaterial, pal, PALETTES[pal]!);
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
  if (actOf(floor) >= 3) return buildFungus(look, kind, remains, floor);
  if (actOf(floor) >= 2) return buildMine(look, kind, remains, floor);
  const group = new THREE.Group();
  const torches: THREE.PointLight[] = [];
  const r = rng(look);
  const put = async (name: string, x: number, z: number, rotY = 0, y = 0, scale = 1) => {
    const o = await piece(name, null);
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
    tasks.push(piece(name, 'minas').then((o) => place(o, x, z, rotY, y, scale, name.startsWith('floor_'))));
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

const mistTex = (() => {
  if (typeof document === 'undefined') return null;
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(64, 64, 4, 64, 64, 64);
  grad.addColorStop(0, 'rgba(255,255,255,0.9)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(c);
})();
const mistMat = new THREE.MeshBasicMaterial({ color: 0x9a7ad0, map: mistTex, transparent: true, opacity: 0.32, depthWrite: false });

/** Esporos no ar: pontinhos que sobem devagar, balançando (mexem sozinhos, a cada quadro). */
function spores(seed: number): THREE.Points {
  const n = 54;
  const base = new Float32Array(n * 3);
  const r = rng(seed);
  for (let i = 0; i < n; i++) base.set([-7 + r() * 14, r() * 4, -7 + r() * 11], i * 3);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(base.slice(), 3));
  const mat = new THREE.PointsMaterial({ color: 0xd8ff9a, size: 0.09, transparent: true, opacity: 0.85, depthWrite: false, blending: THREE.AdditiveBlending });
  const pts = new THREE.Points(geo, mat);
  pts.frustumCulled = false;
  pts.onBeforeRender = () => {
    // Com o movimento reduzido, os esporos ficam parados no ar.
    if (MOTION.reduced) return;
    const t = performance.now() / 1000;
    const pos = geo.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < n; i++) {
      const y = (base[i * 3 + 1]! + t * 0.18) % 4;
      pos.setXYZ(i, base[i * 3]! + Math.sin(t * 0.6 + i) * 0.3, 0.3 + y, base[i * 3 + 2]! + Math.cos(t * 0.5 + i * 1.7) * 0.3);
    }
    pos.needsUpdate = true;
  };
  return pts;
}

/** Sala do Jardim de Fungos (andares 21 a 30): a planta da Cripta tomada por cogumelos. */
async function buildFungus(look: number, kind: RoomKind, remains: boolean, floor: number): Promise<BuiltRoom> {
  const group = new THREE.Group();
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
    tasks.push(piece(name, 'fungos').then((o) => place(o, x, z, rotY, y, scale, name.startsWith('floor_'))));
  };
  for (const x of [-6, -2, 2, 6]) {
    for (const z of [-6, -2, 2, 6]) put(r() < 0.35 ? 'floor_dirt_large_rocky' : 'floor_dirt_large', x, z, Math.floor(r() * 4) * (Math.PI / 2));
  }
  for (const x of [-6, -2, 2, 6]) {
    const name = x === ENEMY_DOOR.x ? 'wall_doorway' : (['wall', 'wall_cracked', 'wall_broken', 'wall_cracked'] as const)[Math.floor(r() * 4)]!;
    put(name, x, -8);
  }
  for (const z of [-6, -2, 2, 6]) put(z === HERO_DOOR.z ? 'wall_doorway' : r() < 0.5 ? 'wall_cracked' : 'wall', -8, z, Math.PI / 2);
  put('pillar', -8, -8);
  put('pillar', 8, -8);
  put('pillar', -8, 8);
  // Cogumelos gigantes nos cantos do fundo e na esquerda, e tufos pequenos junto das paredes; a luz
  // da sala vem das pintas deles.
  const boss = kind === 'chefe';
  // Só no fundo e no lado do fundo: na frente da câmera, um chapéu grande tapava a luta.
  const giants: [number, number][] = [[-6.3, -6.4], [5.9, -6.5], [-6.7, -2.6], [6.7, -3.6], ...(boss ? ([[-3.4, -6.9], [0.2, -6.9]] as [number, number][]) : [])];
  for (const [x, z] of giants) {
    if (!boss && r() < 0.25) continue;
    const m = mushroom(2.2 + r() * 1.3 + (boss && floor === 30 ? 0.8 : 0), Math.floor(r() * 1e9));
    m.position.set(x, 0, z);
    group.add(m);
  }
  const lights: [number, number][] = [[-5.6, -5.6], [5.2, -5.8], [-6, 2.4]];
  for (const [i, [x, z]] of lights.entries()) {
    const l = new THREE.PointLight(glowColor(look + i), boss ? 12 : 9, 11, 1.7);
    l.position.set(x, 2.2, z);
    group.add(l);
  }
  for (let i = 0; i < 9; i++) {
    const wallSide = r() < 0.5;
    const x = wallSide ? -7 + r() * 1.4 : -6 + r() * 13;
    const z = wallSide ? -6.5 + r() * 12 : -7.2 + r() * 1.2;
    if (Math.abs(x - ENEMY_DOOR.x) < 1.6 && z < -6) continue;
    if (Math.abs(z - HERO_DOOR.z) < 1.6 && x < -6) continue;
    const m = mushroom(0.45 + r() * 0.7, Math.floor(r() * 1e9));
    m.position.set(x, 0, z);
    group.add(m);
  }
  if (r() < 0.6) put('rubble_half', -6.6, -3.4, r() * 6, 0, 0.7);
  if (r() < 0.6) put('resource/Stone_Chunks_Small.gltf', 3.2, -6.9, r() * 6);
  // Névoa violeta rente ao chão.
  for (let i = 0; i < 3; i++) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), mistMat);
    m.rotation.x = -Math.PI / 2;
    m.scale.setScalar(7 + r() * 5);
    m.position.set(-3 + r() * 7, 0.22 + i * 0.03, -4 + r() * 6);
    m.userData.floor = true;
    group.add(m);
  }
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
  const merged = mergeStatic(group);
  merged.add(spores(look));
  return { group: merged, torches: [], remainsSpot };
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
