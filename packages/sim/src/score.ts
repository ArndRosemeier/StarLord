import { ORION_SCORE } from "./data/monsters.js";
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
  // Taking Orion means its guardian fell: a big bonus, as in the original.
  const orion = Object.values(state.colonies).some(
    (c) => c.ownerId === playerId && state.galaxy.stars.find((s) => s.id === state.planets[c.planetId]?.starId)?.special === "orion",
  ) ? ORION_SCORE : 0;
  return Math.round(orion + t.population * 10 + t.colonies * 25 + t.outposts * 5 + p.techs.length * 15 + hyper + t.industry + t.research + fleet * 2);
}
