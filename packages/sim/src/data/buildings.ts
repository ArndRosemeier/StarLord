/** Colony buildings. Effects are declarative so the economy code stays generic. */

export interface BuildingEffects {
  foodFlat?: number;
  foodPerFarmer?: number;
  industryFlat?: number;
  industryPerWorker?: number;
  researchFlat?: number;
  researchPerScientist?: number;
  maxPopBySize?: number;
  bcFlat?: number;
  /** Fraction added to the colony's BC income. */
  bcMult?: number;
  /** Percent morale on this colony. */
  morale?: number;
  /** Fraction of this colony's pollution removed. */
  pollutionCleanup?: number;
  /** Extra population growth in thousands per turn. */
  growthK?: number;
  /** Defending ground troops. */
  troops?: number;
  /** Empire command points. */
  commandPoints?: number;
  /** Spy defense, empire-wide. */
  security?: number;
  /** Removes the gravity penalty for every race. */
  gravityFix?: boolean;
  /** Planetary defense, see `PlanetDefense`. */
  defense?: PlanetDefense;
  /** Parsecs added to scanner range around this colony. */
  scanRange?: number;
}

export interface PlanetDefense {
  /** Orbital station that fights as its own unit, fitted with the owner's best weapons. */
  station?: "starBase" | "battlestation" | "starFortress";
  /** Ground installation on the planet unit: 300 space of the best beams or missiles. */
  installation?: "groundBatteries" | "missileBase";
  /** Space mines that strike attacking ships as a battle opens. */
  mines?: boolean;
  /** Damage taken off every hit on the planet. */
  shield?: number;
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

export const BUILDINGS: BuildingDef[] = [
  // Defense and military
  { id: "marineBarracks", name: "Marine Barracks", cost: 60, maintenance: 1, requires: "marineBarracks",
    effects: { troops: 4, morale: 10 }, description: "+4 defending troops. Dictatorships need one for full morale." },
  { id: "armorBarracks", name: "Armor Barracks", cost: 150, maintenance: 2, requires: "armorBarracks",
    effects: { troops: 6 }, description: "+6 armored defending troops." },
  { id: "starBase", name: "Star Base", cost: 400, maintenance: 2, requires: "starBase",
    effects: { commandPoints: 1, scanRange: 2, defense: { station: "starBase" } }, description: "Armed orbital station and star dock: ships larger than destroyers can be built here. +1 command point, +2 parsec scanner range." },
  { id: "battlestation", name: "Battlestation", cost: 1000, maintenance: 3, requires: "battlestation", replaces: ["starBase"],
    effects: { commandPoints: 2, scanRange: 4, defense: { station: "battlestation" } }, description: "Heavier orbital station and star dock. +2 command points, +4 parsec scanner range, +10 beam attack for your ships fighting here." },
  { id: "starFortress", name: "Star Fortress", cost: 2500, maintenance: 4, requires: "starFortress", replaces: ["starBase", "battlestation"],
    effects: { commandPoints: 3, scanRange: 6, defense: { station: "starFortress" } }, description: "Massive orbital fortress and star dock. +3 command points, +6 parsec scanner range, +20 beam attack and defense for your ships fighting here." },
  { id: "missileBase", name: "Planetary Missile Base", cost: 120, maintenance: 2, requires: "missileBase",
    effects: { defense: { installation: "missileBase" } }, description: "300 space of your best missiles on the planet, never out of ammunition." },
  { id: "groundBatteries", name: "Ground Batteries", cost: 200, maintenance: 2, requires: "groundBatteries",
    effects: { defense: { installation: "groundBatteries" } }, description: "300 space of heavy-mount and point-defense versions of your best beam on the planet." },
  { id: "artemisSystemNet", name: "Artemis System Net", cost: 1000, maintenance: 5, requires: "artemisSystemNet",
    effects: { defense: { mines: true } }, description: "Space mines that strike attacking ships as a battle opens; bigger ships are hit more often and harder." },
  { id: "radiationShield", name: "Planetary Radiation Shield", cost: 80, maintenance: 1, requires: "planetaryRadiationShield",
    effects: { defense: { shield: 5 } }, description: "Planetary shield blocking 5 damage per hit." },
  { id: "fluxShield", name: "Planetary Flux Shield", cost: 200, maintenance: 3, requires: "planetaryFluxShield", replaces: ["radiationShield"],
    effects: { defense: { shield: 10 } }, description: "Planetary shield blocking 10 damage per hit." },
  { id: "barrierShield", name: "Planetary Barrier Shield", cost: 500, maintenance: 5, requires: "planetaryBarrierShield", replaces: ["radiationShield", "fluxShield"],
    effects: { defense: { shield: 20 } }, description: "Planetary shield blocking 20 damage per hit." },
  { id: "spaceAcademy", name: "Space Academy", cost: 75, maintenance: 1, requires: "spaceAcademy",
    effects: { commandPoints: 1 }, description: "Trains officers. +1 command point." },
  { id: "securityStations", name: "Security Stations", cost: 100, maintenance: 1, requires: "securityStations",
    effects: { security: 2 }, description: "+2 spy defense." },

  // Food and population
  { id: "hydroponicFarm", name: "Hydroponic Farm", cost: 60, maintenance: 1, requires: "hydroponicFarm",
    effects: { foodFlat: 2 }, description: "+2 food." },
  { id: "subterraneanFarms", name: "Subterranean Farms", cost: 150, maintenance: 2, requires: "subterraneanFarms",
    effects: { foodFlat: 4 }, description: "+4 food." },
  { id: "soilEnrichment", name: "Soil Enrichment", cost: 80, maintenance: 1, requires: "soilEnrichment",
    effects: { foodPerFarmer: 1 }, description: "+1 food per farmer." },
  { id: "weatherController", name: "Weather Controller", cost: 200, maintenance: 3, requires: "weatherControl",
    effects: { foodPerFarmer: 1 }, description: "+1 food per farmer." },
  { id: "biospheres", name: "Biospheres", cost: 60, maintenance: 1, requires: "biospheres",
    effects: { maxPopBySize: 0.67 }, description: "Raises max population by about 2 on a medium planet." },
  { id: "cloningCenter", name: "Cloning Center", cost: 100, maintenance: 2, requires: "cloningCenter",
    effects: { growthK: 100 }, description: "+100k population growth per turn." },
  { id: "gravityGenerator", name: "Gravity Generator", cost: 120, maintenance: 2, requires: "gravityGenerator",
    effects: { gravityFix: true }, description: "Removes gravity penalties." },

  // Industry
  { id: "automatedFactory", name: "Automated Factory", cost: 60, maintenance: 1, requires: "automatedFactory",
    effects: { industryFlat: 5, industryPerWorker: 1 }, description: "+5 industry and +1 per worker." },
  { id: "roboMinerPlant", name: "Robo Miner Plant", cost: 150, maintenance: 2, requires: "roboMinerPlant",
    effects: { industryFlat: 10, industryPerWorker: 2 }, description: "+10 industry and +2 per worker." },
  { id: "roboticFactory", name: "Robotic Factory", cost: 200, maintenance: 3, requires: "roboticFactory",
    effects: { industryFlat: 15, industryPerWorker: 2 }, description: "+15 industry and +2 per worker." },
  { id: "recyclotron", name: "Recyclotron", cost: 200, maintenance: 3, requires: "recyclotron",
    effects: { industryPerWorker: 1, pollutionCleanup: 0.25 }, description: "+1 industry per worker, less pollution." },
  { id: "pollutionProcessor", name: "Pollution Processor", cost: 80, maintenance: 1, requires: "pollutionProcessor",
    effects: { pollutionCleanup: 0.5 }, description: "Halves pollution." },
  { id: "atmosphericRenewer", name: "Atmospheric Renewer", cost: 150, maintenance: 3, requires: "atmosphericRenewer",
    effects: { pollutionCleanup: 0.75 }, description: "Removes three quarters of pollution." },

  // Research
  { id: "researchLab", name: "Research Laboratory", cost: 60, maintenance: 1, requires: "researchLab",
    effects: { researchFlat: 5, researchPerScientist: 1 }, description: "+5 research and +1 per scientist." },
  { id: "supercomputer", name: "Planetary Supercomputer", cost: 150, maintenance: 2, requires: "supercomputer",
    effects: { researchFlat: 10, researchPerScientist: 2 }, description: "+10 research and +2 per scientist." },
  { id: "autolab", name: "Autolab", cost: 200, maintenance: 3, requires: "autolab",
    effects: { researchFlat: 30 }, description: "+30 research." },
  { id: "galacticCybernet", name: "Galactic Cybernet", cost: 250, maintenance: 3, requires: "galacticNetwork",
    effects: { researchFlat: 15, researchPerScientist: 3 }, description: "+15 research and +3 per scientist." },
  { id: "astroUniversity", name: "Astro University", cost: 200, maintenance: 3, requires: "astroUniversity",
    effects: { researchPerScientist: 1, foodPerFarmer: 1, industryPerWorker: 1 }, description: "+1 output for every job." },

  // Money and morale
  { id: "spacePort", name: "Spaceport", cost: 80, maintenance: 1, requires: "spacePort",
    effects: { bcMult: 0.5 }, description: "+50% BC from this colony." },
  { id: "planetaryStockExchange", name: "Planetary Stock Exchange", cost: 150, maintenance: 3, requires: "planetaryStockExchange",
    effects: { bcMult: 1 }, description: "+100% BC from this colony." },
  { id: "holoSimulator", name: "Holo Simulator", cost: 120, maintenance: 1, requires: "holoSimulator",
    effects: { morale: 20 }, description: "+20% morale." },
  { id: "alienManagementCenter", name: "Alien Management Center", cost: 150, maintenance: 3, requires: "alienManagementCenter",
    effects: { morale: 15 }, description: "+15% morale." },
];

export const BUILDINGS_BY_ID: Record<string, BuildingDef> = Object.fromEntries(BUILDINGS.map((b) => [b.id, b]));

/** One-off or repeatable works a colony can build instead of a building. */
export interface ProjectDef {
  id: string;
  name: string;
  requires: string | null;
  description: string;
}

export const PROJECTS: ProjectDef[] = [
  { id: "colonyBase", name: "Colony Base", requires: "colonyBase", description: "Settles another planet in this star system with 1 pop." },
  { id: "outpostBase", name: "Outpost Base", requires: "outpostShip", description: "Places an outpost on a free planet in this system." },
  { id: "terraform", name: "Terraforming", requires: "terraforming", description: "Improves this planet's climate one step. Cost rises each time." },
  { id: "gaiaTransform", name: "Gaia Transformation", requires: "gaiaTransformation", description: "Turns a terran planet into a Gaia world." },
  { id: "artificialPlanet", name: "Artificial Planet", requires: "artificialPlanet", description: "Turns an asteroid belt or gas giant in this system into a barren planet." },
  { id: "dimensionalPortal", name: "Dimensional Portal", requires: "dimensionalPortal", description: "Opens a way to the raiders' home dimension." },
  { id: "spy", name: "Train Spy", requires: null, description: "Trains a spy for espionage or counter-espionage." },
  { id: "housing", name: "Housing", requires: null, description: "Turns industry into extra population growth." },
];

export const PROJECTS_BY_ID: Record<string, ProjectDef> = Object.fromEntries(PROJECTS.map((p) => [p.id, p]));

export const PROJECT_COSTS = {
  colonyBase: 200,
  outpostBase: 80,
  terraformBase: 250,
  gaiaTransform: 500,
  artificialPlanet: 400,
  dimensionalPortal: 1500,
  spy: 25,
} as const;

/** Climate after one terraforming step. */
export const TERRAFORM_STEP: Record<string, string> = {
  radiated: "barren", toxic: "barren", inferno: "barren",
  barren: "tundra", desert: "arid", tundra: "arid", arid: "terran", swamp: "terran", ocean: "terran",
};
