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
}

export interface BuildingDef {
  id: string;
  name: string;
  cost: number;
  /** BC per turn. */
  maintenance: number;
  /** Tech that unlocks it; null means available from the start. */
  requires: string | null;
  effects: BuildingEffects;
  description: string;
}

export const BUILDINGS: BuildingDef[] = [
  { id: "hydroponicFarm", name: "Hydroponic Farm", cost: 60, maintenance: 1, requires: "hydroponicFarm",
    effects: { foodFlat: 2 }, description: "+2 food." },
  { id: "biospheres", name: "Biospheres", cost: 60, maintenance: 1, requires: "biospheres",
    effects: { maxPopBySize: 0.67 }, description: "Raises maximum population by about two thirds of a pop per size step." },
  { id: "automatedFactory", name: "Automated Factory", cost: 60, maintenance: 1, requires: "automatedFactory",
    effects: { industryFlat: 5, industryPerWorker: 1 }, description: "+5 industry and +1 per worker." },
  { id: "researchLab", name: "Research Laboratory", cost: 120, maintenance: 1, requires: "researchLab",
    effects: { researchFlat: 5, researchPerScientist: 1 }, description: "+5 research and +1 per scientist." },
  { id: "spacePort", name: "Spaceport", cost: 80, maintenance: 1, requires: "spacePort",
    effects: { bcFlat: 4 }, description: "+4 BC." },
  { id: "cloningCenter", name: "Cloning Center", cost: 100, maintenance: 2, requires: "cloningCenter",
    effects: {}, description: "+100k population growth per turn." },
  { id: "roboticFactory", name: "Robotic Factory", cost: 200, maintenance: 3, requires: "roboticFactory",
    effects: { industryFlat: 10, industryPerWorker: 1.5 }, description: "+10 industry and +1.5 per worker." },
  { id: "supercomputer", name: "Supercomputer", cost: 150, maintenance: 2, requires: "supercomputer",
    effects: { researchFlat: 10, researchPerScientist: 2 }, description: "+10 research and +2 per scientist." },
  { id: "soilEnrichment", name: "Soil Enrichment", cost: 80, maintenance: 1, requires: "soilEnrichment",
    effects: { foodPerFarmer: 1 }, description: "+1 food per farmer." },
];

export const BUILDINGS_BY_ID: Record<string, BuildingDef> = Object.fromEntries(BUILDINGS.map((b) => [b.id, b]));
