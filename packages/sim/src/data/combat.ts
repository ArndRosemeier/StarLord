/** Numbers of the tactical combat rules. Distances are battlefield squares; speeds are squares per combat turn. */

export const FIELD_WIDTH = 81;
export const FIELD_HEIGHT = 68;
/**
 * Deployment, as the original sets up a battle, in two columns about 30
 * squares apart. The attacker takes the right
 * column and the defender the left, unless the attacker is a human player, who
 * is always drawn on the left. The defending planet sits 15 squares behind a
 * left-hand column (10 behind a right-hand one), its station 11 squares in
 * front of a left-hand planet (4 in front of a right-hand one). Ships go in by
 * size, largest first, filling the column outward from its centre row
 * alternately below and above; the rows are 2 apart for frigates, 3 for
 * destroyers and cruisers, 4 for battleships and larger. A full column steps
 * 3 squares back. These are the original's top-left squares, used here as
 * positions.
 */
export const DEPLOY = {
  leftColumn: 25,
  rightColumn: 55,
  planetOffset: { left: -15, right: 10 },
  planetRow: 34,
  stationOffset: { left: 11, right: -4 },
  stationRow: 35,
  centreRow: 34,
  minRow: 4,
  maxRow: 64,
  columnStepBack: 3,
  /** Row spacing by hull, frigate … doom star. */
  rowStep: [2, 3, 3, 4, 4, 4],
} as const;
/** After this many combat turns a battle ends and the defender holds the field. */
export const MAX_ROUNDS = 51;

/** Combat dice: every roll is 1 to this. */
export const DIE = 100;

/**
 * Crew experience. A level is reached at its XP; it adds to beam attack and
 * beam defense (half of that against missiles) and to boarding rolls.
 */
export const CREW = {
  names: ["Green", "Regular", "Veteran", "Elite", "Ultra-Elite"],
  xp: [0, 50, 150, 500, 1000],
  attack: [0, 15, 30, 50, 75],
  defense: [0, 15, 30, 50, 75],
  boarding: [0, 5, 10, 15, 20],
  /** XP is cut back to this every turn, so normal crews stop at Elite. */
  xpCap: 500,
  /** Every ship gains this much each turn, plus its own Space Academies' training at its star while in orbit. */
  xpPerTurn: 1,
  /** Raider crews are veterans. */
  raiderXp: 151,
} as const;

/** Range band = (edge-to-edge distance + 2) / 3, rounded down; beams cannot reach past the last band. */
export const RANGE_BANDS = {
  toHit: [0, 0, -10, -20, -30, -40, -55, -70, -85],
  damagePct: [0, 0, -10, -20, -30, -40, -50, -60, -65],
} as const;
export const MAX_BAND = RANGE_BANDS.toHit.length - 1;

export const BEAM_HIT = {
  /** A beam hits when roll + attack - defense reaches this, plus the range penalty. */
  threshold: 40,
  /** Rolls above this are never modified, so every shot keeps a small chance. */
  unmodifiedAbove: 95,
  maxThreshold: 95,
} as const;

/** Beam defense per point of combat speed, and the penalty for being unable to move. */
export const DEFENSE_PER_SPEED = 5;
export const IMMOBILE_DEFENSE = -20;

/** Ship beams (not missiles, torpedoes or bombs) do this fraction of their damage to planets. */
export const PLANET_BEAM_DAMAGE = 0.5;

/** Each combat turn a ship regains this fraction of one facing's strength, shared out a point at a time over its weakened facings. */
export const SHIELD_REGEN = 0.3;
export const SHIELD_FACINGS = 4;

/** Cost in movement points of turning 22.5 degrees. */
export const TURN_COST_PER_STEP = 2;
/** Orbital stations turn this far each combat turn to keep their best shield toward the enemy. */
export const STATION_TURN_DEG = 45;

