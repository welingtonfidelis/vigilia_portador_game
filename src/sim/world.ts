import { BALANCE } from './config.ts';
import { BUILDINGS, BUILDING_IDS, HEADS } from './data.ts';
import { heroStats } from './hero.ts';
import { makeItem } from './items.ts';
import { defaultCombatRules, defaultDescentRules } from './rules.ts';
import type { BuildingId, HeadId, World } from './types.ts';

export const SAVE_VERSION = 2;

export function createWorld(seed: number, head: HeadId = 'Knight', name?: string): World {
  const buildings = Object.fromEntries(BUILDING_IDS.map((id) => [id, BUILDINGS[id].start])) as Record<BuildingId, number>;
  const w: World = {
    version: SAVE_VERSION,
    seed,
    rng: seed >>> 0,
    tick: 0,
    nextId: 1,
    hero: {
      name: name?.trim().slice(0, 18) || (HEADS.find((h) => h.id === head)?.name ?? 'Herói'),
      head,
      level: 1,
      xp: 0,
      skillPoints: 1,
      hp: 1,
      potions: BALANCE.potionBase,
      potionReadyAt: 0,
      equip: {},
      learned: [],
      bar: [null, null, null],
      cooldowns: {},
      wound: null,
      gritoUntil: 0,
      action: null,
      deepest: 1,
    },
    rules: { combat: defaultCombatRules(), descent: defaultDescentRules() },
    phase: 'vila',
    phaseEnd: 0,
    carried: false,
    exp: null,
    room: null,
    village: {
      gold: 60,
      mats: { ossos: 0, ferro: 0 },
      people: 0,
      buildings,
      construction: null,
      forge: null,
      stash: [],
      taxAcc: 0,
    },
    remains: [],
    chronicle: [],
    report: null,
    pending: null,
    stats: {
      descents: 0, deaths: 0, kills: 0, rooms: 0, fightTicks: 0, maxFightTicks: 0, bossFirst: {}, bossFightTicks: 0,
      bossFights: 0, remainsCreated: 0, remainsRecovered: 0, remainsExpired: 0, bagValueAtDeath: 0, lostValueAtDeath: 0,
      deepestAt: { '1': 0 }, roomDamageFrac: 0, roomDamageCount: 0, forged: 0, upgraded: 0, senhorFights: 0, senhorFightTicks: 0,
      senhorPhase2Frac: 0,
    },
    bossesBeaten: [],
    hold: false,
  };
  // Equipamento inicial: espada, gibão e calças de couro, tudo comum de tier 1.
  const start = 'Trazido de casa';
  w.hero.equip = {
    arma: makeItem(w, 'espada', 1, 'comum', start),
    peitoral: makeItem(w, 'gibao_couro', 1, 'comum', start),
    perneiras: makeItem(w, 'calcas_couro', 1, 'comum', start),
  };
  // No baú, um escudo velho e um elmo amassado: a primeira escolha de equipamento.
  w.village.stash.push(makeItem(w, 'escudo_redondo', 1, 'comum', start), makeItem(w, 'elmo_placas', 1, 'comum', start));
  w.hero.hp = heroStats(w).maxHp;
  w.chronicle.push({ tick: 0, text: `${w.hero.name} chegou à vila em ruínas. Debaixo dela, a Cripta.`, tone: 'neutro' });
  return w;
}
