/** Descida, salas, saque, volta, morte, rolagem do que volta e restos (docs/VIGILIA-PORTADOR.md §2.1 e §2.10). */
import { chronicle } from './chronicle.ts';
import { BALANCE, floorPower, isBossFloor, roomsOnFloor } from './config.ts';
import { spawnGroup, stepFight } from './combat.ts';
import { ENEMIES, isBoss } from './data.ts';
import { gainXp, heroStats } from './hero.ts';
import { addLoot, dropItem, emptyLoot, itemName, itemValue, jitter, lootValue, makeLegend } from './items.ts';
import { chance, int, rand, weighted } from './rng.ts';
import type { Enemy, Item, Loot, Rarity, ReturnReport, RoomKind, SimEvent, World } from './types.ts';

/** A primeira vitória em cada chefe deixa a lendária dele: o elmo do Capitão, a espada do Senhor. */
const LEGEND_BY_BOSS_FLOOR: Record<number, string> = { 5: 'coroa_capitao', 10: 'vigia_partida' };

export function roomKind(w: World, floor: number, index: number): RoomKind {
  if (index === roomsOnFloor(floor) - 1 && isBossFloor(floor)) return 'chefe';
  // A antessala do chefe é sempre um santuário: um fôlego antes da luta grande.
  if (index === roomsOnFloor(floor) - 2 && isBossFloor(floor)) return 'santuario';
  if (index === 0) return 'combate';
  return weighted(w, [
    ['combate', 62],
    ['elite', 15],
    ['bau', 10],
    ['prisioneiro', 8],
    ['santuario', 5],
  ] as const);
}

/** Peça nova na mochila; cheia, a pior derrete em ouro. */
function bagItem(w: World, item: Item, ev: SimEvent[]): void {
  const bag = w.exp!.bag;
  bag.items.push(item);
  ev.push({ t: 'saque', tick: w.tick, text: itemName(item) });
  if (bag.items.length > BALANCE.bagSize) {
    const worst = bag.items.reduce((a, b) => (itemValue(b) < itemValue(a) ? b : a));
    bag.items.splice(bag.items.indexOf(worst), 1);
    bag.gold += Math.round(itemValue(worst) / 2);
  }
}

function onKill(w: World, e: Enemy, ev: SimEvent[]): void {
  const exp = w.exp!;
  const floor = w.room!.floor;
  const d = ENEMIES[e.kind];
  const s = heroStats(w);
  const p = floorPower(floor);
  exp.kills++;
  w.stats.kills++;
  // Quem o Senhor ergueu dos mortos não dá saque de novo.
  if (e.revived) return;
  exp.bag.gold += jitter(w, d.gold * p * (e.elite ? 2 : 1));
  exp.bag.mats.ossos += int(w, d.bones[0], d.bones[1]);
  // O guerreiro deixa ferro velho da armadura.
  if (e.kind === 'guerreiro' && chance(w, 0.3)) exp.bag.mats.ferro += 1;
  if (gainXp(w, Math.round(d.xp * Math.pow(p, 0.8) * (e.elite ? 2.5 : 1)))) {
    chronicle(w, `${w.hero.name} chegou ao nível ${w.hero.level}.`, 'bom', ev);
  }
  if (isBoss(e.kind)) {
    exp.bag.mats.ferro += 10;
    exp.bag.people += 2;
    const first = !w.bossesBeaten.includes(floor);
    if (first) {
      w.bossesBeaten.push(floor);
      w.stats.bossFirst[String(floor)] = w.tick;
      const legend = LEGEND_BY_BOSS_FLOOR[floor];
      if (legend) {
        const item = makeLegend(w, legend, Math.ceil(floor / 2), `${d.name}, andar ${floor}`);
        bagItem(w, item, ev);
        chronicle(w, `${d.name} caiu no andar ${floor}. Nos ossos dele, ${itemName(item)}.`, 'lenda', ev);
      }
    }
    bagItem(w, dropItem(w, floor, 'epica', s.luck), ev);
    return;
  }
  const p0 = (e.elite ? BALANCE.eliteItemChance : BALANCE.itemChance[e.kind] ?? 0) + s.luck * BALANCE.luckItemChance;
  if (chance(w, p0)) bagItem(w, dropItem(w, floor, e.elite ? 'rara' : 'comum', s.luck), ev);
}

export function enterRoom(w: World, ev: SimEvent[]): void {
  const exp = w.exp!;
  const kind = roomKind(w, exp.floor, exp.room);
  const delay = BALANCE.enterTicks;
  w.room = {
    floor: exp.floor,
    index: exp.room,
    kind,
    enemies: spawnGroup(w, exp.floor, kind, delay),
    phase: 'entrando',
    phaseEnd: w.tick + delay,
    look: Math.floor(rand(w) * 1e9),
    fightStart: 0,
    fearUntil: 0,
    hpAtStart: w.hero.hp,
    phase2At: 0,
  };
  w.phase = 'sala';
  w.hero.action = null;
  ev.push({ t: 'salaNova', tick: w.tick, floor: exp.floor, room: exp.room, kind });
}

