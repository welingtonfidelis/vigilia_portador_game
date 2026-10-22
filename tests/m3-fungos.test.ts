import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { enemyFiles, ownClipNeeds } from '../src/render/actors.ts';
import { addPoison, makeEnemy, poisonTick, spawnGroup, stepFight } from '../src/sim/combat.ts';
import { BALANCE, actOf, floorTier, roomsOnFloor } from '../src/sim/config.ts';
import { affixPool, makeItem } from '../src/sim/items.ts';
import { chooseAction, skillReady } from '../src/sim/rules.ts';
import { forge } from '../src/sim/village.ts';
import { SAVE_VERSION, checksum, createWorld, deserialize, heroStats, nextCost, powerRatio, serialize, step } from '../src/sim/index.ts';
import type { EnemyKind, SimEvent, World } from '../src/sim/index.ts';

/** Uma sala dos Fungos montada à mão, com os inimigos dados e o herói firme. */
function fungusRoom(kinds: EnemyKind[], floor = 24, seed = 5): World {
  const w = createWorld(seed);
  w.phase = 'sala';
  w.hero.deepest = floor;
  w.hero.level = 50;
  w.hero.hp = heroStats(w).maxHp;
  w.exp = { floor, room: 1, bag: { gold: 0, mats: { ossos: 0, ferro: 0, ferro_negro: 0, esporos: 0 }, items: [], people: 0 }, started: 0, recall: false, leaving: null, kills: 0 };
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

const doses = (w: World) => w.hero.poison.filter((t) => t > w.tick).length;

describe('Ato III: estrutura dos andares', () => {
  it('os andares 21 a 30 são os Fungos, com tiers 11 a 15 e salas próprias', () => {
    expect(actOf(21)).toBe(3);
    expect([21, 30].map(floorTier)).toEqual([11, 15]);
    expect([21, 30].map(roomsOnFloor)).toEqual([9, 12]);
    expect(BALANCE.maxFloor).toBe(30);
  });

  it('os grupos vêm do Jardim de Fungos, e os chefes são o Guardião e a Mãe-Bolor', () => {
    const w = createWorld(7);
    const fungi = new Set(['esporento', 'brotado', 'aranha', 'cuspidor']);
    for (let i = 0; i < 30; i++) for (const e of spawnGroup(w, 27, 'combate', 0)) expect(fungi.has(e.kind)).toBe(true);
    expect(spawnGroup(w, 25, 'chefe', 0)[0]!.kind).toBe('guardiao');
    expect(spawnGroup(w, 30, 'chefe', 0)[0]!.kind).toBe('mae');
    const elite = spawnGroup(w, 23, 'elite', 0).find((e) => e.elite)!;
    expect(['esporento', 'aranha']).toContain(elite.kind);
  });
});

describe('Ato III: o veneno', () => {
  it('o golpe do esporento deixa uma dose; as doses se somam até 5 e vencem em 6 s', () => {
    const w = fungusRoom([]);
    const s = heroStats(w);
    for (let i = 0; i < 7; i++) addPoison(w, s, 1);
    expect(doses(w)).toBe(BALANCE.poisonMaxDoses);
    w.tick += BALANCE.poisonTicks;
    expect(doses(w)).toBe(0);
  });

  it('cada dose tira 2,5% da vida máxima por segundo; Sangue Amargo corta pela metade', () => {
    const w = fungusRoom([]);
    const s = heroStats(w);
    addPoison(w, s, 2);
    const before = w.hero.hp;
    poisonTick(w, s);
    expect(before - w.hero.hp).toBeCloseTo((s.maxHp * BALANCE.poisonDose * 2) / 10);
    w.hero.learned.push('sangue_amargo');
    const mid = w.hero.hp;
    poisonTick(w, s);
    expect(mid - w.hero.hp).toBeCloseTo((s.maxHp * BALANCE.poisonDose * 2) / 20);
  });

  it('o afixo Imune encurta o veneno e só sai em peças do Ato III', () => {
    expect(affixPool(5)).not.toContain('perfurante');
    expect(affixPool(6)).toContain('perfurante');
    expect(affixPool(10)).not.toContain('imune');
    expect(affixPool(11)).toContain('imune');
    const w = fungusRoom([]);
    w.hero.equip.peitoral = makeItem(w, 'couraca_placas', 12, 'rara', '', ['imune']);
    const s = heroStats(w);
    expect(s.imune).toBeGreaterThan(0.15);
    addPoison(w, s, 1);
    expect(w.hero.poison[0]! - w.tick).toBe(Math.round(BALANCE.poisonTicks * (1 - s.imune)));
  });

  it('Purificar tira o veneno e cura; a regra "envenenado 3" chama Purificar', () => {
    const w = fungusRoom(['esporento']);
    w.hero.learned.push('purificar');
    w.hero.bar = ['purificar', null, null];
    const s = heroStats(w);
    expect(skillReady(w, s, 'purificar')).toBe(false);
    addPoison(w, s, 3);
    w.hero.hp = s.maxHp * 0.6;
    w.village.buildings.taticas = 6;
    w.rules.combat = w.rules.combat.filter((r) => r.skill === 'purificar' || r.action === 'pocao');
    expect(chooseAction(w, s)).toEqual({ kind: 'habilidade', skill: 'purificar' });
    w.hero.cooldowns = {};
    const ev: SimEvent[] = [];
    let guard = 0;
    while (doses(w) > 0 && guard++ < 50) fight(w, 1, ev);
    expect(doses(w)).toBe(0);
    expect(ev.some((e) => e.t === 'cura')).toBe(true);
  });

  it('com o alquimista 5, a poção também tira o veneno', () => {
    const w = fungusRoom(['esporento']);
    w.village.buildings.alquimista = 5;
    const s = heroStats(w);
    expect(s.antidote).toBe(true);
    addPoison(w, s, 3);
    w.hero.hp = s.maxHp * 0.2;
    const ev: SimEvent[] = [];
    let guard = 0;
    while (!ev.some((e) => e.t === 'cura') && guard++ < 50) fight(w, 1, ev);
    expect(doses(w)).toBe(0);
  });

  it('a Força dos Fungos conta o veneno: o Imune sobe a Força no Ato III e não no II', () => {
    const w = fungusRoom([], 24);
    const plain = { ...w.hero.equip, peitoral: makeItem(w, 'couraca_placas', 12, 'comum', '') };
    const imune = { ...w.hero.equip, peitoral: { ...plain.peitoral, affixes: ['imune' as const] } };
    expect(powerRatio(w, 24, imune)).toBeGreaterThan(powerRatio(w, 24, plain));
    expect(powerRatio(w, 14, imune)).toBeCloseTo(powerRatio(w, 14, plain));
  });
});

describe('Ato III: os inimigos e os chefes', () => {
  it('o brotado morto no anel solta a nuvem: uma dose no herói', () => {
    const w = fungusRoom(['brotado']);
    w.hero.equip.arma = makeItem(w, 'espadao', 15, 'comum', '');
    const ev: SimEvent[] = [];
    let guard = 0;
    while (w.room!.enemies[0]!.state !== 'morto' && guard++ < 300) fight(w, 1, ev);
    expect(w.room!.enemies[0]!.state).toBe('morto');
    expect(doses(w)).toBeGreaterThanOrEqual(1);
  });

  it('a aranha pula no anel e o golpe dela prende o herói: sem Investida por 3 s', () => {
    const w = fungusRoom(['aranha', 'cuspidor']);
    w.hero.hp = 1e7;
    w.hero.learned.push('investida');
    w.hero.bar = ['investida', null, null];
    fight(w, 4);
    expect(w.room!.enemies[0]!.state).toBe('anel');
    let guard = 0;
    while (w.hero.rootUntil <= w.tick && guard++ < 200) fight(w, 1);
    expect(w.hero.rootUntil).toBeGreaterThan(w.tick);
    expect(skillReady(w, heroStats(w), 'investida')).toBe(false);
  });

  it('o Guardião de Micélio cura os outros em 30% da vida', () => {
    const w = fungusRoom(['esporento'], 25);
    w.hero.hp = 1e7;
    const boss = makeEnemy(w, 'guardiao', 25, null, 0);
    w.room!.enemies.unshift(boss);
    const ally = w.room!.enemies[1]!;
    ally.hp = 1;
    boss.nextSpecial = w.tick + 1;
    // O golpe especial dele é conjurado, sem dano: cura os outros assim que ele chega ao anel.
    const ev: SimEvent[] = [];
    let guard = 0;
    while (!ev.some((e) => e.t === 'aviso' && /Guardião/.test(e.text)) && guard++ < 80) fight(w, 1, ev);
    expect(ally.hp).toBeGreaterThan(ally.maxHp * 0.25);
  });

  it('a Mãe-Bolor na metade da vida faz brotar dois brotados, e o veneno corre 1,5× mais rápido', () => {
    const w = fungusRoom([], 30);
    w.hero.hp = 1e7;
    const boss = makeEnemy(w, 'mae', 30, null, 0);
    w.room!.kind = 'chefe';
    w.room!.enemies = [boss];
    boss.hp = Math.round(boss.maxHp * 0.51);
    const ev: SimEvent[] = [];
    let guard = 0;
    while (boss.phase === 1 && guard++ < 2000) fight(w, 1, ev);
    expect(boss.phase).toBe(2);
    expect(w.room!.enemies.filter((e) => e.kind === 'brotado').length).toBeGreaterThanOrEqual(2);
    const s = heroStats(w);
    w.hero.poison = [];
    addPoison(w, s, 2);
    const before = w.hero.hp;
    poisonTick(w, s);
    expect(before - w.hero.hp).toBeCloseTo((s.maxHp * BALANCE.poisonDose * 2 * BALANCE.poisonBloom) / 10);
  });

  it('o Ferrão da Mãe envenena o alvo, que perde vida depois do golpe', () => {
    const w = fungusRoom(['esporento']);
    w.hero.hp = 1e7;
    w.hero.equip.arma = { ...makeItem(w, 'adaga', 15, 'lendaria', ''), legend: 'ferrao_mae' };
    const e = w.room!.enemies[0]!;
    e.hp = e.maxHp = 1e9;
    let guard = 0;
    while (e.venomUntil <= w.tick && guard++ < 200) fight(w, 1);
    expect(e.venom).toBeGreaterThan(0);
    const hp = e.hp;
    w.hero.stunUntil = w.tick + 100;
    fight(w, 5);
    expect(e.hp).toBeLessThan(hp);
  });

  it('a primeira vitória sobre a Couraça traz esporos para o treinador do Ato III', () => {
    const w = fungusRoom([], 20);
    w.hero.hp = 1e7;
    w.room!.kind = 'chefe';
    const boss = makeEnemy(w, 'couraca', 20, null, 0);
    boss.hp = 1;
    w.room!.enemies = [boss];
    w.hero.equip.arma = makeItem(w, 'espadao', 15, 'comum', '');
    let guard = 0;
    while (!w.bossesBeaten.includes(20) && guard++ < 300) step(w, []);
    expect(w.bossesBeaten).toContain(20);
    expect(w.exp!.bag.mats.esporos).toBeGreaterThanOrEqual(BALANCE.couracaSpores);
  });
});

describe('Ato III: vila, forja e save', () => {
  it('os níveis do ato pedem o material dele', () => {
    const w = createWorld(9);
    const at = (id: Parameters<typeof nextCost>[1], lvl: number) => {
      w.village.buildings[id] = lvl - 1;
      return nextCost(w, id)!;
    };
    expect(at('ferreiro', 3).mats).toEqual({ ferro: 45 });
    expect(at('ferreiro', 4).mats.ferro_negro).toBeGreaterThan(0);
    expect(at('ferreiro', 6).mats.esporos).toBeGreaterThan(0);
    w.village.buildings.ferreiro = 8;
    expect(nextCost(w, 'ferreiro')).toBeNull();
    expect(at('treinador', 2).mats.ferro_negro).toBe(30);
    expect(at('treinador', 3).mats).toEqual({ ossos: 90, esporos: 30 });
    expect(at('alquimista', 5).mats.esporos).toBe(30);
    expect(at('taticas', 5).mats.esporos).toBeGreaterThan(0);
  });

  it('a forja não põe o Imune numa peça abaixo do tier 11', () => {
    const w = createWorld(10);
    w.village.gold = 1e7;
    w.village.mats = { ossos: 1e4, ferro: 1e4, ferro_negro: 1e4, esporos: 1e4 };
    w.village.buildings.ferreiro = 5;
    w.hero.deepest = 20;
    expect(forge(w, 'couraca_placas', 'rara', 'imune')).toMatch(/tier 11/);
    w.village.buildings.ferreiro = 6;
    w.hero.deepest = 24;
    expect(forge(w, 'couraca_placas', 'rara', 'imune')).toBeNull();
  });

  it('migra um save v3 para a v4 (esporos, veneno e as regras do Ato III)', () => {
    const w = fungusRoom(['esporento']);
    const v3 = JSON.parse(JSON.stringify(w)) as Record<string, any>;
    v3.version = 3;
    delete v3.village.mats.esporos;
    delete v3.exp.bag.mats.esporos;
    for (const e of v3.room.enemies) {
      delete e.venom;
      delete e.venomUntil;
    }
    delete v3.hero.poison;
    delete v3.hero.rootUntil;
    v3.rules.combat = v3.rules.combat.filter((r: { skill: string | null }) => r.skill !== 'purificar' && r.skill !== 'golpe_giratorio');
    const body = JSON.stringify(v3);
    const back = deserialize(JSON.stringify({ v: 3, sum: checksum(body), body }));
    expect(back.version).toBe(SAVE_VERSION);
    expect(back.village.mats.esporos).toBe(0);
    expect(back.exp!.bag.mats.esporos).toBe(0);
    expect(back.hero.poison).toEqual([]);
    expect(back.room!.enemies[0]!.venom).toBe(0);
    expect(back.rules.combat.map((r) => r.skill)).toContain('purificar');
    expect(() => serialize(back)).not.toThrow();
  });
});

describe('Ato III: os monstros do Quaternius', () => {
  const manifest = JSON.parse(readFileSync('public/assets/kaykit/manifest.json', 'utf8')) as { files: { path: string }[] };
  const have = new Set(manifest.files.map((f) => f.path));

  it('todo arquivo dos inimigos está no manifesto da arte', () => {
    for (const f of enemyFiles()) expect(have.has(f), f).toBe(true);
  });

  it('cada clipe que o jogo pede existe no arquivo do monstro', () => {
    for (const { file, clips } of ownClipNeeds()) {
      const buf = readFileSync(`public/assets/kaykit/${file}`);
      const json = JSON.parse(buf.toString('utf8', 20, 20 + buf.readUInt32LE(12))) as { animations: { name: string }[] };
      const names = new Set(json.animations.map((a) => a.name.split('|').pop()));
      for (const c of clips) expect(names.has(c), `${file}: ${c}`).toBe(true);
    }
  });
});
