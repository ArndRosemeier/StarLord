import { stateHash } from "./hash.js";
import { newGame, type NewGameOptions } from "./setup.js";
import { processTurn, type TurnOrders } from "./turn.js";
import type { GameState } from "./types.js";

/**
 * A whole game as its starting options plus every turn's orders. Because the
 * sim is deterministic, this is enough to rebuild any turn exactly; it is the
 * replay format and the unit lockstep multiplayer exchanges. Each turn also
 * stores the resulting state hash so a replay (or a peer) can detect desyncs.
 */
export interface GameRecord {
  format: "starlord-record";
  version: 1;
  options: NewGameOptions;
  turns: { orders: TurnOrders; hash: string }[];
}

export function newRecord(options: NewGameOptions): GameRecord {
  return { format: "starlord-record", version: 1, options: structuredClone(options), turns: [] };
}

/** Appends one processed turn. `after` is the state processTurn returned. */
export function recordTurn(record: GameRecord, orders: TurnOrders, after: GameState): void {
  record.turns.push({ orders: structuredClone(orders), hash: stateHash(after) });
}

export class DesyncError extends Error {
  constructor(readonly turn: number, readonly expected: string, readonly actual: string) {
    super(`Replay diverged on turn ${turn}: expected state ${expected}, got ${actual}`);
  }
}

/**
 * Rebuilds the game from its record, optionally stopping after `turns` turns.
 * Throws DesyncError if a turn doesn't reproduce its recorded hash.
 */
export function replayRecord(record: GameRecord, turns = record.turns.length): GameState {
  if (record.format !== "starlord-record" || record.version !== 1) throw new Error("Not a StarLord game record");
  let state = newGame(record.options);
  for (let i = 0; i < Math.min(turns, record.turns.length); i++) {
    const t = record.turns[i]!;
    const turn = state.turn;
    state = processTurn(state, t.orders);
    const hash = stateHash(state);
    if (hash !== t.hash) throw new DesyncError(turn, t.hash, hash);
  }
  return state;
}
