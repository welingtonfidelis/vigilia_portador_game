import { describe, expect, it } from 'vitest';
import { AmbiencePlayer } from '../src/audio/ambience.ts';
import {
  changeCues, CuePlanner, cuesFor, cuesInScene, FIGHT_PER_SECOND, HIT_GAP_S, lifeOf, moodOf, MOURNING_TICKS, sceneOf, snapshot, STAGGER_S,
} from '../src/audio/director.ts';
import type { Mood, Scene } from '../src/audio/director.ts';
import { AudioEngine } from '../src/audio/engine.ts';
import { ACTIVATION_EVENTS, installUnlock } from '../src/audio/index.ts';
import { MusicPlayer, STYLES } from '../src/audio/music.ts';
import { SFX, SFX_NAMES } from '../src/audio/sfx.ts';
import { DEFAULT_PREFS, parsePrefs, PrefsStore } from '../src/game/prefs.ts';
import { makeEnemy } from '../src/sim/combat.ts';
import { BALANCE, createWorld, heroStats } from '../src/sim/index.ts';
import type { EnemyKind, SimEvent, World } from '../src/sim/index.ts';

// ── Um AudioContext falso, que reclama do que o navegador reclamaria (rampa exponencial até zero,
// valores que não são números) e conta os nós criados.

class Param {
  value = 0;
  private check(v: number): void {
    if (!Number.isFinite(v)) throw new Error(`valor inválido: ${v}`);
  }
  setValueAtTime(v: number, t: number) {
    this.check(v);
    this.check(t);
    return this;
  }
  linearRampToValueAtTime(v: number, t: number) {
    this.check(v);
    this.check(t);
    return this;
  }
  exponentialRampToValueAtTime(v: number, t: number) {
    this.check(t);
    if (!(v > 0) || !Number.isFinite(v)) throw new RangeError(`rampa exponencial até ${v}`);
    return this;
  }
  setTargetAtTime(v: number, t: number, c: number) {
    this.check(v);
    this.check(t);
    this.check(c);
    return this;
  }
}

interface Log {
  nodes: number;
  gains: number[];
  resumes: number;
  closes: number;
}

function fakeContext(opts: { resumeWorks?: boolean } = {}) {
  const log: Log = { nodes: 0, gains: [], resumes: 0, closes: 0 };
  const node = <T extends object>(extra: T) => {
    log.nodes++;
    return { connect: (n: unknown) => n, disconnect: () => {}, ...extra };
  };
  const source = <T extends object>(extra: T) =>
    node({
      ...extra,
      start: (t = 0) => {
        if (!Number.isFinite(t)) throw new Error('start inválido');
      },
      stop: (t = 0) => {
        if (!Number.isFinite(t)) throw new Error('stop inválido');
      },
    });
  const ctx = {
    currentTime: 0,
    sampleRate: 8000,
    state: 'suspended' as AudioContextState,
    destination: {},
    log,
    createOscillator: () => source({ type: 'sine', frequency: new Param(), detune: new Param() }),
    createBufferSource: () => source({ buffer: null as unknown, loop: false }),
    createGain: () => {
      const gain = new Param();
      // Os ganhos que a mesa ajusta com setTargetAtTime ficam no registro (volumes).
      const set = gain.setTargetAtTime.bind(gain);
      gain.setTargetAtTime = (v: number, t: number, c: number) => {
        log.gains.push(v);
        return set(v, t, c);
      };
      return node({ gain });
    },
    createBiquadFilter: () => node({ type: 'lowpass', frequency: new Param(), Q: new Param() }),
    createStereoPanner: () => node({ pan: new Param() }),
    createConvolver: () => node({ buffer: null as unknown }),
    createDynamicsCompressor: () => node({ threshold: new Param(), knee: new Param(), ratio: new Param(), attack: new Param(), release: new Param() }),
    createBuffer: (channels: number, length: number) => {
      const data = Array.from({ length: channels }, () => new Float32Array(length));
      return { getChannelData: (c: number) => data[c]! };
    },
    addEventListener: () => {},
    resume: () => {
      log.resumes++;
      if (opts.resumeWorks !== false) ctx.state = 'running';
      return Promise.resolve();
    },
    suspend: () => {
      ctx.state = 'suspended';
      return Promise.resolve();
    },
    close: () => {
      log.closes++;
      ctx.state = 'closed';
      return Promise.resolve();
    },
  };
  return ctx;
}

