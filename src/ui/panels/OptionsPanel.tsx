import { useEffect, useState } from 'preact/hooks';
import type { Prefs, PrefsStore } from '../../game/prefs.ts';

const VOLUMES: { key: 'master' | 'music' | 'ambient' | 'sfx'; label: string }[] = [
  { key: 'master', label: 'Geral' },
  { key: 'music', label: 'Música' },
  { key: 'ambient', label: 'Ambiente' },
  { key: 'sfx', label: 'Efeitos' },
];

/** As preferências atuais, redesenhando quando mudam. */
export function usePrefs(store: PrefsStore): Prefs {
  const [, setN] = useState(0);
  useEffect(() => store.subscribe(() => setN((n) => n + 1)), [store]);
  return store.value;
}

/** Opções do aparelho (M4.1: o som). */
export function Options({ prefs, onClose }: { prefs: PrefsStore; onClose: () => void }) {
  const p = usePrefs(prefs);
  const setVolume = (key: (typeof VOLUMES)[number]['key'], value: number) => {
    const patch: Partial<Prefs> = {};
    patch[key] = value / 100;
    prefs.set(patch);
  };
  return (
    <div class="modal-back" onClick={onClose}>
      <div class="modal options" onClick={(e) => e.stopPropagation()}>
        <h2>Opções</h2>
        <h3>Som</h3>
        <label class="check">
          <input type="checkbox" checked={!p.muted} onChange={(e) => prefs.set({ muted: !e.currentTarget.checked })} />
          Som ligado <span class="muted small">(M)</span>
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
        <button onClick={onClose}>Fechar</button>
      </div>
    </div>
  );
}
