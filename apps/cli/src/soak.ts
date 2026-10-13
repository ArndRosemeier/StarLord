import { parseArgs } from "node:util";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { mkdirSync, writeFileSync } from "node:fs";
import { Simulation, type SimResult } from "@starlord/ai";
import type { GalaxySize } from "@starlord/sim";

/**
 * Soak test: plays a spread of all-AI games (seeds x galaxy sizes x player
 * counts) to the end, in parallel, and reports how each ended plus any
 * crashes, broken invariants, slow turns and rejected AI commands.
 *   pnpm soak --seeds 3 --galaxies small,medium,large --players 2,4,6
 * With --vary each galaxy size and player count gets its own seeds, so the
 * races differ between games (otherwise a seed picks the same races everywhere).
 * Exits non-zero when any game crashed or broke an invariant.
 */

const { values } = parseArgs({
  options: {
    seeds: { type: "string", default: "2" },
    seed: { type: "string", default: "1" },
    galaxies: { type: "string", default: "small,medium,large,huge" },
    players: { type: "string", default: "2,4,6,8" },
    turns: { type: "string", default: "400" },
    jobs: { type: "string", default: "4" },
    out: { type: "string" },
    one: { type: "string" },
    /** Give every galaxy size and player count its own seeds, so the races (picked by the seed) vary between games. */
    vary: { type: "boolean", default: false },
  },
});

interface Spec { seed: string; galaxySize: GalaxySize; playerCount: number; maxTurns: number }

if (values.one) {
  // Child process: play one game and print its result as JSON.
  const spec = JSON.parse(values.one) as Spec;
  const sim = new Simulation({ ...spec, now: () => performance.now() });
  const result = sim.run();
  process.stdout.write(JSON.stringify(result));
} else {
  await main();
}

