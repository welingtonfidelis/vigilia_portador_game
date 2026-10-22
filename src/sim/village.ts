/** Vila: obras, forja, imposto dos moradores, descanso e ferimento (docs/VIGILIA-PORTADOR.md §2.9). */
import { chronicle, dayOf } from './chronicle.ts';
import { BALANCE } from './config.ts';
import { AFFIXES, AFFIX_IDS, BASES, BUILDINGS, MATERIAL_NAMES } from './data.ts';
import type { Cost } from './data.ts';
import { startDescent } from './expedition.ts';
import { heroStats } from './hero.ts';
import { forgeCap, itemName, makeItem } from './items.ts';
import { pick } from './rng.ts';
import type { AffixId, BuildingId, Item, Material, SimEvent, World } from './types.ts';

export function nextCost(w: World, id: BuildingId): Cost | null {
  const def = BUILDINGS[id];
  const lvl = w.village.buildings[id];
  if (lvl >= def.max) return null;
  return def.cost(lvl + 1);
}

/** Por que não dá para pagar (ou null se dá). */
export function lacking(w: World, c: Cost): string | null {
  const v = w.village;
  if (v.people < c.people) return `faltam ${c.people - v.people} moradores`;
  if (v.gold < c.gold) return `faltam ${c.gold - v.gold} de ouro`;
  for (const [m, n] of Object.entries(c.mats)) {
    const have = v.mats[m as Material] ?? 0;
    if (have < (n ?? 0)) return `faltam ${(n ?? 0) - have} de ${MATERIAL_NAMES[m as Material]}`;
  }
  return null;
}

function pay(w: World, c: Cost): void {
  const v = w.village;
  v.gold -= c.gold;
  for (const [m, n] of Object.entries(c.mats)) v.mats[m as Material] = (v.mats[m as Material] ?? 0) - (n ?? 0);
}

export function build(w: World, id: BuildingId): string | null {
  const v = w.village;
  if (v.construction) return 'já há uma obra em andamento';
  const c = nextCost(w, id);
  if (!c) return 'nível máximo';
  const why = lacking(w, c);
  if (why) return why;
  pay(w, c);
  const level = v.buildings[id] + 1;
  v.construction = { id, level, end: w.tick + BALANCE.buildTicksPerLevel * level };
  return null;
}

export type ForgeRarity = 'comum' | 'rara' | 'epica';

/** Material do afixo na conta da forja (docs/VIGILIA-PORTADOR.md §14.2). */
function addAffixMat(mats: Partial<Record<Material, number>>, affix: AffixId, n: number): void {
  const m = AFFIXES[affix].mat;
  if (m === 'ambos') {
    mats.ossos = (mats.ossos ?? 0) + Math.ceil(n / 2);
    mats.ferro = (mats.ferro ?? 0) + Math.ceil(n / 2);
  } else {
    mats[m] = (mats[m] ?? 0) + n;
  }
}

export function forgeCost(tier: number, rarity: ForgeRarity, affix: AffixId | null = null): Cost {
  const mult = rarity === 'epica' ? 3 : rarity === 'rara' ? 2 : 1;
  const mats: Partial<Record<Material, number>> = { ossos: BALANCE.forgeBones(tier) };
  if (affix && rarity !== 'comum') addAffixMat(mats, affix, (rarity === 'epica' ? 10 : 5) * tier);
  return { gold: BALANCE.forgeGold(tier) * mult, mats, people: 0 };
}

export function reforgeCost(tier: number): Cost {
  return { gold: BALANCE.forgeGold(tier), mats: { ossos: 6 * tier, ferro: 6 * tier }, people: 0 };
}

/** Encomenda uma peça no tier máximo da forja. Rara e épica escolhem o (primeiro) afixo. */
export function forge(w: World, baseId: string, rarity: ForgeRarity, affix: AffixId | null = null): string | null {
  const v = w.village;
  if (v.forge) return 'a forja está ocupada';
  if (!BASES[baseId]) return 'base desconhecida';
  const minFloor = BASES[baseId]!.minFloor ?? 1;
  if (w.hero.deepest < minFloor) return `o ferreiro só conhece essa arma depois do andar ${minFloor}`;
  if (rarity === 'rara' && v.buildings.ferreiro < 2) return 'forjar rara pede o ferreiro nível 2';
  if (rarity === 'epica' && v.buildings.ferreiro < 4) return 'forjar épica pede o ferreiro nível 4';
  if (rarity === 'comum' && baseId === 'amuleto') return 'o amuleto só tem afixos: forje raro';
  if (rarity !== 'comum' && !affix) return 'escolha o afixo';
  const tier = forgeCap(w);
  const c = forgeCost(tier, rarity, affix);
  const why = lacking(w, c);
  if (why) return why;
  pay(w, c);
  const item = makeItem(w, baseId, tier, rarity, `Forjado no dia ${dayOf(w.tick)}`, affix ? [affix] : undefined);
  const ticks = rarity === 'epica' ? BALANCE.epicForgeTicks : rarity === 'rara' ? BALANCE.rareForgeTicks : BALANCE.forgeTicks;
  v.forge = { kind: 'forjar', item, sourceId: null, end: w.tick + ticks };
  return null;
}