export function startDescent(w: World, ev: SimEvent[]): boolean {
  if (w.phase !== 'vila') return false;
  const r = w.rules.descent;
  let floor = Math.max(1, Math.min(r.startFloor, w.hero.deepest));
  if (r.fetchRemains && w.remains.length > 0) {
    const newest = w.remains[w.remains.length - 1]!;
    if (newest.floor <= w.hero.deepest) floor = newest.floor;
  }
  w.exp = { floor, room: 0, bag: emptyLoot(), started: w.tick, recall: false, leaving: null, kills: 0 };
  w.phase = 'descendo';
  w.phaseEnd = w.tick + BALANCE.descendTicks(floor);
  w.hero.action = null;
  w.stats.descents++;
  ev.push({ t: 'partiu', tick: w.tick, floor });
  return true;
}

function newReport(w: World, died: boolean, reason: string): ReturnReport {
  return {
    tick: w.tick, died, floor: w.exp!.floor, reason, brought: emptyLoot(), lost: null, rolls: [],
    remainsId: null, recovered: 0, woundTicks: 0, melted: 0,
  };
}

export function leave(w: World, reason: string, ev: SimEvent[]): void {
  const exp = w.exp!;
  exp.leaving = reason;
  w.pending = { ...newReport(w, false, reason), recovered: w.pending?.recovered ?? 0 };
  w.phase = 'voltando';
  w.carried = false;
  w.phaseEnd = w.tick + BALANCE.returnTicks(exp.floor);
  w.hero.action = null;
  ev.push({ t: 'aviso', tick: w.tick, text: `${w.hero.name} volta para a vila: ${reason}.`, tone: 'neutro' });
}

/** Chance de uma peça (ou da fração do ouro e dos materiais) voltar com o herói morto. */
export function returnChance(w: World, floor: number, rarity: Rarity | null): number {
  const s = heroStats(w);
  const c = BALANCE.deathBase
    - BALANCE.deathPerFloor * (floor - 1)
    + (rarity ? BALANCE.deathRarity[rarity]! : 0)
    + BALANCE.deathLuck * s.luck
    + BALANCE.deathCarter * w.village.buildings.carroceiro;
  return Math.max(BALANCE.deathMin, Math.min(BALANCE.deathMax, c));
}

function die(w: World, ev: SimEvent[]): void {
  const exp = w.exp!;
  const h = w.hero;
  const floor = exp.floor;
  const bag = exp.bag;
  const before = lootValue(bag);
  const report = newReport(w, true, `caiu no andar ${floor}`);
  report.recovered = w.pending?.recovered ?? 0;
  const brought: Loot = emptyLoot();
  const lost: Loot = emptyLoot();
  // Peças: uma rolagem por peça, tudo ou nada.
  for (const item of bag.items) {
    const c = returnChance(w, floor, item.rarity);
    const kept = rand(w) < c;
    report.rolls.push({ item, chance: c, kept });
    (kept ? brought : lost).items.push(item);
  }
  // Ouro e materiais: volta a fração, sem sorte.
  const frac = returnChance(w, floor, null);
  brought.gold = Math.floor(bag.gold * frac);
  lost.gold = bag.gold - brought.gold;
  for (const m of ['ossos', 'ferro'] as const) {
    brought.mats[m] = Math.floor(bag.mats[m] * frac);
    lost.mats[m] = bag.mats[m] - brought.mats[m];
  }
  // A gente resgatada foge na frente e chama o carroceiro: sempre volta.
  brought.people = bag.people;
  exp.bag = brought;
  const hasLoss = lost.items.length > 0 || lost.gold > 0 || lost.mats.ossos > 0 || lost.mats.ferro > 0;
  if (hasLoss) {
    const carter = w.village.buildings.carroceiro;
    const pile = {
      id: w.nextId++, floor, room: exp.room, loot: lost, created: w.tick,
      expires: w.tick + (BALANCE.remainsDays + carter) * BALANCE.dayTicks,
    };
    w.remains.push(pile);
    w.stats.remainsCreated++;
    report.remainsId = pile.id;
    report.lost = lost;
    while (w.remains.length > BALANCE.remainsMax) {
      const old = w.remains.shift()!;
      chronicle(w, `Os restos do andar ${old.floor} se perderam: a cripta cobriu tudo.`, 'ruim', ev);
    }
  }
  // Ferimento: sara só na vila.
  const healer = w.village.buildings.curandeira;
  const total = Math.round((BALANCE.woundBase + BALANCE.woundPerFloor * floor) * Math.max(0.25, 1 - BALANCE.woundHealerCut * healer));
  h.wound = { total, left: Math.max(total, h.wound?.left ?? 0) };
  report.woundTicks = total;
  h.hp = 0;
  h.action = null;
  w.stats.deaths++;
  w.stats.bagValueAtDeath += before;
  w.stats.lostValueAtDeath += lootValue(lost);
  w.pending = report;
  w.phase = 'voltando';
  w.carried = true;
  w.phaseEnd = w.tick + Math.round(BALANCE.returnTicks(floor) * BALANCE.carriedMult);
  ev.push({ t: 'heroiMorre', tick: w.tick });
  const lostText = lost.items.length ? `; ${lost.items.length} peça(s) ficaram no chão` : '';
  chronicle(w, `${h.name} caiu no andar ${floor}, sala ${exp.room + 1}${lostText}.`, 'ruim', ev);
}

