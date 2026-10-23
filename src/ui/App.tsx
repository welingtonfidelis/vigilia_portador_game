import { useEffect, useRef, useState } from 'preact/hooks';
import type { PrefsStore } from '../game/prefs.ts';
import type { Session } from '../game/session.ts';
import { travelView } from '../game/travel.ts';
import { BALANCE, ELITE_NAMES, ENEMIES, commands, heroStats, isBoss, roomsOnFloor, xpToNext } from '../sim/index.ts';
import type { World } from '../sim/index.ts';
import { duration, nf, short } from './format.ts';
import { ChroniclePanel } from './panels/ChroniclePanel.tsx';
import { MenuPanel } from './panels/MenuPanel.tsx';
import { EquipPanel } from './panels/EquipPanel.tsx';
import { Credits, NewGame, Story } from './panels/NewGame.tsx';
import { ReportModal, AwayModal } from './panels/ReportModal.tsx';
import { RulesPanel } from './panels/RulesPanel.tsx';
import { SkillsPanel } from './panels/SkillsPanel.tsx';
import { VillagePanel } from './panels/VillagePanel.tsx';
import { toast, type Toast } from './toast.ts';

export type PanelId = 'equip' | 'skills' | 'rules' | 'vila' | 'cronica' | 'menu';

/**
 * A barra de baixo é o único menu, como no Vigília: as cinco telas do jogo e o Menu (som, opções,
 * atalhos, novo jogo e créditos). `short` é o rótulo no celular em pé.
 */
const PANELS: { id: PanelId; label: string; short: string; key: string; icon: string }[] = [
  { id: 'equip', label: 'Equipamento', short: 'Equipar', key: 'E', icon: '⚔' },
  { id: 'skills', label: 'Habilidades', short: 'Habilid.', key: 'H', icon: '✦' },
  { id: 'rules', label: 'Regras', short: 'Regras', key: 'R', icon: '☰' },
  { id: 'vila', label: 'Vila', short: 'Vila', key: 'V', icon: '⌂' },
  { id: 'cronica', label: 'Crônica', short: 'Crônica', key: 'C', icon: '✎' },
  { id: 'menu', label: 'Menu', short: 'Menu', key: 'O', icon: '⚙' },
];

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
  if (w.phase === 'vila') {
    if (w.hold) return 'Na vila (esperando você)';
    if (w.rules.descent.repeat) return 'Na vila, descansando';
    return w.hero.hp >= heroStats(w).maxHp - 0.5 ? 'Na vila, esperando a ordem de descer' : 'Na vila, descansando (modo Manual)';
  }
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

/**
 * As ações do herói, juntas numa linha debaixo de onde ele está: o modo da vila (M4.2: no Auto ele
 * desce sozinho quando a vida enche; no Manual, espera o "Descer"; o tempo segue nos dois), o sino,
 * a troca entre olhar a vila e o herói e o recentrar da vila.
 */
function HeroActions({ session, w, view }: { session: Session; w: World; view: ViewCtl }) {
  const auto = w.rules.descent.repeat;
  const out = w.phase !== 'vila' && w.phase !== 'descendo';
  const toggle = () => {
    session.run((x) => commands.setAuto(x, !auto));
    toast(auto ? 'Modo Manual: o herói espera na vila até você mandar descer.' : 'Modo Auto: o herói desce sozinho quando a vida enche.');
  };
  const descend = () => {
    const err = session.run((x) => commands.descend(x, []));
    if (err) toast(`Não deu: ${err}.`, 'ruim');
    else dispatchEvent(new CustomEvent('portador-sfx', { detail: 'depart' }));
  };
  return (
    <div class="hero-actions">
      <button class={auto ? 'on' : ''} onClick={toggle} title={auto ? 'Auto: o herói desce sozinho quando a vida enche. Toque para o Manual.' : 'Manual: o herói espera a sua ordem. Toque para o Auto.'}>
        Vila: {auto ? 'Auto' : 'Manual'}
      </button>
      {w.phase === 'vila' && !auto && <button class="primary" onClick={descend} title="Manda o herói descer agora">Descer ▸</button>}
      {out && (
        <button disabled={!w.exp || w.phase !== 'sala' || !!w.exp.recall} onClick={() => session.run((x) => commands.ringBell(x))} title="Sino: o herói volta no fim da luta">
          🔔 {w.exp?.recall ? 'Chamado' : 'Chamar'}
        </button>
      )}
      {out && (
        <button class={view.watching ? 'on' : ''} onClick={view.toggle} title={view.watching ? 'Voltar a ver o herói' : 'Olhar a vila enquanto o herói desce'}>
          {view.watching ? '⚔ Ver o herói' : '⌂ Ver a vila'}
        </button>
      )}
      {view.townShown && <button onClick={view.recenter} title="Voltar à vista da vila (0) · arraste, roda, setas ou WASD movem; + e - dão zoom" aria-label="Voltar à vista da vila">◎</button>}
    </div>
  );
}

