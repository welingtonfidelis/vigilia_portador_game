/**
 * Preferências do aparelho (M4): o som e, a partir do M4.2, a acessibilidade. Ficam no localStorage,
 * fora do save do mundo (trocar de herói não muda o volume). Valores estranhos voltam ao padrão.
 */
const KEY = 'vigilia-portador.prefs';

export interface Prefs {
  muted: boolean;
  /** Volumes de 0 a 1: o geral e os três canais. */
  master: number;
  music: number;
  ambient: number;
  sfx: number;
}

export const DEFAULT_PREFS: Prefs = { muted: false, master: 0.8, music: 0.45, ambient: 0.6, sfx: 0.85 };

const VOLUMES = ['master', 'music', 'ambient', 'sfx'] as const;

/** Lê o que veio do armazenamento, campo a campo: o que faltar ou vier torto fica no padrão. */
export function parsePrefs(raw: string | null): Prefs {
  const out = { ...DEFAULT_PREFS };
  if (!raw) return out;
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return out;
  }
  if (!data || typeof data !== 'object') return out;
  const d = data as Record<string, unknown>;
  if (typeof d.muted === 'boolean') out.muted = d.muted;
  for (const k of VOLUMES) {
    const v = d[k];
    if (typeof v === 'number' && Number.isFinite(v)) out[k] = Math.max(0, Math.min(1, v));
  }
  return out;
}

export function loadPrefs(): Prefs {
  try {
    return parsePrefs(localStorage.getItem(KEY));
  } catch {
    return { ...DEFAULT_PREFS };
  }
}

export function savePrefs(p: Prefs): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(p));
  } catch {
    // sem armazenamento: vale só nesta aba
  }
}

/** As preferências em uso, com aviso para quem quer saber quando mudam (o som e a tela). */
export class PrefsStore {
  value: Prefs;
  private listeners = new Set<() => void>();

  constructor(value: Prefs = loadPrefs()) {
    this.value = value;
  }

  set(patch: Partial<Prefs>): void {
    this.value = { ...this.value, ...patch };
    savePrefs(this.value);
    for (const fn of this.listeners) fn();
  }

  subscribe(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }
}
