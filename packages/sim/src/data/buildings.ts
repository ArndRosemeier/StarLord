import type { Minerals } from "./planets.js";

/** Colony buildings. Effects are declarative so the economy code stays generic. */

export interface BuildingEffects {
  foodFlat?: number;
  foodPerFarmer?: number;
  /** The per-farmer bonus needs real soil: no effect on barren, radiated or toxic worlds. */
  needsSoil?: boolean;
  industryFlat?: number;
  industryPerWorker?: number;
  /** Flat industry by the planet's mineral class. */
  industryByMinerals?: Record<Minerals, number>;
  /** Industry from every population unit whatever its job; it never pollutes. */
  industryPerPop?: number;
  researchFlat?: number;
  researchPerScientist?: number;
  /** Flat max population. */
  maxPopFlat?: number;
  bcFlat?: number;
  /** Fraction added to all BC this colony earns: population taxes, industry taxes and trade goods. */
  bcMult?: number;
  /** Percent morale on this colony. */
  morale?: number;
  /** Share of industry that counts toward pollution; several multiply (½ × ¼ = ⅛). */
  pollutionFactor?: number;
  /** No pollution at all on this colony. */
  noPollution?: boolean;
  /** Turns this much industry into 1 food whenever the colony itself is short. */
  foodReplicator?: number;
  /** Extra population growth in thousands per turn. */
  growthK?: number;
  /** Ground troops present as soon as the building is finished. */
  troops?: number;
  /** Trains more troops over time, see `TroopTraining`. */
  training?: TroopTraining;
  /** Removes the government's morale penalty for colonies without barracks. */
  garrison?: boolean;
  /** Empire command points. */
  commandPoints?: number;
  /** Spy defense, empire-wide. */
  security?: number;
  /** Removes the gravity penalty for every race. */
  gravityFix?: boolean;
  /** Planetary defense, see `PlanetDefense`. */
  defense?: PlanetDefense;
  /** Removes the multi-race morale penalty, sets assimilation to this many turns and scales the revolt chance. */
  alienManagement?: { assimilationTurns: number; revoltMult: number };
  /** Seat of government; losing it hurts morale everywhere (see GovernmentDef.capitalLossMorale). */
  capitol?: boolean;
  /** Ships built here start this many crew levels higher; the owner's ships in orbit here gain this much more XP every turn. */
  crew?: { startLevels: number; xpPerTurn: number };
  /** Hostile fleets within this many parsecs of the star crawl at `INTERDICTED_SPEED`. */
  interdictRadius?: number;
  /** Ground troops and biological weapons can't get through. */
  blocksInvasion?: boolean;
  /** A radiated world under this shield becomes barren. */
  radiatedToBarren?: boolean;
  /** Parsecs added to scanner range around this colony. */
  scanRange?: number;
}

export interface TroopTraining {
  kind: "marines" | "tanks";
  /** One new unit every this many turns. */
  every: number;
  /**
   * Trains while the troops number less than this share of the colony's
   * population (at least 1); above the same share of the planet's size base
   * (`SIZE_POP_BASE`) one unit leaves each turn. Warlords double the share.
   */
  popShare: number;
}

export interface PlanetDefense {
  /** Orbital station that fights as its own unit, fitted with the owner's best weapons. */
  station?: "starBase" | "battlestation" | "starFortress";
  /** Ground installation on the planet unit: 300 space of the best beams or missiles, or a stellar converter. */
  installation?: "groundBatteries" | "missileBase" | "stellarConverter";
  /** Space mines that strike attacking ships as a battle opens. */
  mines?: boolean;
  /** Damage taken off every hit on the planet. */
  shield?: number;
  /**
   * Interceptors based on the planet. Once Bomber Bays or Heavy Fighter Bays
   * are known they are replaced by fewer, stronger craft: see
   * `FIGHTER_GARRISON` here and `fighterGarrison` in the economy module.
   */
  fighters?: number;
}

export interface BuildingDef {
  id: string;
  name: string;
  cost: number;
  /** BC per turn. */
  maintenance: number;
  /** Tech that unlocks it; null means available from the start. */
  requires: string | null;
  /** Only one of these per colony may exist in a family; newer replaces older. */
  replaces?: string[];
  effects: BuildingEffects;
  description: string;
}

