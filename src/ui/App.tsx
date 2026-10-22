import { useEffect, useState } from 'preact/hooks';
import type { Session } from '../game/session.ts';
import { BALANCE, ELITE_NAMES, ENEMIES, heroStats, roomsOnFloor, xpToNext } from '../sim/index.ts';
import type { World } from '../sim/index.ts';
import { duration, nf } from './format.ts';
import { ChroniclePanel } from './panels/ChroniclePanel.tsx';
import { EquipPanel } from './panels/EquipPanel.tsx';
import { ReportModal, AwayModal } from './panels/ReportModal.tsx';
import { RulesPanel } from './panels/RulesPanel.tsx';
import { SkillsPanel } from './panels/SkillsPanel.tsx';
import { VillagePanel } from './panels/VillagePanel.tsx';

export type PanelId = 'equip' | 'skills' | 'rules' | 'vila' | 'cronica';

const PANELS: { id: PanelId; label: string; key: string; icon: string }[] = [
  { id: 'equip', label: 'Equipamento', key: 'E', icon: '⚔' },
  { id: 'skills', label: 'Habilidades', key: 'H', icon: '✦' },
  { id: 'rules', label: 'Regras', key: 'R', icon: '☰' },
  { id: 'vila', label: 'Vila', key: 'V', icon: '⌂' },
  { id: 'cronica', label: 'Crônica', key: 'C', icon: '✎' },
];

export interface Toast {
  id: number;
  text: string;
  tone: string;
}

/** Redesenha a interface no máximo ~8 vezes por segundo. */
function useWorld(session: Session): World {
  const [, setN] = useState(0);
  useEffect(() => {
    let pending = false;
    return session.subscribe(() => {
      if (pending) return;
      pending = true;
      setTimeout(() => {
        pending = false;
        setN((n) => n + 1);
      }, 120);
    });
  }, [session]);
  return session.world;
}

function where(w: World): string {
  const r = w.room;
  if (w.phase === 'vila') return w.hold ? 'Na vila (esperando você)' : 'Na vila, descansando';
  if (w.phase === 'descendo') return `Descendo ao andar ${w.exp?.floor} · ${duration(w.phaseEnd - w.tick)}`;
  if (w.phase === 'voltando') return `${w.carried ? 'Carregado de volta' : 'Voltando'} à vila · ${duration(w.phaseEnd - w.tick)}`;
  if (!r) return '';
  const kind = { combate: 'Combate', elite: 'Elite', bau: 'Baú', prisioneiro: 'Prisioneiro', santuario: 'Santuário', chefe: 'Chefe' }[r.kind];
  return `Andar ${r.floor} · sala ${r.index + 1}/${roomsOnFloor(r.floor)} · ${kind}`;
}

function Hud({ session, w, onBell }: { session: Session; w: World; onBell: () => void }) {
  const h = w.hero;
  const s = heroStats(w);
  const hpPct = Math.max(0, Math.min(1, h.hp / s.maxHp));
  const xpPct = h.xp / xpToNext(h.level);
  const v = w.village;
  const alive = w.room?.enemies.filter((e) => e.state !== 'morto') ?? [];
  const boss = alive.find((e) => e.kind === 'capitao');
  return (
    <div class="hud">
      <div class="hud-hero">
        <div class="hud-name">
          {h.name} <span class="muted">nível {h.level}</span>
          {h.skillPoints > 0 && <span class="badge" title="Pontos de habilidade">+{h.skillPoints}</span>}
        </div>
        <div class="bar hp" title={`${nf(h.hp)} / ${nf(s.maxHp)}`}>
          <div style={{ width: `${hpPct * 100}%` }} />
          <span>{nf(Math.max(0, h.hp))} / {nf(s.maxHp)}</span>
        </div>
        <div class="bar xp"><div style={{ width: `${xpPct * 100}%` }} /></div>
        <div class="hud-row">
          <span title="Poções">{'⚗'.repeat(h.potions)}<span class="muted">{'⚗'.repeat(Math.max(0, s.potionsMax - h.potions))}</span></span>
          {h.wound && <span class="wound" title="Ferido: −vida e −dano até sarar na vila">✚ ferido {duration(h.wound.left)}</span>}
        </div>
      </div>
      <div class="hud-where">
        <div>{where(w)}</div>
        {w.phase === 'sala' && alive.length > 0 && (
          <div class="muted small">
            {boss ? `${ENEMIES.capitao.name}: ${nf((boss.hp / boss.maxHp) * 100)}% · ` : ''}
            {alive.length} {alive.length === 1 ? 'inimigo' : 'inimigos'}
            {alive.some((e) => e.elite) ? ` · elite ${ELITE_NAMES[alive.find((e) => e.elite)!.elite!]}` : ''}
          </div>
        )}
        {w.exp && <div class="muted small">Mochila: {w.exp.bag.items.length}/{BALANCE.bagSize} peças · {nf(w.exp.bag.gold)} de ouro{w.exp.bag.people ? ` · ${w.exp.bag.people} resgatado(s)` : ''}</div>}
        {w.remains.length > 0 && (
          <div class="remains small">
            {w.remains.map((r) => (
              <span key={r.id}>☠ restos no andar {r.floor}, sala {r.room + 1} · somem em {duration(r.expires - w.tick)}</span>
            ))}
          </div>
        )}
      </div>
      <div class="hud-right">
        <div class="res">
          <span title="Ouro">◉ {nf(v.gold)}</span>
          <span title="Ossos">🦴 {nf(v.mats.ossos)}</span>
          <span title="Ferro">⛓ {nf(v.mats.ferro)}</span>
          <span title="Moradores">☺ {v.people}</span>
        </div>
        <div class="speed">
          <button class={session.paused ? 'on' : ''} onClick={() => { session.paused = !session.paused; session.emit(); }} title="Pausa (Espaço)">❚❚</button>
          {([1, 2, 4] as const).map((x) => (
            <button key={x} class={!session.paused && session.speed === x ? 'on' : ''} onClick={() => { session.speed = x; session.paused = false; session.emit(); }}>{x}×</button>
          ))}
          <button class="bell" disabled={!w.exp || w.phase !== 'sala' || !!w.exp.recall} onClick={onBell} title="Sino: volta no fim da luta">🔔</button>
        </div>
      </div>
    </div>
  );
}

