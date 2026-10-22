import { useEffect, useRef, useState } from 'preact/hooks';
import type { Session } from '../game/session.ts';
import { travelView } from '../game/travel.ts';
import { BALANCE, ELITE_NAMES, ENEMIES, heroStats, isBoss, roomsOnFloor, xpToNext } from '../sim/index.ts';
import type { World } from '../sim/index.ts';
import { duration, nf } from './format.ts';
import { ChroniclePanel } from './panels/ChroniclePanel.tsx';
import { EquipPanel } from './panels/EquipPanel.tsx';
import { Credits, NewGame } from './panels/NewGame.tsx';
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

/** Entre a vila e a sala: a tela escurece e o cartão mostra para onde o herói vai. */
function TravelCard({ session, w, watching }: { session: Session; w: World; watching: boolean }) {
  const v = travelView(w, session.frac);
  const trip = v.mode === 'viagem' && !watching;
  const on = trip || (v.mode === 'passagem' && !watching);
  // Enquanto o cartão some (na chegada), ele continua mostrando para onde o herói ia.
  const last = useRef(v);
  if (on || (v.mode === 'saindo' && v.title)) last.current = v;
  const show = on ? v : last.current;
  const pass = show.mode === 'passagem';
  return (
    <div class={`travel ${on ? 'on' : ''} ${pass ? 'quick' : ''} ${show.carried ? 'carried' : ''}`} aria-hidden={!on}>
      {show.title && (
        <div class="travel-card">
          <h2>{show.title}</h2>
          {show.subtitle && <p class="muted">{show.subtitle}</p>}
          {!pass && <div class="bar xp travel-bar"><div style={{ width: `${(trip ? v.progress : 1) * 100}%` }} /></div>}
          {!pass && <p class="small muted">{trip ? `faltam ${duration(v.left)}${session.speed > 1 ? ` · ${session.speed}×` : ''}` : 'chegando'}</p>}
        </div>
      )}
    </div>
  );
}

interface ViewCtl {
  /** A vila está na tela (herói nela, saindo para a Cripta, ou o jogador olhando). */
  townShown: boolean;
  watching: boolean;
  toggle: () => void;
  recenter: () => void;
}

function Hud({ session, w, onBell, onMenu, view }: { session: Session; w: World; onBell: () => void; onMenu: () => void; view: ViewCtl }) {
  const h = w.hero;
  const s = heroStats(w);
  const hpPct = Math.max(0, Math.min(1, h.hp / s.maxHp));
  const xpPct = h.xp / xpToNext(h.level);
  const v = w.village;
  const alive = w.room?.enemies.filter((e) => e.state !== 'morto') ?? [];
  const boss = alive.find((e) => isBoss(e.kind));
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
            {boss ? `${ENEMIES[boss.kind].name}${boss.kind === 'senhor' ? ` (fase ${boss.phase})` : ''}: ${nf((boss.hp / boss.maxHp) * 100)}% · ` : ''}
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
          {w.phase !== 'vila' && w.phase !== 'descendo' && (
            <button class={view.watching ? 'on' : ''} onClick={view.toggle} title={view.watching ? 'Voltar a ver o herói' : 'Olhar a vila enquanto o herói desce'}>
              {view.watching ? '⚔ Herói' : '⌂ Vila'}
            </button>
          )}
          {view.townShown && <button onClick={view.recenter} title="Centralizar a câmera" aria-label="Centralizar a câmera">◎</button>}
          <button onClick={onMenu} title="Menu" aria-label="Menu">☰</button>
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
  const [newGame, setNewGame] = useState<'inicio' | 'trocar' | null>(session.isNew ? 'inicio' : null);
  const [menu, setMenu] = useState(false);
  const [credits, setCredits] = useState(false);
  const [watching, setWatching] = useState(false);
  useEffect(() => {
    dispatchEvent(new CustomEvent('portador-watch', { detail: watching }));
  }, [watching]);
  // Tocar num prédio na vila abre a tela da vila.
  useEffect(() => {
    const onLot = () => setPanel('vila');
    addEventListener('portador-lot', onLot);
    return () => removeEventListener('portador-lot', onLot);
  }, []);
  const view: ViewCtl = {
    townShown: w.phase === 'vila' || w.phase === 'descendo' || watching,
    watching,
    toggle: () => setWatching((x) => !x),
    recenter: () => dispatchEvent(new CustomEvent('portador-recenter')),
  };

  // Painel aberto: a câmera abre espaço para o herói (à esquerda na tela larga, acima no celular).
  useEffect(() => {
    if (newGame) return;
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
  }, [panel, newGame]);

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
      <TravelCard session={session} w={w} watching={watching} />
      <Hud session={session} w={w} onBell={() => session.run((x) => x.exp && (x.exp.recall = true))} onMenu={() => setMenu((m) => !m)} view={view} />
      {menu && (
        <div class="menu">
          <button onClick={() => { setMenu(false); setPanel(null); setNewGame('trocar'); }}>Novo jogo</button>
          <button onClick={() => { setMenu(false); setCredits(true); }}>Créditos</button>
        </div>
      )}
      <nav class="dock">
        {PANELS.map((p) => (
          <button key={p.id} class={panel === p.id ? 'on' : ''} onClick={() => setPanel(panel === p.id ? null : p.id)} title={`${p.label} (${p.key})`}>
            <span class="icon">{p.icon}</span>
            <span class="label">{p.label}</span>
          </button>
        ))}
      </nav>
      {newGame && <NewGame session={session} replacing={newGame === 'trocar'} onClose={() => setNewGame(null)} />}
      {credits && <Credits onClose={() => setCredits(false)} />}
      {panel && !newGame && (
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
      {report && !newGame && <ReportModal report={report} w={w} onClose={() => setSeenReport(report.tick)} />}
      {!report && !newGame && away && <AwayModal away={away} onClose={() => setAway(null)} />}
    </>
  );
}
