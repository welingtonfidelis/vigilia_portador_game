/**
 * A vila em diorama (docs/VIGILIA-PORTADOR.md §14.3): um quadrado de terra com paredes em camadas, dois
 * platôs ao fundo, a escada até a capela da Cripta e a floresta lá embaixo, na névoa. Os prédios são do
 * Kenney (×4, grid de 4 m), recoloridos por estágio: queimados no começo, telhado de palha quando a vila
 * se reergue e de telha quando ela melhora. Só lê o estado: cada lote é remontado quando o estado dele
 * ou o estágio da vila muda.
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import {
  CELL, CRYPT, CRYPT_DOOR, FIRE, ISLAND, LOTS, PATHS, PLAZA, STAIRS, TERRACES, TERRACE_Y,
  daylight, heightAt, lotBox, lotFront, lotKey, lotView, townHour, townStage,
} from '../game/townPlan.ts';
import type { Lot, LotView, Side, TownStage } from '../game/townPlan.ts';
import { BENCHES, DEPOT, FOLK_CAP, MARKET, SPOTS, WOODPILE, lifeMarks } from '../game/townFolk.ts';
import type { LifeMarks } from '../game/townFolk.ts';
import type { World } from '../sim/index.ts';
import { load } from './assets.ts';
import { FOLK_FILES, Folk } from './folk.ts';
import { mergeStatic } from './dungeon.ts';
import { paletteMaterial } from './palette.ts';
import type { PaletteSpec } from './palette.ts';

const K = CELL;

// ---------------------------------------------------------------------------------------------------
// Paletas: cada pack do Kenney tem a própria grade de faixas (linha:coluna, ver palette.ts).

const STONE = 0xa9a196, TIMBER = 0x5a3a29, PLASTER = 0xe8dec9, WOOD = 0x8a5a3a, DARK_WOOD = 0x63412e;
const ROOF = { palha: 0xcfa24f, telha: 0xae4f39, carvao: 0x4b3a30 } as const;

const townCasa = (roof: number): PaletteSpec => ({
  remap: {
    '2:2': STONE, '2:3': STONE, '3:8': TIMBER, '3:9': TIMBER, '3:10': PLASTER, '3:11': PLASTER,
    '3:0': roof, '3:1': roof, '3:2': roof, '3:3': roof, '3:14': 0x8c8780, '3:15': 0x8c8780,
  },
});

const PAL: Record<string, Record<string, PaletteSpec>> = {
  'kenney-town': {
    base: { remap: { '2:2': STONE, '2:3': STONE, '3:8': WOOD, '3:9': WOOD, '3:10': DARK_WOOD, '3:11': DARK_WOOD, '3:14': 0x7f7b76, '3:15': 0x7f7b76 } },
    palha: townCasa(ROOF.palha),
    telha: townCasa(ROOF.telha),
    queimada: {
      remap: {
        '2:2': 0x6e6862, '2:3': 0x6e6862, '3:8': 0x45301f, '3:9': 0x45301f, '3:10': 0x766756, '3:11': 0x766756,
        '3:0': ROOF.carvao, '3:1': ROOF.carvao, '3:2': ROOF.carvao, '3:3': ROOF.carvao, '3:14': 0x5c5752, '3:15': 0x5c5752,
      },
      rest: 0.6,
    },
    velha: {
      remap: { '2:2': 0x8b847b, '2:3': 0x8b847b, '3:8': 0x4a3324, '3:9': 0x4a3324, '3:10': 0xb3a690, '3:11': 0xb3a690 },
      rest: 0.75,
    },
  },
  'kenney-graveyard': {
    base: { remap: { '3:14': 0x6d6763, '3:15': 0xa39c92, '3:0': 0x7a736c, '3:1': 0x7a736c, '2:2': 0x7b5034, '2:3': 0x7b5034, '2:10': 0x34383b, '2:11': 0x34383b } },
    velha: { remap: { '3:14': 0x4f4a47, '3:15': 0x7e776f, '3:0': 0x5d5752, '3:1': 0x5d5752, '2:2': 0x4e3424, '2:3': 0x4e3424, '2:10': 0x2a2c2e, '2:11': 0x2a2c2e }, rest: 0.7 },
    pinheiro: { remap: { '2:10': 0x4c7f46, '2:11': 0x4c7f46, '2:2': 0x6b4630, '2:3': 0x6b4630, '3:6': 0x6b4630, '3:7': 0x6b4630 } },
  },
  'kenney-castle': {
    base: { remap: { '3:12': 0x9a938a, '3:13': 0x9a938a, '3:14': 0xb5ada2, '3:15': 0xb5ada2, '2:8': 0xa33d2e, '2:9': 0xa33d2e, '3:8': 0x7a4e33, '3:9': 0x7a4e33, '3:10': 0x5a3a28, '3:11': 0x5a3a28 } },
    queimada: { remap: { '3:12': 0x6b655e, '3:13': 0x6b655e, '3:14': 0x7d766e, '3:15': 0x7d766e, '2:8': 0x4b3a30, '2:9': 0x4b3a30, '3:8': 0x4a3324, '3:9': 0x4a3324 }, rest: 0.6 },
  },
  'kenney-survival': {
    base: { remap: { '3:8': WOOD, '3:9': WOOD, '3:12': 0x8f8a84, '3:13': 0x8f8a84, '3:4': 0x55595e, '3:5': 0x55595e, '2:6': 0x7a4e33, '2:7': 0x7a4e33, '2:0': 0x5c8a3b, '2:1': 0x5c8a3b } },
    tenda: { remap: { '3:8': 0xcbb48c, '3:9': 0xcbb48c, '2:2': 0xa88a58, '2:3': 0xa88a58 } },
    queimada: { remap: { '3:8': 0x6b5a48, '3:9': 0x6b5a48, '2:2': 0x4f4234, '2:3': 0x4f4234, '3:12': 0x6b665f, '3:13': 0x6b665f, '2:0': 0x55603a, '2:1': 0x55603a }, rest: 0.6 },
  },
};

interface PutOpts {
  rot?: number;
  /** Escala uniforme, ou por eixo com sx/sy/sz. */
  scale?: number;
  sx?: number;
  sy?: number;
  sz?: number;
  /** Altura acima do chão do lugar (o chão vem da planta). */
  y?: number;
  /** Altura absoluta (ignora o chão). */
  absY?: number;
  floor?: boolean;
  /** Paleta do pack (PAL); sem ela, a paleta base do pack. */
  pal?: string;
}

async function put(group: THREE.Group, file: string, x: number, z: number, o: PutOpts = {}): Promise<THREE.Object3D> {
  const g = await load(file);
  const obj = g.scene.clone();
  obj.position.set(x, o.absY ?? heightAt(x, z) + (o.y ?? 0), z);
  obj.rotation.y = o.rot ?? 0;
  const s = o.scale ?? 1;
  obj.scale.set(o.sx ?? s, o.sy ?? s, o.sz ?? s);
  obj.userData.floor = !!o.floor;
  const pack = file.split('/')[0]!;
  const pals = PAL[pack];
  if (pals) {
    const spec = pals[o.pal ?? 'base'] ?? pals.base!;
    const name = o.pal && pals[o.pal] ? o.pal : 'base';
    obj.traverse((m) => {
      const mesh = m as THREE.Mesh;
      if (!mesh.isMesh) return;
      const mat = mesh.material as THREE.MeshStandardMaterial;
      if (mat.map) mesh.material = paletteMaterial(mat, `${pack}:${name}`, spec);
    });
  }
  group.add(obj);
  return obj;
}

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

// ---------------------------------------------------------------------------------------------------
// Chão: a ilha e os platôs extrudados, com o topo pintado numa textura e as paredes em camadas de terra.

/** Retângulo de cantos redondos no plano da forma (x, -z), com um raio por canto [no, ne, se, so]. */
function roundedRect(x0: number, x1: number, z0: number, z1: number, r: [number, number, number, number]): THREE.Shape {
  const s = new THREE.Shape();
  const [no, ne, se, so] = r;
  // Na forma, y = -z: o norte (z0) fica em cima.
  s.moveTo(x0 + so, -z1);
  s.lineTo(x1 - se, -z1);
  s.quadraticCurveTo(x1, -z1, x1, -z1 + se);
  s.lineTo(x1, -z0 - ne);
  s.quadraticCurveTo(x1, -z0, x1 - ne, -z0);
  s.lineTo(x0 + no, -z0);
  s.quadraticCurveTo(x0, -z0, x0, -z0 - no);
  s.lineTo(x0, -z1 + so);
  s.quadraticCurveTo(x0, -z1, x0 + so, -z1);
  return s;
}

