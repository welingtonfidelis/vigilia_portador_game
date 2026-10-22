/** Save no localStorage, com try/catch (aba anônima, cota cheia) e uma cópia de reserva. */
const KEY = 'vigilia-portador.save';
const BACKUP = 'vigilia-portador.save.bak';

export function readSave(): { text: string; at: number } | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    return JSON.parse(raw) as { text: string; at: number };
  } catch {
    return null;
  }
}

export function writeSave(text: string): void {
  try {
    const prev = localStorage.getItem(KEY);
    if (prev) localStorage.setItem(BACKUP, prev);
    localStorage.setItem(KEY, JSON.stringify({ text, at: Date.now() }));
  } catch {
    // sem armazenamento: o jogo segue sem salvar
  }
}

export function clearSave(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // nada a fazer
  }
}
