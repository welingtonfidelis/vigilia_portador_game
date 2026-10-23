/**
 * Trilha generativa (M4.1), no molde da do Vigília: acorde de fundo, baixo, violão dedilhado e uma
 * flauta esparsa. A vila fica em Sol (de dia, de noite, na festa e no luto); cada ato tem a sua cor
 * (a Cripta em Ré menor, as Minas em Lá menor harmônico, os Fungos em Dó sustenido menor com sinos
 * de vidro), e o chefe tem uma tensão com pulso e tambor. O clima troca no começo do compasso.
 */
import type { MusicMode } from './director.ts';
import { ANVIL, bell, drum, midiToFreq as n, pad, pickOne, pluck, rand, SMALL_BELL, tone } from './instruments.ts';

interface Style {
  bpm: number;
  chords: number[][];
  barsPerChord: number;
  /** Chance de dedilhar em cada colcheia. */
  pluck: number;
  /** Chance de a flauta tocar uma frase no compasso. */
  melody: number;
  cutoff: number;
  padGain: number;
  bass: boolean;
  pulse: boolean;
  /** Tambor: nenhum, distante (um por compasso), de batalha ou de festa. */
  drums: 'none' | 'far' | 'beat' | 'festa';
  /** Chance, por colcheia, de um sino de vidro agudo (os fungos que brilham). */
  glass: number;
  /** Chance, por compasso, de um tinido distante de picareta (as Minas). */
  pick: number;
  scale: number[];
}

// Vila (Sol maior e Mi menor).
const G = [55, 59, 62], Em = [52, 55, 59], C = [48, 52, 55], D = [50, 54, 57], Am = [45, 48, 52], B = [47, 51, 54];
// Cripta e chefe (Ré menor).
const Dm = [50, 53, 57], Bb = [46, 50, 53], Gm = [43, 46, 50], A = [45, 49, 52];
// Minas (Lá menor harmônico).
const F = [41, 45, 48], Dm2 = [38, 41, 45], E = [40, 44, 47];
// Fungos (Dó sustenido menor).
const Csm = [49, 52, 56], Amaj = [45, 49, 52], Fsm = [42, 45, 49], Gs = [44, 48, 51];

const G_MAJOR = [67, 69, 71, 72, 74, 76, 78, 79, 81, 83];
const E_MINOR = [64, 66, 67, 69, 71, 72, 74, 76, 78, 79];
const D_MINOR = [62, 64, 65, 67, 69, 70, 72, 74, 76, 77];
const A_HARM = [69, 71, 72, 74, 76, 77, 80, 81, 83, 84];
const CS_MINOR = [61, 63, 64, 66, 68, 69, 71, 73, 75, 76];

const base = { barsPerChord: 1, pulse: false, drums: 'none', glass: 0, pick: 0, bass: true } as const;

export const STYLES: Record<MusicMode, Style> = {
  dia: { ...base, bpm: 68, chords: [G, Em, C, D], pluck: 0.4, melody: 0.14, cutoff: 1300, padGain: 0.026, scale: G_MAJOR },
  noite: { ...base, bpm: 54, chords: [Em, C, Am, B], barsPerChord: 2, pluck: 0.18, melody: 0.07, cutoff: 700, padGain: 0.028, scale: E_MINOR },
  festa: { ...base, bpm: 100, chords: [G, C, D, G], pluck: 0.62, melody: 0.35, cutoff: 1800, padGain: 0.022, drums: 'festa', scale: G_MAJOR },
  luto: { ...base, bpm: 48, chords: [Em, Am, C, B], barsPerChord: 2, pluck: 0.12, melody: 0.32, cutoff: 800, padGain: 0.032, bass: false, scale: E_MINOR },
  // Lá embaixo: lenta e escura, quase só o acorde e o baixo, com um tambor distante.
  cripta: { ...base, bpm: 48, chords: [Dm, Bb, Gm, A], barsPerChord: 2, pluck: 0.07, melody: 0.05, cutoff: 480, padGain: 0.032, drums: 'far', scale: D_MINOR },
  minas: { ...base, bpm: 52, chords: [Am, F, Dm2, E], barsPerChord: 2, pluck: 0.09, melody: 0.06, cutoff: 560, padGain: 0.03, drums: 'far', pick: 0.35, scale: A_HARM },
  fungos: { ...base, bpm: 46, chords: [Csm, Amaj, Fsm, Gs], barsPerChord: 2, pluck: 0.04, melody: 0.08, cutoff: 520, padGain: 0.032, glass: 0.07, scale: CS_MINOR },
  chefe: { ...base, bpm: 80, chords: [Dm, Bb, Dm, A], pluck: 0.28, melody: 0, cutoff: 900, padGain: 0.026, pulse: true, drums: 'beat', scale: D_MINOR },
};

