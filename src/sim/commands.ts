/** Ações do jogador. Cada uma devolve null (deu certo) ou o motivo em pt-BR. */
import { BALANCE } from './config.ts';
import { SKILLS } from './data.ts';
import { startDescent } from './expedition.ts';
import { canEquip, heroStats } from './hero.ts';
import { base, itemValue } from './items.ts';
import type { DescentRules, Rule, SimEvent, SkillId, Slot, World } from './types.ts';
import { build, forge, upgrade } from './village.ts';

function inVillage(w: World): string | null {
  return w.phase === 'vila' ? null : 'o herói precisa estar na vila';
}

/** Veste uma peça do baú; a que estava no encaixe volta para o baú. */
export function equip(w: World, itemId: number): string | null {
  const why = inVillage(w);
  if (why) return why;
  const v = w.village;
  const idx = v.stash.findIndex((i) => i.id === itemId);
  if (idx < 0) return 'a peça não está no baú';
  const item = v.stash[idx]!;
  const slot = base(item).slot;
  const h = w.hero;
  const next = { ...h.equip, [slot]: item };
  // Arma de duas mãos tira o escudo.
  if (slot === 'arma' && base(item).hands === 2 && next.secundaria) {
    v.stash.push(next.secundaria);
    delete next.secundaria;
  }
  if (!canEquip(next, item)) return 'não dá para usar escudo com arma de duas mãos';
  v.stash.splice(idx, 1);
  const old = h.equip[slot];
  if (old) v.stash.push(old);
  h.equip = next;
  h.hp = Math.min(h.hp, heroStats(w).maxHp);
  return null;
}

export function unequip(w: World, slot: Slot): string | null {
  const why = inVillage(w);
  if (why) return why;
  const item = w.hero.equip[slot];
  if (!item) return 'encaixe vazio';
  if (w.village.stash.length >= BALANCE.stashSize) return 'o baú está cheio';
  delete w.hero.equip[slot];
  w.village.stash.push(item);
  w.hero.hp = Math.min(w.hero.hp, heroStats(w).maxHp);
  return null;
}

export function sell(w: World, itemId: number): string | null {
  const v = w.village;
  const idx = v.stash.findIndex((i) => i.id === itemId);
  if (idx < 0) return 'a peça não está no baú';
  const [item] = v.stash.splice(idx, 1);
  v.gold += Math.round(itemValue(item!) / 2);
  return null;
}

export function learn(w: World, id: SkillId): string | null {
  const why = inVillage(w);
  if (why) return why;
  const h = w.hero;
  const def = SKILLS[id];
  if (h.learned.includes(id)) return 'já sabe';
  if (w.village.buildings.treinador < def.act) return `o treinador precisa do nível ${def.act}`;
  if (h.skillPoints < 1) return 'sem pontos de habilidade (ganhe um nível)';
  const gold = BALANCE.skillGold * def.act;
  if (w.village.gold < gold) return `faltam ${gold - w.village.gold} de ouro`;
  w.village.gold -= gold;
  h.skillPoints--;
  h.learned.push(id);
  if (!def.passive) {
    const free = h.bar.indexOf(null);
    if (free >= 0) h.bar[free] = id;
  }
  return null;
}

export function setBar(w: World, index: number, id: SkillId | null): string | null {
  const h = w.hero;
  if (index < 0 || index >= h.bar.length) return 'posição inválida';
  if (id && (!h.learned.includes(id) || SKILLS[id].passive)) return 'habilidade não aprendida';
  if (id) {
    const at = h.bar.indexOf(id);
    if (at >= 0) h.bar[at] = null;
  }
  h.bar[index] = id;
  return null;
}

export function setRules(w: World, combat: Rule[], descent: DescentRules): void {
  w.rules = { combat: combat.map((r) => ({ ...r })), descent: { ...descent } };
}

/** O sino: o herói volta no fim da luta atual. */
export function ringBell(w: World): string | null {
  if (!w.exp || w.phase === 'voltando' || w.phase === 'vila') return 'o herói não está descendo';
  w.exp.recall = true;
  return null;
}

export function descend(w: World, ev: SimEvent[]): string | null {
  if (w.phase !== 'vila') return 'o herói já está fora';
  return startDescent(w, ev) ? null : 'não deu para descer';
}

/** Segura o herói na vila (a tela de equipamento aberta, por exemplo). */
export function setHold(w: World, hold: boolean): void {
  w.hold = hold;
}

export const commands = { equip, unequip, sell, learn, setBar, setRules, ringBell, descend, setHold, build, forge, upgrade };
