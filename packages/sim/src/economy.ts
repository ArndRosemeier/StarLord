import { BUILDINGS_BY_ID, FIGHTER_GARRISON, type BuildingEffects } from "./data/buildings.js";
import {
  ANDROIDS, ARTIFACTS_RESEARCH, BLOCKADE_PENALTY, CYBERNETIC_FOOD, CYBERNETIC_INDUSTRY, FOOD_PER_POP, FREIGHTERS, GROWTH,
  MILITIA_PER_POP, MIN_FOOD_PER_FARMER, MIN_OUTPUT_PER_UNIT, MORALE_FLOOR, REPLICATED_FOOD_UPKEEP, RESEARCH_PER_SCIENTIST,
  SPECIAL_INCOME, TAX_BC_PER_INDUSTRY, TAX_PER_POP,
} from "./data/economy.js";
import { ASSIMILATION } from "./data/governments.js";
import { DIFFICULTIES, DIFFICULTY_ORDER, NATIVE_FOOD_BONUS } from "./data/galaxy.js";
import {
  CLIMATES, INDUSTRY_PER_WORKER, POLLUTION_PER_EXCESS, POLLUTION_TOLERANCE, SIZE_FACTOR, SOILLESS, type Gravity,
  type PlanetType,
} from "./data/planets.js";
import { getRace, hasTrait, type RaceDef } from "./data/races.js";
import { findDesign } from "./designs.js";
import { isHostile } from "./diplomacy.js";
import { raceFoodPerFarmer, raceMaxPopulation, surplusFoodBc } from "./raceEffects.js";
import { empireBonus, government, knows } from "./empire.js";
import type { AndroidCounts, Colony, Difficulty, GameState, LeaderSkills, Planet, Player, PlayerId } from "./types.js";

/** Pure economy formulas. Nothing here mutates state, so the UI can preview changes. */


/** Biological population: the units that hold jobs and can be moved, starved or bombed. */
export function population(c: Colony): number {
  return c.farmers + c.workers + c.scientists;
}

const NO_ANDROIDS: AndroidCounts = { farmers: 0, workers: 0, scientists: 0 };

export function androids(c: Colony): AndroidCounts {
  return c.androids ?? NO_ANDROIDS;
}

export function androidCount(c: Colony): number {
  const a = androids(c);
  return a.farmers + a.workers + a.scientists;
}

/** Everyone who takes up room on the planet: people and androids. */
export function totalPopulation(c: Colony): number {
  return population(c) + androidCount(c);
}

/** Whether a colony ship can found a populated colony on this climate. */
export function canColonize(type: PlanetType): boolean {
  return CLIMATES[type].habitable;
}

/**
 * Whether an outpost ship can claim a planet of this climate. Meant to be shared by the
 * colonize order's check and the Planets screen, so both follow one rule.
 */
export function canOutpost(_type: PlanetType): boolean {
  // As in the original, an outpost can go on any uninhabited body, asteroid belts and gas giants included.
  return true;
}

function sumEffect(buildings: string[], key: keyof BuildingEffects): number {
  let total = 0;
  for (const id of buildings) {
    const v = BUILDINGS_BY_ID[id]?.effects[key];
    if (typeof v === "number") total += v;
  }
  return total;
}

function hasEffect(buildings: string[], key: keyof BuildingEffects): boolean {
  return buildings.some((id) => !!BUILDINGS_BY_ID[id]?.effects[key]);
}

export function maxPopulation(planet: Planet, race: RaceDef, buildings: string[] = [], player?: Player): number {
  const climate = CLIMATES[planet.type];
  if (!climate.habitable) return 0;
  // Aquatic, tolerant and subterranean races live as the race hooks say.
  let pop = raceMaxPopulation(race, planet.type, planet.size) + sumEffect(buildings, "maxPopFlat");
  if (player) {
    const bonus = empireBonus(player);
    pop += bonus.maxPopPerSize * SIZE_FACTOR[planet.size] + bonus.maxPopFlat;
  }
  return Math.max(1, Math.floor(pop));
}

/** Productivity multiplier for a race living at a gravity. */
export function gravityMultiplier(race: RaceDef | null, gravity: Gravity): number {
  const native: Gravity = race && hasTrait(race, "lowG") ? "low" : race && hasTrait(race, "highG") ? "heavy" : "normal";
  if (gravity === native) return 1;
  if (native === "heavy") return gravity === "normal" ? 1 : 0.75;
  if (native === "low") return gravity === "normal" ? 0.75 : 0.5;
  return gravity === "low" ? 0.75 : 0.5;
}

