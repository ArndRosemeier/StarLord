import type { GalaxySize } from "../types.js";

/**
 * The original's score, term by term. Every number here is the original's.
 *
 * - Each turn played costs `perTurn` point.
 * - Every empire that started the game is worth `perRace.base` plus
 *   `perRace.perSize` for each galaxy size step above small (100 a race in a
 *   small galaxy up to 160 in a huge one), whether or not it is still alive.
 *   An empire with no population left gets neither this bonus nor the turn
 *   penalty.
 * - Each researched field (one research project, whichever applications came
 *   with it) is worth `perField`; each category with at least one
 *   hyper-advanced level is worth `perHyperCategory` (the original counts
 *   categories, not levels).
 * - Every population unit, androids and conquered people included, is worth
 *   `perPop`.
 * - Population captured by invasion earns `capturedPremium` per unit, divided
 *   by the galaxy size step plus one: worth more in small galaxies.
 * - Each empire eliminated is worth `perEliminated` to the last empire that
 *   attacked one of its colonies.
 * - Slaying Orion's guardian, winning the council vote and beating the raiders
 *   at home add `orion`, `council` and `antares`.
 * - The sum is then scaled by the race's pick multiplier: 100% with every
 *   race pick spent, plus `perUnspentPick` percent for each pick left unspent
 *   (200% with none spent).
 *
 * Difficulty does not enter the original's score.
 */
export const SCORE = {
  perTurn: 1,
  perRace: { base: 100, perSize: 20 },
  perField: 3,
  perHyperCategory: 5,
  perPop: 1,
  capturedPremium: 2,
  perEliminated: 50,
  orion: 100,
  council: 100,
  antares: 250,
  perUnspentPick: 10,
} as const;

/** Galaxy size step used by the score: small 0 .. huge 3. */
export const GALAXY_SIZE_STEP: Record<GalaxySize, number> = { small: 0, medium: 1, large: 2, huge: 3 };

/** Final scores the Hall of Fame keeps, as in the original. */
export const HALL_OF_FAME_SIZE = 10;
