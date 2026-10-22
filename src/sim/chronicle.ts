import { BALANCE } from './config.ts';
import type { ChronicleEntry, SimEvent, World } from './types.ts';

const MAX = 120;

export function chronicle(w: World, text: string, tone: ChronicleEntry['tone'], ev?: SimEvent[]): void {
  w.chronicle.push({ tick: w.tick, text, tone });
  if (w.chronicle.length > MAX) w.chronicle.splice(0, w.chronicle.length - MAX);
  ev?.push({ t: 'aviso', tick: w.tick, text, tone });
}

export function dayOf(tick: number): number {
  return Math.floor(tick / BALANCE.dayTicks) + 1;
}