/** Missile speed: this plus a step per drive above the first; torpedoes keep their own speed. */
export const MISSILE_SPEED = { base: 12, perDrive: 2 } as const;
/** Hit points of each missile; torpedoes have 5. Armored missiles have twice as many. */
export const MISSILE_HP: Record<string, number> = {
  nuclearMissile: 4, merculiteMissile: 8, pulsonMissile: 12, zeonMissile: 16,
};
export const TORPEDO_HP = 5;
/** Beam defense of a missile per point of its speed, plus a bonus by type. */
export const MISSILE_DEFENSE_PER_SPEED = 5;
export const MISSILE_DEFENSE_BONUS: Record<string, number> = {
  nuclearMissile: -10, merculiteMissile: 15, pulsonMissile: 40, zeonMissile: 70,
};
/** Torpedoes do this fraction of their damage to planets. */
export const PLANET_TORPEDO_DAMAGE = 0.5;
/**
 * Each anti-missile rocket (one of the mount's 20 shots) downs an incoming
 * missile when a d100 roll is below base - floor((band + 2) x 10 / 3), the band
 * being the missile's range band from the ship: 64% as it strikes.
 */
export const ANTI_MISSILE = { base: 71, perBandStep: 10 / 3 } as const;
/** Plasma torpedoes lose this much damage per square travelled after the first. */
export const TORPEDO_DISSIPATION = 5;

/**
 * Fighter craft launched in squadrons of four per bay. Speed = base + 2 per
 * drive above the first. Hit points = hp x (100 + armor bonus) / 100, where the
 * armor bonus rises 50 per armor class (Titanium 0 ... Xentronium 250).
 */
export const SQUADRON_SIZE = 4;
export const CRAFT_SPEED_PER_DRIVE = 2;
export const CRAFT_ARMOR_STEP = 50;
export const CRAFT = {
  /** Shots are attack passes: every craft fires once a combat turn at its target until they are spent. */
  fighters: { hp: 2, shots: 4, speed: 10 },
  bombers: { hp: 4, shots: 1, speed: 8 },
  /** Heavy fighters make two passes, each with a beam shot and a bomb. */
  heavyFighters: { hp: 5, shots: 2, speed: 8 },
  shuttles: { hp: 3, shots: 0, speed: 6 },
  /** Turns a bay needs to recover and rearm a squadron (an estimate: the rearm time is not decoded). */
  rearm: 3,
  /**
   * Craft beam attack = this + the owner's best computer + race and side
   * attack bonuses. A pass hits when d100 (above 95 counts as 100) + attack -
   * defense reaches hitAt; the damage climbs from the beam's least to its most
   * over the rest of the roll. Craft beam defense = 5 x speed + race defense.
   */
  attackBase: 50,
  hitAt: 40,
  /** Rolls above this count as the full die. */
  sureAbove: 95,
} as const;

/**
 * Black hole: the trapped ship's counter starts at 1 and rises at the end of
 * every combat turn; the ship is lost when it reaches this, at the end of the
 * second turn after the one it was caught in.
 */
export const BLACK_HOLE_TURNS = 3;
/**
 * Pulsar and Spatial Compressor go off when an enemy is within their range
 * and strike every other unit (friends too, but not the planet) within this
 * many squares, plus missiles and craft (an estimate: the original uses the
 * blast sprite's size). A missile or craft is wrecked with chance damage x 25
 * / its hit points percent; craft are skipped half the time.
 */
export const AREA_BLAST_RADIUS = 3;
export const AREA_BLAST_PROJECTILE = { pctPerDamage: 25, craftSkip: 0.5 } as const;
/** Phasing cloak: turns of its own the ship stays phased out before it works as a normal cloak. */
export const PHASING_TURNS = 10;
/** Plasma web damage fades by this much each turn. */
export const PLASMA_WEB_DECAY = 5;