/** Whether farmers can grow anything on this planet (for the given race, or the player's). */
export function canFarm(planet: Planet, player?: Player, race?: RaceDef): boolean {
  const r = race ?? (player ? getRace(player.raceId) : null);
  const base = r ? raceFoodPerFarmer(r, planet.type) : CLIMATES[planet.type].foodPerFarmer;
  if (base > 0) return true;
  return !!player && empireBonus(player).hostileFarming > 0;
}

/** Industry the planet absorbs before it pollutes; Nano Disassemblers double it. */
export function pollutionTolerance(planet: Planet, player?: Player): number {
  const boost = player ? empireBonus(player).pollutionTolerance : 0;
  return POLLUTION_TOLERANCE[planet.size] * (1 + boost);
}

/**
 * Pollution from the industry workers and the Robotic Factory make. Each
 * cleanup building cuts the polluting industry in turn (rounded up), an
 * Environmentalist administrator by his percent, and half the excess over
 * the tolerance (rounded up) is lost. Tolerant people and androids don't
 * pollute: the result shrinks with their share of the population.
 */
export function colonyPollution(
  planet: Planet, race: RaceDef, player: Player, buildings: string[], polluting: number, pop: number, nAndroids: number,
  cleanupPercent = 0,
): number {
  if (hasEffect(buildings, "noPollution")) return 0;
  let x = polluting;
  for (const id of buildings) {
    const f = BUILDINGS_BY_ID[id]?.effects.pollutionFactor;
    if (f) x = Math.ceil(x * f);
  }
  x = Math.trunc(x * Math.max(0, 1 - cleanupPercent / 100));
  const tolerance = pollutionTolerance(planet, player);
  let pollution = x > tolerance ? Math.ceil((x - tolerance) * POLLUTION_PER_EXCESS) : 0;
  const total = pop + nAndroids;
  const exempt = nAndroids + (hasTrait(race, "tolerant") ? pop : 0);
  if (exempt > 0 && total > 0) pollution = Math.trunc((total / 2 + pollution * (total - exempt)) / total);
  return pollution < 1 ? 0 : pollution;
}

/** True while the empire's Capitol is lost and its government suffers for it. */
export function capitalLost(player: Player): boolean {
  return player.capitol === "lost" && government(player).capitalLossMorale > 0;
}

/** Buildings that sabotage, comets and bombs can destroy: everything but the Capitol. */
export function destructibleBuildings(colony: Colony): string[] {
  return colony.buildings.filter((b) => !BUILDINGS_BY_ID[b]?.effects.capitol);
}

/** A colony where two races live side by side (natives among settlers) counts as multi-racial; androids don't count. */
export function isMultiRacial(player: Player, colony: Colony): boolean {
  void player;
  const pop = population(colony);
  const natives = Math.min(pop, colony.natives ?? 0);
  return pop > 1 && natives > 0 && natives < pop;
}

export function colonyMorale(player: Player, colony: Colony, turn: number, leader?: LeaderSkills): number {
  void turn;
  if (government(player).noMorale) return 0;
  return Math.max(MORALE_FLOOR, moraleParts(player, colony, leader).reduce((s, p) => s + p.value, 0));
}

/** What a colony's morale is made of, in percent, before the floor. Empty for governments without morale. */
export function moraleParts(player: Player, colony: Colony, leader?: LeaderSkills): { why: string; value: number }[] {
  const gov = government(player);
  if (gov.noMorale) return [];
  const b = colony.buildings;
  const parts: { why: string; value: number }[] = [];
  const add = (why: string, value: number) => {
    if (value !== 0) parts.push({ why, value });
  };
  add(gov.name, gov.morale);
  add("technologies", empireBonus(player).morale);
  add("buildings", sumEffect(b, "morale"));
  add("administrator", leader?.morale ?? 0);
  if (gov.ungarrisonedPenalty && !hasEffect(b, "garrison")) add("no marine barracks", -gov.ungarrisonedPenalty);
  if (capitalLost(player)) add("capitol lost", -gov.capitalLossMorale);
  if (isMultiRacial(player, colony) && !hasEffect(b, "alienManagement")) add("several races, no alien management", -ASSIMILATION.multiRacePenalty);
  return parts;
}

