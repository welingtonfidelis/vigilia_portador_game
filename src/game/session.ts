/**
 * Ponte entre a tela e o núcleo, sem DOM nem Three: acumulador de tick fixo (10/s em 1×),
 * velocidade, pausa, eventos do quadro e save local com progresso offline.
 */
import { BALANCE, catchUp, createWorld, deserialize, serialize, step } from '../sim/index.ts';
import type { CatchUpResult, HeadId, SimEvent, World } from '../sim/index.ts';
import { readSave, writeSave } from './storage.ts';

export type Speed = 1 | 2 | 4;

export class Session {
  world: World;
  speed: Speed = 1;
  paused = false;
  private acc = 0;
  private listeners = new Set<() => void>();
  private lastSave = 0;
  /** Resultado do progresso offline ao abrir (para o "Enquanto você estava fora"). */
  away: CatchUpResult | null = null;
  /** Sem save: a tela de novo jogo abre e o tempo fica parado até "Começar". */
  isNew = false;

  constructor(world: World) {
    this.world = world;
  }

  static boot(): Session {
    const saved = readSave();
    if (saved) {
      try {
        const w = deserialize(saved.text);
        const s = new Session(w);
        const gone = Math.floor(((Date.now() - saved.at) / 1000) * BALANCE.ticksPerSecond);
        if (gone > 600) s.away = catchUp(w, gone);
        return s;
      } catch (e) {
        console.warn('save inválido, começando de novo', e);
      }
    }
    const s = new Session(createWorld((Date.now() % 1e9) >>> 0));
    s.isNew = true;
    s.paused = true;
    return s;
  }

  static fresh(head: HeadId, name?: string): Session {
    return new Session(createWorld((Date.now() % 1e9) >>> 0, head, name));
  }

  /** Fração do tick atual (para suavizar o 3D entre ticks). */
  get frac(): number {
    return this.acc / 100;
  }

  /** Roda os ticks do quadro. Mais de 2 s de atraso (aba parada) vira catchUp. */
  frame(dtMs: number): SimEvent[] {
    const ev: SimEvent[] = [];
    if (this.paused) return ev;
    this.acc += Math.min(dtMs, 2000) * this.speed;
    let n = Math.floor(this.acc / 100);
    this.acc -= n * 100;
    if (n > 40) {
      catchUp(this.world, n - 40);
      n = 40;
    }
    for (let i = 0; i < n; i++) step(this.world, ev);
    if (n > 0) this.emit();
    const now = Date.now();
    if (now - this.lastSave > 30_000) this.save();
    return ev;
  }

  /** Roda n ticks na hora (depuração e testes). */
  advance(n: number): SimEvent[] {
    const ev: SimEvent[] = [];
    for (let i = 0; i < n; i++) step(this.world, ev);
    this.emit();
    return ev;
  }

  /** Executa um comando e avisa a interface. */
  run<T>(fn: (w: World) => T): T {
    const r = fn(this.world);
    this.emit();
    return r;
  }

  save(): void {
    this.lastSave = Date.now();
    writeSave(serialize(this.world));
  }

  replace(s: Session): void {
    this.world = s.world;
    this.acc = 0;
    this.away = null;
    this.isNew = false;
    this.save();
    this.emit();
  }

  subscribe(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  emit(): void {
    for (const fn of this.listeners) fn();
  }
}
