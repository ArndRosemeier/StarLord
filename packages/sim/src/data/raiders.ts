import { SCORE } from "./score.js";
import type { Difficulty, TechLevel } from "../types.js";
import type { FiringArc, HullSize, WeaponModId } from "./components.js";

/**
 * The Vexari raiders: StarLord's take on the original's Antarans. They live in
 * a pocket dimension, raid colonies once a grace period is over and call the
 * survivors home after every raid. Beating their home fleet and citadel
 * through a Dimensional Portal wins the game.
 *
 * Everything here follows the original's decoded rules: a grace period set by
 * the starting tech level, two build budgets (raid pool and home fleet) that
 * grow every 25 turns, ships bought smallest first at fixed hull prices, a
 * launch gate on the value of the raid pool, and one fixed ship design per
 * hull that depends only on the difficulty level.
 */

/** No raids before this turn, by the game's starting tech level. */
export const RAID_GRACE_TURNS: Record<TechLevel, number> = { preWarp: 200, average: 100, advanced: 0 };
/** Every this many turns after the grace period the build budgets grow. */
export const RAID_BUDGET_PERIOD = 25;
/** Budget growth: ceil(mult × periods elapsed / 100) points each period, to each budget. */
export const RAID_BUDGET_MULT: Record<Difficulty, number> = { tutor: 100, easy: 100, average: 100, hard: 150, impossible: 200 };
/** The hulls the raiders build, smallest first; they never build doom stars. */
export const RAIDER_HULLS = ["frigate", "destroyer", "cruiser", "battleship", "titan"] as const satisfies readonly HullSize[];
export type RaiderHull = (typeof RAIDER_HULLS)[number];
/** Build points each ship costs. */
export const RAIDER_HULL_COST: Record<RaiderHull, number> = { frigate: 2, destroyer: 5, cruiser: 12, battleship: 30, titan: 75 };
/** Most ships of each hull in the raid pool. */
export const RAID_FLEET_CAP: Record<RaiderHull, number> = { frigate: 4, destroyer: 4, cruiser: 3, battleship: 2, titan: 2 };
/**
 * For hulls below this one, the raid pool's cap drops to 0 for good as soon as
 * a purchase (for either pool) brings that pool's count up to the cap: lost
 * frigates, destroyers and cruisers are never rebuilt, and a home fleet of 3
 * cruisers ends cruiser building for raids too (as in the original).
 */
export const RAID_CAP_LOCK_BELOW: RaiderHull = "battleship";
/** Ships the home fleet is built up to from its own budget. */
export const RAID_HOME_QUOTA: Record<RaiderHull, number> = { frigate: 0, destroyer: 0, cruiser: 3, battleship: 2, titan: 7 };
/** At least this many titans always guard the home system. */
export const RAID_HOME_MIN_TITANS = 1;
/** Frigates are bought only while turns since the grace period ended are at most this. */
export const RAID_FRIGATE_WINDOW: Record<Difficulty, number> = { tutor: 100, easy: 100, average: 100, hard: 83, impossible: 62 };
/** Destroyers are bought only while turns since the grace period ended are at most this. */
export const RAID_DESTROYER_WINDOW: Record<Difficulty, number> = { tutor: 199, easy: 199, average: 199, hard: 133, impossible: 100 };
/** In games started at this tech level the raiders never build frigates. */
export const RAID_NO_FRIGATES_AT: TechLevel = "advanced";
/** On these levels every hull price drops to this percent (rounded down) once, when the first titan is bought. */
export const RAID_TITAN_DISCOUNT: { difficulties: Difficulty[]; pct: number } = { difficulties: ["hard", "impossible"], pct: 90 };
/**
 * A raid can launch only while this many times the raid pool's value is at
 * least the home fleet's value plus both unspent budgets.
 */
export const RAID_LAUNCH_VALUE_MULT = 3;
/**
 * Each turn the gate is open and raid ships are waiting, a counter grows by
 * one; the raid goes when a roll of 1..LAUNCH_ROLL is at most the counter + 1.
 */
export const RAID_LAUNCH_ROLL = 200;
/** Most ships in one raid, picked largest hull first. */
export const RAID_MAX_SHIPS = 6;
/** Target empires are weighted by (population - smallest)²; a human's population counts this much by difficulty. */
export const RAID_HUMAN_POP_MULT: Record<Difficulty, number> = { tutor: 0.1, easy: 0.2, average: 1, hard: 1.5, impossible: 3 };
/** Lucky empires' population counts a third. */
export const RAID_LUCKY_POP_MULT = 1 / 3;
/** Target weights are halved until they add up to less than this. */
export const RAID_WEIGHT_LIMIT = 512;

/** Name of the raiders' hidden home system. */
export const RAIDER_HOME_NAME = "Vex Prime";

/** Technologies the raiders know: everything their ships and citadel carry. */
export const RAIDER_TECHS = [
  "titanHull", "hyperDrive", "xentroniumArmor", "moleculartronicComputer", "particleBeam", "deathRay", "spatialCompressor",
  "neutroniumBomb", "fighterBays", "blackHoleGenerator", "damperField", "quantumDetonator", "ecmJammer", "multiWaveEcm",
  "wideAreaJammer", "subspaceTeleporter", "reflectionField", "battleScanner", "heavyArmor", "reinforcedHull",
  "securityStations", "structuralAnalyzer",
];

export interface RaiderMount {
  weaponId: string;
  count: number;
  mods?: WeaponModId[];
  arc?: FiringArc;
  /** Shots per battle when not the weapon's own (the original fits the frigate's bomb with none). */
  ammo?: number;
}

