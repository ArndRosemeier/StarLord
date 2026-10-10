/**
 * Research follows MoO2: eight fields, each a ladder of tiers. Researching a
 * tier grants one tech of your choice from it (creative races get all of them,
 * uncreative races get one at random). This is the opening slice of the tree;
 * step 2 fills in the rest.
 */

export type TechField =
  | "construction" | "power" | "chemistry" | "sociology"
  | "computers" | "biology" | "physics" | "forceFields";

export const TECH_FIELDS: TechField[] = [
  "construction", "power", "chemistry", "sociology", "computers", "biology", "physics", "forceFields",
];

export interface TechTier {
  id: string;
  name: string;
  field: TechField;
  cost: number;
  techs: string[];
  /** Tier that must be researched first; null for the first tier in a field. */
  after: string | null;
}

export interface TechDef {
  id: string;
  name: string;
  description: string;
}

export const TECH_TIERS: TechTier[] = [
  { id: "advancedEngineering", name: "Advanced Engineering", field: "construction", cost: 80, after: null,
    techs: ["automatedFactory", "heavyArmor", "pollutionProcessor"] },
  { id: "advancedConstruction", name: "Advanced Construction", field: "construction", cost: 250, after: "advancedEngineering",
    techs: ["spacePort", "destroyerHull", "outpostShip"] },
  { id: "roboticsI", name: "Robotics", field: "construction", cost: 650, after: "advancedConstruction",
    techs: ["roboticFactory", "bombers"] },

  { id: "nuclearFission", name: "Nuclear Fission", field: "power", cost: 50, after: null,
    techs: ["deuteriumFuelCells", "nuclearBomb"] },
  { id: "advancedFusion", name: "Advanced Fusion", field: "power", cost: 250, after: "nuclearFission",
    techs: ["fusionDrive", "fusionBomb", "augmentedEngines"] },
  { id: "ionFission", name: "Ion Fission", field: "power", cost: 650, after: "advancedFusion",
    techs: ["ionDrive", "iridiumFuelCells"] },

  { id: "advancedChemistry", name: "Advanced Chemistry", field: "chemistry", cost: 80, after: null,
    techs: ["merculiteMissile", "pollutionScrubber"] },
  { id: "molecularCompression", name: "Molecular Compression", field: "chemistry", cost: 400, after: "advancedChemistry",
    techs: ["tritaniumArmor", "soilEnrichment"] },

  { id: "militaryTactics", name: "Military Tactics", field: "sociology", cost: 150, after: null,
    techs: ["spaceAcademy", "xenoRelations"] },
  { id: "galacticEconomics", name: "Galactic Economics", field: "sociology", cost: 400, after: "militaryTactics",
    techs: ["planetaryStockExchange", "galacticCurrency"] },

  { id: "electronicComputer", name: "Electronic Computer", field: "computers", cost: 50, after: null,
    techs: ["researchLab", "electronicTargeting"] },
  { id: "optronics", name: "Optronics", field: "computers", cost: 250, after: "electronicComputer",
    techs: ["optronicComputer", "dauntlessGuidance"] },
  { id: "positronics", name: "Positronics", field: "computers", cost: 900, after: "optronics",
    techs: ["supercomputer", "positronicComputer"] },

  { id: "astroBiology", name: "Astro Biology", field: "biology", cost: 80, after: null,
    techs: ["hydroponicFarm", "biospheres"] },
  { id: "advancedBiology", name: "Advanced Biology", field: "biology", cost: 400, after: "astroBiology",
    techs: ["cloningCenter", "deathSpores"] },

  { id: "fusionPhysics", name: "Fusion Physics", field: "physics", cost: 150, after: null,
    techs: ["fusionBeam", "fusionRifle"] },
  { id: "tachyonPhysics", name: "Tachyon Physics", field: "physics", cost: 650, after: "fusionPhysics",
    techs: ["tachyonScanner", "tachyonCommunication"] },

  { id: "advancedMagnetism", name: "Advanced Magnetism", field: "forceFields", cost: 150, after: null,
    techs: ["classIShield", "massDriver"] },
  { id: "gravitonPhysics", name: "Graviton Physics", field: "forceFields", cost: 650, after: "advancedMagnetism",
    techs: ["classIIIShield", "tractorBeam"] },
];

const titleCase = (id: string) => id.replace(/([A-Z])/g, " $1").replace(/^./, (c) => c.toUpperCase());

/** Display names for techs; buildings and designs carry their own descriptions. */
export const TECHS: Record<string, TechDef> = Object.fromEntries(
  TECH_TIERS.flatMap((t) => t.techs).map((id) => [id, { id, name: titleCase(id), description: "" }]),
);

export const TIERS_BY_ID: Record<string, TechTier> = Object.fromEntries(TECH_TIERS.map((t) => [t.id, t]));
