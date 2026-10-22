/**
 * Luta de uma sala: um herói contra um grupo, com o anel de contato (3 vagas de corpo a corpo),
 * golpes com preparação e impacto e as regras do jogador decidindo cada ação.
 */
import { BALANCE, floorPower } from './config.ts';
import { ENEMIES, SKILLS, isBoss } from './data.ts';
import { armorReduction, hasLegend, heroStats } from './hero.ts';
import type { HeroStats } from './hero.ts';
import { chance, int, pick } from './rng.ts';
import { chooseAction, inBack, inReach, pickTarget } from './rules.ts';
import type { EliteAffix, Enemy, EnemyKind, Room, RoomKind, SimEvent, World } from './types.ts';

export type FightResult = 'luta' | 'vitoria' | 'morte' | 'fuga';

/** Abate: o expedition.ts ouve e cuida de saque e experiência. */
export type KillHook = (w: World, e: Enemy, ev: SimEvent[]) => void;

export function makeEnemy(w: World, kind: EnemyKind, floor: number, elite: EliteAffix | null, delay: number): Enemy {
  const d = ENEMIES[kind];
  const p = floorPower(floor);
  const hp = Math.round(d.hp * p * (elite ? BALANCE.eliteHp : 1));
  const interval = Math.round(d.interval * (elite === 'veloz' ? 0.7 : 1));
  return {
    id: w.nextId++,
    kind,
    elite,
    hp,
    maxHp: hp,
    dmg: d.dmg * p * (elite ? BALANCE.eliteDmg : 1),
    interval,
    state: d.ranged ? 'fundo' : 'fila',
    slot: -1,
    arriveAt: 0,
    nextAttack: w.tick + delay + int(w, 0, interval),
    windup: null,
    stunUntil: 0,
    nextSpecial: w.tick + delay + (d.specialEvery ?? 0),
    diedAt: 0,
    phase: 1,
    revived: false,
  };
}

/** Grupo da sala: cresce com o andar; elite e chefe entram no começo da fila. */
export function spawnGroup(w: World, floor: number, kind: RoomKind, delay: number): Enemy[] {
  if (kind === 'santuario') return [];
  const n = kind === 'bau' ? 2 + Math.floor(floor / 4) : Math.min(BALANCE.groupMax, BALANCE.groupBase + Math.floor(floor / 2));
  const table: EnemyKind[] = ['lacaio', 'lacaio', 'lacaio', 'guerreiro'];
  if (floor >= 2) table.push('ladino', 'mago');
  if (floor >= 4) table.push('guerreiro', 'mago');
  const list: Enemy[] = [];
  // O andar 10 de cada ato é do Senhor da Cripta; o 5, do Capitão.
  if (kind === 'chefe') list.push(makeEnemy(w, floor % 10 === 0 ? 'senhor' : 'capitao', floor, null, delay));
  if (kind === 'elite') {
    const affix = pick(w, ['blindado', 'vampirico', 'furioso', 'veloz'] as const);
    list.push(makeEnemy(w, pick(w, ['guerreiro', 'ladino'] as const), floor, affix, delay));
  }
  const count = kind === 'chefe' ? Math.max(2, n - 2) : n;
  for (let i = 0; i < count; i++) list.push(makeEnemy(w, pick(w, table), floor, null, delay));
  return list;
}

function slotsUsed(room: Room): boolean[] {
  const used = [false, false, false];
  for (const e of room.enemies) {
    if ((e.state === 'chegando' || e.state === 'anel') && e.slot >= 0) {
      used[e.slot] = true;
      if (ENEMIES[e.kind].size === 2) used[e.slot + 1] = true;
    }
  }
  return used;
}

function freeSlot(used: boolean[], size: 1 | 2): number {
  for (let i = 0; i + size <= BALANCE.ringSlots; i++) {
    if (!used[i] && (size === 1 || !used[i + 1])) return i;
  }
  return -1;
}

