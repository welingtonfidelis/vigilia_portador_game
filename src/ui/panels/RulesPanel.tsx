import type { Session } from '../../game/session.ts';
import { COND_NAMES, SKILLS, commands, ruleSlots } from '../../sim/index.ts';
import type { CondId, DescentRules, Rule, RuleAction, SkillId, TargetPolicy, World } from '../../sim/index.ts';

const CONDS = Object.keys(COND_NAMES) as CondId[];
const HAS_PARAM: Record<CondId, { min: number; max: number; unit: string } | null> = {
  vida_abaixo: { min: 5, max: 95, unit: '%' },
  anel_min: { min: 1, max: 3, unit: '' },
  fundo_min: { min: 1, max: 4, unit: '' },
  alvo_elite: null,
  alvo_couraca: null,
  envenenado: { min: 1, max: 5, unit: 'doses' },
  pocoes_max: { min: 0, max: 7, unit: '' },
  sempre: null,
};
const ACTIONS: Record<RuleAction, string> = { pocao: 'beber poção', habilidade: 'usar habilidade', recuar: 'recuar (fugir e voltar)' };
const TARGETS: Record<TargetPolicy, string> = { elite: 'elite primeiro, depois o mais fraco', fraco: 'o mais fraco', forte: 'o mais forte', ferido: 'o mais ferido' };

function Param({ cond, value, onChange }: { cond: CondId; value: number; onChange: (v: number) => void }) {
  const p = HAS_PARAM[cond];
  if (!p) return null;
  return (
    <input type="number" min={p.min} max={p.max} value={value} onChange={(e) => onChange(Math.max(p.min, Math.min(p.max, Number((e.target as HTMLInputElement).value))))} />
  );
}

