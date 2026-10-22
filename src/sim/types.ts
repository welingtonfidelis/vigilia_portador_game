/** Estado do jogo: tudo JSON puro (sem classes, Map ou funções), para salvar e carregar sem perda. */

export type Slot = 'arma' | 'secundaria' | 'elmo' | 'peitoral' | 'perneiras' | 'capa' | 'amuleto';
export type Rarity = 'comum' | 'rara' | 'epica' | 'lendaria';
export type AffixId = 'afiado' | 'brutal' | 'veloz' | 'robusto' | 'guardiao' | 'sanguessuga' | 'afortunado' | 'sereno';
export type Weight = 'leve' | 'medio' | 'pesado' | 'nenhum';
export type Material = 'ossos' | 'ferro';
export type SkillId = 'golpe_amplo' | 'investida' | 'segundo_folego' | 'grito' | 'pele_de_ferro' | 'sede_de_sangue';
export type BuildingId = 'ferreiro' | 'treinador' | 'alquimista' | 'carroceiro' | 'curandeira' | 'taticas';
export type EnemyKind = 'lacaio' | 'guerreiro' | 'ladino' | 'mago' | 'capitao' | 'senhor';
export type EliteAffix = 'blindado' | 'vampirico' | 'furioso' | 'veloz';
export type RoomKind = 'combate' | 'elite' | 'bau' | 'prisioneiro' | 'santuario' | 'chefe';
export type HeadId = 'Knight' | 'Barbarian' | 'Mage' | 'Ranger' | 'Rogue' | 'Rogue_Hooded';

export interface Item {
  id: number;
  base: string;
  tier: number;
  rarity: Rarity;
  affixes: AffixId[];
  /** Id da lendária (efeito único e nome próprio). */
  legend?: string;
  /** "Andar 4 da Cripta", "Forjado no dia 3"… */
  origin: string;
}

export interface Loot {
  gold: number;
  mats: Record<Material, number>;
  items: Item[];
  people: number;
}

export type EnemyState = 'fila' | 'chegando' | 'anel' | 'fundo' | 'morto';

export interface Enemy {
  id: number;
  kind: EnemyKind;
  elite: EliteAffix | null;
  hp: number;
  maxHp: number;
  dmg: number;
  /** Ticks entre golpes. */
  interval: number;
  state: EnemyState;
  /** Vaga no anel (0..2); −1 fora do anel. */
  slot: number;
  /** Tick em que termina a aproximação (estado "chegando"). */
  arriveAt: number;
  nextAttack: number;
  /** Golpe em andamento: tick do impacto. `cast` é conjuração sem dano (o Senhor chamando reforço). */
  windup: { impact: number; special: boolean; cast?: boolean } | null;
  stunUntil: number;
  /** Próximo golpe especial (chefe). */
  nextSpecial: number;
  diedAt: number;
  /** Fase do chefe (o Senhor da Cripta tem 2); 1 para os outros. */
  phase: number;
  /** Já foi erguido dos mortos uma vez (não levanta de novo nem dá saque). */
  revived: boolean;
}

export type HeroActionKind = 'golpe' | 'habilidade' | 'pocao' | 'fuga';

export interface HeroAction {
  kind: HeroActionKind;
  skill: SkillId | null;
  target: number;
  start: number;
  impact: number;
  end: number;
  applied: boolean;
}

export interface Room {
  floor: number;
  index: number;
  kind: RoomKind;
  enemies: Enemy[];
  phase: 'entrando' | 'luta' | 'saque';
  phaseEnd: number;
  /** Semente visual da sala (decoração no 3D). */
  look: number;
  /** Início da luta (para o balanceador). */
  fightStart: number;
  /** Coroa do Capitão: inimigos com −20% de dano até este tick. */
  fearUntil: number;
  /** Vida do herói ao começar a luta (para o balanceador). */
  hpAtStart: number;
  /** Tick em que o chefe entrou na fase 2 (0 = ainda não). */
  phase2At: number;
  /** Depois do saque: segue pela porta do fundo ou volta para a vila (decidido ao limpar a sala). */
  exitTo?: 'fundo' | 'volta';
}

export type CondId = 'vida_abaixo' | 'anel_min' | 'fundo_min' | 'alvo_elite' | 'pocoes_max' | 'sempre';
export type RuleAction = 'pocao' | 'habilidade' | 'recuar';

export interface Rule {
  on: boolean;
  cond: CondId;
  param: number;
  /** Segunda condição (E), opcional. */
  cond2: CondId | null;
  param2: number;
  action: RuleAction;
  skill: SkillId | null;
}

export type TargetPolicy = 'elite' | 'fraco' | 'forte' | 'ferido';

export interface DescentRules {
  startFloor: number;
  mode: 'ficar' | 'ate' | 'sem_limite';
  untilFloor: number;
  returnBagFull: boolean;
  /** Voltar se as poções acabarem e a vida estiver abaixo deste % (0 desliga). */
  returnNoPotionsBelow: number;
  repeat: boolean;
  waitWound: boolean;
  fetchRemains: boolean;
  target: TargetPolicy;
}

export interface Wound {
  total: number;
  left: number;
}