function arrive(w: World, ev: SimEvent[]): void {
  const exp = w.exp!;
  const v = w.village;
  const h = w.hero;
  const bag = exp.bag;
  const report = w.pending ?? newReport(w, false, 'voltou');
  v.gold += bag.gold;
  v.mats.ossos += bag.mats.ossos;
  v.mats.ferro += bag.mats.ferro;
  if (bag.people > 0) {
    v.people += bag.people;
    chronicle(w, `${bag.people === 1 ? 'Uma pessoa resgatada chegou' : `${bag.people} pessoas resgatadas chegaram`} à vila.`, 'bom', ev);
  }
  for (const item of bag.items) {
    if (v.stash.length < BALANCE.stashSize) v.stash.push(item);
    else {
      v.gold += Math.round(itemValue(item) / 2);
      report.melted++;
    }
  }
  report.brought = bag;
  report.tick = w.tick;
  w.report = report;
  w.pending = null;
  if (h.hp <= 0) h.hp = 1;
  // Repõe as poções com o ouro da vila.
  const s = heroStats(w);
  while (h.potions < s.potionsMax && v.gold >= BALANCE.potionPrice) {
    v.gold -= BALANCE.potionPrice;
    h.potions++;
  }
  w.phase = 'vila';
  w.exp = null;
  w.room = null;
  w.carried = false;
  ev.push({ t: 'voltou', tick: w.tick, died: report.died });
}

/** Restos naquela sala daquele andar voltam para a mochila. */
function recoverRemains(w: World, ev: SimEvent[]): void {
  const exp = w.exp!;
  for (let i = w.remains.length - 1; i >= 0; i--) {
    const r = w.remains[i]!;
    if (r.floor !== exp.floor || r.room !== exp.room) continue;
    addLoot(exp.bag, r.loot);
    w.remains.splice(i, 1);
    w.stats.remainsRecovered++;
    w.pending = { ...(w.pending ?? newReport(w, false, '')), recovered: (w.pending?.recovered ?? 0) + 1 };
    const what = r.loot.items.length ? r.loot.items.map(itemName).join(', ') : `${r.loot.gold} de ouro`;
    ev.push({ t: 'restos', tick: w.tick, text: what });
    chronicle(w, `${w.hero.name} achou os próprios restos no andar ${r.floor}: ${what}.`, 'bom', ev);
  }
}

function roomCleared(w: World, ev: SimEvent[]): void {
  const room = w.room!;
  const exp = w.exp!;
  const s = heroStats(w);
  w.stats.rooms++;
  if (room.kind !== 'santuario') {
    const ticks = w.tick - room.fightStart;
    w.stats.fightTicks += ticks;
    w.stats.maxFightTicks = Math.max(w.stats.maxFightTicks, ticks);
    if (room.kind === 'chefe') {
      w.stats.bossFightTicks += ticks;
      w.stats.bossFights++;
      if (room.enemies.some((e) => e.kind === 'senhor')) {
        w.stats.senhorFights++;
        w.stats.senhorFightTicks += ticks;
        w.stats.senhorPhase2Frac += room.phase2At && ticks > 0 ? (room.phase2At - room.fightStart) / ticks : 1;
      }
    } else if (room.kind === 'combate') {
      w.stats.roomDamageFrac += Math.max(0, room.hpAtStart - w.hero.hp) / s.maxHp;
      w.stats.roomDamageCount++;
    }
  }
  if (room.kind === 'bau') {
    exp.bag.gold += jitter(w, 20 * floorPower(room.floor));
    exp.bag.mats.ferro += int(w, 3, 6);
    const legendary = room.floor >= 6 && chance(w, 0.03) && !hasItemAnywhere(w, 'juramento_ferro');
    bagItem(w, legendary ? makeLegend(w, 'juramento_ferro', Math.ceil(room.floor / 2), `Baú do andar ${room.floor}`) : dropItem(w, room.floor, 'rara', s.luck), ev);
  }
  if (room.kind === 'prisioneiro') {
    exp.bag.people += 1;
    ev.push({ t: 'aviso', tick: w.tick, text: 'Um prisioneiro foi libertado e segue o herói.', tone: 'bom' });
  }
  recoverRemains(w, ev);
  room.phase = 'saque';
  // Seguindo, ele ainda atravessa a sala até a porta do fundo; voltando, a volta tem a própria saída.
  room.exitTo = leaveReason(w) ? 'volta' : 'fundo';
  room.phaseEnd = w.tick + BALANCE.lootTicks + (room.exitTo === 'fundo' ? BALANCE.roomExitTicks : 0);
  ev.push({ t: 'salaLimpa', tick: w.tick });
}

