import type { World } from './types.ts';
import { SAVE_VERSION } from './world.ts';

/** FNV-1a de 32 bits: protege contra save truncado ou editado por engano. */
export function checksum(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

export function serialize(w: World): string {
  const body = JSON.stringify(w);
  return JSON.stringify({ v: SAVE_VERSION, sum: checksum(body), body });
}

type Migration = (w: Record<string, unknown>) => void;

/** Migrações em cadeia: MIGRATIONS[n] leva do save n para o n + 1. */
const MIGRATIONS: Record<number, Migration> = {};

export function deserialize(text: string): World {
  const wrap = JSON.parse(text) as { v: number; sum: string; body: string };
  if (typeof wrap.body !== 'string') throw new Error('save sem corpo');
  if (checksum(wrap.body) !== wrap.sum) throw new Error('checksum não confere');
  const w = JSON.parse(wrap.body) as Record<string, unknown>;
  let v = Number(w.version ?? wrap.v);
  if (v > SAVE_VERSION) throw new Error(`save de uma versão mais nova (${v})`);
  while (v < SAVE_VERSION) {
    const m = MIGRATIONS[v];
    if (!m) throw new Error(`sem migração do save ${v}`);
    m(w);
    v++;
    w.version = v;
  }
  return w as unknown as World;
}