/** Morale for a colony in a full state, with its system's administrator. */
export function colonyMoraleParts(state: GameState, colony: Colony): { why: string; value: number }[] {
  const planet = state.planets[colony.planetId]!;
  return moraleParts(state.players[colony.ownerId]!, colony, administratorSkills(state, planet.starId, colony.ownerId));
}

export interface ColonyOutput {
  /** Biological population. */
  population: number;
  androids: number;
  maxPopulation: number;
  morale: number;
  /** Unassimilated population units. */
  aliens: number;
  foodProduced: number;
  foodEaten: number;
  /** Food made by Food Replicators from industry. */
  foodReplicated: number;
  /** Food surplus; negative means this colony needs freighters to bring food or it starves. */
  foodNet: number;
  industryGross: number;
  pollution: number;
  /** Industry available for building, after pollution, upkeep and taxes. */
  industry: number;
  /** Industry collected by the tax rate. */
  taxes: number;
  research: number;
  /** BC this colony earns: population tax, industry tax and deposits, with every multiplier. */
  bc: number;
  maintenance: number;
  growthK: number;
  troops: number;
  /** An enemy fleet sits unopposed in the system: production is halved and freighters can't get through. */
  blockaded: boolean;
  /**
   * Upkeep the colony's industry can't cover, in half units: first its own
   * cybernetic colonists (they starve like hungry ones), then androids (each
   * uncovered one shuts down).
   */
  cyberShortHalf: number;
  androidsUnfed: number;
}

export interface OutputContext {
  turn: number;
  leader?: LeaderSkills;
  blockaded?: boolean;
  /** Game difficulty: computer players get its output, growth and BC bonuses. */
  difficulty?: Difficulty;
  /** Growth percent from events (population boom, plague). */
  growthPercent?: number;
  /** A time-space anomaly holds the system: the colony makes, eats, pays and grows nothing. */
  frozen?: boolean;
}

/**
 * A time-space anomaly holds a system: its colonies stand still (no output,
 * upkeep, growth or building, as in the original) and nobody fights there.
 */
export function systemFrozen(state: GameState, starId: string | null | undefined): boolean {
  return !!starId && (state.activeEvents ?? []).some((e) => e.kind === "timeSpaceAnomaly" && e.starId === starId);
}

/**
 * Food one more settler farmer would grow on this colony, taking a worker (or
 * else a scientist) off their job; 0 where farming grows nothing.
 */
export function farmerFood(state: GameState, colony: Colony): number {
  const trial: Colony = { ...colony, farmers: colony.farmers + 1 };
  if (colony.workers > 0) trial.workers--;
  else if (colony.scientists > 0) trial.scientists--;
  return Math.max(0, colonyOutput(state, trial).foodProduced - colonyOutput(state, colony).foodProduced);
}

/** A colony's output; `leader` stands in for the system's administrator (null: as if none governed it). */
export function colonyOutput(state: GameState, colony: Colony, leader?: LeaderSkills | null): ColonyOutput {
  const planet = state.planets[colony.planetId]!;
  const player = state.players[colony.ownerId]!;
  return computeOutput(planet, player, colony, {
    frozen: systemFrozen(state, planet.starId),
    turn: state.turn,
    leader: leader === undefined ? administratorSkills(state, planet.starId, colony.ownerId) : leader ?? undefined,
    blockaded: isBlockaded(state, colony),
    difficulty: state.settings.difficulty,
    growthPercent: eventGrowthPercent(state, colony.id),
  });
}

/** What a colony leader would change in one of an empire's systems right now, summed over its colonies there. */
export interface AdministratorGain {
  starId: string;
  food: number;
  industry: number;
  research: number;
  bc: number;
  /** Morale points, on the colony with the biggest change. */
  morale: number;
}

/** The change if `skills` governed the system in place of its current administrator (or nobody). */
export function administratorGain(state: GameState, ownerId: PlayerId, starId: string, skills: LeaderSkills): AdministratorGain {
  const gain: AdministratorGain = { starId, food: 0, industry: 0, research: 0, bc: 0, morale: 0 };
  for (const c of Object.values(state.colonies)) {
    if (c.ownerId !== ownerId || state.planets[c.planetId]?.starId !== starId) continue;
    const now = colonyOutput(state, c);
    const then = colonyOutput(state, c, skills);
    gain.food += then.foodProduced - now.foodProduced;
    gain.industry += then.industry - now.industry;
    gain.research += then.research - now.research;
    gain.bc += then.bc - now.bc;
    gain.morale = Math.max(gain.morale, then.morale - now.morale);
  }
  return gain;
}

