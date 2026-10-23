/**
 * Mesa de som (M4.1), a mesma do Vigília: um AudioContext com três canais (música, ambiente e
 * efeitos), cada um com volume próprio e um envio para o reverb, mais o geral e um compressor.
 * Cuida das manhas dos navegadores: liga no primeiro gesto e religa depois do segundo plano.
 */

import { impulse } from './instruments.ts';

export type Bus = 'music' | 'ambient' | 'sfx';

export interface Levels {
  muted: boolean;
  master: number;
  music: number;
  ambient: number;
  sfx: number;
}

const REVERB_SEND: Record<Bus, number> = { music: 0.35, ambient: 0.2, sfx: 0.25 };

interface Channel {
  input: GainNode;
  volume: GainNode;
}

export class AudioEngine {
  ctx: AudioContext | null = null;
  /** Sobe a cada contexto novo: quem guarda nós do contexto antigo precisa recriá-los. */
  generation = 0;
  private master: GainNode | null = null;
  private channels = new Map<Bus, Channel>();
  private levels: Levels = { muted: false, master: 0.8, music: 0.45, ambient: 0.6, sfx: 0.85 };
  private readonly create: () => AudioContext;
  /** Safari do iPhone/iPad: ao voltar do segundo plano o contexto antigo pode ficar mudo. */
  private readonly recreateOnReturn: boolean;
  /** Um gesto já pediu para retomar e o contexto ainda não voltou a rodar. */
  private resumePending = false;
  /** O relógio do áudio parou com o contexto "rodando" (contexto morto). */
  private stale = false;
  /** A página foi para o segundo plano desde o último gesto. */
  private wasHidden = false;
  private clock: { audio: number; wall: number } | null = null;

  constructor(create: () => AudioContext = createContext, recreateOnReturn = isAppleTouch()) {
    this.create = create;
    this.recreateOnReturn = recreateOnReturn;
  }

  /**
   * Chamado a cada gesto do jogador. Cria o contexto na primeira vez e depois retoma
   * o que estiver parado. Quando retomar não basta (Safari ao voltar do segundo plano:
   * contexto "interrupted", ou "running" mas mudo e congelado), descarta o contexto e
   * cria outro dentro do gesto, que é o único momento em que o navegador permite.
   */
  wake(): boolean {
    const state = this.ctx?.state;
    const broken = state === 'closed' || this.stale || this.resumePending || (this.wasHidden && this.recreateOnReturn);
    this.wasHidden = false;
    if (this.ctx && broken) this.dispose();
    if (!this.ctx) {
      let ctx: AudioContext;
      try {
        ctx = this.create();
      } catch {
        return false;
      }
      this.ctx = ctx;
      this.generation++;
      ctx.addEventListener?.('statechange', () => {
        if (ctx.state === 'running') this.resumePending = false;
      });
      this.build(ctx);
    }
    if (this.ctx.state !== 'running') {
      const ctx = this.ctx;
      this.resumePending = true;
      void ctx
        .resume()
        .then(() => {
          if (ctx.state === 'running') this.resumePending = false;
        })
        .catch(() => {});
    }
    return true;
  }

  /** Tenta retomar sem gesto (ao voltar para a aba). Chrome/Android aceitam; o Safari às vezes não. */
  resumeQuietly(): void {
    const state = this.ctx?.state;
    if (this.ctx && state !== 'running' && state !== 'closed') void this.ctx.resume().catch(() => {});
  }

  /** A página foi para o segundo plano: pausa o áudio e marca que voltou de lá. */
  sleep(): void {
    this.wasHidden = true;
    this.clock = null;
    if (this.ctx?.state === 'running') void this.ctx.suspend().catch(() => {});
  }

  get running(): boolean {
    return this.ctx?.state === 'running' && !this.stale;
  }

  /** O som só volta com um toque (para avisar o jogador). */
  get needsGesture(): boolean {
    return !!this.ctx && (!this.running || (this.wasHidden && this.recreateOnReturn));
  }

  /**
   * Vigia o relógio do áudio com a página visível: se o contexto diz "running" mas o
   * tempo não anda, ele morreu e o próximo gesto cria outro.
   */
  watch(): void {
    const ctx = this.ctx;
    if (!ctx || ctx.state !== 'running') {
      this.clock = null;
      return;
    }
    const wall = performance.now();
    if (!this.clock) {
      this.clock = { audio: ctx.currentTime, wall };
      return;
    }
    if (wall - this.clock.wall < 1500) return;
    this.stale = ctx.currentTime - this.clock.audio < 0.2;
    this.clock = { audio: ctx.currentTime, wall };
  }

  private dispose(): void {
    const old = this.ctx;
    this.ctx = null;
    this.master = null;
    this.channels.clear();
    this.stale = false;
    this.resumePending = false;
    this.clock = null;
    void old?.close().catch(() => {});
  }

  /** Entrada de um canal, onde os instrumentos se conectam. */
  out(bus: Bus): AudioNode | null {
    return this.channels.get(bus)?.input ?? null;
  }

  setLevels(levels: Levels): void {
    const same = (Object.keys(levels) as (keyof Levels)[]).every((k) => levels[k] === this.levels[k]);
    this.levels = levels;
    if (!same) this.applyLevels();
  }

  /** Leva os volumes guardados para os nós (na criação do contexto e a cada mudança). */
  private applyLevels(): void {
    if (!this.ctx || !this.master) return;
    const now = this.ctx.currentTime;
    this.master.gain.setTargetAtTime(this.levels.muted ? 0 : this.levels.master, now, 0.05);
    for (const [bus, ch] of this.channels) ch.volume.gain.setTargetAtTime(this.levels[bus], now, 0.05);
  }

  private build(ctx: AudioContext): void {
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.knee.value = 12;
    comp.ratio.value = 4;
    comp.attack.value = 0.005;
    comp.release.value = 0.25;
    comp.connect(ctx.destination);

    this.master = ctx.createGain();
    this.master.connect(comp);

    const reverb = ctx.createConvolver();
    reverb.buffer = impulse(ctx, 2.2, 2.8);
    const reverbOut = ctx.createGain();
    reverbOut.gain.value = 0.9;
    reverb.connect(reverbOut).connect(this.master);

    for (const bus of ['music', 'ambient', 'sfx'] as const) {
      const input = ctx.createGain();
      const volume = ctx.createGain();
      const send = ctx.createGain();
      send.gain.value = REVERB_SEND[bus];
      input.connect(volume);
      volume.connect(this.master);
      volume.connect(send).connect(reverb);
      this.channels.set(bus, { input, volume });
    }
    this.applyLevels();
  }
}

/**
 * 'balanced' troca alguns milissegundos de latência por menos cortes em máquinas
 * mais fracas. No iPhone, a sessão 'playback' faz o som tocar mesmo com a chave
 * de silencioso ligada (Safari 17+); sem ela o Web Audio fica mudo nesse modo.
 */
function createContext(): AudioContext {
  const nav = navigator as Navigator & { audioSession?: { type: string } };
  try {
    if (nav.audioSession) nav.audioSession.type = 'playback';
  } catch {
    // Navegador sem a API de sessão de áudio: segue sem ela.
  }
  return new AudioContext({ latencyHint: 'balanced' });
}

/** iPhone, iPod e iPad (o iPadOS se apresenta como Mac, mas tem toque). */
function isAppleTouch(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent;
  return /iPad|iPhone|iPod/.test(ua) || (ua.includes('Macintosh') && navigator.maxTouchPoints > 1);
}