function Hud({ session, w, view, muted, onMute }: { session: Session; w: World; view: ViewCtl; muted: boolean; onMute: () => void }) {
  const h = w.hero;
  const s = heroStats(w);
  const hpPct = Math.max(0, Math.min(1, h.hp / s.maxHp));
  const venom = h.poison.filter((t) => t > w.tick).length;
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
          {venom > 0 && <span class="venom" title="Veneno: cada dose tira vida por 6 s; Purificar e o antídoto tiram">☣ {venom}</span>}
        </div>
      </div>
      <div class="hud-where">
        <div>{where(w)}</div>
        <HeroActions session={session} w={w} view={view} />
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
          <span title={`Ouro: ${nf(v.gold)}`}>◉ {short(v.gold)}</span>
          <span title={`Ossos: ${nf(v.mats.ossos)}`}>🦴 {short(v.mats.ossos)}</span>
          <span title={`Ferro: ${nf(v.mats.ferro)}`}>⛓ {short(v.mats.ferro)}</span>
          {(v.mats.ferro_negro > 0 || w.hero.deepest >= 11) && <span title={`Ferro-negro: ${nf(v.mats.ferro_negro ?? 0)}`}>◆ {short(v.mats.ferro_negro ?? 0)}</span>}
          {(v.mats.esporos > 0 || w.hero.deepest >= 21) && <span title={`Esporos: ${nf(v.mats.esporos ?? 0)}`}>✻ {short(v.mats.esporos ?? 0)}</span>}
          <span title="Moradores">☺ {v.people}</span>
        </div>
        <div class="speed">
          <button class={muted ? '' : 'on'} onClick={onMute} title={muted ? 'Ligar o som (M)' : 'Desligar o som (M)'} aria-label={muted ? 'Ligar o som' : 'Desligar o som'}>{muted ? '🔇' : '🔊'}</button>
          <button class={session.paused ? 'on' : ''} onClick={() => { session.paused = !session.paused; session.emit(); }} title="Pausa (Espaço)" aria-label="Pausa">❚❚</button>
          {([1, 2, 4] as const).map((x) => (
            <button key={x} class={`spd ${!session.paused && session.speed === x ? 'on' : ''}`} onClick={() => { session.speed = x; session.paused = false; session.emit(); }}>{x}×</button>
          ))}
          {/* No celular, um botão só que passa por 1×, 2× e 4× (alvos de toque maiores). */}
          <button
            class={`spd-cycle ${session.paused ? '' : 'on'}`}
            onClick={() => {
              if (!session.paused) session.speed = ({ 1: 2, 2: 4, 4: 1 } as const)[session.speed];
              session.paused = false;
              session.emit();
            }}
            title="Velocidade: toque para trocar"
            aria-label={`Velocidade ${session.speed}×`}
          >
            {session.speed}×
          </button>
        </div>
      </div>
    </div>
  );
}

