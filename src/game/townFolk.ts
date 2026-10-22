/**
 * Moradores da vila (docs/VIGILIA-PORTADOR.md §14.3, M2.2), sem Three nem DOM: quem mora na vila
 * (nome, rosto, roupa e ofício, sempre os mesmos para a mesma semente), os marcos de vida, a rotina
 * por hora, os pontos de trabalho e a rede de caminhos por onde eles andam. Tudo é derivado do estado
 * e da semente: nada daqui muda número do jogo nem entra no save.
 */
import { BALANCE } from '../sim/index.ts';
import type { HeadId, World } from '../sim/index.ts';
import { LOTS, PATHS, PLAZA, lotFront, lotView, townStage } from './townPlan.ts';

export type Job = 'passante' | 'ferreiro' | 'lenhador' | 'feirante' | 'carregador' | 'musico' | 'idoso' | 'crianca';

export interface Resident {
  /** Ordem de chegada (0 é o primeiro morador). */
  n: number;
  name: string;
  /** Ofício fixo pela ordem de chegada; o que ele faz hoje depende dos marcos (activeJob). */
  job: Job;
  child: boolean;
  female: boolean;
  head: HeadId;
  /** Corpo do Ranger ou do Rogue, com a roupa recolorida. */
  donor: 'Ranger' | 'Rogue';
  outfit: number;
}

/** Roupas simples: túnica, lenço e calça (as faixas de tecido do atlas, sem mexer na pele). */
export const OUTFITS: { tunic: number; accent: number; trousers: number }[] = [
  { tunic: 0x9a3b2e, accent: 0xd8c8a8, trousers: 0x4a3a2e },
  { tunic: 0x3f5f8a, accent: 0xc9a54a, trousers: 0x3a3f48 },
  { tunic: 0x4f7a3a, accent: 0x8a5a3a, trousers: 0x4a3a2e },
  { tunic: 0xb8902f, accent: 0x6e2f45, trousers: 0x5a4a38 },
  { tunic: 0x6e2f45, accent: 0xd8c8a8, trousers: 0x3a3f48 },
  { tunic: 0x6c7a86, accent: 0x9a3b2e, trousers: 0x4a3a2e },
  { tunic: 0x9a7a52, accent: 0x3f5f8a, trousers: 0x5a4a38 },
  { tunic: 0xd8c8a8, accent: 0x4f7a3a, trousers: 0x4a3a2e },
];

/** Ofício de cada morador pela ordem de chegada (depois do último, todos passam pela vila). */
const JOBS: Job[] = [
  'passante', 'ferreiro', 'feirante', 'lenhador', 'carregador', 'crianca', 'crianca', 'musico', 'idoso', 'crianca',
  'feirante', 'passante', 'passante', 'crianca', 'carregador', 'passante', 'idoso', 'crianca', 'passante', 'feirante',
  'passante', 'crianca', 'passante', 'passante',
];

const MEN = ['Joaquim', 'Bento', 'Tomé', 'Simão', 'Gaspar', 'Inácio', 'Vicente', 'Diogo', 'Martim', 'Afonso', 'Lourenço', 'Gonçalo', 'Brás', 'Damião', 'Rui', 'Mateus'];
const WOMEN = ['Joana', 'Inês', 'Beatriz', 'Leonor', 'Teresa', 'Catarina', 'Clara', 'Isabel', 'Brites', 'Margarida', 'Luzia', 'Rosa', 'Graça', 'Benedita', 'Filipa', 'Ana'];
const KIDS = ['Zeca', 'Tico', 'Lia', 'Nina', 'Pipo', 'Bia', 'Dudu', 'Mel', 'Juca', 'Tati'];
/** Rostos dos aventureiros (o encapuzado fica de fora: na vila ninguém anda de capuz). */
const FACES: { head: HeadId; female: boolean }[] = [
  { head: 'Knight', female: false }, { head: 'Barbarian', female: false }, { head: 'Ranger', female: false },
  { head: 'Rogue', female: true }, { head: 'Mage', female: true },
];

function mix(a: number, b: number): number {
  let h = (a ^ Math.imul(b + 0x9e3779b9, 0x85ebca6b)) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35) >>> 0;
  return (h ^ (h >>> 16)) >>> 0;
}

