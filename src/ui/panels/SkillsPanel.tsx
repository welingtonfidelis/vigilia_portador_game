import { useState } from 'preact/hooks';
import type { Session } from '../../game/session.ts';
import { BALANCE, SKILLS, SKILL_IDS, commands } from '../../sim/index.ts';
import type { SkillId, World } from '../../sim/index.ts';
import { duration } from '../format.ts';

export function SkillsPanel({ session, w }: { session: Session; w: World }) {
  const [msg, setMsg] = useState<string | null>(null);
  const h = w.hero;
  const trainer = w.village.buildings.treinador;
  const actives = h.learned.filter((id) => !SKILLS[id].passive);
  return (
    <div class="skills">
      <p class="note">
        Pontos de habilidade: <b>{h.skillPoints}</b> (1 por nível) · Treinador nível <b>{trainer}</b>
        {trainer === 0 && ' — construa o treinador na vila para aprender as habilidades do Ato I'}
      </p>
      {msg && <p class="note warn">{msg}</p>}
      <h3>Barra (3 ativas)</h3>
      <p class="muted small">As regras de combate dizem quando cada uma é usada.</p>
      <div class="bar-slots">
        {h.bar.map((id, i) => (
          <select key={i} value={id ?? ''} onChange={(e) => setMsg(session.run((x) => commands.setBar(x, i, ((e.target as HTMLSelectElement).value || null) as SkillId | null)))}>
            <option value="">— vazio —</option>
            {actives.map((a) => <option key={a} value={a}>{SKILLS[a].name}</option>)}
          </select>
        ))}
      </div>
      <h3>Ato I · a Cripta</h3>
      <div class="grid">
        {SKILL_IDS.map((id) => {
          const d = SKILLS[id];
          const known = h.learned.includes(id);
          return (
            <div key={id} class={`skill ${known ? 'known' : ''}`}>
              <div class="item-head">
                <span class="item-name">{d.name}</span>
                <span class="muted small">{d.passive ? 'passiva' : `ativa · recarga ${duration(d.cooldown)}`}</span>
              </div>
              <p>{d.desc}</p>
              {known ? (
                <span class="ok small">Aprendida{!d.passive && !h.bar.includes(id) ? ' (fora da barra)' : ''}</span>
              ) : (
                <button disabled={w.phase !== 'vila'} onClick={() => setMsg(session.run((x) => commands.learn(x, id)))}>
                  Aprender · 1 ponto e {BALANCE.skillGold * d.act} de ouro
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
