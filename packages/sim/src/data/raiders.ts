import type { Difficulty } from "../types.js";
import type { HullSize } from "./components.js";

/**
 * The Vexari raiders: StarLord's take on the original's Antarans. They live in
 * a pocket dimension, raid colonies from about the middle of the game, and
 * their ships get better as the game goes on. Beating their home fleet and
 * citadel through a Dimensional Portal wins the game.
 *
 * The original's raid timing, fleet sizes and Antaran ship stats are buried
 * in exe code and not in our reference, so the numbers here are our own
 * estimates in the original's spirit: rare, dangerous raids that grow from a
 * pair of cruisers to doom stars, armed with Antaran (xenon) technology, and
 * never too far ahead of the galaxy's most advanced empire.
 */

/** First raid turn on Average, before the random delay; harder levels bring them sooner. */
export const RAID_FIRST_TURN = 120;
export const RAID_FIRST_DELAY: [number, number] = [0, 20];
export const RAID_DIFFICULTY_SHIFT: Record<Difficulty, number> = { tutor: 60, easy: 30, average: 0, hard: -20, impossible: -40 };

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
  /** Turns between raids. */
  interval: [number, number];
  /** A raid's ships, plus up to `extra` more of the first kind. */
  raid: { hull: HullSize; count: number }[];
  extra: number;
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
    interval: [25, 35],
    raid: [{ hull: "destroyer", count: 1 }, { hull: "cruiser", count: 1 }],
    extra: 1,
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
    interval: [20, 30],
    raid: [{ hull: "cruiser", count: 2 }, { hull: "battleship", count: 1 }],
    extra: 1,
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
    interval: [15, 25],
    raid: [{ hull: "battleship", count: 2 }, { hull: "titan", count: 1 }],
    extra: 1,
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
    interval: [12, 20],
    raid: [{ hull: "titan", count: 2 }, { hull: "doomStar", count: 1 }],
    extra: 1,
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
