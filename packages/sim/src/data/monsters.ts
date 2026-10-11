import type { ShipDesign } from "../types.js";
import type { WeaponDef } from "./components.js";

/**
 * Space monsters guard rich systems and Orion's guardian holds the best planet
 * in the galaxy. The raiders from another dimension are in raiders.ts.
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

/** Weapons only monsters and raiders use. */
export const NPC_WEAPONS: WeaponDef[] = [
  { id: "monsterAcid", name: "Corrosive Acid", kind: "beam", damageMin: 6, damageMax: 20, space: 0, cost: 0, mods: [], requires: "never" },
  { id: "monsterRay", name: "Energy Lash", kind: "beam", damageMin: 8, damageMax: 24, space: 0, cost: 0, mods: [], requires: "never" },
  { id: "monsterFire", name: "Stellar Breath", kind: "beam", damageMin: 15, damageMax: 45, space: 0, cost: 0, traits: ["doubleRangePenalty"], mods: [], requires: "never" },
  { id: "raiderTorpedo", name: "Void Torpedo", kind: "torpedo", damageMin: 75, damageMax: 75, space: 0, cost: 0, reload: 2, speed: 30, traits: ["alwaysHits"], mods: [], requires: "never" },
];

/** Monster mix by how deep into the galaxy (0..1 of max home distance) a lair is. */
export const LAIR_MONSTERS = ["voidAmoeba", "latticeCrystal", "ionEel", "starHydra", "starWyrm"];

/** Score for the empire that slew the Guardian and holds Orion (the manual only says "a big chunk"). */
export const ORION_SCORE = 500;

/**
 * Monsters that invade the galaxy from outside (random events). Each picks an
 * empire system, travels there, does its damage if it survives the fight, and
 * leaves the galaxy after `stay` turns. Fleets can hunt it down meanwhile.
 * - engulf: every planet in the system turns toxic and its colonies die.
 * - killAll: kills every colonist, leaving the buildings standing empty.
 * - pillage: demands a bribe; unpaid, it kills colonists and wrecks buildings.
 * - blockade: sits in the system, cutting its production in half.
 * - kill: kills a share of the colonists.
 */
export type RoamingEffect = "engulf" | "killAll" | "pillage" | "blockade" | "kill";

export const ROAMING_MONSTERS: Record<string, { designId: string; name: string; effect: RoamingEffect; speed: number; stay: number }> = {
  amoeba: { designId: "voidAmoeba", name: "Void Amoeba", effect: "engulf", speed: 3, stay: 25 },
  crystal: { designId: "latticeCrystal", name: "Lattice Crystal", effect: "killAll", speed: 2, stay: 25 },
  dragon: { designId: "starWyrm", name: "Star Wyrm", effect: "pillage", speed: 4, stay: 30 },
  eel: { designId: "ionEel", name: "Ion Eel", effect: "blockade", speed: 5, stay: 20 },
  hydra: { designId: "starHydra", name: "Star Hydra", effect: "kill", speed: 3, stay: 25 },
};

/** Share of colonists a hydra kills on arrival. */
export const HYDRA_KILL_SHARE = 0.5;
/** The wyrm asks this many BC per population unit of the system it threatens. */
export const DRAGON_BRIBE_PER_POP = 15;
/** Buildings a pillaging wyrm wrecks, and the share of colonists it kills. */
export const DRAGON_PILLAGE = { buildings: 3, popShare: 0.5 };