/** Skills of the administrator governing a star system, if any. */
export function administratorSkills(state: GameState, starId: string, ownerId: number): LeaderSkills | undefined {
  for (const l of Object.values(state.leaders)) {
    if (l.kind === "administrator" && l.ownerId === ownerId && l.assignedTo === starId) return l.skills;
  }
  return undefined;
}

function hasArmedShips(state: GameState, ownerId: PlayerId, ships: { designId: string }[]): boolean {
  const owner = state.players[ownerId];
  if (!owner) return false;
  return ships.some((s) => {
    const d = findDesign(owner, s.designId);
    return !!d && (!!d.fixed || d.weapons.length > 0);
  });
}

/** A hostile armed fleet sits in the colony's system and no armed fleet of the owner challenges it. */
export function isBlockaded(state: GameState, colony: Colony): boolean {
  if (colony.outpost) return false;
  const starId = state.planets[colony.planetId]?.starId;
  if (!starId) return false;
  let enemy = false;
  for (const f of Object.values(state.fleets)) {
    if (f.starId !== starId || !hasArmedShips(state, f.ownerId, f.ships)) continue;
    if (f.ownerId === colony.ownerId) return false;
    if (isHostile(state, colony.ownerId, f.ownerId)) enemy = true;
  }
  return enemy;
}

/** Ground troops: barracks units plus a militia from the population. */
export function colonyTroops(colony: Colony): number {
  const b = colony.buildings;
  return sumEffect(b, "troops") + (colony.marinesTrained ?? 0) + (colony.tanksTrained ?? 0) +
    Math.floor(population(colony) * MILITIA_PER_POP);
}

