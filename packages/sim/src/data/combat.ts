/** Numbers of the tactical combat rules. Distances are battlefield squares; speeds are squares per combat turn. */

export const FIELD_WIDTH = 81;
export const FIELD_HEIGHT = 68;
/** Columns the attacking and defending fleets deploy around; about 30 squares apart. */
export const DEPLOY_COLUMNS = [25, 55] as const;
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

/** Shields regain this fraction of their facing strength every combat turn. */
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
/** Anti-missile rockets hit with this chance, minus a little per square. */
export const ANTI_MISSILE = { base: 0.85, perSquare: 0.05 } as const;
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
  fighters: { hp: 2, shots: 4, speed: 10 },
  bombers: { hp: 4, shots: 1, speed: 8 },
  heavyFighters: { hp: 5, shots: 2, speed: 8 },
  shuttles: { hp: 3, shots: 0, speed: 6 },
  /** Turns a bay needs to recover and rearm a squadron. */
  rearm: 3,
} as const;

/** Black hole: the trapped ship is lost if the generator keeps it this many turns. */
export const BLACK_HOLE_TURNS = 2;
/** Plasma web damage fades by this much each turn. */
export const PLASMA_WEB_DECAY = 5;

/** Fleet bonuses of the side whose orbital station is in the fight. */
export const STATION_FLEET_BONUS: Record<string, { attack: number; defense: number }> = {
  battlestation: { attack: 10, defense: 0 },
  starFortress: { attack: 20, defense: 20 },
};

/**
 * Planets have no armor or structure. Damage past the planetary shield fills a
 * pool; every (this + 50 per armor class of the owner) points knock out one
 * installation at random.
 */
export const PLANET_INSTALLATION_HP = 100;
export const PLANET_INSTALLATION_ARMOR_STEP = 50;
/** Ground batteries and missile bases each hold this much space of weapons. */
export const PLANET_WEAPON_SPACE = 300;

/** Artemis System Net mines: chance per size class to strike an attacking ship, and damage per size class. */
export const ARTEMIS = { chancePerSize: 0.2, damagePerSize: 100 } as const;

/**
 * Ship damage stays between battles. Advanced Damage Control (and a cybernetic
 * race, an Engineer captain or an Automated Repair Unit) repairs it all after a
 * battle; otherwise ships are repaired once they spend a turn at a system with
 * one of their owner's colonies (repair.ts).
 */
export const REPAIR = {
  fullRepairTech: "advancedDamageControl",
} as const;
