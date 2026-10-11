import type { Difficulty, TechLevel } from "../types.js";
import type { HullSize } from "./components.js";

/**
 * The Vexari raiders: StarLord's take on the original's Antarans. They live in
 * a pocket dimension, raid colonies once a grace period is over, and their
 * ships get better as the game goes on. Beating their home fleet and citadel
 * through a Dimensional Portal wins the game.
 *
 * Raid timing, size and targeting follow the original's decoded rules: a grace
 * period set by the starting tech level, a build budget that grows every 25
 * turns (faster on Hard and Impossible), ships bought with it at fixed hull
 * prices up to a cap per hull, and a launch roll that gets likelier each turn
 * the raid fleet waits. Their ship designs, home fleet and citadel are our own
 * estimates: xenon technology that improves through four eras and never gets
 * too far ahead of the galaxy's most advanced empire.
 */

/** No raids before this turn, by the game's starting tech level. */
export const RAID_GRACE_TURNS: Record<TechLevel, number> = { preWarp: 200, average: 100, advanced: 0 };
/** Every this many turns after the grace period the raid budget grows. */
export const RAID_BUDGET_PERIOD = 25;
/** Budget growth: ceil(mult × periods elapsed / 100) points each period. */
export const RAID_BUDGET_MULT: Record<Difficulty, number> = { tutor: 100, easy: 100, average: 100, hard: 150, impossible: 200 };
/** Points each raid ship costs; the raiders never send doom stars. */
export const RAIDER_HULL_COST: Partial<Record<HullSize, number>> = { frigate: 2, destroyer: 5, cruiser: 12, battleship: 30, titan: 75 };
/** Most ships of each hull in one raid fleet. */
export const RAID_FLEET_CAP: Partial<Record<HullSize, number>> = { frigate: 4, destroyer: 4, cruiser: 3, battleship: 2, titan: 2 };
/**
 * Once a raid fleet is ready, a counter grows by one each turn and the raid
 * goes when a roll of 1..LAUNCH_ROLL is at most the counter + 1.
 */
export const RAID_LAUNCH_ROLL = 200;
/** Target empires are weighted by (population - smallest)²; a human's population counts this much by difficulty. */
export const RAID_HUMAN_POP_MULT: Record<Difficulty, number> = { tutor: 0.1, easy: 0.2, average: 1, hard: 1.5, impossible: 3 };
/** Lucky empires' population counts a third. */
export const RAID_LUCKY_POP_MULT = 1 / 3;

/** Name of the raiders' hidden home system. */
export const RAIDER_HOME_NAME = "Vex Prime";

/** A weapon on every raider design of an era: a share of the free space, or a fixed count on big hulls. */
export interface RaiderWeapon {
  weaponId: string;
  share?: number;
  count?: number;
  minHull?: HullSize;
}

/** A ship special, fitted from a minimum hull up. */
export interface RaiderSpecial {
  id: string;
  minHull?: HullSize;
}

export interface RaiderEra {
  /** Turns after the first raid when this era may begin... */
  from: number;
  /** ...once the most advanced empire knows this many technologies, so the raiders keep pace with the galaxy. */
  minTechs: number;
  /** Technology the raiders gain in this era (kept in later eras). */
  techs: string[];
  shield: string;
  computer: string;
  specials: RaiderSpecial[];
  /** Weapons in fitting order; whatever space is left takes as many `filler` weapons as fit. */
  weapons: RaiderWeapon[];
  filler: string;
  /** Ships guarding the home system besides the citadel; topped up before every raid. */
  garrison: { hull: HullSize; count: number }[];
  /** The citadel: an immobile fortress with fixed stats. */
  citadel: { hits: number; armor: number; shield: number; attack: number; defense: number; deathRays: number; torpedoes: number };
  /** What a raid that holds the field does to a colony: colonists killed and buildings wrecked. */
  raze: { pop: [number, number]; buildings: number };
}

