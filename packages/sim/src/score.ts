import { empireTotals } from "./economy.js";
import type { GameState, PlayerId } from "./types.js";

/** Simple empire score used to rank players when the turn limit ends a game. */
export function score(state: GameState, playerId: PlayerId): number {
  const t = empireTotals(state, playerId);
  const p = state.players[playerId]!;
  return Math.round(t.population * 10 + t.colonies * 25 + p.techs.length * 15 + t.industry + t.research);
}
