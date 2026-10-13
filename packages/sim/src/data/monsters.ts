import { SCORE } from "./score.js";
import type { ShipDesign, WeaponMount } from "../types.js";
import { DEFENSE_PER_SPEED } from "./combat.js";
import { COMPUTERS_BY_ID, HULLS_BY_ID, type HullSize, type WeaponDef } from "./components.js";
import type { Minerals, PlanetSize, PlanetType } from "./planets.js";

/**
 * Space monsters guard rich systems and Orion's guardian holds the best planet
 * in the galaxy. The raiders from another dimension are in raiders.ts.
 *
 * Every monster is built as in the original: a hull with a computer and a
 * drive, no armor layer, its own structure, beam attack from its computer and
 * beam defense of 5 per square of combat speed. Each kind comes in two sizes:
 * the one guarding a lair and the bigger one that invades the galaxy from
 * outside (a random event). Monsters carry no crew and cannot be boarded.
 */

interface MonsterSpec {
  id: string;
  name: string;
  hull: HullSize;
  computer: string;
  structure: number;
  /** Squares per combat turn. */
  combatSpeed: number;
  weapons: WeaponMount[];
  specials?: string[];
  armor?: { id: string; points: number };
  /** Shield class (damage off every hit) with its facing strength. */
  shield?: number;
}

const monster = (m: MonsterSpec): ShipDesign => {
  const sizeClass = HULLS_BY_ID[m.hull].sizeClass;
  return {
    id: m.id, name: m.name, hull: m.hull, armor: m.armor?.id ?? "titaniumArmor", shield: null, computer: null, weapons: [],
    specials: m.specials ?? [], module: null, obsolete: false,
    fixed: {
      hits: m.structure, armor: m.armor?.points ?? 0, attack: COMPUTERS_BY_ID[m.computer]!.attack,
      defense: m.combatSpeed * DEFENSE_PER_SPEED, shield: m.shield ?? 0,
      shieldStrength: m.shield ? m.shield * MONSTER_SHIELD_PER_CLASS * sizeClass : 0,
      combatSpeed: m.combatSpeed, sizeClass, weapons: m.weapons, crew: 0,
    },
  };
};

/** Shield strength per facing: class × this × size class, as for ships. */
const MONSTER_SHIELD_PER_CLASS = 5;

/** Monster weapons fire all round. */
const all = (weaponId: string, count: number, extra: Partial<WeaponMount> = {}): WeaponMount => ({ weaponId, count, arc: "full", ...extra });

/** Id of the bigger kind that invades the galaxy. */
export const elderId = (id: string) => `${id}Elder`;

export const MONSTER_DESIGNS: ShipDesign[] = [
  monster({ id: "voidAmoeba", name: "Void Amoeba", hull: "cruiser", computer: "optronicComputer", structure: 400, combatSpeed: 8,
    weapons: [all("amoebaCloud", 1)] }),
  monster({ id: elderId("voidAmoeba"), name: "Great Void Amoeba", hull: "battleship", computer: "optronicComputer", structure: 750, combatSpeed: 7,
    weapons: [all("amoebaCloud", 2), all("antimatterBomb", 5, { ammo: 10 })] }),
  monster({ id: "latticeCrystal", name: "Lattice Crystal", hull: "cruiser", computer: "moleculartronicComputer", structure: 500, combatSpeed: 12,
    weapons: [all("crystalLance", 1), all("deathSpores", 5, { ammo: 10 })] }),
  monster({ id: elderId("latticeCrystal"), name: "Great Lattice Crystal", hull: "titan", computer: "moleculartronicComputer", structure: 2500, combatSpeed: 10,
    weapons: [all("crystalLance", 1, { mods: ["heavyMount"] }), all("doomVirus", 5, { ammo: 10 })] }),
  monster({ id: "starWyrm", name: "Star Wyrm", hull: "cruiser", computer: "moleculartronicComputer", structure: 500, combatSpeed: 20,
    weapons: [all("wyrmFang", 8, { mods: ["pointDefense"] }), all("wyrmFire", 1)] }),
  monster({ id: elderId("starWyrm"), name: "Great Star Wyrm", hull: "titan", computer: "moleculartronicComputer", structure: 2500, combatSpeed: 18,
    weapons: [all("wyrmFang", 20, { mods: ["pointDefense"] }), all("wyrmFire", 1, { mods: ["overloaded"] })] }),
  monster({ id: "ionEel", name: "Ion Eel", hull: "cruiser", computer: "cyberneticComputer", structure: 300, combatSpeed: 24,
    weapons: [all("eelDischarge", 1)], specials: ["lightningField"] }),
  monster({ id: elderId("ionEel"), name: "Great Ion Eel", hull: "battleship", computer: "cyberneticComputer", structure: 1000, combatSpeed: 23,
    weapons: [all("eelDischarge", 2)], specials: ["lightningField"] }),
  monster({ id: "starHydra", name: "Star Hydra", hull: "cruiser", computer: "optronicComputer", structure: 500, combatSpeed: 8,
    weapons: [all("hydraBreath", 3)], specials: ["energyAbsorber"] }),
  monster({ id: elderId("starHydra"), name: "Great Star Hydra", hull: "titan", computer: "optronicComputer", structure: 1500, combatSpeed: 6,
    weapons: [all("hydraBreath", 5, { mods: ["heavyMount"] })], specials: ["energyAbsorber"] }),
  monster({ id: "guardian", name: "The Guardian", hull: "titan", computer: "moleculartronicComputer", structure: 800, combatSpeed: 10,
    armor: { id: "xentroniumArmor", points: 800 }, shield: 5,
    weapons: [
      all("deathRay", 2, { mods: ["heavyMount"] }),
      all("particleBeam", 10, { mods: ["pointDefense"] }),
      all("plasmaTorpedo", 2, { mods: ["overloaded", "eccm", "enveloping"] }),
      all("spatialCompressor", 2),
    ],
    specials: ["achillesTargetingUnit", "automatedRepairUnit", "battleScanner", "hardShields", "inertialStabilizer", "lightningField", "multiWaveEcm", "rangemasterUnit"] }),
];

