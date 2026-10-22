/**
 * Jogador automático: o "jogador médio" do balanceador. Usa as regras de fábrica, veste a melhor peça,
 * aprende habilidades, constrói o prédio mais barato que dá e aprimora a arma quando sobra ouro.
 */
import { BALANCE, isBossFloor } from './config.ts';
import { BASES, BUILDING_IDS, SKILLS } from './data.ts';
import { equip, learn, sell } from './commands.ts';
import { powerRatio } from './hero.ts';
import { base, forgeCap, itemValue } from './items.ts';
import type { AffixId, BuildingId, SkillId, Slot, World } from './types.ts';
import { build, forge, forgeCost, lacking, nextCost, reforge, reforgeCost, upgrade } from './village.ts';

const SKILL_ORDER: SkillId[] = [
  'golpe_amplo', 'investida', 'pele_de_ferro', 'segundo_folego', 'sede_de_sangue', 'grito',
  'quebra_couraca', 'mao_pesada', 'pele_umida', 'golpe_escudo',
];

/** O balanceador também joga sem perfuração, para medir o peso dela no Ato II. */
export interface BotOptions {
  noPierce?: boolean;
}

/** Peça que fura a couraça (o bot sem perfuração não usa). */
function pierces(item: { base: string; affixes: AffixId[] }): boolean {
  return !!BASES[item.base]?.pierce || item.affixes.includes('perfurante');
}

function equipBest(w: World, o: BotOptions): void {
  const floor = w.hero.deepest;
  for (let guard = 0; guard < 12; guard++) {
    const now = powerRatio(w, floor);
    let best: { id: number; gain: number } | null = null;
    for (const item of w.village.stash) {
      if (o.noPierce && pierces(item)) continue;
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

/** O ferreiro primeiro (é a porta dos itens); senão, o prédio mais barato que dá. */
function cheapestBuild(w: World): BuildingId | null {
  const smith = nextCost(w, 'ferreiro');
  if (smith && !lacking(w, smith)) return 'ferreiro';
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

export function botTick(w: World, o: BotOptions = {}): void {
  if (w.phase !== 'vila') return;
  const h = w.hero;
  equipBest(w, o);
  for (const id of SKILL_ORDER) {
    if (h.skillPoints < 1) break;
    if (o.noPierce && (id === 'quebra_couraca' || id === 'mao_pesada')) continue;
    if (!h.learned.includes(id) && w.village.buildings.treinador >= SKILLS[id].act) learn(w, id);
  }
  // Prioridade a cada visita: (1) subir o ferreiro, (2) forjar a peça rara que mais aumenta a Força,
  // (3) reforjar o afixo fraco da arma, (4) a obra mais barata, (5) aprimorar.
  const v = w.village;
  const smith = nextCost(w, 'ferreiro');
  if (!v.construction && smith && !lacking(w, smith)) build(w, 'ferreiro');
  if (!v.forge && v.buildings.ferreiro >= 2) {
    const cap = forgeCap(w);
    const floor = h.deepest;
    const now = powerRatio(w, floor);
    const options: [Slot, string, AffixId][] = [
      ['arma', h.equip.arma?.base ?? 'espada', 'brutal'],
      ['arma', h.equip.arma?.base ?? 'espada', 'afiado'],
      // Nas Minas, as armas que furam a couraça.
      ...(h.deepest >= 11 && !o.noPierce
        ? ([['arma', 'martelo', 'brutal'], ['arma', 'martelo', 'perfurante'], ['arma', h.equip.arma?.base ?? 'espada', 'perfurante']] as [Slot, string, AffixId][])
        : []),
      ...(h.deepest >= 13 && !o.noPierce ? ([['arma', 'alabarda', 'brutal']] as [Slot, string, AffixId][]) : []),
      ['peitoral', h.equip.peitoral?.base ?? 'couraca_placas', 'robusto'],
      ['perneiras', h.equip.perneiras?.base ?? 'grevas_placas', 'robusto'],
      ['elmo', h.equip.elmo?.base ?? 'elmo_placas', 'robusto'],
      ['capa', h.equip.capa?.base ?? 'capa_cavaleiro', 'robusto'],
      ['amuleto', 'amuleto', 'robusto'],
    ];
    let best: { baseId: string; affix: AffixId; gain: number } | null = null;
    for (const [slot, baseId, affix] of options) {
      if (h.equip[slot]?.legend) continue;
      const trial = { ...h.equip, [slot]: { id: -1, base: baseId, tier: cap, rarity: 'rara' as const, affixes: [affix], origin: '' } };
      const gain = powerRatio(w, floor, trial) / now - 1;
      if (gain >= 0.03 && (!best || gain > best.gain)) best = { baseId, affix, gain };
    }
    if (best && !lacking(w, forgeCost(cap, 'rara', best.affix))) forge(w, best.baseId, 'rara', best.affix);
  }
  // Com o ferreiro 3 e ouro sobrando, troca o afixo fraco da arma (Afortunado, Sereno ou Guardião).
  const weapon = h.equip.arma;
  const weak = weapon && !weapon.legend ? weapon.affixes.findIndex((a) => a === 'afortunado' || a === 'sereno' || a === 'guardiao') : -1;
  if (!v.forge && v.buildings.ferreiro >= 3 && weapon && weak >= 0 && v.gold > 2 * reforgeCost(weapon.tier).gold && !lacking(w, reforgeCost(weapon.tier))) {
    reforge(w, weapon.id, weak);
  }
  if (!v.construction) {
    const id = cheapestBuild(w);
    if (id) build(w, id);
  }
  // Sobra de ouro: aprimora a peça de menor tier entre arma e peitoral (a forja e as obras são filas
  // separadas, então não espera a obra acabar).
  if (!w.village.forge) {
    const cands = [h.equip.arma, h.equip.peitoral, h.equip.perneiras].filter((i) => !!i && i.tier < forgeCap(w));
    const target = cands.sort((a, b) => a!.tier - b!.tier)[0];
    if (target && !lacking(w, forgeCost(target.tier + 1, 'comum'))) upgrade(w, target.id);
  }
  while (w.village.stash.length > 16) {
    const worst = w.village.stash.reduce((a, b) => (itemValue(b) < itemValue(a) ? b : a));
    sell(w, worst.id);
  }
  // Desce até o andar mais fundo em que a "Força" da tela de equipamento chega a 1 (morrer custa
  // caro: a mochila volta pela metade ou menos); depois de morrer no mais fundo, um andar acima.
  let start = h.deepest;
  while (start > 1 && powerRatio(w, start) < 1) start--;
  const died = w.report?.died && w.report.floor >= h.deepest - 1;
  w.rules.descent.startFloor = Math.max(1, Math.min(start, h.deepest - (died ? 1 : 0)));
  // Chefe ainda não vencido com a Força abaixo de 0,8 ("fundo demais" na tela): treina até o andar
  // de cima em vez de morrer nele de novo.
  const d = w.rules.descent;
  const weakBoss = isBossFloor(h.deepest) && !w.bossesBeaten.includes(h.deepest) && powerRatio(w, h.deepest) < BALANCE.fetchMinRatio;
  d.mode = weakBoss && h.deepest > 1 ? 'ate' : 'sem_limite';
  d.untilFloor = h.deepest - 1;
}
