import { actThreeRules, actTwoRules } from './rules.ts';
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
const MIGRATIONS: Record<number, Migration> = {
  // v1 → v2 (M1): fases de chefe, ressurreição, forja completa e as estatísticas novas.
  1: (w) => {
    const room = w.room as { enemies: Record<string, unknown>[]; phase2At?: number } | null;
    if (room) {
      room.phase2At ??= 0;
      for (const e of room.enemies) {
        e.phase ??= 1;
        e.revived ??= false;
      }
    }
    const stats = w.stats as Record<string, unknown>;
    stats.forged ??= 0;
    stats.upgraded ??= 0;
    stats.senhorFights ??= 0;
    stats.senhorFightTicks ??= 0;
    stats.senhorPhase2Frac ??= 0;
  },
  // v2 → v3 (M3.1, o Ato II): ferro-negro, couraça dos inimigos, lentidão e atordoamento do herói e
  // as duas regras de fábrica do Ato II (no fim da lista, se ainda não estiverem lá).
  2: (w) => {
    const fill = (mats: Record<string, number> | undefined) => {
      if (mats) mats.ferro_negro ??= 0;
    };
    const village = w.village as { mats: Record<string, number> };
    fill(village.mats);
    const exp = w.exp as { bag: { mats: Record<string, number> } } | null;
    fill(exp?.bag.mats);
    for (const r of (w.remains as { loot: { mats: Record<string, number> } }[]) ?? []) fill(r.loot.mats);
    const report = w.report as { brought?: { mats: Record<string, number> }; lost?: { mats: Record<string, number> } | null } | null;
    fill(report?.brought?.mats);
    fill(report?.lost?.mats ?? undefined);
    const room = w.room as { enemies: Record<string, unknown>[] } | null;
    for (const e of room?.enemies ?? []) {
      e.armor ??= 0;
      e.armorBreakUntil ??= 0;
      e.comboAt ??= 0;
    }
    const hero = w.hero as Record<string, unknown>;
    hero.slowUntil ??= 0;
    hero.stunUntil ??= 0;
    hero.swings ??= 0;
    const rules = (w.rules as { combat: { skill: string | null }[] }).combat;
    for (const r of actTwoRules()) if (!rules.some((x) => x.skill === r.skill)) rules.push(r);
  },
  // v3 → v4 (M3.3, o Ato III): esporos, veneno e raiz no herói, veneno nos inimigos e as regras de
  // fábrica do Ato III (no fim da lista).
  3: (w) => {
    eachMats(w, (mats) => (mats.esporos ??= 0));
    const room = w.room as { enemies: Record<string, unknown>[] } | null;
    for (const e of room?.enemies ?? []) {
      e.venom ??= 0;
      e.venomUntil ??= 0;
    }
    const hero = w.hero as Record<string, unknown>;
    hero.poison ??= [];
    hero.rootUntil ??= 0;
    const rules = (w.rules as { combat: { skill: string | null }[] }).combat;
    for (const r of actThreeRules()) if (!rules.some((x) => x.skill === r.skill)) rules.push(r);
  },
};

type Mats = Record<string, number>;

/** Todo lugar do save que guarda materiais: a vila, a mochila, os restos e o último relatório. */
function eachMats(w: Record<string, unknown>, f: (mats: Mats) => void): void {
  const all: (Mats | undefined)[] = [
    (w.village as { mats: Mats }).mats,
    (w.exp as { bag: { mats: Mats } } | null)?.bag.mats,
    ...((w.remains as { loot: { mats: Mats } }[]) ?? []).map((r) => r.loot.mats),
    (w.report as { brought?: { mats: Mats } } | null)?.brought?.mats,
    (w.report as { lost?: { mats: Mats } | null } | null)?.lost?.mats,
    (w.pending as { brought?: { mats: Mats } } | null)?.brought?.mats,
  ];
  for (const m of all) if (m) f(m);
}

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