function sketch(seed: number, n: number) {
  const job = JOBS[n] ?? 'passante';
  const child = job === 'crianca';
  const h = (k: number) => mix(mix(seed, n), k);
  const face = FACES[h(1) % FACES.length]!;
  const pool = child ? KIDS : face.female ? WOMEN : MEN;
  return { job, child, face, pool, h };
}

/** Morador número n desta semente (o mesmo sempre). */
export function resident(seed: number, n: number): Resident {
  const { job, child, face, pool, h } = sketch(seed, n);
  // Nomes sem repetir: cada lista anda de 5 em 5 (ou de 3 em 3, a das crianças) a partir de um
  // começo sorteado pela semente, na ordem de chegada de quem usa a mesma lista.
  let before = 0;
  for (let i = 0; i < n; i++) if (sketch(seed, i).pool === pool) before++;
  const step = pool.length % 5 ? 5 : 3;
  const name = pool[(mix(seed, pool.length) + before * step) % pool.length]!;
  return { n, name, job, child, female: face.female, head: face.head, donor: h(3) % 2 ? 'Ranger' : 'Rogue', outfit: h(4) % OUTFITS.length };
}

/** Teto de moradores na tela (o resto "está em casa"): 24 no computador, 14 no celular. */
export const FOLK_CAP = { desktop: 24, phone: 14 };

export function residents(w: World, cap: number): Resident[] {
  const n = Math.min(w.village.people, cap);
  return Array.from({ length: n }, (_, i) => resident(w.seed, i));
}

export interface LifeMarks {
  people: number;
  /** Barracas na feira: 1 com 4 moradores, 3 depois do Capitão. */
  stalls: number;
  lenhador: boolean;
  carregador: boolean;
  musico: boolean;
  criancas: boolean;
  /** Festa por 1 dia de jogo depois da primeira vitória sobre o Senhor da Cripta. */
  festa: boolean;
  /** As bandeirolas da festa ficam. */
  bandeirolas: boolean;
}

export function lifeMarks(w: World): LifeMarks {
  const people = w.village.people;
  const capitao = w.bossesBeaten.includes(5);
  const senhor = w.bossesBeaten.includes(10);
  const first = w.stats.bossFirst['10'];
  return {
    people,
    stalls: people >= 4 ? (capitao || townStage(w) === 3 ? 3 : 1) : 0,
    lenhador: people >= 4,
    carregador: people >= 5,
    musico: capitao,
    criancas: people >= 6,
    festa: first !== undefined && w.tick - first < BALANCE.dayTicks,
    bandeirolas: senhor,
  };
}

/** O que o morador faz hoje: o ofício dele, se o marco já chegou; senão, passeia. */
export function activeJob(r: Resident, m: LifeMarks): Job {
  const open: Record<Job, boolean> = {
    passante: true, ferreiro: true, idoso: true, crianca: m.criancas,
    feirante: m.stalls > 0, lenhador: m.lenhador, carregador: m.carregador, musico: m.musico,
  };
  return open[r.job] ? r.job : 'passante';
}

const JOB_NAMES: Record<Job, [string, string]> = {
  passante: ['morador', 'moradora'], ferreiro: ['ferreiro', 'ferreira'], lenhador: ['lenhador', 'lenhadora'],
  feirante: ['feirante', 'feirante'], carregador: ['carregador', 'carregadora'], musico: ['músico', 'música'],
  idoso: ['avô', 'avó'], crianca: ['criança', 'criança'],
};

/** "Joana, feirante". */
export function residentLabel(r: Resident, m: LifeMarks): string {
  return `${r.name}, ${JOB_NAMES[activeJob(r, m)][r.female ? 1 : 0]}`;
}

// ---------------------------------------------------------------------------------------------------
// Pontos da vila (onde cada ofício trabalha) e os enfeites que vêm com eles.

export interface Spot {
  x: number;
  z: number;
  /** Para onde a pessoa olha (rotação em y, 0 = +z). */
  face: number;
}

const faceTo = (x: number, z: number, tx: number, tz: number) => Math.atan2(tx - x, tz - z);

