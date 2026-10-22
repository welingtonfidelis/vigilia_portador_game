import { describe, expect, it } from 'vitest';
import {
  BENCHES, DEPOT, MARKET, NODES, SPOTS, WOODPILE,
  CHICK_YARD, activeJob, catNap, doing, lifeMarks, petDoing, pets, resident, residentLabel, residents, route, strollPoint,
} from '../src/game/townFolk.ts';
import { ISLAND, LOTS, PATHS, PLAZA, heightAt, inBox, lotBox } from '../src/game/townPlan.ts';
import { BALANCE, createWorld, serialize } from '../src/sim/index.ts';

const inLot = (x: number, z: number, m = 0) => LOTS.some((l) => {
  const b = lotBox(l);
  return inBox(x, z, { x0: b.x0 + m, x1: b.x1 - m, z0: b.z0 + m, z1: b.z1 - m });
});

describe('moradores da vila', () => {
  it('a mesma semente dá sempre o mesmo morador (nome, rosto, roupa e ofício)', () => {
    expect(resident(7, 3)).toEqual(resident(7, 3));
    const a = Array.from({ length: 12 }, (_, i) => resident(7, i));
    const b = Array.from({ length: 12 }, (_, i) => resident(8, i));
    expect(a.map((r) => r.job)).toEqual(b.map((r) => r.job));
    expect(a.map((r) => r.name)).not.toEqual(b.map((r) => r.name));
    // As crianças são os moradores 6, 7 e 10 (na ordem de chegada).
    expect(a.filter((r) => r.child).map((r) => r.n)).toEqual([5, 6, 9]);
    // Ninguém repete o nome entre os 24 primeiros.
    const names = Array.from({ length: 24 }, (_, i) => resident(7, i).name);
    expect(new Set(names).size).toBe(24);
  });

  it('a lista segue os moradores do núcleo e respeita o teto da tela', () => {
    const w = createWorld(3);
    expect(residents(w, 24)).toHaveLength(0);
    w.village.people = 9;
    expect(residents(w, 24)).toHaveLength(9);
    expect(residents(w, 4)).toHaveLength(4);
  });

  it('os marcos de vida vêm do estado: feira, lenhador, músico, crianças e a festa', () => {
    const w = createWorld(5);
    w.village.people = 3;
    expect(lifeMarks(w)).toMatchObject({ stalls: 0, lenhador: false, musico: false, criancas: false, festa: false });
    w.village.people = 4;
    expect(lifeMarks(w)).toMatchObject({ stalls: 1, lenhador: true });
    w.bossesBeaten.push(5);
    w.village.people = 6;
    expect(lifeMarks(w)).toMatchObject({ stalls: 3, musico: true, criancas: true });
    w.bossesBeaten.push(10);
    w.stats.bossFirst['10'] = w.tick;
    expect(lifeMarks(w)).toMatchObject({ festa: true, bandeirolas: true });
    w.tick += BALANCE.dayTicks;
    expect(lifeMarks(w)).toMatchObject({ festa: false, bandeirolas: true });
  });

  it('o ofício só começa com o marco dele; antes, o morador passeia', () => {
    const w = createWorld(9);
    w.village.people = 8;
    const musico = resident(w.seed, 7);
    expect(musico.job).toBe('musico');
    expect(activeJob(musico, lifeMarks(w))).toBe('passante');
    w.bossesBeaten.push(5);
    expect(activeJob(musico, lifeMarks(w))).toBe('musico');
    expect(residentLabel(musico, lifeMarks(w))).toMatch(/^.+, músic[oa]$/);
  });

  it('a rotina segue a hora: trabalho de dia, música ao entardecer, todos em casa à noite', () => {
    const w = createWorld(11);
    w.village.people = 10;
    w.bossesBeaten.push(5);
    const m = lifeMarks(w);
    const smith = resident(w.seed, 1);
    expect(doing(smith, 10, m)).toMatchObject({ at: 'ponto', anim: 'Hammering', prop: 'martelo' });
    expect(doing(smith, 12.5, m)).toMatchObject({ at: 'passeio', area: 'praca' });
    expect(doing(smith, 23, m)).toEqual({ at: 'casa' });
    const musico = resident(w.seed, 7);
    expect(doing(musico, 10, m).at).toBe('passeio');
    expect(doing(musico, 20, m)).toMatchObject({ at: 'ponto', prop: 'violao' });
    const kid = resident(w.seed, 5);
    expect(doing(kid, 10, m)).toMatchObject({ at: 'passeio', area: 'praca', run: true });
    expect(doing(kid, 20, m)).toEqual({ at: 'casa' });
    expect(doing(resident(w.seed, 4), 10, m)).toEqual({ at: 'carrega' });
    // Na festa, todo mundo vai para a praça.
    expect(doing(smith, 10, { ...m, festa: true })).toEqual({ at: 'festa' });
  });

  it('a feira, os bancos, a lenha e as caixas ficam fora dos lotes e dos caminhos', () => {
    const near = (x: number, z: number, m: number) => PATHS.some((p) => p.pts.some((pt, k) => {
      if (!k) return false;
      const [x0, z0] = p.pts[k - 1]!, [x1, z1] = pt;
      const dx = x1 - x0, dz = z1 - z0;
      const t = Math.max(0, Math.min(1, ((x - x0) * dx + (z - z0) * dz) / (dx * dx + dz * dz)));
      return Math.hypot(x - x0 - dx * t, z - z0 - dz * t) < p.width / 2 + m;
    }));
    for (const s of [...MARKET, ...BENCHES, WOODPILE, DEPOT]) {
      expect(inLot(s.x, s.z, -1.5), `${s.x},${s.z} × lote`).toBe(false);
      expect(near(s.x, s.z, 1), `${s.x},${s.z} × caminho`).toBe(false);
      expect(heightAt(s.x, s.z)).toBe(0);
    }
    for (const s of MARKET) expect(Math.hypot(s.x - PLAZA.x, s.z - PLAZA.z)).toBeGreaterThan(PLAZA.r - 0.5);
  });

  it('a rede de caminhos liga todos os pontos de trabalho, sem atravessar casas nem a fonte', () => {
    expect(NODES.length).toBeGreaterThan(20);
    const spots = [SPOTS.bigorna, SPOTS.lenha, SPOTS.deposito, ...SPOTS.barraca, ...SPOTS.banco];
    for (const a of spots) {
      for (const b of spots) {
        const r = route([a.x, a.z], [b.x, b.z]);
        expect(r[0]).toEqual([a.x, a.z]);
        expect(r[r.length - 1]).toEqual([b.x, b.z]);
        // Os trechos entre pontos da rede não entram em lote nem na fonte (as pontas saem da porta).
        for (let k = 2; k < r.length - 1; k++) {
          const [x0, z0] = r[k - 1]!, [x1, z1] = r[k]!;
          for (let t = 0; t <= 1; t += 0.1) {
            const x = x0 + (x1 - x0) * t, z = z0 + (z1 - z0) * t;
            expect(inLot(x, z, 0.3), `${x},${z}`).toBe(false);
            expect(Math.hypot(x - PLAZA.x, z - PLAZA.z)).toBeGreaterThan(4.1);
            expect(x > ISLAND.x0 && x < ISLAND.x1 && z > ISLAND.z0 && z < ISLAND.z1).toBe(true);
          }
        }
      }
    }
  });

  it('os passeios da praça ficam em volta da fonte, sem entrar nela', () => {
    let seed = 1;
    const pick = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
    for (let i = 0; i < 200; i++) {
      const [x, z] = strollPoint('praca', pick);
      expect(Math.hypot(x - PLAZA.x, z - PLAZA.z)).toBeGreaterThan(4.4);
    }
  });

  it('no máximo 3 bichos de casa, que chegam com os moradores e seguem o dia', () => {
    const w = createWorld(21);
    expect(pets(w)).toEqual([]);
    w.village.people = 4;
    expect(pets(w)).toEqual(['cachorro', 'pintinho']);
    w.village.people = 40;
    expect(pets(w)).toEqual(['cachorro', 'pintinho', 'gato']);
    expect(petDoing('pintinho', 10, 1)).toEqual({ at: 'cisca' });
    expect(petDoing('pintinho', 23, 1)).toEqual({ at: 'casa' });
    expect(petDoing('gato', 10, 3)).toMatchObject({ at: 'ponto', anim: 'idle' });
    expect(petDoing('gato', 18, 3)).toMatchObject({ at: 'passeio', area: 'praca' });
    expect(petDoing('cachorro', 2, 1)).toMatchObject({ at: 'ponto', anim: 'static' });
    // O cercadinho do pintinho e o cochilo do gato ficam fora dos lotes e no chão da praça.
    expect(inLot(CHICK_YARD.x, CHICK_YARD.z, -CHICK_YARD.r)).toBe(false);
    for (const st of [1, 3]) {
      const c = catNap(st);
      expect(inLot(c.x, c.z, -0.5)).toBe(false);
      expect(heightAt(c.x, c.z)).toBe(0);
    }
  });

  it('nada dos moradores entra no save', () => {
    const w = createWorld(13);
    w.village.people = 12;
    const before = serialize(w);
    const m = lifeMarks(w);
    for (const r of residents(w, 24)) doing(r, 10, m);
    expect(serialize(w)).toBe(before);
  });
});
