import { SKILLS, isBoss } from './data.ts';
import type { HeroStats } from './hero.ts';
import type { CondId, DescentRules, Enemy, Rule, SkillId, TargetPolicy, World } from './types.ts';

export interface Choice {
  kind: 'golpe' | 'habilidade' | 'pocao' | 'fuga';
  skill: SkillId | null;
}

/** Inimigos que o herói alcança agora: os que já chegaram no anel. */
export function inReach(w: World): Enemy[] {
  return w.room ? w.room.enemies.filter((e) => e.state === 'anel') : [];
}

export function inBack(w: World): Enemy[] {
  return w.room ? w.room.enemies.filter((e) => e.state === 'fundo') : [];
}

export function pickTarget(list: Enemy[], policy: TargetPolicy): Enemy | null {
  if (list.length === 0) return null;
  const by = (f: (e: Enemy) => number) => list.reduce((a, b) => (f(b) < f(a) ? b : a));
  if (policy === 'forte') return by((e) => -e.hp);
  if (policy === 'ferido') return by((e) => e.hp / e.maxHp);
  if (policy === 'elite') {
    const elites = list.filter((e) => e.elite || isBoss(e.kind));
    if (elites.length) return elites.reduce((a, b) => (b.hp < a.hp ? b : a));
  }
  return by((e) => e.hp);
}

export function ruleSlots(w: World): number {
  return 4 + w.village.buildings.taticas;
}

function condHolds(w: World, s: HeroStats, cond: CondId, param: number): boolean {
  const h = w.hero;
  switch (cond) {
    case 'vida_abaixo':
      return (h.hp / s.maxHp) * 100 < param;
    case 'anel_min':
      return inReach(w).length >= param;
    case 'fundo_min':
      return inBack(w).length >= param;
    case 'alvo_elite': {
      const t = pickTarget(inReach(w), w.rules.descent.target);
      return !!t && (!!t.elite || isBoss(t.kind));
    }
    case 'alvo_couraca': {
      const t = pickTarget(inReach(w), w.rules.descent.target);
      return !!t && t.armor > 0 && t.armorBreakUntil <= w.tick;
    }
    case 'pocoes_max':
      return h.potions <= param;
    case 'sempre':
      return true;
  }
}

export function skillReady(w: World, s: HeroStats, id: SkillId): boolean {
  const h = w.hero;
  const def = SKILLS[id];
  if (def.passive || !h.learned.includes(id) || !h.bar.includes(id)) return false;
  if ((h.cooldowns[id] ?? 0) > w.tick) return false;
  if (id === 'golpe_amplo' || id === 'grito') return inReach(w).length > 0;
  if (id === 'investida') return inBack(w).length > 0;
  if (id === 'segundo_folego') return h.hp < s.maxHp;
  // Golpe de Escudo pede escudo e alguém no anel; Quebra-Couraça, alguém de couraça inteira.
  if (id === 'golpe_escudo') return !!h.equip.secundaria && inReach(w).length > 0;
  if (id === 'quebra_couraca') return inReach(w).some((e) => e.armor > 0 && e.armorBreakUntil <= w.tick);
  return true;
}

function actionReady(w: World, s: HeroStats, r: Rule): Choice | null {
  const h = w.hero;
  if (r.action === 'pocao') return h.potions > 0 && w.tick >= h.potionReadyAt && h.hp < s.maxHp ? { kind: 'pocao', skill: null } : null;
  if (r.action === 'recuar') return { kind: 'fuga', skill: null };
  if (r.skill && skillReady(w, s, r.skill)) return { kind: 'habilidade', skill: r.skill };
  return null;
}

/** Lê as regras de cima para baixo; a primeira que vale e está pronta ganha. Senão, golpe básico. */
export function chooseAction(w: World, s: HeroStats): Choice | null {
  const rules = w.rules.combat.slice(0, ruleSlots(w));
  for (const r of rules) {
    if (!r.on) continue;
    if (!condHolds(w, s, r.cond, r.param)) continue;
    if (r.cond2 && !condHolds(w, s, r.cond2, r.param2)) continue;
    const c = actionReady(w, s, r);
    if (c) return c;
  }
  return inReach(w).length > 0 ? { kind: 'golpe', skill: null } : null;
}

export function defaultCombatRules(): Rule[] {
  return [
    { on: true, cond: 'vida_abaixo', param: 35, cond2: null, param2: 0, action: 'pocao', skill: null },
    { on: true, cond: 'vida_abaixo', param: 16, cond2: 'pocoes_max', param2: 0, action: 'recuar', skill: null },
    { on: true, cond: 'anel_min', param: 2, cond2: null, param2: 0, action: 'habilidade', skill: 'golpe_amplo' },
    { on: true, cond: 'fundo_min', param: 1, cond2: null, param2: 0, action: 'habilidade', skill: 'investida' },
    { on: true, cond: 'vida_abaixo', param: 50, cond2: null, param2: 0, action: 'habilidade', skill: 'segundo_folego' },
    { on: true, cond: 'anel_min', param: 3, cond2: null, param2: 0, action: 'habilidade', skill: 'grito' },
    ...actTwoRules(),
  ];
}

/** As regras de fábrica do Ato II (valem com o Salão de Táticas nos níveis 3 e 4). */
export function actTwoRules(): Rule[] {
  return [
    { on: true, cond: 'alvo_couraca', param: 0, cond2: null, param2: 0, action: 'habilidade', skill: 'quebra_couraca' },
    { on: true, cond: 'anel_min', param: 3, cond2: null, param2: 0, action: 'habilidade', skill: 'golpe_escudo' },
  ];
}

export function defaultDescentRules(): DescentRules {
  return {
    startFloor: 1,
    mode: 'sem_limite',
    untilFloor: 3,
    returnBagFull: true,
    returnNoPotionsBelow: 30,
    repeat: true,
    waitWound: true,
    fetchRemains: true,
    target: 'elite',
  };
}

export const COND_NAMES: Record<CondId, string> = {
  vida_abaixo: 'Vida abaixo de',
  anel_min: 'Inimigos no anel, pelo menos',
  fundo_min: 'Inimigos no fundo, pelo menos',
  alvo_elite: 'Alvo é elite ou chefe',
  alvo_couraca: 'Alvo com couraça inteira',
  pocoes_max: 'Poções restantes, no máximo',
  sempre: 'Sempre',
};