/**
 * A Fighter Garrison, as the original fits it: two bay slots of 5 Fighter Bays,
 * or of 2 Heavy Fighter Bays once those are known, else of 3 Bomber Bays once
 * those are known. Every bay launches a squadron of 4 craft, once; the garrison
 * sends up fresh craft every few combat turns.
 */
export const FIGHTER_GARRISON = {
  slots: 2,
  bays: { interceptor: 5, bomber: 3, heavyFighter: 2 },
  /** Craft in the air at once: 2 slots x bays x 4 per squadron. */
  interceptors: 40,
  bombers: 24,
  heavyFighters: 16,
  /** Lost fighters are replaced after this many combat rounds. */
  replenishRounds: 10,
} as const;

/** Fleet speed in parsecs per turn inside an enemy Warp Interdictor's field. */
export const INTERDICTED_SPEED = 1;

export const BUILDINGS: BuildingDef[] = [
  // Government
  { id: "capitol", name: "Capitol", cost: 200, maintenance: 0, requires: "capitol",
    effects: { capitol: true }, description: "Seat of your government. It can't be built, only rebuilt after it is lost; until then morale suffers everywhere, by how much depends on the government." },

  // Defense and military
  { id: "marineBarracks", name: "Marine Barracks", cost: 60, maintenance: 1, requires: "marineBarracks",
    effects: { troops: 4, training: { kind: "marines", every: 5, popShare: 0.5 }, garrison: true },
    description: "Starts with 4 marines and trains one more every 5 turns, up to half the colony's population (warlords: all of it). Above half the planet's size base (5 per size step) one marine leaves each turn. Troop ships can only be built here. Lifts the feudal and dictatorial morale penalty." },
  { id: "armorBarracks", name: "Armor Barracks", cost: 150, maintenance: 2, requires: "armorBarracks",
    effects: { troops: 2, training: { kind: "tanks", every: 5, popShare: 0.25 }, garrison: true },
    description: "Starts with 2 tank battalions and adds one every 5 turns, up to a quarter of the colony's population (warlords: half). Above a quarter of the planet's size base one battalion leaves each turn. Lifts the feudal and dictatorial morale penalty." },
  { id: "starBase", name: "Star Base", cost: 400, maintenance: 2, requires: "starBase",
    effects: { commandPoints: 1, scanRange: 2, defense: { station: "starBase" } }, description: "Armed orbital station and star dock: ships larger than destroyers can be built here. +1 command point, +2 parsec scanner range." },
  { id: "battlestation", name: "Battlestation", cost: 1000, maintenance: 3, requires: "battlestation", replaces: ["starBase"],
    effects: { commandPoints: 2, scanRange: 4, defense: { station: "battlestation" } }, description: "Heavier orbital station and star dock. +2 command points, +4 parsec scanner range, +10 beam attack for your ships fighting here." },
  { id: "starFortress", name: "Star Fortress", cost: 2500, maintenance: 4, requires: "starFortress", replaces: ["starBase", "battlestation"],
    effects: { commandPoints: 3, scanRange: 6, defense: { station: "starFortress" } }, description: "Massive orbital fortress and star dock. +3 command points, +6 parsec scanner range, +20 beam attack for your ships fighting here." },
  { id: "missileBase", name: "Planetary Missile Base", cost: 120, maintenance: 2, requires: "missileBase",
    effects: { defense: { installation: "missileBase" } }, description: "300 space of your best missiles in 5-shot racks, with ECCM and the Fast and Armored refinements you know; 125 shots each." },
  { id: "groundBatteries", name: "Ground Batteries", cost: 200, maintenance: 2, requires: "groundBatteries",
    effects: { defense: { installation: "groundBatteries" } }, description: "225 space of your best beam as heavy mounts with every refinement you know, and 75 space of your best point-defense beam. They fire all round." },
  { id: "planetaryStellarConverter", name: "Planetary Stellar Converter", cost: 1000, maintenance: 6, requires: "stellarConverter",
    effects: { defense: { installation: "stellarConverter" } }, description: "A stellar converter on the planet: 400 damage to every shield of a ship in orbit each combat turn, at any range." },
  { id: "fighterGarrison", name: "Fighter Garrison", cost: 150, maintenance: 2, requires: "fighterGarrison",
    effects: { defense: { fighters: FIGHTER_GARRISON.interceptors } },
    description: "Planet-based squadrons: 40 interceptors, or 24 bombers or 16 heavy fighters once those are known. Fresh craft go up every 10 combat turns." },
  { id: "artemisSystemNet", name: "Artemis System Net", cost: 1000, maintenance: 5, requires: "artemisSystemNet",
    effects: { defense: { mines: true } }, description: "Space mines that strike attacking ships as a battle opens for 100–500 damage less shields; the bigger the ship, the likelier: 20% of frigates up to every doom star." },
  { id: "radiationShield", name: "Planetary Radiation Shield", cost: 80, maintenance: 1, requires: "planetaryRadiationShield",
    effects: { defense: { shield: 5 }, radiatedToBarren: true }, description: "Blocks 5 damage per hit against the planet. A radiated world under it becomes barren." },
  { id: "fluxShield", name: "Planetary Flux Shield", cost: 200, maintenance: 3, requires: "planetaryFluxShield", replaces: ["radiationShield"],
    effects: { defense: { shield: 10 }, radiatedToBarren: true }, description: "Blocks 10 damage per hit against the planet. A radiated world under it becomes barren." },
  { id: "barrierShield", name: "Planetary Barrier Shield", cost: 500, maintenance: 5, requires: "planetaryBarrierShield", replaces: ["radiationShield", "fluxShield"],
    effects: { defense: { shield: 20 }, radiatedToBarren: true, blocksInvasion: true },
    description: "Blocks 20 damage per hit; no troops or biological weapons get through. A radiated world under it becomes barren." },
  { id: "warpInterdictor", name: "Warp Interdictor", cost: 300, maintenance: 3, requires: "warpInterdictor",
    effects: { interdictRadius: 2 }, description: "Hostile fleets within 2 parsecs of the system move only 1 parsec per turn." },
  { id: "spaceAcademy", name: "Space Academy", cost: 100, maintenance: 2, requires: "spaceAcademy",
    effects: { crew: { startLevels: 1, xpPerTurn: 1 } }, description: "Ships built here start one crew level higher, and crews in the system train every turn." },
  // Food and population
  { id: "hydroponicFarm", name: "Hydroponic Farm", cost: 60, maintenance: 2, requires: "hydroponicFarm",
    effects: { foodFlat: 2 }, description: "+2 food." },
  { id: "subterraneanFarms", name: "Subterranean Farms", cost: 150, maintenance: 4, requires: "subterraneanFarms",
    effects: { foodFlat: 4 }, description: "+4 food." },
  { id: "soilEnrichment", name: "Soil Enrichment", cost: 120, maintenance: 0, requires: "soilEnrichment",
    effects: { foodPerFarmer: 1, needsSoil: true }, description: "+1 food per farmer. Useless on barren, radiated and toxic worlds." },
  { id: "weatherController", name: "Weather Controller", cost: 200, maintenance: 3, requires: "weatherControl",
    effects: { foodPerFarmer: 2 }, description: "+2 food per farmer." },
  { id: "foodReplicators", name: "Food Replicators", cost: 200, maintenance: 10, requires: "foodReplicators",
    effects: { foodReplicator: 2 }, description: "Whenever the colony is short of food, turns 2 industry into 1 food." },
  { id: "biospheres", name: "Biospheres", cost: 60, maintenance: 1, requires: "biospheres",
    effects: { maxPopFlat: 2 }, description: "+2 max population." },
  { id: "cloningCenter", name: "Cloning Center", cost: 100, maintenance: 2, requires: "cloningCenter",
    effects: { growthK: 100 }, description: "+100k population growth per turn." },
  { id: "gravityGenerator", name: "Gravity Generator", cost: 120, maintenance: 2, requires: "gravityGenerator",
    effects: { gravityFix: true }, description: "Removes gravity penalties." },

  // Industry
  { id: "automatedFactory", name: "Automated Factory", cost: 60, maintenance: 1, requires: "automatedFactory",
    effects: { industryFlat: 5, industryPerWorker: 1 }, description: "+5 industry and +1 per worker." },
  { id: "roboMinerPlant", name: "Robo Miner Plant", cost: 150, maintenance: 2, requires: "roboMinerPlant",
    effects: { industryFlat: 10, industryPerWorker: 2 }, description: "+10 industry and +2 per worker." },
  { id: "deepCoreMining", name: "Deep Core Mining", cost: 250, maintenance: 3, requires: "deepCoreMining",
    effects: { industryFlat: 15, industryPerWorker: 3 }, description: "+15 industry and +3 per worker." },
  { id: "roboticFactory", name: "Robotic Factory", cost: 200, maintenance: 3, requires: "roboticFactory",
    effects: { industryByMinerals: { ultraPoor: 5, poor: 8, abundant: 10, rich: 15, ultraRich: 20 } },
    description: "Flat industry by the planet's minerals: +5 ultra poor, +8 poor, +10 abundant, +15 rich, +20 ultra rich." },
  { id: "recyclotron", name: "Recyclotron", cost: 200, maintenance: 3, requires: "recyclotron",
    effects: { industryPerPop: 1 }, description: "+1 industry from every population unit whatever its job. This industry never pollutes." },
  { id: "pollutionProcessor", name: "Pollution Processor", cost: 80, maintenance: 1, requires: "pollutionProcessor",
    effects: { pollutionFactor: 0.5 }, description: "Only half of the colony's industry counts toward pollution." },
  { id: "atmosphericRenewer", name: "Atmospheric Renewer", cost: 150, maintenance: 3, requires: "atmosphericRenewer",
    effects: { pollutionFactor: 0.25 }, description: "Only a quarter of the colony's industry counts toward pollution; an eighth together with a Pollution Processor." },
  { id: "coreWasteDumps", name: "Core Waste Dumps", cost: 200, maintenance: 8, requires: "coreWasteDump",
    effects: { noPollution: true }, description: "No pollution at this colony." },

  // Research
  { id: "researchLab", name: "Research Laboratory", cost: 60, maintenance: 1, requires: "researchLab",
    effects: { researchFlat: 5, researchPerScientist: 1 }, description: "+5 research and +1 per scientist." },
  { id: "supercomputer", name: "Planetary Supercomputer", cost: 150, maintenance: 2, requires: "supercomputer",
    effects: { researchFlat: 10, researchPerScientist: 2 }, description: "+10 research and +2 per scientist." },
  { id: "autolab", name: "Autolab", cost: 200, maintenance: 3, requires: "autolab",
    effects: { researchFlat: 30 }, description: "+30 research." },
  { id: "galacticCybernet", name: "Galactic Cybernet", cost: 250, maintenance: 3, requires: "galacticNetwork",
    effects: { researchFlat: 15, researchPerScientist: 3 }, description: "+15 research and +3 per scientist." },
  { id: "astroUniversity", name: "Astro University", cost: 200, maintenance: 4, requires: "astroUniversity",
    effects: { researchPerScientist: 1, foodPerFarmer: 1, industryPerWorker: 1 }, description: "+1 output for every job." },

  // Money and morale
  { id: "spacePort", name: "Spaceport", cost: 80, maintenance: 1, requires: "spacePort",
    effects: { bcMult: 0.5 }, description: "+50% BC from every source at this colony." },
  { id: "planetaryStockExchange", name: "Planetary Stock Exchange", cost: 150, maintenance: 2, requires: "planetaryStockExchange",
    effects: { bcMult: 1 }, description: "+100% BC from every source at this colony." },
  { id: "holoSimulator", name: "Holo Simulator", cost: 120, maintenance: 1, requires: "holoSimulator",
    effects: { morale: 20 }, description: "+20% morale." },
  { id: "pleasureDome", name: "Pleasure Dome", cost: 250, maintenance: 3, requires: "pleasureDome",
    effects: { morale: 30 }, description: "+30% morale; adds to a Holo Simulator." },
  { id: "alienManagementCenter", name: "Alien Management Center", cost: 60, maintenance: 1, requires: "alienManagementCenter",
    effects: { alienManagement: { assimilationTurns: 2, revoltMult: 0.5 } },
    description: "Conquered people assimilate at one unit every 2 turns whatever the government, revolt half as often, and the multi-race morale penalty is lifted." },
];

