import type { ShipDesign } from "../types.js";

/**
 * Space monsters guard rich systems, Orion's guardian holds the best planet in
 * the galaxy, and the raiders arrive late in the game from their own dimension.
 */

const fixed = (
  id: string, name: string, hits: number, attack: number, defense: number, shield: number,
  combatSpeed: number, weapons: ShipDesign["weapons"],
): ShipDesign => ({
  id, name, hull: "titan", armor: "titaniumArmor", shield: null, computer: null, weapons: [], specials: [],
  module: null, obsolete: false, fixed: { hits, attack, defense, shield, combatSpeed, weapons },
});

export const MONSTER_DESIGNS: ShipDesign[] = [
  fixed("voidAmoeba", "Void Amoeba", 200, 25, 0, 2, 2, [{ weaponId: "monsterAcid", count: 4 }]),
  fixed("latticeCrystal", "Lattice Crystal", 300, 40, 10, 5, 1, [{ weaponId: "monsterRay", count: 4 }]),
  fixed("ionEel", "Ion Eel", 150, 50, 40, 0, 5, [{ weaponId: "monsterRay", count: 3 }]),
  fixed("starHydra", "Star Hydra", 400, 40, 10, 4, 3, [{ weaponId: "monsterAcid", count: 6 }]),
  fixed("starWyrm", "Star Wyrm", 800, 60, 20, 8, 4, [{ weaponId: "monsterFire", count: 6 }]),
  fixed("guardian", "The Guardian", 3000, 100, 20, 15, 2, [{ weaponId: "deathRay", count: 10 }, { weaponId: "monsterFire", count: 6 }]),
];

export const RAIDER_DESIGNS: ShipDesign[] = [
  fixed("raiderCorvette", "Vexari Corvette", 60, 60, 40, 4, 6, [{ weaponId: "monsterRay", count: 2 }]),
  fixed("raiderDestroyer", "Vexari Destroyer", 180, 75, 30, 6, 6, [{ weaponId: "monsterRay", count: 4 }, { weaponId: "raiderTorpedo", count: 1 }]),
  fixed("raiderDreadnought", "Vexari Dreadnought", 700, 100, 15, 10, 5, [{ weaponId: "deathRay", count: 4 }, { weaponId: "raiderTorpedo", count: 3 }]),
  fixed("raiderFortress", "Vexari Fortress", 6000, 120, 0, 25, 0, [{ weaponId: "deathRay", count: 16 }, { weaponId: "raiderTorpedo", count: 6 }]),
];

/** Weapons only monsters and raiders use. */
export const NPC_WEAPONS = [
  { id: "monsterAcid", name: "Corrosive Acid", kind: "beam" as const, damageMin: 4, damageMax: 14, space: 0, cost: 0, range: 4, requires: "never" },
  { id: "monsterRay", name: "Energy Lash", kind: "beam" as const, damageMin: 6, damageMax: 18, space: 0, cost: 0, range: 8, requires: "never" },
  { id: "monsterFire", name: "Stellar Breath", kind: "beam" as const, damageMin: 10, damageMax: 30, space: 0, cost: 0, range: 6, requires: "never" },
  { id: "raiderTorpedo", name: "Void Torpedo", kind: "torpedo" as const, damageMin: 50, damageMax: 50, space: 0, cost: 0, range: 14, ammo: 3, pierce: 20, requires: "never" },
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
