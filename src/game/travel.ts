/**
 * Como a tela mostra a viagem entre a vila e a Cripta (sem DOM nem Three, testável):
 *
 *   saindo   o herói anda até a porta e a empurra (ou, carregado, fica caído um instante)
 *   viagem   a tela escurece e um cartão mostra para onde ele vai, com a barra e o tempo
 *   chegando o cartão some e ele entra pela porta do lugar novo
 *   passagem entre duas salas: depois do saque ele corre até a porta do fundo e a tela escurece
 *            um instante (com "Andar N" quando muda de andar)
 *
 * Tudo em ticks da simulação, então 2× e 4× aceleram junto.
 */
import { BALANCE, roomsOnFloor } from '../sim/index.ts';
import type { World } from '../sim/index.ts';

export type TravelMode = 'nenhum' | 'saindo' | 'viagem' | 'chegando' | 'passagem';

export interface TravelView {
  mode: TravelMode;
  /** Ticks desde o começo da fase atual. */
  elapsed: number;
  /** 0..1 da viagem (só no modo "viagem"). */
  progress: number;
  /** Ticks que faltam para chegar. */
  left: number;
  title: string;
  subtitle: string;
  carried: boolean;
}

/**
 * Saída a pé: na vila, levantar da fogueira (0,9 s), correr até a Cripta (~1,2 s) e empurrar a
 * porta (1,2 s); na sala, correr até a porta da esquerda (~1,4 s) e empurrar. Carregado: caído por 2 s.
 */
export const EXIT_TICKS = 36;
export const CARRIED_EXIT_TICKS = 20;
/** Chegada: quanto tempo depois de chegar o cartão ainda some e o herói entra. */
export const ARRIVE_TICKS = 15;
/** Passagem entre salas: a tela começa a escurecer nestes últimos ticks da saída pelo fundo. */
export const PASS_FADE_TICKS = 5;

function total(w: World): number {
  const floor = w.exp?.floor ?? 1;
  if (w.phase === 'descendo') return BALANCE.descendTicks(floor);
  if (w.phase === 'voltando') return w.carried ? Math.round(BALANCE.returnTicks(floor) * BALANCE.carriedMult) : BALANCE.returnTicks(floor);
  return 0;
}

export function travelView(w: World, frac = 0): TravelView {
  const t = w.tick + frac;
  const none: TravelView = { mode: 'nenhum', elapsed: 0, progress: 0, left: 0, title: '', subtitle: '', carried: false };
  if (w.phase === 'descendo' || w.phase === 'voltando') {
    const all = total(w);
    const elapsed = Math.max(0, all - (w.phaseEnd - t));
    const exit = w.carried ? CARRIED_EXIT_TICKS : EXIT_TICKS;
    const left = Math.max(0, w.phaseEnd - t);
    const floor = w.exp?.floor ?? 1;
    const title = w.phase === 'descendo' ? `Descendo ao andar ${floor}` : w.carried ? 'Carregado de volta à vila' : 'Voltando à vila';
    const subtitle = w.phase === 'descendo'
      ? 'A escadaria da Cripta, degrau por degrau.'
      : w.carried
        ? 'Ferido. O que vestia vem junto; o resto da mochila foi rolado.'
        : w.exp?.leaving ? `Motivo: ${w.exp.leaving}.` : '';
    if (elapsed < exit) return { ...none, mode: 'saindo', elapsed, left, title, subtitle, carried: w.carried };
    const progress = all > exit ? Math.min(1, (elapsed - exit) / (all - exit)) : 1;
    return { mode: 'viagem', elapsed, progress, left, title, subtitle, carried: w.carried };
  }
  if (w.phase === 'sala' && w.room?.phase === 'saque' && w.room.exitTo === 'fundo') {
    const left = w.room.phaseEnd - t;
    const elapsed = Math.max(0, BALANCE.lootTicks + BALANCE.roomExitTicks - left);
    if (left > PASS_FADE_TICKS) return { ...none, mode: 'saindo', elapsed };
    const lastRoom = w.room.index + 1 >= roomsOnFloor(w.room.floor);
    return { ...none, mode: 'passagem', elapsed, left: Math.max(0, left), title: lastRoom ? `Andar ${w.room.floor + 1}` : '' };
  }
  if (w.phase === 'sala' && w.room?.phase === 'entrando') {
    return { ...none, mode: 'chegando', elapsed: Math.max(0, BALANCE.enterTicks - (w.room.phaseEnd - t)) };
  }
  if (w.phase === 'vila' && w.report && t - w.report.tick < ARRIVE_TICKS) {
    return { ...none, mode: 'chegando', elapsed: t - w.report.tick };
  }
  return none;
}
