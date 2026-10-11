import type { Difficulty, GalaxyAge, GalaxySize, SystemFeature, TechLevel } from "../types.js";
import type { Minerals, StarColor } from "./planets.js";

/**
 * Game setup options and galaxy generation numbers: difficulty, galaxy age,
 * starting civilization, nebulae, black holes, wormholes and system specials.
 */

export interface DifficultyDef {
  name: string;
  /**
   * Industry and research points computer players add to every worker's and
   * scientist's output (half that in food for farmers), before any percentage.
   */
  aiOutputPerUnit: number;
  /** Growth percent computer players add. */
  aiGrowthPercent: number;
  /** Extra BC per population computer players collect. */
  aiBcPerPop: number;
  /** Attitude every computer empire starts with, and drifts toward, for each human empire. */
  aiAttitudeToHumans: number;
  /** Custom races are not allowed on the two easiest levels. */
  customRaces: boolean;
}

/**
 * Difficulty levels. The AI output, growth and money bonuses are the original
 * program's tables; the attitude toward humans is StarLord's estimate of the
 * manual's "more friendly" and "all hate you".
 */
export const DIFFICULTIES: Record<Difficulty, DifficultyDef> = {
  tutor: { name: "Tutor", aiOutputPerUnit: -0.5, aiGrowthPercent: 0, aiBcPerPop: 0, aiAttitudeToHumans: 30, customRaces: false },
  easy: { name: "Easy", aiOutputPerUnit: 0, aiGrowthPercent: 1, aiBcPerPop: 0, aiAttitudeToHumans: 15, customRaces: false },
  average: { name: "Average", aiOutputPerUnit: 0.5, aiGrowthPercent: 2, aiBcPerPop: 0.25, aiAttitudeToHumans: 0, customRaces: true },
  hard: { name: "Hard", aiOutputPerUnit: 1, aiGrowthPercent: 3, aiBcPerPop: 0.5, aiAttitudeToHumans: -10, customRaces: true },
  impossible: { name: "Impossible", aiOutputPerUnit: 2, aiGrowthPercent: 4, aiBcPerPop: 0.75, aiAttitudeToHumans: -60, customRaces: true },
};

export const DIFFICULTY_ORDER: Difficulty[] = ["tutor", "easy", "average", "hard", "impossible"];

/**
 * Star colour mix by galaxy age. Young galaxies are mostly hot blue and white
 * stars (mineral rich, hostile), old ones mostly orange and red (fertile,
 * mineral poor). Brown dwarfs are "extremely rare" in every galaxy.
 */
export const STAR_COLORS_BY_AGE: Record<GalaxyAge, Record<StarColor, number>> = {
  young: { blue: 16, white: 20, yellow: 18, orange: 14, red: 22, brown: 3, blackHole: 5 },
  average: { blue: 6, white: 10, yellow: 20, orange: 22, red: 34, brown: 3, blackHole: 5 },
  old: { blue: 3, white: 6, yellow: 16, orange: 26, red: 40, brown: 3, blackHole: 6 },
};

/** Chance a planet's minerals shift one step: up in young galaxies, down in old ones. */
export const AGE_MINERAL_SHIFT: Record<GalaxyAge, number> = { young: 0.25, average: 0, old: -0.25 };

export const MINERAL_STEPS: Minerals[] = ["ultraPoor", "poor", "abundant", "rich", "ultraRich"];

/** Nebula clouds per galaxy size, their radius range in parsecs, and the chance a planet inside is one mineral step richer. */
export const NEBULAE: { count: Record<GalaxySize, number>; radius: [number, number]; mineralBoost: number } = {
  count: { small: 1, medium: 2, large: 3, huge: 4 },
  radius: [1.8, 3.2],
  mineralBoost: 0.5,
};

