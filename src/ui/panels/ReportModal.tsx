import type { CatchUpResult, ReturnReport, World } from '../../sim/index.ts';
import { RARITY_CLASS, duration, itemTitle, lootText, nf, pct } from '../format.ts';

export function ReportModal({ report, w, onClose }: { report: ReturnReport; w: World; onClose: () => void }) {
  const pile = w.remains.find((r) => r.id === report.remainsId);
  return (
    <div class="modal-back" onClick={onClose}>
      <div class="modal" onClick={(e) => e.stopPropagation()}>
        <h2>{report.died ? `${w.hero.name} caiu no andar ${report.floor}` : `${w.hero.name} voltou`}</h2>
        {report.died && <p>Foi carregado de volta, ferido. O que vestia voltou inteiro; a mochila foi rolada.</p>}
        <p><b>Trouxe:</b> {lootText(report.brought)}</p>
        {report.rolls.length > 0 && (
          <ul class="rolls">
            {report.rolls.map((r) => (
              <li key={r.item.id} class={RARITY_CLASS[r.item.rarity]}>
                <span class={r.kept ? 'ok' : 'down'}>{r.kept ? '✔ voltou' : '✘ ficou'}</span> {itemTitle(r.item)} <span class="muted small">(chance {pct(r.chance)})</span>
              </li>
            ))}
          </ul>
        )}
        {report.lost && (
          <p>
            <b>Ficou no chão</b> (andar {report.floor}{pile ? `, sala ${pile.room + 1}` : ''}): {lootText(report.lost)}.
            {pile ? ` Os restos somem em ${duration(pile.expires - w.tick)}; para recuperar, basta vencer a luta daquela sala.` : ''}
          </p>
        )}
        {report.recovered > 0 && <p class="ok">Recuperou {report.recovered} pilha(s) de restos nesta descida.</p>}
        {report.died && <p>Ferimento: {duration(report.woundTicks)} na vila para sarar (−vida e −dano até lá).</p>}
        {report.melted > 0 && <p class="muted">O baú estava cheio: {report.melted} peça(s) viraram ouro.</p>}
        <button onClick={onClose}>Continuar</button>
      </div>
    </div>
  );
}

export function AwayModal({ away, onClose }: { away: CatchUpResult; onClose: () => void }) {
  return (
    <div class="modal-back" onClick={onClose}>
      <div class="modal" onClick={(e) => e.stopPropagation()}>
        <h2>Enquanto você estava fora</h2>
        <p>Passaram {duration(away.ticks)} de jogo.</p>
        <ul>
          <li>{away.descents} descidas, {away.kills} esqueletos abatidos</li>
          <li>{away.deaths} {away.deaths === 1 ? 'morte' : 'mortes'}</li>
          <li>{away.gold >= 0 ? '+' : ''}{nf(away.gold)} de ouro no tesouro</li>
          <li>Andar mais fundo: {away.deepest}</li>
        </ul>
        <button onClick={onClose}>Continuar</button>
      </div>
    </div>
  );
}