type Fake = ReturnType<typeof fakeContext>;
const asCtx = (c: Fake) => c as unknown as AudioContext;
const OUT = {} as AudioNode;

// ── Mundos de teste

/** Uma sala montada à mão no andar dado, com os inimigos dados. */
function room(kinds: EnemyKind[], floor: number): World {
  const w = createWorld(5);
  w.phase = 'sala';
  w.hero.deepest = floor;
  w.hero.hp = heroStats(w).maxHp;
  w.exp = { floor, room: 1, bag: { gold: 0, mats: { ossos: 0, ferro: 0, ferro_negro: 0, esporos: 0 }, items: [], people: 0 }, started: 0, recall: false, leaving: null, kills: 0 };
  w.room = {
    floor, index: 1, kind: 'combate', enemies: kinds.map((k) => makeEnemy(w, k, floor, null, 0)), phase: 'luta', phaseEnd: 0, look: 1,
    fightStart: w.tick, fearUntil: 0, hpAtStart: w.hero.hp, phase2At: 0,
  };
  return w;
}

/** Tick do primeiro dia na hora dada (o dia começa às 6 h). */
const at = (hour: number) => Math.round((((hour - 6 + 24) % 24) / 24) * BALANCE.dayTicks);

const sfx = (cues: { sfx: string }[]) => cues.map((c) => c.sfx);