/**
 * Beam attack points every unit of a side gets from an immobile unit of that
 * side, by the immobile unit's hull size (frigate 0 … titan 4): a station
 * fighting as a battleship (Battlestation) gives +10, as a titan (Star
 * Fortress) +20, as a cruiser (Star Base) nothing. Flat points, beam attack
 * only, recomputed every combat turn; the last such unit in battle order
 * counts. The planet fights as size 3, so (likely, as the original's code
 * reads) a defended planet with no station gives +10, and a Star Base after it
 * resets that to 0.
 */
export const SIDE_ATTACK_BY_IMMOBILE_SIZE: readonly number[] = [0, 0, 0, 10, 20, 0];

/** Stations and the planet are crewed by Regulars (crew level 1). */
export const DEFENSE_CREW_LEVEL = 1;
/** Hull size (0x25) the original gives the planet unit once it is deployed: a battleship. */
export const PLANET_SIZE_INDEX = 3;

/**
 * How an orbital station is armed: its hull space (x1.25 with Megafluxers),
 * a quarter as heavy mounts of the best beam, an eighth as plain mounts of it
 * and an eighth as point-defense mounts of the best point-defense beam (all
 * firing all round, but priced as an extended arc), and half as 20-shot racks
 * of the best missile with ECCM, plus Fast and Armored once refined that far.
 */
export const STATION_ARMS = {
  megafluxerMult: 1.25,
  heavyBeamShare: 1 / 4,
  plainBeamShare: 1 / 8,
  pointDefenseShare: 1 / 8,
  missileShare: 1 / 2,
  missileRack: 20,
  maxMissiles: 90,
  missilesPerSlot: 30,
  maxPerSlot: 99,
} as const;

/**
 * Specials a station gets for free when its owner knows them, in this order,
 * at most `STATION_MAX_SPECIALS`. A group lists alternatives, best first: only
 * the first one known is fitted.
 */
export const STATION_FREE_SPECIALS: readonly (string | readonly string[])[] = [
  "heavyArmor", "reinforcedHull", "shieldCapacitors", "hardShields", "multiPhasedShields",
  ["wideAreaJammer", "multiWaveEcm", "ecmJammer"],
  "warpDissipator", "securityStations", "battleScanner", "highEnergyFocus", "structuralAnalyzer",
  "achillesTargetingUnit", "rangemasterUnit", "transporters",
];
export const STATION_MAX_SPECIALS = 8;
/** Heavy Armor triples a station's armor, Reinforced Hull its structure. */
export const STATION_HEAVY_ARMOR_MULT = 3;
export const STATION_REINFORCED_MULT = 3;

/**
 * Ground Batteries: 225 space of heavy mounts of the best beam, with Armor
 * Piercing, Continuous, Shield Piercing and No Range Dissipation once refined
 * that far, and 75 space of the best point-defense beam with Continuous and
 * Shield Piercing. Priced without an arc premium; they fire all round.
 */
export const GROUND_BATTERY_SPACE = { beam: 225, pointDefense: 75 } as const;
/**
 * Missile Base: 300 space of the best missile in 5-shot racks with Fast and
 * Armored once refined that far (ECCM is free). From 11 launchers up they are
 * split over two slots of half as many each. Each has 125 shots.
 */
export const MISSILE_BASE = { space: 300, rack: 5, shots: 125, splitFrom: 11 } as const;

/**
 * Planets have no armor or structure. Damage past the planetary shield fills a
 * pool; every (this + 50 per armor class of the owner) points knock out one
 * installation at random.
 */
export const PLANET_INSTALLATION_HP = 100;
export const PLANET_INSTALLATION_ARMOR_STEP = 50;

/**
 * Retreat. A ship ordered to retreat escapes at the start of its next
 * activation; until then it can still be shot or boarded. Computer empires
 * order their side out when one volley of the enemy would take more than this
 * many times the share of their hit points that their own volley takes of the
 * enemy's. An armed planet's hit points count this many times over.
 */
export const RETREAT = { volleyRatio: 5, planetHpMult: 3 } as const;