const SOIL = [0x8b5a3c, 0x7a4c33, 0x956543, 0x6c452e, 0x86593a, 0x744a31];

/** Bloco de terra: topo com a textura do chão (UV em metros) e paredes com cor de terra por altura. */
function earthBlock(shape: THREE.Shape, top: number, depth: number, ground: THREE.Material, seed: number): THREE.Mesh {
  const geo = new THREE.ExtrudeGeometry(shape, { depth, steps: Math.ceil(depth / 1.1), bevelEnabled: true, bevelThickness: 0.45, bevelSize: 0.45, bevelSegments: 2, curveSegments: 5 });
  geo.rotateX(-Math.PI / 2);
  geo.translate(0, top - depth - 0.45, 0);
  const pos = geo.attributes.position as THREE.BufferAttribute;
  const colors = new Float32Array(pos.count * 3);
  const sides = geo.groups[1]!;
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const side = i >= sides.start && i < sides.start + sides.count;
    if (!side) {
      colors.set([1, 1, 1], i * 3);
      continue;
    }
    // Pedrinhas: empurra os vértices do meio da parede (a mesma posição sempre recebe o mesmo empurrão).
    const key = `${Math.round(x * 4)}:${Math.round(y * 4)}:${Math.round(z * 4)}`;
    const n = rng(hash(key) ^ seed);
    const depthBelow = top - y;
    if (depthBelow > 0.9 && y > top - depth + 0.2) {
      pos.setX(i, x + (n() - 0.5) * 0.7);
      pos.setZ(i, z + (n() - 0.5) * 0.7);
    }
    if (depthBelow < 0.55) c.set(0x5d8a3a);
    else c.set(SOIL[Math.floor((depthBelow + n() * 0.4) / 1.25) % SOIL.length]!).multiplyScalar(0.92 + n() * 0.16 - Math.min(0.35, depthBelow * 0.025));
    colors.set([c.r, c.g, c.b], i * 3);
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.computeVertexNormals();
  const cliff = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, flatShading: true });
  const mesh = new THREE.Mesh(geo, [ground, cliff]);
  mesh.receiveShadow = true;
  mesh.castShadow = true;
  return mesh;
}

const GROUND_PX = 16;
const GW = (ISLAND.x1 - ISLAND.x0 + 4) * GROUND_PX, GD = (ISLAND.z1 - ISLAND.z0 + 4) * GROUND_PX;
const GX0 = ISLAND.x0 - 2, GZ0 = ISLAND.z0 - 2;