describe('diretor de som: eventos → efeitos', () => {
  it('golpes, acertos e críticos; a habilidade tem som próprio', () => {
    const w = room(['lacaio'], 3);
    const id = w.room!.enemies[0]!.id;
    const ev: SimEvent[] = [
      { t: 'golpe', tick: 0, skill: null, target: id, end: 5 },
      { t: 'golpe', tick: 0, skill: 'golpe_amplo', target: id, end: 5 },
      { t: 'acerto', tick: 0, target: id, dmg: 5, crit: false, blocked: false },
      { t: 'acerto', tick: 0, target: id, dmg: 9, crit: true, blocked: false },
      { t: 'acerto', tick: 0, target: id, dmg: 2, crit: false, blocked: true },
    ];
    expect(sfx(cuesFor(ev, w))).toEqual(['swing', 'sweep', 'hit', 'crit', 'parry']);
  });

  it('a lâmina na couraça soa como metal grosso', () => {
    const w = room(['couraca'], 20);
    const e = w.room!.enemies[0]!;
    expect(e.armor).toBeGreaterThan(0);
    expect(sfx(cuesFor([{ t: 'acerto', tick: 0, target: e.id, dmg: 5, crit: false, blocked: false }], w))).toEqual(['armor']);
  });

  it('o inimigo morre: ossos na Cripta e nas Minas, fungo nos Fungos, fanfarra no chefe', () => {
    const crypt = room(['lacaio', 'senhor'], 10);
    const [minion, boss] = crypt.room!.enemies;
    expect(sfx(cuesFor([{ t: 'inimigoMorre', tick: 0, enemy: minion!.id }], crypt))).toEqual(['bones']);
    expect(sfx(cuesFor([{ t: 'inimigoMorre', tick: 0, enemy: boss!.id }], crypt))).toEqual(['bossDown']);
    const fungi = room(['esporento'], 24);
    expect(sfx(cuesFor([{ t: 'inimigoMorre', tick: 0, enemy: fungi.room!.enemies[0]!.id }], fungi))).toEqual(['squish']);
  });

  it('a descida: porta, sala do chefe, saque, morte, volta e a lendária', () => {
    const w = room([], 5);
    const ev: SimEvent[] = [
      { t: 'salaNova', tick: 0, floor: 5, room: 1, kind: 'combate' },
      { t: 'salaNova', tick: 0, floor: 5, room: 6, kind: 'chefe' },
      { t: 'saque', tick: 0, text: 'Espada' },
      { t: 'heroiMorre', tick: 0 },
      { t: 'voltou', tick: 0, died: true },
      { t: 'voltou', tick: 0, died: false },
      { t: 'aviso', tick: 0, text: 'x', tone: 'lenda' },
      { t: 'aviso', tick: 0, text: 'x', tone: 'neutro' },
    ];
    expect(sfx(cuesFor(ev, w))).toEqual(['door', 'bossRoom', 'loot', 'death', 'return', 'legend']);
  });

  it('o que não tem evento sai da mudança do estado: nível, veneno, obra pronta e morador novo', () => {
    const w = room([], 24);
    const a = snapshot(w);
    expect(changeCues(null, a)).toEqual([]);
    w.hero.level++;
    w.hero.poison.push(w.tick + 10);
    w.village.buildings.ferreiro++;
    w.village.people++;
    expect(sfx(changeCues(a, snapshot(w)))).toEqual(['level', 'venom', 'build', 'arrival']);
    // Veneno vencendo não toca nada.
    const b = snapshot(w);
    w.tick += 20;
    expect(changeCues(b, snapshot(w))).toEqual([]);
  });

  it('com a vila na tela, a luta lá embaixo fica muda e só os avisos passam', () => {
    const cues = [
      { sfx: 'hit' as const, priority: 2 },
      { sfx: 'death' as const, priority: 10 },
      { sfx: 'level' as const, priority: 7 },
      { sfx: 'bones' as const, priority: 3 },
    ];
    expect(sfx(cuesInScene(cues, 'vila'))).toEqual(['death', 'level']);
    expect(cuesInScene(cues, 'cripta')).toHaveLength(4);
  });

  it('todo efeito tem receita, e toda receita roda num contexto de verdade (sem rampa até zero)', () => {
    const ctx = fakeContext();
    for (const name of SFX_NAMES) {
      const before = ctx.log.nodes;
      expect(() => SFX[name](asCtx(ctx), OUT, 1)).not.toThrow();
      // Um efeito é pequeno: a fanfarra do chefe é a maior.
      expect(ctx.log.nodes - before, name).toBeLessThan(200);
    }
  });
});

describe('planejador de efeitos', () => {
  it('o mais importante primeiro, sem repetir; avisos espaçados, golpes quase juntos', () => {
    const plan = new CuePlanner(4).plan(
      [
        { sfx: 'hit', priority: 2 },
        { sfx: 'death', priority: 10 },
        { sfx: 'hit', priority: 2 },
        { sfx: 'level', priority: 7 },
        { sfx: 'hurt', priority: 3 },
        { sfx: 'swing', priority: 1 },
      ],
      0,
    );
    expect(plan.map((p) => p.sfx)).toEqual(['death', 'level', 'hurt', 'hit']);
    expect(plan.map((p) => p.delay)).toEqual([0, STAGGER_S, 0, HIT_GAP_S]);
  });

  it('o mesmo efeito respeita o intervalo, e os golpes têm teto por segundo (4× não vira metralhadora)', () => {
    const planner = new CuePlanner();
    expect(planner.plan([{ sfx: 'loot', priority: 4 }], 0)).toHaveLength(1);
    expect(planner.plan([{ sfx: 'loot', priority: 4 }], 100)).toHaveLength(0);
    expect(planner.plan([{ sfx: 'loot', priority: 4 }], 400)).toHaveLength(1);
    const fights = new CuePlanner();
    let played = 0;
    for (let ms = 1000; ms < 2000; ms += 16) played += fights.plan([{ sfx: 'hit', priority: 2 }, { sfx: 'hurt', priority: 3 }, { sfx: 'swing', priority: 1 }], ms).length;
    expect(played).toBeLessThanOrEqual(FIGHT_PER_SECOND + 3);
    // Os avisos passam mesmo com o teto cheio.
    expect(fights.plan([{ sfx: 'death', priority: 10 }], 1990)).toHaveLength(1);
  });
});