/**
 * Boarding. Transporters reach targets up to range band 4 (about 12 squares)
 * whose facing shield is down; without them a ship boards only a target in
 * band 1 (3 squares) that cannot move, ignoring shields. A party is half the
 * ship's marines; transporters beaming into a Damper Field at range lose two
 * thirds of it. The game picks capture or hit-and-run from an estimate of
 * one marine against one: hopeless at 20 below the defender, capture when the
 * party is not outnumbered and within 10 of the defender.
 */
export const BOARDING = {
  transporterBand: 4,
  adjacentBand: 1,
  partyShare: 0.5,
  damperDivisor: 3,
  hopelessBelow: 20,
  captureWithin: 10,
  /** Hit-and-run: each marine rolls against a defender; past these margins it sabotages, kills or dies. */
  raid: { sabotageAbove: 20, systems: 2, systemDamage: 50, killAbove: 50, dieBelow: -50 },
  /** Chance a ship with a Quantum Detonator blows itself up when taken. */
  detonatorChance: 0.5,
} as const;

/**
 * A ship whose drive is destroyed (and any ship with a Quantum Detonator)
 * explodes: 5 x the drive hit points of its hull row (x3 with the detonator),
 * falling off as 1 - d^2 / R^2 with distance d. The original takes R from the
 * explosion sprite; 5 squares is an estimate.
 */
export const EXPLOSION = { perDriveHP: 5, detonatorMult: 3, radius: 5 } as const;

/**
 * Artemis System Net mines, from the original's help: the chance (%) to strike
 * an attacking ship by hull (frigate … doom star), and damage rolled in this
 * range before shields.
 */
export const ARTEMIS = { chanceByHull: [20, 30, 40, 50, 80, 100], damage: [100, 500] } as const;

/**
 * Ship damage stays between battles. Advanced Damage Control (and a cybernetic
 * race, an Engineer captain or an Automated Repair Unit) repairs it all after a
 * battle; otherwise ships are repaired once they spend a turn at a system with
 * one of their owner's colonies (repair.ts).
 */
export const REPAIR = {
  fullRepairTech: "advancedDamageControl",
} as const;

/**
 * The damage routine. Damage past armor goes to an internal system with
 * chance S x 100 / (structure left + S) percent, S = half the drive's hit
 * points plus those of the computer, weapons, specials and shield generator
 * (at most monsterSystemCap for monsters); otherwise to structure. A system
 * takes what it can hold and the rest is placed again (a drive passes its
 * excess to structure). Every point on structure or a system kills a marine
 * with crewCasualty chance.
 */
export const DAMAGE = {
  crewCasualty: 0.01,
  monsterSystemCap: 25,
  /** Energy Absorber: takes a quarter of each hit (at least 1) and adds it to the ship's next shot. */
  absorberShare: 0.25,
} as const;

/**
 * Bombs in battle drop only on the planet, from up to this many squares (more
 * with Transporters); each volley uses one of the rack's shots.
 */
export const COMBAT_BOMB_RANGE = { normal: 3, transporters: 12 } as const;
/** Once a planet's installations are gone, every this much damage past its shield is one bombing hit on the colony. */
export const PLANET_POPULATION_HP = 100;
/** Combat turns a victorious fleet bombards a planet after the battle; all its weapons fire and the planet does not answer. */
export const BOMBARD_ROUNDS = 10;
/**
 * A unit's footprint in squares by hull size (frigate 1x1, destroyer and
 * cruiser 2x2, battleship and larger 3x3; a planet 3x3). Range is measured
 * between the nearest squares of the two footprints.
 */
export const FOOTPRINT = { byHull: [1, 2, 2, 3, 3, 3], planet: 3 } as const;

/**
 * How the original's computer players pick which enemy colony at a star to
 * attack (FUN_000e7dae): score = colony value x min(our strength / theirs,
 * cap)^2. Value here is population (outposts count `outpostValue`), times
 * `mindControlBonus` where a telepath can take it.
 */
export const ATTACK_TARGET = { ratioCap: 3, outpostValue: 1, mindControlBonus: 2 } as const;