/** Quem espera na porta entra quando abre vaga. Sem ninguém de corpo a corpo, o herói alcança o fundo. */
function fillRing(w: World, room: Room): void {
  const used = slotsUsed(room);
  for (const e of room.enemies) {
    if (e.state !== 'fila') continue;
    const size = ENEMIES[e.kind].size;
    const s = freeSlot(used, size);
    if (s < 0) break;
    e.state = 'chegando';
    e.slot = s;
    e.arriveAt = w.tick + BALANCE.approachTicks;
    used[s] = true;
    if (size === 2) used[s + 1] = true;
  }
  const melee = room.enemies.some((e) => e.state === 'fila' || e.state === 'chegando' || e.state === 'anel');
  if (!melee) {
    for (const e of room.enemies) {
      if (e.state !== 'fundo') continue;
      const size = ENEMIES[e.kind].size;
      const s = freeSlot(used, size);
      if (s < 0) break;
      e.state = 'chegando';
      e.slot = s;
      e.arriveAt = w.tick + BALANCE.approachTicks;
      used[s] = true;
      if (size === 2) used[s + 1] = true;
    }
  }
  for (const e of room.enemies) if (e.state === 'chegando' && w.tick >= e.arriveAt) e.state = 'anel';
}

function heroArmor(w: World, s: HeroStats): number {
  const low = w.hero.hp / s.maxHp < 0.3 && hasLegend(w.hero.equip, 'juramento_ferro');
  return s.armor * (low ? 1.4 : 1);
}

function hitHero(w: World, room: Room, e: Enemy, s: HeroStats, special: boolean, ev: SimEvent[]): void {
  const h = w.hero;
  let dmg = e.dmg * (special ? 2 : 1);
  if (e.elite === 'furioso' && e.hp < e.maxHp / 2) dmg *= 1.5;
  if (h.gritoUntil > w.tick && e.state === 'anel') dmg *= 0.65;
  if (room.fearUntil > w.tick) dmg *= 0.8;
  dmg *= 1 - armorReduction(heroArmor(w, s), room.floor);
  let blocked = false;
  if (s.block > 0 && e.state === 'anel' && chance(w, s.block)) {
    blocked = true;
    const stopped = dmg * BALANCE.blockReduce;
    dmg -= stopped;
    if (s.thorns > 0) e.hp -= stopped * s.thorns;
  }
  if (e.elite === 'vampirico') e.hp = Math.min(e.maxHp, e.hp + dmg * 0.3);
  h.hp -= dmg;
  ev.push({ t: 'heroiAcertado', tick: w.tick, enemy: e.id, dmg: Math.round(dmg), blocked });
}

function enemiesAct(w: World, room: Room, s: HeroStats, ev: SimEvent[]): void {
  for (const e of room.enemies) {
    if (e.state !== 'anel' && e.state !== 'fundo') continue;
    if (w.tick < e.stunUntil) {
      e.windup = null;
      continue;
    }
    if (e.windup) {
      if (w.tick >= e.windup.impact) {
        if (!e.windup.cast) hitHero(w, room, e, s, e.windup.special, ev);
        e.windup = null;
        if (w.hero.hp <= 0) return;
      }
      continue;
    }
    const d = ENEMIES[e.kind];
    const conjurer = e.kind === 'senhor' && e.phase === 1;
    if (d.specialEvery && w.tick >= e.nextSpecial && (e.state === 'anel' || conjurer)) {
      // Capitão e Senhor na fase 2: golpe com o dobro do dano. Senhor na fase 1: conjura reforço, sem dano.
      e.windup = { impact: w.tick + 15, special: true, cast: conjurer };
      e.nextSpecial = w.tick + (e.phase === 2 && d.phase2 ? d.phase2.specialEvery : d.specialEvery);
      e.nextAttack = w.tick + e.interval;
      ev.push({ t: 'inimigoGolpe', tick: w.tick, enemy: e.id, special: true });
      // Reforço (2 lacaios) quando sobra pouca escolta.
      if (e.kind === 'capitao' || conjurer) {
        const escort = room.enemies.filter((x) => x.state !== 'morto' && !isBoss(x.kind)).length;
        if (escort < 3) for (let i = 0; i < 2; i++) room.enemies.push(makeEnemy(w, 'lacaio', room.floor, null, 10));
      }
      continue;
    }
    if (w.tick >= e.nextAttack) {
      e.windup = { impact: w.tick + Math.max(2, Math.round(e.interval * BALANCE.windupFrac)), special: false };
      e.nextAttack = w.tick + e.interval;
      ev.push({ t: 'inimigoGolpe', tick: w.tick, enemy: e.id, special: false });
    }
  }
}

