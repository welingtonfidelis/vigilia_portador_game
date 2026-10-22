import { BALANCE, actOf, floorPower, xpToNext } from './config.ts';
import { BASES } from './data.ts';
import { affixValue, base, tierMult } from './items.ts';
import type { Hero, Item, Slot, World } from './types.ts';

export interface HeroStats {
  maxHp: number;
  dmg: number;
  aps: number;
  /** Ticks entre golpes básicos. */
  interval: number;
  crit: number;
  armor: number;
  block: number;
  thorns: number;
  lifesteal: number;
  luck: number;
  potionHeal: number;
  potionsMax: number;
  heavy: number;
  twoHanded: boolean;
  /** 0..1: quanto do ferimento ainda pesa. */
  woundFrac: number;
  /** Perfuração: fração da couraça dos inimigos que os golpes ignoram (Ato II). */
  pierce: number;
  /** Corte na duração do veneno (afixo Imune, Ato III). */
  imune: number;
  /** A poção também tira o veneno (alquimista nível 5). */
  antidote: boolean;
  /** Quanto do veneno ainda pega (1 = todo): Imune corta a duração, Sangue Amargo corta o dano. */
  venomTaken: number;
}

export function hasLegend(equip: Partial<Record<Slot, Item>>, id: string): boolean {
  return Object.values(equip).some((i) => i?.legend === id);
}

export function heroStats(w: World, equip: Partial<Record<Slot, Item>> = w.hero.equip): HeroStats {
  const h = w.hero;
  let hpPct = 0, dmgPct = 0, speedPct = 0, crit = BALANCE.baseCrit, armor = 0, block = 0, thorns = 0;
  let lifesteal = 0, luck = 0, potionPct = 0, heavy = 0, pierce = 0, imune = 0;
  let weaponDmg = 5, weaponAps = 1, twoHanded = false;
  for (const item of Object.values(equip)) {
    if (!item) continue;
    const b = base(item);
    const m = tierMult(item.tier);
    if (b.slot === 'arma') {
      weaponDmg = (b.dmg ?? 5) * m;
      weaponAps = b.aps ?? 1;
      twoHanded = b.hands === 2;
    }
    if (b.weight === 'pesado') heavy++;
    armor += (b.armor ?? 0) * m;
    block = Math.max(block, b.block ?? 0);
    thorns += b.thorns ?? 0;
    crit += b.crit ?? 0;
    hpPct += b.hpPct ?? 0;
    dmgPct += b.dmgPct ?? 0;
    potionPct += b.potionPct ?? 0;
    speedPct += b.speedPct ?? 0;
    pierce += b.pierce ?? 0;
    for (const a of item.affixes) {
      const v = affixValue(a, item.tier);
      if (a === 'afiado') crit += v;
      else if (a === 'brutal') dmgPct += v;
      else if (a === 'veloz') speedPct += v;
      else if (a === 'robusto') hpPct += v;
      else if (a === 'guardiao') armor += v;
      else if (a === 'sanguessuga') lifesteal += v;
      else if (a === 'afortunado') luck += v;
      else if (a === 'sereno') potionPct += v;
      else if (a === 'perfurante') pierce += v;
      else if (a === 'imune') imune += v;
    }
  }
  if (h.learned.includes('pele_de_ferro')) armor *= 1.2;
  if (h.learned.includes('mao_pesada')) pierce += 0.15;
  lifesteal = Math.min(0.12, lifesteal) + (h.learned.includes('sede_de_sangue') ? 0.04 : 0);
  const woundFrac = h.wound ? h.wound.left / h.wound.total : 0;
  const maxHp = Math.round((BALANCE.heroBaseHp + BALANCE.heroHpPerLevel * (h.level - 1)) * (1 + hpPct) * (1 - BALANCE.woundHp * woundFrac));
  const dmg = weaponDmg * (1 + BALANCE.heroDmgPerLevel * (h.level - 1)) * (1 + dmgPct) * (1 - BALANCE.woundDmg * woundFrac);
  // Puxado por um afogado, ataca 20% mais devagar.
  const slowed = (h.slowUntil ?? 0) > w.tick ? 0.8 : 1;
  const aps = weaponAps * (1 + speedPct) * (1 - BALANCE.heavyAttackSpeedPenalty * heavy) * slowed;
  const alch = w.village.buildings.alquimista;
  return {
    maxHp,
    dmg,
    aps,
    interval: Math.max(4, Math.round(BALANCE.ticksPerSecond / aps)),
    crit: Math.min(0.75, crit),
    armor,
    block,
    thorns,
    lifesteal,
    luck,
    potionHeal: (BALANCE.potionHeal + BALANCE.potionHealPerAlchemist * alch) * (1 + potionPct),
    potionsMax: BALANCE.potionBase + alch + (h.learned.includes('folego_mineiro') ? 1 : 0),
    heavy,
    twoHanded,
    woundFrac,
    pierce: Math.min(BALANCE.pierceMax, pierce),
    imune: Math.min(BALANCE.imuneMax, imune),
    antidote: alch >= 5,
    venomTaken: (1 - Math.min(BALANCE.imuneMax, imune)) * (h.learned.includes('sangue_amargo') ? 0.5 : 1),
  };
}

