import { useEffect, useState } from 'preact/hooks';
import type { Prefs, PrefsStore, TextSize } from '../../game/prefs.ts';

const VOLUMES: { key: 'master' | 'music' | 'ambient' | 'sfx'; label: string }[] = [
  { key: 'master', label: 'Geral' },
  { key: 'music', label: 'Música' },
  { key: 'ambient', label: 'Ambiente' },
  { key: 'sfx', label: 'Efeitos' },
];

const TEXT_SIZES: { id: TextSize; label: string }[] = [
  { id: 'normal', label: 'Normal' },
  { id: 'grande', label: 'Grande' },
  { id: 'maior', label: 'Maior' },
];

/** Os atalhos de teclado do jogo (no computador). */
const SHORTCUTS: [string, string][] = [
  ['E H R V C O', 'Equipamento, Habilidades, Regras, Vila, Crônica e Menu'],
  ['Esc', 'Fecha a tela aberta'],
  ['Espaço', 'Pausa'],
  ['1 2 3', 'Velocidade 1×, 2× e 4×'],
  ['M', 'Liga e desliga o som'],
  ['0', 'Volta à vista da vila'],
  ['Setas ou WASD', 'Movem a câmera na vila (arrastar também)'],
  ['+ −', 'Zoom na vila (a roda do mouse também)'],
];

/** As preferências atuais, redesenhando quando mudam. */
export function usePrefs(store: PrefsStore): Prefs {
  const [, setN] = useState(0);
  useEffect(() => store.subscribe(() => setN((n) => n + 1)), [store]);
  return store.value;
}

/**
 * O Menu, a última tela da barra de baixo (como no Vigília): o som (M4.1), a acessibilidade e os
 * atalhos (M4.2), o novo jogo e os créditos.
 */
export function MenuPanel({ prefs, onNewGame, onCredits }: { prefs: PrefsStore; onNewGame: () => void; onCredits: () => void }) {
  const p = usePrefs(prefs);
  const setVolume = (key: (typeof VOLUMES)[number]['key'], value: number) => {
    const patch: Partial<Prefs> = {};
    patch[key] = value / 100;
    prefs.set(patch);
  };
  return (
    <div class="options">
      <h3>Som</h3>
      <label class="check">
        <input type="checkbox" checked={!p.muted} onChange={(e) => prefs.set({ muted: !e.currentTarget.checked })} />
        <span>Som ligado <span class="muted small">(M)</span></span>
      </label>
      {VOLUMES.map((v) => (
        <label class="slider" key={v.key}>
          <span>{v.label}</span>
          <input
            type="range"
            min={0}
            max={100}
            step={5}
            value={Math.round(p[v.key] * 100)}
            disabled={p.muted}
            onInput={(e) => setVolume(v.key, Number(e.currentTarget.value))}
            // Ao soltar o volume dos efeitos, um efeito de amostra.
            onChange={() => v.key !== 'music' && v.key !== 'ambient' && dispatchEvent(new CustomEvent('portador-sfx', { detail: 'loot' }))}
          />
          <span class="muted small">{Math.round(p[v.key] * 100)}%</span>
        </label>
      ))}
      <p class="small muted">O som liga no primeiro toque na tela. Música, ambiente e efeitos são sintetizados no próprio jogo, sem arquivos de áudio.</p>
      <h3>Acessibilidade</h3>
      <div class="text-size">
        <span>Tamanho do texto</span>
        <span class="row-buttons">
          {TEXT_SIZES.map((t) => (
            <button key={t.id} class={p.textSize === t.id ? 'on' : ''} onClick={() => prefs.set({ textSize: t.id })}>{t.label}</button>
          ))}
        </span>
      </div>
      <label class="check">
        <input type="checkbox" checked={p.reduceMotion} onChange={(e) => prefs.set({ reduceMotion: e.currentTarget.checked })} />
        <span>Reduzir movimento <span class="muted small">(sem números flutuantes, partículas e passarinhos; a câmera vai direto)</span></span>
      </label>
      <label class="check">
        <input type="checkbox" checked={p.captions} onChange={(e) => prefs.set({ captions: e.currentTarget.checked })} />
        <span>Legendas dos sons <span class="muted small">(os sons importantes sem aviso viram uma linha na tela)</span></span>
      </label>
      <label class="check">
        <input type="checkbox" checked={p.vibrate} onChange={(e) => prefs.set({ vibrate: e.currentTarget.checked })} />
        <span>Vibrar na morte do herói e no chefe vencido <span class="muted small">(Android)</span></span>
      </label>
      <p class="small muted">A raridade aparece também pela forma: ◆ rara, ✦ épica e ★ lendária.</p>
      <h3>Atalhos</h3>
      <dl class="shortcuts">
        {SHORTCUTS.map(([k, d]) => (
          <div key={k}>
            <dt>{k}</dt>
            <dd>{d}</dd>
          </div>
        ))}
      </dl>
      <h3>Jogo</h3>
      <div class="row-buttons">
        <button onClick={onNewGame}>Novo jogo</button>
        <button onClick={onCredits}>Créditos</button>
      </div>
    </div>
  );
}
