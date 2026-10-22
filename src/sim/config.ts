/** Todos os números de balanceamento. Mexa aqui e confira com `npm run balance`. */
export const BALANCE = {
  ticksPerSecond: 10,
  dayTicks: 6000,
  offlineCapTicks: 8 * 3600 * 10,

  // Herói
  heroBaseHp: 200,
  heroHpPerLevel: 18,
  heroDmgPerLevel: 0.03,
  xpBase: 40,
  xpExp: 1.6,
  baseCrit: 0.05,
  critMult: 1.6,
  blockReduce: 0.7,
  heavyAttackSpeedPenalty: 0.03,
  windupFrac: 0.4,
  potionBase: 3,
  potionHeal: 0.4,
  potionHealPerAlchemist: 0.05,
  potionCooldown: 30,
  potionPrice: 15,
  villageRegenPerTick: 0.006,
  /** Armadura: redução = A / (A + armorK × P(andar)). */
  armorK: 25,

  // Abismo
  floorPowerBase: 1.16,
  floorsPerAct: 10,
  maxFloor: 10,
  roomsBase: 4,
  groupBase: 3,
  groupMax: 8,
  ringSlots: 3,
  approachTicks: 10,
  enterTicks: 25,
  lootTicks: 10,
  descendTicks: (floor: number) => (5 + 2 * floor) * 10,
  returnTicks: (floor: number) => (10 + 4 * floor) * 10,
  carriedMult: 1.5,
  eliteHp: 2.5,
  eliteDmg: 1.4,
  bagSize: 10,
  stashSize: 24,

  // Saque
  itemChance: { lacaio: 0.06, guerreiro: 0.06, ladino: 0.06, mago: 0.06, capitao: 1 } as Record<string, number>,
  eliteItemChance: 0.4,
  tierDownChance: 0.2,
  luckItemChance: 0.01,
  luckRarity: 0.005,

  // Morte e restos
  // Morrer custa caro: no andar 1, uma peça comum volta 55% das vezes; no andar 10, 19%.
  deathBase: 0.55,
  deathPerFloor: 0.04,
  deathRarity: { comum: 0, rara: 0.03, epica: 0.06, lendaria: 0.15 } as Record<string, number>,
  deathLuck: 0.005,
  deathCarter: 0.05,
  deathMin: 0.05,
  deathMax: 0.75,
  remainsDays: 3,
  remainsMax: 3,
  woundBase: 600,
  woundPerFloor: 200,
  woundHp: 0.3,
  woundDmg: 0.2,
  woundHealerCut: 0.25,

  // Vila
  taxPerPersonPerMinute: 1,
  buildTicksPerLevel: 300,
  forgeTicks: 200,
  rareForgeTicks: 400,
  epicForgeTicks: 600,
  upgradeTicks: 300,
  reforgeTicks: 300,
  forgeGold: (tier: number) => 40 + 30 * tier,
  forgeBones: (tier: number) => 4 * tier,
  skillGold: 60,
} as const;

/** Poder do andar: multiplica vida e dano dos inimigos. */
export function floorPower(floor: number): number {
  return Math.pow(BALANCE.floorPowerBase, floor - 1);
}

/** Tier das peças de um andar: ⌈andar/2⌉ + 5 × (ato − 1). */
export function floorTier(floor: number): number {
  const act = Math.floor((floor - 1) / BALANCE.floorsPerAct);
  const inAct = floor - act * BALANCE.floorsPerAct;
  return Math.ceil(inAct / 2) + 5 * act;
}

export function roomsOnFloor(floor: number): number {
  return BALANCE.roomsBase + Math.floor(floor / 3);
}

export function isBossFloor(floor: number): boolean {
  return floor % 5 === 0;
}

export function xpToNext(level: number): number {
  return Math.round(BALANCE.xpBase * Math.pow(level, BALANCE.xpExp));
}
