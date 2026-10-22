import type { ComponentChildren } from 'preact';
import { useState } from 'preact/hooks';
import type { Session } from '../../game/session.ts';
import { BASES, SLOTS, SLOT_NAMES, commands, heroStats, itemValue, powerRatio } from '../../sim/index.ts';
import type { Item, Slot, World } from '../../sim/index.ts';
import { RARITY_CLASS, itemLines, itemTitle, nf, pct } from '../format.ts';

function ItemCard({ item, children, delta }: { item: Item; children?: ComponentChildren; delta?: number }) {
  return (
    <div class={`item ${RARITY_CLASS[item.rarity]}`}>
      <div class="item-head">
        <span class="item-name">{itemTitle(item)}</span>
        {delta !== undefined && Math.abs(delta) >= 0.005 && <span class={delta > 0 ? 'up' : 'down'}>{delta > 0 ? '▲' : '▼'} {nf(Math.abs(delta) * 100)}%</span>}
      </div>
      <ul>
        {itemLines(item).map((l) => <li key={l}>{l}</li>)}
      </ul>
      <div class="item-foot">
        <span class="muted small">{item.origin}</span>
        {children}
      </div>
    </div>
  );
}

export function EquipPanel({ session, w }: { session: Session; w: World }) {
  const [filter, setFilter] = useState<Slot | 'todos'>('todos');
  const [msg, setMsg] = useState<string | null>(null);
  const s = heroStats(w);
  const floor = w.hero.deepest;
  const now = powerRatio(w, floor);
  const inVillage = w.phase === 'vila';
  const stash = w.village.stash.filter((i) => filter === 'todos' || BASES[i.base]!.slot === filter);
  const act = (fn: (x: World) => string | null) => setMsg(session.run(fn));
  const deltaOf = (item: Item) => {
    const slot = BASES[item.base]!.slot;
    const trial = { ...w.hero.equip, [slot]: item };
    if (slot === 'arma' && BASES[item.base]!.hands === 2) delete trial.secundaria;
    return powerRatio(w, floor, trial) / now - 1;
  };
  return (
    <div class="equip">
      {!inVillage && <p class="note">O herói está fora. O equipamento só muda na vila; o que ele achar fica na mochila até voltar.</p>}
      {inVillage && <p class="note ok">O herói espera na vila enquanto esta tela estiver aberta.</p>}
      <div class="stats">
        <span>Vida <b>{nf(s.maxHp)}</b></span>
        <span>Dano <b>{nf(s.dmg)}</b></span>
        <span>Golpes/s <b>{nf(s.aps, 2)}</b></span>
        <span>Armadura <b>{nf(s.armor)}</b></span>
        <span>Crítico <b>{pct(s.crit)}</b></span>
        {s.block > 0 && <span>Bloqueio <b>{pct(s.block)}</b></span>}
        {s.lifesteal > 0 && <span>Roubo de vida <b>{pct(s.lifesteal)}</b></span>}
        {s.pierce > 0 && <span title="Fração da couraça dos inimigos das Minas que o golpe ignora">Perfuração <b>{pct(s.pierce)}</b></span>}
        {s.imune > 0 && <span title="Quanto o veneno dos Fungos dura a menos">Imune <b>{pct(s.imune)}</b></span>}
        <span title="Força ÷ o que o andar mais fundo pede: 1 é o andar certo">Força no andar {floor} <b class={now >= 1 ? 'up' : now >= 0.8 ? '' : 'down'}>{nf(now, 2)}</b></span>
      </div>
      {msg && <p class="note warn">{msg}</p>}
      <h3>No corpo</h3>
      <div class="grid">
        {SLOTS.map((slot) => {
          const item = w.hero.equip[slot];
          return (
            <div key={slot} class="slot">
              <div class="slot-name">{SLOT_NAMES[slot]}</div>
              {item ? (
                <ItemCard item={item}>
                  <button disabled={!inVillage} onClick={() => act((x) => commands.unequip(x, slot))}>Tirar</button>
                </ItemCard>
              ) : (
                <div class="item empty muted">{slot === 'secundaria' && w.hero.equip.arma && BASES[w.hero.equip.arma.base]!.hands === 2 ? 'Arma de duas mãos' : 'Vazio'}</div>
              )}
            </div>
          );
        })}
      </div>
      <h3>Baú da vila <span class="muted">({w.village.stash.length}/24)</span></h3>
      <div class="tabs">
        {(['todos', ...SLOTS] as const).map((f) => (
          <button key={f} class={filter === f ? 'on' : ''} onClick={() => setFilter(f)}>{f === 'todos' ? 'Todos' : SLOT_NAMES[f]}</button>
        ))}
      </div>
      <div class="grid">
        {stash.length === 0 && <p class="muted">Nada aqui.</p>}
        {stash.map((item) => (
          <ItemCard key={item.id} item={item} delta={deltaOf(item)}>
            <span class="row-buttons">
              <button disabled={!inVillage} onClick={() => act((x) => commands.equip(x, item.id))}>Vestir</button>
              <button class="ghost" onClick={() => act((x) => commands.sell(x, item.id))} title="Vende pela metade do valor">Vender {nf(itemValue(item) / 2)}</button>
            </span>
          </ItemCard>
        ))}
      </div>
    </div>
  );
}
