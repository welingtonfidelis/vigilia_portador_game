import type { World } from './types.ts';

/** mulberry32 com o estado dentro do mundo: salvar e carregar continua a mesma sequência. */
export function rand(w: World): number {
  let t = (w.rng = (w.rng + 0x6d2b79f5) >>> 0);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

export function chance(w: World, p: number): boolean {
  return rand(w) < p;
}

/** Inteiro em [min, max]. */
export function int(w: World, min: number, max: number): number {
  return min + Math.floor(rand(w) * (max - min + 1));
}

export function pick<T>(w: World, list: readonly T[]): T {
  return list[Math.floor(rand(w) * list.length)]!;
}

/** Sorteio por peso: [valor, peso][]. */
export function weighted<T>(w: World, table: readonly (readonly [T, number])[]): T {
  const total = table.reduce((s, [, p]) => s + p, 0);
  let r = rand(w) * total;
  for (const [v, p] of table) {
    r -= p;
    if (r < 0) return v;
  }
  return table[table.length - 1]![0];
}