const smithy = (() => {
  const f = lotFront(LOTS.find((l) => l.kind === 'ferreiro')!);
  // A bigorna fica a 2,2 m ao longo da fachada; o ferreiro, do lado de fora dela, olhando para ela.
  const ax = f.x + f.along[0] * 2.2 + f.out[0] * 0.4, az = f.z + f.along[1] * 2.2 + f.out[1] * 0.4;
  const x = ax + f.out[0] * 1.5, z = az + f.out[1] * 1.5;
  return { x, z, face: faceTo(x, z, ax, az) };
})();

/** A pilha de lenha do lenhador (vem com 4 moradores). */
export const WOODPILE = { x: 25.5, z: 12.2 };
/** As barracas da feira, viradas para a praça; o feirante fica atrás de cada uma. */
export const MARKET = [
  { x: -5.4, z: -1.2 },
  { x: 6.6, z: 1.4 },
  { x: -5.6, z: 8.8 },
].map((s) => ({ ...s, rot: faceTo(s.x, s.z, PLAZA.x, PLAZA.z) }));
/** Bancos no largo ao pé da escada, de frente para a praça: o do músico e o dos mais velhos. */
export const BENCHES = [
  { x: 1.2, z: -6 },
  { x: -2.4, z: -5.2 },
].map((s) => ({ ...s, rot: faceTo(s.x, s.z, PLAZA.x, PLAZA.z) }));
/** As caixas que o carregador leva das tendas do carroceiro para a feira. */
export const DEPOT = { x: 19.2, z: 4.6 };

const behind = (s: { x: number; z: number }, d: number): Spot => {
  const dx = s.x - PLAZA.x, dz = s.z - PLAZA.z, len = Math.hypot(dx, dz);
  const x = s.x + (dx / len) * d, z = s.z + (dz / len) * d;
  return { x, z, face: faceTo(x, z, PLAZA.x, PLAZA.z) };
};

export const SPOTS = {
  bigorna: smithy,
  // Do lado da câmera (sul) da pilha, virado para ela: o machado fica à vista.
  lenha: { x: WOODPILE.x + 0.9, z: WOODPILE.z + 2.2, face: faceTo(WOODPILE.x + 0.9, WOODPILE.z + 2.2, WOODPILE.x, WOODPILE.z) },
  barraca: MARKET.map((s) => behind(s, 1.9)),
  banco: BENCHES.map((s) => ({ x: s.x, z: s.z, face: s.rot })),
  deposito: { x: DEPOT.x - 1.2, z: DEPOT.z + 0.6, face: Math.PI / 2 },
};

/** Portas das casas de pé e dos prédios prontos (para onde cada um volta à noite). */
export function doors(w: World): Spot[] {
  return LOTS.filter((l) => l.style === 'casa' && ['pronta', 'ampliada'].includes(lotView(w, l).state)).map((l) => {
    const f = lotFront(l);
    return { x: f.x - f.out[0] * 1.6, z: f.z - f.out[1] * 1.6, face: Math.atan2(-f.out[0], -f.out[1]) };
  });
}

// ---------------------------------------------------------------------------------------------------
// Rotina por hora.

export type Doing =
  | { at: 'casa' }
  | { at: 'ponto'; spot: Spot; anim: string; prop?: 'martelo' | 'machado' | 'violao' }
  | { at: 'passeio'; area: 'praca' | 'vila'; run: boolean }
  | { at: 'carrega' }
  | { at: 'festa' };

