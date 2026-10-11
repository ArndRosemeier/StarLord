import { RAIDERS_DEFEATED_SCORE } from "./data/raiders.js";
import { RESEARCH, TECH_FIELDS } from "./data/techs.js";
import { empireTotals } from "./economy.js";
import { hyperLevel } from "./empire.js";
import type { GameState, PlayerId } from "./types.js";

/** Empire score used to rank players when the turn limit ends a game. */
export function score(state: GameState, playerId: PlayerId): number {
  const t = empireTotals(state, playerId);
  const p = state.players[playerId]!;
  let fleet = 0;
  for (const f of Object.values(state.fleets)) if (f.ownerId === playerId) fleet += f.ships.reduce((n, s) => n + s.count, 0);
  const hyper = TECH_FIELDS.reduce((n, f) => n + hyperLevel(p, f), 0) * RESEARCH.hyperScore;
  // Destroying the raiders at home is worth more than anything else.
  const raiders = state.raiders.defeatedBy === playerId ? RAIDERS_DEFEATED_SCORE : 0;
  return Math.round(raiders + t.population * 10 + t.colonies * 25 + t.outposts * 5 + p.techs.length * 15 + hyper + t.industry + t.research + fleet * 2);
}
