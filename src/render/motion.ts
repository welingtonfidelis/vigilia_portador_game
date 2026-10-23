/**
 * "Reduzir movimento" (M4.2), lido por todo o 3D: sem números flutuantes, sem partículas (esporos,
 * bolhas de veneno, fumaça e brasas), sem passarinhos e com a câmera indo direto ao lugar, sem
 * deslizar. Só a tela: o jogo é o mesmo.
 */
export const MOTION = { reduced: false };

/** Fração de uma aproximação suave neste quadro (1 = chega na hora, com o movimento reduzido). */
export function ease(dt: number, rate: number): number {
  return MOTION.reduced ? 1 : 1 - Math.exp(-dt * rate);
}
