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

/** Stars per galaxy size. */
export const STAR_COUNTS: Record<GalaxySize, number> = { small: 20, medium: 36, large: 54, huge: 71 };

export const GALAXY_SIZE_ORDER: GalaxySize[] = ["small", "medium", "large", "huge"];

/**
 * Map layout as in the original. It lays every map out on a 506 x 400 pixel
 * screen; `scale` is how many internal units one screen pixel covers (x10),
 * and 30 internal units make a parsec, so the maps are 16.9 x 13.3, 25.3 x 20,
 * 33.7 x 26.7 and 50.6 x 40 parsecs. Star i is dropped into cell i of a
 * `cols` x `rows` grid with up to two cells of jitter.
 */
export const MAP_LAYOUT: Record<GalaxySize, { cols: number; rows: number; scale: number; bottomMargin: number; labelGap: number }> = {
  small: { cols: 5, rows: 4, scale: 10, bottomMargin: 8, labelGap: 50 },
  medium: { cols: 6, rows: 6, scale: 15, bottomMargin: 8, labelGap: 50 },
  large: { cols: 9, rows: 6, scale: 20, bottomMargin: 6, labelGap: 36 },
  huge: { cols: 9, rows: 8, scale: 30, bottomMargin: 4, labelGap: 30 },
};

/** Star placement rules, in pixels of the original's 506 x 400 map screen (see MAP_LAYOUT). */
export const STAR_PLACEMENT = {
  screen: { width: 506, height: 400 },
  /** Internal units per parsec. */
  unitsPerParsec: 30,
  /** A star placed in its grid cell must lie in x [left, width - right], y [top, height - bottom - bottomMargin]. */
  margins: { left: 24, right: 18, top: 22, bottom: 18 },
  /** Area for the fallback placement anywhere on the map. */
  anywhere: { x: [21, 413] as [number, number], y: [21, 361] as [number, number] },
  /** Two stars this close (squared screen pixels) or closer are rejected. */
  minDistance2: 800,
  /**
   * Star name labels may not overlap: two stars with |dy| < labelGap need |dx| >= the mean of their label widths.
   * The original measures each name in its map font, at least 35 and at most 56 pixels; we count 6 pixels a letter.
   */
  label: { perChar: 6, min: 35, max: 56 },
  /** Stars on nearly the same row (|dy| < rowGap) need |dx| >= rowWidth * 10 / scale. */
  rowGap: 15,
  rowWidth: 60,
  /** Tries in the star's own grid cell, then anywhere, before the whole galaxy is generated again. */
  cellTries: 150,
  anywhereTries: 150,
};

/** Black holes are at least this many parsecs from every other star. */
export const BLACK_HOLE_CLEARANCE = 5;

/**
 * Star colour mix by galaxy age: young ("mineral rich") galaxies are heavy in
 * blue and white stars, old ("organic rich") ones in yellow and orange stars.
 */
export const STAR_COLORS_BY_AGE: Record<GalaxyAge, Record<StarColor, number>> = {
  young: { blue: 20, white: 25, yellow: 10, orange: 10, red: 32, brown: 1, blackHole: 2 },
  average: { blue: 10, white: 15, yellow: 16, orange: 16, red: 37, brown: 2, blackHole: 4 },
  old: { blue: 5, white: 5, yellow: 30, orange: 21, red: 30, brown: 3, blackHole: 6 },
};

/** Which orbit (1..5) a new planet takes, by galaxy age: young galaxies favour the edges, old ones the middle. */
export const ORBIT_WEIGHTS_BY_AGE: Record<GalaxyAge, number[]> = {
  young: [25, 18, 17, 15, 25],
  average: [20, 20, 20, 20, 20],
  old: [10, 22, 30, 33, 5],
};

/** Climate table by galaxy age (see CLIMATE_BY_ZONE): old galaxies use the organic-rich one. */
export const CLIMATE_TABLE_BY_AGE: Record<GalaxyAge, "normal" | "organic"> = { young: "normal", average: "normal", old: "organic" };

export const MINERAL_STEPS: Minerals[] = ["ultraPoor", "poor", "abundant", "rich", "ultraRich"];

/**
 * Nebula clouds: a random count per galaxy size (inclusive range) and their
 * radius in parsecs on a medium map. The original draws nebulae at a fixed
 * screen size, so on other maps the radius scales with the map.
 */
export const NEBULAE: { count: Record<GalaxySize, [number, number]>; radius: [number, number]; tries: number } = {
  count: { small: [0, 1], medium: [1, 2], large: [1, 3], huge: [2, 4] },
  radius: [1.8, 3.2],
  tries: 100,
};

/** No ship may pass within this many parsecs of a black hole (without a Navigator). */
export const BLACK_HOLE_RADIUS = 2;

/** Chance each star (with planets, not a black hole) rolls a special during generation. */
export const SPECIAL_CHANCE = 0.36;
/** Re-rolls when the picked special fits nowhere in the system. */
export const SPECIAL_TRIES = 100;

export type SpecialKind = "artifacts" | "gold" | "gems" | "natives" | "splinter" | SystemFeature;

/**
 * Which special a system gets. Gold and gems need a real planet; natives and
 * splinter colonies a medium or bigger planet with a farmable climate;
 * artifacts a farmable planet. A wormhole roll adds one wormhole pair to the galaxy.
 */
