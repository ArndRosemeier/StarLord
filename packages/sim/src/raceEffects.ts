import { CLIMATES, SIZE_FACTOR, type PlanetSize, type PlanetType } from "./data/planets.js";
import { PICK_VALUES, TRAIT_EFFECTS } from "./data/racePicks.js";
import { hasTrait, type RaceDef } from "./data/races.js";

/**
 * What race picks and special abilities are worth in the rules, in one place,
 * so economy, combat, ship design, espionage and movement read the same
 * numbers. Everything here is pure.
 */

/** Beam to-hit points from the ship attack pick: -20, +20, +50. */
export function shipAttackPickBonus(race: RaceDef): number {
  return PICK_VALUES.shipAttack[race.picks.shipAttack] ?? 0;
}

/** Beam defense points from the ship defense pick: -20, +25, +50. */
export function shipDefensePickBonus(race: RaceDef): number {
  return PICK_VALUES.shipDefense[race.picks.shipDefense] ?? 0;
}

/**
 * Ground combat points (on the d100 troop roll) from race picks: ±10 per
 * level, -10 for low-G troops, +10 for subterranean troops defending their colony.
 */
export function raceGroundBonus(race: RaceDef, defendingColony = false): number {
  let v = race.picks.groundCombat * PICK_VALUES.groundCombatPerLevel;
  if (hasTrait(race, "lowG")) v += TRAIT_EFFECTS.lowGGround;
  if (defendingColony && hasTrait(race, "subterranean")) v += TRAIT_EFFECTS.subterraneanDefense;
  return v;
}

/** Hits each troop of this race takes before it dies (high-G troops take one more). */
export function troopHits(race: RaceDef): number {
  return 1 + (hasTrait(race, "highG") ? TRAIT_EFFECTS.highGTroopHits : 0);
}

/** Climate a race lives as on a planet type: aquatic races see tundra and swamp as terran, ocean and terran as gaia. */
export function raceClimate(race: RaceDef, type: PlanetType): PlanetType {
  if (!hasTrait(race, "aquatic")) return type;
  if (type === "tundra" || type === "swamp") return "terran";
  if (type === "ocean" || type === "terran") return "gaia";
  return type;
}

/**
 * Max population per size class for a race on a planet type, before
 * buildings and techs: aquatic climate shift, tolerant races treat every
 * habitable climate at least as terran, subterranean add 2 per size class.
 */
export function racePopPerSize(race: RaceDef, type: PlanetType): number {
  const climate = CLIMATES[raceClimate(race, type)];
  if (!climate.habitable) return 0;
  let per = climate.popPerSize;
  if (hasTrait(race, "tolerant")) per = Math.max(per, CLIMATES.terran.popPerSize);
  if (hasTrait(race, "subterranean")) per += TRAIT_EFFECTS.subterraneanPopPerSize;
  return per;
}

/** Racial max population of a planet before buildings and techs. */
export function raceMaxPopulation(race: RaceDef, type: PlanetType, size: PlanetSize): number {
  return racePopPerSize(race, type) * SIZE_FACTOR[size];
}

/** Base food per farmer for a race on a planet type, with the aquatic climate shift (racial farming pick not included). */
export function raceFoodPerFarmer(race: RaceDef, type: PlanetType): number {
  return CLIMATES[raceClimate(race, type)].foodPerFarmer;
}

/** Spy roll points for this race's spies abroad: the full racial bonus, +10 for telepaths. */
export function offensiveSpyPoints(race: RaceDef): number {
  return race.picks.spying * PICK_VALUES.spyingPerLevel + (hasTrait(race, "telepathic") ? TRAIT_EFFECTS.telepathicSpy : 0);
}

/** Spy roll points for this race's defenders: half the racial bonus, +10 for telepaths. */
export function defensiveSpyPoints(race: RaceDef): number {
  return race.picks.spying * PICK_VALUES.spyingPerLevel * PICK_VALUES.defensiveSpyShare + (hasTrait(race, "telepathic") ? TRAIT_EFFECTS.telepathicSpy : 0);
}

/** Parsecs per turn a race's fleets move beyond their drive (trans-dimensional +2). */
export function raceFleetSpeedBonus(race: RaceDef): number {
  return hasTrait(race, "transDimensional") ? TRAIT_EFFECTS.transDimensionalSpeed : 0;
}

/** Combat speed a race's ships get beyond their drive (trans-dimensional +4). */
export function raceCombatSpeedBonus(race: RaceDef): number {
  return hasTrait(race, "transDimensional") ? TRAIT_EFFECTS.transDimensionalCombatSpeed : 0;
}

/** Command points each colony adds (warlord 2). */
export function raceCommandPointsPerColony(race: RaceDef): number {
  return hasTrait(race, "warlord") ? TRAIT_EFFECTS.warlordCommandPerColony : 0;
}

/** Crew experience levels ships start with above normal (warlord 1), and whether crews can reach ultra-elite. */
export function raceCrewBonus(race: RaceDef): { startLevels: number; ultraElite: boolean } {
  const w = hasTrait(race, "warlord");
  return { startLevels: w ? TRAIT_EFFECTS.warlordCrewLevels : 0, ultraElite: w };
}

/** In-battle repair per round (share of armor/structure and of systems) for cybernetic races. */
export function raceCombatRepair(race: RaceDef): { hull: number; systems: number } {
  return hasTrait(race, "cybernetic")
    ? { hull: TRAIT_EFFECTS.cyberneticRepair, systems: TRAIT_EFFECTS.cyberneticSystemsRepair }
    : { hull: 0, systems: 0 };
}

/** BC earned per unit of surplus food (½, fantastic traders 1). */
export function surplusFoodBc(race: RaceDef): number {
  return hasTrait(race, "fantasticTraders") ? TRAIT_EFFECTS.traderFoodBc : TRAIT_EFFECTS.normalFoodBc;
}

/** Multiplier on trade treaty income (fantastic traders +25%). */
export function treatyIncomeMult(race: RaceDef): number {
  return 1 + (hasTrait(race, "fantasticTraders") ? TRAIT_EFFECTS.traderTreatyBonus : 0);
}

/** Multiplier on BC from trade goods (fantastic traders double). */
export function tradeGoodsMult(race: RaceDef): number {
  return hasTrait(race, "fantasticTraders") ? TRAIT_EFFECTS.traderGoodsMult : 1;
}

/** Diplomatic points a race brings to every deal it offers (telepathic, charismatic). */
export function raceDiplomacyPoints(race: RaceDef): number {
  return (hasTrait(race, "telepathic") ? TRAIT_EFFECTS.telepathicDiplomacy : 0)
    + (hasTrait(race, "charismatic") ? TRAIT_EFFECTS.charismaticDiplomacy : 0);
}

/** Whether a race's fleets are hidden on the galaxy map. */
export function hasStealthyShips(race: RaceDef): boolean {
  return hasTrait(race, "stealthy");
}

/** Whether a race sees every fleet, stealthy or not. */
export function seesAllFleets(race: RaceDef): boolean {
  return hasTrait(race, "omniscient");
}

/** Whether a race ignores nebula and hyperspace-flux movement limits. */
export function ignoresSpaceHazards(race: RaceDef): boolean {
  return hasTrait(race, "transDimensional");
}
