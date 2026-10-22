import { describe, expect, it } from 'vitest';
import { couracaCut, makeEnemy, spawnGroup, stepFight } from '../src/sim/combat.ts';
import { BALANCE, actOf, floorInAct, floorTier, groupSize, roomsOnFloor } from '../src/sim/config.ts';
import { startDescent } from '../src/sim/expedition.ts';
import { dropItem, emptyLoot, makeItem } from '../src/sim/items.ts';
import { chooseAction, defaultCombatRules } from '../src/sim/rules.ts';
import { checksum, commands, createWorld, deserialize, heroStats, nextCost, serialize, step } from '../src/sim/index.ts';
import type { Enemy, EnemyKind, SimEvent, World } from '../src/sim/index.ts';

/** Uma sala das Minas montada à mão, com os inimigos dados e o herói firme. */
function mineRoom(kinds: EnemyKind[], floor = 14, seed = 3): World {
  const w = createWorld(seed);
  w.phase = 'sala';
  w.hero.deepest = floor;
  w.hero.level = 30;
  w.hero.hp = 1e6;
  w.exp = { floor, room: 1, bag: { gold: 0, mats: { ossos: 0, ferro: 0, ferro_negro: 0 }, items: [], people: 0 }, started: 0, recall: false, leaving: null, kills: 0 };
  w.room = {
    floor, index: 1, kind: 'combate', enemies: kinds.map((k) => makeEnemy(w, k, floor, null, 0)), phase: 'luta', phaseEnd: 0, look: 1,
    fightStart: w.tick, fearUntil: 0, hpAtStart: w.hero.hp, phase2At: 0,
  };
  return w;
}

function fight(w: World, ticks: number, ev: SimEvent[] = []): void {
  for (let i = 0; i < ticks; i++) {
    w.tick++;
    stepFight(w, ev, () => {});
  }
}

describe('Ato II: estrutura dos andares', () => {
  it('o Ato I não muda; o Ato II tem salas, grupos e tiers próprios', () => {
    expect([1, 3, 10].map(roomsOnFloor)).toEqual([4, 5, 7]);
    expect([1, 2, 10].map(groupSize)).toEqual([3, 4, 8]);
    expect(actOf(10)).toBe(1);
    expect(actOf(11)).toBe(2);
    expect(floorInAct(15)).toBe(5);
    expect([11, 15, 20].map(roomsOnFloor)).toEqual([6, 7, 9]);
    expect([11, 12, 20].map(floorTier)).toEqual([6, 6, 10]);
    expect(BALANCE.maxFloor).toBe(20);
  });

  it('os grupos das Minas vêm do Ato II, e os chefes são o Capataz e a Couraça Submersa', () => {
    const w = createWorld(7);
    const act2 = new Set(['mineiro', 'afogado', 'golem', 'lanterneiro']);
    for (let i = 0; i < 30; i++) for (const e of spawnGroup(w, 16, 'combate', 0)) expect(act2.has(e.kind)).toBe(true);
    expect(spawnGroup(w, 15, 'chefe', 0)[0]!.kind).toBe('capataz');
    expect(spawnGroup(w, 20, 'chefe', 0)[0]!.kind).toBe('couraca');
    expect(spawnGroup(w, 5, 'chefe', 0)[0]!.kind).toBe('capitao');
    const elite = spawnGroup(w, 13, 'elite', 0).find((e) => e.elite)!;
    expect(['mineiro', 'afogado']).toContain(elite.kind);
  });

  it('as armas que furam só caem e só se forjam nas Minas', () => {
    const w = createWorld(8);
    for (let i = 0; i < 300; i++) expect(['martelo', 'lanca', 'alabarda']).not.toContain(dropItem(w, 9, 'comum', 0).base);
    const deep = new Set(Array.from({ length: 400 }, () => dropItem(w, 14, 'comum', 0).base));
    expect(deep.has('martelo')).toBe(true);
    expect(dropItem(w, 14, 'comum', 0).origin).toMatch(/das Minas/);
    w.village.gold = 1e6;
    w.village.mats.ossos = 1e4;
    expect(commands.forge(w, 'martelo', 'comum')).toMatch(/andar 11/);
  });
});

