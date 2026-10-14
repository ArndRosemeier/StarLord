import type { NumericPick } from "./racePicks.js";
import type { RaceTrait } from "./races.js";

/**
 * How each computer empire is set up at the start of a game, after the
 * original. Every computer ruler gets four things, fixed for the game:
 *
 * - a temperament (the original's personality), rolled on its race's row of
 *   TEMPERAMENT_ROWS: index = d10 + 1 - difficulty, kept within 0..9, so
 *   harder games pull every race toward the hostile end of its row;
 * - an objective, a weighted pick (OBJECTIVE_WEIGHTS plus LEANING_BONUSES from
 *   its race's picks and the difficulty);
 * - a weapon lean and a ship specialty, picked the same way. These two are
 *   what the original's computer players build their warships and research
 *   around.
 *
 * Whenever a set of weights sums to more than LEANING_CAP, every weight is
 * halved (rounding toward zero) until it doesn't, then one is drawn.
 */

/** The original's six personalities, in its order (row values in TEMPERAMENT_ROWS index this list). */
export const TEMPERAMENT_ORDER = ["xenophobic", "ruthless", "aggressive", "erratic", "honorable", "pacifistic"] as const;

/**
 * Each race's temperament row, by race look (the original keys it by race
 * picture, so custom races use the row of the look they wear). Values index
 * TEMPERAMENT_ORDER. Looks without an original counterpart use `default`.
 */
export const TEMPERAMENT_ROWS: Record<string, number[]> = {
  kyrrin: [3, 4, 4, 4, 4, 4, 4, 4, 5, 5],
  gorvath: [1, 2, 2, 2, 2, 2, 2, 2, 3, 3],
  shadar: [1, 1, 0, 2, 2, 2, 2, 2, 2, 2],
  lysari: [0, 0, 1, 1, 1, 1, 1, 2, 2, 2],
  quillan: [1, 1, 2, 2, 3, 3, 3, 5, 5, 5],
  terran: [3, 4, 4, 4, 4, 4, 4, 4, 5, 5],
  zhrikk: [0, 0, 0, 0, 0, 0, 0, 1, 2, 2],
  kordex: [0, 2, 2, 3, 3, 3, 3, 3, 3, 3],
  felhari: [0, 1, 1, 1, 1, 1, 1, 1, 2, 2],
  ythari: [3, 3, 4, 5, 5, 5, 5, 5, 5, 5],
  draskar: [1, 2, 2, 2, 2, 2, 2, 2, 3, 3],
  petrani: [0, 0, 0, 0, 0, 0, 0, 2, 2, 3],
  thalassi: [3, 4, 4, 4, 4, 4, 5, 5, 5, 5],
  default: [3, 4, 4, 4, 4, 4, 4, 4, 5, 5],
};

/** Temperament roll: index = d`die` + `shift` - difficulty (0 tutor .. 4 impossible), kept within the row. */
export const TEMPERAMENT_ROLL = { die: 10, shift: 1 } as const;

export type Objective = "diplomat" | "militarist" | "expansionist" | "technologist" | "industrialist" | "ecologist";
export type WeaponLean = "beams" | "carriers" | "missiles" | "devices";
export type ShipSpecialty = "speed" | "boarding" | "raiders" | "countermeasures" | "stealth" | "armor" | "shields";

export const OBJECTIVE_ORDER: Objective[] = ["diplomat", "militarist", "expansionist", "technologist", "industrialist", "ecologist"];
export const WEAPON_LEAN_ORDER: WeaponLean[] = ["beams", "carriers", "missiles", "devices"];
export const SHIP_SPECIALTY_ORDER: ShipSpecialty[] = ["speed", "boarding", "raiders", "countermeasures", "stealth", "armor", "shields"];

/** Starting weights before race picks and difficulty add to them. */
export const OBJECTIVE_WEIGHTS: Record<Objective, number> = {
  diplomat: 1, militarist: 2, expansionist: 1, technologist: 2, industrialist: 2, ecologist: 1,
};
export const WEAPON_LEAN_WEIGHTS: Record<WeaponLean, number> = { beams: 2, carriers: 1, missiles: 2, devices: 1 };
export const SHIP_SPECIALTY_WEIGHTS: Record<ShipSpecialty, number> = {
  speed: 2, boarding: 2, raiders: 1, countermeasures: 2, stealth: 1, armor: 2, shields: 3,
};
export const LEANING_CAP = 1000;

