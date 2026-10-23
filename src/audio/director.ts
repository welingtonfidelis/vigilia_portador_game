/**
 * Diretor de som (M4.1): decide o que soa. Traduz os eventos de cada quadro e as mudanças do estado
 * em efeitos, com prioridade e intervalo mínimo, e lê o mundo para a música e o ambiente. Puro:
 * testado no Node, sem Web Audio.
 */
import { BALANCE, actOf, isBoss } from '../sim/index.ts';
import type { SimEvent, SkillId, World } from '../sim/index.ts';
import { doing, FOLK_CAP, lifeMarks, petDoing, pets, residents } from '../game/townFolk.ts';
import type { PetKind } from '../game/townFolk.ts';
import { daylight, townHour, townStage } from '../game/townPlan.ts';
import type { SfxName } from './sfx.ts';

export interface Cue {
  sfx: SfxName;
  priority: number;
}

const SKILL_SFX: Partial<Record<SkillId, SfxName>> = {
  golpe_amplo: 'sweep',
  investida: 'charge',
  segundo_folego: 'breath',
  grito: 'shout',
  golpe_escudo: 'bash',
  quebra_couraca: 'shatter',
  purificar: 'purify',
  golpe_giratorio: 'spin',
};

/** Os eventos de um quadro viram efeitos. O mundo diz quem é o inimigo (couraça, chefe, fungo). */
export function cuesFor(events: readonly SimEvent[], w: World): Cue[] {
  const out: Cue[] = [];
  const enemy = (id: number) => w.room?.enemies.find((e) => e.id === id);
  const fungi = !!w.room && actOf(w.room.floor) === 3;
  for (const e of events) {
    switch (e.t) {
      case 'golpe': {
        const skill = e.skill ? SKILL_SFX[e.skill] : undefined;
        out.push(skill ? { sfx: skill, priority: 5 } : { sfx: 'swing', priority: 1 });
        break;
      }
      case 'acerto': {
        const x = enemy(e.target);
        if (e.crit) out.push({ sfx: 'crit', priority: 4 });
        else if (e.blocked) out.push({ sfx: 'parry', priority: 3 });
        else if (x && x.armor > 0) out.push({ sfx: 'armor', priority: 3 });
        else out.push({ sfx: 'hit', priority: 2 });
        break;
      }
      case 'inimigoGolpe':
        if (e.special) out.push({ sfx: 'windup', priority: 4 });
        break;
      case 'heroiAcertado':
        out.push(e.blocked ? { sfx: 'block', priority: 3 } : { sfx: 'hurt', priority: 3 });
        break;
      case 'inimigoMorre': {
        const x = enemy(e.enemy);
        if (x && isBoss(x.kind)) out.push({ sfx: 'bossDown', priority: 9 });
        else out.push({ sfx: fungi ? 'squish' : 'bones', priority: 3 });
        break;
      }
      case 'inimigoRevive':
        out.push({ sfx: 'rise', priority: 5 });
        break;
      case 'fase':
        out.push({ sfx: 'phase', priority: 8 });
        break;
      case 'pocao':
        out.push({ sfx: 'potion', priority: 5 });
        break;
      case 'cura':
        out.push({ sfx: 'heal', priority: 2 });
        break;
      case 'salaNova':
        out.push(e.kind === 'chefe' ? { sfx: 'bossRoom', priority: 7 } : { sfx: 'door', priority: 2 });
        break;
      case 'salaLimpa':
        out.push({ sfx: 'clear', priority: 3 });
        break;
      case 'heroiMorre':
        out.push({ sfx: 'death', priority: 10 });
        break;
      case 'fuga':
        out.push({ sfx: 'flee', priority: 6 });
        break;
      case 'partiu':
        out.push({ sfx: 'depart', priority: 4 });
        break;
      case 'voltou':
        if (!e.died) out.push({ sfx: 'return', priority: 4 });
        break;
      case 'saque':
        out.push({ sfx: 'loot', priority: 4 });
        break;
      case 'restos':
        out.push({ sfx: 'remains', priority: 6 });
        break;
      case 'aviso':
        if (e.tone === 'lenda') out.push({ sfx: 'legend', priority: 8 });
        break;
    }
  }
  return out;
}

// ── Mudanças do estado que não têm evento próprio (nível, veneno, obra pronta, morador novo).

export interface Snapshot {
  level: number;
  venom: number;
  built: number;
  people: number;
}

export function snapshot(w: World): Snapshot {
  return {
    level: w.hero.level,
    venom: w.hero.poison.filter((t) => t > w.tick).length,
    built: Object.values(w.village.buildings).reduce((a, b) => a + b, 0),
    people: w.village.people,
  };
}

export function changeCues(a: Snapshot | null, b: Snapshot): Cue[] {
  if (!a) return [];
  const out: Cue[] = [];
  if (b.level > a.level) out.push({ sfx: 'level', priority: 7 });
  if (b.venom > a.venom) out.push({ sfx: 'venom', priority: 4 });
  if (b.built > a.built) out.push({ sfx: 'build', priority: 6 });
  if (b.people > a.people) out.push({ sfx: 'arrival', priority: 3 });
  return out;
}

// ── Onde o ouvido está.

export type Scene = 'vila' | 'cripta' | 'minas' | 'fungos';
const ACT_SCENES: Scene[] = ['cripta', 'minas', 'fungos'];

/** A cena que a tela mostra: a vila (com o herói nela ou o jogador olhando) ou o ato da sala. */
export function sceneOf(w: World, townShown: boolean): Scene {
  if (townShown) return 'vila';
  const floor = w.room?.floor ?? w.exp?.floor ?? 1;
  return ACT_SCENES[Math.min(ACT_SCENES.length, actOf(floor)) - 1]!;
}

