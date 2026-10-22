/**
 * Balanceador: o jogador automático joga várias sementes e o relatório confere as metas de
 * docs/VIGILIA-PORTADOR.md §2.12. Sai com código 1 se alguma meta falhar.
 *
 *   npm run balance -- [--seeds 20] [--hours 3] [--from 1000] [--verbose]
 */
import { botTick } from '../src/sim/bot.ts';
import { BALANCE } from '../src/sim/config.ts';
import { BUILDING_IDS, checksum, createWorld, deserialize, nextCost, powerRatio, serialize, step } from '../src/sim/index.ts';
import type { SimEvent, World } from '../src/sim/index.ts';

const args = process.argv.slice(2);
const num = (flag: string, d: number) => {
  const i = args.indexOf(flag);
  return i >= 0 ? Number(args[i + 1]) : d;
};
const SEEDS = num('--seeds', 20);
const HOURS = num('--hours', 3);
const VERBOSE = args.includes('--verbose');
const FROM = num('--from', 1000);
const TICKS = HOURS * 3600 * BALANCE.ticksPerSecond;
const MIN = 600;

interface Run {
  seed: number;
  boss5: number | null;
  boss10: number | null;
  deaths: number;
  roomSec: number;
  roomDmg: number;
  bossSec: number;
  lossFrac: number | null;
  remainsRatio: number | null;
  maxStallMin: number;
  forgeOk: boolean;
  goldEnd: number;
  /** Ouro no tesouro ao vencer o chefe do andar 10 ÷ custo da obra mais barata ainda possível. */
  goldIdle: number | null;
  senhorSec: number | null;
  senhorPhase2: number | null;
  /** Encomendas ao ferreiro (forjar, aprimorar e reforjar) até vencer o andar 10. */
  forgedAtBoss10: number | null;
  impasses: number;
  deepest: number;
  level: number;
  ratioAtDeepest: number;
  hash: string;
}

function runSeed(seed: number): Run {
  let w: World = createWorld(seed);
  let forgeOk = true;
  let impasses = 0;
  let lastDeep = 1;
  let lastDeepTick = 0;
  let maxStall = 0;
  const ev: SimEvent[] = [];
  let prevPhase = w.phase;
  let goldIdle: number | null = null;
  let forgedAtBoss10: number | null = null;
  for (let t = 0; t < TICKS; t++) {
    ev.length = 0;
    step(w, ev);
    if (w.phase === 'vila' && (prevPhase !== 'vila' || w.tick % 20 === 0)) botTick(w);
    prevPhase = w.phase;
    if (goldIdle === null && w.bossesBeaten.includes(10)) {
      const costs = BUILDING_IDS.map((id) => nextCost(w, id)?.gold).filter((g): g is number => g !== undefined);
      goldIdle = costs.length ? w.village.gold / Math.min(...costs) : 0;
      forgedAtBoss10 = w.stats.forged + w.stats.upgraded;
    }
    if (w.room?.phase === 'luta' && w.tick - w.room.fightStart === 3000) impasses++;
    if (w.hero.deepest > lastDeep) {
      lastDeep = w.hero.deepest;
      lastDeepTick = w.tick;
    }
    if (!w.bossesBeaten.includes(10)) maxStall = Math.max(maxStall, w.tick - lastDeepTick);
    if (w.tick % MIN === 0) {
      const cap = Math.min(2 * w.village.buildings.ferreiro, Math.ceil(Math.min(w.hero.deepest, 10) / 2));
      if (cap > Math.ceil(w.hero.deepest / 2)) forgeOk = false;
    }
    // A cada 10 min, salva e carrega: o mundo tem de continuar igual.
    if (w.tick % (10 * MIN) === 0) w = deserialize(serialize(w));
  }
  const s = w.stats;
  return {
    seed,
    boss5: s.bossFirst['5'] ?? null,
    boss10: s.bossFirst['10'] ?? null,
    deaths: s.deaths,
    roomSec: s.rooms ? s.fightTicks / s.rooms / 10 : 0,
    roomDmg: s.roomDamageCount ? s.roomDamageFrac / s.roomDamageCount : 0,
    bossSec: s.bossFights ? s.bossFightTicks / s.bossFights / 10 : 0,
    lossFrac: s.bagValueAtDeath > 0 ? s.lostValueAtDeath / s.bagValueAtDeath : null,
    remainsRatio: s.remainsCreated > 0 ? s.remainsRecovered / s.remainsCreated : null,
    maxStallMin: maxStall / MIN,
    forgeOk,
    goldEnd: w.village.gold,
    goldIdle,
    senhorSec: s.senhorFights ? s.senhorFightTicks / s.senhorFights / 10 : null,
    senhorPhase2: s.senhorFights ? s.senhorPhase2Frac / s.senhorFights : null,
    forgedAtBoss10,
    impasses,
    deepest: w.hero.deepest,
    level: w.hero.level,
    ratioAtDeepest: powerRatio(w, w.hero.deepest),
    hash: checksum(JSON.stringify(w)),
  };
}

