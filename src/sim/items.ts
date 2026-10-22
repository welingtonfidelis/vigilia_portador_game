import { BALANCE, floorTier } from './config.ts';
import { AFFIXES, AFFIX_IDS, BASES, CLOTH_BANDS, LEGENDS, METAL_BANDS, RARITY_AFFIXES, tierBand } from './data.ts';
import type { BaseDef } from './data.ts';
import { chance, pick, rand, weighted } from './rng.ts';
import type { AffixId, Item, Loot, Rarity, World } from './types.ts';

export function base(item: Item): BaseDef {
  const b = BASES[item.base];
  if (!b) throw new Error(`base desconhecida: ${item.base}`);
  return b;
}

/** Multiplicador do tier nos números da base. */
export function tierMult(tier: number): number {
  return Math.pow(1.32, tier - 1);
}

/** Valor de um afixo numa peça de um tier (cresce 10% por tier). */
export function affixValue(id: AffixId, tier: number): number {
  return AFFIXES[id].value * (1 + 0.1 * (tier - 1));
}

export function makeItem(w: World, baseId: string, tier: number, rarity: Rarity, origin: string, affixes?: AffixId[]): Item {
  const n = RARITY_AFFIXES[rarity];
  const list: AffixId[] = affixes ? [...affixes] : [];
  while (list.length < n) {
    const a = pick(w, AFFIX_IDS);
    if (!list.includes(a)) list.push(a);
  }
  return { id: w.nextId++, base: baseId, tier, rarity, affixes: list, origin };
}

export function makeLegend(w: World, legendId: string, tier: number, origin: string): Item {
  const def = LEGENDS[legendId]!;
  const item = makeItem(w, def.base, tier, 'lendaria', origin, def.affixes);
  item.legend = legendId;
  return item;
}

function agree(forms: readonly [string, string, string, string], b: BaseDef): string {
  return forms[(b.g === 'f' ? 1 : 0) + (b.pl ? 2 : 0)]!;
}

export function itemName(item: Item): string {
  if (item.legend) return LEGENDS[item.legend]!.name;
  const b = base(item);
  const band = tierBand(item.tier);
  const adjs = item.affixes.map((a) => agree(AFFIXES[a].adj, b));
  const adjText = adjs.length === 0 ? '' : adjs.length === 1 ? ` ${adjs[0]}` : ` ${adjs.slice(0, -1).join(', ')} e ${adjs[adjs.length - 1]}`;
  if (b.stuff === 'metal') return `${b.name}${adjText} de ${METAL_BANDS[band]}`;
  return `${b.name}${adjText} ${agree(CLOTH_BANDS[band]!, b)}`;
}

/** Sorteia raridade: elite e baú começam em rara; a sorte sobe um degrau às vezes. */
export function rollRarity(w: World, floor: number, minimum: Rarity, luck: number): Rarity {
  const order: Rarity[] = ['comum', 'rara', 'epica', 'lendaria'];
  const deep = Math.min(0.15, floor * 0.01);
  let r: Rarity = weighted(w, [
    ['comum', 0.8 - deep],
    ['rara', 0.2],
    ['epica', deep],
  ] as const);
  if (order.indexOf(r) < order.indexOf(minimum)) r = minimum;
  if (r !== 'epica' && chance(w, luck * BALANCE.luckRarity)) r = order[order.indexOf(r) + 1]!;
  return r === 'lendaria' ? 'epica' : r;
}

/** Peça achada lá embaixo: tier do andar (às vezes um abaixo) e base sorteada. */
export function dropItem(w: World, floor: number, minimum: Rarity, luck: number): Item {
  let tier = floorTier(floor);
  if (tier > 1 && chance(w, BALANCE.tierDownChance)) tier -= 1;
  const ids = Object.keys(BASES).filter((id) => id !== 'elmo_osso' || floor >= 4);
  const baseId = pick(w, ids);
  const rarity = baseId === 'amuleto' && minimum === 'comum' ? 'rara' : rollRarity(w, floor, minimum, luck);
  return makeItem(w, baseId, tier, rarity, `Andar ${floor} da Cripta`);
}

/** Valor em ouro de uma peça (venda, derretimento e o "valor da mochila" do balanceador). */
export function itemValue(item: Item): number {
  const r = { comum: 1, rara: 1.8, epica: 3, lendaria: 6 }[item.rarity];
  return Math.round((BALANCE.forgeGold(item.tier) / 2) * r);
}

export function lootValue(l: Loot): number {
  return l.gold + l.mats.ossos * 3 + l.mats.ferro * 5 + l.items.reduce((s, i) => s + itemValue(i), 0);
}

export function emptyLoot(): Loot {
  return { gold: 0, mats: { ossos: 0, ferro: 0 }, items: [], people: 0 };
}

export function addLoot(into: Loot, from: Loot): void {
  into.gold += from.gold;
  into.mats.ossos += from.mats.ossos;
  into.mats.ferro += from.mats.ferro;
  into.items.push(...from.items);
  into.people += from.people;
}

/** Teto da forja: o menor entre o nível do ferreiro e o tier do andar mais fundo. */
export function forgeCap(w: World): number {
  return Math.min(2 * w.village.buildings.ferreiro, floorTier(w.hero.deepest));
}

/** Variação pequena e determinística (para ouro de abate). */
export function jitter(w: World, v: number): number {
  return Math.max(1, Math.round(v * (0.8 + 0.4 * rand(w))));
}
