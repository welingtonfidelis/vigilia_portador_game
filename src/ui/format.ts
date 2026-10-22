import { AFFIXES, BALANCE, BASES, LEGENDS, affixValue, itemName } from '../sim/index.ts';
import type { Item, Loot, Rarity } from '../sim/index.ts';

export const nf = (n: number, digits = 0) => n.toLocaleString('pt-BR', { minimumFractionDigits: digits, maximumFractionDigits: digits });

export function duration(ticks: number): string {
  const s = Math.max(0, Math.ceil(ticks / BALANCE.ticksPerSecond));
  if (s < 60) return `${s} s`;
  const m = Math.floor(s / 60);
  const r = s % 60;
  if (m < 60) return r ? `${m} min ${r} s` : `${m} min`;
  return `${Math.floor(m / 60)} h ${m % 60} min`;
}

export const RARITY_CLASS: Record<Rarity, string> = { comum: 'r-comum', rara: 'r-rara', epica: 'r-epica', lendaria: 'r-lendaria' };

/** Linhas de atributos de uma peça, em pt-BR. */
export function itemLines(item: Item): string[] {
  const b = BASES[item.base]!;
  const m = Math.pow(1.32, item.tier - 1);
  const lines: string[] = [];
  if (b.dmg) lines.push(`${nf(b.dmg * m)} de dano · ${nf(b.aps ?? 1, 1)} golpe/s${b.hands === 2 ? ' · duas mãos' : ''}`);
  if (b.armor) lines.push(`${nf(b.armor * m)} de armadura${b.weight === 'pesado' ? ' · pesado (−3% de velocidade)' : ''}`);
  if (b.block) lines.push(`${nf(b.block * 100)}% de bloqueio`);
  if (b.thorns) lines.push(`devolve ${nf(b.thorns * 100)}% do bloqueado`);
  if (b.crit) lines.push(`+${nf(b.crit * 100)}% de crítico`);
  if (b.hpPct) lines.push(`+${nf(b.hpPct * 100)}% de vida`);
  if (b.dmgPct) lines.push(`+${nf(b.dmgPct * 100)}% de dano`);
  if (b.potionPct) lines.push(`+${nf(b.potionPct * 100)}% de cura das poções`);
  if (b.speedPct) lines.push(`+${nf(b.speedPct * 100)}% de velocidade de ataque`);
  for (const a of item.affixes) lines.push(`${AFFIXES[a].name}: ${AFFIXES[a].desc(affixValue(a, item.tier))}`);
  if (item.legend) lines.push(`★ ${LEGENDS[item.legend]!.effect}`);
  return lines;
}

export function itemTitle(item: Item): string {
  return `${itemName(item)} (t${item.tier})`;
}

export function lootText(l: Loot): string {
  const parts: string[] = [];
  if (l.gold) parts.push(`${nf(l.gold)} de ouro`);
  if (l.mats.ossos) parts.push(`${nf(l.mats.ossos)} ossos`);
  if (l.mats.ferro) parts.push(`${nf(l.mats.ferro)} de ferro`);
  if (l.people) parts.push(`${l.people} ${l.people === 1 ? 'pessoa' : 'pessoas'}`);
  if (l.items.length) parts.push(`${l.items.length} ${l.items.length === 1 ? 'peça' : 'peças'}`);
  return parts.length ? parts.join(', ') : 'nada';
}

export const pct = (x: number) => `${nf(x * 100)}%`;
