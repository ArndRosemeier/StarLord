import { BUILDINGS_BY_ID, FIGHTER_GARRISON, type BuildingEffects } from "./data/buildings.js";
import {
  ANDROIDS, ARTIFACTS_RESEARCH, BLOCKADE_PRODUCTION, CYBERNETIC_FOOD, CYBERNETIC_INDUSTRY, FOOD_PER_POP, FREIGHTERS,
  MILITIA_PER_POP, MIN_OUTPUT_PER_UNIT, MORALE_FLOOR, RESEARCH_PER_SCIENTIST, SPECIAL_INCOME, TAX_BC_PER_INDUSTRY,
  TAX_PER_POP,
} from "./data/economy.js";
import { ASSIMILATION } from "./data/governments.js";
import {
  CLIMATES, INDUSTRY_PER_WORKER, POLLUTION_PER_EXCESS, POLLUTION_TOLERANCE_PER_SIZE, SIZE_FACTOR, SOILLESS, type Gravity,
  type PlanetType,
} from "./data/planets.js";
import { getRace, hasTrait, type RaceDef } from "./data/races.js";
import { findDesign } from "./designs.js";
import { isHostile } from "./diplomacy.js";
import { empireBonus, government, knows } from "./empire.js";
import type { AndroidCounts, Colony, GameState, LeaderSkills, Planet, Player, PlayerId } from "./types.js";

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

function hasEffect(buildings: string[], key: keyof BuildingEffects): boolean {
  return buildings.some((id) => !!BUILDINGS_BY_ID[id]?.effects[key]);
}

export function maxPopulation(planet: Planet, race: RaceDef, buildings: string[] = [], player?: Player): number {
  const climate = CLIMATES[planet.type];
  if (!climate.habitable) return 0;
  const size = SIZE_FACTOR[planet.size];
  let perSize = climate.popPerSize;
  if (hasTrait(race, "aquatic") && (planet.type === "ocean" || planet.type === "swamp")) perSize += 1;
  if (hasTrait(race, "tolerant") && climate.hostile) perSize += 1;
  if (hasTrait(race, "subterranean")) perSize += 1;
  let flat = sumEffect(buildings, "maxPopFlat");
  if (player) {
    const bonus = empireBonus(player);
    perSize += bonus.maxPopPerSize;
    flat += bonus.maxPopFlat;
  }
  return Math.max(1, Math.floor(perSize * size + flat));
}

/** Productivity multiplier for a race living at a gravity. */
export function gravityMultiplier(race: RaceDef | null, gravity: Gravity): number {
  const native: Gravity = race && hasTrait(race, "lowG") ? "low" : race && hasTrait(race, "highG") ? "heavy" : "normal";
  if (gravity === native) return 1;
  if (native === "heavy") return gravity === "normal" ? 1 : 0.75;
  if (native === "low") return gravity === "normal" ? 0.75 : 0.5;
  return gravity === "low" ? 0.75 : 0.5;
}

/** Whether farmers can grow anything on this planet. */
export function canFarm(planet: Planet, player?: Player): boolean {
  if (CLIMATES[planet.type].foodPerFarmer > 0) return true;
  return !!player && empireBonus(player).hostileFarming > 0;
}

/** Industry the planet absorbs before it pollutes; tolerant races never pollute. */
export function pollutionTolerance(planet: Planet, race: RaceDef, player?: Player): number {
  if (hasTrait(race, "tolerant")) return Infinity;
  const boost = player ? empireBonus(player).pollutionTolerance : 0;
  return SIZE_FACTOR[planet.size] * POLLUTION_TOLERANCE_PER_SIZE * (1 + boost);
}

/** Share of industry that counts toward pollution: each cleanup building multiplies it. */
export function pollutionFactor(buildings: string[]): number {
  if (hasEffect(buildings, "noPollution")) return 0;
  let f = 1;
  for (const id of buildings) f *= BUILDINGS_BY_ID[id]?.effects.pollutionFactor ?? 1;
  return f;
}