/**
 * Senhor da Cripta abaixo de metade da vida: grita, vem para o anel, bate mais forte e ergue até
 * 3 esqueletos mortos da sala com metade da vida (uma vez cada).
 */
function enterPhase2(w: World, room: Room, e: Enemy, ev: SimEvent[]): void {
  const p2 = ENEMIES.senhor.phase2!;
  const p = floorPower(room.floor);
  e.phase = 2;
  e.dmg = p2.dmg * p;
  e.interval = p2.interval;
  e.windup = null;
  e.stunUntil = w.tick + 15;
  e.nextAttack = w.tick + 15 + e.interval;
  e.nextSpecial = w.tick + 15 + p2.specialEvery;
  if (e.state === 'fundo') {
    e.state = 'fila';
    e.slot = -1;
  }
  room.phase2At = w.tick;
  ev.push({ t: 'fase', tick: w.tick, enemy: e.id });
  ev.push({ t: 'aviso', tick: w.tick, text: 'O Senhor da Cripta grita e ergue os mortos!', tone: 'ruim' });
  let raised = 0;
  for (const x of room.enemies) {
    if (raised >= 3) break;
    if (x.state !== 'morto' || x.revived || isBoss(x.kind)) continue;
    x.state = ENEMIES[x.kind].ranged ? 'fundo' : 'fila';
    x.hp = Math.round(x.maxHp / 2);
    x.revived = true;
    x.slot = -1;
    x.windup = null;
    x.stunUntil = w.tick + 20;
    x.nextAttack = w.tick + 20 + int(w, 0, x.interval);
    ev.push({ t: 'inimigoRevive', tick: w.tick, enemy: x.id });
    raised++;
  }
}

function damageEnemy(w: World, e: Enemy, raw: number, s: HeroStats, ev: SimEvent[], kill: KillHook): void {
  if (e.state === 'morto') return;
  let dmg = raw;
  const crit = chance(w, s.crit);
  if (crit) dmg *= BALANCE.critMult;
  let blocked = false;
  if (ENEMIES[e.kind].block > 0 && chance(w, ENEMIES[e.kind].block)) {
    dmg *= 1 - BALANCE.blockReduce;
    blocked = true;
  }
  if (e.elite === 'blindado') dmg *= 0.65;
  e.hp -= dmg;
  if (e.kind === 'senhor' && e.phase === 1 && e.hp > 0 && e.hp <= e.maxHp / 2) enterPhase2(w, w.room!, e, ev);
  if (s.lifesteal > 0) w.hero.hp = Math.min(s.maxHp, w.hero.hp + dmg * s.lifesteal);
  ev.push({ t: 'acerto', tick: w.tick, target: e.id, dmg: Math.round(dmg), crit, blocked });
  if (e.hp <= 0) {
    e.hp = 0;
    e.state = 'morto';
    e.slot = -1;
    e.windup = null;
    e.diedAt = w.tick;
    ev.push({ t: 'inimigoMorre', tick: w.tick, enemy: e.id });
    kill(w, e, ev);
  }
}

