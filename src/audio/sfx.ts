/**
 * Receitas dos efeitos (M4.1). Cada uma agenda nós a partir de `t` e não guarda estado. Os de luta
 * são curtos e baixos, porque vêm em rajadas; os avisos (chefe, nível, lendária) são frases.
 */
import { bell, blub, clank, drum, midiToFreq, noise, pad, pluck, rand, SMALL_BELL, steps, tone, type Ctx } from './instruments.ts';

export type SfxName =
  // golpes do herói
  | 'swing' | 'hit' | 'crit' | 'parry' | 'armor'
  // habilidades
  | 'sweep' | 'charge' | 'breath' | 'shout' | 'bash' | 'shatter' | 'purify' | 'spin'
  // golpes dos inimigos e o que acontece com o herói
  | 'windup' | 'hurt' | 'block' | 'venom' | 'potion' | 'heal'
  // inimigos
  | 'bones' | 'squish' | 'rise' | 'phase' | 'bossRoom' | 'bossDown'
  // a descida
  | 'door' | 'clear' | 'loot' | 'death' | 'flee' | 'depart' | 'return' | 'remains' | 'legend' | 'level'
  // a vila
  | 'build' | 'arrival'
  // interface
  | 'click' | 'open' | 'deny';

type Recipe = (ctx: Ctx, out: AudioNode, t: number) => void;

const n = midiToFreq;

/** Arpejo dedilhado a partir de notas MIDI. */
const arpeggio = (ctx: Ctx, out: AudioNode, t: number, notes: number[], step: number, gain = 0.09, decay = 1.2) =>
  notes.forEach((note, i) => pluck(ctx, out, t + i * step, n(note), gain, decay, 7));

/** Metais (fanfarra): dente de serra com um filtro que abre no ataque. */
const brass = (ctx: Ctx, out: AudioNode, t: number, notes: number[], dur: number, gain = 0.07) => {
  for (const note of notes) {
    for (const detune of [-6, 6]) {
      tone(ctx, out, t, { type: 'sawtooth', freq: n(note), detune, dur, gain, attack: 0.06, filter: { type: 'lowpass', freq: 600, to: 2400, q: 1 } });
    }
  }
};

/** Lâmina cortando o ar: ruído que varre o filtro para cima. */
const whoosh = (ctx: Ctx, out: AudioNode, t: number, from: number, to: number, dur: number, gain: number) =>
  noise(ctx, out, t, { dur, gain, filter: 'bandpass', freq: from, to, q: 1.4, attack: dur * 0.35 });

