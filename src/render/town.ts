/**
 * A vila do M2 (docs/VIGILIA-PORTADOR.md §14.3): prédios do Kenney Fantasy Town montados peça por
 * peça (×4, grid de 4 m), enfeites do KayKit, a entrada da Cripta e a fogueira de vigília. Só lê o
 * estado: cada lote é remontado quando o estado dele muda (ruína, obra, pronto, ampliado).
 */
import * as THREE from 'three';
import { CELL, CRYPT, FIRE, LOTS, daylight, fountainOn, lotKey, lotView, roadCells, townHour } from '../game/townPlan.ts';
import type { Lot, LotView, Side } from '../game/townPlan.ts';
import type { World } from '../sim/index.ts';
import { load } from './assets.ts';
import { mergeStatic } from './dungeon.ts';

const K = CELL;
const kn = (name: string) => `kenney-town/${name}.glb`;

/** Rotação de uma parede do Kenney (que fica na face +x da célula) para cada lado. */
const FACE_ROT: Record<Side, number> = { e: 0, n: Math.PI / 2, w: Math.PI, s: -Math.PI / 2 };
const FACE_DIR: Record<Side, [number, number]> = { e: [1, 0], n: [0, -1], w: [-1, 0], s: [0, 1] };

function hash(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619) >>> 0;
  return h;
}

function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

async function put(group: THREE.Group, file: string, x: number, z: number, rotY = 0, scale = 1, y = 0, floor = false): Promise<THREE.Object3D> {
  const g = await load(file);
  const o = g.scene.clone();
  o.position.set(x, y, z);
  o.rotation.y = rotY;
  o.scale.setScalar(scale);
  o.userData.floor = floor;
  group.add(o);
  return o;
}

/** Faces externas de um lote: [lado, x e z da célula]. */
function faces(lot: Lot): [Side, number, number][] {
  const out: [Side, number, number][] = [];
  for (let i = 0; i < lot.w; i++) {
    for (let j = 0; j < lot.d; j++) {
      const x = lot.x + i * K, z = lot.z + j * K;
      if (i === lot.w - 1) out.push(['e', x, z]);
      if (i === 0) out.push(['w', x, z]);
      if (j === 0) out.push(['n', x, z]);
      if (j === lot.d - 1) out.push(['s', x, z]);
    }
  }
  return out;
}

/** A célula da porta: no meio do lado (a primeira, nos lotes de 2). */
function isDoorFace(lot: Lot, side: Side, x: number, z: number): boolean {
  if (side !== lot.door) return false;
  return side === 'n' || side === 's' ? x === lot.x : z === lot.z + (lot.d - 1) * K;
}

/** Ponto em frente à porta, de onde saem os objetos do ofício, e o vetor ao longo da fachada. */
export function lotFront(lot: Lot): { x: number; z: number; along: [number, number]; out: [number, number] } {
  const [dx, dz] = FACE_DIR[lot.door];
  const cx = lot.x + ((lot.w - 1) * K) / 2, cz = lot.z + ((lot.d - 1) * K) / 2;
  const reach = ((dx !== 0 ? lot.w : lot.d) * K) / 2 + 2.6;
  return { x: cx + dx * reach, z: cz + dz * reach, along: [-dz, dx], out: [dx, dz] };
}

