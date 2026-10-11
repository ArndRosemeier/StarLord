import { DEFAULT_RESEARCH_SHARE } from "./data/economy.js";
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
  // Loyal people die before unassimilated aliens.
  if (colony.aliens !== undefined) colony.aliens = Math.min(colony.aliens, population(colony));
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

/**
 * Default jobs for a colony nobody has managed yet: the fewest farmers that
 * keep it fed, and everyone else split between industry and research by
 * `DEFAULT_RESEARCH_SHARE` (an odd unit works in industry).
 */
export function assignDefaultJobs(state: GameState, colony: Colony): void {
  assignJobsForFood(state, colony, 0);
  const rest = colony.workers;
  colony.scientists = Math.floor(rest * DEFAULT_RESEARCH_SHARE);
  colony.workers = rest - colony.scientists;
}

/** The job a newly grown non-farming unit takes: whichever of industry and research is behind the default split. */
export function newUnitJob(colony: Colony): "workers" | "scientists" {
  const after = colony.workers + colony.scientists + 1;
  return colony.scientists < Math.floor(after * DEFAULT_RESEARCH_SHARE) ? "scientists" : "workers";
}

/** Shuts down androids that lack industry upkeep: workers first, then scientists, then farmers. */
export function removeAndroids(colony: Colony, n: number): void {
  const a = colony.androids;
  if (!a) return;
  for (let i = 0; i < n; i++) {
    if (a.workers > 0) a.workers--;
    else if (a.scientists > 0) a.scientists--;
    else if (a.farmers > 0) a.farmers--;
  }
  if (a.workers + a.scientists + a.farmers === 0) delete colony.androids;
}
