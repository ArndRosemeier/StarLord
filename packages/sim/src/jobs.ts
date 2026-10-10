import { computeOutput, population } from "./economy.js";
import type { Colony, GameState } from "./types.js";

/**
 * Kills up to `n` population units: workers first, then farmers, then
 * scientists, natives last. Returns how many died.
 */
export function removePopulation(colony: Colony, n: number): number {
  let lost = 0;
  for (; lost < n && population(colony) > 0; lost++) {
    const natives = colony.natives ?? 0;
    if (colony.workers > 0) colony.workers--;
    else if (colony.farmers > natives) colony.farmers--;
    else if (colony.scientists > 0) colony.scientists--;
    else {
      colony.farmers--;
      colony.natives = Math.max(0, natives - 1);
    }
  }
  return lost;
}

/**
 * Uses the fewest farmers that keep the colony fed, keeping the current number
 * of scientists, and makes everyone else a worker. If the colony can't feed
 * itself, every non-scientist farms and the empire food pool covers the rest.
 */
export function assignJobsForFood(state: GameState, colony: Colony, scientists = colony.scientists): void {
  const planet = state.planets[colony.planetId]!;
  const player = state.players[colony.ownerId]!;
  const pop = population(colony);
  // Natives only ever farm.
  const natives = Math.min(pop, colony.natives ?? 0);
  const sci = Math.min(scientists, pop - natives);
  const others = pop - sci;
  for (let farmers = natives; farmers <= others; farmers++) {
    const trial: Colony = { ...colony, farmers, workers: others - farmers, scientists: sci };
    if (computeOutput(planet, player, trial).foodNet >= 0 || farmers === others) {
      colony.farmers = trial.farmers;
      colony.workers = trial.workers;
      colony.scientists = trial.scientists;
      return;
    }
  }
}
