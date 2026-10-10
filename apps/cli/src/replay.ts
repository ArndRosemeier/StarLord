import { readFileSync } from "node:fs";
import { DesyncError, replayRecord, stateHash, type GameRecord } from "@starlord/sim";

/**
 * Replays a recorded game and checks every turn reproduces its recorded hash.
 *   pnpm replay runs/game.json [--turn N]
 */
const args = process.argv.slice(2);
const file = args.find((a) => !a.startsWith("--"));
const turnArg = args.indexOf("--turn");
if (!file) {
  console.log("usage: pnpm replay <record.json> [--turn N]");
  process.exit(1);
}
const record = JSON.parse(readFileSync(file, "utf8")) as GameRecord;
const turns = turnArg >= 0 ? Number(args[turnArg + 1]) : record.turns.length;
const t0 = performance.now();
try {
  const state = replayRecord(record, turns);
  const secs = ((performance.now() - t0) / 1000).toFixed(1);
  console.log(`Replayed ${Math.min(turns, record.turns.length)} turns in ${secs}s; every turn matched. State hash ${stateHash(state)}.`);
  if (state.over) console.log(`Winner: ${state.players[state.winner!]!.name} (${state.victory}).`);
} catch (e) {
  if (e instanceof DesyncError) {
    console.error(e.message);
    process.exit(2);
  }
  throw e;
}
