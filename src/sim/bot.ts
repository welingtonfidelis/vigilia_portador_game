/**
 * Jogador automático: o "jogador médio" do balanceador. Usa as regras de fábrica, veste a melhor peça,
 * aprende habilidades, constrói o prédio mais barato que dá e aprimora a arma quando sobra ouro.
 */
import { BALANCE, actOf, isBossFloor } from './config.ts';
import { BASES, BUILDING_IDS, SKILLS } from './data.ts';
import { equip, learn, sell, setBar } from './commands.ts';
import { powerRatio } from './hero.ts';
import { affixPool, base, forgeCap, itemValue } from './items.ts';
import type { Cost } from './data.ts';
import type { AffixId, BuildingId, Material, SkillId, Slot, World } from './types.ts';
import { build, forge, forgeCost, lacking, nextCost, reforge, reforgeCost, upgrade } from './village.ts';

const SKILL_ORDER: SkillId[] = [
  'golpe_amplo', 'investida', 'pele_de_ferro', 'segundo_folego', 'sede_de_sangue', 'grito',
  'quebra_couraca', 'mao_pesada', 'pele_umida', 'golpe_escudo',
  'purificar', 'golpe_giratorio', 'sangue_amargo', 'folego_mineiro',
];

/** Força mínima para o bot enfrentar um chefe que ainda não venceu. */
const BOSS_READY = 0.95;
/** Força abaixo da qual o bot não desce (fundo demais para ele). */
const RUSH_LIMIT = 0.6;

/** O que cura ou encurta o veneno (o bot "sem antídoto" não usa). */
const POISON_ANSWERS: SkillId[] = ['purificar', 'sangue_amargo'];

/**
 * O balanceador também joga sem perfuração, para medir o peso dela no Ato II, e sem resposta ao
 * veneno (sem Purificar, Sangue Amargo, Imune nem o alquimista 5), para medir o peso dele no Ato III.
 */
