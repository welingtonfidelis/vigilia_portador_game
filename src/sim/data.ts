/** Dados puros: bases de itens, afixos, lendárias, inimigos, habilidades e prédios. */
import { BALANCE } from './config.ts';
import type { AffixId, BuildingId, EliteAffix, EnemyKind, Material, Rarity, SkillId, Slot, Weight } from './types.ts';

export interface BaseDef {
  id: string;
  name: string;
  /** Gênero e número para concordar os adjetivos. */
  g: 'm' | 'f';
  pl?: boolean;
  slot: Slot;
  weight: Weight;
  hands?: 1 | 2;
  /** Material do nome: metal (ferro, aço…) ou tecido (rústico, reforçado…). */
  stuff: 'metal' | 'tecido';
  dmg?: number;
  aps?: number;
  crit?: number;
  armor?: number;
  block?: number;
  thorns?: number;
  hpPct?: number;
  dmgPct?: number;
  potionPct?: number;
  speedPct?: number;
}

export const BASES: Record<string, BaseDef> = {
  espada: { id: 'espada', name: 'Espada', g: 'f', slot: 'arma', weight: 'nenhum', hands: 1, stuff: 'metal', dmg: 14, aps: 1.0 },
  machado: { id: 'machado', name: 'Machado', g: 'm', slot: 'arma', weight: 'nenhum', hands: 1, stuff: 'metal', dmg: 18, aps: 0.8 },
  adaga: { id: 'adaga', name: 'Adaga', g: 'f', slot: 'arma', weight: 'nenhum', hands: 1, stuff: 'metal', dmg: 9, aps: 1.5, crit: 0.05 },
  espadao: { id: 'espadao', name: 'Espadão', g: 'm', slot: 'arma', weight: 'nenhum', hands: 2, stuff: 'metal', dmg: 27, aps: 0.7 },
  machado_grande: { id: 'machado_grande', name: 'Machado grande', g: 'm', slot: 'arma', weight: 'nenhum', hands: 2, stuff: 'metal', dmg: 31, aps: 0.6 },
  escudo_redondo: { id: 'escudo_redondo', name: 'Escudo redondo', g: 'm', slot: 'secundaria', weight: 'medio', stuff: 'metal', armor: 4, block: 0.15 },
  escudo_torre: { id: 'escudo_torre', name: 'Escudo de torre', g: 'm', slot: 'secundaria', weight: 'pesado', stuff: 'metal', armor: 7, block: 0.22 },
  escudo_espinhos: { id: 'escudo_espinhos', name: 'Escudo de espinhos', g: 'm', slot: 'secundaria', weight: 'medio', stuff: 'metal', armor: 3, block: 0.12, thorns: 0.2 },
  elmo_placas: { id: 'elmo_placas', name: 'Elmo de placas', g: 'm', slot: 'elmo', weight: 'pesado', stuff: 'metal', armor: 6 },
  chapeu_urso: { id: 'chapeu_urso', name: 'Chapéu de urso', g: 'm', slot: 'elmo', weight: 'medio', stuff: 'tecido', armor: 4, dmgPct: 0.03 },
  elmo_osso: { id: 'elmo_osso', name: 'Elmo de osso', g: 'm', slot: 'elmo', weight: 'medio', stuff: 'metal', armor: 4 },
  chapeu_mago: { id: 'chapeu_mago', name: 'Chapéu de mago', g: 'm', slot: 'elmo', weight: 'leve', stuff: 'tecido', armor: 2, potionPct: 0.1 },
  couraca_placas: { id: 'couraca_placas', name: 'Couraça de placas', g: 'f', slot: 'peitoral', weight: 'pesado', stuff: 'metal', armor: 14 },
  gibao_couro: { id: 'gibao_couro', name: 'Gibão de couro', g: 'm', slot: 'peitoral', weight: 'medio', stuff: 'tecido', armor: 9 },
  colete_ladino: { id: 'colete_ladino', name: 'Colete de ladino', g: 'm', slot: 'peitoral', weight: 'leve', stuff: 'tecido', armor: 5, crit: 0.04 },
  tunica: { id: 'tunica', name: 'Túnica', g: 'f', slot: 'peitoral', weight: 'leve', stuff: 'tecido', armor: 3, hpPct: 0.08 },
  grevas_placas: { id: 'grevas_placas', name: 'Grevas de placas', g: 'f', pl: true, slot: 'perneiras', weight: 'pesado', stuff: 'metal', armor: 7 },
  calcas_couro: { id: 'calcas_couro', name: 'Calças de couro', g: 'f', pl: true, slot: 'perneiras', weight: 'medio', stuff: 'tecido', armor: 5 },
  botas_leves: { id: 'botas_leves', name: 'Botas leves', g: 'f', pl: true, slot: 'perneiras', weight: 'leve', stuff: 'tecido', armor: 3, speedPct: 0.04 },
  capa_cavaleiro: { id: 'capa_cavaleiro', name: 'Capa do cavaleiro', g: 'f', slot: 'capa', weight: 'nenhum', stuff: 'tecido', hpPct: 0.06 },
  capa_patrulheiro: { id: 'capa_patrulheiro', name: 'Capa do patrulheiro', g: 'f', slot: 'capa', weight: 'nenhum', stuff: 'tecido', crit: 0.03 },
  manto: { id: 'manto', name: 'Manto', g: 'm', slot: 'capa', weight: 'nenhum', stuff: 'tecido', potionPct: 0.12 },
  amuleto: { id: 'amuleto', name: 'Amuleto', g: 'm', slot: 'amuleto', weight: 'nenhum', stuff: 'metal' },
};