/** O que o morador faz na hora (0–24) com os marcos de hoje. À noite, todos estão em casa. */
export function doing(r: Resident, hour: number, m: LifeMarks): Doing {
  const job = activeJob(r, m);
  if (m.festa && hour >= 9 && hour < 23) return { at: 'festa' };
  const lunch = hour >= 12 && hour < 13.5 && !r.child;
  switch (job) {
    case 'ferreiro':
      if (hour >= 7 && hour < 18 && !lunch) return { at: 'ponto', spot: SPOTS.bigorna, anim: 'Hammering', prop: 'martelo' };
      break;
    case 'lenhador':
      if (hour >= 7 && hour < 17 && !lunch) return { at: 'ponto', spot: SPOTS.lenha, anim: 'Chopping', prop: 'machado' };
      break;
    case 'feirante':
      if (hour >= 8 && hour < 18) return { at: 'ponto', spot: SPOTS.barraca[r.n % Math.max(1, m.stalls)]!, anim: 'Idle_A' };
      break;
    case 'carregador':
      if (hour >= 8 && hour < 18 && !lunch) return { at: 'carrega' };
      break;
    case 'musico':
      if (hour >= 16.5 && hour < 23) return { at: 'ponto', spot: SPOTS.banco[0]!, anim: 'Sit_Chair_Idle', prop: 'violao' };
      break;
    case 'idoso':
      if (hour >= 9 && hour < 18) return { at: 'ponto', spot: SPOTS.banco[1]!, anim: 'Sit_Chair_Idle' };
      break;
    case 'crianca':
      if (hour >= 8 && hour < 19.5) return { at: 'passeio', area: 'praca', run: true };
      return { at: 'casa' };
    default:
      break;
  }
  if (lunch) return { at: 'passeio', area: 'praca', run: false };
  if (hour >= 7 && hour < 21.5) return { at: 'passeio', area: hour >= 18 ? 'praca' : 'vila', run: false };
  return { at: 'casa' };
}

// ---------------------------------------------------------------------------------------------------
// Rede de caminhos: os pontos dos caminhos da planta e um anel na praça, com a rota mais curta.

export const NODES: [number, number][] = [];
const EDGES: number[][] = [];

function node(x: number, z: number): number {
  const at = NODES.findIndex(([nx, nz]) => Math.hypot(nx - x, nz - z) < 0.6);
  if (at >= 0) return at;
  NODES.push([x, z]);
  EDGES.push([]);
  return NODES.length - 1;
}

function link(a: number, b: number): void {
  if (a === b || EDGES[a]!.includes(b)) return;
  EDGES[a]!.push(b);
  EDGES[b]!.push(a);
}

/** Menor distância do centro da praça a um trecho. */
function clearance(x0: number, z0: number, x1: number, z1: number): number {
  const dx = x1 - x0, dz = z1 - z0;
  const t = Math.max(0, Math.min(1, ((PLAZA.x - x0) * dx + (PLAZA.z - z0) * dz) / (dx * dx + dz * dz || 1)));
  return Math.hypot(PLAZA.x - x0 - dx * t, PLAZA.z - z0 - dz * t);
}

{
  // Os caminhos viram correntes de pontos; os que caem na praça saem (lá fica a fonte), e a praça
  // ganha um anel em volta dela.
  const ends: number[] = [];
  for (const p of PATHS) {
    let prev = -1;
    for (const [x, z] of p.pts) {
      if (Math.hypot(x - PLAZA.x, z - PLAZA.z) < 4.8) {
        if (prev >= 0) ends.push(prev);
        prev = -1;
        continue;
      }
      const k = node(x, z);
      if (prev >= 0) link(prev, k);
      else ends.push(k);
      prev = k;
    }
    if (prev >= 0) ends.push(prev);
  }
  const ring: number[] = [];
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    ring.push(node(PLAZA.x + Math.cos(a) * 4.6, PLAZA.z + Math.sin(a) * 4.6));
  }
  ring.forEach((k, i) => link(k, ring[(i + 1) % ring.length]!));
  // Cada ponta de corrente (e cada ponto do anel) liga-se ao ponto mais perto de outra corrente.
  for (const k of [...ends, ...ring]) {
    const [x, z] = NODES[k]!;
    let best = -1, bd = 7;
    NODES.forEach(([nx, nz], j) => {
      // Nenhuma ligação nova corta a fonte.
      if (j === k || EDGES[k]!.includes(j) || clearance(x, z, nx, nz) < 4.3) return;
      const d = Math.hypot(nx - x, nz - z);
      if (d < bd) [best, bd] = [j, d];
    });
    if (best >= 0) link(k, best);
  }
}

function nearest(x: number, z: number): number {
  let best = 0, bd = Infinity;
  NODES.forEach(([nx, nz], j) => {
    const d = Math.hypot(nx - x, nz - z);
    if (d < bd) [best, bd] = [j, d];
  });
  return best;
}