async function buildLot(lot: Lot, view: LotView): Promise<THREE.Group> {
  const group = new THREE.Group();
  const r = rng(hash(lot.id));
  const tasks: Promise<unknown>[] = [];
  const wall = (kind: string) => kn(lot.wood ? `wall-wood${kind}` : `wall${kind}`);
  const floors = view.state === 'ampliada' ? 2 : 1;
  if (view.state === 'vazio') return group;
  if (view.state === 'pronta' || view.state === 'ampliada') {
    for (const [side, x, z] of faces(lot)) {
      for (let f = 0; f < floors; f++) {
        const door = f === 0 && isDoorFace(lot, side, x, z);
        const kind = door ? '-door' : r() < 0.55 ? (r() < 0.5 ? '-window-shutters' : '-window-glass') : '';
        tasks.push(put(group, wall(kind), x, z, FACE_ROT[side], K, f * K));
      }
    }
    for (let i = 0; i < lot.w; i++) {
      for (let j = 0; j < lot.d; j++) {
        tasks.push(put(group, kn('roof'), lot.x + i * K, lot.z + j * K, j < lot.d / 2 ? Math.PI / 2 : -Math.PI / 2, K, floors * K));
      }
    }
    tasks.push(put(group, kn('chimney'), lot.x + (lot.w - 1) * K, lot.z, 0, K, floors * K + 0.4 * K));
    if (view.state === 'ampliada') {
      const f = lotFront(lot);
      tasks.push(put(group, kn(lot.wood ? 'banner-green' : 'banner-red'), f.x - f.out[0] * 2.4 + f.along[0] * 3, f.z - f.out[1] * 2.4 + f.along[1] * 3, FACE_ROT[lot.door], K * 0.8));
    }
  } else if (view.state === 'obra') {
    for (const [side, x, z] of faces(lot)) {
      tasks.push(put(group, wall('-half'), x, z, FACE_ROT[side], K));
      if (r() < 0.5) tasks.push(put(group, kn('poles'), x, z, FACE_ROT[side], K));
    }
    for (let i = 0; i < lot.w; i++) for (let j = 0; j < lot.d; j++) tasks.push(put(group, kn('planks'), lot.x + i * K, lot.z + j * K, 0, K, 0, true));
    const f = lotFront(lot);
    tasks.push(
      put(group, 'resource/Wood_Planks_Stack_Medium.gltf', f.x + f.along[0] * 3, f.z + f.along[1] * 3, r() * 3, 1.6),
      put(group, 'resource/Stone_Bricks_Stack_Medium.gltf', f.x - f.along[0] * 3, f.z - f.along[1] * 3, r() * 3, 1.6),
    );
  } else {
    // Ruína: algumas paredes quebradas, tábuas soltas e mato.
    for (const [side, x, z] of faces(lot)) {
      if (r() < 0.55) tasks.push(put(group, kn(lot.wood ? 'wall-wood-broken' : 'wall-broken'), x, z, FACE_ROT[side], K));
    }
    tasks.push(put(group, kn('planks-half'), lot.x + K * 0.5, lot.z + K * 0.5, r() * 6, K, 0, true));
    tasks.push(put(group, 'forest/Bush_1_A_Color1.gltf', lot.x + K * (lot.w - 1), lot.z, r() * 6, 7));
  }
  if (view.scaffold) {
    for (const [side, x, z] of faces(lot)) if (r() < 0.6) tasks.push(put(group, kn('poles'), x, z, FACE_ROT[side], K, K * 0.02));
    const f = lotFront(lot);
    tasks.push(put(group, 'resource/Wood_Planks_Stack_Medium.gltf', f.x + f.along[0] * 3.4, f.z + f.along[1] * 3.4, 0.4, 1.6));
  }
  if (view.state === 'pronta' || view.state === 'ampliada') tasks.push(...props(group, lot, r, view.state === 'ampliada'));
  await Promise.all(tasks);
  return mergeStatic(group);
}