const median = (xs: number[]) => {
  if (xs.length === 0) return NaN;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)]!;
};
const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN);
const f1 = (n: number) => (Number.isFinite(n) ? n.toFixed(1) : '—');

const t0 = performance.now();
const runs: Run[] = [];
for (let i = 0; i < SEEDS; i++) runs.push(runSeed(FROM + i));
const ms = performance.now() - t0;
// Determinismo: a mesma semente de novo.
const again = runSeed(FROM);

if (VERBOSE) {
  console.log('semente  chefe5  chefe10  mortes  fundo  nível  razão  sala(s)  dano  chefe(s)  perda  restos  parede');
  for (const r of runs) {
    console.log(
      `${r.seed}     ${r.boss5 ? f1(r.boss5 / MIN) : '—'}    ${r.boss10 ? f1(r.boss10 / MIN) : '—'}     ${r.deaths}      ${r.deepest}     ${r.level}     ${r.ratioAtDeepest.toFixed(2)}   ${f1(r.roomSec)}     ${(r.roomDmg * 100).toFixed(0)}%   ${f1(r.bossSec)}     ${r.lossFrac === null ? '—' : (r.lossFrac * 100).toFixed(0) + '%'}   ${r.remainsRatio === null ? '—' : (r.remainsRatio * 100).toFixed(0) + '%'}   ${f1(r.maxStallMin)}`,
    );
  }
}

const boss5 = runs.map((r) => r.boss5).filter((x): x is number => x !== null);
const boss10 = runs.map((r) => r.boss10).filter((x): x is number => x !== null);
const lost = runs.map((r) => r.lossFrac).filter((x): x is number => x !== null);
const rec = runs.map((r) => r.remainsRatio).filter((x): x is number => x !== null);