type Adds = {
  objective?: Partial<Record<Objective, number>>;
  /** Replaces these objective weights instead of adding to them. */
  setObjective?: Partial<Record<Objective, number>>;
  weapon?: Partial<Record<WeaponLean, number>>;
  specialty?: Partial<Record<ShipSpecialty, number>>;
};

/**
 * What a race's picks add, in the original's order. Only the conditions the
 * original actually meets are listed: its checks for +1 ship attack, any ship
 * defense, +2 food and -½ food compare against values those picks never take,
 * so they never fire.
 */
export const LEANING_BONUSES: Array<Adds & ({ pick: NumericPick; value: number } | { trait: RaceTrait } | { difficulty: number } | { temperament: (typeof TEMPERAMENT_ORDER)[number] })> = [
  { pick: "growth", value: 0.5, setObjective: { ecologist: 11, expansionist: 11 } },
  { pick: "growth", value: 1, objective: { ecologist: 100, expansionist: 100 } },
  { pick: "farming", value: 1, objective: { ecologist: 100, industrialist: 100, technologist: 100 } },
  { pick: "industry", value: 1, objective: { ecologist: 3, industrialist: 3, technologist: 3 } },
  { pick: "industry", value: 2, objective: { ecologist: 10, industrialist: 10, technologist: 10 } },
  { pick: "science", value: 1, objective: { industrialist: 3, technologist: 10 } },
  { pick: "science", value: 2, objective: { industrialist: 10, technologist: 100 } },
  { pick: "shipAttack", value: 2, objective: { militarist: 100 }, weapon: { beams: 1000 }, specialty: { stealth: 10 } },
  { pick: "groundCombat", value: 1, objective: { expansionist: 10 }, specialty: { boarding: 100 } },
  { pick: "groundCombat", value: 2, objective: { expansionist: 100 }, specialty: { boarding: 1000 } },
  { pick: "spying", value: 1, objective: { diplomat: 3 } },
  { pick: "spying", value: 2, objective: { diplomat: 10 } },
  { trait: "lowG", objective: { industrialist: 10, ecologist: 3, technologist: 3 } },
  { trait: "highG", objective: { expansionist: 10 }, specialty: { boarding: 1000 } },
  { trait: "aquatic", objective: { industrialist: 3, ecologist: 3, technologist: 3 } },
  { trait: "subterranean", objective: { industrialist: 10, ecologist: 3, technologist: 3 } },
  { trait: "largeHomeworld", objective: { industrialist: 3, ecologist: 10 } },
  { trait: "richHomeworld", objective: { industrialist: 10 } },
  { trait: "cybernetic", objective: { industrialist: 3 }, specialty: { armor: 1000 }, weapon: { beams: 10 } },
  { trait: "lithovore", objective: { industrialist: 3, expansionist: 10, technologist: 3 } },
  { trait: "charismatic", objective: { diplomat: 100 } },
  { trait: "creative", objective: { technologist: 1000 } },
  { trait: "tolerant", objective: { industrialist: 100 } },
  { trait: "fantasticTraders", objective: { diplomat: 100 } },
  { trait: "stealthy", objective: { militarist: 100 } },
  { trait: "warlord", objective: { expansionist: 10 } },
  { trait: "transDimensional", objective: { expansionist: 10, militarist: 13 }, specialty: { countermeasures: 100 } },
  { difficulty: 3, objective: { industrialist: 3, expansionist: 3, technologist: 3 } },
  { difficulty: 4, objective: { industrialist: 10, expansionist: 10, technologist: 10 } },
  { temperament: "xenophobic", specialty: { raiders: 3 } },
];

/**
 * Research weights: the original rates every application by its group; a
 * computer empire's objective, weapon lean and ship specialty raise the
 * groups named here to 100 (or the number given) while every other group
 * keeps a base of 5 to 50. Groups are lists of applications.
 */