export function armorReduction(armor: number, floor: number): number {
  return armor / (armor + BALANCE.armorK * floorPower(floor));
}

/** Força do herói num andar: média geométrica de dano por segundo e vida efetiva. */
export function heroPower(s: HeroStats, floor: number): number {
  const red = armorReduction(s.armor, floor);
  // A couraça média do ato corta o dano; a perfuração devolve parte.
  const c = (BALANCE.actArmor[actOf(floor) - 1] ?? BALANCE.actArmor[BALANCE.actArmor.length - 1]!) * (1 - s.pierce);
  const dps = s.dmg * s.aps * (1 + s.crit * (BALANCE.critMult - 1)) * (1 - c / (c + BALANCE.couracaK));
  // O veneno do ato é parte do dano que chega; Imune e Sangue Amargo cortam essa parte.
  const venom = BALANCE.actVenom[actOf(floor) - 1] ?? 0;
  const taken = 1 - venom + venom * s.venomTaken;
  const ehp = (s.maxHp / (1 - red) / (1 - s.block * BALANCE.blockReduce) / taken) * (1 + s.potionsMax * s.potionHeal * 0.5);
  return Math.sqrt(dps * ehp);
}

/** O que um andar pede: o mesmo cálculo para um grupo médio daquele andar. */
export function floorDemand(floor: number): number {
  const extra = BALANCE.actDemand[actOf(floor) - 1] ?? BALANCE.actDemand[BALANCE.actDemand.length - 1]!;
  return 90 * floorPower(floor) * extra;
}

/** Razão força ÷ pedido: 1 é o andar certo; abaixo de 0,8 é fundo demais. */
export function powerRatio(w: World, floor: number, equip?: Partial<Record<Slot, Item>>): number {
  return heroPower(heroStats(w, equip), floor) / floorDemand(floor);
}

export function gainXp(w: World, xp: number): boolean {
  const h: Hero = w.hero;
  h.xp += xp;
  let up = false;
  while (h.xp >= xpToNext(h.level)) {
    h.xp -= xpToNext(h.level);
    h.level++;
    h.skillPoints++;
    up = true;
  }
  return up;
}

/** Peça boa para o encaixe? (ex.: escudo não vai com arma de duas mãos). */
export function canEquip(equip: Partial<Record<Slot, Item>>, item: Item): boolean {
  const b = base(item);
  if (b.slot === 'secundaria') {
    const weapon = equip.arma;
    if (weapon && BASES[weapon.base]?.hands === 2) return false;
  }
  return true;
}
