/**
 * The MoO2 tech tree. Eight categories, each a single chain of fields; every
 * field has a fixed research cost and offers one to four applications.
 *
 * - General fields (the cheapest, most basic ones) give every race all of
 *   their applications.
 * - Any other field gives a creative race every application, a normal race the
 *   one it picked, and an uncreative race one at random.
 * - Once the accumulated research reaches a field's cost, each turn has a
 *   chance of a breakthrough; it is certain at twice the cost.
 * - When a category's chain is finished, its hyper-advanced field can be
 *   researched again and again; each level improves miniaturization in that
 *   category and adds to the score.
 *
 * Most applications work through other tables: buildings, ship components,
 * hulls and projects name the tech they require. Applications that change
 * empire-wide numbers list them in `bonus`.
 */

export type TechField =
  | "construction" | "power" | "chemistry" | "sociology"
  | "computers" | "biology" | "physics" | "forceFields";

export const TECH_FIELDS: TechField[] = [
  "construction", "power", "chemistry", "sociology", "computers", "biology", "physics", "forceFields",
];

export const FIELD_NAMES: Record<TechField, string> = {
  construction: "Construction", power: "Power", chemistry: "Chemistry", sociology: "Sociology",
  computers: "Computers", biology: "Biology", physics: "Physics", forceFields: "Force Fields",
};

/** Research rule numbers. */
export const RESEARCH = {
  /** Research can never cost more than this multiple of a field's base cost. */
  maxCostMult: 2,
  /**
   * Chance of a breakthrough on the first turn the base cost is reached. It
   * rises linearly to certainty at `maxCostMult` times the cost. The original
   * only promises "a good chance every turn"; the curve is our reading.
   */
  breakthroughStartChance: 0.25,
  /** Cost of every hyper-advanced field level. */
  hyperCost: 15000,
  /** Score for each hyper-advanced level. */
  hyperScore: 5,
  /** Race pick points granted by Evolutionary Mutation. */
  mutationPicks: 4,
} as const;

/** Empire-wide numbers a tech can raise. */
export interface EmpireBonus {
  foodPerFarmer?: number;
  industryPerWorker?: number;
  researchPerScientist?: number;
  maxPopPerSize?: number;
  growth?: number;
  /** Ground combat levels; one level is +10 on the MoO2 troop rating, like the race pick. */
  groundCombat?: number;
  /** Spy roll levels; one level is +10 on every spy roll, like the race pick. */
  spying?: number;
  scanRange?: number;
  bcPerPop?: number;
  morale?: number;
  shipAttack?: number;
  shipDefense?: number;
  commandPoints?: number;
  /** Extra command points for every orbital base (star base, battlestation, star fortress). */
  commandPointsPerBase?: number;
  /** Raises every planet's pollution tolerance by this fraction (1 doubles it). */
  pollutionTolerance?: number;
  /** Extra max pop for every colony, flat. */
  maxPopFlat?: number;
  /** Farming becomes possible on worlds without soil (any value above 0). */
  hostileFarming?: number;
  /** Spy defense bonus. */
  security?: number;
  /** Diplomatic points added to every deal this empire offers. */
  diplomacy?: number;
}

export interface TechTier {
  id: string;
  name: string;
  field: TechField;
  /** MoO2 tech level (1 for the general fields, up to 17; 18 for hyper-advanced fields). */
  level: number;
  /** Position in the category's chain, from 0. Hyper-advanced fields come last. */
  rung: number;
  cost: number;
  techs: string[];
  /** Field that must be researched first, if any. */
  prev: string | null;
  next: string | null;
  /** Everyone learns every application of a general field. */
  general: boolean;
  /** Repeatable hyper-advanced field; offers no applications. */
  hyper: boolean;
}

export interface TechDef {
  id: string;
  name: string;
  description: string;
  bonus?: EmpireBonus;
  /**
   * Bonuses in the same group don't stack: only the best value of each number
   * counts (rifles, battle suits, armor, scanners, base communications...).
   */
  group?: string;
  /** Extra bonus that only applies under some governments. */
  governmentBonus?: { governments: string[]; bonus: EmpireBonus };
  /** Advanced government this application turns your government into. */
  government?: string;
}