export const SLOTS: Slot[] = ['arma', 'secundaria', 'elmo', 'peitoral', 'perneiras', 'capa', 'amuleto'];

export const SLOT_NAMES: Record<Slot, string> = {
  arma: 'Arma',
  secundaria: 'Mão secundária',
  elmo: 'Elmo',
  peitoral: 'Peitoral',
  perneiras: 'Perneiras',
  capa: 'Capa',
  amuleto: 'Amuleto',
};

export interface AffixDef {
  id: AffixId;
  name: string;
  /** Material que a forja gasta para pôr este afixo. */
  mat: 'ossos' | 'ferro' | 'ambos';
  /** Adjetivo: [m, f, m pl, f pl]. */
  adj: [string, string, string, string];
  value: number;
  desc: (v: number) => string;
}

const pct = (v: number) => `${Math.round(v * 100)}%`;

export const AFFIXES: Record<AffixId, AffixDef> = {
  afiado: { id: 'afiado', name: 'Afiado', mat: 'ossos', adj: ['afiado', 'afiada', 'afiados', 'afiadas'], value: 0.04, desc: (v) => `+${pct(v)} de crítico` },
  brutal: { id: 'brutal', name: 'Brutal', mat: 'ferro', adj: ['brutal', 'brutal', 'brutais', 'brutais'], value: 0.08, desc: (v) => `+${pct(v)} de dano` },
  veloz: { id: 'veloz', name: 'Veloz', mat: 'ossos', adj: ['veloz', 'veloz', 'velozes', 'velozes'], value: 0.07, desc: (v) => `+${pct(v)} de velocidade de ataque` },
  robusto: { id: 'robusto', name: 'Robusto', mat: 'ossos', adj: ['robusto', 'robusta', 'robustos', 'robustas'], value: 0.08, desc: (v) => `+${pct(v)} de vida máxima` },
  guardiao: { id: 'guardiao', name: 'Guardião', mat: 'ferro', adj: ['guardião', 'guardiã', 'guardiões', 'guardiãs'], value: 4, desc: (v) => `+${Math.round(v)} de armadura` },
  sanguessuga: { id: 'sanguessuga', name: 'Sanguessuga', mat: 'ambos', adj: ['sanguessuga', 'sanguessuga', 'sanguessugas', 'sanguessugas'], value: 0.03, desc: (v) => `cura ${pct(v)} do dano causado` },
  afortunado: { id: 'afortunado', name: 'Afortunado', mat: 'ferro', adj: ['afortunado', 'afortunada', 'afortunados', 'afortunadas'], value: 5, desc: (v) => `+${Math.round(v)} de sorte` },
  sereno: { id: 'sereno', name: 'Sereno', mat: 'ossos', adj: ['sereno', 'serena', 'serenos', 'serenas'], value: 0.15, desc: (v) => `+${pct(v)} de cura das poções` },
};

export const AFFIX_IDS = Object.keys(AFFIXES) as AffixId[];

export interface LegendDef {
  id: string;
  name: string;
  base: string;
  affixes: AffixId[];
  effect: string;
}

