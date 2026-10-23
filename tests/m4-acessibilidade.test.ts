import { describe, expect, it } from 'vitest';
import { CAPTION_GAP_MS, CaptionPlanner, CAPTIONS, VIBRATION } from '../src/audio/director.ts';
import { DEFAULT_PREFS, parsePrefs, TEXT_SCALE } from '../src/game/prefs.ts';
import { ease, MOTION } from '../src/render/motion.ts';
import { commands, createWorld, heroStats, step } from '../src/sim/index.ts';
import type { SimEvent, World } from '../src/sim/index.ts';

/** O herói na vila, de vida cheia, pronto para descer. */
function rested(): World {
  const w = createWorld(11);
  w.phase = 'vila';
  w.hold = false;
  w.hero.hp = heroStats(w).maxHp;
  return w;
}

const run = (w: World, ticks: number) => {
  const ev: SimEvent[] = [];
  for (let i = 0; i < ticks; i++) step(w, ev);
  return ev;
};

describe('modo da vila: Auto e Manual', () => {
  it('no Auto, o herói descansado desce sozinho; no Manual, espera, e o tempo segue', () => {
    const auto = rested();
    commands.setAuto(auto, true);
    run(auto, 5);
    expect(auto.phase).toBe('descendo');

    const manual = rested();
    commands.setAuto(manual, false);
    const tick = manual.tick;
    run(manual, 600);
    expect(manual.phase).toBe('vila');
    expect(manual.tick).toBe(tick + 600);
    // A ordem "Descer" vale no Manual.
    expect(commands.descend(manual, [])).toBeNull();
    expect(manual.phase).toBe('descendo');
  });

  it('o modo é a regra "Descer de novo" e não mexe nas outras regras da descida', () => {
    const w = rested();
    const before = { ...w.rules.descent };
    commands.setAuto(w, false);
    expect(w.rules.descent).toEqual({ ...before, repeat: false });
    commands.setAuto(w, true);
    expect(w.rules.descent).toEqual({ ...before, repeat: true });
  });
});

describe('preferências de acessibilidade', () => {
  it('tamanho do texto, movimento, legendas e vibração, campo a campo', () => {
    expect(parsePrefs(JSON.stringify({ textSize: 'maior', reduceMotion: true, captions: true, vibrate: false }))).toEqual({
      ...DEFAULT_PREFS, textSize: 'maior', reduceMotion: true, captions: true, vibrate: false,
    });
    expect(parsePrefs(JSON.stringify({ textSize: 'gigante', reduceMotion: 'sim' }))).toEqual(DEFAULT_PREFS);
    // O padrão do aparelho (quem pediu menos movimento ao sistema) vale quando o campo falta.
    expect(parsePrefs(JSON.stringify({ muted: true }), { ...DEFAULT_PREFS, reduceMotion: true }).reduceMotion).toBe(true);
    expect(Object.values(TEXT_SCALE)).toEqual([1, 1.12, 1.25]);
  });

  it('com o movimento reduzido, a câmera chega na hora', () => {
    MOTION.reduced = false;
    expect(ease(1 / 60, 4)).toBeCloseTo(1 - Math.exp(-4 / 60));
    MOTION.reduced = true;
    expect(ease(1 / 60, 4)).toBe(1);
    MOTION.reduced = false;
  });
});

describe('jogar sem som: legendas e vibração', () => {
  it('a legenda sai só para os sons sem aviso e não se repete em seguida', () => {
    const captions = new CaptionPlanner();
    const planned = [{ sfx: 'bossRoom' as const, delay: 0 }, { sfx: 'hit' as const, delay: 0 }, { sfx: 'venom' as const, delay: 0 }];
    expect(captions.pick(planned, 0)).toEqual([CAPTIONS.bossRoom, CAPTIONS.venom]);
    expect(captions.pick(planned, 1000)).toEqual([]);
    expect(captions.pick(planned, CAPTION_GAP_MS + 1)).toHaveLength(2);
    // Morte, nível e lendária já têm aviso próprio: sem legenda.
    expect(CAPTIONS.death ?? CAPTIONS.level ?? CAPTIONS.legend).toBeUndefined();
  });

  it('vibra na morte e no chefe vencido, com padrões curtos', () => {
    expect(Object.keys(VIBRATION).sort()).toEqual(['bossDown', 'death']);
    for (const p of Object.values(VIBRATION)) expect(p!.reduce((a, b) => a + b, 0)).toBeLessThan(500);
  });
});
