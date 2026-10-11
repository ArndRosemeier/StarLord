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

/** Every 100 points of bomb damage that lands kills one ground unit, before colonists. */
export const BOMB_DAMAGE_PER_TROOP = 100;
/** One colonist dies per this much bomb damage (plus a random fraction). */
export const BOMB_DAMAGE_PER_POP = 15;
/** Chance per bomb damage point to wreck a building, capped. */
export const BOMB_BUILDING_CHANCE = { perDamage: 1 / 200, max: 0.5 };

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

/** Chance to capture a technology from the loser when taking one of its colonies. */
export const CAPTURE_TECH_CHANCE = 0.5;