/** True while the empire's Capitol is lost and its government suffers for it. */
export function capitalLost(player: Player): boolean {
  return player.capitol === "lost" && government(player).capitalLossMorale > 0;
}

/** Buildings that sabotage, comets and bombs can destroy: everything but the Capitol. */
export function destructibleBuildings(colony: Colony): string[] {
  return colony.buildings.filter((b) => !BUILDINGS_BY_ID[b]?.effects.capitol);
}

/** A colony of another race than its ruler's counts as multi-racial. */
export function isMultiRacial(player: Player, colony: Colony): boolean {
  return colony.raceId !== player.raceId;
}

export function colonyMorale(player: Player, colony: Colony, turn: number, leader?: LeaderSkills): number {
  void turn;
  const gov = government(player);
  if (gov.noMorale) return 0;
  const b = colony.buildings;
  let morale = gov.morale + empireBonus(player).morale + sumEffect(b, "morale") + (leader?.morale ?? 0);
  if (gov.ungarrisonedPenalty && !hasEffect(b, "garrison")) morale -= gov.ungarrisonedPenalty;
  if (capitalLost(player)) morale -= gov.capitalLossMorale;
  if (isMultiRacial(player, colony) && !hasEffect(b, "alienManagement")) morale -= ASSIMILATION.multiRacePenalty;
  return Math.max(MORALE_FLOOR, morale);
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
  /** Multiplier on BC from this colony, also applied to its trade goods. */
  incomeMult: number;
  maintenance: number;
  growthK: number;
  troops: number;
  /** An enemy fleet sits unopposed in the system: production is halved and freighters can't get through. */
  blockaded: boolean;
}

export interface OutputContext {
  turn: number;
  leader?: LeaderSkills;
  blockaded?: boolean;
}

