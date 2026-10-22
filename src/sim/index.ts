/** Porta única entre a tela e o núcleo. */
export * from './types.ts';
export { BALANCE, floorPower, floorTier, roomsOnFloor, isBossFloor, xpToNext } from './config.ts';
export type { Cost } from './data.ts';
export { AFFIXES, BASES, BUILDINGS, BUILDING_IDS, ENEMIES, ELITE_NAMES, HEADS, LEGENDS, RARITY_NAMES, SKILLS, SKILL_IDS, SLOTS, SLOT_NAMES, tierBand } from './data.ts';
export { armorReduction, heroPower, heroStats, powerRatio } from './hero.ts';
export type { HeroStats } from './hero.ts';
export { affixValue, base, forgeCap, itemName, itemValue, lootValue } from './items.ts';
export { COND_NAMES, ruleSlots } from './rules.ts';
export { returnChance } from './expedition.ts';
export { forgeCost, lacking, nextCost } from './village.ts';
export { commands } from './commands.ts';
export { advance, catchUp, step } from './loop.ts';
export type { CatchUpResult } from './loop.ts';
export { createWorld, SAVE_VERSION } from './world.ts';
export { checksum, deserialize, serialize } from './save.ts';
export { dayOf } from './chronicle.ts';