/** Objetos do ofício em frente à porta (docs §14.3). */
function props(group: THREE.Group, lot: Lot, r: () => number, big: boolean): Promise<unknown>[] {
  const f = lotFront(lot);
  const at = (along: number, out: number) => [f.x + f.along[0] * along + f.out[0] * out, f.z + f.along[1] * along + f.out[1] * out] as const;
  const face = Math.atan2(f.out[0], f.out[1]);
  const p: Promise<unknown>[] = [];
  const add = (file: string, along: number, out: number, rot = face, scale = 1, y = 0) => {
    const [x, z] = at(along, out);
    p.push(put(group, file, x, z, rot, scale, y));
  };
  switch (lot.kind) {
    case 'ferreiro':
      add('tools/anvil.gltf', 2.2, 0.4, face + 0.4, 1.4);
      add('tools/grindstone.gltf', -2.6, 0.2, face - 0.3, 1.1);
      add('resource/Iron_Bars_Stack_Small.gltf', 4, -1.2, face, 1.3);
      if (big) add('resource/Wood_Log_Stack.gltf', -4.2, -1.4, face, 1.4);
      break;
    case 'treinador':
      add('hexagon/target.gltf', 3, 1, face, 6);
      add('hexagon/weaponrack.gltf', -2.6, -0.6, face, 6);
      if (big) add('hexagon/target.gltf', 5.4, 1.6, face + 0.3, 6);
      break;
    case 'alquimista':
      add('furniture/table_medium.gltf', 2.4, 0.4, face, 1.1);
      add('dungeon/bottle_A_green.gltf', 2.2, 0.4, face, 1.6, 1.1);
      add('dungeon/barrel_small.gltf', -2.6, -0.4, face, 1);
      add('mixed/flax_flower_A.gltf', -4, 0.8, face, 2.4);
      break;
    case 'carroceiro':
      add('kenney-town/cart.glb', 3.4, 0.6, face + Math.PI / 2, K * 0.9);
      add('resource/Textiles_Stack_Small.gltf', -2.6, -0.6, face, 1.2);
      break;
    case 'curandeira':
      add('furniture/bed_single_A.gltf', 2.8, 0.4, face + Math.PI / 2, 1.1);
      add('mixed/flax_flower_A.gltf', -2.2, 0.6, face, 2.4);
      add('mixed/flax_flower_B.gltf', -3.2, 1.2, face + 1, 2.4);
      add('furniture/chair_A_wood.gltf', 0.9, 1.6, face + Math.PI, 1.2);
      break;
    case 'taticas':
      add('furniture/table_medium.gltf', 2.6, 0.6, face, 1.3);
      add('tools/map.gltf', 2.6, 0.6, face, 0.9, 1.3);
      add('tools/compass_base.gltf', 2.0, 0.2, face, 1, 1.3);
      add('furniture/chair_A_wood.gltf', 2.6, 2.3, face + Math.PI, 1.2);
      break;
    case 'casa':
      if (r() < 0.6) add('resource/Wood_Log_A.gltf', 3, -0.6, face + r(), 1.6);
      if (r() < 0.5) add('mixed/flax_flower_B.gltf', -2.4, 0.4, face, 2.4);
      if (r() < 0.4) add('dungeon/barrel_small.gltf', 2.4, 0.6, face, 1);
      break;
  }
  return p;
}

export class Town {
  readonly group = new THREE.Group();
  private lots = new Map<string, { key: string; group: THREE.Group | null; building: boolean }>();
  private water: THREE.Object3D[] = [];
  private fire!: THREE.PointLight;
  private flame!: THREE.Mesh;
  private lanterns: THREE.PointLight[] = [];
  ready = false;

