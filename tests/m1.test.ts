import { describe, expect, it } from 'vitest';
import { spawnGroup, stepFight } from '../src/sim/combat.ts';
import { BALANCE } from '../src/sim/config.ts';
import { makeItem } from '../src/sim/items.ts';
import { SAVE_VERSION, catchUp, checksum, commands, createWorld, deserialize, forgeCap, forgeCost, reforgeCost, serialize, step } from '../src/sim/index.ts';
import type { Enemy, SimEvent, World } from '../src/sim/index.ts';

function rich(w: World): void {
  w.village.gold = 1e6;
  w.village.mats.ossos = 1e5;
  w.village.mats.ferro = 1e5;
}

/** Sala do chefe do andar 10 montada à mão, com o herói forte o bastante para não morrer. */
function senhorRoom(seed = 5): World {
  const w = createWorld(seed);
  w.phase = 'sala';
  w.hero.deepest = 10;
  w.hero.level = 40;
  w.hero.hp = 1e5;
  w.exp = { floor: 10, room: 6, bag: { gold: 0, mats: { ossos: 0, ferro: 0, ferro_negro: 0, esporos: 0 }, items: [], people: 0 }, started: 0, recall: false, leaving: null, kills: 0 };
  w.room = {
    floor: 10, index: 6, kind: 'chefe', enemies: spawnGroup(w, 10, 'chefe', 0), phase: 'luta', phaseEnd: 0, look: 1,
    fightStart: w.tick, fearUntil: 0, hpAtStart: w.hero.hp, phase2At: 0,
  };
  return w;
}

describe('novo jogo', () => {
  it('usa o nome e o rosto escolhidos (até 18 letras)', () => {
    const w = createWorld(1, 'Mage', '  Ana da Chama  ');
    expect(w.hero.head).toBe('Mage');
    expect(w.hero.name).toBe('Ana da Chama');
    expect(createWorld(1, 'Rogue', 'x'.repeat(40)).hero.name).toHaveLength(18);
    expect(createWorld(1, 'Rogue').hero.name).toBe('Lívia');
  });
});

describe('forja completa', () => {
  it('rara põe o afixo escolhido e gasta o material dele', () => {
    const w = createWorld(2);
    rich(w);
    w.village.buildings.ferreiro = 2;
    w.hero.deepest = 6;
    const tier = forgeCap(w);
    const before = { ...w.village.mats };
    expect(commands.forge(w, 'espada', 'rara', 'guardiao')).toBeNull();
    const c = forgeCost(tier, 'rara', 'guardiao');
    expect(c.mats.ferro).toBe(5 * tier);
    expect(w.village.mats.ferro).toBe(before.ferro - 5 * tier);
    expect(w.village.mats.ossos).toBe(before.ossos - BALANCE.forgeBones(tier));
    for (let i = 0; i < BALANCE.rareForgeTicks + 1; i++) step(w);
    const made = w.village.stash.at(-1)!;
    expect(made).toMatchObject({ base: 'espada', rarity: 'rara', tier, affixes: ['guardiao'] });
    expect(w.stats.forged).toBe(1);
  });

  it('épica pede o ferreiro 4 e tem o afixo escolhido mais um sorteado', () => {
    const w = createWorld(3);
    rich(w);
    w.village.buildings.ferreiro = 3;
    expect(commands.forge(w, 'machado', 'epica', 'brutal')).toMatch(/ferreiro nível 4/);
    w.village.buildings.ferreiro = 4;
    expect(commands.forge(w, 'machado', 'epica', 'brutal')).toBeNull();
    expect(w.village.forge!.item.affixes[0]).toBe('brutal');
    expect(w.village.forge!.item.affixes).toHaveLength(2);
    expect(new Set(w.village.forge!.item.affixes).size).toBe(2);
  });

  it('amuleto comum é recusado e rara sem afixo pede escolha', () => {
    const w = createWorld(4);
    rich(w);
    w.village.buildings.ferreiro = 2;
    expect(commands.forge(w, 'amuleto', 'comum')).toMatch(/amuleto/);
    expect(commands.forge(w, 'amuleto', 'rara', null)).toMatch(/afixo/);
  });

  it('reforjar troca só o afixo escolhido por um que a peça não tem; lendária recusa', () => {
    const w = createWorld(6);
    rich(w);
    const item = makeItem(w, 'espada', 2, 'epica', 'teste', ['afortunado', 'brutal']);
    w.village.stash.push(item);
    expect(commands.reforge(w, item.id, 0)).toMatch(/ferreiro nível 3/);
    w.village.buildings.ferreiro = 3;
    const gold = w.village.gold;
    expect(commands.reforge(w, item.id, 0)).toBeNull();
    expect(w.village.gold).toBe(gold - reforgeCost(2).gold);
    for (let i = 0; i < BALANCE.reforgeTicks + 1; i++) step(w);
    expect(item.affixes[1]).toBe('brutal');
    expect(item.affixes[0]).not.toBe('afortunado');
    expect(item.affixes[0]).not.toBe('brutal');
    const legend = makeItem(w, 'espada', 2, 'lendaria', 'teste', ['brutal', 'afiado', 'sanguessuga']);
    legend.legend = 'vigia_partida';
    w.village.stash.push(legend);
    expect(commands.reforge(w, legend.id, 0)).toMatch(/lendária/);
  });
});

