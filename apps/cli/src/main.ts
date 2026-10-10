import { parseArgs } from "node:util";
import { writeFileSync } from "node:fs";
import { automationOrders } from "@starlord/ai";
import {
  RACES_BY_ID, empireTotals, newGame, newRecord, recordTurn, playerView, processTurn, score, stateHash,
  type GalaxySize, type GameState, type TurnOrders,
} from "@starlord/sim";

const { values } = parseArgs({
  options: {
    seed: { type: "string", default: "1" },
    players: { type: "string", default: "4" },
    races: { type: "string" },
    galaxy: { type: "string", default: "medium" },
    turns: { type: "string", default: "200" },
    games: { type: "string", default: "1" },
    every: { type: "string", default: "25" },
    quiet: { type: "boolean", default: false },
    record: { type: "string" },
    help: { type: "boolean", default: false },
  },
});

if (values.help) {
  console.log(`StarLord headless simulator: runs all-AI games with no UI.

  --seed <s>        game seed (default 1); with --games N, seeds s, s+1, ...
  --players <n>     number of empires (default 4)
  --races a,b,c     race ids instead of random ones
  --galaxy <size>   small | medium | large | huge (default medium)
  --turns <n>       turn limit (default 200)
  --games <n>       play several games and summarize race results
  --every <n>       print a status table every n turns (default 25)
  --quiet           only print final results
  --record <file>   save the game's record (options + every turn's orders) for pnpm replay`);
  process.exit(0);
}

function runGame(seed: string, verbose: boolean): GameState {
  const options = {
    seed,
    galaxySize: values.galaxy as GalaxySize,
    playerCount: Number(values.players),
    races: values.races?.split(","),
    maxTurns: Number(values.turns),
  };
  let state = newGame(options);
  const record = values.record ? newRecord(options) : null;
  const every = Number(values.every);
  const started = performance.now();
  while (!state.over) {
    const orders: TurnOrders = {};
    for (const p of state.players) {
      if (!p.alive || p.kind !== "empire") continue;
      orders[p.id] = automationOrders(playerView(state, p.id));
    }
    state = processTurn(state, orders);
    if (record) recordTurn(record, orders, state);
    if (verbose && (state.turn - 1) % every === 0) printTable(state);
  }
  const ms = performance.now() - started;
  if (record) {
    writeFileSync(values.record!, JSON.stringify(record));
    if (verbose) console.log(`Recorded ${record.turns.length} turns to ${values.record}`);
  }
  if (verbose) {
    if ((state.turn - 1) % every !== 0) printTable(state);
    const rejected = state.events.filter((e) => e.kind === "commandRejected").length;
    console.log(
      `\nGame over on turn ${state.turn - 1}. Winner: ${state.players[state.winner!]!.name} (${state.victory}). ` +
        `${(ms / (state.turn - 1)).toFixed(1)} ms/turn, state hash ${stateHash(state)}` +
        (rejected ? `, ${rejected} rejected commands last turn` : ""),
    );
  }
  return state;
}

function printTable(state: GameState): void {
  console.log(`\nTurn ${state.turn - 1}`);
  const rows = state.players.filter((p) => p.kind === "empire").map((p) => {
    const t = empireTotals(state, p.id);
    return {
      empire: p.name,
      alive: p.alive ? "yes" : `died ${p.eliminatedTurn}`,
      colonies: t.colonies,
      pop: t.population,
      food: round(t.food),
      industry: round(t.industry),
      research: round(t.research),
      bc: Math.round(p.bc),
      techs: p.techs.length,
      ships: Object.values(state.fleets).filter((f) => f.ownerId === p.id).reduce((n, f) => n + f.ships.reduce((m, s) => m + s.count, 0), 0),
      score: score(state, p.id),
    };
  });
  console.table(rows);
}

const round = (n: number) => Math.round(n * 10) / 10;

const games = Number(values.games);
if (games <= 1) {
  runGame(values.seed!, !values.quiet);
} else {
  const wins: Record<string, { played: number; won: number; score: number }> = {};
  const started = performance.now();
  for (let i = 0; i < games; i++) {
    const seed = String(Number(values.seed) + i);
    const end = runGame(seed, false);
    for (const p of end.players.filter((x) => x.kind === "empire")) {
      const w = (wins[p.raceId] ??= { played: 0, won: 0, score: 0 });
      w.played++;
      w.score += score(end, p.id);
      if (end.winner === p.id) w.won++;
    }
  }
  console.log(`${games} games in ${((performance.now() - started) / 1000).toFixed(1)}s`);
  console.table(
    Object.entries(wins)
      .map(([race, w]) => ({
        race: RACES_BY_ID[race]!.name,
        played: w.played,
        winRate: `${Math.round((100 * w.won) / w.played)}%`,
        avgScore: Math.round(w.score / w.played),
      }))
      .sort((a, b) => b.avgScore - a.avgScore),
  );
}