export function computeOutput(planet: Planet, player: Player, colony: Colony, ctx: OutputContext = { turn: 0 }): ColonyOutput {
  const race = getRace(colony.raceId);
  const gov = government(player);
  const bonus = empireBonus(player);
  const b = colony.buildings;
  const lead = ctx.leader ?? {};
  const pop = population(colony);
  const andr = androids(colony);
  const nAndroids = andr.farmers + andr.workers + andr.scientists;
  const max = colony.outpost ? 0 : maxPopulation(planet, race, b, player);
  const troops = colonyTroops(colony);

  if (colony.outpost || ctx.frozen) {
    const frozen = !colony.outpost;
    return {
      population: frozen ? pop : 0, androids: frozen ? nAndroids : 0, maxPopulation: max, morale: 0, aliens: 0, foodProduced: 0, foodEaten: 0, foodReplicated: 0,
      foodNet: 0, industryGross: 0, pollution: 0, industry: 0, taxes: 0, research: 0, bc: 0, maintenance: 0,
      growthK: 0, troops, blockaded: false, cyberShortHalf: 0, androidsUnfed: 0,
    };
  }

  const climate = CLIMATES[planet.type];
  // Every output modifier is a percentage added to the same 100%, per unit, as in the original.
  const gravPct = (hasEffect(b, "gravityFix") ? 1 : gravityMultiplier(race, planet.gravity)) * 100 - 100;
  // Androids have no race, so a normal race's gravity applies to them.
  const androidGravPct = (hasEffect(b, "gravityFix") ? 1 : gravityMultiplier(null, planet.gravity)) * 100 - 100;
  const morale = colonyMorale(player, colony, ctx.turn, lead);
  const aliens = Math.min(colony.aliens ?? 0, pop);
  const lithovore = hasTrait(race, "lithovore");
  const cyber = hasTrait(race, "cybernetic");
  const aiLevel = player.isHuman ? null : DIFFICULTIES[ctx.difficulty ?? "average"];
  const aiFlat = aiLevel?.aiOutputPerUnit ?? 0;
  const blockadePct = ctx.blockaded ? -BLOCKADE_PENALTY : 0;
  /**
   * Output of `n` units making `raw` each at 100% plus `pct`, plus `flat` each (the computer players' bonus),
   * aliens losing their share; no unit makes less than nothing.
   */
  const units = (n: number, nAliens: number, raw: number, pct: number, flat = 0) =>
    (n - nAliens) * Math.max(0, raw * pct / 100 + flat) + nAliens * Math.max(0, raw * (pct - ASSIMILATION.alienPenalty) / 100 + flat);
  // Unassimilated units are spread over the jobs by their share of the population.
  const alienShare = pop > 0 ? aliens / pop : 0;

  // Food, worked out in half units like the original.
  const farmable = canFarm(planet, player, race);
  const soil = !SOILLESS.includes(planet.type);
  const farmBuildings = b.reduce((sum, id) => {
    const e = BUILDINGS_BY_ID[id]?.effects;
    return sum + (e?.foodPerFarmer && (soil || !e.needsSoil) ? e.foodPerFarmer : 0);
  }, 0);
  // Aquatic races farm tundra and swamp as terran, ocean and terran as gaia; androids see the plain climate.
  const landFood = raceFoodPerFarmer(race, planet.type) + bonus.foodPerFarmer + farmBuildings;
  const perFarmer = farmable ? Math.max(MIN_FOOD_PER_FARMER, landFood + race.picks.farming) : 0;
  const androidLand = climate.foodPerFarmer + bonus.foodPerFarmer + farmBuildings;
  const androidFood = (climate.foodPerFarmer > 0 || bonus.hostileFarming > 0 ? Math.max(0, androidLand) : 0) + ANDROIDS.bonus;
  const foodPct = 100 + gravPct + (lead.food ?? 0) + morale + (gov.foodMult - 1) * 100 + blockadePct;
  const androidFoodPct = 100 + androidGravPct + (lead.food ?? 0) + (gov.foodMult - 1) * 100 + blockadePct;
  // Natives farm the plain climate (no race picks) plus their own bonus, before morale and the other modifiers.
  const nativeFarmers = Math.min(colony.farmers, colony.natives ?? 0);
  const settlerFarmers = colony.farmers - nativeFarmers;
  const nativeFood = farmable ? Math.max(MIN_FOOD_PER_FARMER, androidLand + NATIVE_FOOD_BONUS) : 0;
  const nativeFoodPct = 100 + androidGravPct + (lead.food ?? 0) + morale + (gov.foodMult - 1) * 100 + blockadePct;
  const foodProduced =
    Math.round(2 * (units(settlerFarmers, settlerFarmers * alienShare, perFarmer, foodPct, farmable ? aiFlat / 2 : 0) +
      units(nativeFarmers, 0, nativeFood, nativeFoodPct, farmable ? aiFlat / 2 : 0) +
      units(andr.farmers, 0, androidFood, androidFoodPct, androidFood > 0 ? aiFlat / 2 : 0))) / 2 +
    sumEffect(b, "foodFlat");
  // Cybernetic colonists eat half a unit each, rounded up per colony as in the original.
  const foodEaten = lithovore ? 0 : Math.ceil((cyber ? CYBERNETIC_FOOD : FOOD_PER_POP) * pop - 1e-9);

  // Industry
  const landIndustry = INDUSTRY_PER_WORKER[planet.minerals] + bonus.industryPerWorker + sumEffect(b, "industryPerWorker");
  const perWorker = Math.max(MIN_OUTPUT_PER_UNIT, landIndustry + race.picks.industry);
  const industryPct = 100 + gravPct + (lead.industry ?? 0) + morale + (gov.industryMult - 1) * 100 + blockadePct;
  const androidIndustryPct = 100 + androidGravPct + (lead.industry ?? 0) + morale + (gov.industryMult - 1) * 100 + blockadePct;
  const byWorkers = Math.round(
    units(colony.workers, colony.workers * alienShare, perWorker, industryPct, aiFlat) +
    units(andr.workers, 0, Math.max(0, landIndustry) + ANDROIDS.bonus, androidIndustryPct, aiFlat),
  );
  // Factory flats and recycling are added unscaled.
  const byMinerals = b.reduce((sum, id) => sum + (BUILDINGS_BY_ID[id]?.effects.industryByMinerals?.[planet.minerals] ?? 0), 0);
  const recycled = (pop + nAndroids) * sumEffect(b, "industryPerPop");
  const industryGross = byWorkers + byMinerals + sumEffect(b, "industryFlat");
  const pollution = colonyPollution(planet, race, player, b, byWorkers + byMinerals, pop, nAndroids, lead.pollution ?? 0);
  const upkeep = Math.ceil((cyber ? pop * CYBERNETIC_INDUSTRY : 0) + nAndroids * ANDROIDS.industryUpkeep);
  let net = Math.max(0, industryGross + recycled - pollution - upkeep);
  // Industry goes to the colony's cybernetic colonists first (half a unit each), then to androids (one each).
  const halves = Math.floor(2 * Math.max(0, industryGross + recycled - pollution) + 1e-9);
  const cyberNeed = cyber ? Math.ceil(2 * pop * CYBERNETIC_INDUSTRY - 1e-9) : 0;
  const cyberShortHalf = Math.max(0, cyberNeed - halves);
  const androidsUnfed = Math.ceil(Math.max(0, 2 * nAndroids * ANDROIDS.industryUpkeep - Math.max(0, halves - cyberNeed)) / (2 * ANDROIDS.industryUpkeep) - 1e-9);
  const production = net;

  // Food Replicators cover the colony's own shortfall from its industry.
  let foodReplicated = 0;
  const replicator = sumEffect(b, "foodReplicator");
  if (replicator > 0 && foodProduced < foodEaten) {
    foodReplicated = Math.min(foodEaten - foodProduced, Math.floor(net / replicator));
    net -= foodReplicated * replicator;
  }
  const taxes = Math.floor(net * player.taxRate);
  const industry = net - taxes;

  // Research
  const artifacts = planet.special === "artifacts" ? ARTIFACTS_RESEARCH : 0;
  const landResearch = RESEARCH_PER_SCIENTIST + bonus.researchPerScientist + sumEffect(b, "researchPerScientist") + artifacts;
  const perScientist = Math.max(MIN_OUTPUT_PER_UNIT, landResearch + race.picks.science);
  const researchPct = 100 + gravPct + (lead.research ?? 0) + morale + (gov.researchMult - 1) * 100;
  const androidResearchPct = 100 + androidGravPct + (lead.research ?? 0) + (gov.researchMult - 1) * 100;
  const research =
    Math.round(units(colony.scientists, colony.scientists * alienShare, perScientist, researchPct, aiFlat) +
      units(andr.scientists, 0, Math.max(0, landResearch) + ANDROIDS.bonus, androidResearchPct, aiFlat)) +
    sumEffect(b, "researchFlat");

  // Money: androids pay no tax. Morale touches only the population tax; every bonus is a share of tax plus deposits.
  const special = planet.special === "gold" ? SPECIAL_INCOME.gold : planet.special === "gems" ? SPECIAL_INCOME.gems : 0;
  const perPop = Math.max(0, TAX_PER_POP + race.picks.money + bonus.bcPerPop + (aiLevel?.aiBcPerPop ?? 0));
  // Natives pay no tax and never grow.
  const natives = Math.min(pop, colony.natives ?? 0);
  const popTax = Math.round((pop - natives) * perPop);
  const moraleTax = gov.noMorale ? 0 : Math.round((popTax * morale) / 100);
  const incomeShare = (gov.bcMult - 1) + sumEffect(b, "bcMult") + (lead.bc ?? 0) / 100 + bonus.incomePercent / 100;
  const bc = popTax + moraleTax + special + Math.trunc((popTax + special) * incomeShare) + taxes * TAX_BC_PER_INDUSTRY;
  const maintenance = colonyMaintenance(planet, b, foodReplicated * REPLICATED_FOOD_UPKEEP);

  // Growth: housing turns production per colonist into growth percent.
  const housing = colony.queue[0]?.kind === "project" && colony.queue[0].id === "housing";
  // The computer players' growth bonus skips a foreign race that still has unassimilated people.
  const aiGrowth = colony.raceId === player.raceId || aliens === 0 ? aiLevel?.aiGrowthPercent ?? 0 : 0;
  const growthPct = (lead.growth ?? 0) + aiGrowth + (ctx.growthPercent ?? 0) +
    (housing && pop + nAndroids > 0 ? Math.floor((GROWTH.housingPercent * production) / (pop + nAndroids)) : 0);

  return {
    population: pop,
    androids: nAndroids,
    maxPopulation: max,
    morale,
    aliens,
    foodProduced,
    foodEaten,
    foodReplicated,
    foodNet: foodProduced + foodReplicated - foodEaten,
    industryGross: industryGross + recycled,
    pollution,
    industry,
    taxes,
    research,
    bc,
    maintenance,
    growthK: growthPerTurn(pop - natives, pop + nAndroids, max, race, b, bonus.growth * 100 + growthPct),
    troops,
    blockaded: !!ctx.blockaded,
    cyberShortHalf,
    androidsUnfed,
  };
}

