import { parseArgs } from "node:util";
import { automationOrders } from "@starlord/ai";
import { newGame, playerView, processTurn, type GameState, type TurnOrders } from "@starlord/sim";

/**
 * Plays all-AI games and counts what happened, to check that every system
 * gets used and to spot commands the AI gets wrong.
 *   pnpm sim:events --games 8 --turns 300
 */
export function playAndCount(seed: string, turns: number, players = 4): { state: GameState; counts: Record<string, number> } {
  let state = newGame({ seed, playerCount: players, maxTurns: turns });
  const counts: Record<string, number> = {};
  const bump = (k: string) => (counts[k] = (counts[k] ?? 0) + 1);
  while (!state.over) {
    const orders: TurnOrders = {};
    for (const p of state.players) if (p.alive && p.kind === "empire") orders[p.id] = automationOrders(playerView(state, p.id));
    for (const cmds of Object.values(orders)) for (const c of cmds ?? []) bump(`command ${c.type}`);
    state = processTurn(state, orders);
    for (const e of state.events) bump(e.kind === "commandRejected" ? `rejected ${e.reason}` : `event ${e.kind}`);
    bump("combat reports");
    counts["combat reports"]! += state.combats.length - 1;
  }
  return { state, counts };
}

const { values } = parseArgs({
  options: {
    seed: { type: "string", default: "1" },
    games: { type: "string", default: "4" },
    turns: { type: "string", default: "300" },
    players: { type: "string", default: "4" },
  },
});

const games = Number(values.games);
const total: Record<string, number> = {};
const wins: Record<string, number> = {};
const t0 = performance.now();
for (let i = 0; i < games; i++) {
  const { state, counts } = playAndCount(`${values.seed}-${i}`, Number(values.turns), Number(values.players));
  wins[`${state.victory}`] = (wins[`${state.victory}`] ?? 0) + 1;
  for (const [k, v] of Object.entries(counts)) total[k] = (total[k] ?? 0) + v;
  console.log(`game ${i}: ${state.players[state.winner!]!.name} won by ${state.victory} on turn ${state.turn - 1}`);
}
console.log(`${games} games in ${((performance.now() - t0) / 1000).toFixed(1)}s; victories:`, wins);
console.table(Object.entries(total).sort().map(([what, n]) => ({ what, perGame: Math.round((n / games) * 10) / 10 })));
