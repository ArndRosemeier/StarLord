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
  /** Asteroids and gas giants can't hold colonists until an Artificial Planet turns them into barren planets; outposts can claim them. */
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
  // Never generated (the original has no inferno worlds); kept so old saves still load.
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

/**
 * Gravity by minerals and size, as the original rolls it: rich worlds are dense,
 * small poor ones light. Rows ultra poor..ultra rich, columns tiny..huge.
 */
export const GRAVITY_TABLE: Record<Minerals, [Gravity, Gravity, Gravity, Gravity, Gravity]> = {
  ultraPoor: ["low", "low", "low", "normal", "normal"],
  poor: ["low", "low", "normal", "normal", "normal"],
  abundant: ["low", "normal", "normal", "normal", "heavy"],
  rich: ["normal", "normal", "normal", "heavy", "heavy"],
  ultraRich: ["normal", "normal", "heavy", "heavy", "heavy"],
};

export const PLANET_SIZES: PlanetSize[] = ["tiny", "small", "medium", "large", "huge"];

export function gravityOf(size: PlanetSize, minerals: Minerals): Gravity {
  return GRAVITY_TABLE[minerals][PLANET_SIZES.indexOf(size)]!;
}

/**
 * Planets per star: a d10 roll by star colour (rolls 1..10). Black holes have
 * none; brown dwarfs have one planet 30% of the time.
 */
export const PLANETS_PER_STAR_D10: Record<StarColor, number[]> = {
  blue: [0, 1, 1, 2, 3, 3, 4, 4, 5, 5],
  white: [0, 1, 1, 1, 2, 2, 3, 3, 4, 4],
  yellow: [1, 2, 2, 2, 3, 3, 4, 4, 5, 5],
  orange: [2, 2, 2, 3, 3, 4, 4, 5, 5, 5],
  red: [0, 1, 1, 1, 2, 2, 2, 3, 3, 4],
  brown: [0, 0, 0, 0, 0, 0, 0, 1, 1, 1],
  blackHole: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
};

/** Bodies orbiting a star: asteroid belts, gas giants and real planets. */
export type BodyKind = "asteroids" | "gasGiant" | "planet";

/** Which body an orbit holds: a d10 roll per orbit (orbits 1..5). Gas giants never form in orbit 1. */
export const BODY_BY_ORBIT_D10: BodyKind[][] = [
  ["asteroids", "asteroids", "planet", "planet", "planet", "planet", "planet", "planet", "planet", "planet"],
  ["asteroids", "asteroids", "gasGiant", "planet", "planet", "planet", "planet", "planet", "planet", "planet"],
  ["asteroids", "asteroids", "asteroids", "gasGiant", "gasGiant", "planet", "planet", "planet", "planet", "planet"],
  ["asteroids", "asteroids", "gasGiant", "gasGiant", "gasGiant", "planet", "planet", "planet", "planet", "planet"],
  ["asteroids", "gasGiant", "gasGiant", "gasGiant", "gasGiant", "gasGiant", "planet", "planet", "planet", "planet"],
];

/**
 * Orbital zone of each orbit by star colour (0 scorched .. 3 frozen), which
 * picks the climate table. Index 0 is the innermost orbit.
 */
export const ORBIT_ZONES: Record<StarColor, number[]> = {
  blue: [0, 0, 0, 0, 1],
  white: [0, 0, 1, 2, 3],
  yellow: [0, 1, 2, 2, 3],
  orange: [1, 2, 2, 2, 3],
  red: [1, 2, 3, 3, 3],
  brown: [0, 0, 1, 2, 3],
  blackHole: [0, 0, 0, 0, 0],
};

/** The climates a real planet can be born with (the original has no inferno worlds). */
export type NaturalClimate = "toxic" | "radiated" | "barren" | "desert" | "tundra" | "ocean" | "swamp" | "arid" | "terran" | "gaia";

/**
 * Climate weights by zone (0..3). Young and average galaxies share one table,
 * old ("organic rich") galaxies have more habitable middle orbits.
 */
export const CLIMATE_BY_ZONE: { normal: Record<NaturalClimate, number>[]; organic: Record<NaturalClimate, number>[] } = {
  normal: [
    { toxic: 15, radiated: 55, barren: 25, desert: 5, tundra: 0, ocean: 0, swamp: 0, arid: 0, terran: 0, gaia: 0 },
    { toxic: 15, radiated: 50, barren: 25, desert: 10, tundra: 5, ocean: 0, swamp: 0, arid: 0, terran: 0, gaia: 0 },
    { toxic: 10, radiated: 15, barren: 10, desert: 10, tundra: 10, ocean: 10, swamp: 11, arid: 11, terran: 11, gaia: 2 },
    { toxic: 20, radiated: 0, barren: 70, desert: 0, tundra: 8, ocean: 2, swamp: 0, arid: 0, terran: 0, gaia: 0 },
  ],
  organic: [
    { toxic: 15, radiated: 40, barren: 20, desert: 25, tundra: 0, ocean: 0, swamp: 0, arid: 0, terran: 0, gaia: 0 },
    { toxic: 5, radiated: 30, barren: 20, desert: 25, tundra: 20, ocean: 0, swamp: 0, arid: 0, terran: 0, gaia: 0 },
    { toxic: 5, radiated: 8, barren: 8, desert: 13, tundra: 13, ocean: 13, swamp: 13, arid: 13, terran: 10, gaia: 4 },
    { toxic: 20, radiated: 0, barren: 50, desert: 0, tundra: 30, ocean: 0, swamp: 0, arid: 0, terran: 0, gaia: 0 },
  ],
};

/** Planet size weights, the same for every star. */
export const PLANET_SIZE_WEIGHTS: Record<PlanetSize, number> = {
  tiny: 10, small: 20, medium: 40, large: 20, huge: 10,
};

/** Minerals by star colour alone (in percent); galaxy age and nebulae do not change them. */
export const MINERAL_WEIGHTS_BY_STAR: Record<StarColor, Partial<Record<Minerals, number>>> = {
  blue: { abundant: 40, rich: 40, ultraRich: 20 },
  white: { poor: 20, abundant: 40, rich: 30, ultraRich: 10 },
  yellow: { poor: 30, abundant: 40, rich: 20, ultraRich: 10 },
  orange: { ultraPoor: 10, poor: 40, abundant: 40, rich: 10 },
  red: { ultraPoor: 20, poor: 40, abundant: 40 },
  brown: { poor: 10, abundant: 50, rich: 30, ultraRich: 10 },
  blackHole: {},
};