describe('Ato II: couraça e perfuração', () => {
  it('a couraça corta o dano por C / (C + 18); a perfuração e a Quebra-Couraça tiram parte', () => {
    const w = mineRoom(['golem']);
    const g = w.room!.enemies[0]!;
    expect(couracaCut(w, g, 0)).toBeCloseTo(40 / 58);
    expect(couracaCut(w, g, 0.5)).toBeCloseTo(20 / 38);
    g.armorBreakUntil = w.tick + 10;
    expect(couracaCut(w, g, 0)).toBeCloseTo(20 / 38);
    const lacaio = makeEnemy(w, 'lacaio', 5, null, 0);
    expect(couracaCut(w, lacaio, 0)).toBe(0);
  });

  it('a perfuração vem da arma, do afixo e de Mão Pesada', () => {
    const w = createWorld(9);
    expect(heroStats(w).pierce).toBe(0);
    w.hero.equip.arma = makeItem(w, 'martelo', 6, 'rara', '', ['perfurante']);
    const withHammer = heroStats(w).pierce;
    expect(withHammer).toBeGreaterThan(0.3);
    w.hero.learned.push('mao_pesada');
    expect(heroStats(w).pierce).toBeCloseTo(withHammer + 0.15);
  });

  it('com perfuração, a mesma sala de golens acaba mais depressa', () => {
    const time = (pierce: boolean) => {
      const w = mineRoom(['golem', 'golem'], 14, 11);
      w.hero.equip.arma = makeItem(w, pierce ? 'martelo' : 'espada', 7, 'comum', '');
      if (pierce) w.hero.learned.push('mao_pesada');
      let t = 0;
      while (w.room!.enemies.some((e) => e.state !== 'morto') && t < 20000) {
        fight(w, 1);
        t++;
      }
      return t;
    };
    expect(time(false)).toBeGreaterThan(time(true) * 1.2);
  });

  it('a Âncora Partida ignora a couraça a cada quarto golpe', () => {
    const w = mineRoom(['golem']);
    w.hero.equip.arma = makeItem(w, 'alabarda', 8, 'lendaria', '');
    w.hero.equip.arma.legend = 'ancora_partida';
    const g = w.room!.enemies[0]!;
    g.hp = g.maxHp = 1e9;
    const ev: SimEvent[] = [];
    fight(w, 600, ev);
    const hits = ev.filter((e) => e.t === 'acerto').map((e) => (e as { dmg: number }).dmg);
    expect(hits.length).toBeGreaterThan(4);
    expect(Math.max(...hits)).toBeGreaterThan(Math.min(...hits) * 1.6);
  });
});

describe('Ato II: os inimigos', () => {
  it('o afogado puxa o herói (ataque 20% mais lento) e Pele Úmida corta a duração pela metade', () => {
    const w = mineRoom(['afogado']);
    const before = heroStats(w).aps;
    let guard = 0;
    while (w.hero.slowUntil <= w.tick && guard++ < 400) fight(w, 1);
    expect(heroStats(w).aps).toBeCloseTo(before * 0.8);
    expect(w.hero.slowUntil - w.tick).toBeLessThanOrEqual(30);
    const w2 = mineRoom(['afogado']);
    w2.hero.learned.push('pele_umida');
    guard = 0;
    while (w2.hero.slowUntil <= w2.tick && guard++ < 400) fight(w2, 1);
    expect(w2.hero.slowUntil - w2.tick).toBeLessThanOrEqual(15);
  });

  it('a luz do lanterneiro faz os outros baterem 15% mais', () => {
    const hitOf = (kinds: EnemyKind[]) => {
      const w = mineRoom(kinds, 14, 21);
      w.hero.equip = {};
      const ev: SimEvent[] = [];
      fight(w, 400, ev);
      const miner = w.room!.enemies.find((e) => e.kind === 'mineiro')!.id;
      return ev.find((e) => e.t === 'heroiAcertado' && (e as { enemy: number }).enemy === miner) as { dmg: number } | undefined;
    };
    const alone = hitOf(['mineiro'])!.dmg;
    const lit = hitOf(['mineiro', 'lanterneiro'])!.dmg;
    expect(lit).toBeGreaterThanOrEqual(Math.round(alone * 1.15) - 1);
  });

  it('o golpe especial do Capataz atordoa o herói e chama mineiros', () => {
    const w = mineRoom([], 15, 13);
    w.room!.kind = 'chefe';
    w.room!.enemies = [makeEnemy(w, 'capataz', 15, null, 0)];
    let stunned = false;
    for (let i = 0; i < 800 && !stunned; i++) {
      fight(w, 1);
      if (w.hero.stunUntil > w.tick) stunned = true;
    }
    expect(stunned).toBe(true);
    expect(w.room!.enemies.filter((e) => e.kind === 'mineiro').length).toBeGreaterThanOrEqual(2);
  });

  it('a Couraça Submersa endurece na metade da vida e passa a bater duas vezes', () => {
    const w = mineRoom([], 20, 17);
    w.room!.kind = 'chefe';
    const boss: Enemy = makeEnemy(w, 'couraca', 20, null, 0);
    w.room!.enemies = [boss];
    const armor = boss.armor;
    boss.hp = Math.round(boss.maxHp * 0.51);
    const ev: SimEvent[] = [];
    let guard = 0;
    while (boss.phase === 1 && guard++ < 2000) fight(w, 1, ev);
    expect(boss.armor).toBeCloseTo(armor * 1.3);
    expect(ev.some((e) => e.t === 'fase')).toBe(true);
    const hits: number[] = [];
    for (let i = 0; i < 300; i++) {
      const before = ev.length;
      fight(w, 1, ev);
      for (const e of ev.slice(before)) if (e.t === 'heroiAcertado') hits.push(w.tick);
    }
    // Golpes em pares: dois impactos a 4 ticks um do outro.
    expect(hits.some((t, i) => i > 0 && t - hits[i - 1]! === 4)).toBe(true);
  });

  it('golens deixam ferro-negro na mochila', () => {
    const w = mineRoom(['golem', 'golem']);
    w.hero.equip.arma = makeItem(w, 'martelo', 10, 'comum', '');
    w.hero.level = 60;
    let guard = 0;
    while (w.room?.phase === 'luta' && guard++ < 8000) step(w, []);
    expect(w.room!.phase).toBe('saque');
    expect(w.exp!.bag.mats.ferro_negro).toBeGreaterThanOrEqual(2);
  });
});

