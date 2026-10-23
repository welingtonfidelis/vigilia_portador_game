/**
 * Ambiente (M4.1). Laços contínuos (vento, zumbido de pedra, água e multidão) que sobem e descem com
 * a cena, mais sons soltos com hora marcada:
 * - na vila: passarinhos de dia, grilos à noite, a fogueira do herói, a fonte e a vida dos moradores
 *   (a bigorna, o machado, o violão, as crianças, a festa e os bichos), cada um do lado em que fica;
 * - na Cripta: gotas, correntes e um ronco de pedra;
 * - nas Minas: água correndo, gotas, as escoras rangendo e um carrinho lá longe;
 * - nos Fungos: borbulhas, o chiado dos esporos e um som molhado.
 */
import { BENCHES, CHICK_YARD, SPOTS, WOODPILE } from '../game/townFolk.ts';
import type { Mood } from './director.ts';
import { ANVIL, bell, blub, clank, drum, midiToFreq, noise, noiseLoop, pickOne, pluck, rand, SMALL_BELL, tone } from './instruments.ts';

type Timer =
  | 'cricket' | 'bird' | 'fire' | 'forge' | 'chop' | 'strum' | 'kids' | 'dog' | 'cat' | 'chick' | 'cheer'
  | 'drip' | 'chain' | 'rumble' | 'creak' | 'cart' | 'bubble' | 'hiss' | 'squelch';

/** Lado de cada coisa da vila no estéreo (a câmera olha a ilha de frente: x para a direita). */
const sideOf = (x: number) => Math.max(-0.85, Math.min(0.85, x / 26));
const SIDE = { forja: sideOf(SPOTS.bigorna.x), lenha: sideOf(WOODPILE.x), banco: sideOf(BENCHES[0]!.x), pintinho: sideOf(CHICK_YARD.x) };

/** Acordes do violão do músico (em Sol, como a música da vila). */
const STRUMS = [
  [55, 59, 62, 67],
  [52, 55, 59, 64],
  [48, 52, 55, 60],
  [50, 54, 57, 62],
];

interface Loops {
  wind: number;
  drone: number;
  water: number;
  crowd: number;
  murk: number;
}

/** Quanto de cada laço em cada cena. */
function loopLevels(mood: Mood): Loops {
  switch (mood.scene) {
    case 'vila':
      return { wind: mood.night ? 0.045 : 0.03, drone: 0, water: mood.life.fonte ? 0.012 : 0, crowd: mood.life.festa ? 0.035 : 0, murk: 0 };
    case 'cripta':
      return { wind: 0.018, drone: 0.05, water: 0, crowd: 0, murk: 0 };
    case 'minas':
      return { wind: 0.012, drone: 0.04, water: 0.022, crowd: 0, murk: 0 };
    case 'fungos':
      return { wind: 0.008, drone: 0.045, water: 0, crowd: 0, murk: 0.035 };
  }
}

export class AmbiencePlayer {
  private readonly ctx: BaseAudioContext;
  private readonly out: AudioNode;
  private readonly loops: Record<keyof Loops, GainNode>;
  private mood: Mood | null = null;
  private next = {} as Record<Timer, number>;
  /** Cinco posições fixas no estéreo, reaproveitadas (sem criar um nó por som). */
  private readonly pans: StereoPannerNode[] = [];

  constructor(ctx: BaseAudioContext, out: AudioNode) {
    this.ctx = ctx;
    this.out = out;
    this.loops = {
      // Rajadas: um LFO lento mexe no filtro.
      wind: noiseLoop(ctx, out, 'bandpass', 500, 0.6, { rate: 0.07, depth: 260 }),
      drone: this.drone(),
      // Água: a fonte da praça ou o córrego das Minas.
      water: noiseLoop(ctx, out, 'bandpass', 2600, 0.5, { rate: 0.31, depth: 700 }),
      // Murmúrio de gente na festa.
      crowd: noiseLoop(ctx, out, 'bandpass', 520, 1.3, { rate: 0.4, depth: 140 }),
      // O ar grosso dos Fungos.
      murk: noiseLoop(ctx, out, 'lowpass', 220, 0.8, { rate: 0.05, depth: 90 }),
    };
  }

  setMood(mood: Mood): void {
    // Trocando de cena, os laços da que sai somem rápido; na mesma cena, devagar.
    const fade = this.mood && this.mood.scene !== mood.scene ? 0.3 : 1.2;
    this.mood = mood;
    const now = this.ctx.currentTime;
    const levels = loopLevels(mood);
    for (const k of Object.keys(levels) as (keyof Loops)[]) this.loops[k].gain.setTargetAtTime(levels[k], now, fade);
  }

  /** Para tudo (mudo): os laços descem em meio segundo. */
  silence(): void {
    const now = this.ctx.currentTime;
    for (const g of Object.values(this.loops)) g.gain.setTargetAtTime(0, now, 0.15);
    this.mood = null;
  }

