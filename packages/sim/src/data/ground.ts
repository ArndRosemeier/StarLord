/** Ground combat, bombing and conquest numbers. */

/**
 * Troop kinds. Ratings are added to every unit's combat roll; hits are how
 * many wounds a unit takes before it dies. Marines and militia take one hit,
 * tanks two (Battleoids three).
 */
export const TROOPS = {
  militia: { rating: 0, hits: 1 },
  marines: { rating: 10, hits: 1 },
  armor: { rating: 20, hits: 2 },
} as const;
export type TroopKind = keyof typeof TROOPS;

/** Each race ground-combat pick level (and each tech level from data/techs) is worth this much on the rating. */
export const RATING_PER_LEVEL = 10;
/** Low-G troops fight at -10; High-G troops take one more hit; subterranean defenders get +10. */
export const LOW_G_RATING = -10;
export const HIGH_G_EXTRA_HITS = 1;
export const SUBTERRANEAN_DEFENSE = 10;
/** Powered Armor: marines take one more hit. Battleoids: tanks take three. */
export const POWERED_ARMOR_HITS = 1;
export const BATTLEOID_HITS = 3;

/** Militia: one unit per this many colonists, rounded up. */
export const MILITIA_PER_POP = 2;

/**
 * Marine Barracks: 4 marines when built, one more every 5 turns, up to half
 * the colony's population or half the planet's base maximum, whichever is
 * less. Armor Barracks: 2 tanks when built, one more every 10 turns, up to a
 * quarter of the population. Warlords train twice as fast and keep twice as many.
 */
export const BARRACKS = {
  marineBarracks: { kind: "marines" as const, initial: 4, every: 5, capShare: 0.5 },
  armorBarracks: { kind: "armor" as const, initial: 2, every: 10, capShare: 0.25 },
};
export const WARLORD_TROOP_MULT = 2;

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
/** Turns of unrest after a conquest. */
export const CONQUEST_UNREST_TURNS = 20;
/** Mind control needs a ship of this size class or larger (cruiser) in the fleet. */
export const MIND_CONTROL_MIN_SIZE = 3;