/** Building upkeep (plus any other upkeep, like replicated food), raised on harsh climates and rounded. */
export function colonyMaintenance(planet: Planet, buildings: string[], extra = 0): number {
  const base = buildings.reduce((sum, id) => sum + (BUILDINGS_BY_ID[id]?.maintenance ?? 0), 0) + extra;
  return Math.round(base * (1 + CLIMATES[planet.type].maintenancePenalty));
}

/** Growth percent from a population boom or a plague on the colony. */
export function eventGrowthPercent(state: GameState, colonyId: string): number {
  let pct = 0;
  for (const e of state.activeEvents ?? []) {
    if (e.colonyId !== colonyId) continue;
    if (e.kind === "populationBoom") pct += GROWTH.boomPercent;
    if (e.kind === "plague") pct += GROWTH.plaguePercent;
  }
  return pct;
}

/** Integer square root, rounded down. */
function isqrt(n: number): number {
  let r = Math.floor(Math.sqrt(n));
  while (r * r > n) r--;
  while ((r + 1) * (r + 1) <= n) r++;
  return r;
}

/**
 * Growth in thousands per turn, as the original works it out: the integer
 * square root of 2000 × people × room / max, scaled by 100% plus the race
 * pick and every other growth percent (which may turn it negative), plus a
 * Cloning Center's share. `total` counts androids, who take room but never grow.
 */
