/**
 * Research follows MoO2: eight fields, each a ladder of tiers. Researching a
 * tier grants one tech of your choice from it (creative races get all of them,
 * uncreative races get one at random). Tier 0 of each field is known from the
 * start.
 *
 * Most techs work through other tables: buildings, ship components, hulls and
 * projects name the tech they require. Techs that change empire-wide numbers
 * list them in `bonus`.
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

/** Empire-wide numbers a tech can raise. */
export interface EmpireBonus {
  foodPerFarmer?: number;
  industryPerWorker?: number;
  researchPerScientist?: number;
  maxPopPerSize?: number;
  growth?: number;
  groundCombat?: number;
  spying?: number;
  scanRange?: number;
  bcPerPop?: number;
  morale?: number;
  shipAttack?: number;
  shipDefense?: number;
  commandPoints?: number;
  /** Fraction of pollution removed, cumulative. */
  pollutionCleanup?: number;
  /** Extra max pop for every colony, flat. */
  maxPopFlat?: number;
  /** Food no longer needed per pop (e.g. replicators make industry into food). */
  freeFood?: number;
  /** Spy defense bonus. */
  security?: number;
}

export interface TechTier {
  id: string;
  name: string;
  field: TechField;
  /** Position in the field's ladder; 0 is known from the start. */
  level: number;
  cost: number;
  techs: string[];
}

export interface TechDef {
  id: string;
  name: string;
  description: string;
  bonus?: EmpireBonus;
}

/** MoO2 research costs by ladder position. */
const COSTS = [0, 80, 150, 250, 400, 650, 900, 1150, 1500, 2000, 2750, 3500, 4500, 6000, 7500, 10000, 15000];

const ladder = (field: TechField, rows: [id: string, name: string, techs: string[]][]): TechTier[] =>
  rows.map(([id, name, techs], level) => ({ id, name, field, level, cost: COSTS[level] ?? 20000, techs }));