export interface Hero {
  name: string;
  head: HeadId;
  level: number;
  xp: number;
  skillPoints: number;
  hp: number;
  potions: number;
  potionReadyAt: number;
  equip: Partial<Record<Slot, Item>>;
  learned: SkillId[];
  bar: (SkillId | null)[];
  cooldowns: Partial<Record<SkillId, number>>;
  wound: Wound | null;
  gritoUntil: number;
  action: HeroAction | null;
  /** Andar mais fundo alcançado. */
  deepest: number;
}

export interface Expedition {
  floor: number;
  room: number;
  bag: Loot;
  started: number;
  /** O sino tocou: volta no fim da luta. */
  recall: boolean;
  /** Motivo da volta, quando decidida. */
  leaving: string | null;
  kills: number;
}

export interface Remains {
  id: number;
  floor: number;
  room: number;
  loot: Loot;
  created: number;
  expires: number;
}

export interface ReturnReport {
  tick: number;
  died: boolean;
  floor: number;
  reason: string;
  brought: Loot;
  lost: Loot | null;
  /** Peças roladas: chance e resultado. */
  rolls: { item: Item; chance: number; kept: boolean }[];
  remainsId: number | null;
  recovered: number;
  woundTicks: number;
  melted: number;
}

export interface Construction {
  id: BuildingId;
  level: number;
  end: number;
}

export interface ForgeJob {
  kind: 'forjar' | 'aprimorar' | 'reforjar';
  item: Item;
  /** Item original (aprimorar e reforjar): id no baú ou no corpo. */
  sourceId: number | null;
  /** Reforjar: qual afixo sai. */
  affixIndex?: number;
  end: number;
}

export interface Village {
  gold: number;
  mats: Record<Material, number>;
  people: number;
  buildings: Record<BuildingId, number>;
  construction: Construction | null;
  forge: ForgeJob | null;
  stash: Item[];
  /** Resto fracionário do imposto (ouro por minuto por morador). */
  taxAcc: number;
}

export interface ChronicleEntry {
  tick: number;
  text: string;
  tone: 'bom' | 'ruim' | 'neutro' | 'lenda';
}

export interface Stats {
  descents: number;
  deaths: number;
  kills: number;
  rooms: number;
  fightTicks: number;
  maxFightTicks: number;
  /** Primeira vitória sobre cada chefe (andar → tick). */
  bossFirst: Record<string, number>;
  bossFightTicks: number;
  bossFights: number;
  remainsCreated: number;
  remainsRecovered: number;
  remainsExpired: number;
  bagValueAtDeath: number;
  lostValueAtDeath: number;
  deepestAt: Record<string, number>;
  /** Dano recebido em salas comuns, em fração da vida máxima (soma e contagem). */
  roomDamageFrac: number;
  roomDamageCount: number;
  /** Peças forjadas ou reforjadas. */
  forged: number;
  /** Peças aprimoradas (+1 tier). */
  upgraded: number;
  /** Lutas com o Senhor da Cripta: quantas, ticks e soma da fração da luta em que a fase 2 começou. */
  senhorFights: number;
  senhorFightTicks: number;
  senhorPhase2Frac: number;
}

export type Phase = 'vila' | 'descendo' | 'sala' | 'voltando';

export interface World {
  version: number;
  seed: number;
  rng: number;
  tick: number;
  nextId: number;
  hero: Hero;
  rules: { combat: Rule[]; descent: DescentRules };
  phase: Phase;
  /** Fim da viagem (descendo/voltando). */
  phaseEnd: number;
  /** A volta é carregado (morte). */
  carried: boolean;
  exp: Expedition | null;
  room: Room | null;
  village: Village;
  remains: Remains[];
  chronicle: ChronicleEntry[];
  report: ReturnReport | null;
  /** Relatório pendente que a volta vai preencher. */
  pending: ReturnReport | null;
  stats: Stats;
  /** Andares em que o chefe já foi vencido (a lendária do ato cai só na primeira). */
  bossesBeaten: number[];
  /** O jogador segurou o herói na vila (tela de equipamento aberta). */
  hold: boolean;
}

/** Eventos de um tick, para a tela (3D, sons, avisos). Não fazem parte do estado. */
export type SimEvent =
  | { t: 'golpe'; tick: number; skill: SkillId | null; target: number; end: number }
  | { t: 'acerto'; tick: number; target: number; dmg: number; crit: boolean; blocked: boolean }
  | { t: 'inimigoGolpe'; tick: number; enemy: number; special: boolean }
  | { t: 'heroiAcertado'; tick: number; enemy: number; dmg: number; blocked: boolean }
  | { t: 'inimigoMorre'; tick: number; enemy: number }
  | { t: 'inimigoRevive'; tick: number; enemy: number }
  | { t: 'fase'; tick: number; enemy: number }
  | { t: 'pocao'; tick: number }
  | { t: 'cura'; tick: number; amount: number }
  | { t: 'salaNova'; tick: number; floor: number; room: number; kind: RoomKind }
  | { t: 'salaLimpa'; tick: number }
  | { t: 'heroiMorre'; tick: number }
  | { t: 'fuga'; tick: number }
  | { t: 'partiu'; tick: number; floor: number }
  | { t: 'voltou'; tick: number; died: boolean }
  | { t: 'saque'; tick: number; text: string }
  | { t: 'restos'; tick: number; text: string }
  | { t: 'aviso'; tick: number; text: string; tone: ChronicleEntry['tone'] };
