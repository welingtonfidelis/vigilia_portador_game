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
  /** Couraça dos inimigos do Ato II: corta o dano do herói por C / (C + couracaK), depois da perfuração. */
  couracaK: 18,
  /** Couraça média de um grupo de cada ato (para a "Força" da tela de equipamento). */
  actArmor: [0, 17],
  /** O que cada ato pede a mais além de P(andar) na "Força" (lentidão, aura e chefes com truques). */
  actDemand: [1, 1],
  /** Vida e dano dos inimigos de cada ato, além de P(andar): o Ato II já pesa pela couraça e pelos truques. */
  actEnemyHp: [1, 0.92],
  actEnemyDmg: [1, 0.74],
  pierceMax: 0.8,
  /** Buscar os restos só desce até eles com a Força do andar pelo menos nisto ("fundo demais" abaixo). */
  fetchMinRatio: 0.8,

  // Abismo
  floorPowerBase: 1.16,
  floorsPerAct: 10,
  /** Fundo do abismo por enquanto: o fim do Ato II (M3.1). */
  maxFloor: 20,
  roomsBase: 4,
  groupBase: 3,
  groupMax: 8,
  ringSlots: 3,
  approachTicks: 10,
  enterTicks: 25,
  lootTicks: 10,
  /** Saída pela porta do fundo depois do saque, quando segue para a próxima sala. */
  roomExitTicks: 18,
  descendTicks: (floor: number) => (5 + 2 * floor) * 10,
  returnTicks: (floor: number) => (10 + 4 * floor) * 10,
  carriedMult: 1.5,
  eliteHp: 2.5,
  eliteDmg: 1.4,
  bagSize: 10,
  stashSize: 24,

  // Saque
  itemChance: { lacaio: 0.06, guerreiro: 0.06, ladino: 0.06, mago: 0.06, mineiro: 0.06, afogado: 0.06, lanterneiro: 0.06, golem: 0.1, capitao: 1 } as Record<string, number>,
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

/** Ato do andar (1 a 10 é o Ato I, 11 a 20 o Ato II…). */
export function actOf(floor: number): number {
  return Math.floor((floor - 1) / BALANCE.floorsPerAct) + 1;
}

/** Andar dentro do ato (1 a 10). */
export function floorInAct(floor: number): number {
  return floor - (actOf(floor) - 1) * BALANCE.floorsPerAct;
}

/** Tier das peças de um andar: ⌈andar/2⌉ + 5 × (ato − 1). */
export function floorTier(floor: number): number {
  return Math.ceil(floorInAct(floor) / 2) + 5 * (actOf(floor) - 1);
}

/** Salas por andar: 4 + ⌊andar no ato / 3⌋ (cada ato recomeça a conta); depois do primeiro ato, mais 1, e mais 1 na segunda metade. */
export function roomsOnFloor(floor: number): number {
  const n = floorInAct(floor);
  const extra = actOf(floor) >= 2 ? 2 : 0;
  return BALANCE.roomsBase + Math.floor(n / 3) + extra;
}

/** Inimigos por grupo: 3 + ⌊andar no ato / 2⌋, até 8 (cada ato recomeça a conta). */
export function groupSize(floor: number): number {
  return Math.min(BALANCE.groupMax, BALANCE.groupBase + Math.floor(floorInAct(floor) / 2));
}

export function isBossFloor(floor: number): boolean {
  return floor % 5 === 0;
}

export function xpToNext(level: number): number {
  return Math.round(BALANCE.xpBase * Math.pow(level, BALANCE.xpExp));
}