export const BUILDINGS_BY_ID: Record<string, BuildingDef> = Object.fromEntries(BUILDINGS.map((b) => [b.id, b]));

/** One-off or repeatable works a colony can build instead of a building. */
export interface ProjectDef {
  id: string;
  name: string;
  requires: string | null;
  description: string;
}

export type AndroidJob = "farmers" | "workers" | "scientists";

export const PROJECTS: ProjectDef[] = [
  { id: "colonyBase", name: "Colony Base", requires: "colonyBase", description: "Settles another planet in this star system with 1 pop." },
  { id: "outpostBase", name: "Outpost Base", requires: "outpostShip", description: "Places an outpost on a free planet in this system." },
  { id: "freighterFleet", name: "Freighter Fleet", requires: "freighters", description: "Five freighters. Each carries 1 food a turn between your colonies; a whole fleet moves 1 colonist." },
  { id: "androidFarmers", name: "Android Farmers", requires: "androidFarmers", description: "A robot farmer: the planet's food per farmer +3, eats no food, costs 1 industry a turn, ignores morale and pays no tax." },
  { id: "androidWorkers", name: "Android Workers", requires: "androidWorkers", description: "A robot worker: the planet's industry per worker +3, eats no food, costs 1 industry a turn, ignores morale and pays no tax." },
  { id: "androidScientists", name: "Android Scientists", requires: "androidScientists", description: "A robot scientist: 3 research more than a normal scientist, eats no food, costs 1 industry a turn, ignores morale and pays no tax." },
  { id: "terraform", name: "Terraforming", requires: "terraforming", description: "Improves this planet's climate one step. Cost rises each time." },
  { id: "gaiaTransform", name: "Gaia Transformation", requires: "gaiaTransformation", description: "Turns a terran planet into a Gaia world." },
  { id: "artificialPlanet", name: "Artificial Planet", requires: "artificialPlanet", description: "Turns an asteroid belt in this system into a large barren planet, or a gas giant into a huge one; normal gravity, abundant minerals." },
  { id: "dimensionalPortal", name: "Dimensional Portal", requires: "dimensionalPortal", description: "Fleets in this system can cross to the raiders' home dimension and back. 2 BC upkeep." },
  { id: "spy", name: "Train Spy", requires: null, description: "Trains a spy for espionage or counter-espionage." },
  { id: "housing", name: "Housing", requires: null, description: "Turns industry into extra population growth." },
];