export function App({ session, prefs }: { session: Session; prefs: PrefsStore }) {
  const w = useWorld(session);
  const [panel, setPanel] = useState<PanelId | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [seenReport, setSeenReport] = useState<number>(w.report?.tick ?? -1);
  const [away, setAway] = useState(session.away);
  const [newGame, setNewGame] = useState<'inicio' | 'trocar' | null>(session.isNew ? 'inicio' : null);
  const [credits, setCredits] = useState(false);
  // Antes de escolher o herói, a história.
  const [story, setStory] = useState(session.isNew);
  const [, setPrefsN] = useState(0);
  useEffect(() => prefs.subscribe(() => setPrefsN((n) => n + 1)), [prefs]);
  const toggleMute = () => {
    const muted = !prefs.value.muted;
    prefs.set({ muted });
    toast(muted ? 'Som desligado (M liga de novo).' : 'Som ligado.');
  };
  const [watching, setWatching] = useState(false);
  const sheetRef = useRef<HTMLElement>(null);
  const drag = useRef<{ y: number; dy: number } | null>(null);
  useEffect(() => {
    dispatchEvent(new CustomEvent('portador-watch', { detail: watching }));
  }, [watching]);
  // O herói desce à Cripta e a câmera fica na vila; quem quiser segui-lo usa o botão ⚔ Herói.
  const lastPhase = useRef(w.phase);
  useEffect(() => {
    if (w.phase === 'descendo' && lastPhase.current !== 'descendo') setWatching(true);
    lastPhase.current = w.phase;
  }, [w.phase]);
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
      // A folha de baixo (celular em pé) empurra a cena para cima; a do lado (tela larga ou celular
      // deitado), para a esquerda.
      const bottom = !!r && r.top > innerHeight * 0.25;
      const closeUp = panel === 'equip';
      const detail = !r ? { x: 0, y: 0, closeUp } : bottom ? { x: 0, y: r.height, closeUp } : { x: r.width + 12, y: 0, closeUp };
      dispatchEvent(new CustomEvent('portador-inset', { detail }));
    };
    const t = setTimeout(measure, 30);
    addEventListener('resize', measure);
    return () => {
      clearTimeout(t);
      removeEventListener('resize', measure);
    };
  }, [panel, newGame]);

  // Abrir uma tela faz um sopro.
  useEffect(() => {
    if (panel) dispatchEvent(new CustomEvent('portador-sfx', { detail: 'open' }));
  }, [panel]);

  // A tela de equipamento ou de habilidades aberta segura o herói na vila.
  useEffect(() => {
    const hold = panel === 'equip' || panel === 'skills';
    if (session.world.hold !== hold) session.run((x) => (x.hold = hold));
  }, [panel, session]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).closest?.('input, select, textarea')) return;
      const k = e.key.toLowerCase();
      if (k === 'escape') setPanel(null);
      else if (k === ' ') {
        session.paused = !session.paused;
        session.emit();
        e.preventDefault();
      } else if (k === 'm') {
        toggleMute();
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
  }, [session, prefs]);

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
      <Hud session={session} w={w} view={view} muted={prefs.value.muted} onMute={toggleMute} />
      <nav class="dock">
        {PANELS.map((p) => (
          <button key={p.id} class={panel === p.id ? 'on' : ''} onClick={() => setPanel(panel === p.id ? null : p.id)} title={`${p.label} (${p.key})`}>
            <span class="icon">{p.icon}</span>
            <span class="label">{p.label}</span>
            <span class="label-short">{p.short}</span>
          </button>
        ))}
      </nav>
      {newGame && story && <Story replacing={newGame === 'trocar'} onNext={() => setStory(false)} onCancel={() => { setStory(false); setNewGame(null); }} />}
      {newGame && !story && (
        <NewGame
          session={session}
          replacing={newGame === 'trocar'}
          onClose={() => setNewGame(null)}
          onStart={(name) => {
            // A câmera fica na vila: o herói sai da fogueira e entra na capela da Cripta.
            setWatching(true);
            dispatchEvent(new CustomEvent('portador-sfx', { detail: 'depart' }));
            toast(`${name} desce à Cripta pela primeira vez. Toque em ⚔ Ver o herói para acompanhar.`, 'bom');
          }}
        />
      )}
      {credits && <Credits onClose={() => setCredits(false)} />}
      {panel && !newGame && (
        <section class="sheet" key={panel} ref={sheetRef}>
          {/* Arrastar o cabeçalho para baixo fecha a folha (M4.2). */}
          <header
            onPointerDown={(e) => {
              if ((e.target as Element).closest('button')) return;
              drag.current = { y: e.clientY, dy: 0 };
              e.currentTarget.setPointerCapture(e.pointerId);
            }}
            onPointerMove={(e) => {
              const d = drag.current;
              if (!d || !sheetRef.current) return;
              d.dy = Math.max(0, e.clientY - d.y);
              sheetRef.current.style.transform = `translateY(${d.dy}px)`;
            }}
            onPointerUp={() => {
              const d = drag.current;
              drag.current = null;
              if (sheetRef.current) sheetRef.current.style.transform = '';
              if (d && d.dy > 70) setPanel(null);
            }}
            onPointerCancel={() => {
              drag.current = null;
              if (sheetRef.current) sheetRef.current.style.transform = '';
            }}
          >
            <h2>{PANELS.find((p) => p.id === panel)!.label}</h2>
            <button class="close" onClick={() => setPanel(null)} aria-label="Fechar">×</button>
          </header>
          <div class="sheet-body">
            {panel === 'menu' && <MenuPanel prefs={prefs} onNewGame={() => { setPanel(null); setStory(true); setNewGame('trocar'); }} onCredits={() => setCredits(true)} />}
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