describe('clima: música e ambiente', () => {
  it('a cena segue a tela: a vila, ou o ato da sala', () => {
    expect(sceneOf(room([], 3), true)).toBe('vila');
    expect([3, 15, 27].map((f) => sceneOf(room([], f), false))).toEqual(['cripta', 'minas', 'fungos']);
  });

  it('na vila: dia, noite, festa e luto; lá embaixo: o ato, e o chefe quando ele luta', () => {
    const w = createWorld(3);
    w.tick = at(10);
    expect(moodOf(w, true).mode).toBe('dia');
    w.tick = at(23);
    expect(moodOf(w, true)).toMatchObject({ mode: 'noite', night: true });
    // Festa: um dia depois da primeira vitória sobre o Senhor da Cripta.
    w.tick = BALANCE.dayTicks + at(12);
    w.stats.bossFirst['10'] = w.tick - 100;
    expect(moodOf(w, true)).toMatchObject({ mode: 'festa' });
    expect(moodOf(w, true).life.festa).toBe(true);
    delete w.stats.bossFirst['10'];
    w.report = { tick: w.tick - 10, died: true, floor: 4, reason: 'morreu', brought: { gold: 0, mats: { ossos: 0, ferro: 0, ferro_negro: 0, esporos: 0 }, items: [], people: 0 }, lost: null, rolls: [] } as unknown as World['report'];
    expect(moodOf(w, true).mode).toBe('luto');
    // Meio dia depois (já é meia-noite), o luto acabou.
    w.tick += MOURNING_TICKS;
    expect(moodOf(w, true).mode).toBe('noite');

    expect(moodOf(room([], 15), false).mode).toBe('minas');
    const boss = room(['mae'], 30);
    expect(moodOf(boss, false)).toMatchObject({ scene: 'fungos', mode: 'chefe', fighting: true });
    boss.room!.enemies[0]!.state = 'morto';
    expect(moodOf(boss, false).mode).toBe('fungos');
  });

  it('a vida da vila que se ouve segue a rotina dos moradores', () => {
    const w = createWorld(4);
    w.village.people = 9;
    w.bossesBeaten.push(5);
    const day = lifeOf(w, 10);
    expect(day).toMatchObject({ forja: true, lenha: true, criancas: true, cachorro: true, pintinho: true, violao: false, festa: false });
    // O músico toca no fim da tarde; à noite, todo mundo em casa e a forja calada.
    expect(lifeOf(w, 17).violao).toBe(true);
    expect(lifeOf(w, 2)).toMatchObject({ forja: false, lenha: false, criancas: false, violao: false });
    // A fonte só existe na vila do estágio 3.
    expect(day.fonte).toBe(false);
    // Vila vazia: nada de ofícios.
    w.village.people = 1;
    expect(lifeOf(w, 10)).toMatchObject({ forja: false, lenha: false, criancas: false, cachorro: false });
  });

  it('cada estilo de música toca sem erro e com um número de nós contido', () => {
    for (const mode of Object.keys(STYLES) as (keyof typeof STYLES)[]) {
      const ctx = fakeContext();
      const music = new MusicPlayer(asCtx(ctx), OUT);
      music.setMode(mode);
      for (let s = 0; s < 30; s += 0.05) {
        ctx.currentTime = s;
        music.schedule();
      }
      expect(music.currentMode).toBe(mode);
      expect(music.resyncs).toBe(0);
      // Abaixo de 150 nós por segundo, folgado para o celular.
      expect(ctx.log.nodes / 30, mode).toBeLessThan(150);
    }
  });

  it('trocar de cena troca a música na hora e some com a anterior; na mesma cena, espera o compasso', () => {
    const ctx = fakeContext();
    const music = new MusicPlayer(asCtx(ctx), OUT);
    music.setMode('cripta');
    for (let s = 0; s < 7; s += 0.05) {
      ctx.currentTime = s;
      music.schedule();
    }
    expect(music.currentMode).toBe('cripta');
    const fades = ctx.log.gains.length;
    // Herói de volta à vila: a música da Cripta sai já (o ganho da voz dela vai a zero).
    music.setMode('dia');
    expect(music.currentMode).toBe('dia');
    expect(ctx.log.gains.slice(fades)).toEqual([0]);
    // Na vila, a noite espera o começo do compasso.
    music.setMode('noite');
    expect(music.currentMode).toBe('dia');
    for (let s = 7; s < 14; s += 0.05) {
      ctx.currentTime = s;
      music.schedule();
    }
    expect(music.currentMode).toBe('noite');
    expect(music.cuts).toBe(2);
  });

  it('o ambiente de cada cena toca sem erro, com toda a vida da vila ligada', () => {
    const all = { forja: true, lenha: true, violao: true, criancas: true, festa: true, fonte: true, cachorro: true, gato: true, pintinho: true };
    for (const scene of ['vila', 'cripta', 'minas', 'fungos'] as Scene[]) {
      for (const night of [false, true]) {
        const ctx = fakeContext();
        const amb = new AmbiencePlayer(asCtx(ctx), OUT);
        const mood: Mood = { scene, mode: 'dia', hour: night ? 23 : 10, night, fighting: false, life: all };
        amb.setMood(mood);
        const start = ctx.log.nodes;
        for (let s = 0; s < 60; s += 0.05) {
          ctx.currentTime = s;
          amb.schedule();
        }
        expect(ctx.log.nodes - start, `${scene} ${night}`).toBeGreaterThan(0);
        expect((ctx.log.nodes - start) / 60, `${scene} ${night}`).toBeLessThan(120);
      }
    }
  });
});

