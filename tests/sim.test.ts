import { describe, expect, it } from 'vitest';
import { botTick } from '../src/sim/bot.ts';
import { BALANCE, floorTier } from '../src/sim/config.ts';
import { makeItem } from '../src/sim/items.ts';
import {
  advance, catchUp, checksum, commands, createWorld, deserialize, forgeCap, heroStats, itemName, returnChance, serialize, step,
} from '../src/sim/index.ts';
import type { SimEvent, World } from '../src/sim/index.ts';

function hash(w: World): string {
  return checksum(JSON.stringify(w));
}

/** Avança até a condição valer (ou falha o teste). */
function until(w: World, cond: (w: World) => boolean, max = 200_000, ev?: SimEvent[]): void {
  for (let i = 0; i < max; i++) {
    if (cond(w)) return;
    step(w, ev);
  }
  throw new Error('condição não chegou');
}

/** Mundo no meio de uma luta, já com algo na mochila. */
function inFight(seed = 7): World {
  const w = createWorld(seed);
  until(w, (x) => x.phase === 'sala' && x.room?.phase === 'luta' && x.room.enemies.some((e) => e.state === 'anel'));
  return w;
}

/** Força a morte: inimigos com dano enorme e o herói por um fio. */
function forceDeath(w: World): SimEvent[] {
  const ev: SimEvent[] = [];
  for (const e of w.room!.enemies) e.dmg = 1e6;
  w.hero.potions = 0;
  w.rules.combat = [];
  until(w, (x) => x.phase === 'voltando', 2000, ev);
  return ev;
}

describe('núcleo', () => {
  it('é determinístico: a mesma semente dá o mesmo mundo', () => {
    const a = createWorld(42);
    const b = createWorld(42);
    advance(a, 20_000);
    advance(b, 20_000);
    expect(hash(a)).toBe(hash(b));
  });

  it('salvar no meio de um golpe e carregar continua a mesma partida', () => {
    const a = inFight(3);
    until(a, (x) => !!x.hero.action && !x.hero.action.applied);
    const b = deserialize(serialize(a));
    advance(a, 5000);
    advance(b, 5000);
    expect(hash(b)).toBe(hash(a));
  });

  it('o save recusa checksum errado', () => {
    const text = serialize(createWorld(1)).replace('"gold\\":60', '"gold\\":9999');
    expect(() => deserialize(text)).toThrow(/checksum/);
  });

  it('catchUp é a mesma step() (e respeita o teto de 8 h)', () => {
    const a = createWorld(9);
    const b = createWorld(9);
    catchUp(a, 30_000);
    advance(b, 30_000);
    expect(hash(a)).toBe(hash(b));
    const c = createWorld(9);
    expect(catchUp(c, 1e12).ticks).toBe(BALANCE.offlineCapTicks);
  });

  it('o estado é JSON puro', () => {
    const w = inFight(5);
    expect(JSON.parse(JSON.stringify(w))).toEqual(w);
  });
});

describe('combate', () => {
  it('o anel nunca passa de 3 vagas e o chefe ocupa 2', () => {
    const w = createWorld(11);
    w.hero.deepest = 5;
    w.rules.descent.startFloor = 5;
    w.hero.level = 30;
    let checked = 0;
    for (let i = 0; i < 60_000; i++) {
      step(w);
      if (!w.room) continue;
      const used = w.room.enemies
        .filter((e) => e.state === 'anel' || e.state === 'chegando')
        .reduce((s, e) => s + (e.kind === 'capitao' ? 2 : 1), 0);
      expect(used).toBeLessThanOrEqual(3);
      checked++;
    }
    expect(checked).toBeGreaterThan(1000);
    expect(w.bossesBeaten).toContain(5);
  });

  it('o dano entra no impacto, não no começo do golpe', () => {
    const w = inFight(4);
    until(w, (x) => x.hero.action?.kind === 'golpe' && !x.hero.action.applied && x.tick < x.hero.action.impact);
    const target = w.room!.enemies.find((e) => e.id === w.hero.action!.target)!;
    const hp = target.hp;
    const impact = w.hero.action!.impact;
    while (w.tick < impact - 1) {
      step(w);
      expect(target.hp).toBe(hp);
    }
    const ev = step(w, []);
    expect(ev.some((e) => e.t === 'acerto')).toBe(true);
  });

  it('a regra de poção dispara abaixo de 35% de vida', () => {
    const w = inFight(6);
    const s = heroStats(w);
    w.hero.hp = s.maxHp * 0.3;
    w.hero.action = null;
    const ev: SimEvent[] = [];
    step(w, ev);
    expect(ev.some((e) => e.t === 'pocao')).toBe(true);
  });

  it('Golpe Amplo sai quando há 2 no anel e está na barra', () => {
    const w = createWorld(8);
    w.hero.learned.push('golpe_amplo');
    w.hero.bar[0] = 'golpe_amplo';
    const ev: SimEvent[] = [];
    until(w, () => ev.some((e) => e.t === 'golpe' && e.skill === 'golpe_amplo'), 20_000, ev);
  });
});

