/**
 * Planta da vila do M2 (docs/VIGILIA-PORTADOR.md §14.3), sem Three nem DOM: lotes num grid de 4 m,
 * o estado de cada prédio a partir do núcleo, quantas casas estão de pé e a hora do dia.
 * A vila só mostra o estado do jogo; nada daqui entra no save.
 */
import { BALANCE } from '../sim/index.ts';
import type { BuildingId, World } from '../sim/index.ts';

export const CELL = 4;

export type Side = 'n' | 's' | 'e' | 'w';

export interface Lot {
  id: string;
  /** Prédio do núcleo ou casa de moradores. */
  kind: BuildingId | 'casa';
  /** Centro da primeira célula (canto noroeste), em metros. */
  x: number;
  z: number;
  /** Células de 4 m (largura em x, fundo em z). */
  w: number;
  d: number;
  door: Side;
  wood: boolean;
  /** Casas além das 6 primeiras nascem em terreno limpo (sem ruína antes). */
  ruinFirst: boolean;
}

/**
 * Entrada da Cripta na borda sul (a câmera olha para o noroeste, então a vila fica à frente de quem
 * está ali), a fogueira de vigília perto dela e onde o herói senta: levantar, correr e empurrar a
 * porta cabem nos 3,6 s da saída da viagem (travel.ts).
 */
export const CRYPT = { x: 0, z: 31 };
export const FIRE = { x: 4.6, z: 24.5 };
export const SEAT = { x: 2.9, z: 23.3 };
/** Vista de casa da câmera da vila: praça, prédios, fogueira e a entrada da Cripta no mesmo quadro. */
export const HOME_VIEW = { x: -1, z: 13, zoom: 1.75 };

const b = (kind: BuildingId, x: number, z: number, door: Side, wood: boolean): Lot => ({ id: kind, kind, x, z, w: 2, d: 2, door, wood, ruinFirst: true });
const h = (n: number, x: number, z: number, door: Side, wood: boolean, ruinFirst = true): Lot => ({ id: `casa${n}`, kind: 'casa', x, z, w: 2, d: 2, door, wood, ruinFirst });

export const LOTS: Lot[] = [
  b('ferreiro', -20, 12, 'e', false),
  b('treinador', 16, 12, 'w', true),
  b('carroceiro', -20, 24, 'e', true),
  b('taticas', 16, 24, 'w', false),
  b('alquimista', -20, -12, 's', true),
  b('curandeira', 16, -12, 's', false),
  h(1, -32, 8, 'n', true),
  h(2, 28, 8, 'n', false),
  h(3, -32, -12, 's', false),
  h(4, 28, -12, 's', true),
  h(5, -12, -24, 'e', true),
  h(6, 8, -24, 'w', false),
  h(7, -44, 8, 'n', false, false),
  h(8, 40, 8, 'n', true, false),
  h(9, -44, -12, 's', true, false),
  h(10, 40, -12, 's', false, false),
  h(11, -12, -36, 'e', false, false),
  h(12, 8, -36, 'w', true, false),
];

/** Ruas (centros das células de 4 m): praça 5 × 5 e as quatro saídas. */
export function roadCells(): [number, number][] {
  const out: [number, number][] = [];
  for (let x = -8; x <= 8; x += CELL) for (let z = -8; z <= 8; z += CELL) out.push([x, z]);
  for (let z = 12; z <= 30; z += CELL) out.push([0, z]);
  for (let z = -12; z >= -40; z -= CELL) out.push([0, z]);
  for (let x = 12; x <= 48; x += CELL) out.push([x, 0], [-x, 0]);
  return out;
}

export type LotState = 'vazio' | 'ruina' | 'obra' | 'pronta' | 'ampliada';

export interface LotView {
  state: LotState;
  /** Obra de subida de nível: andaime em volta do prédio que já existe. */
  scaffold: boolean;
}

export function housesStanding(people: number): number {
  return Math.min(LOTS.filter((l) => l.kind === 'casa').length, Math.ceil(people / 4));
}

export function lotView(w: World, lot: Lot): LotView {
  const v = w.village;
  if (lot.kind === 'casa') {
    const n = Number(lot.id.slice(4));
    if (n <= housesStanding(v.people)) return { state: 'pronta', scaffold: false };
    return { state: lot.ruinFirst ? 'ruina' : 'vazio', scaffold: false };
  }
  const level = v.buildings[lot.kind];
  const building = v.construction?.id === lot.kind;
  if (level <= 0) return { state: building ? 'obra' : 'ruina', scaffold: false };
  return { state: level >= 3 ? 'ampliada' : 'pronta', scaffold: building };
}

/** Assinatura do estado de todos os lotes (o 3D só remonta o lote que mudou). */
export function lotKey(w: World, lot: Lot): string {
  const v = lotView(w, lot);
  return `${lot.id}:${v.state}:${v.scaffold}`;
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

/** A fonte volta a jorrar com 10 moradores (marco de vida). */
export function fountainOn(w: World): boolean {
  return w.village.people >= 10;
}