async function main(): Promise<void> {
  const specs: Spec[] = [];
  for (const galaxySize of values.galaxies!.split(",") as GalaxySize[]) {
    for (const playerCount of values.players!.split(",").map(Number)) {
      for (let i = 0; i < Number(values.seeds); i++) {
        const n = Number(values.seed) + i;
        specs.push({ seed: values.vary ? `soak-${n}-${galaxySize}-${playerCount}` : `soak-${n}`, galaxySize, playerCount, maxTurns: Number(values.turns) });
      }
    }
  }
  const file = fileURLToPath(import.meta.url);
  const results: { spec: Spec; result: SimResult | null; error?: string }[] = [];
  const started = performance.now();
  let next = 0;
  const worker = async () => {
    while (next < specs.length) {
      const spec = specs[next++]!;
      const out = await runChild(file, spec);
      results.push({ spec, ...out });
      const r = out.result;
      const tag = `${spec.galaxySize} ${spec.playerCount}p ${spec.seed}`.padEnd(22);
      console.log(r
        ? `${tag} ${r.crashed ? "CRASHED" : `${r.victory} by ${r.winner}`} on turn ${r.turns}` +
          `, ${(r.ms / Math.max(1, r.turns)).toFixed(0)} ms/turn` +
          `, wars ${r.diplomacy?.war ?? 0}, peace ${r.diplomacy?.peace ?? 0}, pacts ${r.diplomacy?.nonAggression ?? 0}, alliances ${r.diplomacy?.alliance ?? 0}` +
          (r.problems.length ? `, ${r.problems.length} problems` : "")
        : `${tag} FAILED ${out.error}`);
    }
  };
  await Promise.all(Array.from({ length: Number(values.jobs) }, worker));

  const done = results.filter((x) => x.result).map((x) => x.result!);
  const endings: Record<string, number> = {};
  for (const r of done) endings[r.crashed ? "crash" : r.victory ?? "unfinished"] = (endings[r.crashed ? "crash" : r.victory ?? "unfinished"] ?? 0) + 1;
  console.log(`\n${results.length} games in ${((performance.now() - started) / 1000).toFixed(0)}s`);
  console.log("Endings:", endings);
  console.log("Average length:", Math.round(done.reduce((n, r) => n + r.turns, 0) / Math.max(1, done.length)), "turns");
  const diplomacy: Record<string, number> = {};
  for (const r of done) for (const [k, n] of Object.entries(r.diplomacy ?? {})) diplomacy[k] = (diplomacy[k] ?? 0) + n;
  console.log("Diplomacy (all games):", diplomacy);
  const quiet = done.filter((r) => !r.diplomacy?.war).length;
  if (quiet) console.log(`${quiet} games without a single war.`);

  const rejected: Record<string, number> = {};
  for (const r of done) for (const [k, n] of Object.entries(r.rejected)) rejected[k] = (rejected[k] ?? 0) + n;
  const top = Object.entries(rejected).sort((a, b) => b[1] - a[1]).slice(0, 15);
  if (top.length) {
    console.log("\nMost rejected AI commands (all games):");
    for (const [k, n] of top) console.log(`  ${String(n).padStart(6)}  ${k}`);
  }

  // Galactic Council: who stands and who wins, by race, against how often each race plays.
  const playing: Record<string, number> = {};
  const standing: Record<string, number> = {};
  const elected: Record<string, number> = {};
  let sessions = 0;
  for (const r of done) {
    for (const e of r.empires) playing[e.race] = (playing[e.race] ?? 0) + 1;
    for (const c of r.councils ?? []) {
      sessions++;
      for (const x of c.candidates) standing[x] = (standing[x] ?? 0) + 1;
      if (c.winner) elected[c.winner] = (elected[c.winner] ?? 0) + 1;
    }
  }
  if (sessions) {
    const won = Object.values(elected).reduce((a, b) => a + b, 0);
    console.log(`\nCouncil: ${sessions} sessions, ${won} elected a leader`);
    for (const race of Object.keys(playing).sort((a, b) => (standing[b] ?? 0) - (standing[a] ?? 0))) {
      console.log(`  ${race.padEnd(10)} plays ${String(playing[race]).padStart(3)}  candidate ${String(standing[race] ?? 0).padStart(3)}  elected ${String(elected[race] ?? 0).padStart(3)}`);
    }
  }

  const seats: Record<string, number> = {};
  for (const r of done) for (const c of r.councils ?? []) for (const id of c.seats ?? []) seats[id] = (seats[id] ?? 0) + 1;
  if (sessions) console.log("Council candidates by seat:", seats);
  const topSeat: Record<string, number> = {};
  for (const r of done) {
    const best = [...r.empires].sort((a, b) => b.score - a.score)[0];
    if (best) topSeat[best.id] = (topSeat[best.id] ?? 0) + 1;
  }
  console.log("Top score by seat:", topSeat);

  // Warship hulls at the snapshot turn, for the smaller and the larger half of the empires.
  const snaps = done.flatMap((r) => r.hulls ?? []);
  if (snaps.length) {
    const median = [...snaps].sort((a, b) => a.population - b.population)[Math.floor(snaps.length / 2)]!.population;
    for (const [label, group] of [["small", snaps.filter((x) => x.population < median)], ["large", snaps.filter((x) => x.population >= median)]] as const) {
      const mix: Record<string, number> = {};
      for (const x of group) for (const [h, n] of Object.entries(x.hulls)) mix[h] = (mix[h] ?? 0) + n;
      console.log(`Warship hulls of ${group.length} ${label} empires (pop ${label === "small" ? "<" : ">="} ${median}):`, mix);
    }
  }

  const bad = results.filter((x) => !x.result || x.result.crashed || x.result.problems.some((p) => p.kind !== "slowTurn"));
  for (const x of results) {
    if (!x.result?.problems.length) continue;
    console.log(`\n${x.spec.galaxySize} ${x.spec.playerCount}p ${x.spec.seed}:`);
    for (const p of x.result.problems.slice(0, 8)) console.log(`  turn ${p.turn} ${p.kind}: ${p.message.split("\n").slice(0, 4).join("\n    ")}`);
  }
  if (values.out) {
    mkdirSync("runs", { recursive: true });
    writeFileSync(`runs/${values.out}.json`, JSON.stringify(results, null, 2));
    console.log(`Wrote runs/${values.out}.json`);
  }
  console.log(bad.length ? `\n${bad.length} games had crashes or invariant problems.` : "\nAll games finished cleanly.");
  process.exit(bad.length ? 1 : 0);
}

function runChild(file: string, spec: Spec): Promise<{ result: SimResult | null; error?: string }> {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [...process.execArgv, file, "--one", JSON.stringify(spec)], { stdio: ["ignore", "pipe", "pipe"] });
    let out = "";
    let err = "";
    child.stdout.on("data", (d) => (out += d));
    child.stderr.on("data", (d) => (err += d));
    child.on("close", (code) => {
      try {
        resolve({ result: JSON.parse(out) as SimResult });
      } catch {
        resolve({ result: null, error: `exit ${code}: ${err.trim().split("\n").slice(-5).join(" | ")}` });
      }
    });
  });
}