export function App({ session }: { session: Session }) {
  const w = useWorld(session);
  const [panel, setPanel] = useState<PanelId | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [seenReport, setSeenReport] = useState<number>(w.report?.tick ?? -1);
  const [away, setAway] = useState(session.away);

  // Painel aberto: a câmera abre espaço para o herói (à esquerda na tela larga, acima no celular).
  useEffect(() => {
    const measure = () => {
      const el = document.querySelector('.sheet');
      const r = el?.getBoundingClientRect();
      const narrow = innerWidth <= 720;
      const closeUp = panel === 'equip';
      const detail = !r ? { x: 0, y: 0, closeUp } : narrow ? { x: 0, y: r.height, closeUp } : { x: r.width + 12, y: 0, closeUp };
      dispatchEvent(new CustomEvent('portador-inset', { detail }));
    };
    const t = setTimeout(measure, 30);
    addEventListener('resize', measure);
    return () => {
      clearTimeout(t);
      removeEventListener('resize', measure);
    };
  }, [panel]);

  // A tela de equipamento ou de habilidades aberta segura o herói na vila.
  useEffect(() => {
    const hold = panel === 'equip' || panel === 'skills';
    if (session.world.hold !== hold) session.run((x) => (x.hold = hold));
  }, [panel, session]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).closest('input, select, textarea')) return;
      const k = e.key.toLowerCase();
      if (k === 'escape') setPanel(null);
      else if (k === ' ') {
        session.paused = !session.paused;
        session.emit();
        e.preventDefault();
      } else if (k === '1' || k === '2' || k === '3') {
        session.speed = ({ '1': 1, '2': 2, '3': 4 } as const)[k];
        session.paused = false;
        session.emit();
      } else {
        const p = PANELS.find((x) => x.key.toLowerCase() === k);
        if (p) setPanel((cur) => (cur === p.id ? null : p.id));
      }
    };
    addEventListener('keydown', onKey);
    return () => removeEventListener('keydown', onKey);
  }, [session]);

  // Avisos vindos da simulação.
  useEffect(() => {
    const onToast = (e: Event) => {
      const t = (e as CustomEvent<Toast>).detail;
      setToasts((list) => [...list.slice(-3), t]);
      setTimeout(() => setToasts((list) => list.filter((x) => x.id !== t.id)), 4500);
    };
    addEventListener('portador-toast', onToast);
    return () => removeEventListener('portador-toast', onToast);
  }, []);

  const report = w.report && w.report.tick !== seenReport ? w.report : null;
  return (
    <>
      <Hud session={session} w={w} onBell={() => session.run((x) => x.exp && (x.exp.recall = true))} />
      <nav class="dock">
        {PANELS.map((p) => (
          <button key={p.id} class={panel === p.id ? 'on' : ''} onClick={() => setPanel(panel === p.id ? null : p.id)} title={`${p.label} (${p.key})`}>
            <span class="icon">{p.icon}</span>
            <span class="label">{p.label}</span>
          </button>
        ))}
      </nav>
      {panel && (
        <section class="sheet" key={panel}>
          <header>
            <h2>{PANELS.find((p) => p.id === panel)!.label}</h2>
            <button class="close" onClick={() => setPanel(null)} aria-label="Fechar">×</button>
          </header>
          <div class="sheet-body">
            {panel === 'equip' && <EquipPanel session={session} w={w} />}
            {panel === 'skills' && <SkillsPanel session={session} w={w} />}
            {panel === 'rules' && <RulesPanel session={session} w={w} />}
            {panel === 'vila' && <VillagePanel session={session} w={w} />}
            {panel === 'cronica' && <ChroniclePanel w={w} />}
          </div>
        </section>
      )}
      <div class="toasts">
        {toasts.map((t) => (
          <div key={t.id} class={`toast t-${t.tone}`}>{t.text}</div>
        ))}
      </div>
      {report && <ReportModal report={report} w={w} onClose={() => setSeenReport(report.tick)} />}
      {!report && away && <AwayModal away={away} onClose={() => setAway(null)} />}
    </>
  );
}
