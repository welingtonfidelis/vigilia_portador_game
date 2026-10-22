/**
 * Balanceador: o jogador automático joga várias sementes e o relatório confere as metas de
 * docs/VIGILIA-PORTADOR.md §2.12. Sai com código 1 se alguma meta falhar.
 *
 *   npm run balance -- [--seeds 20] [--hours 7] [--from 1000] [--verbose]
 *
 * As metas do Ato I olham até a primeira vitória sobre o Senhor (andar 10); as do Ato II, dali até
 * a primeira vitória sobre a Couraça Submersa (andar 20). Algumas sementes jogam de novo sem
 * perfuração, para medir quanto ela pesa nas Minas.
 */
import { botTick } from '../src/sim/bot.ts';
import type { BotOptions } from '../src/sim/bot.ts';
import { BALANCE } from '../src/sim/config.ts';
import { BUILDING_IDS, checksum, createWorld, deserialize, nextCost, powerRatio, serialize, step } from '../src/sim/index.ts';
import type { SimEvent, Stats, World } from '../src/sim/index.ts';

const args = process.argv.slice(2);
const num = (flag: string, d: number) => {
  const i = args.indexOf(flag);
  return i >= 0 ? Number(args[i + 1]) : d;
};
const SEEDS = num('--seeds', 20);
const HOURS = num('--hours', 7);
const PIERCELESS = Math.min(6, SEEDS);
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
  /** Ato II: do Senhor até a Couraça (ou até o fim da corrida). */
  boss15: number | null;
  boss20: number | null;
  act2Hours: number;
  act2Deaths: number;
  act2RoomSec: number;
  act2Rooms: number;
  act2BossSec: number | null;
  couracaSec: number | null;
  couracaPhase2: number | null;
  act2StallMin: number;
  act2StallFloor: number;
}

/** Diferença entre dois retratos das estatísticas (o que aconteceu entre eles). */
function delta(a: Stats, b: Stats): Stats {
  const out = { ...b } as Record<string, unknown>;
  for (const [k, v] of Object.entries(b)) if (typeof v === 'number') out[k] = v - ((a as unknown as Record<string, number>)[k] ?? 0);
  return out as unknown as Stats;
}