/** Rota de um ponto a outro pela rede (com os dois pontos nas pontas). */
export function route(from: [number, number], to: [number, number]): [number, number][] {
  const a = nearest(...from), b = nearest(...to);
  const dist = NODES.map(() => Infinity);
  const prev = NODES.map(() => -1);
  const done = NODES.map(() => false);
  dist[a] = 0;
  for (;;) {
    let u = -1;
    dist.forEach((d, j) => { if (!done[j] && d < Infinity && (u < 0 || d < dist[u]!)) u = j; });
    if (u < 0 || u === b) break;
    done[u] = true;
    for (const v of EDGES[u]!) {
      const d = dist[u]! + Math.hypot(NODES[u]![0] - NODES[v]![0], NODES[u]![1] - NODES[v]![1]);
      if (d < dist[v]!) [dist[v], prev[v]] = [d, u];
    }
  }
  const path: [number, number][] = [];
  for (let k = b; k >= 0; k = prev[k]!) {
    path.unshift(NODES[k]!);
    if (k === a) break;
  }
  return [from, ...path, to];
}

/** Um ponto de passeio: na praça (em volta da fonte) ou em qualquer ponto da rede. */
export function strollPoint(area: 'praca' | 'vila', pick: () => number): [number, number] {
  if (area === 'praca') {
    // Em volta da fonte (raio de 4 m), sem entrar nela.
    const a = pick() * Math.PI * 2, rad = 4.6 + pick() * 1.6;
    return [PLAZA.x + Math.cos(a) * rad, PLAZA.z + Math.sin(a) * rad];
  }
  return NODES[Math.floor(pick() * NODES.length)]!;
}

// ---------------------------------------------------------------------------------------------------
// Bichos de casa (M2.3): no máximo 3 na vila, só domésticos (pedido do usuário).

export type PetKind = 'cachorro' | 'gato' | 'pintinho';

/** O pintinho cisca em volta do feno, entre o treinador e a curandeira (à vista da câmera). */
export const CHICK_YARD = { x: -17.6, z: 16, r: 1.5 };
/** Onde o gato cochila de dia: na beira da fonte (estágio 3) ou no degrau da curandeira. */
export function catNap(stage: number): Spot {
  if (stage >= 3) return { x: PLAZA.x + 4.3, z: PLAZA.z + 1.2, face: 0.4 };
  const f = lotFront(LOTS.find((l) => l.kind === 'curandeira')!);
  return { x: f.x + f.along[0] * 2.4 - f.out[0] * 1.2, z: f.z + f.along[1] * 2.4 - f.out[1] * 1.2, face: 0.6 };
}

/** Quem já chegou: o cachorro e o pintinho com 4 moradores, o gato com 6. */
export function pets(w: World): PetKind[] {
  const people = w.village.people;
  const out: PetKind[] = [];
  if (people >= 4) out.push('cachorro', 'pintinho');
  if (people >= 6) out.push('gato');
  return out;
}

export type PetDoing =
  | { at: 'casa' }
  | { at: 'ponto'; spot: Spot; anim: 'idle' | 'eat' | 'static' }
  | { at: 'passeio'; area: 'praca' | 'vila'; run: boolean }
  | { at: 'cisca' };

/** O dia de cada bicho: o cachorro anda pela vila (e dorme na porta do ferreiro), o gato cochila
 *  e passeia ao entardecer, o pintinho cisca de dia. */
export function petDoing(kind: PetKind, hour: number, stage: number): PetDoing {
  const night = hour < 6.5 || hour >= 21.5;
  switch (kind) {
    case 'cachorro':
      if (night) return { at: 'ponto', spot: { ...SPOTS.bigorna, x: SPOTS.bigorna.x + 2.4 }, anim: 'static' };
      return { at: 'passeio', area: hour >= 17 ? 'praca' : 'vila', run: hour % 3 < 0.6 };
    case 'gato':
      if (night) return { at: 'casa' };
      if (hour < 16) return { at: 'ponto', spot: catNap(stage), anim: 'idle' };
      return { at: 'passeio', area: 'praca', run: false };
    case 'pintinho':
      return night || hour >= 19 ? { at: 'casa' } : { at: 'cisca' };
  }
}