const STEPS_PER_BAR = 8;

/** A família do clima: dentro dela a troca espera o compasso; entre famílias (vila e cada canto lá embaixo), é na hora. */
const FAMILY: Record<MusicMode, string> = { dia: 'vila', noite: 'vila', festa: 'vila', luto: 'vila', cripta: 'cripta', minas: 'minas', fungos: 'fungos', chefe: 'chefe' };
/** Quanto a música da cena que sai leva para sumir (constante de tempo, s). */
const CUT_FADE = 0.35;

export class MusicPlayer {
  private mode: MusicMode = 'dia';
  private pending: MusicMode | null = null;
  private step = 0;
  private nextTime = 0;
  private chordIdx = 0;
  private chord = G;
  private melodyIdx = 4;
  private readonly ctx: BaseAudioContext;
  private readonly bus: AudioNode;
  /** A voz da cena atual: as notas ligam aqui, e trocar de cena some com ela (os acordes longos também). */
  private out: GainNode;
  /** Quantas vezes a música teve de pular para o próximo compasso por ficar para trás. */
  resyncs = 0;
  /** Quantas vezes a cena trocou na hora (com o fade da anterior). */
  cuts = 0;

  constructor(ctx: BaseAudioContext, out: AudioNode) {
    this.ctx = ctx;
    this.bus = out;
    this.out = this.voice();
  }

  private voice(): GainNode {
    const g = this.ctx.createGain();
    g.gain.value = 1;
    g.connect(this.bus);
    return g;
  }

  /**
   * Na mesma cena, o clima novo entra no próximo compasso, para não cortar a frase. Trocando de
   * cena (a vila e lá embaixo), a música que sai some em meio segundo e a nova começa já: antes, a
   * masmorra ainda soava uns 15 s na vila, entre o compasso e a cauda do acorde.
   */
  setMode(mode: MusicMode): void {
    if (FAMILY[mode] !== FAMILY[this.pending ?? this.mode]) return this.cut(mode);
    this.pending = mode === this.mode ? null : mode;
  }

  private cut(mode: MusicMode): void {
    const now = this.ctx.currentTime;
    const old = this.out;
    old.gain.setTargetAtTime(0, now, CUT_FADE);
    setTimeout(() => old.disconnect(), 3000);
    this.out = this.voice();
    this.mode = mode;
    this.pending = null;
    this.chordIdx = 0;
    this.melodyIdx = 4;
    this.step = Math.ceil(this.step / STEPS_PER_BAR) * STEPS_PER_BAR;
    this.nextTime = now + 0.05;
    this.cuts++;
  }

  get currentMode(): MusicMode {
    return this.mode;
  }

  /** O acorde que soa agora (o violão do músico da vila toca junto). */
  get currentChord(): readonly number[] {
    return this.chord;
  }

  /** Agenda as notas dos próximos `lookahead` segundos. A folga de 1 s absorve engasgos da página. */
  schedule(lookahead = 1): void {
    const now = this.ctx.currentTime;
    // Só um atraso grande (mudo, aba oculta) pula para o próximo compasso; os pequenos tocam na hora.
    if (this.nextTime < now - 0.25) {
      if (this.step > 0) this.resyncs++;
      this.nextTime = now + 0.05;
      this.step = Math.ceil(this.step / STEPS_PER_BAR) * STEPS_PER_BAR;
    }
    while (this.nextTime < now + lookahead) {
      const inBar = this.step % STEPS_PER_BAR;
      if (inBar === 0 && this.pending) {
        this.mode = this.pending;
        this.pending = null;
        this.chordIdx = 0;
        this.melodyIdx = 4;
      }
      const style = STYLES[this.mode];
      const stepDur = 60 / style.bpm / 2;
      this.playStep(style, inBar, Math.max(this.nextTime, now), stepDur);
      this.step++;
      this.nextTime += stepDur;
    }
  }