export function growthPerTurn(pop: number, total: number, max: number, race: RaceDef, buildings: string[], extraPercent = 0): number {
  if (pop <= 0 || total >= max) return 0;
  const base = isqrt(Math.floor((GROWTH.scale * pop * (max - total)) / max));
  const percent = 100 + race.picks.growth * 100 + extraPercent;
  const cloning = Math.floor((sumEffect(buildings, "growthK") * pop) / total);
  return cloning + Math.trunc((base * percent) / 100);
}

/** Fighters a colony's garrison launches: the best type the owner knows. */
export function fighterGarrison(player: Player, colony: Colony): { kind: "interceptor" | "bomber" | "heavyFighter"; slots: number; bays: number; count: number } | null {
  const garrisons = colony.buildings.reduce((n, id) => n + (BUILDINGS_BY_ID[id]?.effects.defense?.fighters ? 1 : 0), 0);
  if (garrisons === 0) return null;
  const kind = knows(player, "heavyFighterBays") ? "heavyFighter" : knows(player, "bomberBays") ? "bomber" : "interceptor";
  const slots = FIGHTER_GARRISON.slots * garrisons;
  const bays = FIGHTER_GARRISON.bays[kind];
  const count = kind === "heavyFighter" ? FIGHTER_GARRISON.heavyFighters : kind === "bomber" ? FIGHTER_GARRISON.bombers : FIGHTER_GARRISON.interceptors;
  return { kind, slots, bays, count: count * garrisons };
}

// ---------------------------------------------------------------- food trade

export interface FoodPlan {
  /** Freighters owned. */
  freighters: number;
  /** Freighters carrying colonists. */
  movingColonists: number;
  /** Freighters carrying food this turn. */
  carryingFood: number;
  /** Idle freighters. */
  free: number;
  /** Food colonies need from elsewhere. */
  needed: number;
  delivered: number;
  /** Food each colony needs but doesn't get; those colonies starve. */
  shortfall: Record<string, number>;
  /** Food left over after deliveries, sold for BC. */
  sold: number;
  saleBC: number;
  /** BC upkeep of the freighters in use. */
  upkeep: number;
}

/**
 * How food moves this turn: freighters carry surplus from fed colonies to
 * hungry ones, one food per ship, and what isn't needed is sold. Blockaded
 * systems neither send nor receive.
 */