export const PROJECTS_BY_ID: Record<string, ProjectDef> = Object.fromEntries(PROJECTS.map((p) => [p.id, p]));

/** Android projects and the job each android does. */
export const ANDROID_PROJECTS: Record<string, AndroidJob> = {
  androidFarmers: "farmers",
  androidWorkers: "workers",
  androidScientists: "scientists",
};

/**
 * Project costs. Freighter Fleet 50, each android 50 and a spy 100 come from
 * the original's item cost routine; the Outpost Base is ours.
 */
export const PROJECT_COSTS = {
  colonyBase: 200,
  outpostBase: 80,
  freighterFleet: 50,
  android: 50,
  terraformBase: 250,
  gaiaTransform: 500,
  artificialPlanet: 800,
  dimensionalPortal: 500,
  spy: 100,
} as const;

/**
 * Share of its cost a finished Colony Base, Outpost Base or Artificial Planet
 * pays back when no planet is left to use it on. Our number: the original
 * never lets such a base finish without a target. Half matches its other
 * forced sales (see BANKRUPTCY).
 */
export const BASE_SCRAP_REFUND = 0.5;

/** BC upkeep per turn of one-off projects that stay in place. */
export const PROJECT_UPKEEP = {
  dimensionalPortal: 2,
} as const;