describe('Senhor da Cripta', () => {
  it('o andar 10 é do Senhor; o 5 continua do Capitão', () => {
    const w = createWorld(7);
    expect(spawnGroup(w, 10, 'chefe', 0)[0]!.kind).toBe('senhor');
    expect(spawnGroup(w, 5, 'chefe', 0)[0]!.kind).toBe('capitao');
  });

  it('abaixo de metade da vida entra na fase 2, vem para o anel e ergue até 3 mortos', () => {
    const w = senhorRoom();
    const room = w.room!;
    const boss = room.enemies[0]!;
    expect(boss.state).toBe('fundo');
    // Mata a escolta à mão para haver mortos na sala.
    for (const e of room.enemies.slice(1)) {
      e.state = 'morto';
      e.hp = 0;
    }
    const ev: SimEvent[] = [];
    const kills: Enemy[] = [];
    boss.hp = boss.maxHp * 0.5 + 1;
    for (let i = 0; i < 400 && boss.phase === 1; i++) {
      w.tick++;
      stepFight(w, ev, (_w, e) => kills.push(e));
    }
    expect(boss.phase).toBe(2);
    expect(room.phase2At).toBeGreaterThan(0);
    expect(ev.some((e) => e.t === 'fase')).toBe(true);
    const revived = room.enemies.filter((e) => e.revived);
    expect(revived.length).toBe(Math.min(3, room.enemies.length - 1));
    for (const r of revived) expect(r.hp).toBe(Math.round(r.maxHp / 2));
    expect(ev.filter((e) => e.t === 'inimigoRevive')).toHaveLength(revived.length);
    expect(boss.interval).toBe(20);
  });

  it('a primeira vitória sobre o Senhor deixa a Vigia Partida e conta a luta', () => {
    const w = senhorRoom(8);
    w.rules.combat = [];
    let guard = 0;
    while (w.phase === 'sala' && w.room?.phase !== 'saque' && guard++ < 50_000) step(w);
    expect(w.bossesBeaten).toContain(10);
    expect(w.exp!.bag.items.some((i) => i.legend === 'vigia_partida')).toBe(true);
    expect(w.stats.senhorFights).toBe(1);
  });
});

/** JSON com as chaves em ordem alfabética (o mesmo conteúdo dá o mesmo texto). */
function canonical(v: unknown): string {
  return JSON.stringify(v, (_k, x) => (x && typeof x === 'object' && !Array.isArray(x) ? Object.fromEntries(Object.entries(x).sort(([a], [b]) => (a < b ? -1 : 1))) : x));
}

describe('save v2 e relatório da ausência', () => {
  it('migra um save v1 (sem fase, ressurreição e contadores novos)', () => {
    const w = senhorRoom(9);
    const v1 = JSON.parse(JSON.stringify(w)) as Record<string, any>;
    v1.version = 1;
    delete v1.room.phase2At;
    for (const e of v1.room.enemies) {
      delete e.phase;
      delete e.revived;
    }
    for (const k of ['forged', 'upgraded', 'senhorFights', 'senhorFightTicks', 'senhorPhase2Frac']) delete v1.stats[k];
    const body = JSON.stringify(v1);
    const back = deserialize(JSON.stringify({ v: 1, sum: checksum(body), body }));
    expect(back.version).toBe(SAVE_VERSION);
    expect(back.room!.phase2At).toBe(0);
    expect(back.room!.enemies.every((e) => e.phase === 1 && e.revived === false)).toBe(true);
    expect(back.stats.forged).toBe(0);
    expect(back.stats.upgraded).toBe(0);
    // E continua igual a quem nunca saiu do v2.
    const fresh = deserialize(serialize(w));
    for (let i = 0; i < 2000; i++) {
      step(back);
      step(fresh);
    }
    // Compara o conteúdo (com as chaves em ordem): a migração põe os campos novos no fim do objeto.
    expect(checksum(canonical(back))).toBe(checksum(canonical(fresh)));
  });

  it('o relatório da ausência traz peças, níveis, obras e a crônica do período', () => {
    const w = createWorld(10);
    w.village.gold = 5000;
    w.village.mats.ossos = 500;
    commands.build(w, 'treinador');
    const r = catchUp(w, 36_000);
    expect(r.ticks).toBe(36_000);
    expect(r.buildings).toContain('Treinador 1');
    expect(r.levels).toBeGreaterThan(0);
    expect(r.lines.length).toBeGreaterThan(0);
    expect(r.lines.length).toBeLessThanOrEqual(8);
    expect(r.items).toBeGreaterThanOrEqual(0);
  });
});