type Row = [id: string, name: string, level: number, cost: number, techs: string[], general?: boolean];

const chain = (field: TechField, hyperId: string, hyperName: string, rows: Row[]): TechTier[] => {
  const out: TechTier[] = rows.map(([id, name, level, cost, techs, general], rung) => ({
    id, name, field, level, rung, cost, techs, general: !!general, hyper: false,
    prev: rung > 0 ? rows[rung - 1]![0] : null,
    next: rows[rung + 1]?.[0] ?? hyperId,
  }));
  out.push({
    id: hyperId, name: hyperName, field, level: 18, rung: rows.length, cost: RESEARCH.hyperCost, techs: [],
    prev: rows.at(-1)![0], next: null, general: false, hyper: true,
  });
  return out;
};

/** Fields per category, costs and levels as in the original. */
export const TECH_TIERS: TechTier[] = [
  ...chain("construction", "hyperConstruction", "Hyper-Advanced Construction", [
    ["engineering", "Engineering", 1, 50, ["colonyBase", "marineBarracks", "starBase"], true],
    ["advancedEngineering", "Advanced Engineering", 2, 80, ["antiMissileRockets", "fighterBays", "reinforcedHull"]],
    ["advancedConstruction", "Advanced Construction", 3, 150, ["automatedFactory", "heavyArmor", "missileBase"]],
    ["capsuleConstruction", "Capsule Construction", 4, 250, ["battlePods", "survivalPods", "troopPods"]],
    ["astroEngineering", "Astro Engineering", 5, 400, ["armorBarracks", "fighterGarrison", "spacePort"]],
    ["robotics", "Robotics", 6, 650, ["battlestation", "poweredArmor", "roboMinerPlant"]],
    ["servoMechanics", "Servo Mechanics", 7, 900, ["advancedDamageControl", "assaultShuttles", "fastMissileRacks"]],
    ["astroConstruction", "Astro Construction", 8, 1150, ["battleoids", "groundBatteries", "titanHull"]],
    ["advancedManufacturing", "Advanced Manufacturing", 9, 1500, ["artificialPlanet", "automatedRepairUnit", "recyclotron"]],
    ["advancedRobotics", "Advanced Robotics", 10, 2000, ["bomberBays", "roboticFactory"]],
    ["tectonicEngineering", "Tectonic Engineering", 12, 3500, ["coreWasteDump", "deepCoreMining"]],
    ["superscalarConstruction", "Superscalar Construction", 14, 6000, ["advancedCityPlanning", "heavyFighterBays", "starFortress"]],
    ["planetoidConstruction", "Planetoid Construction", 15, 7500, ["artemisSystemNet", "doomStarHull"]],
  ]),
  ...chain("power", "hyperPower", "Hyper-Advanced Power", [
    ["nuclearFission", "Nuclear Fission", 1, 50, ["freighters", "nuclearBomb", "nuclearDrive"], true],
    ["coldFusion", "Cold Fusion", 2, 80, ["colonyShip", "outpostShip", "transport"], true],
    ["advancedFusion", "Advanced Fusion", 4, 250, ["augmentedEngines", "fusionBomb", "fusionDrive"]],
    ["ionFission", "Ion Fission", 7, 900, ["ionDrive", "ionPulseCannon", "shieldCapacitors"]],
    ["antimatterFission", "Anti-Matter Fission", 10, 2000, ["antimatterBomb", "antimatterDrive", "antimatterTorpedo"]],
    ["matterEnergyConversion", "Matter-Energy Conversion", 11, 2750, ["foodReplicators", "transporters"]],
    ["highEnergyDistribution", "High Energy Distribution", 12, 3500, ["energyAbsorber", "highEnergyFocus", "megafluxers"]],
    ["hyperDimensionalFission", "Hyper-Dimensional Fission", 13, 4500, ["hyperDrive", "hyperXCapacitors", "protonTorpedo"]],
    ["interphasedFission", "Interphased Fission", 16, 10000, ["interphasedDrive", "neutroniumBomb", "plasmaTorpedo"]],
  ]),
  ...chain("chemistry", "hyperChemistry", "Hyper-Advanced Chemistry", [
    ["chemistry", "Chemistry", 1, 50, ["extendedFuelTanks", "nuclearMissile", "standardFuelCells", "titaniumArmor"], true],
    ["advancedMetallurgy", "Advanced Metallurgy", 4, 250, ["deuteriumFuelCells", "tritaniumArmor"]],
    ["advancedChemistry", "Advanced Chemistry", 6, 650, ["merculiteMissile", "pollutionProcessor"]],
    ["molecularCompression", "Molecular Compression", 8, 1150, ["atmosphericRenewer", "iridiumFuelCells", "pulsonMissile"]],
    ["nanoTechnology", "Nano Technology", 10, 2000, ["microliteConstruction", "nanoDisassemblers", "zortriumArmor"]],
    ["molecularManipulation", "Molecular Manipulation", 13, 4500, ["neutroniumArmor", "uridiumFuelCells", "zeonMissile"]],
    ["molecularControl", "Molecular Control", 16, 10000, ["adamantiumArmor", "thoriumFuelCells"]],
  ]),
  ...chain("sociology", "hyperSociology", "Hyper-Advanced Sociology", [
    ["militaryTactics", "Military Tactics", 3, 150, ["spaceAcademy"]],
    ["xenoRelations", "Xeno Relations", 6, 650, ["alienManagementCenter", "xenoPsychology"]],
    ["macroEconomics", "Macro Economics", 8, 1150, ["planetaryStockExchange"]],
    ["teachingMethods", "Teaching Methods", 10, 2000, ["astroUniversity"]],
    ["advancedGovernments", "Advanced Governments", 13, 4500, ["confederation", "federation", "galacticUnification", "imperium"]],
    ["galacticEconomics", "Galactic Economics", 14, 6000, ["galacticCurrencyExchange"]],
  ]),
  ...chain("computers", "hyperComputers", "Hyper-Advanced Computers", [
    ["electronics", "Electronics", 1, 50, ["electronicComputer"], true],
    ["optronics", "Optronics", 3, 150, ["dauntlessGuidance", "optronicComputer", "researchLab"]],
    ["artificialIntelligence", "Artificial Intelligence", 5, 400, ["neuralScanner", "scoutLab", "securityStations"]],
    ["positronics", "Positronics", 7, 900, ["holoSimulator", "positronicComputer", "supercomputer"]],
    ["artificialConsciousness", "Artificial Consciousness", 9, 1500, ["cyberSecurityLink", "emissionsGuidance", "rangemasterUnit"]],
    ["cybertronics", "Cybertronics", 11, 2750, ["autolab", "cyberneticComputer", "structuralAnalyzer"]],
    ["cybertechnics", "Cybertechnics", 12, 3500, ["androidFarmers", "androidScientists", "androidWorkers"]],
    ["galacticNetworking", "Galactic Networking", 13, 4500, ["galacticNetwork", "virtualRealityNetwork"]],
    ["moleculartronics", "Moleculartronics", 14, 6000, ["achillesTargetingUnit", "moleculartronicComputer", "pleasureDome"]],
  ]),
  ...chain("biology", "hyperBiology", "Hyper-Advanced Biology", [
    ["astroBiology", "Astro Biology", 2, 80, ["biospheres", "hydroponicFarm"]],
    ["advancedBiology", "Advanced Biology", 5, 400, ["cloningCenter", "deathSpores", "soilEnrichment"]],
    ["geneticEngineering", "Genetic Engineering", 7, 900, ["microbiotics", "telepathicTraining"]],
    ["geneticMutations", "Genetic Mutations", 8, 1150, ["terraforming"]],
    ["macroGenetics", "Macro Genetics", 9, 1500, ["subterraneanFarms", "weatherControl"]],
    ["evolutionaryGenetics", "Evolutionary Genetics", 11, 2750, ["heightenedIntelligence", "psionicsTraining"]],
    ["artificialLife", "Artificial Life", 13, 4500, ["bioTerminator", "universalAntidote"]],
    ["transGenetics", "Trans Genetics", 15, 7500, ["biomorphicFungi", "evolutionaryMutation", "gaiaTransformation"]],
  ]),
  ...chain("physics", "hyperPhysics", "Hyper-Advanced Physics", [
    ["physics", "Physics", 1, 50, ["laserCannon", "laserRifle", "spaceScanner"], true],
    ["fusionPhysics", "Fusion Physics", 3, 150, ["fusionBeam", "fusionRifle"]],
    ["tachyonPhysics", "Tachyon Physics", 4, 250, ["battleScanner", "tachyonCommunications", "tachyonScanner"]],
    ["neutrinoPhysics", "Neutrino Physics", 7, 900, ["neutronBlaster", "neutronScanner"]],
    ["artificialGravity", "Artificial Gravity", 8, 1150, ["gravitonBeam", "gravityGenerator", "tractorBeam"]],
    ["subspacePhysics", "Subspace Physics", 9, 1500, ["jumpGate", "subspaceCommunications"]],
    ["multiPhasedPhysics", "Multi-Phased Physics", 10, 2000, ["multiPhasedShields", "phasor", "phasorRifle"]],
    ["plasmaPhysics", "Plasma Physics", 12, 3500, ["plasmaCannon", "plasmaRifle", "plasmaWeb"]],
    ["multiDimensionalPhysics", "Multi-Dimensional Physics", 13, 4500, ["dimensionalPortal", "disruptorCannon"]],
    ["hyperDimensionalPhysics", "Hyper-Dimensional Physics", 14, 6000, ["hyperspaceCommunications", "maulerDevice", "sensors"]],
    ["temporalPhysics", "Temporal Physics", 17, 15000, ["starGate", "stellarConverter", "timeWarpFacilitator"]],
  ]),
  ...chain("forceFields", "hyperFields", "Hyper-Advanced Force Fields", [
    ["advancedMagnetism", "Advanced Magnetism", 4, 250, ["classIShield", "ecmJammer", "massDriver"]],
    ["graviticFields", "Gravitic Fields", 6, 650, ["antiGravHarness", "gyroDestabilizer", "inertialStabilizer"]],
    ["magnetoGravitics", "Magneto Gravitics", 7, 900, ["classIIIShield", "planetaryRadiationShield", "warpDissipator"]],
    ["electromagneticRefraction", "Electromagnetic Refraction", 9, 1500, ["personalShield", "stealthField", "stealthSuit"]],
    ["warpFields", "Warp Fields", 10, 2000, ["lightningField", "pulsar", "warpInterdictor"]],
    ["subspaceFields", "Subspace Fields", 11, 2750, ["classVShield", "gaussCannon", "multiWaveEcm"]],
    ["distortionFields", "Distortion Fields", 12, 3500, ["cloakingDevice", "hardShields", "stasisField"]],
    ["quantumFields", "Quantum Fields", 13, 4500, ["classVIIShield", "planetaryFluxShield", "wideAreaJammer"]],
    ["transwarpFields", "Transwarp Fields", 15, 7500, ["displacementDevice", "inertialNullifier", "subspaceTeleporter"]],
    ["temporalFields", "Temporal Fields", 17, 15000, ["classXShield", "phasingCloak", "planetaryBarrierShield"]],
  ]),
];