export const LEGENDS: Record<string, LegendDef> = {
  vigia_partida: { id: 'vigia_partida', name: 'Vigia Partida', base: 'espada', affixes: ['brutal', 'afiado', 'sanguessuga'], effect: 'Golpe Amplo atinge também quem está no fundo da sala.' },
  coroa_capitao: { id: 'coroa_capitao', name: 'Coroa do Capitão', base: 'elmo_osso', affixes: ['guardiao', 'robusto', 'afortunado'], effect: 'Ao entrar na sala, os inimigos tremem: −20% de dano por 5 s.' },
  juramento_ferro: { id: 'juramento_ferro', name: 'Juramento de Ferro', base: 'couraca_placas', affixes: ['robusto', 'guardiao', 'sereno'], effect: 'Abaixo de 30% de vida, +40% de armadura.' },
};

export const RARITY_NAMES: Record<Rarity, string> = { comum: 'Comum', rara: 'Rara', epica: 'Épica', lendaria: 'Lendária' };
export const RARITY_AFFIXES: Record<Rarity, number> = { comum: 0, rara: 1, epica: 2, lendaria: 3 };

/** Nome do material pela faixa de tier (a mesma faixa da cor no 3D). */
export const METAL_BANDS = ['ferro', 'aço', 'bronze', 'ferro-negro', 'ouro'];
export const CLOTH_BANDS: [string, string, string, string][] = [
  ['rústico', 'rústica', 'rústicos', 'rústicas'],
  ['reforçado', 'reforçada', 'reforçados', 'reforçadas'],
  ['fino', 'fina', 'finos', 'finas'],
  ['nobre', 'nobre', 'nobres', 'nobres'],
  ['régio', 'régia', 'régios', 'régias'],
];

export function tierBand(tier: number): number {
  return Math.min(4, Math.floor((tier - 1) / 2));
}

export interface EnemyDef {
  kind: EnemyKind;
  name: string;
  hp: number;
  dmg: number;
  interval: number;
  ranged: boolean;
  size: 1 | 2;
  /** Chance de bloquear 70% de um golpe do herói. */
  block: number;
  xp: number;
  gold: number;
  bones: [number, number];
  /** Golpe especial (chefe): a cada n ticks. */
  specialEvery?: number;
  /** Fase 2 (o Senhor da Cripta abaixo de metade da vida). */
  phase2?: { dmg: number; interval: number; specialEvery: number };
}

export const ENEMIES: Record<EnemyKind, EnemyDef> = {
  lacaio: { kind: 'lacaio', name: 'Lacaio', hp: 34, dmg: 5, interval: 16, ranged: false, size: 1, block: 0, xp: 5, gold: 3, bones: [1, 1] },
  guerreiro: { kind: 'guerreiro', name: 'Guerreiro', hp: 70, dmg: 8, interval: 20, ranged: false, size: 1, block: 0.2, xp: 9, gold: 5, bones: [1, 2] },
  ladino: { kind: 'ladino', name: 'Ladino', hp: 40, dmg: 5, interval: 10, ranged: false, size: 1, block: 0, xp: 7, gold: 4, bones: [1, 1] },
  mago: { kind: 'mago', name: 'Mago', hp: 32, dmg: 9, interval: 24, ranged: true, size: 1, block: 0, xp: 8, gold: 5, bones: [1, 1] },
  capitao: { kind: 'capitao', name: 'Capitão da Cripta', hp: 1050, dmg: 16, interval: 22, ranged: false, size: 2, block: 0.1, xp: 150, gold: 90, bones: [8, 12], specialEvery: 120 },
  senhor: {
    kind: 'senhor', name: 'Senhor da Cripta', hp: 1500, dmg: 14, interval: 26, ranged: true, size: 2, block: 0, xp: 260, gold: 150,
    bones: [12, 18], specialEvery: 150, phase2: { dmg: 18, interval: 20, specialEvery: 120 },
  },
};

export function isBoss(kind: EnemyKind): boolean {
  return kind === 'capitao' || kind === 'senhor';
}

export const ELITE_NAMES: Record<EliteAffix, string> = { blindado: 'Blindado', vampirico: 'Vampírico', furioso: 'Furioso', veloz: 'Veloz' };

export interface SkillDef {
  id: SkillId;
  name: string;
  passive: boolean;
  act: number;
  cooldown: number;
  windup: number;
  total: number;
  desc: string;
}

