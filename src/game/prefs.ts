/**
 * Preferências do aparelho (M4): o som e, a partir do M4.2, a acessibilidade. Ficam no localStorage,
 * fora do save do mundo (trocar de herói não muda o volume). Valores estranhos voltam ao padrão.
 */
const KEY = 'vigilia-portador.prefs';

export type TextSize = 'normal' | 'grande' | 'maior';

export interface Prefs {
  muted: boolean;
  /** Volumes de 0 a 1: o geral e os três canais. */
  master: number;
  music: number;
  ambient: number;
  sfx: number;
  /** Acessibilidade (M4.2). */
  textSize: TextSize;
  /** Sem números flutuantes, partículas, bichos no céu e transições suaves da câmera. */
  reduceMotion: boolean;
  /** Os sons importantes que não têm aviso viram uma legenda na tela. */
  captions: boolean;
  /** Vibração curta na morte do herói e no chefe vencido (só onde o aparelho deixa: Android). */
  vibrate: boolean;
}

export const DEFAULT_PREFS: Prefs = {
  muted: false, master: 0.8, music: 0.45, ambient: 0.6, sfx: 0.85,
  textSize: 'normal', reduceMotion: false, captions: false, vibrate: true,
};

/** Quanto cada tamanho aumenta o texto da interface. */
export const TEXT_SCALE: Record<TextSize, number> = { normal: 1, grande: 1.12, maior: 1.25 };

const VOLUMES = ['master', 'music', 'ambient', 'sfx'] as const;
const FLAGS = ['muted', 'reduceMotion', 'captions', 'vibrate'] as const;

/** Lê o que veio do armazenamento, campo a campo: o que faltar ou vier torto fica no padrão. */
export function parsePrefs(raw: string | null, base: Prefs = DEFAULT_PREFS): Prefs {
  const out = { ...base };
  if (!raw) return out;
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return out;
  }
  if (!data || typeof data !== 'object') return out;
  const d = data as Record<string, unknown>;
  for (const k of FLAGS) if (typeof d[k] === 'boolean') out[k] = d[k];
  if (typeof d.textSize === 'string' && d.textSize in TEXT_SCALE) out.textSize = d.textSize as TextSize;
  for (const k of VOLUMES) {
    const v = d[k];
    if (typeof v === 'number' && Number.isFinite(v)) out[k] = Math.max(0, Math.min(1, v));
  }
  return out;
}

/** O padrão do aparelho: quem pediu ao sistema menos movimento começa com ele reduzido. */
function deviceDefaults(): Prefs {
  let reduce = false;
  try {
    reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    // sem matchMedia (testes): segue o padrão
  }
  return { ...DEFAULT_PREFS, reduceMotion: reduce };
}

export function loadPrefs(): Prefs {
  const base = deviceDefaults();
  try {
    return parsePrefs(localStorage.getItem(KEY), base);
  } catch {
    return base;
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