export const TECH_TIERS: TechTier[] = [
  ...ladder("construction", [
    ["engineering", "Engineering", ["colonyBase", "starBase", "marineBarracks"]],
    ["advancedEngineering", "Advanced Engineering", ["antiMissileRockets", "fighterBays", "reinforcedHull"]],
    ["advancedConstruction", "Advanced Construction", ["automatedFactory", "heavyArmor", "missileBase"]],
    ["capsuleConstruction", "Capsule Construction", ["battlePods", "troopPods", "outpostShip"]],
    ["astroEngineering", "Astro Engineering", ["spacePort", "armorBarracks", "destroyerHull"]],
    ["robotics", "Robotics", ["roboMinerPlant", "battlestation", "poweredArmor"]],
    ["servoMechanics", "Servo Mechanics", ["cruiserHull", "advancedDamageControl", "assaultShuttles"]],
    ["astroConstruction", "Astro Construction", ["battleshipHull", "groundBatteries", "battleoids"]],
    ["advancedManufacturing", "Advanced Manufacturing", ["recyclotron", "automatedRepairUnit", "artificialPlanet"]],
    ["advancedRobotics", "Advanced Robotics", ["roboticFactory", "bomberBays"]],
    ["tectonicEngineering", "Tectonic Engineering", ["deepCoreMining", "coreWasteDump"]],
    ["superscalarConstruction", "Superscalar Construction", ["titanHull", "starFortress", "advancedCityPlanning"]],
    ["planetoidConstruction", "Planetoid Construction", ["doomStarHull", "artemisSystemNet"]],
  ]),
  ...ladder("power", [
    ["nuclearFission", "Nuclear Fission", ["nuclearDrive", "nuclearBomb", "freighters"]],
    ["coldFusion", "Cold Fusion", ["fusionDrive", "fusionBomb"]],
    ["advancedFusion", "Advanced Fusion", ["augmentedEngines", "fusionRifle"]],
    ["ionFission", "Ion Fission", ["ionDrive", "ionPulseCannon", "shieldCapacitors"]],
    ["fusionSynthesis", "Fusion Synthesis", ["powerPlant"]],
    ["antimatterFission", "Anti-Matter Fission", ["antimatterDrive", "antimatterBomb", "antimatterTorpedo"]],
    ["matterEnergyConversion", "Matter-Energy Conversion", ["transporters", "foodReplicators"]],
    ["highEnergyDistribution", "High Energy Distribution", ["highEnergyFocus", "energyAbsorber", "megafluxers"]],
    ["hyperDimensionalFission", "Hyper-Dimensional Fission", ["hyperDrive", "protonTorpedo"]],
    ["interphasedFission", "Interphased Fission", ["interphasedDrive", "neutroniumBomb", "plasmaTorpedo"]],
  ]),
  ...ladder("chemistry", [
    ["chemistry", "Chemistry", ["nuclearMissile", "titaniumArmor", "standardFuelCells"]],
    ["advancedMetallurgy", "Advanced Metallurgy", ["deuteriumFuelCells", "tritaniumArmor"]],
    ["advancedChemistry", "Advanced Chemistry", ["merculiteMissile", "pollutionProcessor"]],
    ["molecularCompression", "Molecular Compression", ["pulsonMissile", "atmosphericRenewer", "iridiumFuelCells"]],
    ["nanoTechnology", "Nano Technology", ["nanoDisassemblers", "microliteConstruction", "zortriumArmor"]],
    ["molecularManipulation", "Molecular Manipulation", ["zeonMissile", "neutroniumArmor"]],
    ["molecularControl", "Molecular Control", ["uridiumFuelCells", "adamantiumArmor"]],
    ["nanoMolecular", "Nano-Molecular Engineering", ["thoriumFuelCells", "xentroniumArmor"]],
  ]),
  ...ladder("sociology", [
    ["sociology", "Sociology", ["xenoLinguistics"]],
    ["militaryTactics", "Military Tactics", ["spaceAcademy"]],
    ["xenoRelations", "Xeno Relations", ["xenoPsychology", "alienManagementCenter"]],
    ["macroEconomics", "Macro Economics", ["planetaryStockExchange"]],
    ["teachingMethods", "Teaching Methods", ["astroUniversity"]],
    ["advancedGovernments", "Advanced Governments", ["advancedGovernment"]],
    ["galacticEconomics", "Galactic Economics", ["galacticCurrencyExchange"]],
    ["psionics", "Psionics", ["psionicsTraining"]],
  ]),
  ...ladder("computers", [
    ["electronics", "Electronics", ["electronicComputer"]],
    ["opticalComputers", "Optical Computers", ["researchLab", "optronicComputer", "dauntlessGuidance"]],
    ["artificialIntelligence", "Artificial Intelligence", ["neuralScanner", "scoutLab", "securityStations"]],
    ["positronics", "Positronics", ["positronicComputer", "supercomputer", "holoSimulator"]],
    ["artificialConsciousness", "Artificial Consciousness", ["emissionsGuidance", "rangemasterUnit", "cyberSecurityLink"]],
    ["cyberTechnics", "Cyber Technics", ["cyberneticComputer", "autolab", "structuralAnalyzer"]],
    ["galacticNetworking", "Galactic Networking", ["galacticNetwork", "virtualRealityNetwork"]],
    ["moleculartronics", "Moleculartronics", ["moleculartronicComputer", "achillesTargetingUnit", "pleasureDome"]],
  ]),
  ...ladder("biology", [
    ["biology", "Biology", ["hydroponicFarm"]],
    ["astroBiology", "Astro Biology", ["biospheres", "soilEnrichment"]],
    ["advancedBiology", "Advanced Biology", ["cloningCenter", "deathSpores"]],
    ["geneticEngineering", "Genetic Engineering", ["telepathicTraining", "microbiotics"]],
    ["geneticMutations", "Genetic Mutations", ["terraforming"]],
    ["macroGenetics", "Macro Genetics", ["subterraneanFarms", "weatherControl"]],
    ["evolutionaryGenetics", "Evolutionary Genetics", ["gaiaTransformation", "evolutionaryMutation"]],
    ["artificialLife", "Artificial Life", ["bioTerminator", "universalAntidote"]],
    ["transGenetics", "Trans Genetics", ["biomorphicFungi", "doomVirus"]],
  ]),
  ...ladder("physics", [
    ["physics", "Physics", ["laserCannon", "laserRifle", "spaceScanner"]],
    ["fusionPhysics", "Fusion Physics", ["fusionBeam", "fusionRifle2"]],
    ["tachyonPhysics", "Tachyon Physics", ["tachyonScanner", "battleScanner", "tachyonCommunications"]],
    ["neutrinoPhysics", "Neutrino Physics", ["neutronBlaster", "neutronScanner"]],
    ["artificialGravity", "Artificial Gravity", ["tractorBeam", "gravitonBeam", "gravityGenerator"]],
    ["subspacePhysics", "Subspace Physics", ["subspaceCommunications", "jumpGate"]],
    ["multiPhasedPhysics", "Multi-Phased Physics", ["phasor", "multiPhasedShields"]],
    ["plasmaPhysics", "Plasma Physics", ["plasmaCannon", "plasmaWeb"]],
    ["multiDimensionalPhysics", "Multi-Dimensional Physics", ["disruptorCannon", "dimensionalPortal"]],
    ["temporalPhysics", "Temporal Physics", ["stellarConverter", "temporalFields"]],
  ]),
  ...ladder("forceFields", [
    ["forceFields", "Force Fields", ["massDriver"]],
    ["advancedMagnetism", "Advanced Magnetism", ["classIShield", "ecmJammer"]],
    ["gravitonPhysics", "Graviton Physics", ["inertialStabilizer", "gyroDestabilizer"]],
    ["magnetoGravitics", "Magneto Gravitics", ["classIIIShield", "planetaryRadiationShield", "warpDissipator"]],
    ["electromagneticRefraction", "Electromagnetic Refraction", ["stealthField", "personalShield"]],
    ["warpFields", "Warp Fields", ["pulsar", "lightningField"]],
    ["subspaceFields", "Subspace Fields", ["classVShield", "multiWaveEcm", "gaussCannon"]],
    ["distortionFields", "Distortion Fields", ["cloakingDevice", "displacementDevice"]],
    ["quantumFields", "Quantum Fields", ["classVIIShield", "planetaryFluxShield"]],
    ["transwarpFields", "Transwarp Fields", ["classXShield", "planetaryBarrierShield"]],
  ]),
];