/**
 * Weapons only monsters use. Speed and reload of the wyrm's fire and the
 * reach of the two field weapons are our reading: the original's weapon table
 * gives their damage and flags only.
 */
export const NPC_WEAPONS: WeaponDef[] = [
  { id: "wyrmFire", name: "Wyrm Fire", kind: "torpedo", damageMin: 300, damageMax: 300, space: 0, cost: 0, reload: 1, speed: 24, dissipation: 15,
    traits: ["dissipates", "alwaysHits"], mods: ["overloaded"], requires: "never" },
  { id: "wyrmFang", name: "Wyrm Fang", kind: "beam", damageMin: 5, damageMax: 10, space: 0, cost: 0, mods: ["heavyMount", "pointDefense", "continuous"], requires: "never" },
  { id: "crystalLance", name: "Crystal Lance", kind: "beam", damageMin: 40, damageMax: 80, space: 0, cost: 0, traits: ["killsMarines"], mods: ["heavyMount"], requires: "never" },
  { id: "hydraBreath", name: "Hydra Breath", kind: "beam", damageMin: 60, damageMax: 60, space: 0, cost: 0, traits: ["alwaysHits", "doubleRangePenalty"], mods: ["heavyMount"], requires: "never" },
  { id: "eelDischarge", name: "Ion Discharge", kind: "special", damageMin: 10, damageMax: 40, space: 0, cost: 0, range: 2, perSize: true, traits: ["area"], effect: "pulsar", mods: [], requires: "never" },
  { id: "amoebaCloud", name: "Acid Cloud", kind: "special", damageMin: 25, damageMax: 50, space: 0, cost: 0, range: 15, effect: "plasmaWeb", mods: [], requires: "never" },
];

/** Monsters that never start a fight: ion eels only fight back. */
export const PASSIVE_MONSTERS = ["ionEel", elderId("ionEel")];

/** Monsters that guard lairs; each lair gets one at random. */
export const LAIR_MONSTERS = ["voidAmoeba", "latticeCrystal", "ionEel", "starHydra", "starWyrm"];

/**
 * What a lair's guarded planet is raised to (an asteroid belt or gas giant
 * there becomes a real planet first). The original raises size to medium or
 * large and minerals to rich or ultra rich, and some monsters' planets to a
 * terran or Gaia climate; which monster gets which is our reading.
 */
export const LAIR_PLANET_UPGRADE: Record<string, { size: PlanetSize; minerals: Minerals; climate?: PlanetType }> = {
  voidAmoeba: { size: "medium", minerals: "rich" },
  latticeCrystal: { size: "medium", minerals: "ultraRich" },
  ionEel: { size: "medium", minerals: "rich", climate: "terran" },
  starHydra: { size: "large", minerals: "rich", climate: "terran" },
  starWyrm: { size: "large", minerals: "ultraRich", climate: "gaia" },
};

/**
 * Slaying the Guardian: the elders' ship carries the Death Ray plus up to this many
 * other xenon technologies the victor lacks, picked at random from the xenon field.
 */
export const GUARDIAN_RANDOM_XENON = 3;

/**
 * The ship the Guardian guarded, given to the empire that slays it, as in the
 * original: a battleship with the elders' weapons and specials.
 */
export const AVENGER_DESIGN: ShipDesign = {
  id: "avenger", name: "Avenger", hull: "battleship", armor: "xentroniumArmor", shield: null, computer: "moleculartronicComputer",
  weapons: [
    { weaponId: "particleBeam", count: 4, mods: ["heavyMount"] },
    { weaponId: "deathRay", count: 2, mods: ["heavyMount"] },
    { weaponId: "particleBeam", count: 10 },
    { weaponId: "spatialCompressor", count: 2, arc: "full" },
    { weaponId: "particleBeam", count: 10, mods: ["pointDefense"] },
    { weaponId: "neutroniumBomb", count: 15, ammo: 10 },
  ],
  specials: ["damperField", "quantumDetonator", "subspaceTeleporter"], module: null, obsolete: true,
};

/** Score for the empire that slew the Guardian (see SCORE). */
export const GUARDIAN_SCORE = SCORE.orion;

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
  amoeba: { designId: elderId("voidAmoeba"), name: "Great Void Amoeba", effect: "engulf", speed: 3, stay: 25 },
  crystal: { designId: elderId("latticeCrystal"), name: "Great Lattice Crystal", effect: "killAll", speed: 2, stay: 25 },
  dragon: { designId: elderId("starWyrm"), name: "Great Star Wyrm", effect: "pillage", speed: 4, stay: 30 },
  eel: { designId: elderId("ionEel"), name: "Great Ion Eel", effect: "blockade", speed: 5, stay: 20 },
  hydra: { designId: elderId("starHydra"), name: "Great Star Hydra", effect: "kill", speed: 3, stay: 25 },
};

/** Share of colonists a hydra kills on arrival. */
export const HYDRA_KILL_SHARE = 0.5;
/** The wyrm asks this many BC per population unit of the system it threatens. */
export const DRAGON_BRIBE_PER_POP = 15;
/** Buildings a pillaging wyrm wrecks, and the share of colonists it kills. */
export const DRAGON_PILLAGE = { buildings: 3, popShare: 0.5 };