  async init(): Promise<void> {
    const statics = new THREE.Group();
    const tasks: Promise<unknown>[] = [];
    // Chão de grama e as ruas de pedra.
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(190, 190), new THREE.MeshStandardMaterial({ color: 0x6f9448, roughness: 1 }));
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    this.group.add(ground);
    for (const [x, z] of roadCells()) tasks.push(put(statics, kn('road'), x, z, 0, K, 0.01, true));
    // Lanternas nos cantos da praça e bancos em volta da fonte.
    for (const [x, z] of [[-10, -10], [10, -10], [-10, 10], [10, 10]] as const) {
      tasks.push(put(statics, kn('lantern'), x, z, 0, K * 0.75));
      const l = new THREE.PointLight(0xffc27a, 0, 16, 1.6);
      l.position.set(x, 4.3, z);
      this.lanterns.push(l);
      this.group.add(l);
    }
    for (const [x, z, rot] of [[0, -6.4, 0], [0, 6.4, Math.PI], [-6.4, 0, Math.PI / 2], [6.4, 0, -Math.PI / 2]] as const) {
      tasks.push(put(statics, kn('stall-bench'), x + (x === 0 ? 3 : 0), z + (z === 0 ? 3 : 0), rot, K));
    }
    // Entrada da Cripta: o arco da masmorra virado para o leste, encostado num morro de pedra a oeste.
    // A câmera vem do sudeste: o herói chega pela frente do arco e empurra a porta à vista.
    tasks.push(
      put(statics, 'dungeon/wall_doorway.gltf', CRYPT.x, CRYPT.z, Math.PI / 2, 1),
      put(statics, 'dungeon/pillar.gltf', CRYPT.x, CRYPT.z - 2.4, 0, 1),
      put(statics, 'dungeon/pillar.gltf', CRYPT.x, CRYPT.z + 2.4, 0, 1),
      put(statics, 'dungeon/torch_mounted.gltf', CRYPT.x + 0.6, CRYPT.z - 1.6, Math.PI / 2, 1, 2.6),
      put(statics, 'dungeon/torch_mounted.gltf', CRYPT.x + 0.6, CRYPT.z + 1.6, Math.PI / 2, 1, 2.6),
      put(statics, kn('rock-large'), CRYPT.x - 4, CRYPT.z - 2.5, 0.4, K * 1.1),
      put(statics, kn('rock-large'), CRYPT.x - 4.5, CRYPT.z + 3, 2.1, K * 1.0),
      put(statics, kn('rock-wide'), CRYPT.x - 6.5, CRYPT.z, 1.6, K * 1.6),
      put(statics, kn('rock-small'), CRYPT.x - 1.5, CRYPT.z + 4.4, 1.2, K * 0.5),
    );
    // Fogueira de vigília: pedras, lenha cruzada e a chama (a luz tremula em update()).
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      tasks.push(put(statics, 'forest/Rock_1_A_Color1.gltf', FIRE.x + Math.cos(a) * 1.15, FIRE.z + Math.sin(a) * 1.15, a, 1.05));
    }
    tasks.push(put(statics, 'resource/Wood_Log_A.gltf', FIRE.x, FIRE.z, 0.6, 1.1), put(statics, 'resource/Wood_Log_A.gltf', FIRE.x, FIRE.z, 2.2, 1.1));
    this.flame = new THREE.Mesh(new THREE.ConeGeometry(0.6, 1.9, 7), new THREE.MeshBasicMaterial({ color: 0xffa23a, transparent: true, opacity: 0.9 }));
    this.flame.position.set(FIRE.x, 1.05, FIRE.z);
    this.group.add(this.flame);
    this.fire = new THREE.PointLight(0xff9a4a, 22, 18, 1.6);
    this.fire.position.set(FIRE.x, 1.8, FIRE.z);
    this.group.add(this.fire);
    // Floresta em volta (anel com árvores e arbustos do KayKit Forest, sorteados).
    const r = rng(77);
    const trees = ['Tree_1_A', 'Tree_2_A', 'Tree_3_A', 'Tree_4_A'];
    for (let i = 0; i < 46; i++) {
      const a = r() * Math.PI * 2;
      const rad = 56 + r() * 22;
      tasks.push(put(statics, `forest/${trees[Math.floor(r() * trees.length)]}_Color1.gltf`, Math.cos(a) * rad, Math.sin(a) * rad, r() * 6, 1.6 + r() * 0.8));
    }
    for (let i = 0; i < 26; i++) {
      const a = r() * Math.PI * 2;
      const rad = 50 + r() * 8;
      tasks.push(put(statics, `forest/Bush_${r() < 0.5 ? 1 : 2}_A_Color1.gltf`, Math.cos(a) * rad, Math.sin(a) * rad, r() * 6, 6 + r() * 4));
    }
    for (let i = 0; i < 30; i++) {
      tasks.push(put(statics, `forest/Grass_${r() < 0.5 ? 1 : 2}_A_Color1.gltf`, (r() - 0.5) * 100, (r() - 0.5) * 90, r() * 6, 1.6 + r() * 0.8));
    }
    await Promise.all(tasks);
    this.group.add(mergeStatic(statics));
    // A fonte fica de fora da junção: a água acende e apaga com o marco de 10 moradores.
    const fountain = await put(this.group, kn('fountain-round'), 0, 0, 0, K * 0.9);
    fountain.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh && (m.material as THREE.Material).name === 'Water') this.water.push(m);
    });
    this.ready = true;
  }

  /** Remonta os lotes cujo estado mudou (um por vez em voo, sem travar o quadro). */
  sync(w: World): void {
    for (const lot of LOTS) {
      const key = lotKey(w, lot);
      const have = this.lots.get(lot.id);
      if (have?.key === key || have?.building) continue;
      const slot = { key, group: have?.group ?? null, building: true };
      this.lots.set(lot.id, slot);
      void buildLot(lot, lotView(w, lot)).then((g) => {
        slot.group?.removeFromParent();
        slot.group = g;
        slot.building = false;
        this.group.add(g);
      });
    }
    for (const m of this.water) m.visible = fountainOn(w);
  }

  /** Luz da hora do dia e fogo tremulando. Devolve a luz do dia (0..1) para o céu e o sol. */
  update(w: World, time: number): number {
    const hour = townHour(w.tick);
    const day = daylight(hour);
    const flick = 0.85 + 0.15 * Math.sin(time * 11) * Math.sin(time * 6.3);
    this.fire.intensity = (10 + 22 * (1 - day)) * flick;
    this.flame.scale.set(1, 0.85 + 0.25 * flick, 1);
    for (const l of this.lanterns) l.intensity = 14 * (1 - day) * (fountainOn(w) ? 1 : 0.5);
    return day;
  }

  /** Lote sob um ponto do chão (para abrir o painel do prédio ao tocar nele). */
  lotAt(x: number, z: number): Lot | null {
    return LOTS.find((l) => x > l.x - K / 2 && x < l.x + (l.w - 0.5) * K && z > l.z - K / 2 && z < l.z + (l.d - 0.5) * K) ?? null;
  }
}