describe('regra de morte', () => {
  it('o vestido nunca se perde, a gente sempre volta e a mochila é rolada', () => {
    const w = inFight(21);
    const equipped = JSON.stringify(w.hero.equip);
    const bag = w.exp!.bag;
    for (let i = 0; i < 8; i++) bag.items.push(makeItem(w, 'espada', 1, 'comum', 'teste'));
    bag.gold = 1000;
    bag.mats.ossos = 100;
    bag.people = 2;
    const people = w.village.people;
    forceDeath(w);
    expect(w.carried).toBe(true);
    const report = w.pending!;
    expect(report.died).toBe(true);
    expect(report.rolls).toHaveLength(8);
    const c = returnChance(w, report.floor, null);
    expect(w.exp!.bag.gold).toBe(Math.floor(1000 * c));
    expect(w.exp!.bag.mats.ossos).toBe(Math.floor(100 * c));
    const kept = report.rolls.filter((r) => r.kept).length;
    expect(w.exp!.bag.items).toHaveLength(kept);
    until(w, (x) => x.phase === 'vila');
    expect(JSON.stringify(w.hero.equip)).toBe(equipped);
    expect(w.village.people).toBe(people + 2);
    expect(w.hero.wound).not.toBeNull();
  });

  it('o que não voltou vira restos, com prazo, e volta ao passar pela sala', () => {
    const w = inFight(22);
    const where = { floor: w.exp!.floor, room: w.exp!.room };
    w.exp!.bag.gold = 500;
    forceDeath(w);
    expect(w.remains).toHaveLength(1);
    const pile = w.remains[0]!;
    expect(pile).toMatchObject(where);
    expect(pile.loot.gold).toBe(500 - Math.floor(500 * returnChance(w, where.floor, null)));
    expect(pile.expires - pile.created).toBe(BALANCE.remainsDays * BALANCE.dayTicks);
    // Volta, sara e desce de novo: a regra "buscar restos" leva ao mesmo andar.
    const ev: SimEvent[] = [];
    until(w, (x) => x.remains.length === 0, 200_000, ev);
    expect(w.stats.remainsRecovered).toBe(1);
    expect(ev.some((e) => e.t === 'restos')).toBe(true);
  });

  it('restos vencidos somem e a crônica registra', () => {
    const w = inFight(23);
    w.exp!.bag.gold = 300;
    forceDeath(w);
    w.rules.descent.repeat = false;
    const pile = w.remains[0]!;
    advance(w, pile.expires - w.tick + 1);
    expect(w.remains).toHaveLength(0);
    expect(w.stats.remainsExpired).toBe(1);
    expect(w.chronicle.at(-1)!.text).toMatch(/engoliu/);
  });

  it('a chance cai com a profundidade e sobe com raridade e carroceiro', () => {
    const w = createWorld(1);
    expect(returnChance(w, 1, 'comum')).toBeCloseTo(BALANCE.deathBase);
    expect(returnChance(w, 10, 'comum')).toBeLessThan(returnChance(w, 5, 'comum'));
    expect(returnChance(w, 10, 'lendaria')).toBeGreaterThan(returnChance(w, 10, 'rara'));
    const before = returnChance(w, 10, 'comum');
    w.village.buildings.carroceiro = 2;
    expect(returnChance(w, 10, 'comum')).toBeCloseTo(before + 2 * BALANCE.deathCarter);
    expect(returnChance(w, 99, 'comum')).toBe(BALANCE.deathMin);
  });

  it('o ferimento pesa proporcionalmente e só sara na vila', () => {
    const w = createWorld(2);
    const full = heroStats(w).maxHp;
    w.hero.wound = { total: 1000, left: 500 };
    expect(heroStats(w).maxHp).toBe(Math.round(full * (1 - BALANCE.woundHp * 0.5)));
    w.rules.descent.repeat = false;
    advance(w, 100);
    expect(w.hero.wound.left).toBe(400);
    w.phase = 'descendo';
    w.phaseEnd = w.tick + 1e6;
    w.exp = { floor: 1, room: 0, bag: { gold: 0, mats: { ossos: 0, ferro: 0, ferro_negro: 0, esporos: 0 }, items: [], people: 0 }, started: 0, recall: false, leaving: null, kills: 0 };
    advance(w, 100);
    expect(w.hero.wound.left).toBe(400);
  });
});