/** Buildings that count as orbital bases for the communication techs' command points. */
export const ORBITAL_BASES = ["starBase", "battlestation", "starFortress"];

/** Applications every empire knows from the start without a field: the original's "Starting Tech". */
export const STARTING_TECH_APPS = ["capitol", "pulseRifle", "spyNetwork"];

/**
 * Xenon technology: never researched, only taken from the raiders' home or
 * the guardian of Orion.
 */
export const XENON_TECHS = [
  "blackHoleGenerator", "damperField", "deathRay", "particleBeam", "phaseShifter", "quantumDetonator",
  "reflectionField", "spatialCompressor", "xentroniumArmor",
];

/**
 * Descriptions and empire bonuses. Techs not listed here unlock something in
 * another table and get a generated name.
 */
const DETAILS: Record<string, Omit<TechDef, "id" | "name"> & { name?: string }> = {
  // Starting tech
  capitol: { description: "Seat of your government on the homeworld; it can be rebuilt if lost." },
  pulseRifle: { description: "Basic troop weapon every army starts with." },
  spyNetwork: { name: "Spy Network", description: "Lets colonies train spies." },
  // Construction
  colonyBase: { description: "Settles another planet in the same system." },
  starBase: { description: "Orbital base: defends the colony and adds command points." },
  marineBarracks: { description: "Trains marines to defend the colony." },
  fighterGarrison: { description: "Colonies can build a Fighter Garrison housing planet-based fighter squadrons." },
  survivalPods: { description: "Lets leaders escape when their ship is destroyed." },
  fastMissileRacks: { description: "Ships can fire two missile volleys in one turn." },
  heavyFighterBays: { description: "Carriers launch heavy fighters armed with beams and bombs." },
  titanHull: { name: "Titan Construction", description: "Allows Titan hulls." },
  doomStarHull: { name: "Doom Star Construction", description: "Allows Doom Star hulls, the largest ships." },
  artificialPlanet: { name: "Planet Construction", description: "Asteroid belts and gas giants can be turned into planets." },
  advancedCityPlanning: { description: "+5 max pop on every colony.", bonus: { maxPopFlat: 5 } },
  deepCoreMining: { description: "Colonies can build Deep Core Mining: +15 industry and +3 per worker." },
  coreWasteDump: { name: "Core Waste Dumps", description: "Colonies can build Core Waste Dumps, which end their pollution." },
  poweredArmor: { description: "Battle suits: +10 troop rating (best suit only).", group: "suit", bonus: { groundCombat: 1 } },
  battleoids: { description: "Robot fighting vehicles: +10 troop rating.", bonus: { groundCombat: 1 } },
  // Power
  freighters: { description: "Colonies can build Freighter Fleets to carry food and colonists between your colonies." },
  colonyShip: { description: "Ships that settle planets in other systems." },
  outpostShip: { description: "Ships that place outposts on any free planet." },
  transport: { description: "Troop ships for invading planets." },
  nuclearDrive: { description: "Ships move 2 parsecs per turn." },
  fusionDrive: { description: "Ships move 3 parsecs per turn." },
  ionDrive: { description: "Ships move 4 parsecs per turn." },
  antimatterDrive: { description: "Ships move 5 parsecs per turn." },
  hyperDrive: { description: "Ships move 6 parsecs per turn." },
  interphasedDrive: { description: "Ships move 7 parsecs per turn." },
  shieldCapacitors: { description: "Ship shields recharge faster." },
  transporters: { description: "Ships beam marines and bombs over a distance." },
  foodReplicators: { description: "Colonies can build Food Replicators, turning 2 industry into 1 food when short." },
  hyperXCapacitors: { name: "Hyper-X Capacitors", description: "Ship beam weapons can fire twice in a turn." },
  // Chemistry
  extendedFuelTanks: { description: "Ships equipped with them get +50% range." },
  standardFuelCells: { description: "Ships can travel 4 parsecs from your colonies." },
  deuteriumFuelCells: { description: "Fuel range 6 parsecs." },
  iridiumFuelCells: { description: "Fuel range 9 parsecs." },
  uridiumFuelCells: { description: "Fuel range 12 parsecs." },
  thoriumFuelCells: { description: "Unlimited fuel range." },
  titaniumArmor: { description: "The standard ship armor." },
  tritaniumArmor: { description: "Ship armor; +10 troop rating (best armor only).", group: "armor", bonus: { groundCombat: 1 } },
  zortriumArmor: { description: "Ship armor; +15 troop rating (best armor only).", group: "armor", bonus: { groundCombat: 1.5 } },
  neutroniumArmor: { description: "Ship armor; +20 troop rating (best armor only).", group: "armor", bonus: { groundCombat: 2 } },
  adamantiumArmor: { description: "Ship armor; +25 troop rating (best armor only).", group: "armor", bonus: { groundCombat: 2.5 } },
  xentroniumArmor: { description: "Xenon ship armor; +30 troop rating (best armor only).", group: "armor", bonus: { groundCombat: 3 } },
  microliteConstruction: { description: "+1 industry per worker.", bonus: { industryPerWorker: 1 } },
  nanoDisassemblers: { description: "Every planet's pollution tolerance is doubled.", bonus: { pollutionTolerance: 1 } },
  // Sociology
  xenoPsychology: { description: "+30 diplomatic points on every deal you offer.", bonus: { diplomacy: 30 } },
  confederation: { description: "Turns a feudal government into a Confederation.", government: "confederation" },
  federation: { description: "Turns a democracy into a Federation.", government: "federation" },
  galacticUnification: { description: "Turns a unification into Galactic Unification.", government: "galacticUnification" },
  imperium: { description: "Turns a dictatorship into an Imperium.", government: "imperium" },
  galacticCurrencyExchange: { description: "Colonies can build a Galactic Currency Exchange: +50% BC from every source." },
  // Computers
  neuralScanner: { description: "+10 on all spy rolls.", bonus: { spying: 1 } },
  cyberSecurityLink: { name: "Cyber-Security Link", description: "+10 on all spy rolls.", bonus: { spying: 1 } },
  scoutLab: { description: "Ships produce research; bonus against monsters." },
  dauntlessGuidance: { name: "Dauntless Guidance System", description: "Missiles find a new target when theirs is destroyed." },
  cyberneticComputer: { name: "Cybertronic Computer", description: "" },
  androidFarmers: { description: "Colonies can build robot farmers: +3 food over a normal farmer, 1 industry upkeep, no food." },
  androidScientists: { description: "Colonies can build robot scientists: +3 research over a normal scientist, 1 industry upkeep, no food." },
  androidWorkers: { description: "Colonies can build robot workers: +3 industry over a normal worker, 1 industry upkeep, no food." },
  galacticNetwork: { name: "Galactic Cybernet", description: "" },
  virtualRealityNetwork: { description: "+20% morale.", bonus: { morale: 20 } },
  pleasureDome: { description: "Colonies can build a Pleasure Dome: +30% morale." },
  // Biology
  microbiotics: { description: "+25% population growth (not cumulative with Universal Antidote).", group: "antidote", bonus: { growth: 0.25 } },
  telepathicTraining: { description: "+5 on all spy rolls.", bonus: { spying: 0.5 } },
  heightenedIntelligence: { description: "+1 research per scientist.", bonus: { researchPerScientist: 1 } },
  psionicsTraining: {
    name: "Psionics", description: "+10 on all spy rolls; +10% morale under feudal, confederation, dictatorship and imperium.",
    bonus: { spying: 1 },
    governmentBonus: { governments: ["feudal", "confederation", "dictatorship", "imperium"], bonus: { morale: 10 } },
  },
  bioTerminator: { name: "Bio-Terminator", description: "Biological weapon that kills colonists." },
  universalAntidote: { description: "+50% population growth (not cumulative with Microbiotics).", group: "antidote", bonus: { growth: 0.5 } },
  biomorphicFungi: { description: "+1 food per farmer, and farming becomes possible on worlds without soil.", bonus: { foodPerFarmer: 1, hostileFarming: 1 } },
  evolutionaryMutation: { description: "Gives 4 race pick points to improve your race." },
  terraforming: { description: "Colonies can terraform their planet one climate step at a time." },
  gaiaTransformation: { description: "Terran planets can be turned into Gaia worlds." },
  // Physics
  laserRifle: { description: "+5 troop rating (best rifle only).", group: "rifle", bonus: { groundCombat: 0.5 } },
  fusionRifle: { description: "+10 troop rating (best rifle only).", group: "rifle", bonus: { groundCombat: 1 } },
  phasorRifle: { description: "+20 troop rating (best rifle only).", group: "rifle", bonus: { groundCombat: 2 } },
  plasmaRifle: { description: "+30 troop rating (best rifle only).", group: "rifle", bonus: { groundCombat: 3 } },
  spaceScanner: { description: "Scanners see 2 parsecs around your colonies and ships." },
  tachyonScanner: { description: "Scanner range 3 parsecs.", group: "scanner", bonus: { scanRange: 1 } },
  neutronScanner: { description: "Scanner range 5 parsecs.", group: "scanner", bonus: { scanRange: 3 } },
  sensors: { description: "Scanner range 8 parsecs.", group: "scanner", bonus: { scanRange: 6 } },
  tachyonCommunications: { description: "+1 command point per orbital base.", group: "comm", bonus: { commandPointsPerBase: 1 } },
  subspaceCommunications: { name: "Sub-Space Communications", description: "+2 command points per orbital base.", group: "comm", bonus: { commandPointsPerBase: 2 } },
  hyperspaceCommunications: { description: "+3 command points per orbital base.", group: "comm", bonus: { commandPointsPerBase: 3 } },
  jumpGate: { description: "+1 parsec of fleet speed." },
  multiPhasedShields: { description: "Ship shields are 50% stronger." },
  maulerDevice: { description: "Ship weapon: a bolt that always hits." },
  starGate: { description: "Instant travel between your colonies." },
  timeWarpFacilitator: { description: "Ships take an extra turn in combat." },
  dimensionalPortal: { description: "Build a portal to strike at the raiders' home dimension." },
  stellarConverter: { description: "Ship weapon that burns through any shield." },
  // Force fields
  ecmJammer: { name: "ECM Jammer", description: "" },
  multiWaveEcm: { name: "Multi-Wave ECM Jammer", description: "" },
  antiGravHarness: { name: "Anti-Grav Harness", description: "+10 troop rating.", bonus: { groundCombat: 1 } },
  personalShield: { description: "Battle suits: +20 troop rating (best suit only).", group: "suit", bonus: { groundCombat: 2 } },
  stealthSuit: { description: "+10 on all spy rolls.", bonus: { spying: 1 } },
  warpInterdictor: { description: "Colonies can build a Warp Interdictor, slowing hostile fleets near the system." },
  hardShields: { description: "Shields stop 3 more damage and work in nebulae." },
  stasisField: { description: "Freezes an enemy ship in combat." },
  wideAreaJammer: { description: "Missile evasion for the ship and its fleet." },
  inertialNullifier: { description: "+100 beam defense." },
  subspaceTeleporter: { name: "Sub-Space Teleporter", description: "Ships jump across the battlefield." },
  phasingCloak: { description: "Ships slip out of reach in combat for a while." },
  pulsar: { description: "Damages every ship next to the equipped ship." },
  gyroDestabilizer: { description: "Spins enemy ships, damaging their structure." },
};