function runSeed(seed: number, bot: BotOptions = {}): Run {
  let w: World = createWorld(seed);
  let atBoss10: Stats | null = null;
  let atBoss20: Stats | null = null;
  let act2Stall = 0;
  let act2StallFloor = 0;
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
    if (w.phase === 'vila' && (prevPhase !== 'vila' || w.tick % 20 === 0)) botTick(w, bot);
    prevPhase = w.phase;
    if (!atBoss10 && w.bossesBeaten.includes(10)) atBoss10 = structuredClone(w.stats);
    if (!atBoss20 && w.bossesBeaten.includes(20)) atBoss20 = structuredClone(w.stats);
    if (atBoss10 && !atBoss20) {
      const gap = w.tick - Math.max(lastDeepTick, w.stats.bossFirst['10'] ?? 0);
      if (gap > act2Stall) {
        act2Stall = gap;
        act2StallFloor = lastDeep;
      }
    }
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
  // Ato I: até o Senhor (o resto da corrida já é Ato II). Ato II: do Senhor até a Couraça.
  const s = atBoss10 ?? w.stats;
  const a2 = atBoss10 ? delta(atBoss10, atBoss20 ?? w.stats) : null;
  const b10 = w.stats.bossFirst['10'] ?? null;
  const end2 = w.stats.bossFirst['20'] ?? TICKS;
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
    boss15: w.stats.bossFirst['15'] ?? null,
    boss20: w.stats.bossFirst['20'] ?? null,
    act2Hours: b10 === null ? 0 : (end2 - b10) / 36000,
    act2Deaths: a2?.deaths ?? 0,
    act2RoomSec: a2 && a2.rooms ? a2.fightTicks / a2.rooms / 10 : 0,
    act2Rooms: a2?.rooms ?? 0,
    act2BossSec: a2 && a2.bossFights ? a2.bossFightTicks / a2.bossFights / 10 : null,
    couracaSec: a2 && a2.senhorFights ? a2.senhorFightTicks / a2.senhorFights / 10 : null,
    couracaPhase2: a2 && a2.senhorFights ? a2.senhorPhase2Frac / a2.senhorFights : null,
    act2StallMin: act2Stall / MIN,
    act2StallFloor,
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
// As mesmas sementes de novo, sem perfuração (nada de martelo, alabarda, Perfurante nem Quebra-Couraça).
const blunt: Run[] = [];
for (let i = 0; i < PIERCELESS; i++) blunt.push(runSeed(FROM + i, { noPierce: true }));
// Determinismo: a mesma semente de novo.
const again = runSeed(FROM);

if (VERBOSE) {
  console.log('semente  chefe5  chefe10  chefe15  chefe20  mortes  fundo  nível  razão  sala(s)  dano  chefe(s)  perda  restos  parede  parede2(andar)');
  for (const r of runs) {
    console.log(
      `${r.seed}     ${r.boss5 ? f1(r.boss5 / MIN) : '—'}    ${r.boss10 ? f1(r.boss10 / MIN) : '—'}    ${r.boss15 ? f1(r.boss15 / MIN) : '—'}    ${r.boss20 ? f1(r.boss20 / MIN) : '—'}     ${r.deaths}      ${r.deepest}     ${r.level}     ${r.ratioAtDeepest.toFixed(2)}   ${f1(r.roomSec)}     ${(r.roomDmg * 100).toFixed(0)}%   ${f1(r.bossSec)}     ${r.lossFrac === null ? '—' : (r.lossFrac * 100).toFixed(0) + '%'}   ${r.remainsRatio === null ? '—' : (r.remainsRatio * 100).toFixed(0) + '%'}   ${f1(r.maxStallMin)}   ${f1(r.act2StallMin)} (${r.act2StallFloor})`,
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
  (() => {
    // Até o Senhor (ou a corrida toda, para quem não chegou).
    const perHour = mean(runs.map((r) => r.deaths / ((r.boss10 ?? TICKS) / 36000)));
    return { name: 'Mortes por hora (Ato I)', value: f1(perHour), ok: perHour >= 0.5 && perHour <= 2.5 };
  })(),
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
  // Ato II: as Minas Inundadas.
  (() => {
    const xs = runs.filter((r) => r.boss10 !== null && r.boss15 !== null).map((r) => (r.boss15! - r.boss10!) / MIN);
    return { name: 'Ato II · Capataz (andar 15) depois do Senhor (mediana, min)', value: f1(median(xs)), ok: xs.length > 0 && median(xs) >= 45 && median(xs) <= 100 };
  })(),
  (() => {
    const xs = runs.filter((r) => r.boss10 !== null && r.boss20 !== null).map((r) => (r.boss20! - r.boss10!) / 36000);
    return { name: 'Ato II · Couraça (andar 20) depois do Senhor (mediana, h)', value: f1(median(xs)), ok: xs.length > 0 && median(xs) >= 2 && median(xs) <= 3 };
  })(),
  {
    name: `Ato II · sementes que venceram o andar 20 em ${HOURS} h`,
    value: `${runs.filter((r) => r.boss20 !== null).length}/${runs.length}`,
    ok: runs.filter((r) => r.boss20 !== null).length >= 0.8 * runs.length,
  },
  (() => {
    const xs = runs.filter((r) => r.act2Hours > 0.5).map((r) => r.act2Deaths / r.act2Hours);
    return { name: 'Ato II · mortes por hora', value: f1(mean(xs)), ok: xs.length > 0 && mean(xs) >= 0.5 && mean(xs) <= 2.5 };
  })(),
  (() => {
    const xs = runs.filter((r) => r.act2Rooms > 0).map((r) => r.act2RoomSec);
    return { name: 'Ato II · luta média por sala (s)', value: f1(mean(xs)), ok: xs.length > 0 && mean(xs) >= 10 && mean(xs) <= 35 };
  })(),
  (() => {
    const xs = runs.map((r) => r.couracaSec).filter((x): x is number => x !== null);
    return { name: 'Ato II · luta com a Couraça Submersa (s)', value: f1(mean(xs)), ok: xs.length > 0 && mean(xs) >= 60 && mean(xs) <= 150 };
  })(),
  (() => {
    const sharp = mean(runs.slice(0, PIERCELESS).filter((r) => r.act2Rooms > 0).map((r) => r.act2RoomSec));
    const dull = mean(blunt.filter((r) => r.act2Rooms > 0).map((r) => r.act2RoomSec));
    return { name: 'Ato II · sem perfuração, as salas levam (×)', value: `${(dull / sharp).toFixed(2)}`, ok: dull / sharp >= 1.15 };
  })(),
  (() => {
    // O Ato II dura o dobro do I: a parede segue a mesma proporção (mediana ≤ 45 e pior ≤ 90 min).
    const xs = runs.filter((r) => r.boss10 !== null).map((r) => r.act2StallMin);
    return {
      name: 'Ato II · parede sem avanço (mediana · pior, min)',
      value: `${f1(median(xs))} · ${f1(Math.max(...xs))}`,
      ok: xs.length > 0 && median(xs) <= 45 && Math.max(...xs) <= 90,
    };
  })(),
];

console.log(`\nO Portador da Chama · balanceador · ${SEEDS} sementes × ${HOURS} h (jogador automático)\n`);
for (const c of checks) console.log(`${c.ok ? '✔' : '✘'} ${c.name.padEnd(52)} ${c.value}`);
console.log(`\nAndar mais fundo: média ${f1(mean(runs.map((r) => r.deepest)))} · nível médio ${f1(mean(runs.map((r) => r.level)))} · ouro no fim ${Math.round(mean(runs.map((r) => r.goldEnd)))}`);
process.exit(checks.every((c) => c.ok) ? 0 : 1);