/**
 * Descriptions and empire bonuses. Techs not listed here unlock something in
 * another table and get a generated name.
 */
const DETAILS: Record<string, { name?: string; description: string; bonus?: EmpireBonus }> = {
  xenoLinguistics: { description: "Allows diplomacy with other races." },
  freighters: { description: "Food is shipped between your colonies." },
  standardFuelCells: { description: "Ships can travel 4 parsecs from your colonies." },
  deuteriumFuelCells: { description: "Fuel range 6 parsecs." },
  iridiumFuelCells: { description: "Fuel range 9 parsecs." },
  uridiumFuelCells: { description: "Fuel range 12 parsecs." },
  thoriumFuelCells: { description: "Unlimited fuel range." },
  nuclearDrive: { description: "Ships move 2 parsecs per turn." },
  fusionDrive: { description: "Ships move 3 parsecs per turn." },
  ionDrive: { description: "Ships move 4 parsecs per turn." },
  antimatterDrive: { description: "Ships move 5 parsecs per turn." },
  hyperDrive: { description: "Ships move 6 parsecs per turn." },
  interphasedDrive: { description: "Ships move 8 parsecs per turn." },
  spaceScanner: { description: "Scanners see 2 parsecs around your colonies and ships." },
  tachyonScanner: { description: "Scanner range +2 parsecs.", bonus: { scanRange: 2 } },
  neutronScanner: { description: "Scanner range +2 parsecs.", bonus: { scanRange: 2 } },
  tachyonCommunications: { description: "+1 command point.", bonus: { commandPoints: 1 } },
  subspaceCommunications: { description: "+2 command points.", bonus: { commandPoints: 2 } },
  jumpGate: { description: "+1 parsec of fleet speed." },
  microbiotics: { description: "+1 food per farmer.", bonus: { foodPerFarmer: 1 } },
  universalAntidote: { description: "+1 max pop per size step.", bonus: { maxPopPerSize: 1 } },
  advancedCityPlanning: { description: "+5 max pop on every colony.", bonus: { maxPopFlat: 5 } },
  nanoDisassemblers: { description: "Pollution halved.", bonus: { pollutionCleanup: 0.5 } },
  coreWasteDump: { description: "Pollution eliminated.", bonus: { pollutionCleanup: 1 } },
  microliteConstruction: { description: "+0.5 industry per worker.", bonus: { industryPerWorker: 0.5 } },
  deepCoreMining: { description: "+1 industry per worker.", bonus: { industryPerWorker: 1 } },
  powerPlant: { name: "Fusion Power Plant", description: "+0.5 industry per worker.", bonus: { industryPerWorker: 0.5 } },
  foodReplicators: { description: "Each pop needs half a food less.", bonus: { freeFood: 0.5 } },
  virtualRealityNetwork: { description: "+20% morale.", bonus: { morale: 20 } },
  pleasureDome: { description: "+30% morale.", bonus: { morale: 30 } },
  psionicsTraining: { name: "Psionics", description: "+20% morale, +2 spying, +1 research per scientist.", bonus: { morale: 20, spying: 2, researchPerScientist: 1 } },
  xenoPsychology: { description: "+1 research per scientist, better relations.", bonus: { researchPerScientist: 1 } },
  telepathicTraining: { description: "+2 spying.", bonus: { spying: 2 } },
  neuralScanner: { description: "+1 spying.", bonus: { spying: 1 } },
  cyberSecurityLink: { description: "+3 spy defense.", bonus: { security: 3 } },
  evolutionaryMutation: { description: "+50% population growth.", bonus: { growth: 0.5 } },
  advancedGovernment: { description: "Upgrades your government to its advanced form." },
  galacticCurrencyExchange: { description: "+0.5 BC per pop.", bonus: { bcPerPop: 0.5 } },
  personalShield: { description: "+1 ground combat.", bonus: { groundCombat: 1 } },
  poweredArmor: { description: "+1 ground combat.", bonus: { groundCombat: 1 } },
  battleoids: { description: "+1 ground combat.", bonus: { groundCombat: 1 } },
  laserRifle: { description: "+1 ground combat.", bonus: { groundCombat: 1 } },
  fusionRifle: { description: "+1 ground combat.", bonus: { groundCombat: 1 } },
  fusionRifle2: { name: "Fusion Rifle", description: "+1 ground combat.", bonus: { groundCombat: 1 } },
  terraforming: { description: "Colonies can terraform their planet one climate step at a time." },
  gaiaTransformation: { description: "Terran planets can be turned into Gaia worlds." },
  artificialPlanet: { description: "Asteroid belts and gas giants can be turned into planets." },
  dimensionalPortal: { description: "Build a portal to strike at the raiders' home dimension." },
  stellarConverter: { description: "Ship weapon that destroys planets." },
};

