import { addToBatch, finishBatch, randomLabSpec, runCombatLab, setupCombatLab, type LabBatch } from "@starlord/ai";

/**
 * Fights random combat-lab battles and lists anything that broke the rules.
 * Usage: pnpm combat-fuzz [battles=500] [first seed=0]
 */
const n = Number(process.argv[2] ?? 500);
const first = Number(process.argv[3] ?? 0);
const all: LabBatch = { runs: 0, wins: {}, draws: 0, avgRounds: 0, avgLost: {}, problems: [] };
const t0 = performance.now();
for (let i = first; i < first + n; i++) {
  const spec = randomLabSpec(String(i));
  const before = all.problems.length;
  addToBatch(all, runCombatLab(setupCombatLab(spec), 0), i);
  if (all.problems.length > before) console.log(`seed ${i}: ${JSON.stringify(spec)}`);
}
const b = finishBatch(all);
console.log(`${b.runs} battles in ${Math.round(performance.now() - t0)} ms; ${b.draws} without a winner; ${b.avgRounds} combat turns on average`);
for (const p of b.problems) console.log(`${p.runs}x (first at seed ${p.firstRun}): ${p.message}`);
if (b.problems.length > 0) process.exitCode = 1;
