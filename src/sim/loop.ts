import { BALANCE } from './config.ts';
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
}

/** Progresso offline: a mesma step(), até 8 h. */
export function catchUp(w: World, ticks: number): CatchUpResult {
  const n = Math.max(0, Math.min(BALANCE.offlineCapTicks, Math.floor(ticks)));
  const before = { descents: w.stats.descents, deaths: w.stats.deaths, kills: w.stats.kills, gold: w.village.gold, deepest: w.hero.deepest };
  const hold = w.hold;
  w.hold = false;
  advance(w, n);
  w.hold = hold;
  return {
    ticks: n,
    descents: w.stats.descents - before.descents,
    deaths: w.stats.deaths - before.deaths,
    kills: w.stats.kills - before.kills,
    gold: w.village.gold - before.gold,
    deepest: w.hero.deepest,
  };
}