const titleCase = (id: string) => id.replace(/([A-Z])/g, " $1").replace(/^./, (c) => c.toUpperCase()).replace(/-/g, " ");

export const TECHS: Record<string, TechDef> = Object.fromEntries(
  TECH_TIERS.flatMap((t) => t.techs).map((id) => {
    const d = DETAILS[id];
    return [id, { id, name: d?.name ?? titleCase(id), description: d?.description ?? "", bonus: d?.bonus }];
  }),
);

export const TIERS_BY_ID: Record<string, TechTier> = Object.fromEntries(TECH_TIERS.map((t) => [t.id, t]));

export const TIER_OF_TECH: Record<string, TechTier> = Object.fromEntries(
  TECH_TIERS.flatMap((t) => t.techs.map((id) => [id, t] as const)),
);

/** Techs every empire starts with. */
export const STARTING_TECHS: string[] = TECH_TIERS.filter((t) => t.level === 0).flatMap((t) => t.techs);
export const STARTING_TIERS: string[] = TECH_TIERS.filter((t) => t.level === 0).map((t) => t.id);

/** Tier that must be researched before this one (the previous rung in its field). */
export function previousTier(tier: TechTier): TechTier | null {
  return TECH_TIERS.find((t) => t.field === tier.field && t.level === tier.level - 1) ?? null;
}