export const RESEARCH_GROUPS = {
  food: ["androidFarmers", "biomorphicFungi", "foodReplicators", "hydroponicFarm", "soilEnrichment", "subterraneanFarms", "terraforming", "weatherControl"],
  industry: ["androidWorkers", "automatedFactory", "deepCoreMining", "gravityGenerator", "recyclotron", "roboticFactory", "roboMinerPlant"],
  research: ["androidScientists", "autolab", "galacticNetwork", "heightenedIntelligence", "supercomputer", "researchLab"],
  money: ["galacticCurrencyExchange", "planetaryStockExchange", "spacePort"],
  pollution: ["atmosphericRenewer", "coreWasteDump", "nanoDisassemblers", "pollutionProcessor"],
  bases: ["artemisSystemNet", "battlestation", "colonyBase", "fighterGarrison", "outpostShip", "missileBase", "groundBatteries", "starBase", "starFortress", "stellarConverter"],
  planetShields: ["planetaryBarrierShield", "planetaryFluxShield", "planetaryRadiationShield"],
  xenoSciences: ["artificialPlanet", "evolutionaryMutation", "xenoPsychology"],
  espionage: ["cyberSecurityLink", "neuralScanner", "psionicsTraining", "spyNetwork", "stealthSuit", "telepathicTraining"],
  shipSystems: ["advancedDamageControl", "battlePods", "megafluxers", "jumpGate", "microliteConstruction", "quantumDetonator", "starGate", "survivalPods", "timeWarpFacilitator"],
  shields: ["classIShield", "classIIIShield", "classVShield", "classVIIShield", "classXShield", "damperField"],
  shieldUpgrades: ["hardShields", "multiPhasedShields", "reflectionField", "shieldCapacitors"],
  fuel: ["deuteriumFuelCells", "iridiumFuelCells", "standardFuelCells", "thoriumFuelCells", "uridiumFuelCells"],
  beams: ["massDriver", "laserCannon", "fusionBeam", "gaussCannon", "gravitonBeam", "ionPulseCannon", "neutronBlaster", "particleBeam", "phasor", "plasmaCannon", "disruptorCannon", "deathRay"],
  beamUpgrades: ["achillesTargetingUnit", "battleScanner", "highEnergyFocus", "hyperXCapacitors", "rangemasterUnit", "structuralAnalyzer"],
  computers: ["electronicComputer", "optronicComputer", "positronicComputer", "cyberneticComputer", "moleculartronicComputer"],
  bombs: ["nuclearBomb", "fusionBomb", "antimatterBomb", "neutroniumBomb"],
  bays: ["fighterBays", "bomberBays", "heavyFighterBays"],
  missiles: ["nuclearMissile", "merculiteMissile", "pulsonMissile", "zeonMissile", "antimatterTorpedo", "protonTorpedo", "plasmaTorpedo"],
  missileUpgrades: ["dauntlessGuidance", "emissionsGuidance", "fastMissileRacks"],
  scanners: ["spaceScanner", "neutronScanner", "tachyonScanner", "sensors"],
  shipUtilities: ["extendedFuelTanks", "scoutLab", "securityStations", "subspaceTeleporter", "warpDissipator"],
  devices: ["blackHoleGenerator", "energyAbsorber", "gyroDestabilizer", "maulerDevice", "phaseShifter", "plasmaWeb", "stasisField"],
  drives: ["nuclearDrive", "fusionDrive", "ionDrive", "antimatterDrive", "hyperDrive", "interphasedDrive"],
  engines: ["augmentedEngines", "inertialNullifier", "inertialStabilizer"],
  groundArmor: ["antiGravHarness", "battleoids", "personalShield", "poweredArmor"],
  rifles: ["laserRifle", "fusionRifle", "pulseRifle", "phasorRifle", "plasmaRifle"],
  armor: ["titaniumArmor", "tritaniumArmor", "zortriumArmor", "neutroniumArmor", "adamantiumArmor", "xentroniumArmor"],
  boarding: ["assaultShuttles", "tractorBeam", "transporters", "troopPods"],
  bioWeapons: ["bioTerminator", "deathSpores"],
  countermeasures: ["antiMissileRockets", "ecmJammer", "lightningField", "multiWaveEcm", "pulsar", "spatialCompressor", "wideAreaJammer"],
  cloaks: ["cloakingDevice", "displacementDevice", "phasingCloak", "stealthField"],
  hullUpgrades: ["automatedRepairUnit", "reinforcedHull", "heavyArmor"],
} as const satisfies Record<string, readonly string[]>;
export type ResearchGroup = keyof typeof RESEARCH_GROUPS;

