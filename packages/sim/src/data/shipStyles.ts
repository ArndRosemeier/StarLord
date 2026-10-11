import type { Player, ShipDesign } from "../types.js";
import { getRace } from "./races.js";

/**
 * Ship design languages: one family of hull models per race, so an empire's
 * fleets look like its own. Every design may pick any style; designs without
 * one use their owner's race style. Purely visual, no effect on the rules.
 */
export const SHIP_STYLES = [
  { id: "standard", name: "Standard", text: "Layered decks, gun turrets and bridges; classic warships." },
  { id: "raptor", name: "Raptor", text: "Beaked needles with forward-swept wings, built for pilots." },
  { id: "bulwark", name: "Bulwark", text: "Massive armoured blocks with ram prows and heavy guns." },
  { id: "shade", name: "Shade", text: "Flat, dark stealth wedges with few lights." },
  { id: "halo", name: "Halo", text: "Saucers wrapped in glowing rings." },
  { id: "hauler", name: "Hauler", text: "Practical spines lined with round cargo pods." },
  { id: "hive", name: "Hive", text: "Chains of insect-like segments with mandibles and legs." },
  { id: "lattice", name: "Lattice", text: "Open girder frames carrying engineered modules." },
  { id: "fang", name: "Fang", text: "Aggressive hulls with forward claws and spiked ridges." },
  { id: "spire", name: "Spire", text: "Elegant spires around shining orbs and rings." },
  { id: "drill", name: "Drill", text: "Segmented cylinders behind ringed drill noses." },
  { id: "shard", name: "Shard", text: "Clusters of crystal shards." },
  { id: "manta", name: "Manta", text: "Smooth flat rays with long tails and fins." },
] as const;

export type ShipStyle = (typeof SHIP_STYLES)[number]["id"];

export const SHIP_STYLES_BY_ID = Object.fromEntries(SHIP_STYLES.map((s) => [s.id, s])) as Record<ShipStyle, (typeof SHIP_STYLES)[number]>;

/** Each race's own design language. */
export const RACE_SHIP_STYLE: Record<string, ShipStyle> = {
  terran: "standard", kyrrin: "raptor", gorvath: "bulwark", shadar: "shade", lysari: "halo", quillan: "hauler",
  zhrikk: "hive", kordex: "lattice", felhari: "fang", ythari: "spire", draskar: "drill", petrani: "shard", thalassi: "manta",
};

export const isShipStyle = (id: string): id is ShipStyle => id in SHIP_STYLES_BY_ID;

/** The default style of a race: its own pick, else the built-in table; custom races without one borrow the style of the race whose art they use. */
export function raceShipStyle(raceId: string): ShipStyle {
  const direct = RACE_SHIP_STYLE[raceId];
  if (direct) return direct;
  try {
    const race = getRace(raceId);
    if (race.shipStyle && isShipStyle(race.shipStyle)) return race.shipStyle;
    return RACE_SHIP_STYLE[race.assetKey] ?? "standard";
  } catch {
    return "standard";
  }
}

/** The style a design is drawn in. */
export function designStyle(owner: Pick<Player, "raceId">, design: Pick<ShipDesign, "style">): ShipStyle {
  return design.style && isShipStyle(design.style) ? design.style : raceShipStyle(owner.raceId);
}
