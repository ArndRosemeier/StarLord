import { empireTotals } from "./economy.js";
import type { GameState, PlayerId } from "./types.js";

/** Empire score used to rank players when the turn limit ends a game. */
export function score(state: GameState, playerId: PlayerId): number {
  const t = empireTotals(state, playerId);
  const p = state.players[playerId]!;
  let fleet = 0;
  for (const f of Object.values(state.fleets)) if (f.ownerId === playerId) fleet += f.ships.reduce((n, s) => n + s.count, 0);
  return Math.round(t.population * 10 + t.colonies * 25 + t.outposts * 5 + p.techs.length * 15 + t.industry + t.research + fleet * 2);
}