export interface RaiderDesignSpec {
  weapons: RaiderMount[];
  /** Specials besides the ones every raider ship carries. */
  specials: string[];
  /** Jammer fitted by difficulty level, if any. */
  jammer: Partial<Record<Difficulty, string>>;
}

/** Every raider ship: no shield, Moleculartronic computer, Xentronium armor (the Hyper Drive comes with their technology). */
export const RAIDER_COMMON = {
  armor: "xentroniumArmor",
  computer: "moleculartronicComputer",
  specials: ["damperField", "quantumDetonator"],
};

const fwd = (weaponId: string, count: number, mods?: WeaponModId[]): RaiderMount => ({ weaponId, count, arc: "forward", ...(mods ? { mods } : {}) });
const all = (weaponId: string, count: number, mods?: WeaponModId[]): RaiderMount => ({ weaponId, count, arc: "full", ...(mods ? { mods } : {}) });
const HV: WeaponModId[] = ["heavyMount"];
const PD: WeaponModId[] = ["pointDefense"];

/**
 * One fixed design per hull, the same all game long; only the jammer depends
 * on the difficulty. Designs are filled directly and ignore hull space.
 */
export const RAIDER_DESIGNS: Record<RaiderHull, RaiderDesignSpec> = {
  // The original fits the frigate with a neutronium bomb but no ammunition for it, so it never drops a bomb.
  frigate: { weapons: [fwd("particleBeam", 2), { ...all("neutroniumBomb", 1), ammo: 0 }], specials: [], jammer: { hard: "ecmJammer", impossible: "ecmJammer" } },
  destroyer: {
    weapons: [fwd("particleBeam", 3), fwd("particleBeam", 1, HV), all("neutroniumBomb", 1)],
    specials: [], jammer: { hard: "ecmJammer", impossible: "multiWaveEcm" },
  },
  cruiser: {
    weapons: [fwd("particleBeam", 4), fwd("particleBeam", 2, HV), all("neutroniumBomb", 5), all("spatialCompressor", 2), all("fighterBays", 3)],
    specials: [], jammer: { average: "ecmJammer", hard: "multiWaveEcm", impossible: "wideAreaJammer" },
  },
  battleship: {
    weapons: [
      fwd("particleBeam", 10), fwd("particleBeam", 4, HV), fwd("neutroniumBomb", 15), all("spatialCompressor", 2),
      fwd("particleBeam", 10, PD), fwd("deathRay", 4),
    ],
    specials: ["subspaceTeleporter", "reflectionField"],
    jammer: { easy: "ecmJammer", average: "multiWaveEcm", hard: "wideAreaJammer", impossible: "wideAreaJammer" },
  },
  titan: {
    weapons: [
      fwd("particleBeam", 20), fwd("particleBeam", 5, HV), fwd("neutroniumBomb", 30), all("spatialCompressor", 3),
      fwd("particleBeam", 20, PD), fwd("deathRay", 5, HV),
      // The original's slot holds two counts, 1 and 12; StarLord fits the single generator of the first count.
      all("blackHoleGenerator", 1),
    ],
    specials: ["subspaceTeleporter", "reflectionField"],
    jammer: { tutor: "ecmJammer", easy: "multiWaveEcm", average: "wideAreaJammer", hard: "wideAreaJammer", impossible: "wideAreaJammer" },
  },
};

/** Raider ship names by hull. */
export const RAIDER_SHIP_NAMES: Record<RaiderHull, string> = {
  frigate: "Vexari Skiff",
  destroyer: "Vexari Lancer",
  cruiser: "Vexari Reaver",
  battleship: "Vexari Ravager",
  titan: "Vexari Dominator",
};

export const RAIDER_CITADEL_ID = "vexariCitadel";
export const RAIDER_CITADEL_NAME = "Vexari Citadel";

/**
 * The citadel guarding Vex Prime, rebuilt fresh before every battle: a star
 * fortress with 3600 armor and 3600 structure (Xentronium, Heavy Armor and
 * Reinforced Hull already counted), no shield, a Moleculartronic computer and
 * an elite crew. Its weapons fill shares of its weapon space (the shares add
 * up to more than the whole, as in the original), all firing all round.
 */
export const RAIDER_CITADEL = {
  armor: 3600,
  structure: 3600,
  computer: "moleculartronicComputer",
  /** Crew level: Elite. */
  crewLevel: 3,
  specials: ["battleScanner", "damperField", "quantumDetonator", "reflectionField", "heavyArmor", "reinforcedHull", "securityStations", "structuralAnalyzer"],
  /** Weapon space: 1200 × 5/4/2. */
  weaponSpace: 750,
  weapons: [
    { weaponId: "deathRay", mods: ["heavyMount"] as WeaponModId[], share: 1 / 2, max: 99 },
    { weaponId: "particleBeam", mods: [] as WeaponModId[], share: 1 / 4, max: 198 },
    { weaponId: "particleBeam", mods: ["pointDefense"] as WeaponModId[], share: 1 / 4, max: 198 },
    { weaponId: "particleBeam", mods: ["heavyMount"] as WeaponModId[], share: 1 / 2, max: 99 },
  ],
  sizeClass: 10,
};

/** Chance that scrapping one captured ship teaches one technology it carries that you lack. */
export const SCRAP_TECH_CHANCE = 0.5;

/** Score for the empire that destroys the raiders at home: the biggest bonus in the game. */
export const RAIDERS_DEFEATED_SCORE = SCORE.antares;
