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
}

/**
 * Hostile worlds hold a quarter of a Gaia world. With max population rounded
 * down this gives the original's 1 / 2 / 4 / 5 / 6 for tiny to huge.
 */
export const HOSTILE_POP = 4 / 3 + 0.001;

export const CLIMATES: Record<PlanetType, ClimateInfo> = {
  gaia: { popPerSize: 5, foodPerFarmer: 3, habitable: true, hostile: false },
  terran: { popPerSize: 4, foodPerFarmer: 2, habitable: true, hostile: false },
  ocean: { popPerSize: 4, foodPerFarmer: 2, habitable: true, hostile: false },
  swamp: { popPerSize: 3, foodPerFarmer: 2, habitable: true, hostile: false },
  arid: { popPerSize: 3, foodPerFarmer: 1, habitable: true, hostile: false },
  tundra: { popPerSize: 2, foodPerFarmer: 1, habitable: true, hostile: false },
  desert: { popPerSize: 2, foodPerFarmer: 1, habitable: true, hostile: false },
  barren: { popPerSize: HOSTILE_POP, foodPerFarmer: 0, habitable: true, hostile: true },
  radiated: { popPerSize: HOSTILE_POP, foodPerFarmer: 0, habitable: true, hostile: true },
  toxic: { popPerSize: HOSTILE_POP, foodPerFarmer: 0, habitable: true, hostile: true },
  inferno: { popPerSize: HOSTILE_POP, foodPerFarmer: 0, habitable: true, hostile: true },
  asteroids: { popPerSize: 0, foodPerFarmer: 0, habitable: false, hostile: true },
  gasGiant: { popPerSize: 0, foodPerFarmer: 0, habitable: false, hostile: true },
};

export const SIZE_FACTOR: Record<PlanetSize, number> = {
  tiny: 1, small: 2, medium: 3, large: 4, huge: 5,
};

export const INDUSTRY_PER_WORKER: Record<Minerals, number> = {
  ultraPoor: 1, poor: 2, abundant: 3, rich: 5, ultraRich: 8,
};

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