/** "laserCannon" -> "Laser Cannon", "classIIIShield" -> "Class III Shield". */
const titleCase = (id: string) =>
  id.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/([A-Z])([A-Z][a-z])/g, "$1 $2").replace(/^./, (c) => c.toUpperCase()).replace(/-/g, " ");

const define = (id: string): TechDef => {
  const d = DETAILS[id];
  return { description: "", ...d, id, name: d?.name ?? titleCase(id) };
};

const ALL_APPS = [...STARTING_TECH_APPS, ...TECH_TIERS.flatMap((t) => t.techs), ...XENON_TECHS];

export const TECHS: Record<string, TechDef> = Object.fromEntries(ALL_APPS.map((id) => [id, define(id)]));

export const TIERS_BY_ID: Record<string, TechTier> = Object.fromEntries(TECH_TIERS.map((t) => [t.id, t]));

/** The researchable field each application belongs to. */
export const TIER_OF_TECH: Record<string, TechTier> = Object.fromEntries(
  TECH_TIERS.flatMap((t) => t.techs.map((id) => [id, t] as const)),
);

/**
 * Fields known at the start: the original's "average civilization" start,
 * which has everything needed for interstellar flight: all general fields.
 */
export const STARTING_TIERS: string[] = TECH_TIERS.filter((t) => t.general).map((t) => t.id);
export const STARTING_TECHS: string[] = [
  ...STARTING_TECH_APPS,
  ...STARTING_TIERS.flatMap((id) => TIERS_BY_ID[id]!.techs),
];

/** Field that must be researched before this one (the previous rung in its category). */
export function previousTier(tier: TechTier): TechTier | null {
  return tier.prev ? TIERS_BY_ID[tier.prev]! : null;
}

export function nextTier(tier: TechTier): TechTier | null {
  return tier.next ? TIERS_BY_ID[tier.next]! : null;
}

/** The hyper-advanced field of each category. */
export const HYPER_TIERS: Record<TechField, TechTier> = Object.fromEntries(
  TECH_TIERS.filter((t) => t.hyper).map((t) => [t.field, t]),
) as Record<TechField, TechTier>;

export function emptyHyperLevels(): Record<TechField, number> {
  return Object.fromEntries(TECH_FIELDS.map((f) => [f, 0])) as Record<TechField, number>;
}
