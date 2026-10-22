/**
 * Planta da vila em diorama (docs/VIGILIA-PORTADOR.md §14.3), sem Three nem DOM: um quadrado de terra
 * com dois platôs ao fundo ligados por uma ponte, a escada de pedra até a capela da Cripta, os lotes
 * num grid de 4 m, os caminhos, o estado de cada prédio a partir do núcleo, o estágio da vila e a hora
 * do dia. A vila só mostra o estado do jogo; nada daqui entra no save.
 */
import { BALANCE } from '../sim/index.ts';
import type { BuildingId, World } from '../sim/index.ts';

export const CELL = 4;

export type Side = 'n' | 's' | 'e' | 'w';

/** Como o lote é montado: casa de enxaimel, tendas do carroceiro ou a torre do Salão de Táticas. */
export type LotStyle = 'casa' | 'tendas' | 'torre';

export interface Lot {
  id: string;
  /** Prédio do núcleo ou casa de moradores. */
  kind: BuildingId | 'casa';
  style: LotStyle;
  /** Centro da primeira célula (canto noroeste), em metros. */
  x: number;
  z: number;
  /** Células de 4 m (largura em x, fundo em z). */
  w: number;
  d: number;
  door: Side;
  /** Paredes de madeira (enxaimel) ou de pedra no térreo. */
  wood: boolean;
}

/** A ilha: retângulo de cantos redondos; fora dele, só névoa e a floresta lá embaixo. */
export const ISLAND = { x0: -32, x1: 32, z0: -24, z1: 24, r: 7 };
/** Altura dos platôs (uma parede do Kenney ampliada). */
export const TERRACE_Y = 4;
/** Platôs ao fundo: o do cemitério (oeste), o da torre (leste) e a ponte entre eles, onde fica a capela. */
export const TERRACES = [
  { id: 'cemiterio', x0: -32, x1: -3, z0: -24, z1: -8 },
  { id: 'torre', x0: 13, x1: 32, z0: -24, z1: -6 },
  { id: 'ponte', x0: -5, x1: 15, z0: -24, z1: -14 },
] as const;
/** A escada de pedra sobe do vale entre os platôs até a ponte. */
export const STAIRS = { x0: 2.5, x1: 8.5, zTop: -14, zBottom: -8 };

/** A capela da Cripta, no alto da escada com a porta para o sul. */
export const CRYPT = { x: 5.5, z: -19.5 };
/** Na frente da porta da capela, onde o herói empurra a porta. */
export const CRYPT_DOOR = { x: 5.5, z: -14.7 };
/** A fogueira de vigília ao lado da capela e onde o herói senta. */
export const FIRE = { x: -1.4, z: -17.6 };
export const SEAT = { x: 0.4, z: -16.5 };
/** Praça (com a fonte no estágio 3). */
export const PLAZA = { x: 0, z: 5, r: 6 };
/** Vista de casa da câmera da vila: a ilha inteira no quadro. */
export const HOME_VIEW = { x: 0, z: 1, zoom: 1 };

const lot = (kind: BuildingId | 'casa', id: string, style: LotStyle, x: number, z: number, door: Side, wood: boolean): Lot => ({ id, kind, style, x, z, w: 2, d: 2, door, wood });

export const LOTS: Lot[] = [
  lot('alquimista', 'alquimista', 'casa', -27, -3, 'e', true),
  lot('ferreiro', 'ferreiro', 'casa', -15, -3, 's', false),
  lot('treinador', 'treinador', 'casa', -27, 9, 'e', true),
  lot('curandeira', 'curandeira', 'casa', -13, 13, 'n', true),
  lot('carroceiro', 'carroceiro', 'tendas', 23, 1, 'w', true),
  lot('taticas', 'taticas', 'torre', 18, -20, 's', false),
  lot('casa', 'casa1', 'casa', 3, 13, 'n', true),
  lot('casa', 'casa2', 'casa', 15, 13, 'n', false),
  lot('casa', 'casa3', 'casa', 11, -3, 's', true),
];

