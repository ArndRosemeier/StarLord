/**
 * Ship hulls and prebuilt designs. Step 1 ships move and colonize; the design
 * screen, components and combat stats are filled out in step 2.
 */

export type HullSize = "frigate" | "destroyer" | "cruiser" | "battleship" | "titan" | "doomStar";

export type ShipRole = "scout" | "colony" | "outpost" | "warship" | "transport";

export interface ShipDesign {
  id: string;
  name: string;
  hull: HullSize;
  role: ShipRole;
  cost: number;
  /** Combat values used by auto-resolve until tactical combat lands. */
  attack: number;
  defense: number;
  hits: number;
  requires: string | null;
}

export const PREBUILT_DESIGNS: ShipDesign[] = [
  { id: "scout", name: "Scout", hull: "frigate", role: "scout", cost: 15, attack: 0, defense: 2, hits: 4, requires: null },
  { id: "colonyShip", name: "Colony Ship", hull: "cruiser", role: "colony", cost: 220, attack: 0, defense: 0, hits: 15, requires: null },
  { id: "outpostShip", name: "Outpost Ship", hull: "destroyer", role: "outpost", cost: 80, attack: 0, defense: 0, hits: 10, requires: "outpostShip" },
  { id: "frigate", name: "Frigate", hull: "frigate", role: "warship", cost: 30, attack: 3, defense: 2, hits: 6, requires: null },
  { id: "destroyer", name: "Destroyer", hull: "destroyer", role: "warship", cost: 70, attack: 8, defense: 3, hits: 15, requires: "destroyerHull" },
];

export const DESIGNS_BY_ID: Record<string, ShipDesign> = Object.fromEntries(PREBUILT_DESIGNS.map((d) => [d.id, d]));

export interface DriveDef {
  id: string;
  /** Parsecs per turn. */
  speed: number;
  /** Max distance from an owned colony a ship may travel to. */
  range: number;
}

/** Best known drive and fuel cell decide fleet speed and range. */
export const DRIVES: { tech: string | null; speed: number }[] = [
  { tech: null, speed: 2 },
  { tech: "fusionDrive", speed: 3 },
  { tech: "ionDrive", speed: 4 },
];

export const FUEL_RANGES: { tech: string | null; range: number }[] = [
  { tech: null, range: 4 },
  { tech: "deuteriumFuelCells", range: 6 },
  { tech: "iridiumFuelCells", range: 9 },
];
