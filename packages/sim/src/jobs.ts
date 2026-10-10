import { computeOutput, population } from "./economy.js";
import type { Colony, GameState } from "./types.js";

/**
 * Uses the fewest farmers that keep the colony fed, keeping the current number
 * of scientists, and makes everyone else a worker. If the colony can't feed
 * itself, every non-scientist farms and the empire food pool covers the rest.
 */
export function assignJobsForFood(state: GameState, colony: Colony, scientists = colony.scientists): void {
  const planet = state.planets[colony.planetId]!;
  const player = state.players[colony.ownerId]!;
  const pop = population(colony);
  const sci = Math.min(scientists, pop);
  const others = pop - sci;
  for (let farmers = 0; farmers <= others; farmers++) {
    const trial: Colony = { ...colony, farmers, workers: others - farmers, scientists: sci };
    if (computeOutput(planet, player, trial).foodNet >= 0 || farmers === others) {
      colony.farmers = trial.farmers;
      colony.workers = trial.workers;
      colony.scientists = trial.scientists;
      return;
    }
  }
}