export function colonyOutput(state: GameState, colony: Colony): ColonyOutput {
  const planet = state.planets[colony.planetId]!;
  const player = state.players[colony.ownerId]!;
  return computeOutput(planet, player, colony, {
    turn: state.turn,
    leader: administratorSkills(state, planet.starId, colony.ownerId),
    blockaded: isBlockaded(state, colony),
  });
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
    Math.ceil(population(colony) * MILITIA_PER_POP);
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

  if (colony.outpost) {
    return {
      population: 0, androids: 0, maxPopulation: 0, morale: 0, aliens: 0, foodProduced: 0, foodEaten: 0, foodReplicated: 0,
      foodNet: 0, industryGross: 0, pollution: 0, industry: 0, taxes: 0, research: 0, bc: 0, incomeMult: 1, maintenance: 0,
      growthK: 0, troops, blockaded: false,
    };
  }

  const climate = CLIMATES[planet.type];
  const grav = hasEffect(b, "gravityFix") ? 1 : gravityMultiplier(race, planet.gravity);
  // Androids have no race, so a normal race's gravity applies to them.
  const androidGrav = hasEffect(b, "gravityFix") ? 1 : gravityMultiplier(null, planet.gravity);
  const morale = colonyMorale(player, colony, ctx.turn, lead);
  const moraleMult = Math.max(0, 1 + morale / 100);
  const aliens = Math.min(colony.aliens ?? 0, pop);
  // Each unassimilated unit works at half its normal rate.
  const effort = pop > 0 ? 1 - (aliens / pop) * (1 - ASSIMILATION.alienOutput) : 1;
  const lithovore = hasTrait(race, "lithovore");
  const cyber = hasTrait(race, "cybernetic");
  const unit = (v: number, g: number) => Math.max(MIN_OUTPUT_PER_UNIT, v * g);

  // Food
  const farmable = canFarm(planet, player);
  const soil = !SOILLESS.includes(planet.type);
  const farmBuildings = b.reduce((s, id) => {
    const e = BUILDINGS_BY_ID[id]?.effects;
    return s + (e?.foodPerFarmer && (soil || !e.needsSoil) ? e.foodPerFarmer : 0);
  }, 0);
  const landFood = climate.foodPerFarmer + bonus.foodPerFarmer + farmBuildings;
  const perFarmer = farmable ? unit(landFood + race.picks.farming, grav) : 0;
  const androidFood = (farmable ? Math.max(0, landFood) * androidGrav : 0) + ANDROIDS.bonus;
  const foodProduced =
    (colony.farmers * perFarmer * effort + sumEffect(b, "foodFlat")) * gov.foodMult * moraleMult * (1 + (lead.food ?? 0) / 100) +
    andr.farmers * androidFood * gov.foodMult;
  const foodEaten = lithovore ? 0 : (cyber ? CYBERNETIC_FOOD : FOOD_PER_POP) * pop;

  // Industry
  const landIndustry = INDUSTRY_PER_WORKER[planet.minerals] + bonus.industryPerWorker + sumEffect(b, "industryPerWorker");
  const perWorker = unit(landIndustry + race.picks.industry, grav);
  const byMinerals = b.reduce((s, id) => s + (BUILDINGS_BY_ID[id]?.effects.industryByMinerals?.[planet.minerals] ?? 0), 0);
  const blockade = ctx.blockaded ? BLOCKADE_PRODUCTION : 1;
  const leadIndustry = 1 + (lead.industry ?? 0) / 100;
  const industryGross =
    ((colony.workers * perWorker * effort + sumEffect(b, "industryFlat") + byMinerals) * gov.industryMult * moraleMult * leadIndustry +
      andr.workers * (Math.max(0, landIndustry) * androidGrav + ANDROIDS.bonus) * gov.industryMult) * blockade;
  // Recycled industry never pollutes.
  const recycled = (pop + nAndroids) * sumEffect(b, "industryPerPop") * gov.industryMult * moraleMult * leadIndustry * blockade;
  const tolerance = pollutionTolerance(planet, race, player);
  const polluting = industryGross * pollutionFactor(b);
  const pollution = Math.min(industryGross, Math.max(0, polluting - tolerance) * POLLUTION_PER_EXCESS);
  const upkeep = (cyber ? pop * CYBERNETIC_INDUSTRY : 0) + nAndroids * ANDROIDS.industryUpkeep;
  let net = Math.max(0, industryGross + recycled - pollution - upkeep);

  // Food Replicators cover the colony's own shortfall from its industry.
  let foodReplicated = 0;
  const replicator = sumEffect(b, "foodReplicator");
  if (replicator > 0 && foodProduced < foodEaten) {
    foodReplicated = Math.min(foodEaten - foodProduced, net / replicator);
    net -= foodReplicated * replicator;
  }
  const taxes = net * player.taxRate;
  const industry = net - taxes;

  // Research
  const artifacts = planet.special === "artifacts" ? ARTIFACTS_RESEARCH : 0;
  const landResearch = RESEARCH_PER_SCIENTIST + bonus.researchPerScientist + sumEffect(b, "researchPerScientist") + artifacts;
  const perScientist = unit(landResearch + race.picks.science, grav);
  const research =
    (colony.scientists * perScientist * effort + sumEffect(b, "researchFlat")) * gov.researchMult * moraleMult * (1 + (lead.research ?? 0) / 100) +
    andr.scientists * (Math.max(0, landResearch) * androidGrav + ANDROIDS.bonus) * gov.researchMult;

  // Money: androids pay no tax; morale scales what people pay, industry taxes already carry it.
  const special = planet.special === "gold" ? SPECIAL_INCOME.gold : planet.special === "gems" ? SPECIAL_INCOME.gems : 0;
  const perPop = Math.max(0, TAX_PER_POP + race.picks.money + bonus.bcPerPop);
  const incomeMult = gov.bcMult * (1 + sumEffect(b, "bcMult")) * (1 + (lead.bc ?? 0) / 100);
  const bc = ((pop * effort * perPop + sumEffect(b, "bcFlat") + special) * moraleMult + taxes * TAX_BC_PER_INDUSTRY) * incomeMult;
  const maintenance = colonyMaintenance(planet, b);
  const bioMax = Math.max(0, max - nAndroids);

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
    incomeMult,
    maintenance,
    growthK: growthPerTurn(pop, bioMax, race, b, bonus.growth),
    troops,
    blockaded: !!ctx.blockaded,
  };
}