/** No ship may pass within this many parsecs of a black hole (without a Navigator). */
export const BLACK_HOLE_RADIUS = 2;
/** Black holes this close to a homeworld become ordinary red stars so every start can move. */
export const BLACK_HOLE_HOME_CLEARANCE = 4.5;

/** Chance any star (not a home) has a system special; brown dwarfs are more likely to. */
export const SPECIAL_CHANCE = 0.2;
export const BROWN_DWARF_SPECIAL_CHANCE = 0.6;

export type SpecialKind = "artifacts" | "gold" | "gems" | "natives" | "splinter" | SystemFeature;

/** Which special a system gets when it gets one. Planet specials fall back to a system one when no planet fits. */
export const SPECIAL_WEIGHTS: Record<SpecialKind, number> = {
  artifacts: 3, gold: 4, gems: 2, natives: 3, splinter: 2, hero: 2, cache: 3, debris: 3, wormhole: 2,
};

/** Wormhole ends are at least this far apart (a shorter hop would not be worth it). */
export const WORMHOLE_MIN_DISTANCE = 6;

/** One-time BC found by the first explorer. The original gives no amounts; these are ours. */
export const CACHE_BC: [number, number] = [75, 150];
export const DEBRIS_BC: [number, number] = [25, 75];
/** Population of a splinter colony when found. */
export const SPLINTER_POP: [number, number] = [2, 4];
/** Native population as a fraction of the planet's maximum for a normal race, at least 2. */
export const NATIVES_FRACTION = 0.5;
/** Extra food each native farmer grows on top of the normal farming rate. */
export const NATIVE_FOOD_BONUS = 2;

/** Starting civilization. */
export interface TechLevelDef {
  name: string;
  /** Fields researched at the start, by the field's tech level (general fields always count at "average"). */
  maxFieldLevel: number;
  /** Include the general (level 1-2) fields. */
  generalFields: boolean;
  /** Random extra fields (level <= extraMaxLevel) on top. */
  extraFields: number;
  extraMaxLevel: number;
  /** Homeworld buildings at the start (the star base is always added, see STARTING_STATION). */
  buildings: string[];
  /** Extra colonies founded near the homeworld, each with this population. */
  extraColonies: number;
  extraColonyPop: number;
  /** Stars within this distance of home are known at the start. */
  exploredRadius: number;
  bc: number;
}

/**
 * Every empire starts with exactly these ships and a star base over its
 * homeworld, whatever the tech level (pre-warp ships wait at home until a
 * drive is researched).
 */
export const STARTING_SHIPS: { name: string; designId: string; count: number }[] = [
  { name: "Scout I", designId: "scout", count: 1 },
  { name: "Scout II", designId: "scout", count: 1 },
  { name: "Colony Fleet", designId: "colonyShip", count: 1 },
];
export const STARTING_STATION = "starBase";

export const TECH_LEVELS: Record<TechLevel, TechLevelDef> = {
  // Pre-warp: only the homeworld and the starting applications; no ship can leave until a drive is researched.
  preWarp: {
    name: "Pre-Warp", maxFieldLevel: 0, generalFields: false, extraFields: 0, extraMaxLevel: 0,
    buildings: [], extraColonies: 0, extraColonyPop: 0, exploredRadius: 0, bc: 50,
  },
  // Average: all FTL basics (the general fields) plus a few random extras.
  average: {
    name: "Average", maxFieldLevel: 0, generalFields: true, extraFields: 2, extraMaxLevel: 3,
    buildings: ["marineBarracks"],
    extraColonies: 0, extraColonyPop: 0, exploredRadius: 0, bc: 50,
  },
  // Advanced: many techs, several colonies and much of the neighbourhood explored.
  advanced: {
    name: "Advanced", maxFieldLevel: 5, generalFields: true, extraFields: 2, extraMaxLevel: 6,
    buildings: ["marineBarracks", "automatedFactory", "hydroponicFarm"],
    extraColonies: 2, extraColonyPop: 3, exploredRadius: 8, bc: 200,
  },
};