describe('Ato II: regras, habilidades e vila', () => {
  it('a condição "alvo com couraça" chama Quebra-Couraça; Golpe de Escudo pede escudo', () => {
    const w = mineRoom(['golem']);
    w.village.buildings.taticas = 4;
    w.hero.learned.push('quebra_couraca', 'golpe_escudo');
    w.hero.bar = ['quebra_couraca', 'golpe_escudo', null];
    w.rules.combat = defaultCombatRules();
    const g = w.room!.enemies[0]!;
    g.state = 'anel';
    g.slot = 0;
    const s = heroStats(w);
    expect(chooseAction(w, s)).toEqual({ kind: 'habilidade', skill: 'quebra_couraca' });
    w.room!.enemies[0]!.armorBreakUntil = w.tick + 50;
    // Sem escudo, o Golpe de Escudo não sai: volta o golpe básico.
    expect(chooseAction(w, s)).toEqual({ kind: 'golpe', skill: null });
  });

  it('o treinador do Ato II pede ferro-negro', () => {
    const w = createWorld(19);
    w.village.buildings.treinador = 1;
    expect(nextCost(w, 'treinador')!.mats.ferro_negro).toBeGreaterThan(0);
    w.village.buildings.treinador = 0;
    expect(nextCost(w, 'treinador')!.mats.ferro_negro).toBeUndefined();
  });

  it('buscar os restos não puxa o herói para um andar fundo demais (aos pés do Capataz)', () => {
    const w = createWorld(23);
    w.hero.deepest = 15;
    w.rules.descent.startFloor = 12;
    w.remains.push({ id: 1, floor: 15, room: 6, loot: emptyLoot(), created: 0, expires: 1e9 });
    startDescent(w, []);
    expect(w.exp!.floor).toBe(12);
    // Forte o bastante, ele desce até a pilha.
    const strong = createWorld(23);
    strong.hero.deepest = 15;
    strong.hero.level = 80;
    strong.rules.descent.startFloor = 12;
    strong.remains.push({ id: 1, floor: 15, room: 6, loot: emptyLoot(), created: 0, expires: 1e9 });
    strong.hero.equip.arma = makeItem(strong, 'martelo', 10, 'rara', '');
    startDescent(strong, []);
    expect(strong.exp!.floor).toBe(15);
  });

  it('migra um save v2 para a v3 (ferro-negro, couraça e as regras do Ato II)', () => {
    const w = mineRoom(['mineiro']);
    const v2 = JSON.parse(JSON.stringify(w)) as Record<string, any>;
    v2.version = 2;
    delete v2.village.mats.ferro_negro;
    delete v2.exp.bag.mats.ferro_negro;
    for (const e of v2.room.enemies) {
      delete e.armor;
      delete e.armorBreakUntil;
      delete e.comboAt;
    }
    for (const k of ['slowUntil', 'stunUntil', 'swings']) delete v2.hero[k];
    v2.rules.combat = v2.rules.combat.slice(0, 6);
    const body = JSON.stringify(v2);
    const back = deserialize(JSON.stringify({ v: 2, sum: checksum(body), body }));
    expect(back.version).toBe(3);
    expect(back.village.mats.ferro_negro).toBe(0);
    expect(back.exp!.bag.mats.ferro_negro).toBe(0);
    expect(back.room!.enemies[0]!.armor).toBe(0);
    expect(back.hero.swings).toBe(0);
    expect(back.rules.combat.map((r) => r.skill)).toContain('quebra_couraca');
    expect(() => serialize(back)).not.toThrow();
  });
});
