import { describe, expect, it } from 'vitest';
import { CELL, CRYPT, FIRE, LOTS, daylight, fountainOn, housesStanding, lotView, roadCells, townHour } from '../src/game/townPlan.ts';
import { BALANCE, createWorld, serialize } from '../src/sim/index.ts';

/** Caixa de um lote em metros (as células têm 4 m e o centro da primeira é x, z). */
function box(l: (typeof LOTS)[number]) {
  return { x0: l.x - CELL / 2, x1: l.x + (l.w - 0.5) * CELL, z0: l.z - CELL / 2, z1: l.z + (l.d - 0.5) * CELL };
}

describe('planta da vila', () => {
  it('nenhum lote se sobrepõe a outro, às ruas, à fogueira ou à entrada da Cripta', () => {
    const boxes = LOTS.map(box);
    for (let i = 0; i < boxes.length; i++) {
      for (let j = i + 1; j < boxes.length; j++) {
        const a = boxes[i]!, b = boxes[j]!;
        const overlap = a.x0 < b.x1 && b.x0 < a.x1 && a.z0 < b.z1 && b.z0 < a.z1;
        expect(overlap, `${LOTS[i]!.id} × ${LOTS[j]!.id}`).toBe(false);
      }
      for (const [x, z] of roadCells()) {
        const a = boxes[i]!;
        const hit = a.x0 < x + 2 && x - 2 < a.x1 && a.z0 < z + 2 && z - 2 < a.z1;
        expect(hit, `${LOTS[i]!.id} × rua ${x},${z}`).toBe(false);
      }
      for (const p of [FIRE, CRYPT]) {
        const a = boxes[i]!;
        expect(p.x > a.x0 - 2 && p.x < a.x1 + 2 && p.z > a.z0 - 2 && p.z < a.z1 + 2, `${LOTS[i]!.id} × ${p.x},${p.z}`).toBe(false);
      }
    }
  });

  it('os 6 prédios do núcleo têm lote; casas sobem uma a cada 4 moradores', () => {
    for (const id of ['ferreiro', 'treinador', 'alquimista', 'carroceiro', 'curandeira', 'taticas']) {
      expect(LOTS.some((l) => l.kind === id)).toBe(true);
    }
    expect(housesStanding(0)).toBe(0);
    expect(housesStanding(1)).toBe(1);
    expect(housesStanding(4)).toBe(1);
    expect(housesStanding(5)).toBe(2);
    expect(housesStanding(999)).toBe(LOTS.filter((l) => l.kind === 'casa').length);
  });

  it('o estado de cada lote vem do núcleo: ruína, obra, pronto, ampliado e andaime na subida', () => {
    const w = createWorld(1);
    const lot = (id: string) => LOTS.find((l) => l.id === id)!;
    expect(lotView(w, lot('treinador'))).toEqual({ state: 'ruina', scaffold: false });
    expect(lotView(w, lot('ferreiro'))).toEqual({ state: 'pronta', scaffold: false });
    w.village.construction = { id: 'treinador', level: 1, end: 999 };
    expect(lotView(w, lot('treinador')).state).toBe('obra');
    w.village.construction = { id: 'ferreiro', level: 2, end: 999 };
    expect(lotView(w, lot('ferreiro'))).toEqual({ state: 'pronta', scaffold: true });
    w.village.buildings.ferreiro = 3;
    w.village.construction = null;
    expect(lotView(w, lot('ferreiro')).state).toBe('ampliada');
    expect(lotView(w, lot('casa1')).state).toBe('ruina');
    expect(lotView(w, lot('casa7')).state).toBe('vazio');
    w.village.people = 5;
    expect(lotView(w, lot('casa2')).state).toBe('pronta');
    expect(lotView(w, lot('casa3')).state).toBe('ruina');
  });

  it('dia e noite seguem o dia do jogo; a fonte jorra com 10 moradores', () => {
    expect(townHour(0)).toBe(6);
    expect(townHour(BALANCE.dayTicks / 4)).toBe(12);
    expect(townHour(BALANCE.dayTicks)).toBe(6);
    expect(daylight(12)).toBe(1);
    expect(daylight(2)).toBe(0);
    expect(daylight(6)).toBeCloseTo(0.5);
    const w = createWorld(2);
    expect(fountainOn(w)).toBe(false);
    w.village.people = 10;
    expect(fountainOn(w)).toBe(true);
  });

  it('nada da vila entra no save', () => {
    const w = createWorld(3);
    const before = serialize(w);
    for (const l of LOTS) lotView(w, l);
    expect(serialize(w)).toBe(before);
  });
});
