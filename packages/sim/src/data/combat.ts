/** Numbers of the tactical combat rules. Distances are battlefield squares; speeds are squares per combat turn. */

export const FIELD_WIDTH = 48;
export const FIELD_HEIGHT = 32;
/** Battles end after this many combat turns even if both sides still stand. */
export const MAX_ROUNDS = 20;

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

/** Missiles and fighters carry the empire's best armor: hit points = this x armor multiplier. */
export const MISSILE_HP_PER_ARMOR = 2;
/** Beam defense of a missile per point of its speed. */
export const MISSILE_DEFENSE_PER_SPEED = 5;
/** Anti-missile rockets hit with this chance, minus a little per square. */
export const ANTI_MISSILE = { base: 0.85, perSquare: 0.05 } as const;
/** Plasma torpedoes lose this much damage per square travelled. */
export const TORPEDO_DISSIPATION = 5;

/** Fighter craft launched in squadrons of four. Speeds come from the bay; hit points scale with armor. */
export const SQUADRON_SIZE = 4;
export const CRAFT = {
  fighters: { hp: 2, shots: 4 },
  bombers: { hp: 3, shots: 1 },
  heavyFighters: { hp: 5, shots: 2 },
  shuttles: { hp: 3, shots: 0 },
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
 * Planets have no armor or structure; damage knocks out one installation at a time.
 * Each installation holds this many points times the owner's armor multiplier.
 */
export const PLANET_INSTALLATION_HP = 100;
/** Ground batteries and missile bases each hold this much space of weapons. */
export const PLANET_WEAPON_SPACE = 300;

/** Artemis System Net mines: chance per size class to strike an attacking ship, and damage per size class. */
export const ARTEMIS = { chancePerSize: 0.2, damagePerSize: 100 } as const;
