/**
 * Jogador automático: o "jogador médio" do balanceador. Usa as regras de fábrica, veste a melhor peça,
 * aprende habilidades, constrói o prédio mais barato que dá e aprimora a arma quando sobra ouro.
 */
import { BUILDING_IDS, SKILLS } from './data.ts';
import { equip, learn, sell } from './commands.ts';
import { powerRatio } from './hero.ts';
import { base, forgeCap, itemValue } from './items.ts';
import type { BuildingId, SkillId, World } from './types.ts';
import { build, forgeCost, lacking, nextCost, upgrade } from './village.ts';

const SKILL_ORDER: SkillId[] = ['golpe_amplo', 'investida', 'pele_de_ferro', 'segundo_folego', 'sede_de_sangue', 'grito'];

function equipBest(w: World): void {
  const floor = w.hero.deepest;
  for (let guard = 0; guard < 12; guard++) {
    const now = powerRatio(w, floor);
    let best: { id: number; gain: number } | null = null;
    for (const item of w.village.stash) {
      const slot = base(item).slot;
      const trial = { ...w.hero.equip, [slot]: item };
      if (slot === 'arma' && base(item).hands === 2) delete trial.secundaria;
      if (slot === 'secundaria' && w.hero.equip.arma && base(w.hero.equip.arma).hands === 2) continue;
      const gain = powerRatio(w, floor, trial) - now;
      if (gain > 0.005 && (!best || gain > best.gain)) best = { id: item.id, gain };
    }
    if (!best || equip(w, best.id)) return;
  }
}

function cheapestBuild(w: World): BuildingId | null {
  let pick: BuildingId | null = null;
  let price = Infinity;
  for (const id of BUILDING_IDS) {
    const c = nextCost(w, id);
    if (!c || lacking(w, c)) continue;
    if (c.gold < price) {
      price = c.gold;
      pick = id;
    }
  }
  return pick;
}

export function botTick(w: World): void {
  if (w.phase !== 'vila') return;
  const h = w.hero;
  equipBest(w);
  for (const id of SKILL_ORDER) {
    if (h.skillPoints < 1) break;
    if (!h.learned.includes(id) && w.village.buildings.treinador >= SKILLS[id].act) learn(w, id);
  }
  if (!w.village.construction) {
    const id = cheapestBuild(w);
    if (id) build(w, id);
  }
  // Sobra de ouro: aprimora a peça de menor tier entre arma e peitoral.
  if (!w.village.forge && !w.village.construction) {
    const cands = [h.equip.arma, h.equip.peitoral, h.equip.perneiras].filter((i) => !!i && i.tier < forgeCap(w));
    const target = cands.sort((a, b) => a!.tier - b!.tier)[0];
    if (target && !lacking(w, forgeCost(target.tier + 1, 'comum'))) upgrade(w, target.id);
  }
  while (w.village.stash.length > 16) {
    const worst = w.village.stash.reduce((a, b) => (itemValue(b) < itemValue(a) ? b : a));
    sell(w, worst.id);
  }
  // Desce até o andar mais fundo em que a "Força" da tela de equipamento passa de 0,9; depois de
  // morrer no mais fundo, um andar acima.
  let start = h.deepest;
  while (start > 1 && powerRatio(w, start) < 0.9) start--;
  const died = w.report?.died && w.report.floor >= h.deepest - 1;
  w.rules.descent.startFloor = Math.max(1, Math.min(start, h.deepest - (died ? 1 : 0)));
}
