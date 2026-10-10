/** Planet and star tables. Numbers follow MoO2 closely and are meant to be tuned. */

export type StarColor = "blue" | "white" | "yellow" | "orange" | "red" | "brown" | "blackHole";

export type PlanetType =
  | "gaia" | "terran" | "ocean" | "swamp" | "arid" | "tundra" | "desert"
  | "barren" | "radiated" | "toxic" | "inferno" | "asteroids" | "gasGiant";

export type PlanetSize = "tiny" | "small" | "medium" | "large" | "huge";

export type Minerals = "ultraPoor" | "poor" | "abundant" | "rich" | "ultraRich";

export type Gravity = "low" | "normal" | "heavy";

export interface ClimateInfo {
  /** Max population per size step (tiny=1 .. huge=5). */
  popPerSize: number;
  foodPerFarmer: number;
  /** Asteroids and gas giants can't be settled, not even by outposts, until an Artificial Planet turns them into barren planets. */
  habitable: boolean;
  hostile: boolean;
  /** Extra building upkeep on this climate, as a fraction of the normal upkeep. */
  maintenancePenalty: number;
}

/** Farming is impossible where the base food per farmer is 0, unless Biomorphic Fungi are known. */
export const CLIMATES: Record<PlanetType, ClimateInfo> = {
  gaia: { popPerSize: 5, foodPerFarmer: 3, habitable: true, hostile: false, maintenancePenalty: 0 },
  terran: { popPerSize: 4, foodPerFarmer: 2, habitable: true, hostile: false, maintenancePenalty: 0 },
  ocean: { popPerSize: 4, foodPerFarmer: 2, habitable: true, hostile: false, maintenancePenalty: 0 },
  swamp: { popPerSize: 3, foodPerFarmer: 2, habitable: true, hostile: false, maintenancePenalty: 0 },
  arid: { popPerSize: 3, foodPerFarmer: 1, habitable: true, hostile: false, maintenancePenalty: 0 },
  tundra: { popPerSize: 2, foodPerFarmer: 1, habitable: true, hostile: false, maintenancePenalty: 0 },
  desert: { popPerSize: 2, foodPerFarmer: 1, habitable: true, hostile: false, maintenancePenalty: 0.25 },
  barren: { popPerSize: 1, foodPerFarmer: 0, habitable: true, hostile: true, maintenancePenalty: 0 },
  radiated: { popPerSize: 1, foodPerFarmer: 0, habitable: true, hostile: true, maintenancePenalty: 0.25 },
  toxic: { popPerSize: 1, foodPerFarmer: 0, habitable: true, hostile: true, maintenancePenalty: 0.5 },
  inferno: { popPerSize: 1, foodPerFarmer: 0, habitable: true, hostile: true, maintenancePenalty: 0 },
  asteroids: { popPerSize: 0, foodPerFarmer: 0, habitable: false, hostile: true, maintenancePenalty: 0 },
  gasGiant: { popPerSize: 0, foodPerFarmer: 0, habitable: false, hostile: true, maintenancePenalty: 0 },
};

/** Climates without soil: farming is impossible and soil buildings do nothing. */
export const SOILLESS: PlanetType[] = ["barren", "radiated", "toxic", "inferno", "asteroids", "gasGiant"];

export const SIZE_FACTOR: Record<PlanetSize, number> = {
  tiny: 1, small: 2, medium: 3, large: 4, huge: 5,
};

export const INDUSTRY_PER_WORKER: Record<Minerals, number> = {
  ultraPoor: 1, poor: 2, abundant: 3, rich: 5, ultraRich: 8,
};

/**
 * Industry a planet absorbs without pollution, per size factor. The original
 * scales tolerance with size but its numbers are not in our references.
 */
export const POLLUTION_TOLERANCE_PER_SIZE = 4;
/** Each point of industry above the tolerance makes this much pollution, and each pollution point costs 1 industry. */
export const POLLUTION_PER_EXCESS = 0.5;

export function gravityOf(size: PlanetSize, minerals: Minerals): Gravity {
  const heavyMinerals = minerals === "rich" || minerals === "ultraRich";
  if (size === "tiny" || size === "small") return heavyMinerals ? "normal" : "low";
  if (size === "huge") return "heavy";
  return heavyMinerals && size === "large" ? "heavy" : "normal";
}

/** Relative frequency of star colors. */
export const STAR_COLOR_WEIGHTS: Record<StarColor, number> = {
  blue: 6, white: 10, yellow: 18, orange: 20, red: 32, brown: 10, blackHole: 4,
};

/** Planet type weights by star color: hotter stars skew hostile, yellow skews temperate. */
export const PLANET_TYPE_WEIGHTS: Record<StarColor, Partial<Record<PlanetType, number>>> = {
  blue: { inferno: 18, radiated: 18, barren: 14, toxic: 12, asteroids: 14, gasGiant: 16, desert: 6, arid: 2 },
  white: { inferno: 10, radiated: 12, barren: 12, toxic: 10, asteroids: 12, gasGiant: 14, desert: 10, arid: 8, tundra: 6, ocean: 3, terran: 3 },
  yellow: { barren: 8, toxic: 8, radiated: 5, inferno: 5, asteroids: 10, gasGiant: 12, desert: 10, arid: 10, tundra: 8, swamp: 8, ocean: 7, terran: 7, gaia: 2 },
  orange: { barren: 10, toxic: 10, radiated: 6, inferno: 4, asteroids: 10, gasGiant: 12, desert: 10, arid: 8, tundra: 10, swamp: 8, ocean: 6, terran: 5, gaia: 1 },
  red: { barren: 16, toxic: 12, radiated: 6, inferno: 4, asteroids: 12, gasGiant: 12, tundra: 14, desert: 8, swamp: 6, arid: 4, ocean: 3, terran: 3 },
  brown: { barren: 24, toxic: 14, radiated: 12, asteroids: 18, gasGiant: 14, tundra: 12, desert: 6 },
  blackHole: {},
};

export const PLANET_SIZE_WEIGHTS: Record<PlanetSize, number> = {
  tiny: 12, small: 24, medium: 32, large: 22, huge: 10,
};

export const MINERAL_WEIGHTS_BY_STAR: Record<StarColor, Partial<Record<Minerals, number>>> = {
  blue: { poor: 10, abundant: 30, rich: 35, ultraRich: 25 },
  white: { poor: 15, abundant: 40, rich: 30, ultraRich: 15 },
  yellow: { ultraPoor: 10, poor: 25, abundant: 45, rich: 15, ultraRich: 5 },
  orange: { ultraPoor: 10, poor: 30, abundant: 45, rich: 12, ultraRich: 3 },
  red: { ultraPoor: 20, poor: 40, abundant: 35, rich: 5 },
  brown: { ultraPoor: 35, poor: 40, abundant: 25 },
  blackHole: {},
};

export const PLANETS_PER_STAR: Record<StarColor, [number, number]> = {
  blue: [1, 4], white: [1, 5], yellow: [1, 5], orange: [1, 5], red: [0, 4], brown: [0, 3], blackHole: [0, 0],
};