export function foodPlan(state: GameState, playerId: PlayerId, outputs?: { colony: Colony; out: ColonyOutput }[]): FoodPlan {
  const player = state.players[playerId]!;
  const list = outputs ??
    Object.values(state.colonies).filter((c) => c.ownerId === playerId && !c.outpost).map((c) => ({ colony: c, out: colonyOutput(state, c) }));
  const freighters = player.freighters ?? 0;
  const movingColonists = (player.transfers ?? []).reduce((n, t) => n + t.count * FREIGHTERS.perColonist, 0);
  let capacity = Math.max(0, freighters - movingColonists) * FREIGHTERS.foodPerShip;
  let supply = 0;
  for (const { out } of list) if (out.foodNet > 0 && !out.blockaded) supply += out.foodNet;
  const hungry = list.filter((x) => x.out.foodNet < 0).sort((a, b) => (a.colony.id < b.colony.id ? -1 : a.colony.id > b.colony.id ? 1 : 0));
  const shortfall: Record<string, number> = {};
  let needed = 0;
  let delivered = 0;
  for (const { colony, out } of hungry) {
    const need = -out.foodNet;
    needed += need;
    const got = out.blockaded ? 0 : Math.min(need, capacity, supply);
    capacity -= got;
    supply -= got;
    delivered += got;
    if (need - got > 1e-9) shortfall[colony.id] = need - got;
  }
  const carryingFood = Math.ceil(delivered / FREIGHTERS.foodPerShip - 1e-9);
  // As in the original, the empire sells its net food surplus (all food made minus all eaten on colonies that
  // aren't blockaded, hungry ones included): ½ BC per food rounded down, 1 BC for fantastic traders.
  const sold = Math.max(0, list.reduce((n, { out }) => n + (out.blockaded ? 0 : out.foodNet), 0));
  return {
    freighters,
    movingColonists,
    carryingFood,
    free: Math.max(0, freighters - movingColonists - carryingFood),
    needed,
    delivered,
    shortfall,
    sold,
    saleBC: Math.floor(sold * surplusFoodBc(getRace(player.raceId)) + 1e-9),
    upkeep: Math.floor(Math.min(freighters, carryingFood + movingColonists) * FREIGHTERS.upkeepInUse),
  };
}

// ---------------------------------------------------------------- totals

export interface EmpireTotals {
  food: number;
  industry: number;
  research: number;
  bcIncome: number;
  maintenance: number;
  population: number;
  androids: number;
  colonies: number;
  outposts: number;
}

export function empireTotals(state: GameState, playerId: number): EmpireTotals {
  const t: EmpireTotals = {
    food: 0, industry: 0, research: 0, bcIncome: 0, maintenance: 0, population: 0, androids: 0, colonies: 0, outposts: 0,
  };
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
    t.androids += o.androids;
    t.colonies += 1;
  }
  return t;
}

export interface EmpireIncome {
  /** Taxes on population and industry and deposits, counted with colonies; trade goods are booked as built. */
  colonies: number;
  /** Surplus food sold. */
  foodSales: number;
  maintenance: number;
  /** Freighters in use and other empire-wide upkeep (the Dimensional Portal). */
  freighters: number;
  projects: number;
  salaries: number;
  commandOverage: number;
  /** Trade treaties (research treaties pay research, not BC). */
  treaties: number;
  net: number;
}

/**
 * Assimilation points a colony earns each turn (ASSIMILATION.pointsPerUnit
 * make one unit): set by the government or an Alien Management Center,
 * doubled for charismatic rulers and halved for repulsive ones.
 */
export function assimilationPoints(player: Player, colony: Colony): number {
  const amc = colony.buildings.map((id) => BUILDINGS_BY_ID[id]?.effects.alienManagement).find((x) => x);
  const turns = amc ? amc.assimilationTurns : government(player).assimilationTurns;
  let points = Math.floor(ASSIMILATION.pointsPerUnit / turns);
  const race = getRace(player.raceId);
  if (hasTrait(race, "charismatic")) points *= 2;
  else if (hasTrait(race, "repulsive")) points = Math.floor(points / 2);
  return Math.max(1, points);
}

/** Turns to assimilate one alien unit at a colony, on average (it may alternate, e.g. 7 and 8 for 7.5). */
export function assimilationTurns(player: Player, colony: Colony): number {
  return ASSIMILATION.pointsPerUnit / assimilationPoints(player, colony);
}

/**
 * Chance this turn that a colony's unassimilated aliens revolt: 1% each,
 * more on harder levels when a human rules a computer empire's people, and
 * halved by an Alien Management Center.
 */
export function revoltChance(colony: Colony, state?: GameState): number {
  const aliens = colony.aliens ?? 0;
  if (aliens <= 0) return 0;
  const amc = colony.buildings.map((id) => BUILDINGS_BY_ID[id]?.effects.alienManagement).find((x) => x);
  let chance = aliens * ASSIMILATION.revoltChancePerAlien;
  const owner = state?.players[colony.ownerId];
  const former = colony.formerOwnerId !== undefined ? state?.players[colony.formerOwnerId] : undefined;
  if (state && owner?.isHuman && former && !former.isHuman) {
    chance += ASSIMILATION.revoltChancePerDifficulty * (DIFFICULTY_ORDER.indexOf(state.settings.difficulty ?? "average") - 2);
  }
  return Math.max(0, chance * (amc ? amc.revoltMult : 1));
}
