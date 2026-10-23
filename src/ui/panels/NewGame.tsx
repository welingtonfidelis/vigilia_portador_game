import { useEffect, useState } from 'preact/hooks';
import { Session } from '../../game/session.ts';
import { HEADS, commands } from '../../sim/index.ts';
import type { HeadId } from '../../sim/index.ts';

/** Pede ao 3D para mostrar outro rosto enquanto o jogador escolhe (null volta ao do herói). */
function preview(head: HeadId | null): void {
  dispatchEvent(new CustomEvent('portador-preview', { detail: head }));
}

/**
 * A história, antes de escolher o herói (como a boas-vindas do Vigília). A câmera fica na vila
 * inteira, para o jogador ver de onde tudo começa.
 */
export function Story({ replacing, onNext, onCancel }: { replacing: boolean; onNext: () => void; onCancel: () => void }) {
  return (
    <div class="modal-back story-back">
      <div class="modal story">
        <h2>A última chama da vila</h2>
        <p class="muted">Você não luta. Você prepara quem desce.</p>
        <p>A vila caiu numa noite sem lua. O que dormia na Cripta, debaixo da capela, subiu pela escada e levou quase tudo: as casas, a forja, a gente. Sobrou uma fogueira acesa no alto do morro, e alguém para cuidar dela.</p>
        <p>Esse alguém é o <b>Portador da Chama</b>. Ele desce à Cripta com o fogo da vigília, luta sozinho contra os mortos e sempre volta: vitorioso, ferido ou carregado. O que ele traz lá de baixo (ouro, ossos, ferro e gente resgatada) reconstrói a vila, casa por casa.</p>
        <p>Você não controla a luta. Escolhe o que ele veste, o que aprende, as regras que segue e até onde desce. No andar 5 espera um Capitão; no 10, o Senhor da Cripta. Mais fundo, dizem, as minas inundaram e um jardim apodrece no escuro.</p>
        <p>Quando ele cair, parte do que levava fica no chão. Ainda dá para voltar e buscar.</p>
        <ul class="small muted">
          <li>Equipamento, Habilidades, Regras, Vila e Crônica ficam na barra de baixo; o Menu ⚙ tem o som e as opções.</li>
          <li>Espaço pausa; 1, 2 e 3 mudam a velocidade.</li>
        </ul>
        <p>
          <button class="primary" onClick={onNext}>Escolher o herói</button>
          {replacing && <> <button class="ghost" onClick={onCancel}>Cancelar</button></>}
        </p>
      </div>
    </div>
  );
}

/**
 * Novo jogo: nome e rosto. O herói 3D troca de rosto na hora, atrás da folha. Sem save, abre
 * sozinha e o tempo fica parado até "Começar".
 */
export function NewGame({ session, replacing, onClose, onStart }: { session: Session; replacing: boolean; onClose: () => void; onStart: (name: string) => void }) {
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
  // O jogo novo começa na vila, e o herói desce à Cripta na hora em que é criado.
  const start = () => {
    session.replace(Session.fresh(head, name.trim()));
    session.run((w) => commands.descend(w, []));
    session.paused = false;
    session.emit();
    onStart(name.trim());
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
        <p>Arte 3D: <b>KayKit</b>, de Kay Lousberg (www.kaylousberg.com), sob CC0 1.0: personagens, esqueletos, animações, masmorra, armas e objetos.</p>
        <p>A vila: <b>Kenney</b> (www.kenney.nl), CC0 1.0. Os monstros do Jardim de Fungos: <b>Quaternius</b> (quaternius.com), CC0 1.0.</p>
        <p>O som é todo sintetizado no próprio jogo, em Web Audio. Feito com TypeScript, Three.js e Preact. A estrutura e o som nasceram do Vigília.</p>
        <button onClick={onClose}>Fechar</button>
      </div>
    </div>
  );
}