/** Building upkeep, raised on harsh climates. */
export function colonyMaintenance(planet: Planet, buildings: string[]): number {
  const base = buildings.reduce((sum, id) => sum + (BUILDINGS_BY_ID[id]?.maintenance ?? 0), 0);
  return base * (1 + CLIMATES[planet.type].maintenancePenalty);
}

/** MoO2-style logistic growth in thousands per turn. */
export function growthPerTurn(pop: number, max: number, race: RaceDef, buildings: string[], techGrowth = 0): number {
  if (pop <= 0 || pop >= max) return 0;
  const base = Math.sqrt((2000 * pop * (max - pop)) / max);
  const mult = Math.max(0.25, 1 + race.picks.growth + techGrowth);
  return Math.floor(base * mult + sumEffect(buildings, "growthK"));
}

/** Fighters a colony's garrison launches: the best type the owner knows. */
export function fighterGarrison(player: Player, colony: Colony): { kind: "interceptor" | "bomber" | "heavyFighter"; count: number } | null {
  const squadrons = colony.buildings.reduce((n, id) => n + (BUILDINGS_BY_ID[id]?.effects.defense?.fighters ? 1 : 0), 0);
  if (squadrons === 0) return null;
  if (knows(player, "heavyFighterBays")) return { kind: "heavyFighter", count: FIGHTER_GARRISON.heavyFighters * squadrons };
  if (knows(player, "bomberBays")) return { kind: "bomber", count: FIGHTER_GARRISON.bombers * squadrons };
  return { kind: "interceptor", count: FIGHTER_GARRISON.interceptors * squadrons };
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
  const traders = hasTrait(getRace(player.raceId), "fantasticTraders");
  const sold = Math.max(0, supply);
  return {
    freighters,
    movingColonists,
    carryingFood,
    free: Math.max(0, freighters - movingColonists - carryingFood),
    needed,
    delivered,
    shortfall,
    sold,
    saleBC: sold * (traders ? FREIGHTERS.traderFoodPrice : FREIGHTERS.foodPrice),
    upkeep: (carryingFood + movingColonists) * FREIGHTERS.upkeepInUse,
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
  net: number;
}

/** Turns to assimilate one alien unit at a colony. */
export function assimilationTurns(player: Player, colony: Colony): number {
  const amc = colony.buildings.map((id) => BUILDINGS_BY_ID[id]?.effects.alienManagement).find((x) => x);
  let turns = amc ? amc.assimilationTurns : government(player).assimilationTurns;
  const race = getRace(player.raceId);
  if (hasTrait(race, "charismatic")) turns *= ASSIMILATION.charismaticMult;
  if (hasTrait(race, "repulsive")) turns *= ASSIMILATION.repulsiveMult;
  return Math.max(1, Math.round(turns));
}

/** Chance this turn that a colony's unassimilated aliens revolt. */
export function revoltChance(colony: Colony): number {
  const aliens = colony.aliens ?? 0;
  if (aliens <= 0) return 0;
  const amc = colony.buildings.map((id) => BUILDINGS_BY_ID[id]?.effects.alienManagement).find((x) => x);
  const base = Math.min(ASSIMILATION.revoltChanceMax, aliens * ASSIMILATION.revoltChancePerAlien);
  return base * (amc ? amc.revoltMult : 1);
}
