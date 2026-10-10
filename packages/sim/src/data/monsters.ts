import type { ShipDesign } from "../types.js";
import type { WeaponDef } from "./components.js";

/**
 * Space monsters guard rich systems, Orion's guardian holds the best planet in
 * the galaxy, and the raiders arrive late in the game from their own dimension.
 */

/** Fixed-stat ships: structure, armor, beam attack and defense, shield per hit, combat speed and size class. */
const fixed = (
  id: string, name: string, hits: number, armor: number, attack: number, defense: number, shield: number,
  combatSpeed: number, sizeClass: number, weapons: ShipDesign["weapons"],
): ShipDesign => ({
  id, name, hull: "titan", armor: "titaniumArmor", shield: null, computer: null, weapons: [], specials: [],
  module: null, obsolete: false, fixed: { hits, armor, attack, defense, shield, combatSpeed, sizeClass, weapons },
});

export const MONSTER_DESIGNS: ShipDesign[] = [
  fixed("voidAmoeba", "Void Amoeba", 300, 0, 50, 20, 2, 4, 5, [{ weaponId: "monsterAcid", count: 4 }]),
  fixed("latticeCrystal", "Lattice Crystal", 400, 100, 75, 10, 5, 2, 6, [{ weaponId: "monsterRay", count: 5 }]),
  fixed("ionEel", "Ion Eel", 200, 50, 100, 90, 0, 16, 3, [{ weaponId: "monsterRay", count: 4 }]),
  fixed("starHydra", "Star Hydra", 600, 100, 75, 30, 4, 6, 6, [{ weaponId: "monsterAcid", count: 8 }]),
  fixed("starWyrm", "Star Wyrm", 1200, 300, 100, 40, 8, 8, 7, [{ weaponId: "monsterFire", count: 8 }]),
  fixed("guardian", "The Guardian", 4000, 1000, 150, 25, 15, 5, 10, [{ weaponId: "deathRay", count: 10 }, { weaponId: "monsterFire", count: 8 }]),
];

export const RAIDER_DESIGNS: ShipDesign[] = [
  fixed("raiderCorvette", "Vexari Corvette", 80, 40, 100, 110, 5, 20, 2, [{ weaponId: "monsterRay", count: 2 }]),
  fixed("raiderDestroyer", "Vexari Destroyer", 250, 120, 125, 90, 7, 16, 3, [{ weaponId: "monsterRay", count: 4 }, { weaponId: "raiderTorpedo", count: 1 }]),
  fixed("raiderDreadnought", "Vexari Dreadnought", 900, 500, 150, 70, 10, 12, 5, [{ weaponId: "deathRay", count: 4 }, { weaponId: "raiderTorpedo", count: 3 }]),
  fixed("raiderFortress", "Vexari Fortress", 8000, 4000, 175, -10, 25, 0, 10, [{ weaponId: "deathRay", count: 16 }, { weaponId: "raiderTorpedo", count: 6 }]),
];

/** Weapons only monsters and raiders use. */
export const NPC_WEAPONS: WeaponDef[] = [
  { id: "monsterAcid", name: "Corrosive Acid", kind: "beam", damageMin: 6, damageMax: 20, space: 0, cost: 0, mods: [], requires: "never" },
  { id: "monsterRay", name: "Energy Lash", kind: "beam", damageMin: 8, damageMax: 24, space: 0, cost: 0, mods: [], requires: "never" },
  { id: "monsterFire", name: "Stellar Breath", kind: "beam", damageMin: 15, damageMax: 45, space: 0, cost: 0, traits: ["doubleRangePenalty"], mods: [], requires: "never" },
  { id: "raiderTorpedo", name: "Void Torpedo", kind: "torpedo", damageMin: 75, damageMax: 75, space: 0, cost: 0, reload: 2, speed: 30, traits: ["alwaysHits"], mods: [], requires: "never" },
];

/** Monster mix by how deep into the galaxy (0..1 of max home distance) a lair is. */
export const LAIR_MONSTERS = ["voidAmoeba", "latticeCrystal", "ionEel", "starHydra", "starWyrm"];

/** First raid turn and the gap between raids. */
export const RAID_START = 120;
export const RAID_INTERVAL: [number, number] = [15, 25];

/** Raid fleet composition by turn. */
export function raidFleet(turn: number): { designId: string; count: number }[] {
  const t = Math.max(0, turn - RAID_START);
  return [
    { designId: "raiderCorvette", count: 2 + Math.floor(t / 30) },
    { designId: "raiderDestroyer", count: 1 + Math.floor(t / 40) },
    ...(t >= 60 ? [{ designId: "raiderDreadnought", count: 1 + Math.floor((t - 60) / 60) }] : []),
  ];
}