/** Troca um afixo da peça por outro sorteado (que ela ainda não tem). Lendária não se reforja. */
export function reforge(w: World, itemId: number, affixIndex: number): string | null {
  const v = w.village;
  if (v.forge) return 'a forja está ocupada';
  if (v.buildings.ferreiro < 3) return 'reforjar pede o ferreiro nível 3';
  const item = findOwned(w, itemId);
  if (!item) return 'peça não encontrada';
  if (item.legend) return 'os afixos de uma lendária não mudam';
  if (affixIndex < 0 || affixIndex >= item.affixes.length) return 'escolha um afixo da peça';
  const c = reforgeCost(item.tier);
  const why = lacking(w, c);
  if (why) return why;
  pay(w, c);
  v.forge = { kind: 'reforjar', item: { ...item, affixes: [...item.affixes] }, sourceId: item.id, affixIndex, end: w.tick + BALANCE.reforgeTicks };
  return null;
}

/** Item no baú ou no corpo, pelo id. */
export function findOwned(w: World, id: number): Item | null {
  return w.village.stash.find((i) => i.id === id) ?? Object.values(w.hero.equip).find((i) => i?.id === id) ?? null;
}

export function upgrade(w: World, itemId: number): string | null {
  const v = w.village;
  if (v.forge) return 'a forja está ocupada';
  const item = findOwned(w, itemId);
  if (!item) return 'peça não encontrada';
  if (item.tier >= forgeCap(w)) return `o ferreiro só vai até o tier ${forgeCap(w)}`;
  const c = forgeCost(item.tier + 1, 'comum');
  const why = lacking(w, c);
  if (why) return why;
  pay(w, c);
  v.forge = { kind: 'aprimorar', item: { ...item, affixes: [...item.affixes], tier: item.tier + 1 }, sourceId: item.id, end: w.tick + BALANCE.upgradeTicks };
  return null;
}

function finishForge(w: World, ev: SimEvent[]): void {
  const v = w.village;
  const job = v.forge!;
  v.forge = null;
  if (job.kind === 'aprimorar' && job.sourceId !== null) {
    const src = findOwned(w, job.sourceId);
    if (src) {
      src.tier = job.item.tier;
      w.stats.upgraded++;
      chronicle(w, `O ferreiro aprimorou ${itemName(src)} para o tier ${src.tier}.`, 'bom', ev);
      return;
    }
  }
  if (job.kind === 'reforjar' && job.sourceId !== null) {
    const src = findOwned(w, job.sourceId);
    const idx = job.affixIndex ?? 0;
    if (src && idx < src.affixes.length) {
      const before = itemName(src);
      const out = src.affixes[idx]!;
      const options = AFFIX_IDS.filter((a) => !src.affixes.includes(a));
      src.affixes[idx] = pick(w, options);
      w.stats.forged++;
      chronicle(w, `O ferreiro reforjou ${before}: saiu ${AFFIXES[out].name}, entrou ${AFFIXES[src.affixes[idx]!].name}.`, 'bom', ev);
    }
    return;
  }
  v.stash.push(job.item);
  w.stats.forged++;
  chronicle(w, `O ferreiro entregou ${itemName(job.item)}.`, 'bom', ev);
}

export function stepVillage(w: World, ev: SimEvent[]): void {
  const v = w.village;
  const h = w.hero;
  v.taxAcc += (v.people * BALANCE.taxPerPersonPerMinute) / 600;
  if (v.taxAcc >= 1) {
    const whole = Math.floor(v.taxAcc);
    v.gold += whole;
    v.taxAcc -= whole;
  }
  if (v.construction && w.tick >= v.construction.end) {
    const c = v.construction;
    v.buildings[c.id] = c.level;
    v.construction = null;
    chronicle(w, `${BUILDINGS[c.id].name} subiu para o nível ${c.level}.`, 'bom', ev);
  }
  if (v.forge && w.tick >= v.forge.end) finishForge(w, ev);
  for (let i = w.remains.length - 1; i >= 0; i--) {
    const r = w.remains[i]!;
    if (w.tick < r.expires) continue;
    w.remains.splice(i, 1);
    w.stats.remainsExpired++;
    const what = r.loot.items.length ? r.loot.items.map(itemName).join(', ') : 'o que ele carregava';
    chronicle(w, `A cripta engoliu os restos do andar ${r.floor}: ${what}.`, 'ruim', ev);
  }
  if (w.phase !== 'vila') return;
  // Descanso: a vida enche e o ferimento sara (só aqui).
  if (h.wound) {
    h.wound.left--;
    if (h.wound.left <= 0) {
      h.wound = null;
      chronicle(w, `${h.name} está curado do ferimento.`, 'bom', ev);
    }
  }
  const s = heroStats(w);
  h.hp = Math.min(s.maxHp, h.hp + s.maxHp * BALANCE.villageRegenPerTick);
  const r = w.rules.descent;
  if (r.repeat && !w.hold && h.hp >= s.maxHp - 0.5 && (!r.waitWound || !h.wound)) startDescent(w, ev);
}