  schedule(): void {
    const mood = this.mood;
    if (!mood) return;
    const now = this.ctx.currentTime;
    const at = now + 0.05;
    const due = (timer: Timer, min: number, max: number): boolean => {
      const next = this.next[timer] ?? 0;
      if (next > now) return false;
      // A primeira vez só marca a hora: nada de todos os sons juntos ao entrar na cena.
      this.next[timer] = now + rand(min, max);
      return next > 0;
    };
    switch (mood.scene) {
      case 'vila':
        return this.village(mood, at, due);
      case 'cripta':
        if (due('drip', 0.7, 3.5)) this.drip(at);
        if (due('chain', 9, 22)) clank(this.ctx, this.panned(rand(-0.8, 0.8)), at, rand(0.008, 0.016));
        if (due('rumble', 14, 30)) noise(this.ctx, this.out, at, { dur: 3, gain: 0.05, filter: 'lowpass', freq: 110, attack: 1.2 });
        return;
      case 'minas':
        if (due('drip', 0.5, 2.5)) this.drip(at);
        if (due('creak', 8, 18)) this.creak(at);
        if (due('cart', 25, 50)) this.cart(at);
        if (due('rumble', 18, 36)) noise(this.ctx, this.out, at, { dur: 2.5, gain: 0.045, filter: 'lowpass', freq: 120, attack: 1 });
        return;
      case 'fungos':
        if (due('bubble', 0.6, 2)) blub(this.ctx, this.panned(rand(-0.8, 0.8)), at, rand(140, 260), rand(0.01, 0.02));
        if (due('hiss', 5, 12)) noise(this.ctx, this.panned(rand(-0.6, 0.6)), at, { dur: 1.2, gain: 0.014, filter: 'highpass', freq: 4200, attack: 0.5 });
        if (due('squelch', 10, 20)) {
          const out = this.panned(rand(-0.7, 0.7));
          tone(this.ctx, out, at, { freq: 180, glide: { to: 60, time: 0.3 }, dur: 0.35, gain: 0.025 });
          noise(this.ctx, out, at, { dur: 0.3, gain: 0.02, filter: 'lowpass', freq: 700, to: 250 });
        }
        return;
    }
  }

  private village(mood: Mood, at: number, due: (timer: Timer, min: number, max: number) => boolean): void {
    const { ctx } = this;
    const { life } = mood;
    if (mood.night && due('cricket', 0.5, 2.2)) this.cricket(at);
    const daylight = mood.hour >= 5 && mood.hour < 19;
    if (daylight && due('bird', 3, 9)) this.bird(at);
    // A fogueira do herói estala sempre, mais à noite.
    if (due('fire', 0.08, 0.7)) {
      noise(ctx, this.panned(rand(-0.2, 0.2)), at, { dur: rand(0.01, 0.03), gain: rand(0.005, mood.night ? 0.026 : 0.012), filter: 'highpass', freq: rand(1500, 3200) });
    }
    // O ferreiro bate na bigorna em rajadas de duas ou três.
    if (life.forja && due('forge', 1.6, 2.6)) {
      const out = this.panned(SIDE.forja);
      const f = rand(1500, 1700);
      for (let i = 0; i < 2 + Math.floor(rand(0, 2)); i++) bell(ctx, out, at + i * 0.42, f * rand(0.98, 1.02), 0.014, 0.6, ANVIL);
    }
    if (life.lenha && due('chop', 1.8, 2.8)) {
      const out = this.panned(SIDE.lenha);
      drum(ctx, out, at, 150, 0.045, 0.15);
      noise(ctx, out, at, { dur: 0.06, gain: 0.03, filter: 'bandpass', freq: 900, q: 1.5 });
    }
    // O músico no banco: um acorde dedilhado de vez em quando.
    if (life.violao && due('strum', 2.4, 4)) {
      const out = this.panned(SIDE.banco);
      pickOne(STRUMS).forEach((note, i) => pluck(ctx, out, at + i * 0.035, midiToFreq(note), 0.026, 1.6, 5));
    }
    if (life.criancas && due('kids', 7, 15)) this.giggle(at);
    if (life.cachorro && due('dog', 18, 40)) this.bark(at);
    if (life.gato && due('cat', 30, 60)) this.meow(at);
    if (life.pintinho && due('chick', 2.5, 6)) this.peep(at);
    // Na festa: um viva e o sininho de mão.
    if (life.festa && due('cheer', 4, 9)) {
      const out = this.panned(rand(-0.4, 0.4));
      noise(ctx, out, at, { dur: 0.7, gain: 0.03, filter: 'bandpass', freq: 600, to: 1500, q: 1.2, attack: 0.15 });
      if (Math.random() < 0.5) for (let i = 0; i < 3; i++) bell(ctx, out, at + 0.3 + i * 0.22, 1320, 0.02, 1, SMALL_BELL);
    }
  }

  private panned(pan: number): AudioNode {
    if (this.pans.length === 0) {
      for (const value of [-0.8, -0.4, 0, 0.4, 0.8]) {
        const p = this.ctx.createStereoPanner();
        p.pan.value = value;
        p.connect(this.out);
        this.pans.push(p);
      }
    }
    const idx = Math.round(((Math.max(-0.8, Math.min(0.8, pan)) + 0.8) / 1.6) * (this.pans.length - 1));
    return this.pans[idx]!;
  }