export const RAIDER_ERAS: RaiderEra[] = [
  {
    from: 0,
    minTechs: 0,
    techs: ["ionDrive", "xentroniumArmor", "classIIIShield", "optronicComputer", "particleBeam", "titanHull", "doomStarHull"],
    shield: "classIIIShield",
    computer: "optronicComputer",
    specials: [],
    weapons: [],
    filler: "particleBeam",
    garrison: [{ hull: "cruiser", count: 4 }, { hull: "battleship", count: 2 }],
    citadel: { hits: 6000, armor: 2000, shield: 15, attack: 150, defense: 0, deathRays: 8, torpedoes: 4 },
    raze: { pop: [1, 3], buildings: 1 },
  },
  {
    from: 50,
    minTechs: 60,
    techs: ["antimatterDrive", "classVShield", "positronicComputer", "deathRay", "damperField"],
    shield: "classVShield",
    computer: "positronicComputer",
    specials: [{ id: "damperField", minHull: "battleship" }],
    weapons: [{ weaponId: "deathRay", share: 0.6 }],
    filler: "particleBeam",
    garrison: [{ hull: "battleship", count: 4 }, { hull: "titan", count: 1 }],
    citadel: { hits: 8000, armor: 3000, shield: 20, attack: 175, defense: 0, deathRays: 12, torpedoes: 6 },
    raze: { pop: [2, 4], buildings: 2 },
  },
  {
    from: 100,
    minTechs: 90,
    techs: ["hyperDrive", "classVIIShield", "cyberneticComputer", "reflectionField", "spatialCompressor"],
    shield: "classVIIShield",
    computer: "cyberneticComputer",
    specials: [{ id: "damperField", minHull: "cruiser" }, { id: "reflectionField", minHull: "titan" }],
    weapons: [{ weaponId: "spatialCompressor", count: 1, minHull: "titan" }, { weaponId: "deathRay", share: 1 }],
    filler: "particleBeam",
    garrison: [{ hull: "battleship", count: 4 }, { hull: "titan", count: 3 }],
    citadel: { hits: 10000, armor: 4000, shield: 25, attack: 200, defense: 0, deathRays: 16, torpedoes: 8 },
    raze: { pop: [3, 5], buildings: 3 },
  },
  {
    from: 160,
    minTechs: 120,
    techs: ["classXShield", "moleculartronicComputer", "blackHoleGenerator"],
    shield: "classXShield",
    computer: "moleculartronicComputer",
    specials: [{ id: "damperField", minHull: "cruiser" }, { id: "reflectionField", minHull: "titan" }],
    weapons: [
      { weaponId: "blackHoleGenerator", count: 1, minHull: "doomStar" },
      { weaponId: "spatialCompressor", count: 1, minHull: "titan" },
      { weaponId: "deathRay", share: 1 },
    ],
    filler: "particleBeam",
    garrison: [{ hull: "titan", count: 4 }, { hull: "doomStar", count: 2 }],
    citadel: { hits: 12000, armor: 5000, shield: 30, attack: 225, defense: 0, deathRays: 20, torpedoes: 10 },
    raze: { pop: [4, 6], buildings: 4 },
  },
];

/** Raider ship names by hull. */
export const RAIDER_SHIP_NAMES: Record<HullSize, string> = {
  frigate: "Vexari Skiff",
  destroyer: "Vexari Lancer",
  cruiser: "Vexari Reaver",
  battleship: "Vexari Ravager",
  titan: "Vexari Dominator",
  doomStar: "Vexari Annihilator",
};

export const RAIDER_CITADEL_ID = "vexariCitadel";
export const RAIDER_CITADEL_NAME = "Vexari Citadel";

/** Chance that scrapping one captured ship teaches one technology it carries that you lack. */
export const SCRAP_TECH_CHANCE = 0.5;

/** Score for the empire that destroys the raiders at home: the biggest bonus in the game. */
export const RAIDERS_DEFEATED_SCORE = 2000;