/** Os avisos que passam em qualquer cena. O resto é a luta, que só soa com a sala na tela. */
export const NOTICES = new Set<SfxName>(['death', 'level', 'legend', 'bossDown', 'build', 'arrival', 'remains', 'return', 'depart', 'click', 'open', 'deny']);

export const cuesInScene = (cues: Cue[], scene: Scene): Cue[] => (scene !== 'vila' ? cues : cues.filter((c) => NOTICES.has(c.sfx)));

// ── O planejador: o mais importante primeiro, sem metralhadora a 4×.

/** Intervalo mínimo entre duas vezes o mesmo efeito (ms). */
export const COOLDOWN_MS: Partial<Record<SfxName, number>> = {
  swing: 90, hit: 60, crit: 120, parry: 120, armor: 100, hurt: 90, block: 110, windup: 250,
  venom: 500, potion: 400, heal: 400, bones: 120, squish: 120, rise: 400, door: 400, clear: 800,
  loot: 300, level: 900, build: 1200, arrival: 800, legend: 2000, bossDown: 3000, death: 3000,
  remains: 1500, return: 1000, depart: 1000, click: 40, open: 150,
};
const DEFAULT_COOLDOWN = 200;
/** Os avisos de um mesmo lote saem espaçados (s); os golpes, quase juntos. */
export const STAGGER_S = 0.35;
export const HIT_GAP_S = 0.035;
/** Teto de golpes por segundo (os avisos não contam). */
export const FIGHT_PER_SECOND = 10;

export interface Planned {
  sfx: SfxName;
  delay: number;
}

export class CuePlanner {
  private last = new Map<SfxName, number>();
  private fights: number[] = [];
  private readonly maxPerBatch: number;

  constructor(maxPerBatch = 4) {
    this.maxPerBatch = maxPerBatch;
  }

  plan(cues: Cue[], nowMs: number): Planned[] {
    const out: Planned[] = [];
    const seen = new Set<SfxName>();
    let notices = 0, hits = 0;
    this.fights = this.fights.filter((t) => nowMs - t < 1000);
    for (const cue of [...cues].sort((a, b) => b.priority - a.priority)) {
      if (out.length >= this.maxPerBatch) break;
      if (seen.has(cue.sfx)) continue;
      seen.add(cue.sfx);
      const last = this.last.get(cue.sfx);
      if (last !== undefined && nowMs - last < (COOLDOWN_MS[cue.sfx] ?? DEFAULT_COOLDOWN)) continue;
      const notice = cue.priority >= 6 || NOTICES.has(cue.sfx);
      if (!notice && this.fights.length >= FIGHT_PER_SECOND) continue;
      this.last.set(cue.sfx, nowMs);
      if (notice) out.push({ sfx: cue.sfx, delay: notices++ * STAGGER_S });
      else {
        this.fights.push(nowMs);
        out.push({ sfx: cue.sfx, delay: hits++ * HIT_GAP_S });
      }
    }
    return out;
  }
}

// ── O clima: música e ambiente.

export type MusicMode = 'dia' | 'noite' | 'festa' | 'luto' | 'cripta' | 'minas' | 'fungos' | 'chefe';

/** A vida da vila que se ouve: os ofícios no ponto, as crianças, a festa, a fonte e os bichos. */
export interface Life extends Record<PetKind, boolean> {
  forja: boolean;
  lenha: boolean;
  violao: boolean;
  criancas: boolean;
  festa: boolean;
  fonte: boolean;
}

const QUIET: Life = { forja: false, lenha: false, violao: false, criancas: false, festa: false, fonte: false, cachorro: false, gato: false, pintinho: false };

export interface Mood {
  scene: Scene;
  mode: MusicMode;
  hour: number;
  night: boolean;
  /** Luta acontecendo na sala. */
  fighting: boolean;
  life: Life;
}

/** Quanto tempo a música da vila fica de luto depois de uma morte (meio dia de jogo). */
export const MOURNING_TICKS = BALANCE.dayTicks / 2;

export function moodOf(w: World, townShown: boolean): Mood {
  const scene = sceneOf(w, townShown);
  const hour = townHour(w.tick);
  // Noite quando o 3D já escureceu (com pouco sol, no fim da tarde também).
  const night = daylight(hour) < 0.3;
  const fighting = w.phase === 'sala' && w.room?.phase === 'luta';
  const boss = fighting && !!w.room?.enemies.some((e) => e.state !== 'morto' && isBoss(e.kind));
  const life = scene === 'vila' ? lifeOf(w, hour) : QUIET;
  const mourning = !!w.report?.died && w.phase === 'vila' && w.tick - w.report.tick < MOURNING_TICKS;
  const mode: MusicMode = scene !== 'vila' ? (boss ? 'chefe' : scene) : life.festa ? 'festa' : mourning ? 'luto' : night ? 'noite' : 'dia';
  return { scene, mode, hour, night, fighting, life };
}

/** O que soa na vila nesta hora: lê a mesma rotina que move os moradores no 3D. */
export function lifeOf(w: World, hour: number): Life {
  const m = lifeMarks(w);
  const stage = townStage(w);
  const life: Life = { ...QUIET, festa: m.festa && hour >= 9 && hour < 23, fonte: stage >= 3 };
  for (const r of residents(w, FOLK_CAP.desktop)) {
    const d = doing(r, hour, m);
    if (d.at === 'ponto' && d.prop === 'martelo') life.forja = true;
    else if (d.at === 'ponto' && d.prop === 'machado') life.lenha = true;
    else if (d.at === 'ponto' && d.prop === 'violao') life.violao = true;
    else if (d.at === 'passeio' && r.child) life.criancas = true;
  }
  for (const p of pets(w)) if (petDoing(p, hour, stage).at !== 'casa') life[p] = true;
  return life;
}