export const SKILLS: Record<SkillId, SkillDef> = {
  golpe_amplo: { id: 'golpe_amplo', name: 'Golpe Amplo', passive: false, act: 1, cooldown: 60, windup: 7, total: 14, desc: '80% do dano em todos do anel.' },
  investida: { id: 'investida', name: 'Investida', passive: false, act: 1, cooldown: 100, windup: 5, total: 10, desc: 'Vai até o inimigo do fundo mais próximo, que entra no anel; 130% do dano e atordoa por 1,5 s.' },
  segundo_folego: { id: 'segundo_folego', name: 'Segundo Fôlego', passive: false, act: 1, cooldown: 400, windup: 3, total: 8, desc: 'Cura 30% da vida.' },
  grito: { id: 'grito', name: 'Grito de Guerra', passive: false, act: 1, cooldown: 200, windup: 4, total: 8, desc: 'Quem está no anel causa −35% de dano por 6 s.' },
  pele_de_ferro: { id: 'pele_de_ferro', name: 'Pele de Ferro', passive: true, act: 1, cooldown: 0, windup: 0, total: 0, desc: '+20% de armadura.' },
  sede_de_sangue: { id: 'sede_de_sangue', name: 'Sede de Sangue', passive: true, act: 1, cooldown: 0, windup: 0, total: 0, desc: 'Cura 4% do dano causado.' },
};

export const SKILL_IDS = Object.keys(SKILLS) as SkillId[];

export interface Cost {
  gold: number;
  mats: Partial<Record<Material, number>>;
  people: number;
}

export interface BuildingDef {
  id: BuildingId;
  name: string;
  max: number;
  /** Nível inicial (o ferreiro e o treinador já existem, em ruína reformada). */
  start: number;
  cost: (n: number) => Cost;
  effect: (n: number) => string;
}

export const BUILDINGS: Record<BuildingId, BuildingDef> = {
  ferreiro: {
    id: 'ferreiro', name: 'Ferreiro', max: 5, start: 1,
    cost: (n) => ({ gold: 150 * n * n, mats: { ferro: 15 * n }, people: n + 1 }),
    effect: (n) => `Forja até o tier ${2 * n} (limitado pelo andar mais fundo)${n >= 4 ? '; forja rara e épica; reforja' : n >= 3 ? '; forja rara; reforja' : n >= 2 ? '; forja rara' : ''}`,
  },
  treinador: {
    id: 'treinador', name: 'Treinador', max: 6, start: 0,
    cost: (n) => ({ gold: 200 * n * n, mats: { ossos: 30 * n }, people: 2 * n - 2 }),
    effect: (n) => (n === 0 ? 'Não ensina nada ainda' : `Ensina as habilidades até o Ato ${n}`),
  },
  alquimista: {
    id: 'alquimista', name: 'Alquimista', max: 4, start: 0,
    cost: (n) => ({ gold: 100 * n * n, mats: { ossos: 15 * n }, people: n }),
    effect: (n) => `${3 + n} poções; cada uma cura ${40 + 5 * n}%`,
  },
  carroceiro: {
    id: 'carroceiro', name: 'Carroceiro de resgate', max: 3, start: 0,
    cost: (n) => ({ gold: 120 * n * n, mats: { ferro: 10 * n }, people: n + 1 }),
    effect: (n) => `+${Math.round(BALANCE.deathCarter * 100 * n)}% na rolagem da morte; restos duram ${BALANCE.remainsDays + n} dias`,
  },
  curandeira: {
    id: 'curandeira', name: 'Curandeira', max: 3, start: 0,
    cost: (n) => ({ gold: 120 * n * n, mats: { ossos: 20 * n }, people: n }),
    effect: (n) => `Ferimento sara ${25 * n}% mais rápido`,
  },
  taticas: {
    id: 'taticas', name: 'Salão de Táticas', max: 4, start: 0,
    cost: (n) => ({ gold: 150 * n * n, mats: {}, people: 2 * n }),
    effect: (n) => `${4 + n} regras de combate${n >= 2 ? '; condição composta' : ''}`,
  },
};

export const BUILDING_IDS = Object.keys(BUILDINGS) as BuildingId[];

export const HEADS: { id: string; name: string }[] = [
  { id: 'Knight', name: 'Aldo' },
  { id: 'Barbarian', name: 'Bruno' },
  { id: 'Ranger', name: 'Teodoro' },
  { id: 'Rogue', name: 'Lívia' },
  { id: 'Mage', name: 'Marcela' },
  { id: 'Rogue_Hooded', name: 'Sombra' },
];