export const SPECIAL_WEIGHTS: Record<SpecialKind, number> = {
  wormhole: 5, debris: 3, cache: 2, gold: 3, gems: 2, natives: 9, splinter: 4, hero: 3, artifacts: 5,
};

/** Systems with a waiting hero: at most 3 / 4 / 5 / 6 by galaxy size. */
export const MAX_HERO_SYSTEMS: Record<GalaxySize, number> = { small: 3, medium: 4, large: 5, huge: 6 };
/** Wormhole pairs: at most 4 / 8 / 12 / 16 by galaxy size. */
export const MAX_WORMHOLES: Record<GalaxySize, number> = { small: 4, medium: 8, large: 12, huge: 16 };
/** Wormhole ends are more than this many parsecs apart, by galaxy size. */
export const WORMHOLE_MIN_DISTANCE: Record<GalaxySize, number> = { small: 4, medium: 5, large: 6, huge: 7 };
/** The far end is picked among the first this many stars that qualify. */
export const WORMHOLE_PARTNER_POOL = 19;

/**
 * Home stars are at least s * sqrt(W^2 + H^2) / (10 n) parsecs apart (s the
 * MAP_LAYOUT scale, W x H the map in parsecs, n the empires plus the galaxy
 * size step when there are more than `manyEmpires`), but never under `min`.
 * When no such set of stars exists, n grows by one up to `maxExtra` times,
 * then the galaxy is rolled again.
 */
export const HOME_SPACING = { min: Math.sqrt(15000) / 30, manyEmpires: 6, maxExtra: 4 };
/** Galaxies rolled before home spacing drops below the original's rule (only for more empires than the setup screen offers). */
export const HOME_GALAXY_TRIES = 40;

/** Home systems hold at least this many real planets (not asteroids or gas giants). */
export const HOME_MIN_PLANETS = 3;
/** Every home has a star with a real planet this close (parsecs)... */
export const HOME_PLANET_RANGE = 4;
/** ...and, unless its people eat no food, a farmable planet this close. */
export const HOME_FOOD_RANGE = 6;

/**
 * Orion takes the place of a random star this close to the map centre, the
 * radius growing a parsec at a time up to `maxRadius` until there are
 * `candidates` to pick from.
 */
export const ORION_PLACEMENT = { radius: 4, maxRadius: 8, candidates: 4 };

/** Chance per eligible star of a monster lair, by difficulty, and the most lairs a galaxy holds. */
export const LAIR_CHANCE: Record<Difficulty, number> = { tutor: 0.05, easy: 0.05, average: 0.05, hard: 0.08, impossible: 0.12 };
export const MAX_LAIRS = 20;
/** Tries to find a lair spot at least sqrt((W^2 + H^2) / (2 k)) parsecs from the other lairs, for k lairs. */
export const LAIR_PLACEMENT_TRIES = 250;

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
  /** How many of FIRST_FIELDS are researched at the start, each with every application. */
  firstFields: number;
  /** Further fields picked cheapest first, each with one chosen application (all for creative races). */
  pickedFields: number;
  /** Homeworld buildings at the start (the star base is always added, see STARTING_STATION). */
  buildings: string[];
  /** Extra colonies founded near the homeworld, each with this population. */
  extraColonies: number;
  extraColonyPop: number;
  /** Stars within this distance of home are known at the start. */
  exploredRadius: number;
  /** Starting BC, or null for the advanced formula (see ADVANCED_START). */
  bc: number | null;
  /** Homeworld population from the advanced formula instead of HOMEWORLD_POP. */
  advancedPop: boolean;
}

/** The fields every civilization learns first, in order. */
export const FIRST_FIELDS = ["engineering", "nuclearFission", "chemistry", "physics", "electronics", "coldFusion"];

/**
 * Advanced starts. BC = (money pick level + 2) x 100, the money pick levels
 * being -1 (-1/2 BC), 0, 1 (+1/2 BC) and 2 (+1 BC). Homeworld population =
 * (growth pick % + 300) x max population x 6 / 3000, i.e. 60% of the maximum
 * with no growth pick, averaged with the maximum when that is under 9, and at
 * least `minPop`.
 */
export const ADVANCED_START = { bcPerMoneyLevel: 100, moneyLevelOffset: 2, popBase: 300, popScale: 6 / 3000, smallMax: 9, minPop: 8 };

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
  // Pre-warp: Engineering only; no ship can leave until a drive is researched.
  preWarp: {
    name: "Pre-Warp", firstFields: 1, pickedFields: 0,
    buildings: [], extraColonies: 0, extraColonyPop: 0, exploredRadius: 0, bc: 50, advancedPop: false,
  },
  // Average: the six basic fields and nothing more.
  average: {
    name: "Average", firstFields: 6, pickedFields: 0,
    buildings: ["marineBarracks"],
    extraColonies: 0, extraColonyPop: 0, exploredRadius: 0, bc: 50, advancedPop: false,
  },
  // Advanced: the six basic fields plus 19 more, a few colonies and much of the neighbourhood explored.
  advanced: {
    name: "Advanced", firstFields: 6, pickedFields: 19,
    buildings: ["marineBarracks", "automatedFactory", "hydroponicFarm"],
    extraColonies: 2, extraColonyPop: 3, exploredRadius: 8, bc: null, advancedPop: true,
  },
};
