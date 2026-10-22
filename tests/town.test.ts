import { describe, expect, it } from 'vitest';
import {
  CRYPT, CRYPT_DOOR, FIRE, ISLAND, LOTS, PATHS, SEAT, STAIRS, TERRACE_Y,
  daylight, heightAt, housesStanding, inBox, lotBox, lotView, townHour, townStage,
} from '../src/game/townPlan.ts';
import { BALANCE, createWorld, serialize } from '../src/sim/index.ts';

const shrink = (b: ReturnType<typeof lotBox>, m: number) => ({ x0: b.x0 + m, x1: b.x1 - m, z0: b.z0 + m, z1: b.z1 - m });

describe('planta da vila', () => {
  it('nenhum lote se sobrepõe a outro, aos caminhos, à escada, à fogueira ou à capela', () => {
    const boxes = LOTS.map(lotBox);
    for (let i = 0; i < boxes.length; i++) {
      const a = boxes[i]!;
      for (let j = i + 1; j < boxes.length; j++) {
        const b = boxes[j]!;
        expect(a.x0 < b.x1 && b.x0 < a.x1 && a.z0 < b.z1 && b.z0 < a.z1, `${LOTS[i]!.id} × ${LOTS[j]!.id}`).toBe(false);
      }
      const inner = shrink(a, 0.5);
      for (const path of PATHS) {
        for (let k = 1; k < path.pts.length; k++) {
          const [x0, z0] = path.pts[k - 1]!, [x1, z1] = path.pts[k]!;
          for (let t = 0; t <= 1; t += 0.05) {
            expect(inBox(x0 + (x1 - x0) * t, z0 + (z1 - z0) * t, inner), `${LOTS[i]!.id} × caminho`).toBe(false);
          }
        }
      }
      const stairs = { x0: STAIRS.x0, x1: STAIRS.x1, z0: STAIRS.zTop, z1: STAIRS.zBottom };
      expect(a.x0 < stairs.x1 && stairs.x0 < a.x1 && a.z0 < stairs.z1 && stairs.z0 < a.z1, `${LOTS[i]!.id} × escada`).toBe(false);
      for (const p of [FIRE, CRYPT, SEAT, CRYPT_DOOR]) expect(inBox(p.x, p.z, shrink(a, -2)), `${LOTS[i]!.id} × ${p.x},${p.z}`).toBe(false);
    }
  });

  it('cada lote fica dentro da ilha e num chão só (sem cair na beira de um platô)', () => {
    for (const l of LOTS) {
      const b = lotBox(l);
      const corners: [number, number][] = [[b.x0, b.z0], [b.x1, b.z0], [b.x0, b.z1], [b.x1, b.z1], [(b.x0 + b.x1) / 2, (b.z0 + b.z1) / 2]];
      const ys = corners.map(([x, z]) => heightAt(x, z));
      expect(new Set(ys).size, l.id).toBe(1);
      for (const [x, z] of corners) expect(x > ISLAND.x0 + 1 && x < ISLAND.x1 - 1 && z > ISLAND.z0 + 1 && z < ISLAND.z1 - 1, l.id).toBe(true);
    }
  });

  it('a escada liga a praça à ponte; a fogueira e a porta da capela ficam no mesmo platô', () => {
    const mid = (STAIRS.x0 + STAIRS.x1) / 2;
    expect(heightAt(mid, STAIRS.zBottom + 1)).toBe(0);
    expect(heightAt(mid, STAIRS.zTop)).toBe(TERRACE_Y);
    expect(heightAt(mid, (STAIRS.zTop + STAIRS.zBottom) / 2)).toBeCloseTo(TERRACE_Y / 2);
    // Do lugar na fogueira até a porta, o herói anda sem descer nem subir.
    for (let t = 0; t <= 1; t += 0.05) {
      expect(heightAt(SEAT.x + (CRYPT_DOOR.x - SEAT.x) * t, SEAT.z + (CRYPT_DOOR.z - SEAT.z) * t)).toBe(TERRACE_Y);
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
    w.village.people = 5;
    expect(lotView(w, lot('casa2')).state).toBe('pronta');
    expect(lotView(w, lot('casa3')).state).toBe('ruina');
  });

  it('o estágio segue o progresso: destruída, reconstruída, melhorada e melhorada de novo', () => {
    const w = createWorld(4);
    expect(townStage(w)).toBe(0);
    w.village.buildings.treinador = 1;
    w.village.buildings.alquimista = 1;
    expect(townStage(w)).toBe(1);
    w.bossesBeaten.push(5);
    expect(townStage(w)).toBe(2);
    w.bossesBeaten.push(10);
    expect(townStage(w)).toBe(2);
    w.village.people = 10;
    expect(townStage(w)).toBe(3);
    // Sem 3 prédios de pé, continua destruída, mesmo com os chefes vencidos.
    w.village.buildings.treinador = 0;
    expect(townStage(w)).toBe(0);
  });

  it('dia e noite seguem o dia do jogo', () => {
    expect(townHour(0)).toBe(6);
    expect(townHour(BALANCE.dayTicks / 4)).toBe(12);
    expect(townHour(BALANCE.dayTicks)).toBe(6);
    expect(daylight(12)).toBe(1);
    expect(daylight(2)).toBe(0);
    expect(daylight(6)).toBeCloseTo(0.5);
  });

  it('nada da vila entra no save', () => {
    const w = createWorld(3);
    const before = serialize(w);
    for (const l of LOTS) lotView(w, l);
    townStage(w);
    expect(serialize(w)).toBe(before);
  });
});
