import { render } from 'preact';
import { startAudio } from './audio/index.ts';
import { PrefsStore } from './game/prefs.ts';
import { Session } from './game/session.ts';
import { clearSave } from './game/storage.ts';
import { itemName } from './sim/index.ts';
import type { HeadId, SimEvent } from './sim/index.ts';
import { Stage, pickQuality } from './render/stage.ts';
import { App } from './ui/App.tsx';
import { lootText } from './ui/format.ts';
import { toast } from './ui/toast.ts';
import './ui/style.css';

const session = Session.boot();
const canvas = document.getElementById('scene') as HTMLCanvasElement;
const overlay = document.getElementById('floaters')!;
const loading = document.getElementById('loading')!;
const stage = new Stage(canvas, overlay, pickQuality());
const prefs = new PrefsStore();
const audio = startAudio(prefs, (text) => toast(text, 'neutro'));

function toasts(events: SimEvent[]): void {
  for (const e of events) {
    if (e.t === 'aviso') toast(e.text, e.tone);
    else if (e.t === 'saque') toast(`Achou: ${e.text}`, 'bom');
    else if (e.t === 'voltou' && !e.died && session.world.report) toast(`Voltou com ${lootText(session.world.report.brought)}.`, 'bom');
  }
}

function resize(): void {
  stage.resize(innerWidth, innerHeight);
}
addEventListener('resize', resize);
resize();
addEventListener('portador-watch', (e) => {
  stage.watchTown = (e as CustomEvent<boolean>).detail;
});
addEventListener('portador-recenter', () => stage.recenter());
addEventListener('portador-preview', (e) => {
  stage.previewHead = (e as CustomEvent<HeadId | null>).detail;
});
addEventListener('portador-inset', (e) => {
  const d = (e as CustomEvent<{ x: number; y: number; closeUp: boolean }>).detail;
  stage.setInset(d.x, d.y, d.closeUp);
});

let last = performance.now();
let errors = 0;
function loop(now: number): void {
  const dt = Math.min(0.1, (now - last) / 1000);
  try {
    frame(now - last, dt);
  } catch (e) {
    // Um erro no 3D não pode parar o jogo: a simulação segue e o quadro seguinte tenta de novo.
    if (errors++ < 5) console.error(e);
  }
  last = now;
  requestAnimationFrame(loop);
}

function frame(ms: number, dt: number): void {
  const events = session.frame(ms);
  if (events.length) toasts(events);
  stage.frame(session.world, events, session.frac, dt, session.paused ? 1 : session.speed);
  audio.frame(session.world, events, stage.townShown);
}

let saving = true;
const save = () => saving && session.save();
addEventListener('pagehide', save);
document.addEventListener('visibilitychange', () => document.visibilityState === 'hidden' && save());

render(<App session={session} prefs={prefs} />, document.getElementById('ui')!);

stage
  .init((done, total) => (loading.textContent = `Carregando a Cripta… ${Math.round((done / total) * 100)}%`))
  .then(() => {
    loading.remove();
    requestAnimationFrame(loop);
  })
  .catch((e) => {
    loading.textContent = `Falhou ao carregar a arte: ${(e as Error).message}`;
    console.error(e);
  });

// Atalhos de depuração (só no npm run dev). Com o painel oculto o requestAnimationFrame para:
// portador.frames(n) roda quadros na mão.
if (import.meta.env.DEV) {
  // ?demo=vila mostra a vila cheia (estágio 3, os moradores no teto da tela e a manhã), só na tela e
  // sem mexer no save: serve para medir o celular na cena mais pesada.
  if (new URLSearchParams(location.search).get('demo') === 'vila') {
    stage.town.hourOverride = 10;
    stage.town.worldOverride = (w) => ({
      ...w,
      village: { ...w.village, people: 18, buildings: { ...w.village.buildings, ferreiro: 3, treinador: 2, alquimista: 3, curandeira: 2, carroceiro: 3, taticas: 3 } },
      bossesBeaten: [...new Set([...w.bossesBeaten, 5, 10])],
    });
  }
  Object.assign(window, {
    portador: {
      session,
      stage,
      audio,
      itemName,
      advance: (n: number) => session.advance(n),
      /** Começa do zero (sem salvar o mundo atual ao sair). */
      reset: () => {
        saving = false;
        clearSave();
        location.reload();
      },
      frames: (n: number, ms = 1000 / 60) => {
        for (let i = 0; i < n; i++) frame(ms, ms / 1000);
      },
    },
  });
}