  private playStep(style: Style, inBar: number, t: number, stepDur: number): void {
    const { ctx, out } = this;
    const bar = Math.floor(this.step / STEPS_PER_BAR);
    if (inBar === 0) {
      if (bar % style.barsPerChord === 0) {
        this.chord = style.chords[this.chordIdx % style.chords.length]!;
        this.chordIdx++;
        pad(ctx, out, t, this.chord.map(n), stepDur * STEPS_PER_BAR * style.barsPerChord, style.padGain, style.cutoff);
      }
      if (style.bass) {
        tone(ctx, out, t, { type: 'triangle', freq: n(this.chord[0]! - 12), dur: stepDur * STEPS_PER_BAR * 0.95, gain: 0.085, attack: 0.04, filter: { type: 'lowpass', freq: 400 } });
      }
      if (Math.random() < style.melody) this.phrase(style, t, stepDur);
      if (Math.random() < style.pick) {
        // Picareta lá longe, numa galeria vizinha: dois ou três tinidos secos.
        const at = t + stepDur * pickOne([1, 3, 5]);
        const f = rand(1300, 1700);
        for (let i = 0; i < 2 + Math.floor(rand(0, 2)); i++) bell(ctx, out, at + i * stepDur * 1.5, f, 0.012, 0.5, ANVIL);
      }
    }
    if (style.pulse) {
      const accent = inBar === 0 || inBar === 3 || inBar === 6;
      tone(ctx, out, t, { type: 'sawtooth', freq: n(this.chord[0]! - 12), dur: stepDur * 0.7, gain: accent ? 0.05 : 0.03, filter: { type: 'lowpass', freq: 320, q: 3 } });
    }
    if (style.drums === 'far' && inBar === 0) drum(ctx, out, t, 46, 0.14, 1.1);
    else if (style.drums === 'beat' && (inBar === 0 || inBar === 3 || inBar === 6)) drum(ctx, out, t, 62, inBar === 0 ? 0.22 : 0.13, 0.45);
    else if (style.drums === 'festa') {
      // Bumbo no tempo, um tamborzinho no contratempo.
      if (inBar % 4 === 0) drum(ctx, out, t, 70, 0.2, 0.35);
      else if (inBar % 2 === 0) drum(ctx, out, t, 180, 0.07, 0.12);
    }
    const chance = style.pluck * (inBar % 2 === 0 ? 1 : 0.55);
    if (Math.random() < chance) {
      const note = pickOne(this.chord) + pickOne([12, 12, 24]);
      pluck(ctx, out, t + rand(0, 0.012), n(note), rand(0.04, 0.062), rand(1, 1.8), 6);
    }
    if (Math.random() < style.glass) bell(ctx, out, t, n(pickOne(this.chord) + pickOne([24, 36])), 0.012, 2.2, SMALL_BELL);
  }

  /** Frase de flauta: algumas notas longas andando pela escala. */
  private phrase(style: Style, t: number, stepDur: number): void {
    let at = t + stepDur * pickOne([0, 1, 2]);
    const notes = 2 + Math.floor(rand(0, 3));
    for (let i = 0; i < notes; i++) {
      this.melodyIdx = Math.max(0, Math.min(style.scale.length - 1, this.melodyIdx + pickOne([-2, -1, -1, 1, 1, 2])));
      const freq = n(style.scale[this.melodyIdx]!);
      const dur = stepDur * pickOne([2, 3, 4]);
      tone(this.ctx, this.out, at, { freq, dur: dur * 1.1, gain: 0.033, attack: 0.12, vibrato: { rate: 5, depth: freq * 0.006 } });
      tone(this.ctx, this.out, at, { type: 'triangle', freq: freq * 2, dur, gain: 0.006, attack: 0.15 });
      at += dur;
    }
  }
}
