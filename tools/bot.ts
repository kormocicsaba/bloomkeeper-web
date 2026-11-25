/**
 * Headless bot: plays every level with a simple human-paced policy and suggests time limits.
 *   npm run bot            → table of median finish times + suggested time/par
 *   npm run bot -- 1-7     → one level, verbose
 */
import { LEVELS, type LevelDef } from '../src/data/levels';
import { Sim } from '../src/sim/sim';
import { act } from '../src/game/autoplay';

const ACTION_GAP = 0.42; // seconds between taps
const DT = 1 / 30;

interface RunResult {
  won: boolean;
  t: number;
  lost: number;
  missed: number;
  bestPerfect: number;
  bestChain: number;
}

function run(level: LevelDef, seed: number): RunResult {
  const lvl: LevelDef = { ...level, time: 900, par: 900, gentle: level.gentle };
  const sim = new Sim(lvl, seed);
  let cd = 0.8;
  while (sim.status === 'playing' || sim.status === 'boss') {
    sim.step(DT);
    sim.drainEvents();
    cd -= DT;
    if (cd <= 0) {
      const did = act(sim);
      cd = did ? ACTION_GAP : 0.1;
    }
    if (sim.t > 900) break;
  }
  return { won: sim.status === 'won', t: sim.t, lost: sim.plantsLost, missed: sim.missed, bestPerfect: sim.bestPerfect, bestChain: sim.bestChain };
}

const only = process.argv[2];
const rows: string[] = [];
const out: Record<string, [number, number]> = {};
for (const level of LEVELS) {
  if (only && level.id !== only) continue;
  if (level.world === 0 && level.time === null) continue;
  const res = Array.from({ length: 12 }, (_, i) => run(level, 1000 + i * 7919));
  const times = res.filter((r) => r.won).map((r) => r.t).sort((a, b) => a - b);
  const med = times[Math.floor(times.length / 2)] ?? NaN;
  const limit = Math.round((med * 1.6) / 5) * 5;
  const par = Math.round(med * 1.15);
  out[level.id] = [limit, par];
  const avg = (k: keyof RunResult) => (res.reduce((a, r) => a + (r[k] as number), 0) / res.length).toFixed(1);
  rows.push(
    `${level.id.padEnd(5)} ${level.title.padEnd(20)} won ${String(times.length).padStart(2)}/12  med ${med.toFixed(0).padStart(4)}s  ` +
      `→ time ${String(limit).padStart(4)} par ${String(par).padStart(4)}  lost ${avg('lost')} missed ${avg('missed')} perf ${avg('bestPerfect')} chain ${avg('bestChain')}`,
  );
}
console.log(rows.join('\n'));
console.log('\nexport const TIMES: Record<string, [number, number]> = ' + JSON.stringify(out) + ';');
