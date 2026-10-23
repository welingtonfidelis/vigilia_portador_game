/**
 * Instrumentos sintetizados em Web Audio (M4.1), nos moldes do Vigília. Tudo recebe um
 * BaseAudioContext, para funcionar igual no AudioContext do jogo e no contexto falso dos testes.
 */

export type Ctx = BaseAudioContext;

const SILENT = 0.0001;

export const midiToFreq = (midi: number): number => 440 * Math.pow(2, (midi - 69) / 12);

/** Aleatório só do som. Nunca o sorteio do mundo: quebraria o determinismo do núcleo. */
export const rand = (min: number, max: number): number => min + Math.random() * (max - min);
export const pickOne = <T>(items: readonly T[]): T => items[Math.floor(Math.random() * items.length)]!;

const noiseCache = new WeakMap<Ctx, AudioBuffer>();

export function noiseBuffer(ctx: Ctx): AudioBuffer {
  let buf = noiseCache.get(ctx);
  if (!buf) {
    buf = ctx.createBuffer(1, Math.round(ctx.sampleRate * 2), ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    noiseCache.set(ctx, buf);
  }
  return buf;
}

/** Resposta de impulso sintética (ruído com decaimento) para o reverb. */
export function impulse(ctx: Ctx, seconds = 2.8, decay = 2.6): AudioBuffer {
  const length = Math.round(ctx.sampleRate * seconds);
  const buf = ctx.createBuffer(2, length, ctx.sampleRate);
  for (let c = 0; c < 2; c++) {
    const data = buf.getChannelData(c);
    for (let i = 0; i < length; i++) data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, decay);
  }
  return buf;
}

/** Envelope percussivo: sobe em `attack` e cai exponencialmente até `t + dur`. */
function envelope(param: AudioParam, t: number, peak: number, attack: number, dur: number): void {
  // O ganho nasce em 1: sem zerar antes de `t`, a primeira amostra passa cheia (estalo).
  param.value = 0;
  param.setValueAtTime(SILENT, t);
  param.linearRampToValueAtTime(peak, t + attack);
  param.exponentialRampToValueAtTime(SILENT, t + Math.max(attack + 0.01, dur));
}

export interface ToneOpts {
  type?: OscillatorType;
  freq: number;
  dur: number;
  gain?: number;
  attack?: number;
  detune?: number;
  /** Desliza a frequência até `to` em `time` segundos. */
  glide?: { to: number; time: number };
  vibrato?: { rate: number; depth: number };
  filter?: { type: BiquadFilterType; freq: number; q?: number; to?: number };
}

export function tone(ctx: Ctx, out: AudioNode, t: number, o: ToneOpts): void {
  const osc = ctx.createOscillator();
  osc.type = o.type ?? 'sine';
  osc.frequency.setValueAtTime(o.freq, t);
  if (o.glide) osc.frequency.exponentialRampToValueAtTime(o.glide.to, t + o.glide.time);
  if (o.detune) osc.detune.value = o.detune;
  const amp = ctx.createGain();
  envelope(amp.gain, t, o.gain ?? 0.2, o.attack ?? 0.005, o.dur);
  let head: AudioNode = osc;
  if (o.filter) {
    const f = ctx.createBiquadFilter();
    f.type = o.filter.type;
    f.frequency.setValueAtTime(o.filter.freq, t);
    if (o.filter.to) f.frequency.exponentialRampToValueAtTime(o.filter.to, t + o.dur);
    f.Q.value = o.filter.q ?? 0.7;
    head.connect(f);
    head = f;
  }
  head.connect(amp).connect(out);
  if (o.vibrato) {
    const lfo = ctx.createOscillator();
    const depth = ctx.createGain();
    lfo.frequency.value = o.vibrato.rate;
    depth.gain.value = o.vibrato.depth;
    lfo.connect(depth).connect(osc.frequency);
    lfo.start(t);
    lfo.stop(t + o.dur + 0.1);
  }
  osc.start(t);
  osc.stop(t + o.dur + 0.1);
}

export interface NoiseOpts {
  dur: number;
  gain?: number;
  attack?: number;
  filter: BiquadFilterType;
  freq: number;
  q?: number;
  /** Varre o filtro até esta frequência ao longo da duração. */
  to?: number;
}

export function noise(ctx: Ctx, out: AudioNode, t: number, o: NoiseOpts): void {
  const src = ctx.createBufferSource();
  src.buffer = noiseBuffer(ctx);
  src.loop = true;
  const f = ctx.createBiquadFilter();
  f.type = o.filter;
  f.frequency.setValueAtTime(o.freq, t);
  if (o.to) f.frequency.exponentialRampToValueAtTime(o.to, t + o.dur);
  f.Q.value = o.q ?? 1;
  const amp = ctx.createGain();
  envelope(amp.gain, t, o.gain ?? 0.2, o.attack ?? 0.002, o.dur);
  src.connect(f).connect(amp).connect(out);
  src.start(t, Math.random() * 1.5);
  src.stop(t + o.dur + 0.05);
}

/** Corda dedilhada (violão): dente de serra e triângulo com um filtro que fecha rápido. */
export function pluck(ctx: Ctx, out: AudioNode, t: number, freq: number, gain = 0.08, decay = 1.4, bright = 6): void {
  const amp = ctx.createGain();
  envelope(amp.gain, t, gain, 0.004, decay);
  const f = ctx.createBiquadFilter();
  f.type = 'lowpass';
  f.Q.value = 1.2;
  f.frequency.setValueAtTime(Math.min(12000, freq * bright), t);
  f.frequency.exponentialRampToValueAtTime(Math.max(200, freq * 1.2), t + decay * 0.6);
  f.connect(amp).connect(out);
  for (const [type, detune, level] of [
    ['sawtooth', -4, 0.6],
    ['triangle', 5, 1],
  ] as const) {
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    osc.detune.value = detune;
    g.gain.value = level;
    osc.connect(g).connect(f);
    osc.start(t);
    osc.stop(t + decay + 0.1);
  }
}