export const SFX: Record<SfxName, Recipe> = {
  // ── Golpes do herói
  swing: (ctx, out, t) => whoosh(ctx, out, t, rand(700, 900), rand(2200, 2800), 0.13, 0.035),
  // Lâmina que acerta: estalo e um baque.
  hit: (ctx, out, t) => {
    noise(ctx, out, t, { dur: 0.07, gain: 0.07, filter: 'bandpass', freq: rand(1500, 2400), q: 1.2 });
    tone(ctx, out, t, { type: 'triangle', freq: rand(130, 160), glide: { to: 70, time: 0.08 }, dur: 0.1, gain: 0.08 });
  },
  crit: (ctx, out, t) => {
    noise(ctx, out, t, { dur: 0.1, gain: 0.1, filter: 'bandpass', freq: 2600, q: 1.5 });
    tone(ctx, out, t, { type: 'triangle', freq: 170, glide: { to: 60, time: 0.12 }, dur: 0.16, gain: 0.11 });
    tone(ctx, out, t, { freq: rand(1700, 2100), dur: 0.25, gain: 0.025 });
  },
  // O inimigo aparou: metal com metal.
  parry: (ctx, out, t) => {
    clank(ctx, out, t, 0.045);
    tone(ctx, out, t, { type: 'triangle', freq: 210, glide: { to: 120, time: 0.06 }, dur: 0.08, gain: 0.04 });
  },
  // A lâmina bate na couraça: metal grosso e abafado.
  armor: (ctx, out, t) => {
    clank(ctx, out, t, 0.04, 900);
    drum(ctx, out, t, 110, 0.12, 0.2);
  },

  // ── Habilidades
  sweep: (ctx, out, t) => {
    whoosh(ctx, out, t, 450, 1900, 0.28, 0.06);
    noise(ctx, out, t + 0.12, { dur: 0.2, gain: 0.03, filter: 'lowpass', freq: 600 });
  },
  charge: (ctx, out, t) => {
    steps(ctx, out, t, 4, 0.08, 0.05);
    whoosh(ctx, out, t + 0.25, 600, 2400, 0.18, 0.05);
  },
  // Segundo Fôlego: um sopro que sobe e duas notas claras.
  breath: (ctx, out, t) => {
    noise(ctx, out, t, { dur: 0.6, gain: 0.04, filter: 'bandpass', freq: 400, to: 1400, q: 0.8, attack: 0.3 });
    tone(ctx, out, t + 0.25, { freq: n(76), dur: 0.5, gain: 0.025, attack: 0.05 });
    tone(ctx, out, t + 0.4, { freq: n(83), dur: 0.7, gain: 0.025, attack: 0.05 });
  },
  // Grito de Guerra: metais curtos e ásperos com um tambor.
  shout: (ctx, out, t) => {
    brass(ctx, out, t, [45, 52], 0.45, 0.05);
    noise(ctx, out, t, { dur: 0.4, gain: 0.05, filter: 'bandpass', freq: 700, q: 1.5, attack: 0.04 });
    drum(ctx, out, t, 70, 0.25, 0.5);
  },
  bash: (ctx, out, t) => {
    drum(ctx, out, t, 120, 0.3, 0.3);
    clank(ctx, out, t, 0.03, 1100);
  },
  // Quebra-Couraça: o metal racha.
  shatter: (ctx, out, t) => {
    clank(ctx, out, t, 0.06, 2400);
    noise(ctx, out, t + 0.03, { dur: 0.25, gain: 0.08, filter: 'highpass', freq: 2500, to: 900 });
    drum(ctx, out, t, 90, 0.2, 0.35);
  },
  // Purificar: sino claro e um brilho que sobe.
  purify: (ctx, out, t) => {
    bell(ctx, out, t, n(88), 0.03, 1.2, SMALL_BELL);
    bell(ctx, out, t + 0.12, n(93), 0.025, 1.4, SMALL_BELL);
    noise(ctx, out, t, { dur: 0.7, gain: 0.03, filter: 'highpass', freq: 3000, to: 7000, attack: 0.2 });
  },
  // Golpe Giratório: dois giros da lâmina.
  spin: (ctx, out, t) => {
    whoosh(ctx, out, t, 500, 2000, 0.22, 0.05);
    whoosh(ctx, out, t + 0.3, 550, 2300, 0.22, 0.055);
  },

  // ── Inimigos batendo e o herói
  // Golpe especial chegando: rosnado grave.
  windup: (ctx, out, t) => {
    tone(ctx, out, t, { type: 'sawtooth', freq: 110, glide: { to: 70, time: 0.3 }, dur: 0.34, gain: 0.045, filter: { type: 'lowpass', freq: 420 } });
  },
  hurt: (ctx, out, t) => {
    drum(ctx, out, t, 85, 0.2, 0.25);
    noise(ctx, out, t, { dur: 0.1, gain: 0.05, filter: 'lowpass', freq: 650 });
  },
  // Escudo segura o golpe: madeira e metal.
  block: (ctx, out, t) => {
    drum(ctx, out, t, 180, 0.16, 0.15);
    clank(ctx, out, t, 0.03, 1300);
  },
  // Veneno entrando: bolhas azedas.
  venom: (ctx, out, t) => {
    for (let i = 0; i < 3; i++) blub(ctx, out, t + i * rand(0.05, 0.09), rand(260, 420), 0.03);
    noise(ctx, out, t, { dur: 0.3, gain: 0.02, filter: 'bandpass', freq: 3200, q: 2 });
  },
  // Poção: rolha e goles.
  potion: (ctx, out, t) => {
    tone(ctx, out, t, { freq: 900, glide: { to: 400, time: 0.03 }, dur: 0.05, gain: 0.05 });
    for (let i = 0; i < 3; i++) blub(ctx, out, t + 0.15 + i * 0.13, 220 + i * 40, 0.05);
  },
  heal: (ctx, out, t) => {
    tone(ctx, out, t, { freq: n(81), dur: 0.25, gain: 0.02, attack: 0.03 });
    tone(ctx, out, t + 0.09, { freq: n(86), dur: 0.35, gain: 0.02, attack: 0.03 });
  },

  // ── Inimigos
  // Esqueleto que cai: ossos chacoalhando e um baque.
  bones: (ctx, out, t) => {
    for (let i = 0; i < 5; i++) noise(ctx, out, t + i * rand(0.03, 0.06), { dur: 0.025, gain: 0.04, filter: 'bandpass', freq: rand(1800, 3600), q: 3 });
    drum(ctx, out, t + 0.2, 70, 0.14, 0.3);
  },
  // Fungo que estoura: som molhado e uma bolha.
  squish: (ctx, out, t) => {
    tone(ctx, out, t, { freq: 320, glide: { to: 70, time: 0.15 }, dur: 0.18, gain: 0.08 });
    noise(ctx, out, t, { dur: 0.16, gain: 0.06, filter: 'lowpass', freq: 900, to: 300 });
    blub(ctx, out, t + 0.12, 380, 0.03);
  },
  // Morto que levanta: sopro grave que sobe.
  rise: (ctx, out, t) => {
    noise(ctx, out, t, { dur: 0.9, gain: 0.05, filter: 'bandpass', freq: 200, to: 800, q: 2, attack: 0.4 });
    tone(ctx, out, t, { freq: 70, glide: { to: 110, time: 0.8 }, dur: 0.9, gain: 0.08, attack: 0.3 });
  },
  // Chefe muda de fase: urro de metais graves e um tambor.
  phase: (ctx, out, t) => {
    brass(ctx, out, t, [38, 39, 45], 1, 0.06);
    drum(ctx, out, t, 50, 0.45, 1);
    noise(ctx, out, t, { dur: 0.9, gain: 0.06, filter: 'lowpass', freq: 500, attack: 0.15 });
  },
  // Sala do chefe: trompa grave e um rufar.
  bossRoom: (ctx, out, t) => {
    for (let i = 0; i < 6; i++) drum(ctx, out, t + i * 0.07, 60, 0.08 + i * 0.025, 0.3);
    tone(ctx, out, t + 0.45, { type: 'sawtooth', freq: n(38), dur: 1.6, gain: 0.09, attack: 0.25, filter: { type: 'lowpass', freq: 400, to: 900, q: 2 } });
  },
  // Chefe vencido: fanfarra em Ré maior.
  bossDown: (ctx, out, t) => {
    for (let i = 0; i < 8; i++) drum(ctx, out, t + i * 0.06, 65, 0.12 + i * 0.02, 0.3);
    brass(ctx, out, t + 0.5, [50, 54, 57, 62], 0.7);
    brass(ctx, out, t + 1.25, [55, 59, 62, 67], 0.6);
    brass(ctx, out, t + 1.9, [50, 54, 57, 62, 66], 1.8, 0.08);
    drum(ctx, out, t + 1.9, 60, 0.5, 1.2);
  },

  // ── A descida
  // Porta de sala: madeira que range e bate.
  door: (ctx, out, t) => {
    tone(ctx, out, t, { type: 'sawtooth', freq: rand(130, 160), glide: { to: 95, time: 0.35 }, dur: 0.38, gain: 0.03, filter: { type: 'bandpass', freq: 900, q: 8 } });
    drum(ctx, out, t + 0.36, 90, 0.12, 0.25);
  },
  clear: (ctx, out, t) => arpeggio(ctx, out, t, [62, 66, 69], 0.08, 0.06, 1.2),
  // Saque: moedas.
  loot: (ctx, out, t) => {
    const count = 4 + Math.floor(rand(0, 3));
    for (let i = 0; i < count; i++) bell(ctx, out, t + i * rand(0.045, 0.09), rand(2300, 3600), 0.045, 0.35, SMALL_BELL);
  },
  // Morte do herói: sino fúnebre, duas badaladas.
  death: (ctx, out, t) => {
    bell(ctx, out, t, 196, 0.16, 5);
    bell(ctx, out, t + 1.6, 196, 0.11, 5);
  },
  flee: (ctx, out, t) => {
    tone(ctx, out, t, { type: 'triangle', freq: 820, glide: { to: 260, time: 0.35 }, dur: 0.4, gain: 0.07 });
    steps(ctx, out, t, 5, 0.11, 0.05);
  },
  // O herói desce: passos e a porta da capela.
  depart: (ctx, out, t) => {
    steps(ctx, out, t, 3, 0.24, 0.04);
    drum(ctx, out, t + 0.8, 70, 0.22, 0.6);
  },
  return: (ctx, out, t) => arpeggio(ctx, out, t, [57, 62, 66], 0.11, 0.08, 1.6),
  // Restos deixados lá embaixo: acorde menor e um sininho.
  remains: (ctx, out, t) => {
    pad(ctx, out, t, [n(50), n(53), n(57)], 1.2, 0.04, 1000);
    bell(ctx, out, t + 0.3, n(74), 0.03, 1.5, SMALL_BELL);
  },
  // Lendária, marco de ato: fanfarra curta e sino.
  legend: (ctx, out, t) => {
    brass(ctx, out, t, [50, 57, 62], 0.5, 0.05);
    brass(ctx, out, t + 0.45, [54, 57, 62, 66], 1.2, 0.06);
    bell(ctx, out, t + 0.45, n(74), 0.06, 2.4, SMALL_BELL);
  },
  level: (ctx, out, t) => {
    [74, 78, 81, 86].forEach((note, i) => bell(ctx, out, t + i * 0.09, n(note), 0.05, 1.2, SMALL_BELL));
  },

  // ── A vila
  // Obra pronta: três marteladas e um acorde.
  build: (ctx, out, t) => {
    for (let i = 0; i < 3; i++) {
      const at = t + i * 0.2;
      drum(ctx, out, at, 140, 0.22, 0.18);
      noise(ctx, out, at, { dur: 0.08, gain: 0.1, filter: 'bandpass', freq: 1300, q: 3 });
    }
    arpeggio(ctx, out, t + 0.7, [62, 66, 69, 74], 0.07, 0.07, 1.4);
  },
  // Morador novo: passos e uma nota.
  arrival: (ctx, out, t) => {
    steps(ctx, out, t, 3, 0.24, 0.045);
    pluck(ctx, out, t + 0.7, n(69), 0.06, 1.2);
  },

  // ── Interface
  click: (ctx, out, t) => tone(ctx, out, t, { type: 'triangle', freq: 1250, dur: 0.03, gain: 0.022 }),
  open: (ctx, out, t) => noise(ctx, out, t, { dur: 0.22, gain: 0.022, filter: 'bandpass', freq: 600, to: 2200, q: 0.8, attack: 0.05 }),
  deny: (ctx, out, t) => tone(ctx, out, t, { type: 'triangle', freq: 180, glide: { to: 120, time: 0.15 }, dur: 0.18, gain: 0.09 }),
};

export const SFX_NAMES = Object.keys(SFX) as SfxName[];