/** Caminhos de terra (calçados a partir do estágio 2): linhas de pontos [x, z] com largura em metros. */
export const PATHS: { pts: [number, number][]; width: number }[] = [
  // Do pé da escada, pela praça, até a borda da frente.
  { pts: [[5.5, -8], [4.5, -3], [1.5, 2], [0, 7], [-2, 13], [-3, 19], [-4, 24]], width: 4 },
  // Para oeste: ferreiro, alquimista e a borda.
  { pts: [[-4, 4], [-10, 5], [-17, 4], [-24, 5], [-32, 6]], width: 3.2 },
  // Para leste: as casas e as tendas do carroceiro.
  { pts: [[5, 6], [11, 7.5], [17, 7.5], [24, 8.5], [32, 9]], width: 3.2 },
  // Ramais até as portas.
  { pts: [[-19, 4.5], [-19, 13]], width: 2.4 },
  { pts: [[-11, 5], [-11, 11]], width: 2.4 },
  { pts: [[13, 7.5], [13, 5]], width: 2.4 },
];

export function inBox(x: number, z: number, b: { x0: number; x1: number; z0: number; z1: number }): boolean {
  return x >= b.x0 && x <= b.x1 && z >= b.z0 && z <= b.z1;
}

/** Caixa de um lote em metros. */
export function lotBox(l: Lot): { x0: number; x1: number; z0: number; z1: number } {
  return { x0: l.x - CELL / 2, x1: l.x + (l.w - 0.5) * CELL, z0: l.z - CELL / 2, z1: l.z + (l.d - 0.5) * CELL };
}

/** Altura do chão: 0 no nível da praça, TERRACE_Y nos platôs e a rampa da escada entre os dois. */
export function heightAt(x: number, z: number): number {
  if (x >= STAIRS.x0 && x <= STAIRS.x1 && z >= STAIRS.zTop && z <= STAIRS.zBottom) {
    return (TERRACE_Y * (STAIRS.zBottom - z)) / (STAIRS.zBottom - STAIRS.zTop);
  }
  return TERRACES.some((t) => inBox(x, z, t)) ? TERRACE_Y : 0;
}

/** Estágio da vila (as quatro imagens de referência em docs/img/conceito-vila-*.jpg). */
export type TownStage = 0 | 1 | 2 | 3;

/**
 * 0 destruída (começo), 1 reconstruída (3 prédios de pé), 2 melhorada (Capitão do andar 5 vencido),
 * 3 melhorada de novo (Senhor do andar 10 vencido e 10 moradores).
 */
export function townStage(w: World): TownStage {
  const built = Object.values(w.village.buildings).filter((l) => l > 0).length;
  if (built < 3) return 0;
  if (w.bossesBeaten.includes(10) && w.village.people >= 10) return 3;
  if (w.bossesBeaten.includes(5)) return 2;
  return 1;
}

export type LotState = 'vazio' | 'ruina' | 'obra' | 'pronta' | 'ampliada';

export interface LotView {
  state: LotState;
  /** Obra de subida de nível: andaime em volta do prédio que já existe. */
  scaffold: boolean;
}

const HOUSES = LOTS.filter((l) => l.kind === 'casa').length;

/** Uma casa a cada 4 moradores (o resto da gente aparece andando pela vila na M2.2). */
export function housesStanding(people: number): number {
  return Math.min(HOUSES, Math.ceil(people / 4));
}

export function lotView(w: World, l: Lot): LotView {
  const v = w.village;
  if (l.kind === 'casa') {
    const n = Number(l.id.slice(4));
    return { state: n <= housesStanding(v.people) ? 'pronta' : 'ruina', scaffold: false };
  }
  const level = v.buildings[l.kind];
  const building = v.construction?.id === l.kind;
  if (level <= 0) return { state: building ? 'obra' : 'ruina', scaffold: false };
  return { state: level >= 3 ? 'ampliada' : 'pronta', scaffold: building };
}

/** Assinatura de um lote (o 3D só remonta o lote que mudou; o estágio muda telhado e enfeites). */
export function lotKey(w: World, l: Lot): string {
  const v = lotView(w, l);
  return `${l.id}:${v.state}:${v.scaffold}:${townStage(w)}`;
}

/** Hora do dia (0–24). O jogo começa às 6 h; um dia de jogo são 10 min em 1×. */
export function townHour(tick: number): number {
  return (6 + (24 * (tick % BALANCE.dayTicks)) / BALANCE.dayTicks) % 24;
}

/** Quanto de sol (0 à noite, 1 ao meio-dia), com amanhecer às 6 h e anoitecer às 19 h. */
export function daylight(hour: number): number {
  if (hour < 5 || hour >= 20) return 0;
  if (hour < 7) return (hour - 5) / 2;
  if (hour >= 18) return (20 - hour) / 2;
  return 1;
}