export function RulesPanel({ session, w }: { session: Session; w: World }) {
  const rules = w.rules.combat;
  const d = w.rules.descent;
  const slots = ruleSlots(w);
  const save = (combat: Rule[], descent: DescentRules = d) => session.run((x) => commands.setRules(x, combat, descent));
  const edit = (i: number, patch: Partial<Rule>) => save(rules.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const move = (i: number, by: number) => {
    const list = [...rules];
    const j = i + by;
    if (j < 0 || j >= list.length) return;
    [list[i], list[j]] = [list[j]!, list[i]!];
    save(list);
  };
  const setD = (patch: Partial<DescentRules>) => save(rules, { ...d, ...patch });
  const actives = Object.values(SKILLS).filter((s) => !s.passive);
  return (
    <div class="rules">
      <h3>Combate</h3>
      <p class="muted small">Lidas de cima para baixo sempre que o herói fica livre. A primeira que vale e está pronta é feita; senão, golpe básico. Valem as {slots} primeiras (+1 por nível do Salão de Táticas).</p>
      <ol class="rule-list">
        {rules.map((r, i) => (
          <li key={i} class={i >= slots ? 'locked' : r.on ? '' : 'off'}>
            <input type="checkbox" checked={r.on} onChange={(e) => edit(i, { on: (e.target as HTMLInputElement).checked })} title="Ligada" />
            <span class="kw">SE</span>
            <select value={r.cond} onChange={(e) => edit(i, { cond: (e.target as HTMLSelectElement).value as CondId })}>
              {CONDS.map((c) => <option key={c} value={c}>{COND_NAMES[c]}</option>)}
            </select>
            <Param cond={r.cond} value={r.param} onChange={(v) => edit(i, { param: v })} />
            <span class="kw">E</span>
            <select value={r.cond2 ?? ''} onChange={(e) => edit(i, { cond2: ((e.target as HTMLSelectElement).value || null) as CondId | null })}>
              <option value="">—</option>
              {CONDS.filter((c) => c !== 'sempre').map((c) => <option key={c} value={c}>{COND_NAMES[c]}</option>)}
            </select>
            {r.cond2 && <Param cond={r.cond2} value={r.param2} onChange={(v) => edit(i, { param2: v })} />}
            <span class="kw">ENTÃO</span>
            <select value={r.action} onChange={(e) => edit(i, { action: (e.target as HTMLSelectElement).value as RuleAction })}>
              {(Object.keys(ACTIONS) as RuleAction[]).map((a) => <option key={a} value={a}>{ACTIONS[a]}</option>)}
            </select>
            {r.action === 'habilidade' && (
              <select value={r.skill ?? ''} onChange={(e) => edit(i, { skill: ((e.target as HTMLSelectElement).value || null) as SkillId | null })}>
                {actives.map((s) => <option key={s.id} value={s.id}>{s.name}{w.hero.learned.includes(s.id) ? '' : ' (não sabe)'}</option>)}
              </select>
            )}
            <span class="row-buttons">
              <button class="ghost" onClick={() => move(i, -1)} aria-label="Subir">↑</button>
              <button class="ghost" onClick={() => move(i, 1)} aria-label="Descer">↓</button>
              <button class="ghost" onClick={() => save(rules.filter((_, j) => j !== i))} aria-label="Apagar">✕</button>
            </span>
            {i >= slots && <span class="muted small">precisa do Salão de Táticas</span>}
          </li>
        ))}
      </ol>
      {rules.length < 8 && (
        <button onClick={() => save([...rules, { on: true, cond: 'vida_abaixo', param: 50, cond2: null, param2: 0, action: 'pocao', skill: null }])}>+ Nova regra</button>
      )}
      <h3>Alvo</h3>
      <select value={d.target} onChange={(e) => setD({ target: (e.target as HTMLSelectElement).value as TargetPolicy })}>
        {(Object.keys(TARGETS) as TargetPolicy[]).map((t) => <option key={t} value={t}>{TARGETS[t]}</option>)}
      </select>
      <h3>Descida</h3>
      <div class="form">
        <label>Andar inicial
          <input type="number" min={1} max={w.hero.deepest} value={Math.min(d.startFloor, w.hero.deepest)} onChange={(e) => setD({ startFloor: Number((e.target as HTMLInputElement).value) })} />
          <span class="muted small">até o {w.hero.deepest}, o mais fundo já alcançado</span>
        </label>
        <label>Até onde descer
          <select value={d.mode} onChange={(e) => setD({ mode: (e.target as HTMLSelectElement).value as DescentRules['mode'] })}>
            <option value="ficar">ficar no andar inicial</option>
            <option value="ate">descer até o andar…</option>
            <option value="sem_limite">descer sem limite</option>
          </select>
          {d.mode === 'ate' && <input type="number" min={1} max={10} value={d.untilFloor} onChange={(e) => setD({ untilFloor: Number((e.target as HTMLInputElement).value) })} />}
        </label>
        <label class="check"><input type="checkbox" checked={d.returnBagFull} onChange={(e) => setD({ returnBagFull: (e.target as HTMLInputElement).checked })} /> Voltar com a mochila cheia</label>
        <label>Voltar sem poções e com vida abaixo de
          <input type="number" min={0} max={95} value={d.returnNoPotionsBelow} onChange={(e) => setD({ returnNoPotionsBelow: Number((e.target as HTMLInputElement).value) })} />%
          <span class="muted small">0 desliga</span>
        </label>
        <label class="check"><input type="checkbox" checked={d.repeat} onChange={(e) => setD({ repeat: (e.target as HTMLInputElement).checked })} /> Descer de novo depois de descansar</label>
        <label class="check"><input type="checkbox" checked={d.waitWound} onChange={(e) => setD({ waitWound: (e.target as HTMLInputElement).checked })} /> Esperar o ferimento sarar</label>
        <label class="check"><input type="checkbox" checked={d.fetchRemains} onChange={(e) => setD({ fetchRemains: (e.target as HTMLInputElement).checked })} /> Buscar os restos (desce ao andar da pilha mais nova, se a Força der)</label>
      </div>
    </div>
  );
}