/** Pinta o chão da ilha para um estágio: grama (ou terra queimada), caminhos, calçamento e cinzas. */
function paintGround(ctx: CanvasRenderingContext2D, stage: TownStage): void {
  const r = rng(91 + stage);
  const px = (x: number) => (x - GX0) * GROUND_PX, pz = (z: number) => (z - GZ0) * GROUND_PX;
  const blob = (x: number, z: number, rad: number, color: string, alpha = 1) => {
    ctx.globalAlpha = alpha;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.ellipse(px(x), pz(z), rad * GROUND_PX, rad * GROUND_PX * (0.7 + r() * 0.5), r() * 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
  };
  const burnt = stage === 0;
  ctx.fillStyle = burnt ? '#56603a' : '#68903f';
  ctx.fillRect(0, 0, GW, GD);
  // Manchas de grama (mais clara, mais escura) para o chão não ficar liso.
  for (let i = 0; i < 260; i++) {
    const x = GX0 + r() * (GW / GROUND_PX), z = GZ0 + r() * (GD / GROUND_PX);
    blob(x, z, 1 + r() * 3.5, burnt ? (r() < 0.5 ? '#4b5333' : '#626a40') : r() < 0.5 ? '#729c46' : '#5a8337', 0.5);
  }
  // Terra batida embaixo de cada lote e na beira dos platôs do cemitério.
  for (const l of LOTS) {
    const b = lotBox(l);
    ctx.fillStyle = burnt ? '#4a3a2c' : '#8a6b48';
    ctx.globalAlpha = 0.85;
    ctx.beginPath();
    ctx.roundRect(px(b.x0 - 1), pz(b.z0 - 1), (b.x1 - b.x0 + 2) * GROUND_PX, (b.z1 - b.z0 + 2) * GROUND_PX, 3 * GROUND_PX);
    ctx.fill();
    ctx.globalAlpha = 1;
  }
  for (let i = 0; i < 18; i++) blob(-30 + r() * 26, -22 + r() * 12, 0.8 + r() * 1.6, burnt ? '#3f3428' : '#7c6446', 0.7);
  // Caminhos: borda escura, miolo de terra; do estágio 2 em diante, pedras de calçamento.
  const stroke = (pts: [number, number][], width: number, color: string) => {
    ctx.strokeStyle = color;
    ctx.lineWidth = width * GROUND_PX;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    pts.forEach(([x, z], i) => (i ? ctx.lineTo(px(x), pz(z)) : ctx.moveTo(px(x), pz(z))));
    ctx.stroke();
  };
  for (const p of PATHS) stroke(p.pts, p.width + 0.8, burnt ? '#3e3226' : '#6f5338');
  for (const p of PATHS) stroke(p.pts, p.width, burnt ? '#5d4a37' : '#a07a52');
  ctx.fillStyle = burnt ? '#5d4a37' : '#a07a52';
  ctx.beginPath();
  ctx.arc(px(PLAZA.x), pz(PLAZA.z), PLAZA.r * GROUND_PX, 0, Math.PI * 2);
  ctx.fill();
  if (stage >= 2) {
    const stone = (x: number, z: number) => {
      const g = 150 + Math.floor(r() * 40);
      ctx.fillStyle = `rgb(${g + 6},${g},${g - 10})`;
      ctx.strokeStyle = 'rgba(60,50,40,0.55)';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.roundRect(px(x) - 4, pz(z) - 4, 7 + r() * 3, 7 + r() * 3, 3);
      ctx.fill();
      ctx.stroke();
    };
    for (const p of PATHS) {
      for (let k = 1; k < p.pts.length; k++) {
        const [x0, z0] = p.pts[k - 1]!, [x1, z1] = p.pts[k]!;
        const len = Math.hypot(x1 - x0, z1 - z0);
        const nx = -(z1 - z0) / len, nz = (x1 - x0) / len;
        for (let t = 0; t < len; t += 0.62) {
          for (let o = -p.width / 2 + 0.35; o < p.width / 2 - 0.2; o += 0.62) {
            const jx = (r() - 0.5) * 0.15;
            stone(x0 + ((x1 - x0) * t) / len + nx * o + jx, z0 + ((z1 - z0) * t) / len + nz * o);
          }
        }
      }
    }
    for (let x = -PLAZA.r; x <= PLAZA.r; x += 0.62) for (let z = -PLAZA.r; z <= PLAZA.r; z += 0.62) {
      if (Math.hypot(x, z) < PLAZA.r - 0.3) stone(PLAZA.x + x + (r() - 0.5) * 0.12, PLAZA.z + z + ((Math.round(x / 0.62) % 2) * 0.31));
    }
  }
  if (burnt) {
    // Cinzas e brasas em volta das ruínas.
    for (const l of LOTS) {
      const b = lotBox(l);
      const cx = (b.x0 + b.x1) / 2, cz = (b.z0 + b.z1) / 2;
      for (let i = 0; i < 9; i++) blob(cx + (r() - 0.5) * 12, cz + (r() - 0.5) * 12, 1 + r() * 2.6, '#231d19', 0.55);
      for (let i = 0; i < 26; i++) blob(cx + (r() - 0.5) * 11, cz + (r() - 0.5) * 11, 0.08 + r() * 0.12, r() < 0.5 ? '#ff7a2a' : '#ffb347', 0.9);
    }
  }
}

// ---------------------------------------------------------------------------------------------------
// Fumaça e brasas: partículas num Points só, com tamanho e transparência pela idade.

interface Emitter {
  x: number;
  y: number;
  z: number;
  /** Fumaça grossa das ruínas (escura) ou fio de chaminé (clara). */
  dark: boolean;
  rate: number;
  size: number;
}

class Puffs {
  readonly points: THREE.Points;
  private pos: Float32Array;
  private life: Float32Array;
  private size: Float32Array;
  private shade: Float32Array;
  private age: Float32Array;
  private span: Float32Array;
  private from: Int16Array;
  private seed: Float32Array;
  private emitters: Emitter[] = [];
  private acc: number[] = [];
  private next = 0;
  readonly material: THREE.ShaderMaterial;
  private count: number;

  constructor(count: number, additive: boolean) {
    this.count = count;
    this.pos = new Float32Array(count * 3);
    this.life = new Float32Array(count);
    this.size = new Float32Array(count);
    this.shade = new Float32Array(count);
    this.age = new Float32Array(count).fill(1);
    this.span = new Float32Array(count).fill(1);
    this.from = new Int16Array(count).fill(-1);
    this.seed = new Float32Array(count);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    geo.setAttribute('aLife', new THREE.BufferAttribute(this.life, 1));
    geo.setAttribute('aSize', new THREE.BufferAttribute(this.size, 1));
    geo.setAttribute('aShade', new THREE.BufferAttribute(this.shade, 1));
    this.material = new THREE.ShaderMaterial({
      uniforms: { uScale: { value: 600 }, uDark: { value: new THREE.Color(0x3a3430) }, uLight: { value: new THREE.Color(0xd8d4ce) }, uAlpha: { value: additive ? 1 : 0.75 } },
      vertexShader: `
        attribute float aLife; attribute float aSize; attribute float aShade;
        uniform float uScale; varying float vLife; varying float vShade;
        void main() {
          vLife = aLife; vShade = aShade;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_Position = projectionMatrix * mv;
          gl_PointSize = aLife <= 0.0 || aLife >= 1.0 ? 0.0 : aSize * uScale / -mv.z;
        }`,
      fragmentShader: additive
        ? `varying float vLife; varying float vShade;
          void main() {
            float r = length(gl_PointCoord - 0.5); if (r > 0.5) discard;
            float a = smoothstep(0.5, 0.0, r) * (1.0 - vLife);
            gl_FragColor = vec4(mix(vec3(1.0, 0.45, 0.12), vec3(1.0, 0.8, 0.35), vShade) * a, a);
          }`
        : `uniform vec3 uDark; uniform vec3 uLight; uniform float uAlpha; varying float vLife; varying float vShade;
          void main() {
            float r = length(gl_PointCoord - 0.5); if (r > 0.5) discard;
            float a = smoothstep(0.5, 0.15, r) * uAlpha * sin(3.14159 * vLife) * (0.55 + 0.45 * vShade);
            gl_FragColor = vec4(mix(uDark, uLight, vShade), a);
          }`,
      transparent: true,
      depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    this.points = new THREE.Points(geo, this.material);
    this.points.frustumCulled = false;
  }

  setEmitters(list: Emitter[]): void {
    this.emitters = list;
    this.acc = list.map(() => 0);
  }

  update(dt: number, wind: number): void {
    for (const [i, e] of this.emitters.entries()) {
      this.acc[i]! += e.rate * dt;
      while (this.acc[i]! >= 1) {
        this.acc[i]! -= 1;
        const p = this.next++ % this.count;
        this.from[p] = i;
        this.age[p] = 0;
        this.span[p] = e.dark ? 4.5 + Math.random() * 2 : 3 + Math.random() * 1.5;
        this.seed[p] = Math.random() * 6.28;
      }
    }
    for (let p = 0; p < this.count; p++) {
      const e = this.from[p]! >= 0 ? this.emitters[this.from[p]!] : undefined;
      if (!e || this.age[p]! >= 1) {
        this.life[p] = 1;
        continue;
      }
      this.age[p]! += dt / this.span[p]!;
      const t = this.age[p]!;
      const s = this.seed[p]!;
      const rise = e.dark ? 7 : 5;
      this.pos[p * 3] = e.x + Math.sin(s + t * 3) * 0.4 * t + wind * t * this.span[p]!;
      this.pos[p * 3 + 1] = e.y + rise * t * (e.dark ? 1.4 : 1);
      this.pos[p * 3 + 2] = e.z + Math.cos(s + t * 2) * 0.4 * t;
      this.life[p] = t;
      this.size[p] = e.size * (0.5 + 1.6 * t);
      this.shade[p] = e.dark ? 0.15 + 0.3 * t : 0.9;
    }
    const geo = this.points.geometry;
    for (const name of ['position', 'aLife', 'aSize', 'aShade']) (geo.attributes[name] as THREE.BufferAttribute).needsUpdate = true;
  }
}

// ---------------------------------------------------------------------------------------------------
// Lotes.

/** Rotação de uma parede do Kenney (que fica na face +x da célula) para cada lado. */
const FACE_ROT: Record<Side, number> = { e: 0, n: Math.PI / 2, w: Math.PI, s: -Math.PI / 2 };

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

const lotCenter = (lot: Lot) => ({ x: lot.x + ((lot.w - 1) * K) / 2, z: lot.z + ((lot.d - 1) * K) / 2 });

interface BuiltLot {
  group: THREE.Group;
  smoke: Emitter[];
  embers: Emitter[];
}

async function buildLot(lot: Lot, view: LotView, stage: TownStage): Promise<BuiltLot> {
  const group = new THREE.Group();
  const out: BuiltLot = { group, smoke: [], embers: [] };
  const r = rng(hash(lot.id) + stage);
  const tasks: Promise<unknown>[] = [];
  if (lot.style === 'tendas') tents(tasks, group, lot, view, stage, r, out);
  else if (lot.style === 'torre') tower(tasks, group, lot, view, stage, r, out);
  else house(tasks, group, lot, view, stage, r, out);
  await Promise.all(tasks);
  out.group = mergeStatic(group);
  return out;
}

/** Brasas e fumaça grossa de uma ruína queimada (só na vila destruída). */
function smoulder(out: BuiltLot, x: number, y: number, z: number, r: () => number): void {
  out.smoke.push({ x: x + (r() - 0.5) * 2, y, z: z + (r() - 0.5) * 2, dark: true, rate: 3, size: 4.2 });
  out.embers.push({ x, y: y - 2.5, z, dark: false, rate: 6, size: 0.4 });
}

function house(tasks: Promise<unknown>[], group: THREE.Group, lot: Lot, view: LotView, stage: TownStage, r: () => number, out: BuiltLot): void {
  const kn = (name: string) => `kenney-town/${name}.glb`;
  const wall = (kind: string, wood = lot.wood) => kn(wood ? `wall-wood${kind}` : `wall${kind}`);
  const add = (file: string, x: number, z: number, o: PutOpts) => tasks.push(put(group, file, x, z, o));
  const c = lotCenter(lot);
  const base = heightAt(c.x, c.z);
  const roofCells = (y: number, pal: string, dormers: boolean, keep = 1) => {
    for (let i = 0; i < lot.w; i++) {
      for (let j = 0; j < lot.d; j++) {
        const x = lot.x + i * K, z = lot.z + j * K;
        const rot = j < lot.d / 2 ? Math.PI / 2 : -Math.PI / 2;
        if (r() > keep) {
          // Telhado desabado: o pedaço cai torto para dentro da casa (ou some de vez).
          if (r() < 0.6) tasks.push(put(group, kn('roof-high'), x, z, { rot: rot + (r() - 0.5) * 0.5, scale: K, y: y - 1.6 - r() * 1.2, pal }).then((o) => { o.rotation.x = (r() - 0.5) * 0.7; o.rotation.z = (r() - 0.5) * 0.7; }));
          continue;
        }
        const front = (lot.door === 's' && j === lot.d - 1) || (lot.door === 'n' && j === 0);
        add(kn(dormers && front && r() < 0.6 ? 'roof-high-window' : 'roof-high'), x, z, { rot, scale: K, y, pal });
      }
    }
  };
  if (view.state === 'vazio') return;
  if (view.state === 'ruina' && stage === 0) {
    // Casa queimada: paredes de pé e quebradas, metade do telhado e as vigas à mostra.
    for (const [side, x, z] of faces(lot)) {
      const kind = r() < 0.45 ? '-broken' : isDoorFace(lot, side, x, z) ? '-door' : r() < 0.5 ? '-window-shutters' : '';
      add(wall(kind), x, z, { rot: FACE_ROT[side], scale: K, pal: 'queimada' });
    }
    roofCells(K, 'queimada', false, 0.45);
    add('kenney-graveyard/debris-wood.glb', c.x + 1.5, c.z + 1, { rot: r() * 6, scale: 3.6, pal: 'velha' });
    add('kenney-graveyard/debris.glb', c.x - 1.2, c.z - 0.6, { rot: r() * 6, scale: 3.2, pal: 'velha' });
    add(kn('planks-half'), c.x, c.z, { rot: r() * 6, scale: K, floor: true, pal: 'queimada' });
    smoulder(out, c.x, base + 4.5, c.z, r);
    return;
  }
  if (view.state === 'ruina') {
    // Ruína velha: algumas paredes quebradas, tábuas soltas e mato.
    for (const [side, x, z] of faces(lot)) if (r() < 0.55) add(wall('-broken'), x, z, { rot: FACE_ROT[side], scale: K, pal: 'velha' });
    add(kn('planks-half'), c.x - 1, c.z - 1, { rot: r() * 6, scale: K, floor: true, pal: 'velha' });
    add('kenney-graveyard/debris.glb', c.x + 1.4, c.z + 0.8, { rot: r() * 6, scale: 3, pal: 'velha' });
    add('kenney-survival/grass-large.glb', lot.x + K * (lot.w - 1), lot.z, { rot: r() * 6, scale: 5 });
    return;
  }
  if (view.state === 'obra') {
    for (const [side, x, z] of faces(lot)) {
      add(wall('-half'), x, z, { rot: FACE_ROT[side], scale: K, pal: 'palha' });
      if (r() < 0.5) add(kn('poles'), x, z, { rot: FACE_ROT[side], scale: K });
    }
    for (let i = 0; i < lot.w; i++) for (let j = 0; j < lot.d; j++) add(kn('planks'), lot.x + i * K, lot.z + j * K, { scale: K, floor: true });
    const f = lotFront(lot);
    add('resource/Wood_Planks_Stack_Medium.gltf', f.x + f.along[0] * 3, f.z + f.along[1] * 3, { rot: r() * 3, scale: 1.6 });
    add('resource/Stone_Bricks_Stack_Medium.gltf', f.x - f.along[0] * 3, f.z - f.along[1] * 3, { rot: r() * 3, scale: 1.6 });
    return;
  }
  // Pronta ou ampliada: enxaimel (paredes claras e vigas escuras), palha até o estágio 1 e telha depois.
  const pal = stage >= 2 ? 'telha' : 'palha';
  const floors = view.state === 'ampliada' ? 2 : 1;
  const woodKinds = ['-detail-cross', '-detail-diagonal', '-window-shutters', '-window-glass', '-window-small', '-detail-cross', ''];
  const stoneKinds = ['', '-window-shutters', '-window-glass', '-window-small', ''];
  for (const [side, x, z] of faces(lot)) {
    for (let f = 0; f < floors; f++) {
      const wood = f > 0 || lot.wood;
      const door = f === 0 && isDoorFace(lot, side, x, z);
      const list = wood ? woodKinds : stoneKinds;
      const kind = door ? '-door' : list[Math.floor(r() * list.length)]!;
      add(wall(kind, wood), x, z, { rot: FACE_ROT[side], scale: K, y: f * K, pal });
    }
  }
  roofCells(floors * K, pal, stage >= 2);
  const chimX = lot.x + (lot.w - 1) * K, chimZ = lot.z;
  add(kn('chimney'), chimX, chimZ, { scale: K, y: floors * K + 0.4 * K, pal });
  out.smoke.push({ x: chimX + 0.9, y: base + floors * K + 0.4 * K + 4.4, z: chimZ - 0.2, dark: false, rate: 1.1, size: 1.6 });
  if (view.state === 'ampliada') {
    const f = lotFront(lot);
    add(kn(lot.wood ? 'banner-green' : 'banner-red'), f.x - f.out[0] * 2.4 + f.along[0] * 3, f.z - f.out[1] * 2.4 + f.along[1] * 3, { rot: FACE_ROT[lot.door], scale: K * 0.8 });
  }
  if (view.scaffold) {
    for (const [side, x, z] of faces(lot)) if (r() < 0.6) add(kn('poles'), x, z, { rot: FACE_ROT[side], scale: K, y: K * 0.02 });
    const f = lotFront(lot);
    add('resource/Wood_Planks_Stack_Medium.gltf', f.x + f.along[0] * 3.4, f.z + f.along[1] * 3.4, { rot: 0.4, scale: 1.6 });
  }
  props(tasks, group, lot, r, view.state === 'ampliada', stage);
}

/** Objetos do ofício em frente à porta (docs §14.3). */
function props(tasks: Promise<unknown>[], group: THREE.Group, lot: Lot, r: () => number, big: boolean, stage: TownStage): void {
  const f = lotFront(lot);
  const face = Math.atan2(f.out[0], f.out[1]);
  const add = (file: string, along: number, outward: number, o: PutOpts = {}) => {
    tasks.push(put(group, file, f.x + f.along[0] * along + f.out[0] * outward, f.z + f.along[1] * along + f.out[1] * outward, { rot: face, ...o }));
  };
  switch (lot.kind) {
    case 'ferreiro':
      add('kenney-survival/workbench-anvil.glb', 2.2, 0.4, { rot: face + 0.4, scale: 5 });
      add('tools/grindstone.gltf', -2.6, 0.2, { rot: face - 0.3, scale: 1.1 });
      add('kenney-survival/workbench.glb', 4.4, -0.8, { scale: 5 });
      add('resource/Iron_Bars_Stack_Small.gltf', 4.4, -0.8, { scale: 1.1, y: 1.2 });
      if (big) add('hexagon/weaponrack.gltf', -4.6, -1, { scale: 6 });
      if (stage >= 1) add('resource/Wood_Log_Stack.gltf', -4.4, 1.6, { scale: 1.3 });
      break;
    case 'treinador':
      add('hexagon/target.gltf', 3, 1.4, { scale: 6 });
      add('hexagon/target.gltf', 6, 2.6, { rot: face + 0.3, scale: 6 });
      add('hexagon/weaponrack.gltf', -2.8, -0.6, { scale: 6 });
      if (big) add('hexagon/target.gltf', 0.4, 3.6, { rot: face - 0.4, scale: 6 });
      break;
    case 'alquimista':
      add('furniture/table_medium.gltf', 2.4, 0.4, { scale: 1.1 });
      add('dungeon/bottle_A_green.gltf', 2.2, 0.4, { scale: 1.6, y: 1.1 });
      add('kenney-survival/barrel.glb', -2.6, -0.4, { scale: 3.6 });
      add('mixed/flax_flower_A.gltf', -4, 0.8, { scale: 2.4 });
      add('mixed/flax_flower_B.gltf', -4.8, 1.6, { rot: face + 1, scale: 2.4 });
      break;
    case 'curandeira':
      add('furniture/bed_single_A.gltf', 2.8, 0.4, { rot: face + Math.PI / 2, scale: 1.1 });
      add('mixed/flax_flower_A.gltf', -2.2, 0.6, { scale: 2.4 });
      add('mixed/flax_flower_B.gltf', -3.2, 1.2, { rot: face + 1, scale: 2.4 });
      add('furniture/chair_A_wood.gltf', 0.9, 1.6, { rot: face + Math.PI, scale: 1.2 });
      break;
    case 'casa':
      if (r() < 0.6) add('resource/Wood_Log_A.gltf', 3, -0.6, { rot: face + r(), scale: 1.6 });
      if (r() < 0.6) add('mixed/flax_flower_B.gltf', -2.4, 0.4, { scale: 2.4 });
      if (r() < 0.5) add('kenney-survival/barrel.glb', 2.6, 0.8, { scale: 3.4 });
      break;
  }
}

/** Carroceiro: barracas de lona, a carroça e caixas (queimadas e rasgadas no começo). */
function tents(tasks: Promise<unknown>[], group: THREE.Group, lot: Lot, view: LotView, stage: TownStage, r: () => number, out: BuiltLot): void {
  const sv = (name: string) => `kenney-survival/${name}.glb`;
  const add = (file: string, x: number, z: number, o: PutOpts) => tasks.push(put(group, file, x, z, o));
  const c = lotCenter(lot);
  const spots: [number, number, number][] = [[-2.4, -2.6, 0.3], [2.8, -1.8, -0.4], [0.2, 3, 0.1]];
  if (view.state === 'ruina') {
    const pal = stage === 0 ? 'queimada' : 'tenda';
    add(sv('tent-canvas-half'), c.x - 2.2, c.z - 2.2, { rot: 0.5, scale: 9, pal });
    add(sv('structure'), c.x + 2.6, c.z - 1, { rot: 0.2, scale: 8, pal: stage === 0 ? 'queimada' : 'base' });
    add('kenney-town/cart.glb', c.x + 1, c.z + 3.2, { rot: 1.9, scale: K * 0.9, pal: stage === 0 ? 'queimada' : 'velha' });
    add('kenney-graveyard/debris-wood.glb', c.x - 1, c.z + 1.2, { rot: r() * 6, scale: 3.6, pal: 'velha' });
    if (stage === 0) smoulder(out, c.x, heightAt(c.x, c.z) + 3, c.z, r);
    return;
  }
  if (view.state === 'obra') {
    add(sv('structure'), c.x - 2, c.z - 2, { scale: 8 });
    add(sv('structure'), c.x + 2.4, c.z - 1.6, { rot: 0.3, scale: 8 });
    add('resource/Wood_Planks_Stack_Medium.gltf', c.x + 1, c.z + 2.6, { rot: 0.4, scale: 1.6 });
    add('resource/Textiles_Stack_Small.gltf', c.x - 2, c.z + 2.4, { scale: 1.3 });
    return;
  }
  const n = view.state === 'ampliada' ? 3 : 2;
  for (let i = 0; i < n; i++) add(sv('tent-canvas'), c.x + spots[i]![0], c.z + spots[i]![1], { rot: spots[i]![2], scale: 9, pal: 'tenda' });
  add('kenney-town/cart.glb', c.x + 4.4, c.z + 3.4, { rot: 1.4, scale: K * 0.9 });
  add(sv('box-large'), c.x - 4.4, c.z + 1.4, { rot: 0.3, scale: 4 });
  add(sv('box'), c.x - 4.2, c.z + 3.2, { rot: 0.8, scale: 4 });
  add(sv('barrel'), c.x - 3, c.z + 4, { scale: 3.6 });
  add('resource/Textiles_Stack_Small.gltf', c.x + 2, c.z + 1.2, { scale: 1.3 });
  if (view.state === 'ampliada') add('kenney-town/stall-red.glb', c.x - 2.6, c.z + 5.6, { rot: Math.PI, scale: K * 0.9 });
  if (view.scaffold) add(sv('structure'), c.x + 4.6, c.z - 3.6, { scale: 8 });
}

/** Salão de Táticas: a torre no platô (de pedra cinza; ameias e bandeira quando a vila melhora). */
function tower(tasks: Promise<unknown>[], group: THREE.Group, lot: Lot, view: LotView, stage: TownStage, r: () => number, out: BuiltLot): void {
  const cs = (name: string) => `kenney-castle/${name}.glb`;
  const S = 3.6;
  const c = lotCenter(lot);
  const add = (file: string, dx: number, dz: number, o: PutOpts) => tasks.push(put(group, file, c.x + dx, c.z + dz, o));
  const levels: string[] = [];
  let top: string | null = null;
  if (view.state === 'ruina') {
    // Queimada no começo (com fumaça); depois, só a base e as pedras que caíram.
    levels.push('tower-square-base');
    if (stage === 0) levels.push('tower-square-mid');
    add(cs('rocks-small'), -2.8, 1.6, { rot: r() * 6, scale: 3.2 });
    add(cs('rocks-large'), 3, -1.4, { rot: r() * 6, scale: 2.4 });
    add('kenney-graveyard/debris.glb', 2.6, 2.4, { rot: r() * 6, scale: 3.6, pal: 'velha' });
    add('kenney-graveyard/debris.glb', -2.4, 2.8, { rot: r() * 6, scale: 3, pal: 'velha' });
    if (stage === 0) smoulder(out, c.x, heightAt(c.x, c.z) + 2 * S + 1, c.z, r);
  } else if (view.state === 'obra') {
    levels.push('tower-square-base', 'tower-square-mid');
    for (const [dx, dz] of [[-2.2, -2.2], [2.2, -2.2], [-2.2, 2.2], [2.2, 2.2]] as const) add('kenney-town/poles.glb', dx, dz, { rot: 0, sx: K, sy: K * 2, sz: K * 0.5 });
  } else {
    levels.push('tower-square-base', 'tower-square-mid-door', 'tower-square-mid-windows');
    if (view.state === 'ampliada') levels.push('tower-square-mid-windows');
    top = stage >= 2 ? 'tower-square-top' : 'tower-square-top-roof';
  }
  const pal = view.state === 'ruina' && stage === 0 ? 'queimada' : 'base';
  levels.forEach((name, i) => add(cs(name), 0, 0, { rot: Math.PI, scale: S, y: i * S * 1.0, pal }));
  if (top) {
    add(cs(top), 0, 0, { rot: Math.PI, scale: S, y: levels.length * S });
    if (stage >= 2) add(cs('flag'), 0, 0, { scale: S, y: levels.length * S + 0.3 * S });
    if (view.state === 'ampliada') add(cs('flag-banner-long'), 1.9, 1.95, { rot: -Math.PI / 2, scale: 2.4, y: 1 });
  }
  if (stage >= 2 && view.state !== 'ruina' && view.state !== 'obra') add(cs('siege-ballista'), -4.6, 3.6, { rot: 0.6, scale: 3.2 });
}

/** Ponto a menos de `m` metros da borda de algum caminho. */
function nearPath(x: number, z: number, m: number): boolean {
  return PATHS.some((p) => p.pts.some((pt, k) => {
    if (!k) return false;
    const [x0, z0] = p.pts[k - 1]!, [x1, z1] = pt;
    const dx = x1 - x0, dz = z1 - z0;
    const t = Math.max(0, Math.min(1, ((x - x0) * dx + (z - z0) * dz) / (dx * dx + dz * dz)));
    return Math.hypot(x - x0 - dx * t, z - z0 - dz * t) < p.width / 2 + m;
  }));
}

// ---------------------------------------------------------------------------------------------------
// Enfeites por estágio: a capela e o cemitério, a fogueira, a escada, a praça e a borda da ilha.

/** Assinatura dos enfeites: o estágio e os marcos de vida que põem coisas na vila. */
function decorKey(stage: TownStage, m: LifeMarks): string {
  return `${stage}:${m.stalls}:${m.lenhador}:${m.carregador}:${m.festa}:${m.bandeirolas}`;
}

/** Bandeirolas: cordões caídos entre postes, com bandeirinhas de quatro cores (uma malha só). */
function bunting(lines: [THREE.Vector3, THREE.Vector3][], poles: THREE.Vector3[]): THREE.Mesh {
  const pos: number[] = [], col: number[] = [];
  const colors = [0xb8402f, 0xd9b44a, 0x3f6fa0, 0x4f8a45].map((c) => new THREE.Color(c));
  let k = 0;
  const tri = (a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, color: THREE.Color) => {
    for (const v of [a, b, c]) {
      pos.push(v.x, v.y, v.z);
      col.push(color.r, color.g, color.b);
    }
  };
  const at = (a: THREE.Vector3, b: THREE.Vector3, t: number) => a.clone().lerp(b, t).add(new THREE.Vector3(0, -1.1 * 4 * t * (1 - t), 0));
  for (const [a, b] of lines) {
    const len = a.distanceTo(b);
    for (let d = 0.3; d < len - 0.5; d += 0.75) {
      const p0 = at(a, b, d / len), p1 = at(a, b, (d + 0.45) / len);
      const tip = p0.clone().lerp(p1, 0.5).add(new THREE.Vector3(0, -0.55, 0));
      tri(p0, p1, tip, colors[k++ % colors.length]!);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  geo.computeVertexNormals();
  const parts = [geo];
  for (const p of poles) {
    const pole = new THREE.CylinderGeometry(0.09, 0.12, p.y, 6).translate(p.x, p.y / 2, p.z).toNonIndexed();
    pole.deleteAttribute('uv');
    const n = pole.attributes.position!.count;
    pole.setAttribute('color', new THREE.Float32BufferAttribute(new Array(n * 3).fill(0).map((_, i) => [0.36, 0.24, 0.16][i % 3]!), 3));
    parts.push(pole);
  }
  const mesh = new THREE.Mesh(mergeGeometries(parts, false)!, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, side: THREE.DoubleSide }));
  mesh.castShadow = true;
  return mesh;
}

async function buildDecor(stage: TownStage, marks: LifeMarks): Promise<{ group: THREE.Group; smoke: Emitter[]; embers: Emitter[]; lanterns: THREE.Vector3[] }> {
  const g = new THREE.Group();
  const tasks: Promise<unknown>[] = [];
  const add = (file: string, x: number, z: number, o: PutOpts = {}) => tasks.push(put(g, file, x, z, o));
  const r = rng(500 + stage);
  const gy = (name: string) => `kenney-graveyard/${name}.glb`;
  const old = stage === 0 ? 'velha' : 'base';
  // A capela da Cripta, no alto da escada.
  add(gy('crypt-large'), CRYPT.x, CRYPT.z, { scale: 3.6, pal: old });
  add(gy('crypt-large-roof'), CRYPT.x, CRYPT.z, { scale: 3.6, y: 3.6, pal: old });
  add(gy(stage === 0 ? 'lantern-candle' : 'fire-basket'), CRYPT_DOOR.x - 3.6, CRYPT_DOOR.z - 0.2, { scale: 3.2, pal: old });
  add(gy(stage === 0 ? 'lantern-candle' : 'fire-basket'), CRYPT_DOOR.x + 3.6, CRYPT_DOOR.z - 0.2, { scale: 3.2, pal: old });
  // Cemitério no platô oeste: lápides em fileiras tortas, quebradas na vila destruída.
  const stones = ['gravestone-round', 'gravestone-cross', 'gravestone-wide', 'gravestone-bevel', 'gravestone-decorative', 'cross-wood'];
  for (let row = 0; row < 3; row++) {
    for (let col = 0; col < 6; col++) {
      if (r() < 0.18) continue;
      const x = -28 + col * 4 + (r() - 0.5) * 1.2, z = -20.5 + row * 4 + (r() - 0.5) * 0.8;
      const broken = stage === 0 ? r() < 0.55 : stage === 1 ? r() < 0.25 : false;
      add(gy(broken ? 'gravestone-broken' : stones[Math.floor(r() * stones.length)]!), x, z, { rot: (r() - 0.5) * 0.35, scale: 2.8, pal: old });
      if (r() < 0.45) add(gy(stage >= 2 ? 'grave-border' : 'grave'), x, z + 1.9, { rot: (r() - 0.5) * 0.2, scale: 2.4, floor: true, pal: old });
      if (stage >= 2 && r() < 0.25) add(gy('candle-multiple'), x + 1, z + 0.6, { scale: 3, pal: old });
    }
  }
  // Cerca de ferro na beira do cemitério: com buracos até a vila ficar completa.
  for (let x = -30.5; x < -4; x += 3) {
    if (stage < 3 && r() < (stage === 0 ? 0.45 : 0.25)) continue;
    add(gy(stage < 3 && r() < 0.4 ? 'iron-fence-damaged' : 'iron-fence'), x, -8.7, { sx: 3, sy: 2.2, sz: 3, pal: old });
  }
  for (let z = -22.5; z < -9; z += 3) {
    if (stage < 3 && r() < 0.3) continue;
    add(gy('iron-fence'), -3.6, z, { rot: Math.PI / 2, sx: 3, sy: 2.2, sz: 3, pal: old });
  }
  if (stage >= 2) add(gy('lightpost-double'), -5, -10.4, { scale: 3, pal: old });
  // Fogueira de vigília ao lado da capela (a chama e a luz ficam fora da junção).
  add('kenney-survival/campfire-pit.glb', FIRE.x, FIRE.z, { scale: 6 });
  add(gy('trunk'), FIRE.x - 1.8, FIRE.z - 1.8, { rot: 0.7, scale: 3 });
  // A escada de pedra e os pinheiros do fundo.
  add('kenney-town/stairs-wide-stone.glb', (STAIRS.x0 + STAIRS.x1) / 2, (STAIRS.zTop + STAIRS.zBottom) / 2, {
    rot: Math.PI / 2, sx: (STAIRS.zBottom - STAIRS.zTop) / 1.02, sy: TERRACE_Y, sz: STAIRS.x1 - STAIRS.x0, absY: 0,
  });
  for (const [x, z, s] of [[-30, -22.5, 4.4], [-24, -23, 3.6], [29.5, -22, 4.6], [30.5, -12, 3.8], [-30.5, 18, 4], [30, 19.5, 4.2], [12, -23, 3.4], [-6, -23, 3.8]] as const) {
    add(gy(r() < 0.3 ? 'pine-crooked' : 'pine'), x, z, { rot: r() * 6, scale: s, pal: 'pinheiro' });
  }
  // Pedras e mato na beira da ilha.
  for (const [x, z] of [[-31, 0], [31, 2], [-12, 23], [20, 23], [-22, 22.5], [31, -3]] as const) {
    add(gy(r() < 0.5 ? 'rocks' : 'rocks-tall'), x, z, { rot: r() * 6, scale: 3.4, pal: old });
  }
  for (let i = 0; i < 40; i++) {
    const x = ISLAND.x0 + 3 + r() * (ISLAND.x1 - ISLAND.x0 - 6), z = -6 + r() * (ISLAND.z1 + 3);
    if (LOTS.some((l) => { const b = lotBox(l); return x > b.x0 - 1.5 && x < b.x1 + 1.5 && z > b.z0 - 1.5 && z < b.z1 + 1.5; })) continue;
    if (nearPath(x, z, 2.6) || Math.hypot(x - PLAZA.x, z - PLAZA.z) < PLAZA.r + 2) continue;
    add(`kenney-survival/${r() < 0.5 ? 'grass-large' : 'grass'}.glb`, x, z, { rot: r() * 6, scale: 4 + r() * 2, pal: stage === 0 ? 'queimada' : 'base' });
  }
  const lanterns: THREE.Vector3[] = [];
  const smoke: Emitter[] = [];
  const embers: Emitter[] = [];
  if (stage === 0) {
    // Destroços espalhados e cercas quebradas.
    for (const [x, z] of [[-6, 9], [9, 2], [-20, 18], [18, 20], [-2, -3]] as const) add(gy(r() < 0.5 ? 'debris' : 'debris-wood'), x, z, { rot: r() * 6, scale: 3.4, pal: 'velha' });
    for (const [x, z, rot] of [[-21, 17, 0], [-17, 17, 0.1], [21, 11, 1.6]] as const) add('kenney-town/fence-broken.glb', x, z, { rot, scale: K, pal: 'velha' });
  } else {
    for (const [x, z, rot] of [[-21, 17.5, 0], [-17, 17.5, 0], [-29, 17.5, 0], [-25, 17.5, 0]] as const) add('kenney-town/fence.glb', x, z, { rot, scale: K });
    add(gy('hay-bale'), -18, 15.4, { rot: 0.4, scale: 3.6 });
    add(gy('hay-bale-bundled'), 29.5, 14.6, { rot: 1.2, scale: 3.4 });
    add('kenney-survival/barrel.glb', -7.4, 1.2, { scale: 3.4 });
  }
  // Bancos da praça (o do músico e o dos mais velhos).
  for (const b of BENCHES) add(gy(stage === 0 ? 'bench-damaged' : 'bench'), b.x, b.z, { rot: b.rot, scale: 3.2, pal: old });
  // A feira: uma barraca com 4 moradores, três depois do Capitão.
  const stalls = ['kenney-town/stall-red.glb', 'kenney-town/stall-green.glb', 'kenney-town/stall.glb'];
  MARKET.slice(0, marks.stalls).forEach((m, k) => add(stalls[k]!, m.x, m.z, { rot: m.rot + Math.PI / 2, scale: 3 }));
  if (marks.lenhador) {
    add('resource/Wood_Log_Stack.gltf', WOODPILE.x, WOODPILE.z, { rot: Math.PI / 2, scale: 1.5 });
    add(gy('trunk'), (SPOTS.lenha.x + WOODPILE.x) / 2, (SPOTS.lenha.z + WOODPILE.z) / 2 + 0.3, { scale: 2.4 });
    add('resource/Wood_Log_A.gltf', WOODPILE.x + 0.6, WOODPILE.z + 1.6, { rot: 0.7, scale: 1.3 });
  }
  if (marks.carregador) {
    add('kenney-survival/box-large.glb', DEPOT.x, DEPOT.z, { rot: 0.4, scale: 4 });
    add('kenney-survival/box.glb', DEPOT.x + 0.9, DEPOT.z - 1, { rot: 1.1, scale: 4 });
    add('kenney-survival/box.glb', DEPOT.x + 0.2, DEPOT.z - 0.6, { rot: 0.2, scale: 4, y: 1 });
  }
  if (marks.festa) add('mixed/circus_tent.gltf', 25.8, 18.4, { rot: -0.6, scale: 2.6 });
  if (stage >= 2) {
    for (const [x, z] of [[-4.5, 1], [5.5, 9.5], [-4, 16], [9, -6.5]] as const) {
      add('kenney-town/lantern.glb', x, z, { scale: K * 0.75 });
      lanterns.push(new THREE.Vector3(x, heightAt(x, z) + 4.3, z));
    }
  }
  if (stage >= 3) {
    // A fonte e a muralha baixa na frente.
    for (let x = -26; x <= 28; x += 3.6) {
      if (Math.abs(x + 4) < 4) continue;
      add(gy(r() < 0.2 ? 'stone-wall-damaged' : 'stone-wall'), x, 22.6, { scale: 3.6 });
    }
    for (const x of [-9.4, 1.4]) add('kenney-castle/flag-banner-long.glb', x, 22.8, { rot: Math.PI / 2, scale: 2.3, y: 0.4 });
  }
  await Promise.all(tasks);
  const merged = mergeStatic(g);
  if (marks.bandeirolas) {
    // Bandeirolas da festa do Senhor, presas nas lanternas da praça (ou em postes, sem lanternas).
    const anchors = [[-4.5, 1], [5.5, 9.5], [-4, 16]].map(([x, z]) => new THREE.Vector3(x!, 4.4, z!));
    merged.add(bunting([[anchors[0]!, anchors[1]!], [anchors[1]!, anchors[2]!], [anchors[0]!, anchors[2]!]], stage >= 2 ? [] : anchors));
  }
  if (stage >= 3) merged.add(await put(new THREE.Group(), 'kenney-town/fountain-round.glb', PLAZA.x, PLAZA.z, { scale: K }));
  return { group: merged, smoke, embers, lanterns };
}

/** Pinheiro simples (tronco e três andares de cone, uns 60 triângulos) para o fundo da floresta. */
function simplePine(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const paint = (g: THREE.BufferGeometry, color: number) => {
    const c = new THREE.Color(color);
    const n = g.attributes.position!.count;
    g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(n * 3).map((_, k) => [c.r, c.g, c.b][k % 3]!), 3));
    return g.index ? g.toNonIndexed() : g;
  };
  parts.push(paint(new THREE.CylinderGeometry(0.1, 0.15, 0.55, 5).translate(0, 0.27, 0), 0x6b4630));
  for (const [rad, h, y, color] of [[0.6, 0.95, 0.85, 0x467a42], [0.47, 0.8, 1.35, 0x4e8549], [0.33, 0.7, 1.8, 0x579050]] as const) {
    parts.push(paint(new THREE.ConeGeometry(rad, h, 7).translate(0, y, 0), color));
  }
  for (const g of parts) for (const name of Object.keys(g.attributes)) if (!['position', 'normal', 'color'].includes(name)) g.deleteAttribute(name);
  const geo = mergeGeometries(parts, false)!;
  geo.computeVertexNormals();
  return geo;
}

// ---------------------------------------------------------------------------------------------------

export class Town {
  readonly group = new THREE.Group();
  /** Força um estágio e o estado dos lotes (depuração: window.portador.stage.town), sem mexer no save. */
  stageOverride: TownStage | null = null;
  viewOverride: Record<string, LotView> | null = null;
  hourOverride: number | null = null;
  /** Troca o mundo que a vila mostra (depuração: mais moradores, chefes vencidos, a festa). */
  worldOverride: ((w: World) => World) | null = null;
  readonly folk = new Folk(matchMedia('(pointer: coarse)').matches ? FOLK_CAP.phone : FOLK_CAP.desktop);
  private lots = new Map<string, { key: string; built: BuiltLot | null; building: boolean }>();
  private decor: { key: string; group: THREE.Group | null; building: boolean; lanterns: THREE.Vector3[] } = { key: '', group: null, building: false, lanterns: [] };
  private fire!: THREE.PointLight;
  private flame!: THREE.Mesh;
  private lights: THREE.PointLight[] = [];
  private ground!: { canvas: HTMLCanvasElement; tex: THREE.CanvasTexture; stage: number };
  private terrain: THREE.Mesh[] = [];
  private fogLayers: THREE.Mesh[] = [];
  private smoke = new Puffs(220, false);
  private embers = new Puffs(160, true);
  ready = false;

  stageOf(w: World): TownStage {
    return this.stageOverride ?? townStage(w);
  }

  async init(clips: Map<string, THREE.AnimationClip>): Promise<void> {
    this.folk.init(clips);
    this.group.add(this.folk.group);
    // Chão pintado (o topo da ilha e dos platôs usa UV em metros, mapeado para a tela de pintura).
    const canvas = document.createElement('canvas');
    canvas.width = GW;
    canvas.height = GD;
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 8;
    tex.repeat.set(1 / (GW / GROUND_PX), 1 / (GD / GROUND_PX));
    tex.offset.set(-GX0 / (GW / GROUND_PX), 1 + GZ0 / (GD / GROUND_PX));
    this.ground = { canvas, tex, stage: -1 };
    const groundMat = new THREE.MeshStandardMaterial({ map: tex, roughness: 1 });
    const i = ISLAND;
    this.terrain.push(earthBlock(roundedRect(i.x0, i.x1, i.z0, i.z1, [i.r, i.r, i.r, i.r]), 0, 11, groundMat, 1));
    const radii: Record<string, [number, number, number, number]> = { cemiterio: [i.r, 2.5, 2.5, 2.5], torre: [2.5, i.r, 2.5, 2.5], ponte: [1, 1, 1.5, 1.5] };
    for (const t of TERRACES) this.terrain.push(earthBlock(roundedRect(t.x0, t.x1, t.z0, t.z1, radii[t.id]!), TERRACE_Y, TERRACE_Y + 0.5, groundMat, hash(t.id)));
    for (const m of this.terrain) this.group.add(m);
    // Floresta lá embaixo: pinheiros instanciados (um desenho só), cada vez mais fundos e na névoa.
    const pine = (await load('kenney-graveyard/pine.glb')).scene;
    pine.updateMatrixWorld(true);
    const parts: THREE.BufferGeometry[] = [];
    let pineMat: THREE.Material | null = null;
    pine.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      const geo = m.geometry.clone().applyMatrix4(m.matrixWorld);
      for (const name of Object.keys(geo.attributes)) if (!['position', 'normal', 'uv'].includes(name)) geo.deleteAttribute(name);
      parts.push(geo);
      pineMat ??= paletteMaterial(m.material as THREE.MeshStandardMaterial, 'kenney-graveyard:pinheiro', PAL['kenney-graveyard']!.pinheiro!);
    });
    const pineGeo = mergeGeometries(parts.map((p) => (p.index ? p.toNonIndexed() : p)), false)!;
    // Floresta densa em volta: uma grade com sorteio (mais cheia perto da ilha). Os pinheiros do
    // Kenney (uns 340 triângulos) ficam no anel mais perto; mais longe, na névoa, o pinheiro simples
    // de três andares (uns 60).
    const r = rng(77);
    const near: THREE.Matrix4[] = [];
    const far: THREE.Matrix4[] = [];
    const shades: number[] = [];
    for (let gx = -118; gx <= 118; gx += 6.5) {
      for (let gz = -104; gz <= 66; gz += 6.5) {
        const x = gx + (r() - 0.5) * 5, z = gz + (r() - 0.5) * 5;
        const dx = Math.max(i.x0 - x, x - i.x1, 0), dz = Math.max(i.z0 - z, z - i.z1, 0);
        const out = Math.hypot(dx, dz);
        const front = z > i.z1 - 10;
        // Na frente, só uma faixa estreita e bem funda: lá fica a câmera.
        if (out < 3 || out > 100 || (front && (out < 9 || z > i.z1 + 26))) continue;
        if (r() > (out < 22 ? 0.95 : out < 55 ? 0.75 : 0.5)) continue;
        const s = 4.5 + r() * 3.2;
        // Cada vez mais fundos com a distância; os da frente, mais ainda, para não tapar a borda da ilha.
        const y = -6 - Math.min(out, 45) * 0.22 - r() * 3 - (front ? 12 : 0);
        const m = new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, r() * 6, 0)), new THREE.Vector3(s, s * (0.9 + r() * 0.3), s));
        if (out < 10) near.push(m);
        else {
          far.push(m);
          shades.push(0.82 + r() * 0.3);
        }
      }
    }
    const forest = new THREE.InstancedMesh(pineGeo, pineMat!, near.length);
    near.forEach((m, k) => forest.setMatrixAt(k, m));
    forest.computeBoundingSphere();
    this.group.add(forest);
    const simple = new THREE.InstancedMesh(simplePine(), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, flatShading: true }), far.length);
    far.forEach((m, k) => {
      simple.setMatrixAt(k, m);
      simple.setColorAt(k, new THREE.Color().setScalar(shades[k]!));
    });
    simple.computeBoundingSphere();
    this.group.add(simple);
    // Camadas de névoa embaixo da ilha (a parede de terra some nela, como nas imagens de referência).
    for (const [y, a] of [[-3, 0.38], [-7, 0.42], [-12, 0.5]] as const) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(420, 420), new THREE.MeshBasicMaterial({ color: 0x7e9a97, transparent: true, opacity: a, depthWrite: false, fog: false }));
      m.rotation.x = -Math.PI / 2;
      m.position.y = y;
      m.renderOrder = 2;
      this.fogLayers.push(m);
      this.group.add(m);
    }
    // Chama da fogueira de vigília e a luz dela.
    this.flame = new THREE.Mesh(new THREE.ConeGeometry(0.55, 1.8, 7), new THREE.MeshBasicMaterial({ color: 0xffa23a, transparent: true, opacity: 0.9 }));
    this.flame.position.set(FIRE.x, TERRACE_Y + 1, FIRE.z);
    this.group.add(this.flame);
    this.fire = new THREE.PointLight(0xff9a4a, 22, 18, 1.6);
    this.fire.position.set(FIRE.x, TERRACE_Y + 1.8, FIRE.z);
    this.group.add(this.fire);
    for (let k = 0; k < 4; k++) {
      const l = new THREE.PointLight(0xffc27a, 0, 16, 1.6);
      this.lights.push(l);
      this.group.add(l);
    }
    this.group.add(this.smoke.points, this.embers.points);
    this.ready = true;
  }

  /** Repinta o chão e remonta os enfeites e os lotes cujo estado (ou o estágio) mudou. */
  sync(real: World): void {
    const w = this.worldOverride?.(real) ?? real;
    const stage = this.stageOf(w);
    const marks = lifeMarks(w);
    if (this.ground.stage !== stage) {
      paintGround(this.ground.canvas.getContext('2d')!, stage);
      this.ground.tex.needsUpdate = true;
      this.ground.stage = stage;
    }
    const dkey = decorKey(stage, marks);
    if (this.decor.key !== dkey && !this.decor.building) {
      this.decor.building = true;
      void buildDecor(stage, marks).then((d) => {
        this.decor.group?.removeFromParent();
        this.decor = { key: dkey, group: d.group, building: false, lanterns: d.lanterns };
        this.group.add(d.group);
        this.lights.forEach((l, k) => {
          const p = d.lanterns[k];
          l.visible = !!p;
          if (p) l.position.copy(p);
        });
      });
    }
    let changed = false;
    for (const lot of LOTS) {
      const forced = this.viewOverride?.[lot.id];
      const key = this.stageOverride === null && !forced ? lotKey(w, lot) : `${lotKey(w, lot)}:${stage}:${JSON.stringify(forced ?? null)}`;
      const have = this.lots.get(lot.id);
      if (have?.key === key || have?.building) continue;
      const slot = { key, built: have?.built ?? null, building: true };
      this.lots.set(lot.id, slot);
      void buildLot(lot, forced ?? lotView(w, lot), stage).then((b) => {
        slot.built?.group.removeFromParent();
        slot.built = b;
        slot.building = false;
        this.group.add(b.group);
        this.refreshEmitters();
      });
      changed = true;
    }
    if (changed) this.refreshEmitters();
    this.folk.sync(w);
  }

  private refreshEmitters(): void {
    const smoke: Emitter[] = [], embers: Emitter[] = [];
    for (const s of this.lots.values()) {
      if (!s.built) continue;
      smoke.push(...s.built.smoke);
      embers.push(...s.built.embers);
    }
    this.smoke.setEmitters(smoke);
    this.embers.setEmitters(embers);
  }

  /**
   * Luz da hora do dia, fogo tremulando, fumaça, névoa da cor do céu e os moradores. `pxScale` converte
   * metros em pixels para o tamanho das partículas; `far` é a câmera longe (animação em meio ritmo).
   * Devolve a luz do dia (0..1) para o céu e o sol.
   */
  update(real: World, time: number, dt: number, fog: THREE.Color, pxScale: number, speed: number, far: boolean): number {
    const w = this.worldOverride?.(real) ?? real;
    const hour = this.hourOverride ?? townHour(w.tick);
    const day = daylight(hour);
    const flick = 0.85 + 0.15 * Math.sin(time * 11) * Math.sin(time * 6.3);
    this.fire.intensity = (10 + 22 * (1 - day)) * flick;
    this.flame.scale.set(1, 0.85 + 0.25 * flick, 1);
    for (const l of this.lights) l.intensity = 14 * (1 - day);
    for (const m of this.fogLayers) (m.material as THREE.MeshBasicMaterial).color.copy(fog);
    // A fumaça pega a luz da hora: clara de dia, quase da cor do céu à noite.
    const lit = 0.28 + 0.72 * day;
    (this.smoke.material.uniforms.uLight!.value as THREE.Color).setRGB(0.85 * lit, 0.83 * lit, 0.81 * lit);
    (this.smoke.material.uniforms.uDark!.value as THREE.Color).setRGB(0.23 * lit, 0.2 * lit, 0.19 * lit);
    this.smoke.material.uniforms.uScale!.value = pxScale;
    this.embers.material.uniforms.uScale!.value = pxScale;
    this.smoke.update(dt, 0.35);
    this.embers.update(dt, 0.2);
    this.folk.update(w, hour, dt, speed, far);
    return day;
  }

  /** Lote sob o raio (para abrir o painel do prédio ao tocar nele). */
  pick(ray: THREE.Raycaster): Lot | null {
    const hit = ray.intersectObjects(this.terrain, false)[0];
    if (!hit) return null;
    const { x, z } = hit.point;
    return LOTS.find((l) => {
      const b = lotBox(l);
      return x > b.x0 && x < b.x1 && z > b.z0 && z < b.z1;
    }) ?? null;
  }
}

export const TOWN_FILES = [
  ...FOLK_FILES,
  'kenney-graveyard/pine.glb', 'kenney-graveyard/crypt-large.glb', 'kenney-graveyard/crypt-large-roof.glb',
  'kenney-survival/campfire-pit.glb', 'kenney-town/stairs-wide-stone.glb', 'kenney-town/roof-high.glb', 'kenney-town/wall-wood.glb',
];
