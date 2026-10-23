/** Avisos na tela, de qualquer lugar (núcleo, som, atalhos): um evento que o App escuta. */
export interface Toast {
  id: number;
  text: string;
  tone: string;
}

let toastId = 0;

export function toast(text: string, tone = 'neutro'): void {
  dispatchEvent(new CustomEvent<Toast>('portador-toast', { detail: { id: ++toastId, text, tone } }));
}
