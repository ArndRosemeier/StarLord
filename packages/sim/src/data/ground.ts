/** Ground combat, bombing and conquest numbers. */

/**
 * Troop kinds, as in the original. Ratings are added to every unit's combat
 * roll; hits are how many wounds a unit takes before it dies.
 */
export const TROOPS = {
  militia: { rating: -10, hits: 1 },
  marines: { rating: 0, hits: 1 },
  armor: { rating: 10, hits: 2 },
} as const;
/** Every soldier's basic armor (titanium) is worth this much. */
export const BASE_EQUIPMENT = 5;
/** Rating Powered Armor gives marines and Battleoids give tanks, on top of one extra hit each. */
export const SPECIAL_UNIT_RATING = 10;

export type TroopKind = keyof typeof TROOPS;

/** Each ground combat tech level from data/techs is worth this much on the rating (race picks: raceEffects). */
export const RATING_PER_LEVEL = 10;
/** Powered Armor: marines take one more hit. Battleoids: tanks take one more. */
export const POWERED_ARMOR_HITS = 1;
export const BATTLEOID_HITS = 1;

/**
 * Bombing: every this much damage past the planetary shield is one hit. Each
 * hit falls at random on a building, a trained ground unit or a colonist (one
 * pick per thing there); a ground unit needs as many hits as it can take.
 */
export const BOMB_DAMAGE_PER_HIT = 100;

/**
 * Biological weapons: each Death Spores launch has a 10% chance to kill a
 * colonist, each Bio-Terminator launch 20% (their weapon damage is 1 and 2,
 * so this is the chance per point). Microbiotics halve and Universal Antidote
 * quarters the chance against the defender.
 */
export const SPORE_KILL_CHANCE_PER_POINT = 0.1;
export const SPORE_DEFENSE: { tech: string; mult: number }[] = [
  { tech: "microbiotics", mult: 0.5 },
  { tech: "universalAntidote", mult: 0.25 },
];

/**
 * Technologies taken with a conquered colony, as the original rolls them (per
 * mille, divided by one more than the techs taken so far; at most maxTechs).
 * First each building whose technology the captor lacks yields it with
 * perBuilding; then each colonist yields a random technology of the loser's
 * with perColonist. Computer players' odds rise with the difficulty level
 * (tutor 0 ... impossible 4).
 */
export const CAPTURE_TECH = {
  maxTechs: 4,
  perBuilding: { human: 125, ai: 115, aiPerDifficulty: 5 },
  perColonist: { human: 65, ai: 55, aiPerDifficulty: 5 },
} as const;