/** Player-facing names of the research groups. */
export const RESEARCH_GROUP_NAMES: Record<ResearchGroup, string> = {
  food: "farming", industry: "industry", research: "research buildings", money: "money", pollution: "pollution control",
  bases: "colony bases, outposts and planetary defenses", planetShields: "planetary shields",
  xenoSciences: "Artificial Planet, Evolutionary Mutation and Xeno Psychology", espionage: "espionage",
  shipSystems: "ship systems (damage control, pods, gates)", shields: "ship shields", shieldUpgrades: "shield upgrades",
  fuel: "fuel cells", beams: "beam weapons", beamUpgrades: "targeting and beam upgrades", computers: "battle computers",
  bombs: "bombs", bays: "fighter and bomber bays", missiles: "missiles and torpedoes", missileUpgrades: "missile upgrades",
  scanners: "scanners", shipUtilities: "fuel tanks, scout labs and teleporters", devices: "exotic weapons and devices",
  drives: "drives", engines: "engine upgrades", groundArmor: "ground armor", rifles: "infantry rifles", armor: "ship armor",
  boarding: "boarding equipment", bioWeapons: "biological weapons", countermeasures: "jammers and missile defenses",
  cloaks: "cloaks", hullUpgrades: "hull upgrades and repair",
};

/** The original's research weight for a group the empire leans toward (unless given per group). */
export const LEAN_RESEARCH_WEIGHT = 100;

export interface LeaningDef {
  name: string;
  /** What it means, for players. */
  text: string;
  /** Research groups weighted up, with the weight when it isn't LEAN_RESEARCH_WEIGHT. */
  research: Partial<Record<ResearchGroup, number>>;
}

export const OBJECTIVES: Record<Objective, LeaningDef> = {
  diplomat: { name: "Diplomat", text: "Seeks influence: spies, trade and the xeno sciences.", research: { espionage: 100, money: 100, xenoSciences: 100 } },
  militarist: { name: "Militarist", text: "Seeks a strong fleet.", research: { shipSystems: 100, shields: 100 } },
  expansionist: { name: "Expansionist", text: "Seeks room to grow and the defenses to hold it.", research: { fuel: 50, bases: 100, planetShields: 100 } },
  technologist: { name: "Technologist", text: "Seeks knowledge.", research: { research: 100 } },
  industrialist: { name: "Industrialist", text: "Seeks production.", research: { industry: 100, pollution: 100 } },
  ecologist: { name: "Ecologist", text: "Seeks to feed and grow its people on clean worlds.", research: { food: 100, pollution: 100 } },
};

export const WEAPON_LEANS: Record<WeaponLean, LeaningDef & { design: string }> = {
  beams: { name: "Beam doctrine", text: "Arms its warships with beam weapons.", design: "Warships carry beams; missiles only when they are half again as strong.", research: { beams: 100, beamUpgrades: 100, computers: 100 } },
  carriers: { name: "Carrier doctrine", text: "Researches fighter bays and bombs.", design: "Picks beams or missiles like a balanced designer.", research: { beams: 50, bombs: 100, bays: 100, computers: 20 } },
  missiles: { name: "Missile doctrine", text: "Arms its warships with missiles and torpedoes.", design: "Warships carry missiles unless beams are half again as strong.", research: { missiles: 100, missileUpgrades: 100, scanners: 100 } },
  devices: { name: "Device doctrine", text: "Researches exotic weapons and devices.", design: "Picks beams or missiles like a balanced designer.", research: { shipUtilities: 50, devices: 100 } },
};

export const SHIP_SPECIALTIES: Record<ShipSpecialty, LeaningDef & { specials: string[] }> = {
  speed: { name: "Speed", text: "Fast, agile warships.", specials: ["inertialNullifier", "displacementDevice", "augmentedEngines", "inertialStabilizer"], research: { drives: 50, engines: 50 } },
  boarding: { name: "Boarding", text: "Warships that board and capture.", specials: ["transporters", "troopPods", "warpDissipator"], research: { groundArmor: 20, rifles: 20, armor: 50, boarding: 100 } },
  raiders: { name: "Raiders", text: "Hit-and-run ships and biological weapons.", specials: ["phaseShifter", "subspaceTeleporter", "augmentedEngines"], research: { drives: 50, bioWeapons: 100 } },
  countermeasures: { name: "Countermeasures", text: "Jammers and missile defenses.", specials: ["wideAreaJammer", "multiWaveEcm", "ecmJammer", "displacementDevice", "lightningField"], research: { countermeasures: 100, beams: 20 } },
  stealth: { name: "Stealth", text: "Cloaked warships.", specials: ["phasingCloak", "cloakingDevice", "stealthField"], research: { cloaks: 100 } },
  armor: { name: "Armor", text: "Tough, self-repairing hulls.", specials: ["automatedRepairUnit", "heavyArmor", "reinforcedHull"], research: { armor: 100, hullUpgrades: 100 } },
  shields: { name: "Shields", text: "Heavily shielded warships.", specials: ["hardShields", "multiPhasedShields", "shieldCapacitors"], research: { shields: 100, shieldUpgrades: 100 } },
};