/** Climates one terraforming step can lead to; when there are two, the result is random. */
export const TERRAFORM_STEP: Record<string, string[]> = {
  barren: ["desert", "tundra"],
  desert: ["arid"],
  tundra: ["swamp"],
  arid: ["terran"],
  swamp: ["terran"],
  ocean: ["terran"],
};

/** What an Artificial Planet becomes, by the body it is built from. */
export const ARTIFICIAL_PLANET = {
  asteroids: "large",
  gasGiant: "huge",
  type: "barren",
  minerals: "abundant",
  gravity: "normal",
} as const;

/**
 * Debt forces buildings to be sold, as in the original: first those with
 * upkeep, then any (never the Capitol), always the one of lowest worth first,
 * where worth is the cost times the multiplier below. Each sale pays back
 * `refund` of the cost; computer players also get their difficulty index
 * (0 Tutor .. 4 Impossible) in BC.
 */
export const BANKRUPTCY = {
  refund: 0.5,
  /** Worth multipliers; buildings not listed are worth their cost. */
  worth: {
    automatedFactory: 8, biospheres: 8, deepCoreMining: 7, hydroponicFarm: 6, gravityGenerator: 4,
  } as Record<string, number>,
  /** Holo Simulator and Pleasure Dome, except under governments without morale. */
  moraleWorth: 7,
  /** A Marine or Armor Barracks that is the colony's only barracks, under governments with the garrison penalty. */
  soleBarracksWorth: 8,
} as const;