interface Check { name: string; value: string; ok: boolean }
const checks: Check[] = [
  { name: 'Chefe do andar 5 (mediana, min)', value: f1(median(boss5) / MIN), ok: boss5.length > 0 && median(boss5) / MIN >= 20 && median(boss5) / MIN <= 40 },
  { name: 'Chefe do andar 10 (mediana, min)', value: f1(median(boss10) / MIN), ok: boss10.length > 0 && median(boss10) / MIN >= 60 && median(boss10) / MIN <= 100 },
  { name: 'Sementes que venceram o andar 10', value: `${boss10.length}/${runs.length}`, ok: boss10.length >= 0.9 * runs.length },
  { name: 'Mortes por hora', value: f1(mean(runs.map((r) => r.deaths)) / HOURS), ok: mean(runs.map((r) => r.deaths)) / HOURS >= 0.5 && mean(runs.map((r) => r.deaths)) / HOURS <= 2.5 },
  { name: 'Luta média por sala (s)', value: f1(mean(runs.map((r) => r.roomSec))), ok: mean(runs.map((r) => r.roomSec)) >= 10 && mean(runs.map((r) => r.roomSec)) <= 35 },
  { name: 'Dano por sala comum (% da vida)', value: (mean(runs.map((r) => r.roomDmg)) * 100).toFixed(0), ok: mean(runs.map((r) => r.roomDmg)) >= 0.1 && mean(runs.map((r) => r.roomDmg)) <= 0.35 },
  { name: 'Luta de chefe (s)', value: f1(mean(runs.map((r) => r.bossSec).filter((x) => x > 0))), ok: (() => { const b = mean(runs.map((r) => r.bossSec).filter((x) => x > 0)); return b >= 45 && b <= 120; })() },
  { name: 'Perda na morte (% do valor da mochila)', value: lost.length ? (mean(lost) * 100).toFixed(0) : '—', ok: lost.length > 0 && mean(lost) >= 0.55 && mean(lost) <= 0.8 },
  { name: 'Restos recuperados', value: rec.length ? (mean(rec) * 100).toFixed(0) + '%' : '—', ok: rec.length === 0 || mean(rec) >= 0.5 },
  {
    name: 'Parede sem avanço antes do chefe 10 (mediana · pior, min)',
    value: `${f1(median(runs.map((r) => r.maxStallMin)))} · ${f1(Math.max(...runs.map((r) => r.maxStallMin)))}`,
    ok: median(runs.map((r) => r.maxStallMin)) <= 30 && Math.max(...runs.map((r) => r.maxStallMin)) <= 50,
  },
  { name: 'Ouro parado ao vencer o andar 10 (mediana, × obra)', value: f1(median(runs.map((r) => r.goldIdle ?? 0))), ok: median(runs.map((r) => r.goldIdle ?? 0)) < 3 },
  (() => {
    const xs = runs.map((r) => r.senhorSec).filter((x): x is number => x !== null);
    return { name: 'Luta com o Senhor da Cripta (s)', value: f1(mean(xs)), ok: xs.length > 0 && mean(xs) >= 60 && mean(xs) <= 150 };
  })(),
  (() => {
    const xs = runs.map((r) => r.senhorPhase2).filter((x): x is number => x !== null);
    return { name: 'Fase 2 do Senhor (fração da luta)', value: xs.length ? `${(mean(xs) * 100).toFixed(0)}%` : '—', ok: xs.length > 0 && mean(xs) >= 0.25 && mean(xs) <= 0.75 };
  })(),
  (() => {
    const xs = runs.map((r) => r.forgedAtBoss10).filter((x): x is number => x !== null);
    return {
      name: 'Encomendas ao ferreiro até o andar 10 (mín · mediana)',
      value: xs.length ? `${Math.min(...xs)} · ${median(xs)}` : '—',
      ok: xs.length > 0 && Math.min(...xs) >= 1 && median(xs) >= 3,
    };
  })(),
  { name: 'Teto da forja ≤ tier do mais fundo', value: runs.every((r) => r.forgeOk) ? 'sim' : 'não', ok: runs.every((r) => r.forgeOk) },
  { name: 'Impasses (lutas > 300 s)', value: String(runs.reduce((s, r) => s + r.impasses, 0)), ok: runs.every((r) => r.impasses === 0) },
  { name: 'Determinismo (mesma semente, saves a cada 10 min)', value: again.hash === runs[0]!.hash ? 'igual' : 'DIFERENTE', ok: again.hash === runs[0]!.hash },
  { name: `Desempenho (${HOURS} h por semente, s)`, value: (ms / SEEDS / 1000).toFixed(2), ok: ms / SEEDS / 1000 < HOURS },
];

console.log(`\nO Portador da Chama · balanceador · ${SEEDS} sementes × ${HOURS} h (jogador automático)\n`);
for (const c of checks) console.log(`${c.ok ? '✔' : '✘'} ${c.name.padEnd(52)} ${c.value}`);
console.log(`\nAndar mais fundo: média ${f1(mean(runs.map((r) => r.deepest)))} · nível médio ${f1(mean(runs.map((r) => r.level)))} · ouro no fim ${Math.round(mean(runs.map((r) => r.goldEnd)))}`);
process.exit(checks.every((c) => c.ok) ? 0 : 1);
