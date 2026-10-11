/** Planet and star tables. Numbers follow MoO2 closely and are meant to be tuned. */

export type StarColor = "blue" | "white" | "yellow" | "orange" | "red" | "brown" | "blackHole";

export type PlanetType =
  | "gaia" | "terran" | "ocean" | "swamp" | "arid" | "tundra" | "desert"
  | "barren" | "radiated" | "toxic" | "inferno" | "asteroids" | "gasGiant";

export type PlanetSize = "tiny" | "small" | "medium" | "large" | "huge";

export type Minerals = "ultraPoor" | "poor" | "abundant" | "rich" | "ultraRich";

export type Gravity = "low" | "normal" | "heavy";

export interface ClimateInfo {
  /** Share of the size's full population this climate holds, in percent (Gaia 100). */
  popPercent: number;
  foodPerFarmer: number;
  /** Asteroids and gas giants can't be settled, not even by outposts, until an Artificial Planet turns them into barren planets. */
  habitable: boolean;
  hostile: boolean;
  /** Extra building upkeep on this climate, as a fraction of the normal upkeep. */
  maintenancePenalty: number;
}

/** Farming is impossible where the base food per farmer is 0, unless Biomorphic Fungi are known. */
export const CLIMATES: Record<PlanetType, ClimateInfo> = {
  gaia: { popPercent: 100, foodPerFarmer: 3, habitable: true, hostile: false, maintenancePenalty: 0 },
  terran: { popPercent: 80, foodPerFarmer: 2, habitable: true, hostile: false, maintenancePenalty: 0 },
  ocean: { popPercent: 25, foodPerFarmer: 2, habitable: true, hostile: false, maintenancePenalty: 0 },
  swamp: { popPercent: 40, foodPerFarmer: 2, habitable: true, hostile: false, maintenancePenalty: 0 },
  arid: { popPercent: 60, foodPerFarmer: 1, habitable: true, hostile: false, maintenancePenalty: 0 },
  tundra: { popPercent: 25, foodPerFarmer: 1, habitable: true, hostile: false, maintenancePenalty: 0 },
  desert: { popPercent: 25, foodPerFarmer: 1, habitable: true, hostile: false, maintenancePenalty: 0.25 },
  barren: { popPercent: 25, foodPerFarmer: 0, habitable: true, hostile: true, maintenancePenalty: 0 },
  radiated: { popPercent: 25, foodPerFarmer: 0, habitable: true, hostile: true, maintenancePenalty: 0.25 },
  toxic: { popPercent: 25, foodPerFarmer: 0, habitable: true, hostile: true, maintenancePenalty: 0.5 },
  inferno: { popPercent: 25, foodPerFarmer: 0, habitable: true, hostile: true, maintenancePenalty: 0 },
  asteroids: { popPercent: 0, foodPerFarmer: 0, habitable: false, hostile: true, maintenancePenalty: 0 },
  gasGiant: { popPercent: 0, foodPerFarmer: 0, habitable: false, hostile: true, maintenancePenalty: 0 },
};

/** Climates without soil: farming is impossible and soil buildings do nothing. */
export const SOILLESS: PlanetType[] = ["barren", "radiated", "toxic", "inferno", "asteroids", "gasGiant"];

/** Population a planet of each size holds at 100% climate (Gaia). */
export const SIZE_POP_BASE: Record<PlanetSize, number> = {
  tiny: 5, small: 10, medium: 15, large: 20, huge: 25,
};

/** Max population a climate holds on a planet size: its share of the full size, rounded half up. */
export function climatePopulation(percent: number, size: PlanetSize): number {
  return Math.floor((percent * SIZE_POP_BASE[size] + 50) / 100);
}

export const SIZE_FACTOR: Record<PlanetSize, number> = {
  tiny: 1, small: 2, medium: 3, large: 4, huge: 5,
};

export const INDUSTRY_PER_WORKER: Record<Minerals, number> = {
  ultraPoor: 1, poor: 2, abundant: 3, rich: 5, ultraRich: 8,
};

/** Industry a planet absorbs without pollution, by size; Nano Disassemblers double it. */
export const POLLUTION_TOLERANCE: Record<PlanetSize, number> = {
  tiny: 2, small: 4, medium: 6, large: 8, huge: 10,
};
/** Each point of polluting industry above the tolerance makes this much pollution (rounded up), and each costs 1 industry. */
export const POLLUTION_PER_EXCESS = 0.5;

export function gravityOf(size: PlanetSize, minerals: Minerals): Gravity {
  const heavyMinerals = minerals === "rich" || minerals === "ultraRich";
  if (size === "tiny" || size === "small") return heavyMinerals ? "normal" : "low";
  if (size === "huge") return "heavy";
  return heavyMinerals && size === "large" ? "heavy" : "normal";
}

/** Relative frequency of star colors. */
export const STAR_COLOR_WEIGHTS: Record<StarColor, number> = {
  blue: 6, white: 10, yellow: 20, orange: 22, red: 34, brown: 3, blackHole: 5,
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
  blue: [1, 4], white: [1, 5], yellow: [1, 5], orange: [1, 5], red: [0, 4], brown: [0, 0], blackHole: [0, 0],
};
