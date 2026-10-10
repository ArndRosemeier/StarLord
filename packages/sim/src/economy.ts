import { BUILDINGS_BY_ID, type BuildingEffects } from "./data/buildings.js";
import { GOVERNMENTS } from "./data/governments.js";
import { CLIMATES, INDUSTRY_PER_WORKER, SIZE_FACTOR, type Gravity, type PlanetType } from "./data/planets.js";
import { getRace, hasTrait, type RaceDef } from "./data/races.js";
import type { Colony, GameState, Planet, Player } from "./types.js";

/** Pure economy formulas. Nothing here mutates state, so the UI can preview changes. */

export const TAX_PER_POP = 0.5;
export const TRADE_GOODS_RATE = 0.5;

export function population(c: Colony): number {
  return c.farmers + c.workers + c.scientists;
}

export function canColonize(type: PlanetType): boolean {
  return CLIMATES[type].habitable;
}

function sumEffect(buildings: string[], key: keyof BuildingEffects): number {
  let total = 0;
  for (const id of buildings) total += BUILDINGS_BY_ID[id]?.effects[key] ?? 0;
  return total;
}

export function maxPopulation(planet: Planet, race: RaceDef, buildings: string[] = []): number {
  const climate = CLIMATES[planet.type];
  if (!climate.habitable) return 0;
  const size = SIZE_FACTOR[planet.size];
  let perSize = climate.popPerSize;
  if (hasTrait(race, "aquatic") && (planet.type === "ocean" || planet.type === "swamp")) perSize += 1;
  if (hasTrait(race, "tolerant") && climate.hostile) perSize += 1;
  if (hasTrait(race, "subterranean")) perSize += 1;
  perSize += sumEffect(buildings, "maxPopBySize");
  return Math.max(1, Math.floor(perSize * size));
}

/** Productivity multiplier for a race living at a gravity. */
export function gravityMultiplier(race: RaceDef, gravity: Gravity): number {
  const native: Gravity = hasTrait(race, "lowG") ? "low" : hasTrait(race, "highG") ? "heavy" : "normal";
  if (gravity === native) return 1;
  if (native === "heavy") return gravity === "normal" ? 1 : 0.75;
  if (native === "low") return gravity === "normal" ? 0.75 : 0.5;
  return gravity === "low" ? 0.75 : 0.5;
}

/** Industry above this is half lost to pollution. */
export function pollutionTolerance(planet: Planet, race: RaceDef): number {
  if (hasTrait(race, "tolerant")) return Infinity;
  return SIZE_FACTOR[planet.size] * 4;
}

export interface ColonyOutput {
  population: number;
  maxPopulation: number;
  foodProduced: number;
  foodEaten: number;
  /** Food surplus; negative means starvation unless covered by imports. */
  foodNet: number;
  industryGross: number;
  pollution: number;
  /** Industry after pollution and cybernetic upkeep. */
  industry: number;
  research: number;
  bc: number;
  maintenance: number;
  growthK: number;
}

export function colonyOutput(state: GameState, colony: Colony): ColonyOutput {
  const planet = state.planets[colony.planetId]!;
  const player = state.players[colony.ownerId]!;
  return computeOutput(planet, player, colony);
}

export function computeOutput(planet: Planet, player: Player, colony: Colony): ColonyOutput {
  const race = getRace(player.raceId);
  const gov = GOVERNMENTS[race.picks.government];
  const grav = gravityMultiplier(race, planet.gravity);
  const b = colony.buildings;
  const pop = population(colony);
  const max = maxPopulation(planet, race, b);

  const lithovore = hasTrait(race, "lithovore");
  const cyber = hasTrait(race, "cybernetic");

  const foodPerFarmer = Math.max(0, CLIMATES[planet.type].foodPerFarmer + race.picks.farming + sumEffect(b, "foodPerFarmer"));
  const foodProduced = (colony.farmers * foodPerFarmer * grav + sumEffect(b, "foodFlat")) * gov.foodMult;
  const foodEaten = lithovore ? 0 : cyber ? pop * 0.5 : pop;

  const perWorker = INDUSTRY_PER_WORKER[planet.minerals] + race.picks.industry + sumEffect(b, "industryPerWorker");
  const industryGross = (colony.workers * Math.max(0, perWorker) * grav + sumEffect(b, "industryFlat")) * gov.industryMult;
  const tolerance = pollutionTolerance(planet, race);
  const pollution = industryGross > tolerance ? (industryGross - tolerance) / 2 : 0;
  const cyberUpkeep = cyber ? pop * 0.5 : 0;
  const industry = Math.max(0, industryGross - pollution - cyberUpkeep);

  const perScientist = 3 + race.picks.science + sumEffect(b, "researchPerScientist");
  const research = (colony.scientists * Math.max(0, perScientist) * grav + sumEffect(b, "researchFlat")) * gov.researchMult;

  const bc = (pop * (TAX_PER_POP + race.picks.money) + sumEffect(b, "bcFlat")) * gov.bcMult;
  const maintenance = b.reduce((sum, id) => sum + (BUILDINGS_BY_ID[id]?.maintenance ?? 0), 0);

  return {
    population: pop,
    maxPopulation: max,
    foodProduced,
    foodEaten,
    foodNet: foodProduced - foodEaten,
    industryGross,
    pollution,
    industry,
    research,
    bc,
    maintenance,
    growthK: growthPerTurn(pop, max, race, b),
  };
}

/** MoO2-style logistic growth in thousands per turn. */
export function growthPerTurn(pop: number, max: number, race: RaceDef, buildings: string[]): number {
  if (pop <= 0 || pop >= max) return 0;
  const base = Math.sqrt((2000 * pop * (max - pop)) / max);
  const mult = Math.max(0.25, 1 + race.picks.growth);
  const cloning = buildings.includes("cloningCenter") ? 100 : 0;
  return Math.floor(base * mult + cloning);
}

export interface EmpireTotals {
  food: number;
  industry: number;
  research: number;
  bcIncome: number;
  maintenance: number;
  population: number;
  colonies: number;
}

export function empireTotals(state: GameState, playerId: number): EmpireTotals {
  const t: EmpireTotals = { food: 0, industry: 0, research: 0, bcIncome: 0, maintenance: 0, population: 0, colonies: 0 };
  for (const c of Object.values(state.colonies)) {
    if (c.ownerId !== playerId) continue;
    const o = colonyOutput(state, c);
    t.food += o.foodNet;
    t.industry += o.industry;
    t.research += o.research;
    t.bcIncome += o.bc;
    t.maintenance += o.maintenance;
    t.population += o.population;
    t.colonies += 1;
  }
  return t;
}