export const TOWN_FILES = [
  ...['road', 'lantern', 'stall-bench', 'rock-large', 'rock-wide', 'rock-small', 'fountain-round', 'roof', 'chimney', 'banner-green', 'banner-red', 'cart',
    'wall', 'wall-door', 'wall-window-shutters', 'wall-window-glass', 'wall-half', 'wall-broken',
    'wall-wood', 'wall-wood-door', 'wall-wood-window-shutters', 'wall-wood-window-glass', 'wall-wood-half', 'wall-wood-broken',
    'poles', 'planks', 'planks-half'].map(kn),
  'dungeon/wall_doorway.gltf', 'dungeon/pillar.gltf', 'dungeon/torch_mounted.gltf', 'dungeon/bottle_A_green.gltf', 'dungeon/barrel_small.gltf',
  'forest/Rock_1_A_Color1.gltf', 'forest/Tree_1_A_Color1.gltf', 'forest/Tree_2_A_Color1.gltf', 'forest/Tree_3_A_Color1.gltf', 'forest/Tree_4_A_Color1.gltf',
  'forest/Bush_1_A_Color1.gltf', 'forest/Bush_2_A_Color1.gltf', 'forest/Grass_1_A_Color1.gltf', 'forest/Grass_2_A_Color1.gltf',
  'resource/Wood_Log_A.gltf', 'resource/Wood_Planks_Stack_Medium.gltf', 'resource/Stone_Bricks_Stack_Medium.gltf', 'resource/Iron_Bars_Stack_Small.gltf',
  'resource/Wood_Log_Stack.gltf', 'resource/Textiles_Stack_Small.gltf',
  'tools/anvil.gltf', 'tools/grindstone.gltf', 'tools/map.gltf', 'tools/compass_base.gltf',
  'furniture/table_medium.gltf', 'furniture/bed_single_A.gltf', 'furniture/chair_A_wood.gltf',
  'mixed/flax_flower_A.gltf', 'mixed/flax_flower_B.gltf', 'hexagon/target.gltf', 'hexagon/weaponrack.gltf',
];
