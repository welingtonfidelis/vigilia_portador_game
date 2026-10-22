import { describe, expect, it } from 'vitest';
import { ARRIVE_TICKS, CARRIED_EXIT_TICKS, EXIT_TICKS, travelView } from '../src/game/travel.ts';
import { BALANCE, createWorld, step } from '../src/sim/index.ts';
import type { World } from '../src/sim/index.ts';

function until(w: World, cond: (w: World) => boolean, max = 50_000): void {
  for (let i = 0; i < max && !cond(w); i++) step(w);
  expect(cond(w)).toBe(true);
}

describe('viagem na tela', () => {
  it('descida: sai pela porta, viaja com a barra subindo e chega na sala', () => {
    const w = createWorld(3);
    step(w);
    expect(w.phase).toBe('descendo');
    const all = BALANCE.descendTicks(w.exp!.floor);
    expect(travelView(w).mode).toBe('saindo');
    for (let i = 0; i < EXIT_TICKS; i++) step(w);
    const v = travelView(w);
    expect(v.mode).toBe('viagem');
    expect(v.title).toBe(`Descendo ao andar ${w.exp!.floor}`);
    expect(v.progress).toBeLessThan(0.1);
    until(w, (x) => x.phaseEnd - x.tick <= 2);
    expect(travelView(w).progress).toBeGreaterThan(0.9);
    expect(travelView(w).left).toBeLessThanOrEqual(2);
    expect(all).toBeGreaterThan(EXIT_TICKS);
    until(w, (x) => x.phase === 'sala');
    expect(travelView(w).mode).toBe('chegando');
  });

  it('carregado: fica caído um instante antes do cartão, com título próprio', () => {
    const w = createWorld(4);
    until(w, (x) => x.room?.phase === 'luta' && x.room.enemies.some((e) => e.state === 'anel'));
    for (const e of w.room!.enemies) e.dmg = 1e6;
    w.hero.potions = 0;
    w.rules.combat = [];
    until(w, (x) => x.phase === 'voltando');
    expect(w.carried).toBe(true);
    expect(travelView(w)).toMatchObject({ mode: 'saindo', carried: true, title: 'Carregado de volta à vila' });
    for (let i = 0; i < CARRIED_EXIT_TICKS; i++) step(w);
    expect(travelView(w).mode).toBe('viagem');
  });

  it('na vila, logo depois de chegar, ainda está "chegando"; depois, nada', () => {
    const w = createWorld(5);
    until(w, (x) => x.room?.phase === 'luta');
    w.exp!.recall = true;
    until(w, (x) => x.phase === 'vila');
    w.rules.descent.repeat = false;
    expect(travelView(w).mode).toBe('chegando');
    for (let i = 0; i < ARRIVE_TICKS; i++) step(w);
    expect(travelView(w).mode).toBe('nenhum');
  });
});