describe('vila e itens', () => {
  it('o teto da forja segue o andar mais fundo e o nível do ferreiro', () => {
    const w = createWorld(3);
    expect(forgeCap(w)).toBe(1);
    w.hero.deepest = 9;
    expect(forgeCap(w)).toBe(2);
    w.village.buildings.ferreiro = 4;
    expect(forgeCap(w)).toBe(floorTier(9));
    w.village.gold = 1e6;
    w.village.mats.ossos = 1e6;
    const weapon = w.hero.equip.arma!;
    weapon.tier = forgeCap(w);
    expect(commands.upgrade(w, weapon.id)).toMatch(/só vai até/);
  });

  it('equipamento só muda na vila; arma de duas mãos tira o escudo', () => {
    const w = createWorld(4);
    const shield = w.village.stash.find((i) => i.base === 'escudo_redondo')!;
    expect(commands.equip(w, shield.id)).toBeNull();
    const big = makeItem(w, 'espadao', 1, 'comum', 'teste');
    w.village.stash.push(big);
    expect(commands.equip(w, big.id)).toBeNull();
    expect(w.hero.equip.secundaria).toBeUndefined();
    expect(w.village.stash.some((i) => i.id === shield.id)).toBe(true);
    w.phase = 'sala';
    expect(commands.equip(w, shield.id)).toMatch(/vila/);
  });

  it('nomes em português concordam com a base', () => {
    const w = createWorld(5);
    expect(itemName(makeItem(w, 'espada', 3, 'rara', 't', ['afiado']))).toBe('Espada afiada de aço');
    expect(itemName(makeItem(w, 'machado', 1, 'epica', 't', ['brutal', 'veloz']))).toBe('Machado brutal e veloz de ferro');
    expect(itemName(makeItem(w, 'botas_leves', 5, 'rara', 't', ['robusto']))).toBe('Botas leves robustas finas');
  });

  it('obras pedem gente e materiais do abismo', () => {
    const w = createWorld(6);
    w.village.gold = 1e5;
    expect(commands.build(w, 'ferreiro')).toMatch(/moradores/);
    w.village.people = 10;
    expect(commands.build(w, 'ferreiro')).toMatch(/ferro/);
    w.village.mats.ferro = 100;
    expect(commands.build(w, 'ferreiro')).toBeNull();
    advance(w, BALANCE.buildTicksPerLevel * 2 + 1);
    expect(w.village.buildings.ferreiro).toBe(2);
  });

  it('o jogador automático vence o chefe do andar 5 em menos de 1 h', () => {
    const w = createWorld(1000);
    let prev = w.phase;
    for (let i = 0; i < 36_000 && !w.bossesBeaten.includes(5); i++) {
      step(w);
      if (w.phase === 'vila' && (prev !== 'vila' || w.tick % 20 === 0)) botTick(w);
      prev = w.phase;
    }
    expect(w.bossesBeaten).toContain(5);
    expect(w.exp?.bag.items.some((i) => i.legend) || w.village.stash.some((i) => i.legend) || Object.values(w.hero.equip).some((i) => i?.legend)).toBe(true);
  });
});
