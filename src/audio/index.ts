/**
 * Liga o som ao jogo (M4.1): destrava no primeiro gesto (regra dos navegadores), toca os efeitos que
 * o diretor escolhe a cada quadro, mantém a música e o ambiente no clima da cena que está na tela e
 * cala com a aba oculta ou no mudo. O núcleo não sabe que o som existe.
 */
import type { PrefsStore } from '../game/prefs.ts';
import type { SimEvent, World } from '../sim/index.ts';
import { AmbiencePlayer } from './ambience.ts';
import { CaptionPlanner, changeCues, CuePlanner, cuesFor, cuesInScene, moodOf, sceneOf, snapshot, VIBRATION } from './director.ts';
import type { Mood, Snapshot } from './director.ts';
import { AudioEngine, type Levels } from './engine.ts';
import { MusicPlayer } from './music.ts';
import { SFX, type SfxName } from './sfx.ts';

export interface AudioHandle {
  engine: AudioEngine;
  /** Um quadro do jogo: os eventos dos ticks e se a vila está na tela. */
  frame: (w: World, events: readonly SimEvent[], townShown: boolean) => void;
  play: (sfx: SfxName, delay?: number) => void;
  /** Para depuração: o tocador de música e o último clima (null até destravar). */
  music: () => MusicPlayer | null;
  mood: () => Mood | null;
}

const SCHEDULE_MS = 50;
const MOOD_MS = 500;

export function startAudio(prefs: PrefsStore, toast: (text: string) => void): AudioHandle {
  const engine = new AudioEngine();
  const planner = new CuePlanner();
  const captions = new CaptionPlanner();
  let music: MusicPlayer | null = null;
  let ambience: AmbiencePlayer | null = null;
  let world: World | null = null;
  let townShown = true;
  let mood: Mood | null = null;
  let last: Snapshot | null = null;

  const levels = (): Levels => {
    const p = prefs.value;
    return { muted: p.muted, master: p.master, music: p.music, ambient: p.ambient, sfx: p.sfx };
  };
  engine.setLevels(levels());
  prefs.subscribe(() => engine.setLevels(levels()));

  // Música e ambiente guardam nós do contexto: num contexto novo, nascem de novo.
  let playersGen = -1;
  const ensurePlayers = () => {
    if (!engine.ctx || playersGen === engine.generation) return;
    music = new MusicPlayer(engine.ctx, engine.out('music')!);
    ambience = new AmbiencePlayer(engine.ctx, engine.out('ambient')!);
    if (mood) ambience.setMood(mood);
    playersGen = engine.generation;
  };

  installUnlock(window, () => document.hidden, () => {
    if (!engine.wake()) return;
    engine.setLevels(levels());
    ensurePlayers();
  });

  const play = (sfx: SfxName, delay = 0) => {
    const ctx = engine.ctx;
    const out = engine.out('sfx');
    if (!ctx || !out || !engine.running || prefs.value.muted) return;
    SFX[sfx](ctx, out, ctx.currentTime + 0.02 + delay);
  };

  const frame = (w: World, events: readonly SimEvent[], shown: boolean) => {
    world = w;
    townShown = shown;
    const snap = snapshot(w);
    const cues = [...cuesFor(events, w), ...changeCues(last, snap)];
    last = snap;
    if (!cues.length) return;
    // O planejador roda mesmo no mudo: as legendas e a vibração seguem a mesma escolha.
    const now = performance.now();
    const planned = planner.plan(cuesInScene(cues, sceneOf(w, shown)), now);
    for (const p of planned) {
      play(p.sfx, p.delay);
      const pattern = VIBRATION[p.sfx];
      if (pattern && prefs.value.vibrate) vibrate(pattern);
    }
    if (prefs.value.captions) for (const text of captions.pick(planned, now)) toast(text);
  };

  // Botões fazem um tique; a interface pede outros efeitos pelo evento 'portador-sfx' (abrir uma tela).
  document.addEventListener(
    'click',
    (e) => {
      const target = e.target as Element | null;
      if (target?.closest?.('button')) play('click');
    },
    true,
  );
  addEventListener('portador-sfx', (e) => play((e as CustomEvent<SfxName>).detail));

  let lastMood = 0;
  window.setInterval(() => {
    if (!document.hidden) engine.watch();
    if (!engine.running || !music || !ambience || !world || prefs.value.muted) return;
    const now = performance.now();
    if (now - lastMood >= MOOD_MS) {
      lastMood = now;
      mood = moodOf(world, townShown);
      music.setMode(mood.mode);
      ambience.setMood(mood);
    }
    music.schedule();
    ambience.schedule();
  }, SCHEDULE_MS);

  // Ao voltar para o app, tenta retomar sozinho; se o navegador pedir um toque (Safari do iPhone), avisa.
  let hint = 0;
  document.addEventListener('visibilitychange', () => {
    window.clearTimeout(hint);
    if (document.hidden) {
      engine.sleep();
      return;
    }
    engine.resumeQuietly();
    hint = window.setTimeout(() => {
      if (!document.hidden && engine.needsGesture && !prefs.value.muted) toast('Toque na tela para religar o som.');
    }, 800);
  });

  return { engine, frame, play, music: () => music, mood: () => mood };
}

/** Vibra onde o aparelho deixa (Android); no iPhone e no computador, não faz nada. */
function vibrate(pattern: number[]): void {
  try {
    navigator.vibrate?.(pattern);
  } catch {
    // sem vibração
  }
}

/**
 * Gestos que os navegadores aceitam para liberar o áudio. No celular o toque só conta quando o dedo
 * sai da tela (pointerup/touchend); pointerdown só vale para o mouse. Os ouvintes ficam ligados para
 * sempre: depois de uma ligação, de trocar de app ou da aba oculta, o próximo toque religa o som.
 */
export const ACTIVATION_EVENTS = ['pointerdown', 'pointerup', 'touchend', 'click', 'keydown'] as const;

export function installUnlock(target: EventTarget, hidden: () => boolean, wake: () => void): () => void {
  const handler = () => {
    if (!hidden()) wake();
  };
  for (const type of ACTIVATION_EVENTS) target.addEventListener(type, handler, { capture: true, passive: true });
  return () => {
    for (const type of ACTIVATION_EVENTS) target.removeEventListener(type, handler, { capture: true });
  };
}
