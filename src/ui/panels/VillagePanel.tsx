import { useState } from 'preact/hooks';
import type { Session } from '../../game/session.ts';
import {
  BALANCE, BASES, BUILDINGS, BUILDING_IDS, SLOT_NAMES, commands, floorTier, forgeCap, forgeCost, lacking, nextCost,
} from '../../sim/index.ts';
import type { Cost, World } from '../../sim/index.ts';
import { RARITY_CLASS, duration, itemTitle, nf } from '../format.ts';

function costText(c: Cost): string {
  const parts = [`${nf(c.gold)} de ouro`];
  for (const [m, n] of Object.entries(c.mats)) if (n) parts.push(`${n} de ${m}`);
  if (c.people) parts.push(`${c.people} moradores`);
  return parts.join(' · ');
}

export function VillagePanel({ session, w }: { session: Session; w: World }) {
  const [msg, setMsg] = useState<string | null>(null);
  const [baseId, setBaseId] = useState('espada');
  const [rarity, setRarity] = useState<'comum' | 'rara'>('comum');
  const v = w.village;
  const cap = forgeCap(w);
  const act = (fn: (x: World) => string | null) => setMsg(session.run(fn));
  const owned = [...Object.values(w.hero.equip), ...v.stash].filter((i) => !!i && i.tier < cap);
  return (
    <div class="village">
      <p class="note">
        {v.people} moradores · imposto de {nf(v.people * BALANCE.taxPerPersonPerMinute)} de ouro por minuto · poções a {BALANCE.potionPrice} de ouro (repostas na volta)
      </p>
      {w.phase === 'vila' && (
        <p>
          <button onClick={() => act((x) => commands.descend(x, []))}>Descer agora</button>{' '}
          <span class="muted small">{w.rules.descent.repeat ? 'O herói desce sozinho quando a vida enche.' : '“Descer de novo” está desligado nas regras.'}</span>
        </p>
      )}
      {msg && <p class="note warn">{msg}</p>}
      <h3>Obras</h3>
      {v.construction && (
        <div class="progress">
          <span>{BUILDINGS[v.construction.id].name} → nível {v.construction.level} · falta {duration(v.construction.end - w.tick)}</span>
        </div>
      )}
      <div class="grid">
        {BUILDING_IDS.map((id) => {
          const d = BUILDINGS[id];
          const lvl = v.buildings[id];
          const c = nextCost(w, id);
          const why = c ? lacking(w, c) : null;
          return (
            <div key={id} class="building">
              <div class="item-head">
                <span class="item-name">{d.name}</span>
                <span class="muted small">nível {lvl}/{d.max}</span>
              </div>
              <p class="small">{d.effect(lvl)}</p>
              {c ? (
                <>
                  <p class="small muted">Nível {lvl + 1}: {d.effect(lvl + 1)}</p>
                  <p class="small">{costText(c)}</p>
                  <button disabled={!!why || !!v.construction} title={why ?? ''} onClick={() => act((x) => commands.build(x, id))}>
                    {v.construction ? 'Obra em andamento' : why ? why : 'Construir'}
                  </button>
                </>
              ) : (
                <p class="ok small">Completo</p>
              )}
            </div>
          );
        })}
      </div>
      <h3>Ferreiro</h3>
      <p class="small">
        Teto da forja: <b>tier {cap}</b> (ferreiro nível {v.buildings.ferreiro} forja até o {2 * v.buildings.ferreiro}; o andar mais fundo, o {w.hero.deepest}, é tier {floorTier(w.hero.deepest)})
      </p>
      {v.forge && <div class="progress">{v.forge.kind === 'forjar' ? 'Forjando' : 'Aprimorando'} {itemTitle(v.forge.item)} · falta {duration(v.forge.end - w.tick)}</div>}
      <div class="form">
        <label>Forjar
          <select value={baseId} onChange={(e) => setBaseId((e.target as HTMLSelectElement).value)}>
            {Object.values(BASES).map((b) => <option key={b.id} value={b.id}>{b.name} ({SLOT_NAMES[b.slot]})</option>)}
          </select>
          <select value={rarity} onChange={(e) => setRarity((e.target as HTMLSelectElement).value as 'comum' | 'rara')}>
            <option value="comum">comum</option>
            <option value="rara" disabled={v.buildings.ferreiro < 2}>rara (ferreiro nível 2)</option>
          </select>
          <span class="small">{costText(forgeCost(cap, rarity))} · {duration(BALANCE.forgeTicks)}</span>
          <button disabled={!!v.forge} onClick={() => act((x) => commands.forge(x, baseId, rarity))}>Forjar tier {cap}</button>
        </label>
      </div>
      <h4>Aprimorar (+1 tier, mantém os afixos)</h4>
      <div class="list">
        {owned.length === 0 && <p class="muted small">Nada abaixo do teto da forja.</p>}
        {owned.map((item) => (
          <div key={item!.id} class={`row ${RARITY_CLASS[item!.rarity]}`}>
            <span>{itemTitle(item!)}</span>
            <span class="small muted">{costText(forgeCost(item!.tier + 1, 'comum'))}</span>
            <button disabled={!!v.forge} onClick={() => act((x) => commands.upgrade(x, item!.id))}>Aprimorar</button>
          </div>
        ))}
      </div>
    </div>
  );
}
