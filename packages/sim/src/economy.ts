import { BUILDINGS_BY_ID, type BuildingEffects } from "./data/buildings.js";
import { CLIMATES, INDUSTRY_PER_WORKER, SIZE_FACTOR, type Gravity, type PlanetType } from "./data/planets.js";
import { getRace, hasTrait, type RaceDef } from "./data/races.js";
import { empireBonus, government } from "./empire.js";
import type { Colony, GameState, LeaderSkills, Planet, Player } from "./types.js";

/** Pure economy formulas. Nothing here mutates state, so the UI can preview changes. */

export const TAX_PER_POP = 0.5;
export const TRADE_GOODS_RATE = 0.5;
/** Morale effect is capped in both directions. */
export const MORALE_RANGE: [number, number] = [-50, 50];
export const UNREST_MORALE = -30;

export function population(c: Colony): number {
  return c.farmers + c.workers + c.scientists;
}

export function canColonize(type: PlanetType): boolean {
  return CLIMATES[type].habitable;
}

function sumEffect(buildings: string[], key: keyof BuildingEffects): number {
  let total = 0;
  for (const id of buildings) {
    const v = BUILDINGS_BY_ID[id]?.effects[key];
    if (typeof v === "number") total += v;
  }
  return total;
}

export function maxPopulation(planet: Planet, race: RaceDef, buildings: string[] = [], player?: Player): number {
  const climate = CLIMATES[planet.type];
  if (!climate.habitable) return 0;
  const size = SIZE_FACTOR[planet.size];
  let perSize = climate.popPerSize;
  if (hasTrait(race, "aquatic") && (planet.type === "ocean" || planet.type === "swamp")) perSize += 1;
  if (hasTrait(race, "tolerant") && climate.hostile) perSize += 1;
  if (hasTrait(race, "subterranean")) perSize += 1;
  perSize += sumEffect(buildings, "maxPopBySize");
  let flat = 0;
  if (player) {
    const bonus = empireBonus(player);
    perSize += bonus.maxPopPerSize;
    flat += bonus.maxPopFlat;
  }
  return Math.max(1, Math.floor(perSize * size + flat));
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

export function colonyMorale(player: Player, colony: Colony, turn: number, leader?: LeaderSkills): number {
  const gov = government(player);
  let morale = gov.morale + empireBonus(player).morale + sumEffect(colony.buildings, "morale") + (leader?.morale ?? 0);
  if (gov.ungarrisonedPenalty && !colony.buildings.includes("marineBarracks")) morale -= gov.ungarrisonedPenalty;
  if (colony.unrestUntil > turn) morale += UNREST_MORALE;
  if (colony.raceId !== player.raceId && !colony.buildings.includes("alienManagementCenter")) morale -= 10;
  return Math.max(MORALE_RANGE[0], Math.min(MORALE_RANGE[1], morale));
}

export interface ColonyOutput {
  population: number;
  maxPopulation: number;
  morale: number;
  foodProduced: number;
  foodEaten: number;
  /** Food surplus; negative means starvation unless covered by imports. */
  foodNet: number;
  industryGross: number;
  pollution: number;
  /** Industry available for building, after pollution, upkeep and taxes. */
  industry: number;
  /** BC collected from industry by taxes. */
  taxes: number;
  research: number;
  bc: number;
  maintenance: number;
  growthK: number;
  troops: number;
}

export interface OutputContext {
  turn: number;
  leader?: LeaderSkills;
}

export function colonyOutput(state: GameState, colony: Colony): ColonyOutput {
  const planet = state.planets[colony.planetId]!;
  const player = state.players[colony.ownerId]!;
  return computeOutput(planet, player, colony, { turn: state.turn, leader: administratorSkills(state, planet.starId, colony.ownerId) });
}

/** Skills of the administrator governing a star system, if any. */
export function administratorSkills(state: GameState, starId: string, ownerId: number): LeaderSkills | undefined {
  for (const l of Object.values(state.leaders)) {
    if (l.kind === "administrator" && l.ownerId === ownerId && l.assignedTo === starId) return l.skills;
  }
  return undefined;
}

export function computeOutput(planet: Planet, player: Player, colony: Colony, ctx: OutputContext = { turn: 0 }): ColonyOutput {
  const race = getRace(colony.raceId);
  const gov = government(player);
  const bonus = empireBonus(player);
  const b = colony.buildings;
  const lead = ctx.leader ?? {};
  const pop = population(colony);
  const max = colony.outpost ? 0 : maxPopulation(planet, race, b, player);
  const troops = sumEffect(b, "troops") + Math.ceil(pop / 2);

  if (colony.outpost) {
    return {
      population: 0, maxPopulation: 0, morale: 0, foodProduced: 0, foodEaten: 0, foodNet: 0, industryGross: 0,
      pollution: 0, industry: 0, taxes: 0, research: 0, bc: 0, maintenance: 0, growthK: 0, troops,
    };
  }

  const grav = b.includes("gravityGenerator") ? 1 : gravityMultiplier(race, planet.gravity);
  const morale = colonyMorale(player, colony, ctx.turn, lead);
  const moraleMult = 1 + morale / 100;
  const lithovore = hasTrait(race, "lithovore");
  const cyber = hasTrait(race, "cybernetic");

  const foodPerFarmer = Math.max(
    0,
    CLIMATES[planet.type].foodPerFarmer + race.picks.farming + bonus.foodPerFarmer + sumEffect(b, "foodPerFarmer"),
  );
  const foodProduced =
    (colony.farmers * foodPerFarmer * grav + sumEffect(b, "foodFlat")) * gov.foodMult * moraleMult * (1 + (lead.food ?? 0) / 100);
  const foodEaten = lithovore ? 0 : Math.max(0, (cyber ? 0.5 : 1) - bonus.freeFood) * pop;

  const perWorker = INDUSTRY_PER_WORKER[planet.minerals] + race.picks.industry + bonus.industryPerWorker + sumEffect(b, "industryPerWorker");
  const industryGross =
    (colony.workers * Math.max(0, perWorker) * grav + sumEffect(b, "industryFlat")) * gov.industryMult * moraleMult * (1 + (lead.industry ?? 0) / 100);
  const tolerance = pollutionTolerance(planet, race);
  const cleanup = Math.min(1, sumEffect(b, "pollutionCleanup") + bonus.pollutionCleanup);
  const pollution = industryGross > tolerance ? ((industryGross - tolerance) / 2) * (1 - cleanup) : 0;
  const cyberUpkeep = cyber ? pop * 0.5 : 0;
  const net = Math.max(0, industryGross - pollution - cyberUpkeep);
  const taxes = net * player.taxRate;
  const industry = net - taxes;

  const artifacts = planet.special === "artifacts" ? 2 : 0;
  const perScientist = 3 + race.picks.science + bonus.researchPerScientist + sumEffect(b, "researchPerScientist") + artifacts;
  const research =
    (colony.scientists * Math.max(0, perScientist) * grav + sumEffect(b, "researchFlat")) * gov.researchMult * moraleMult * (1 + (lead.research ?? 0) / 100);

  const bcBase = pop * (TAX_PER_POP + race.picks.money + bonus.bcPerPop) + sumEffect(b, "bcFlat");
  const bc = bcBase * gov.bcMult * (1 + sumEffect(b, "bcMult")) * (1 + (lead.bc ?? 0) / 100) + taxes;
  const maintenance = b.reduce((sum, id) => sum + (BUILDINGS_BY_ID[id]?.maintenance ?? 0), 0);

  return {
    population: pop,
    maxPopulation: max,
    morale,
    foodProduced,
    foodEaten,
    foodNet: foodProduced - foodEaten,
    industryGross,
    pollution,
    industry,
    taxes,
    research,
    bc,
    maintenance,
    growthK: growthPerTurn(pop, max, race, b, bonus.growth),
    troops,
  };
}

/** MoO2-style logistic growth in thousands per turn. */
export function growthPerTurn(pop: number, max: number, race: RaceDef, buildings: string[], techGrowth = 0): number {
  if (pop <= 0 || pop >= max) return 0;
  const base = Math.sqrt((2000 * pop * (max - pop)) / max);
  const mult = Math.max(0.25, 1 + race.picks.growth + techGrowth);
  return Math.floor(base * mult + sumEffect(buildings, "growthK"));
}

export interface EmpireTotals {
  food: number;
  industry: number;
  research: number;
  bcIncome: number;
  maintenance: number;
  population: number;
  colonies: number;
  outposts: number;
}

export function empireTotals(state: GameState, playerId: number): EmpireTotals {
  const t: EmpireTotals = { food: 0, industry: 0, research: 0, bcIncome: 0, maintenance: 0, population: 0, colonies: 0, outposts: 0 };
  for (const c of Object.values(state.colonies)) {
    if (c.ownerId !== playerId) continue;
    if (c.outpost) {
      t.outposts += 1;
      continue;
    }
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

export interface EmpireIncome {
  /** Taxes on population and trade goods are counted with colonies. */
  colonies: number;
  maintenance: number;
  salaries: number;
  commandOverage: number;
  net: number;
}
