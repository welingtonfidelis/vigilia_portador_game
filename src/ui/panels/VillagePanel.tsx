import { useState } from 'preact/hooks';
import type { Session } from '../../game/session.ts';
import { AFFIXES, AFFIX_IDS, BALANCE, BASES, BUILDINGS, BUILDING_IDS, MATERIAL_NAMES, SLOT_NAMES, commands, floorTier, forgeCap, forgeCost, lacking, nextCost, reforgeCost } from '../../sim/index.ts';
import type { AffixId, Cost, ForgeRarity, World } from '../../sim/index.ts';
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
  const [rarity, setRarity] = useState<ForgeRarity>('comum');
  const [affix, setAffix] = useState<AffixId>('brutal');
  const v = w.village;
  const cap = forgeCap(w);
  const act = (fn: (x: World) => string | null) => setMsg(session.run(fn));
  const all = [...Object.values(w.hero.equip), ...v.stash].filter((i) => !!i);
  const owned = all.filter((i) => i!.tier < cap);
  const rerollable = all.filter((i) => i!.affixes.length > 0 && !i!.legend);
  const smith = v.buildings.ferreiro;
  const chosen = rarity === 'comum' ? null : affix;
  const forgeTime = rarity === 'epica' ? BALANCE.epicForgeTicks : rarity === 'rara' ? BALANCE.rareForgeTicks : BALANCE.forgeTicks;
  const matName: Record<string, string> = { ...MATERIAL_NAMES, ambos: 'ossos e ferro' };
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
      {v.forge && (
        <div class="progress">
          {{ forjar: 'Forjando', aprimorar: 'Aprimorando', reforjar: 'Reforjando' }[v.forge.kind]} {itemTitle(v.forge.item)} · falta {duration(v.forge.end - w.tick)}
        </div>
      )}
      <div class="form">
        <label>Forjar
          <select value={baseId} onChange={(e) => setBaseId((e.target as HTMLSelectElement).value)}>
            {Object.values(BASES).map((b) => <option key={b.id} value={b.id}>{b.name} ({SLOT_NAMES[b.slot]})</option>)}
          </select>
          <select value={rarity} onChange={(e) => setRarity((e.target as HTMLSelectElement).value as ForgeRarity)}>
            <option value="comum">comum</option>
            <option value="rara" disabled={smith < 2}>rara{smith < 2 ? ' (ferreiro 2)' : ''}</option>
            <option value="epica" disabled={smith < 4}>épica{smith < 4 ? ' (ferreiro 4)' : ''}</option>
          </select>
          {rarity !== 'comum' && (
            <select value={affix} onChange={(e) => setAffix((e.target as HTMLSelectElement).value as AffixId)} title="O afixo escolhe o material gasto">
              {AFFIX_IDS.map((a) => <option key={a} value={a}>{AFFIXES[a].name} ({matName[AFFIXES[a].mat]})</option>)}
            </select>
          )}
        </label>
        <div class="affix-row">
          <span class="small">
            {costText(forgeCost(cap, rarity, chosen))} · {duration(forgeTime)}
            {rarity === 'epica' ? ' · o segundo afixo é sorteado' : ''}
          </span>
          <button disabled={!!v.forge} onClick={() => act((x) => commands.forge(x, baseId, rarity, chosen))}>Forjar tier {cap}</button>
        </div>
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
      <h4>Reforjar (troca um afixo por outro sorteado){smith < 3 ? ' · ferreiro 3' : ''}</h4>
      <div class="list">
        {rerollable.length === 0 && <p class="muted small">Nenhuma peça com afixo (as lendárias não se reforjam).</p>}
        {rerollable.map((item) => (
          <div key={item!.id} class={`row ${RARITY_CLASS[item!.rarity]}`}>
            <span>{itemTitle(item!)}</span>
            <span class="small muted">{costText(reforgeCost(item!.tier))}</span>
            <span class="affix-row">
              {item!.affixes.map((a, i) => (
                <button key={a} class="ghost" disabled={!!v.forge || smith < 3} onClick={() => act((x) => commands.reforge(x, item!.id, i))} title={`Tirar ${AFFIXES[a].name}`}>
                  ✕ {AFFIXES[a].name}
                </button>
              ))}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
