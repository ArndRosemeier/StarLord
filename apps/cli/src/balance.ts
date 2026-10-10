import { parseArgs } from "node:util";
import { mkdirSync, writeFileSync } from "node:fs";
import { automationOrders } from "@starlord/ai";
import {
  RACES_BY_ID, empireTotals, empires, newGame, playerView, processTurn, relation, score,
  type GalaxySize, type GameState, type TurnOrders,
} from "@starlord/sim";

/**
 * Balance report: plays many all-AI games and averages how empires develop
 * over time, how games end and how each race fares. Used to tune the numbers
 * in packages/sim/src/data against MoO2-like pacing.
 *   pnpm balance --games 40 --turns 250
 */

const { values } = parseArgs({
  options: {
    seed: { type: "string", default: "1" },
    games: { type: "string", default: "20" },
    turns: { type: "string", default: "250" },
    players: { type: "string", default: "5" },
    galaxy: { type: "string", default: "medium" },
    out: { type: "string" },
  },
});

const CHECKPOINTS = [25, 50, 75, 100, 150, 200, 250, 300, 400];
const METRICS = ["colonies", "outposts", "pop", "industry", "research", "techs", "ships", "bc", "atWar"] as const;
type Metric = (typeof METRICS)[number];

interface Sample { turn: number; values: Record<Metric, number> }

function snapshot(state: GameState): Record<Metric, number> {
  const alive = empires(state).filter((p) => p.alive);
  const sum = Object.fromEntries(METRICS.map((m) => [m, 0])) as Record<Metric, number>;
  for (const p of alive) {
    const t = empireTotals(state, p.id);
    sum.colonies += t.colonies;
    sum.outposts += t.outposts;
    sum.pop += t.population;
    sum.industry += t.industry;
    sum.research += t.research;
    sum.techs += p.techs.length;
    sum.bc += p.bc;
    sum.ships += Object.values(state.fleets).filter((f) => f.ownerId === p.id).reduce((n, f) => n + f.ships.reduce((m, s) => m + s.count, 0), 0);
    sum.atWar += alive.some((o) => o.id !== p.id && relation(state, p.id, o.id).status === "war") ? 1 : 0;
  }
  for (const m of METRICS) sum[m] /= Math.max(1, alive.length);
  return sum;
}

const games = Number(values.games);
const turns = Number(values.turns);
const timeline = new Map<number, { n: number; total: Record<Metric, number> }>();
const endings: Record<string, number> = {};
const lengths: number[] = [];
const races: Record<string, { played: number; won: number; score: number; eliminated: number }> = {};
const counts: Record<string, number> = {};
const t0 = performance.now();

for (let g = 0; g < games; g++) {
  let state = newGame({
    seed: `${values.seed}-${g}`,
    playerCount: Number(values.players),
    galaxySize: values.galaxy as GalaxySize,
    maxTurns: turns,
  });
  while (!state.over) {
    const orders: TurnOrders = {};
    for (const p of state.players) if (p.alive && p.kind === "empire") orders[p.id] = automationOrders(playerView(state, p.id));
    state = processTurn(state, orders);
    for (const e of state.events) {
      if (["colonyCaptured", "combat", "raid", "eliminated", "starvation", "commandRejected"].includes(e.kind)) {
        counts[e.kind] = (counts[e.kind] ?? 0) + 1;
      }
    }
    const turn = state.turn - 1;
    if (CHECKPOINTS.includes(turn)) {
      const s = snapshot(state);
      const row = timeline.get(turn) ?? { n: 0, total: Object.fromEntries(METRICS.map((m) => [m, 0])) as Record<Metric, number> };
      row.n++;
      for (const m of METRICS) row.total[m] += s[m];
      timeline.set(turn, row);
    }
  }
  endings[state.victory ?? "none"] = (endings[state.victory ?? "none"] ?? 0) + 1;
  lengths.push(state.turn - 1);
  for (const p of empires(state)) {
    const r = (races[p.raceId] ??= { played: 0, won: 0, score: 0, eliminated: 0 });
    r.played++;
    r.score += score(state, p.id);
    if (state.winner === p.id) r.won++;
    if (!p.alive) r.eliminated++;
  }
  process.stdout.write(".");
}

const secs = (performance.now() - t0) / 1000;
console.log(`\n${games} games of up to ${turns} turns in ${secs.toFixed(1)}s`);
const r1 = (n: number) => Math.round(n * 10) / 10;
console.log("\nAverage empire (alive empires only) at each checkpoint:");
console.table([...timeline.entries()].map(([turn, row]) => ({
  turn,
  games: row.n,
  ...Object.fromEntries(METRICS.map((m) => [m, r1(row.total[m] / row.n)])),
})));
console.log("Endings:", endings, "average length", r1(lengths.reduce((a, b) => a + b, 0) / lengths.length));
console.log("Per game:", Object.fromEntries(Object.entries(counts).map(([k, v]) => [k, r1(v / games)])));
const raceRows = Object.entries(races)
  .map(([id, r]) => ({
    race: RACES_BY_ID[id]!.name,
    played: r.played,
    winRate: `${Math.round((100 * r.won) / r.played)}%`,
    eliminated: `${Math.round((100 * r.eliminated) / r.played)}%`,
    avgScore: Math.round(r.score / r.played),
  }))
  .sort((a, b) => b.avgScore - a.avgScore);
console.table(raceRows);

if (values.out) {
  mkdirSync("runs", { recursive: true });
  const file = `runs/${values.out}.json`;
  writeFileSync(file, JSON.stringify({ games, turns, timeline: [...timeline], endings, counts, races: raceRows }, null, 2));
  console.log(`Wrote ${file}`);
}