/** Sino: parciais inarmônicos com decaimentos diferentes. */
export function bell(ctx: Ctx, out: AudioNode, t: number, freq: number, gain = 0.15, decay = 4, partials = BELL_PARTIALS): void {
  for (const [ratio, level, d] of partials) {
    tone(ctx, out, t, { freq: freq * ratio, dur: decay * d, gain: gain * level, attack: 0.002 });
  }
}

export const BELL_PARTIALS: [number, number, number][] = [
  [0.5, 0.5, 1],
  [1, 1, 0.8],
  [1.183, 0.45, 0.6],
  [1.506, 0.35, 0.5],
  [2, 0.3, 0.4],
  [2.514, 0.2, 0.3],
  [3.011, 0.12, 0.25],
];

export const SMALL_BELL: [number, number, number][] = [
  [1, 1, 1],
  [2.76, 0.4, 0.5],
  [5.4, 0.2, 0.25],
];

/** Bigorna: parciais altos e secos, quase sem cauda. */
export const ANVIL: [number, number, number][] = [
  [1, 1, 0.5],
  [2.41, 0.55, 0.3],
  [3.86, 0.3, 0.18],
];

/** Tambor de pele: seno com queda de afinação mais um estalo de ruído. */
export function drum(ctx: Ctx, out: AudioNode, t: number, freq = 80, gain = 0.4, decay = 0.5): void {
  tone(ctx, out, t, { freq: freq * 2.4, dur: decay, gain, attack: 0.002, glide: { to: freq, time: 0.07 } });
  noise(ctx, out, t, { dur: 0.06, gain: gain * 0.35, filter: 'bandpass', freq: 1800, q: 0.8 });
}

/** Acorde de fundo (pad): vozes desafinadas, ataque lento e filtro escuro. */
export function pad(ctx: Ctx, out: AudioNode, t: number, freqs: number[], dur: number, gain = 0.035, cutoff = 900): void {
  const f = ctx.createBiquadFilter();
  f.type = 'lowpass';
  f.frequency.value = cutoff;
  f.Q.value = 0.5;
  const amp = ctx.createGain();
  const attack = Math.min(1.4, dur * 0.4);
  amp.gain.value = 0;
  amp.gain.setValueAtTime(SILENT, t);
  amp.gain.linearRampToValueAtTime(gain, t + attack);
  amp.gain.setValueAtTime(gain, t + dur);
  amp.gain.exponentialRampToValueAtTime(SILENT, t + dur + 1.6);
  f.connect(amp).connect(out);
  for (const freq of freqs) {
    for (const [type, detune] of [
      ['triangle', -7],
      ['sawtooth', 6],
    ] as const) {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = type;
      osc.frequency.value = freq;
      osc.detune.value = detune;
      g.gain.value = type === 'sawtooth' ? 0.35 : 1;
      osc.connect(g).connect(f);
      osc.start(t);
      osc.stop(t + dur + 1.7);
    }
  }
}

/** Metal (lâmina no escudo, corrente): parciais inarmônicos abafados. */
export function clank(ctx: Ctx, out: AudioNode, t: number, gain = 0.05, cutoff = 1600): void {
  const base = rand(700, 1100);
  const f = ctx.createBiquadFilter();
  f.type = 'lowpass';
  f.frequency.value = cutoff;
  f.connect(out);
  for (const [ratio, level] of [
    [1, 1],
    [1.59, 0.6],
    [2.31, 0.4],
    [3.17, 0.2],
  ] as const) {
    tone(ctx, f, t, { freq: base * ratio, dur: rand(0.15, 0.35), gain: gain * level, attack: 0.001 });
  }
  noise(ctx, f, t, { dur: 0.04, gain: gain * 0.8, filter: 'highpass', freq: 2000 });
}

/** Bolha que estoura (veneno, fungos, poção): seno que sobe rápido. */
export function blub(ctx: Ctx, out: AudioNode, t: number, freq = 300, gain = 0.04): void {
  tone(ctx, out, t, { freq, glide: { to: freq * rand(2, 2.8), time: 0.07 }, dur: 0.09, gain, attack: 0.004 });
}

/** Passos na terra: batidas abafadas. */
export function steps(ctx: Ctx, out: AudioNode, t: number, count: number, gap = 0.22, gain = 0.045): void {
  for (let i = 0; i < count; i++) noise(ctx, out, t + i * gap, { dur: 0.05, gain: gain * rand(0.7, 1), filter: 'lowpass', freq: rand(420, 620) });
}

/** Um laço contínuo de ruído filtrado (vento, água, multidão). Devolve o ganho, que começa mudo. */
export function noiseLoop(ctx: Ctx, out: AudioNode, filter: BiquadFilterType, freq: number, q = 0.7, lfo?: { rate: number; depth: number }): GainNode {
  const src = ctx.createBufferSource();
  src.buffer = noiseBuffer(ctx);
  src.loop = true;
  const f = ctx.createBiquadFilter();
  f.type = filter;
  f.frequency.value = freq;
  f.Q.value = q;
  const gain = ctx.createGain();
  gain.gain.value = 0;
  if (lfo) {
    const osc = ctx.createOscillator();
    const depth = ctx.createGain();
    osc.frequency.value = lfo.rate;
    depth.gain.value = lfo.depth;
    osc.connect(depth).connect(f.frequency);
    osc.start();
  }
  src.connect(f).connect(gain).connect(out);
  src.start(0, Math.random() * 1.5);
  return gain;
}
