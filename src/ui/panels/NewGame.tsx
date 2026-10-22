import { useEffect, useState } from 'preact/hooks';
import { Session } from '../../game/session.ts';
import { HEADS } from '../../sim/index.ts';
import type { HeadId } from '../../sim/index.ts';

/** Pede ao 3D para mostrar outro rosto enquanto o jogador escolhe (null volta ao do herói). */
function preview(head: HeadId | null): void {
  dispatchEvent(new CustomEvent('portador-preview', { detail: head }));
}

/**
 * Novo jogo: nome e rosto. O herói 3D troca de rosto na hora, atrás da folha. Sem save, abre
 * sozinha e o tempo fica parado até "Começar".
 */
export function NewGame({ session, replacing, onClose }: { session: Session; replacing: boolean; onClose: () => void }) {
  const [head, setHead] = useState<HeadId>(session.world.hero.head);
  const defaultName = (id: HeadId) => HEADS.find((h) => h.id === id)?.name ?? 'Herói';
  const [name, setName] = useState(defaultName(session.world.hero.head));
  const [touched, setTouched] = useState(false);

  useEffect(() => {
    preview(head);
    dispatchEvent(new CustomEvent('portador-inset', { detail: { x: innerWidth > 720 ? 572 : 0, y: innerWidth > 720 ? 0 : innerHeight * 0.55, closeUp: true } }));
  }, [head]);
  useEffect(() => () => {
    preview(null);
    dispatchEvent(new CustomEvent('portador-inset', { detail: { x: 0, y: 0, closeUp: false } }));
  }, []);

  const pick = (id: HeadId) => {
    setHead(id);
    if (!touched) setName(defaultName(id));
  };
  const start = () => {
    session.replace(Session.fresh(head, name));
    session.paused = false;
    session.emit();
    onClose();
  };
  return (
    <section class="sheet newgame">
      <header>
        <h2>Novo jogo</h2>
        {replacing && <button class="close" onClick={onClose} aria-label="Fechar">×</button>}
      </header>
      <div class="sheet-body">
        <p>Debaixo da vila em ruínas, a Cripta. Alguém precisa descer com a chama.</p>
        {replacing && <p class="note warn">Isso apaga o herói atual, a vila e os restos lá embaixo.</p>}
        <h3>Rosto</h3>
        <div class="faces">
          {HEADS.map((h) => (
            <button key={h.id} class={head === h.id ? 'on' : ''} onClick={() => pick(h.id as HeadId)}>{h.name}</button>
          ))}
        </div>
        <h3>Nome</h3>
        <input
          class="name"
          maxLength={18}
          value={name}
          onInput={(e) => {
            setTouched(true);
            setName((e.target as HTMLInputElement).value);
          }}
        />
        <p>
          <button class="primary" disabled={!name.trim()} onClick={start}>Começar</button>
          {replacing && <> <button class="ghost" onClick={onClose}>Cancelar</button></>}
        </p>
      </div>
    </section>
  );
}

export function Credits({ onClose }: { onClose: () => void }) {
  return (
    <div class="modal-back" onClick={onClose}>
      <div class="modal" onClick={(e) => e.stopPropagation()}>
        <h2>Vigília: O Portador da Chama</h2>
        <p>Arte 3D: <b>KayKit</b>, de Kay Lousberg (www.kaylousberg.com), sob CC0 1.0: Adventurers, Skeletons, Character Animations e Dungeon Pack.</p>
        <p>Feito com TypeScript, Three.js e Preact. A estrutura nasceu do Vigília.</p>
        <button onClick={onClose}>Fechar</button>
      </div>
    </div>
  );
}
