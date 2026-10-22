import { BALANCE } from './config.ts';
import { BUILDINGS, BUILDING_IDS } from './data.ts';
import { stepExpedition } from './expedition.ts';
import type { SimEvent, World } from './types.ts';
import { stepVillage } from './village.ts';

/** Um tick (0,1 s em 1×). Os eventos do tick vão para `ev`, se a tela quiser ouvir. */
export function step(w: World, ev: SimEvent[] = []): SimEvent[] {
  w.tick++;
  stepVillage(w, ev);
  stepExpedition(w, ev);
  return ev;
}

export function advance(w: World, ticks: number, ev?: SimEvent[]): void {
  for (let i = 0; i < ticks; i++) step(w, ev);
}

export interface CatchUpResult {
  ticks: number;
  descents: number;
  deaths: number;
  kills: number;
  gold: number;
  deepest: number;
  /** Peças novas que chegaram ao baú (achadas ou forjadas). */
  items: number;
  levels: number;
  /** Obras concluídas: "Ferreiro 3". */
  buildings: string[];
  remainsRecovered: number;
  remainsLost: number;
  /** Últimas linhas da crônica do período. */
  lines: string[];
}

/** Progresso offline: a mesma step(), até 8 h. */
export function catchUp(w: World, ticks: number): CatchUpResult {
  const n = Math.max(0, Math.min(BALANCE.offlineCapTicks, Math.floor(ticks)));
  const s = w.stats;
  const before = {
    descents: s.descents, deaths: s.deaths, kills: s.kills, gold: w.village.gold, nextId: w.nextId, level: w.hero.level,
    recovered: s.remainsRecovered, expired: s.remainsExpired, tick: w.tick, buildings: { ...w.village.buildings },
  };
  const hold = w.hold;
  w.hold = false;
  advance(w, n);
  w.hold = hold;
  return {
    ticks: n,
    descents: s.descents - before.descents,
    deaths: s.deaths - before.deaths,
    kills: s.kills - before.kills,
    gold: w.village.gold - before.gold,
    deepest: w.hero.deepest,
    items: w.village.stash.filter((i) => i.id >= before.nextId).length,
    levels: w.hero.level - before.level,
    buildings: BUILDING_IDS.filter((id) => w.village.buildings[id] > before.buildings[id]).map((id) => `${BUILDINGS[id].name} ${w.village.buildings[id]}`),
    remainsRecovered: s.remainsRecovered - before.recovered,
    remainsLost: s.remainsExpired - before.expired,
    lines: w.chronicle.filter((c) => c.tick > before.tick).slice(-8).map((c) => c.text),
  };
}