export interface BotOptions {
  noPierce?: boolean;
  noAntidote?: boolean;
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
      if (o.noAntidote && item.affixes.includes('imune')) continue;
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

/** O treinador do ato ainda falta (do Ato II em diante: no I, ele é só mais uma obra barata). */
function coachPending(w: World): boolean {
  const act = actOf(w.hero.deepest);
  return act >= 2 && w.village.buildings.treinador < act && !!nextCost(w, 'treinador');
}

/**
 * Enquanto o treinador do ato não sobe, o material do ato (ferro-negro nas Minas, esporos nos Fungos)
 * fica guardado para ele: as outras obras que pedem esse material esperam.
 */
function savingFor(w: World, id: BuildingId, c: Cost): boolean {
  if (id === 'treinador' || !coachPending(w)) return false;
  const coach = nextCost(w, 'treinador')!;
  return Object.entries(coach.mats).some(([m, n]) => m !== 'ossos' && (n ?? 0) > 0 && (c.mats[m as Material] ?? 0) > 0);
}

/**
 * O treinador do ato em que o herói está primeiro (as habilidades novas são a resposta ao problema do
 * ato), depois o ferreiro (a porta dos itens); senão, o prédio mais barato que dá.
 */
function cheapestBuild(w: World, o: BotOptions): BuildingId | null {
  const coach = nextCost(w, 'treinador');
  if (coach && coachPending(w) && !lacking(w, coach)) return 'treinador';
  const smith = nextCost(w, 'ferreiro');
  if (smith && !lacking(w, smith) && !savingFor(w, 'ferreiro', smith)) return 'ferreiro';
  let pick: BuildingId | null = null;
  let price = Infinity;
  for (const id of BUILDING_IDS) {
    if (o.noAntidote && id === 'alquimista' && w.village.buildings.alquimista >= 4) continue;
    const c = nextCost(w, id);
    if (c && savingFor(w, id, c)) continue;
    if (!c || lacking(w, c)) continue;
    if (c.gold < price) {
      price = c.gold;
      pick = id;
    }
  }
  return pick;
}

/** As 3 ativas da barra em cada ato, em ordem de preferência (o bot troca a barra quando o ato muda). */
const BAR_BY_ACT: SkillId[][] = [
  ['golpe_amplo', 'investida', 'segundo_folego', 'grito'],
  ['quebra_couraca', 'golpe_amplo', 'investida', 'golpe_escudo', 'segundo_folego'],
  ['purificar', 'golpe_giratorio', 'investida', 'golpe_amplo', 'segundo_folego'],
];

function fillBar(w: World, o: BotOptions): void {
  const h = w.hero;
  const wanted = BAR_BY_ACT[Math.min(actOf(h.deepest), BAR_BY_ACT.length) - 1]!.filter(
    (id) => h.learned.includes(id) && !(o.noPierce && id === 'quebra_couraca') && !(o.noAntidote && POISON_ANSWERS.includes(id)),
  );
  for (const id of BAR_BY_ACT[0]!) if (wanted.length < 3 && h.learned.includes(id) && !wanted.includes(id)) wanted.push(id);
  wanted.slice(0, 3).forEach((id, i) => {
    if (h.bar[i] !== id) setBar(w, i, id);
  });
}

/**
 * Como um jogador faria nos Fungos: as regras de Purificar e do Golpe Giratório sobem para logo depois
 * da poção e da fuga (no fim da lista, elas ficariam fora das vagas do Salão de Táticas).
 */
function raiseActThreeRules(w: World): void {
  const combat = w.rules.combat;
  for (const [k, id] of (['purificar', 'golpe_giratorio'] as SkillId[]).entries()) {
    if (!w.hero.learned.includes(id)) continue;
    const at = combat.findIndex((r) => r.skill === id);
    if (at < 0 || at === 2 + k) continue;
    const [rule] = combat.splice(at, 1);
    combat.splice(2 + k, 0, rule!);
  }
}

export function botTick(w: World, o: BotOptions = {}): void {
  if (w.phase !== 'vila') return;
  const h = w.hero;
  equipBest(w, o);
  for (const id of SKILL_ORDER) {
    if (h.skillPoints < 1) break;
    if (o.noPierce && (id === 'quebra_couraca' || id === 'mao_pesada')) continue;
    if (o.noAntidote && POISON_ANSWERS.includes(id)) continue;
    if (!h.learned.includes(id) && w.village.buildings.treinador >= SKILLS[id].act) learn(w, id);
  }
  fillBar(w, o);
  raiseActThreeRules(w);
  // Prioridade a cada visita: (1) subir o treinador do ato e o ferreiro, (2) forjar a peça rara que
  // mais aumenta a Força, (3) reforjar o afixo fraco da arma, (4) a obra mais barata, (5) aprimorar.
  const v = w.village;
  const coach = nextCost(w, 'treinador');
  if (!v.construction && coach && coachPending(w) && !lacking(w, coach)) build(w, 'treinador');
  const smith = nextCost(w, 'ferreiro');
  if (!v.construction && smith && !lacking(w, smith) && !savingFor(w, 'ferreiro', smith)) build(w, 'ferreiro');
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
      // Nos Fungos, o peitoral Imune.
      ...(h.deepest >= 21 && !o.noAntidote ? ([['peitoral', h.equip.peitoral?.base ?? 'couraca_placas', 'imune']] as [Slot, string, AffixId][]) : []),
      ['peitoral', h.equip.peitoral?.base ?? 'couraca_placas', 'robusto'],
      ['perneiras', h.equip.perneiras?.base ?? 'grevas_placas', 'robusto'],
      ['elmo', h.equip.elmo?.base ?? 'elmo_placas', 'robusto'],
      ['capa', h.equip.capa?.base ?? 'capa_cavaleiro', 'robusto'],
      ['amuleto', 'amuleto', 'robusto'],
    ];
    let best: { baseId: string; affix: AffixId; gain: number } | null = null;
    for (const [slot, baseId, affix] of options) {
      if (h.equip[slot]?.legend || !affixPool(cap).includes(affix)) continue;
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
    const id = cheapestBuild(w, o);
    if (id) build(w, id);
  }
  // Sobra de ouro: aprimora a peça vestida de menor tier (a forja e as obras são filas separadas,
  // então não espera a obra acabar).
  if (!w.village.forge) {
    const cands = Object.values(h.equip).filter((i) => !!i && i.tier < forgeCap(w));
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
  // Chefe ainda não vencido com a Força abaixo de 0,95: treina até o andar de cima em vez de morrer
  // nele de novo (os chefes pedem mais que o grupo médio do andar, que é o que a Força mede).
  const d = w.rules.descent;
  const weakBoss = isBossFloor(h.deepest) && !w.bossesBeaten.includes(h.deepest) && powerRatio(w, h.deepest) < BOSS_READY;
  // E não desce aonde a Força cai abaixo de 0,6: sem isso, uma expedição de sorte abria seis andares
  // de uma vez e o herói passava horas alcançando o que tinha aberto.
  let until = d.startFloor;
  while (until < BALANCE.maxFloor && powerRatio(w, until + 1) >= RUSH_LIMIT) until++;
  if (weakBoss && h.deepest > 1) until = Math.min(until, h.deepest - 1);
  until = Math.max(d.startFloor, until);
  d.mode = until >= BALANCE.maxFloor ? 'sem_limite' : 'ate';
  d.untilFloor = until;
  // Saindo do andar mais fundo, segue com a mochila cheia (a pior peça derrete em ouro): voltar a cada
  // dez peças podia nunca deixar o herói terminar um andar de 8 salas e abrir o próximo.
  d.returnBagFull = d.startFloor < h.deepest;
}