function hasItemAnywhere(w: World, legend: string): boolean {
  const all = [...Object.values(w.hero.equip), ...w.village.stash, ...(w.exp?.bag.items ?? []), ...w.remains.flatMap((r) => r.loot.items)];
  return all.some((i) => i?.legend === legend);
}

/**
 * Por que o herói volta depois da sala atual (ou null, se segue). `floorEnd` diz que o motivo é o
 * fim do andar: aí o andar mais fundo sobe antes de ele voltar.
 */
export function leaveReason(w: World): { text: string; floorEnd: boolean } | null {
  const exp = w.exp!;
  const r = w.rules.descent;
  const h = w.hero;
  const s = heroStats(w);
  if (exp.recall) return { text: 'o sino tocou', floorEnd: false };
  if (r.returnBagFull && exp.bag.items.length >= BALANCE.bagSize) return { text: 'mochila cheia', floorEnd: false };
  if (r.returnNoPotionsBelow > 0 && h.potions === 0 && (h.hp / s.maxHp) * 100 < r.returnNoPotionsBelow) return { text: 'sem poções e ferido', floorEnd: false };
  if (exp.room + 1 >= roomsOnFloor(exp.floor)) {
    if (r.mode === 'ficar') return { text: `andar ${exp.floor} concluído`, floorEnd: true };
    if (r.mode === 'ate' && exp.floor >= r.untilFloor) return { text: 'chegou ao andar planejado', floorEnd: true };
    if (exp.floor >= BALANCE.maxFloor) return { text: 'fundo da cripta', floorEnd: true };
  }
  return null;
}

function nextRoom(w: World, ev: SimEvent[]): void {
  const exp = w.exp!;
  const h = w.hero;
  const why = leaveReason(w);
  if (why && !why.floorEnd) return leave(w, why.text, ev);
  exp.room++;
  if (exp.room >= roomsOnFloor(exp.floor)) {
    const reached = Math.min(BALANCE.maxFloor, exp.floor + 1);
    if (reached > h.deepest) {
      h.deepest = reached;
      w.stats.deepestAt[String(reached)] = w.tick;
      if (reached > exp.floor) chronicle(w, `${h.name} abriu caminho até o andar ${reached}.`, 'bom', ev);
    }
    if (why) return leave(w, why.text, ev);
    exp.floor++;
    exp.room = 0;
  }
  enterRoom(w, ev);
}

/** Um tick do herói fora da vila. */
export function stepExpedition(w: World, ev: SimEvent[]): void {
  if (w.phase === 'descendo') {
    if (w.tick >= w.phaseEnd) enterRoom(w, ev);
    return;
  }
  if (w.phase === 'voltando') {
    if (w.tick >= w.phaseEnd) arrive(w, ev);
    return;
  }
  if (w.phase !== 'sala' || !w.room) return;
  const room = w.room;
  if (room.phase === 'entrando') {
    if (w.tick < room.phaseEnd) return;
    room.phase = 'luta';
    room.fightStart = w.tick;
    room.hpAtStart = w.hero.hp;
    if (Object.values(w.hero.equip).some((i) => i?.legend === 'coroa_capitao')) room.fearUntil = w.tick + 50;
    if (room.kind === 'santuario') {
      const s = heroStats(w);
      w.hero.hp = Math.min(s.maxHp, w.hero.hp + s.maxHp * 0.5);
      w.hero.potions = Math.min(s.potionsMax, w.hero.potions + 1);
      ev.push({ t: 'cura', tick: w.tick, amount: Math.round(s.maxHp * 0.5) });
      roomCleared(w, ev);
    }
    return;
  }
  if (room.phase === 'luta') {
    const res = stepFight(w, ev, onKill);
    if (res === 'vitoria') roomCleared(w, ev);
    else if (res === 'morte') die(w, ev);
    else if (res === 'fuga') leave(w, 'fugiu da luta', ev);
    return;
  }
  if (room.phase === 'saque' && w.tick >= room.phaseEnd) nextRoom(w, ev);
}