function applyAction(w: World, room: Room, s: HeroStats, ev: SimEvent[], kill: KillHook): void {
  const h = w.hero;
  const a = h.action!;
  const policy = w.rules.descent.target;
  if (a.kind === 'golpe') {
    let t = room.enemies.find((e) => e.id === a.target && e.state === 'anel') ?? pickTarget(inReach(w), policy);
    if (t) damageEnemy(w, t, s.dmg, s, ev, kill);
  } else if (a.kind === 'pocao') {
    const heal = s.maxHp * s.potionHeal;
    h.hp = Math.min(s.maxHp, h.hp + heal);
    ev.push({ t: 'cura', tick: w.tick, amount: Math.round(heal) });
  } else if (a.kind === 'habilidade' && a.skill) {
    if (a.skill === 'golpe_amplo') {
      const targets = [...inReach(w), ...(hasLegend(h.equip, 'vigia_partida') ? inBack(w) : [])];
      for (const t of targets) damageEnemy(w, t, s.dmg * 0.8, s, ev, kill);
    } else if (a.skill === 'investida') {
      const t = room.enemies.find((e) => e.id === a.target && e.state === 'fundo') ?? inBack(w)[0];
      if (t) {
        const used = slotsUsed(room);
        const free = freeSlot(used, ENEMIES[t.kind].size);
        if (free >= 0) {
          t.state = 'anel';
          t.slot = free;
        }
        t.stunUntil = w.tick + 15;
        t.windup = null;
        damageEnemy(w, t, s.dmg * 1.3, s, ev, kill);
      }
    } else if (a.skill === 'segundo_folego') {
      const heal = s.maxHp * 0.3;
      h.hp = Math.min(s.maxHp, h.hp + heal);
      ev.push({ t: 'cura', tick: w.tick, amount: Math.round(heal) });
    } else if (a.skill === 'grito') {
      h.gritoUntil = w.tick + 60;
    }
  }
}

function startAction(w: World, s: HeroStats, ev: SimEvent[]): void {
  const h = w.hero;
  const choice = chooseAction(w, s);
  if (!choice) return;
  const t = w.tick;
  if (choice.kind === 'golpe') {
    const target = pickTarget(inReach(w), w.rules.descent.target);
    const windup = Math.max(1, Math.round(s.interval * BALANCE.windupFrac));
    h.action = { kind: 'golpe', skill: null, target: target?.id ?? -1, start: t, impact: t + windup, end: t + s.interval, applied: false };
  } else if (choice.kind === 'pocao') {
    h.potions--;
    h.potionReadyAt = t + BALANCE.potionCooldown;
    h.action = { kind: 'pocao', skill: null, target: -1, start: t, impact: t + 4, end: t + 10, applied: false };
    ev.push({ t: 'pocao', tick: t });
  } else if (choice.kind === 'fuga') {
    h.action = { kind: 'fuga', skill: null, target: -1, start: t, impact: t + 15, end: t + 15, applied: false };
    ev.push({ t: 'fuga', tick: t });
  } else if (choice.skill) {
    const def = SKILLS[choice.skill];
    h.cooldowns[choice.skill] = t + def.cooldown;
    const target = choice.skill === 'investida' ? (inBack(w)[0]?.id ?? -1) : (pickTarget(inReach(w), w.rules.descent.target)?.id ?? -1);
    h.action = { kind: 'habilidade', skill: choice.skill, target, start: t, impact: t + def.windup, end: t + def.total, applied: false };
  }
  if (h.action && h.action.kind !== 'pocao' && h.action.kind !== 'fuga') {
    ev.push({ t: 'golpe', tick: t, skill: h.action.skill, target: h.action.target, end: h.action.end });
  }
}

/** Um tick de luta. */
export function stepFight(w: World, ev: SimEvent[], kill: KillHook): FightResult {
  const room = w.room!;
  const h = w.hero;
  const s = heroStats(w);
  fillRing(w, room);
  enemiesAct(w, room, s, ev);
  if (h.hp <= 0) {
    h.hp = 0;
    h.action = null;
    return 'morte';
  }
  if (h.action && !h.action.applied && w.tick >= h.action.impact) {
    h.action.applied = true;
    if (h.action.kind === 'fuga') {
      h.action = null;
      return 'fuga';
    }
    applyAction(w, room, s, ev, kill);
  }
  if (h.action && w.tick >= h.action.end) h.action = null;
  if (!h.action) startAction(w, s, ev);
  const alive = room.enemies.some((e) => e.state !== 'morto');
  if (!alive) {
    if (h.action?.kind === 'fuga') h.action = null;
    return 'vitoria';
  }
  return 'luta';
}

/** Para testes e para a tela: quantos inimigos ainda vivos e onde. */
export function roomCounts(room: Room): Record<string, number> {
  const c: Record<string, number> = {};
  for (const e of room.enemies) c[e.state] = (c[e.state] ?? 0) + 1;
  return c;
}