  private cricket(t: number): void {
    const out = this.panned(rand(-0.8, 0.8));
    const freq = rand(4200, 5000);
    const pulses = 2 + Math.floor(rand(0, 3));
    for (let i = 0; i < pulses; i++) tone(this.ctx, out, t + i * 0.07, { freq, dur: 0.03, gain: 0.011, attack: 0.004 });
  }

  private bird(t: number): void {
    const out = this.panned(rand(-0.9, 0.9));
    const chirps = 2 + Math.floor(rand(0, 3));
    for (let i = 0; i < chirps; i++) {
      const from = rand(2400, 3400);
      tone(this.ctx, out, t + i * rand(0.1, 0.16), { freq: from, glide: { to: from * rand(1.2, 1.6), time: 0.07 }, dur: 0.09, gain: 0.016 });
    }
  }

  /** Gota numa poça: nota aguda que cai rápido, às vezes com eco. */
  private drip(t: number): void {
    const out = this.panned(rand(-0.8, 0.8));
    const freq = rand(1500, 2600);
    tone(this.ctx, out, t, { freq, glide: { to: freq * 0.55, time: 0.06 }, dur: 0.09, gain: rand(0.012, 0.024), attack: 0.002 });
    if (Math.random() < 0.4) tone(this.ctx, out, t + 0.18, { freq: freq * 0.9, glide: { to: freq * 0.5, time: 0.06 }, dur: 0.08, gain: 0.006 });
  }

  /** Escora de madeira rangendo com o peso da montanha. */
  private creak(t: number): void {
    const out = this.panned(rand(-0.8, 0.8));
    const f = rand(70, 95);
    tone(this.ctx, out, t, { type: 'sawtooth', freq: f, glide: { to: f * rand(0.8, 1.2), time: 0.8 }, dur: 0.9, gain: 0.02, attack: 0.2, filter: { type: 'bandpass', freq: rand(320, 520), q: 9 } });
  }

  /** Um carrinho passando nos trilhos de outra galeria: batidas que vão e voltam. */
  private cart(t: number): void {
    const out = this.panned(rand(-0.8, 0.8));
    for (let i = 0; i < 10; i++) {
      const g = 0.012 * Math.sin((Math.PI * (i + 0.5)) / 10);
      noise(this.ctx, out, t + i * 0.16, { dur: 0.04, gain: g, filter: 'bandpass', freq: 900, q: 2 });
    }
  }

  /** Crianças rindo na praça: três ou quatro notinhas que tremem. */
  private giggle(t: number): void {
    const out = this.panned(rand(-0.3, 0.3));
    const f = rand(900, 1200);
    for (let i = 0; i < 3 + Math.floor(rand(0, 2)); i++) {
      tone(this.ctx, out, t + i * 0.11, { type: 'triangle', freq: f * (1 - i * 0.04), glide: { to: f * 0.8, time: 0.08 }, dur: 0.09, gain: 0.012, attack: 0.01, filter: { type: 'bandpass', freq: 1400, q: 1.5 } });
    }
  }

  /** Latido: dois "au" curtos. */
  private bark(t: number): void {
    const out = this.panned(rand(-0.6, 0.6));
    for (let i = 0; i < 2; i++) {
      tone(this.ctx, out, t + i * 0.22, { type: 'sawtooth', freq: 340, glide: { to: 190, time: 0.08 }, dur: 0.11, gain: 0.02, attack: 0.008, filter: { type: 'bandpass', freq: 900, q: 1.8 } });
      noise(this.ctx, out, t + i * 0.22, { dur: 0.05, gain: 0.012, filter: 'bandpass', freq: 1200, q: 1.5 });
    }
  }

  /** Miado: sobe e desce, com um filtro de vogal. */
  private meow(t: number): void {
    const out = this.panned(rand(-0.6, 0.6));
    tone(this.ctx, out, t, { type: 'sawtooth', freq: 520, glide: { to: 760, time: 0.18 }, dur: 0.45, gain: 0.014, attack: 0.05, filter: { type: 'bandpass', freq: 1300, to: 800, q: 3 } });
  }

  /** Pintinhos piando no cercado. */
  private peep(t: number): void {
    const out = this.panned(SIDE.pintinho);
    for (let i = 0; i < 2 + Math.floor(rand(0, 2)); i++) {
      const f = rand(3000, 3500);
      tone(this.ctx, out, t + i * rand(0.12, 0.2), { freq: f, glide: { to: f * 1.15, time: 0.04 }, dur: 0.06, gain: 0.009 });
    }
  }

  /** Zumbido grave de pedra, contínuo (lá embaixo). */
  private drone(): GainNode {
    const { ctx } = this;
    const gain = ctx.createGain();
    gain.gain.value = 0;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 300;
    filter.connect(gain).connect(this.out);
    for (const [type, freq, level] of [
      ['sine', 55, 1],
      ['triangle', 82.1, 0.5],
      ['sine', 27.5, 0.7],
    ] as const) {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = type;
      osc.frequency.value = freq;
      g.gain.value = level;
      osc.connect(g).connect(filter);
      osc.start();
    }
    return gain;
  }
}