describe('a mesa de som e as preferências', () => {
  const tick = () => new Promise((r) => setTimeout(r, 0));

  it('liga no primeiro gesto com os volumes salvos e silencia no mudo', async () => {
    const made: Fake[] = [];
    const engine = new AudioEngine(() => {
      const c = fakeContext();
      made.push(c);
      return asCtx(c);
    }, false);
    const levels = { muted: false, master: 0.5, music: 0.2, ambient: 0.3, sfx: 1 };
    engine.setLevels(levels);
    expect(engine.out('sfx')).toBeNull();
    engine.wake();
    await tick();
    expect(engine.running).toBe(true);
    expect(made[0]!.log.gains).toEqual([0.5, 0.2, 0.3, 1]);
    engine.setLevels({ ...levels, muted: true });
    expect(made[0]!.log.gains.at(-4)).toBe(0);
  });

  it('os gestos que destravam o som ficam ligados e não tentam com a aba oculta', () => {
    const target = new EventTarget();
    let hidden = false, wakes = 0;
    installUnlock(target, () => hidden, () => wakes++);
    for (const type of ACTIVATION_EVENTS) target.dispatchEvent(new Event(type));
    expect(wakes).toBe(ACTIVATION_EVENTS.length);
    hidden = true;
    target.dispatchEvent(new Event('touchend'));
    expect(wakes).toBe(ACTIVATION_EVENTS.length);
  });

  it('preferências estranhas voltam ao padrão, campo a campo', () => {
    expect(parsePrefs(null)).toEqual(DEFAULT_PREFS);
    expect(parsePrefs('{quebrado')).toEqual(DEFAULT_PREFS);
    expect(parsePrefs(JSON.stringify({ muted: true, music: 2, sfx: -1, ambient: 'alto', master: 0.3 }))).toEqual({ ...DEFAULT_PREFS, muted: true, music: 1, sfx: 0, master: 0.3 });
    const store = new PrefsStore({ ...DEFAULT_PREFS });
    let seen = 0;
    store.subscribe(() => seen++);
    store.set({ muted: true });
    expect(store.value.muted).toBe(true);
    expect(seen).toBe(1);
  });
});
