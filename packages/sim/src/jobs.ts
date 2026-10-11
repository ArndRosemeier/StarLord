import { DEFAULT_RESEARCH_SHARE } from "./data/economy.js";
import { computeOutput, population } from "./economy.js";
import type { Rng } from "./rng.js";
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

/** What the colony looks like when a new colonist arrives, for `newColonistJob`. */
export interface NewColonistContext {
  /** Whether farmers grow anything here. */
  canFarm: boolean;
  /** The colony's own food surplus (negative when short), before the newcomer eats. */
  foodNet: number;
  /** Food the newcomer will eat. */
  foodNeed: number;
  /** Food surplus of all the empire's colonies outside blockades. */
  empireFoodNet: number;
  /** Industry left after pollution, and the cybernetic and android upkeep it must cover once the newcomer arrives. */
  industry: number;
  upkeepAfter: number;
}

/**
 * The job a newly grown colonist takes, as in the original: a farmer if the
 * colony can farm and would be short of food with the newcomer, or the empire
 * as a whole has no food to spare; a worker if industry can't cover the
 * colony's cybernetic and android upkeep; otherwise a worker or scientist at
 * random, weighted by how many hold each job now (a worker if there are none).
 */
export function newColonistJob(colony: Colony, ctx: NewColonistContext, rng: Rng): "farmers" | "workers" | "scientists" {
  if (ctx.canFarm) {
    if (ctx.foodNet - ctx.foodNeed < -1e-9 || ctx.empireFoodNet < -1e-9) return "farmers";
    if (Math.abs(ctx.empireFoodNet) <= 1e-9 && ctx.foodNeed > 0) return "farmers";
  }
  if (ctx.industry < ctx.upkeepAfter) return "workers";
  const a = colony.androids;
  const workers = colony.workers + (a?.workers ?? 0);
  const scientists = colony.scientists + (a?.scientists ?? 0);
  if (workers + scientists === 0) return "workers";
  return rng.int(1, workers + scientists) <= workers ? "workers" : "scientists";
}

/**
 * Removes one colonist who starved: a random worker or scientist, a settler
 * farmer only when nobody else is left, natives last (as in the original,
 * where non-farmers die first).
 */
export function starveOne(colony: Colony, rng: Rng): void {
  const others = colony.workers + colony.scientists;
  if (others > 0) {
    if (rng.int(1, others) <= colony.workers) colony.workers--;
    else colony.scientists--;
  } else removePopulation(colony, 1);
  if (colony.aliens !== undefined) colony.aliens = Math.min(colony.aliens, population(colony));
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
