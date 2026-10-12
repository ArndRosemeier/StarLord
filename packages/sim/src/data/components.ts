/**
 * Ship hulls and components for the design screen, with the numbers of the
 * original game: hull space, cost, armor and structure; per-hull shield,
 * computer and special costs; weapon damage, space and cost; weapon
 * modifications; and the miniaturization tables that shrink components as
 * their field advances.
 */

export type HullSize = "frigate" | "destroyer" | "cruiser" | "battleship" | "titan" | "doomStar";
export type StationHull = "starBase" | "battlestation" | "starFortress";
export type HullId = HullSize | StationHull;

export interface HullDef<Id extends HullId = HullId> {
  id: Id;
  name: string;
  space: number;
  cost: number;
  /** Armor and structure points before the armor multiplier. */
  armor: number;
  structure: number;
  /** Marines aboard for boarding and repelling boarders. */
  marines: number;
  /** Hit points of the internal systems. */
  computerHP: number;
  driveHP: number;
  shieldGenHP: number;
  /**
   * Frigate 1 … titan 5, doom star 7; scales shields and several weapons. Stations fight as the ship hull named
   * by `asHull` (Star Base a cruiser, Battlestation a battleship, Star Fortress a titan) and take its size class.
   */
  sizeClass: number;
  /** Orbital stations: the ship hull whose size, internal hit points and explosion they use in combat. */
  asHull?: HullSize;
  /** Command points a ship uses, or a station adds. */
  commandPoints: number;
  requires: string | null;
  /** Beam defense of an immobile hull before its crew (stations): -20, as for any ship that cannot move. */
  fixedDefense?: number;
  /**
   * Weapon groups the game's automatic designs give this hull: beams, missiles, torpedoes and special weapons.
   * (The original's station rows carry these too, but only its auto-designer and auto-resolve read them; in
   * tactical combat a station splits its space as in `STATION_ARMS`.)
   */
  autoSlots: [beam: number, missile: number, torpedo: number, special: number];
}

export const HULLS: HullDef<HullSize>[] = [
  { id: "frigate", name: "Frigate", space: 25, cost: 20, armor: 4, structure: 4, marines: 5, computerHP: 1, driveHP: 2, shieldGenHP: 1, sizeClass: 1, commandPoints: 1, requires: null, autoSlots: [1, 0, 0, 0] },
  { id: "destroyer", name: "Destroyer", space: 60, cost: 70, armor: 10, structure: 10, marines: 8, computerHP: 2, driveHP: 5, shieldGenHP: 2, sizeClass: 2, commandPoints: 2, requires: null, autoSlots: [2, 0, 0, 0] },
  { id: "cruiser", name: "Cruiser", space: 120, cost: 250, armor: 30, structure: 30, marines: 12, computerHP: 5, driveHP: 10, shieldGenHP: 6, sizeClass: 3, commandPoints: 3, requires: null, autoSlots: [2, 1, 0, 2] },
  { id: "battleship", name: "Battleship", space: 250, cost: 600, armor: 50, structure: 50, marines: 20, computerHP: 7, driveHP: 15, shieldGenHP: 7, sizeClass: 4, commandPoints: 4, requires: null, autoSlots: [4, 2, 1, 5] },
  { id: "titan", name: "Titan", space: 500, cost: 1500, armor: 80, structure: 80, marines: 30, computerHP: 10, driveHP: 20, shieldGenHP: 10, sizeClass: 5, commandPoints: 5, requires: "titanHull", autoSlots: [6, 4, 3, 10] },
  { id: "doomStar", name: "Doom Star", space: 1200, cost: 4000, armor: 150, structure: 150, marines: 50, computerHP: 20, driveHP: 40, shieldGenHP: 20, sizeClass: 7, commandPoints: 6, requires: "doomStarHull", autoSlots: [10, 10, 5, 25] },
];

/** Orbital stations: built as colony buildings, fought as immobile units fitted with the owner's best weapons. */
export const STATION_HULLS: HullDef<StationHull>[] = [
  { id: "starBase", name: "Star Base", space: 300, cost: 400, armor: 60, structure: 60, marines: 20, computerHP: 5, driveHP: 0, shieldGenHP: 6, sizeClass: 3, asHull: "cruiser", commandPoints: 1, requires: "starBase", fixedDefense: -20, autoSlots: [3, 3, 0, 0] },
  { id: "battlestation", name: "Battlestation", space: 600, cost: 1000, armor: 90, structure: 90, marines: 40, computerHP: 7, driveHP: 0, shieldGenHP: 7, sizeClass: 4, asHull: "battleship", commandPoints: 2, requires: "battlestation", fixedDefense: -20, autoSlots: [6, 6, 0, 0] },
  { id: "starFortress", name: "Star Fortress", space: 1200, cost: 2500, armor: 120, structure: 120, marines: 80, computerHP: 10, driveHP: 0, shieldGenHP: 10, sizeClass: 5, asHull: "titan", commandPoints: 3, requires: "starFortress", fixedDefense: -20, autoSlots: [10, 10, 0, 0] },
];

/** Ships no colony can build without an orbital station: anything larger than a destroyer. */
export const STATION_DOCK_HULLS: HullSize[] = ["cruiser", "battleship", "titan", "doomStar"];

// ---------------------------------------------------------------- weapons

export type WeaponKind = "beam" | "missile" | "torpedo" | "bomb" | "spores" | "special" | "bay";

/** Built-in weapon traits from the original weapon table. */
export type WeaponTrait =
  | "noRangeDissipation"
  | "doubleRangePenalty"
  /** Damage goes to internal systems only; a quarter against monsters. */
  | "systemsOnly"
  /** Kills one marine per 5 damage that gets through shields. */
  | "killsMarines"
  /** Half of the penetrating damage again goes to structure. */
  | "extraStructural"
  | "continuous"
  | "shieldPiercing"
  | "enveloping"
  | "alwaysHits"
  /** Torpedo loses strength for every square it travels. */
  | "dissipates"
  /** Hits everything around the firing ship, ignoring shields. */
  | "area";

export type WeaponModId =
  | "heavyMount" | "pointDefense" | "armorPiercing" | "continuous" | "noRangeDissipation" | "shieldPiercing"
  | "autoFire" | "enveloping" | "mirv" | "eccm" | "armored" | "fast" | "emissionsGuidance" | "overloaded";

/** What a special weapon or bay does when it fires. */
export type WeaponEffect =
  | "spatialCompressor" | "stasis" | "antiMissile" | "gyro" | "plasmaWeb" | "pulsar" | "blackHole" | "stellarConverter"
  | "tractor" | "fighters" | "bombers" | "heavyFighters" | "shuttles";

export interface WeaponDef {
  id: string;
  name: string;
  kind: WeaponKind;
  /** Damage of one shot; special weapons may scale it by the target's size class. */
  damageMin: number;
  damageMax: number;
  /** Base space and cost of one weapon; missiles add their rack on top. */
  space: number;
  cost: number;
  /** Shots per battle (bombs, anti-missile rockets); missiles pick their rack size instead. */
  ammo?: number;
  /** Torpedoes fire every other combat turn. */
  reload?: number;
  /**
   * Squares per combat turn for missiles, torpedoes and craft; Infinity hits at once.
   * Missiles and craft add 2 for every drive beyond the Nuclear Drive.
   */
  speed?: number;
  /** Maximum reach in squares for weapons that are not range-banded beams. */
  range?: number;
  /** Damage a dissipating torpedo loses per square flown after the first (default: the Plasma Torpedo's). */
  dissipation?: number;
  traits?: WeaponTrait[];
  /** Modifications this weapon may take. */
  mods: WeaponModId[];
  effect?: WeaponEffect;
  /** Damage is multiplied by the target's size class. */
  perSize?: boolean;
  requires: string;
}

const BEAM_ALL: WeaponModId[] = ["heavyMount", "pointDefense", "armorPiercing", "continuous", "noRangeDissipation", "autoFire"];
const MISSILE_MODS: WeaponModId[] = ["mirv", "eccm", "armored", "fast", "emissionsGuidance"];

export const WEAPONS: WeaponDef[] = [
  { id: "massDriver", name: "Mass Driver", kind: "beam", damageMin: 6, damageMax: 6, space: 10, cost: 7, traits: ["noRangeDissipation"], mods: ["heavyMount", "pointDefense", "armorPiercing", "autoFire"], requires: "massDriver" },
  { id: "laserCannon", name: "Laser Cannon", kind: "beam", damageMin: 1, damageMax: 4, space: 10, cost: 5, mods: BEAM_ALL, requires: "laserCannon" },
  { id: "fusionBeam", name: "Fusion Beam", kind: "beam", damageMin: 2, damageMax: 6, space: 10, cost: 6, traits: ["doubleRangePenalty"], mods: ["heavyMount", "pointDefense", "continuous", "enveloping"], requires: "fusionBeam" },
  { id: "neutronBlaster", name: "Neutron Blaster", kind: "beam", damageMin: 3, damageMax: 12, space: 10, cost: 8, traits: ["killsMarines"], mods: ["heavyMount", "continuous"], requires: "neutronBlaster" },
  { id: "ionPulseCannon", name: "Ion Pulse Cannon", kind: "beam", damageMin: 2, damageMax: 10, space: 30, cost: 15, traits: ["systemsOnly"], mods: ["continuous", "autoFire"], requires: "ionPulseCannon" },
  { id: "gravitonBeam", name: "Graviton Beam", kind: "beam", damageMin: 3, damageMax: 15, space: 15, cost: 12, traits: ["extraStructural"], mods: ["heavyMount", "continuous"], requires: "gravitonBeam" },
  { id: "gaussCannon", name: "Gauss Cannon", kind: "beam", damageMin: 18, damageMax: 18, space: 10, cost: 10, traits: ["noRangeDissipation"], mods: ["heavyMount", "armorPiercing", "autoFire"], requires: "gaussCannon" },
  { id: "particleBeam", name: "Particle Beam", kind: "beam", damageMin: 10, damageMax: 30, space: 15, cost: 35, traits: ["shieldPiercing"], mods: ["heavyMount", "pointDefense", "continuous"], requires: "particleBeam" },
  { id: "phasor", name: "Phasor", kind: "beam", damageMin: 5, damageMax: 20, space: 10, cost: 10, mods: ["heavyMount", "pointDefense", "continuous", "shieldPiercing", "autoFire"], requires: "phasor" },
  { id: "plasmaCannon", name: "Plasma Cannon", kind: "beam", damageMin: 6, damageMax: 30, space: 25, cost: 15, traits: ["doubleRangePenalty", "enveloping"], mods: ["heavyMount", "continuous"], requires: "plasmaCannon" },
  { id: "disruptorCannon", name: "Disrupter Cannon", kind: "beam", damageMin: 40, damageMax: 40, space: 20, cost: 25, traits: ["noRangeDissipation"], mods: ["heavyMount", "autoFire"], requires: "disruptorCannon" },
  { id: "deathRay", name: "Death Ray", kind: "beam", damageMin: 50, damageMax: 100, space: 30, cost: 75, traits: ["killsMarines", "continuous"], mods: ["heavyMount"], requires: "deathRay" },
  { id: "maulerDevice", name: "Mauler Device", kind: "beam", damageMin: 100, damageMax: 100, space: 50, cost: 75, traits: ["doubleRangePenalty", "alwaysHits"], mods: ["heavyMount"], requires: "maulerDevice" },

  { id: "nuclearMissile", name: "Nuclear Missile", kind: "missile", damageMin: 8, damageMax: 8, space: 0, cost: 0, speed: 12, mods: MISSILE_MODS, requires: "nuclearMissile" },
  { id: "merculiteMissile", name: "Merculite Missile", kind: "missile", damageMin: 14, damageMax: 14, space: 0, cost: 0, speed: 12, mods: MISSILE_MODS, requires: "merculiteMissile" },
  { id: "pulsonMissile", name: "Pulson Missile", kind: "missile", damageMin: 20, damageMax: 20, space: 0, cost: 0, speed: 12, mods: MISSILE_MODS, requires: "pulsonMissile" },
  { id: "zeonMissile", name: "Zeon Missile", kind: "missile", damageMin: 30, damageMax: 30, space: 0, cost: 0, speed: 12, mods: MISSILE_MODS, requires: "zeonMissile" },

  { id: "antimatterTorpedo", name: "Anti-Matter Torpedo", kind: "torpedo", damageMin: 25, damageMax: 25, space: 20, cost: 15, reload: 2, speed: 20, mods: ["enveloping", "eccm", "fast", "overloaded"], requires: "antimatterTorpedo" },
  { id: "protonTorpedo", name: "Proton Torpedo", kind: "torpedo", damageMin: 40, damageMax: 40, space: 30, cost: 20, reload: 2, speed: Infinity, range: 24, mods: ["enveloping", "eccm", "overloaded"], requires: "protonTorpedo" },
  { id: "plasmaTorpedo", name: "Plasma Torpedo", kind: "torpedo", damageMin: 120, damageMax: 120, space: 40, cost: 75, reload: 2, speed: 24, traits: ["dissipates"], mods: ["noRangeDissipation", "enveloping", "eccm", "overloaded"], requires: "plasmaTorpedo" },

  { id: "nuclearBomb", name: "Nuclear Bomb", kind: "bomb", damageMin: 3, damageMax: 12, space: 5, cost: 3, ammo: 10, mods: [], requires: "nuclearBomb" },
  { id: "fusionBomb", name: "Fusion Bomb", kind: "bomb", damageMin: 4, damageMax: 24, space: 7, cost: 5, ammo: 10, mods: [], requires: "fusionBomb" },
  { id: "antimatterBomb", name: "Anti-Matter Bomb", kind: "bomb", damageMin: 5, damageMax: 40, space: 7, cost: 6, ammo: 10, mods: [], requires: "antimatterBomb" },
  { id: "neutroniumBomb", name: "Neutronium Bomb", kind: "bomb", damageMin: 10, damageMax: 60, space: 10, cost: 9, ammo: 10, mods: [], requires: "neutroniumBomb" },
  { id: "deathSpores", name: "Death Spores", kind: "spores", damageMin: 1, damageMax: 1, space: 5, cost: 5, ammo: 10, mods: [], requires: "deathSpores" },
  { id: "doomVirus", name: "Bio-Terminator", kind: "spores", damageMin: 2, damageMax: 2, space: 7, cost: 8, ammo: 10, mods: [], requires: "bioTerminator" },

  { id: "antiMissileRockets", name: "Anti-Missile Rockets", kind: "special", damageMin: 0, damageMax: 0, space: 20, cost: 5, ammo: 20, range: 15, effect: "antiMissile", mods: [], requires: "antiMissileRockets" },
  { id: "tractorBeam", name: "Tractor Beam", kind: "special", damageMin: 0, damageMax: 0, space: 30, cost: 20, range: 12, effect: "tractor", mods: [], requires: "tractorBeam" },
  { id: "gyroDestabilizer", name: "Gyro Destabilizer", kind: "special", damageMin: 1, damageMax: 4, space: 75, cost: 50, range: 15, perSize: true, effect: "gyro", mods: [], requires: "gyroDestabilizer" },
  { id: "plasmaWeb", name: "Plasma Web", kind: "special", damageMin: 5, damageMax: 25, space: 40, cost: 40, range: 15, effect: "plasmaWeb", mods: [], requires: "plasmaWeb" },
  { id: "pulsar", name: "Pulsar", kind: "special", damageMin: 2, damageMax: 24, space: 50, cost: 30, range: 3, perSize: true, traits: ["area"], effect: "pulsar", mods: [], requires: "pulsar" },
  { id: "spatialCompressor", name: "Spatial Compressor", kind: "special", damageMin: 4, damageMax: 32, space: 50, cost: 40, range: 3, traits: ["area"], effect: "spatialCompressor", mods: [], requires: "spatialCompressor" },
  { id: "stasisField", name: "Stasis Field", kind: "special", damageMin: 0, damageMax: 0, space: 75, cost: 75, range: 3, effect: "stasis", mods: [], requires: "stasisField" },
  { id: "blackHoleGenerator", name: "Black Hole Generator", kind: "special", damageMin: 0, damageMax: 0, space: 150, cost: 150, range: 15, effect: "blackHole", mods: [], requires: "blackHoleGenerator" },
  { id: "stellarConverter", name: "Stellar Converter", kind: "special", damageMin: 400, damageMax: 400, space: 500, cost: 500, traits: ["alwaysHits", "enveloping", "noRangeDissipation"], effect: "stellarConverter", mods: [], requires: "stellarConverter" },

  { id: "fighterBays", name: "Fighter Bays", kind: "bay", damageMin: 0, damageMax: 0, space: 30, cost: 10, speed: 10, effect: "fighters", mods: [], requires: "fighterBays" },
  { id: "bomberBays", name: "Bomber Bays", kind: "bay", damageMin: 0, damageMax: 0, space: 60, cost: 30, speed: 8, effect: "bombers", mods: [], requires: "bomberBays" },
  { id: "heavyFighterBays", name: "Heavy Fighter Bays", kind: "bay", damageMin: 0, damageMax: 0, space: 80, cost: 50, speed: 8, effect: "heavyFighters", mods: [], requires: "heavyFighterBays" },
  { id: "assaultShuttles", name: "Assault Shuttles", kind: "bay", damageMin: 0, damageMax: 0, space: 25, cost: 10, speed: 6, effect: "shuttles", mods: [], requires: "assaultShuttles" },
];

/** Missile racks: shots per battle and the base space and cost they add to each missile. */
export const MISSILE_RACKS: { shots: number; space: number }[] = [
  { shots: 2, space: 10 },
  { shots: 5, space: 20 },
  { shots: 10, space: 30 },
  { shots: 15, space: 35 },
  { shots: 20, space: 40 },
];
export const DEFAULT_MISSILE_SHOTS = 5;

export interface WeaponModDef {
  id: WeaponModId;
  name: string;
  abbr: string;
  /** Percent added to space and cost; heavy mount and point defense multiply the base instead. */
  pct: number;
  multipliesBase: boolean;
  /** Miniaturization levels the weapon needs before it can take this mod. */
  refinement: number;
  /** Tech needed besides refinement. */
  requires?: string;
  /** Mods that cannot be combined with this one. */
  excludes?: WeaponModId[];
}

export const WEAPON_MODS: WeaponModDef[] = [
  { id: "heavyMount", name: "Heavy Mount", abbr: "HV", pct: 100, multipliesBase: true, refinement: 0, excludes: ["pointDefense"] },
  { id: "pointDefense", name: "Point Defense", abbr: "PD", pct: -50, multipliesBase: true, refinement: 0, excludes: ["heavyMount"] },
  { id: "armorPiercing", name: "Armor Piercing", abbr: "AP", pct: 50, multipliesBase: false, refinement: 1 },
  { id: "continuous", name: "Continuous", abbr: "CO", pct: 50, multipliesBase: false, refinement: 1 },
  { id: "noRangeDissipation", name: "No Range Dissipation", abbr: "NR", pct: 25, multipliesBase: false, refinement: 1 },
  { id: "shieldPiercing", name: "Shield Piercing", abbr: "SP", pct: 50, multipliesBase: false, refinement: 1 },
  { id: "autoFire", name: "Autofire", abbr: "AF", pct: 50, multipliesBase: false, refinement: 2 },
  { id: "enveloping", name: "Enveloping", abbr: "ENV", pct: 100, multipliesBase: false, refinement: 2 },
  { id: "mirv", name: "MIRV", abbr: "MV", pct: 100, multipliesBase: false, refinement: 2 },
  { id: "eccm", name: "ECCM", abbr: "ECCM", pct: 25, multipliesBase: false, refinement: 1 },
  { id: "armored", name: "Armored", abbr: "ARM", pct: 25, multipliesBase: false, refinement: 1 },
  { id: "fast", name: "Fast", abbr: "FST", pct: 25, multipliesBase: false, refinement: 1 },
  { id: "emissionsGuidance", name: "Emissions Guidance", abbr: "EMG", pct: 300, multipliesBase: false, refinement: 0, requires: "emissionsGuidance" },
  { id: "overloaded", name: "Overloaded", abbr: "OVR", pct: 50, multipliesBase: false, refinement: 1 },
];

/** Combat numbers of the weapon modifications. */
export const MOD_EFFECTS = {
  heavyMountDamagePct: 50,
  pointDefenseDamagePct: -50,
  /** Hit-roll bonus of continuous fire and point defense. */
  continuousToHit: 25,
  pointDefenseToHit: 25,
  autoFireShots: 3,
  autoFireToHit: -20,
  mirvWarheads: 4,
  fastSpeed: 4,
  overloadedDamagePct: 50,
  armoredHpMult: 2,
} as const;

/** Beams may fire in a wider arc for more space and cost. */
export type FiringArc = "forward" | "forwardExtended" | "back" | "backExtended" | "full";
export const ARCS: Record<FiringArc, { name: string; pct: number; /** Half-width in degrees around its centre. */ half: number; back: boolean }> = {
  forward: { name: "Forward", pct: 0, half: 60, back: false },
  back: { name: "Back", pct: 0, half: 60, back: true },
  forwardExtended: { name: "Forward extended", pct: 25, half: 120, back: false },
  backExtended: { name: "Back extended", pct: 25, half: 120, back: true },
  full: { name: "All round", pct: 50, half: 180, back: false },
};

// ---------------------------------------------------------------- miniaturization

/** Percent of base space and cost by refinement level (fields researched after the item's own); 5+ uses the last. */
export const MINIATURIZATION = {
  /** Beams, missiles, bombs and shields. */
  space0: [100, 80, 65, 50, 35, 25],
  /** Torpedoes, special weapons and specials. */
  space1: [100, 80, 70, 60, 50, 40],
  cost: [100, 75, 55, 40, 30, 25],
} as const;

/** Items whose space never shrinks. */
export const NEVER_SHRINKS = new Set([
  "fighterBays", "bomberBays", "heavyFighterBays", "assaultShuttles",
  "augmentedEngines", "extendedFuelTanks", "heavyArmor", "reinforcedHull", "troopPods",
]);

// ---------------------------------------------------------------- armor, shields, computers, drives

export interface ArmorDef {
  id: string;
  name: string;
  /** Multiplies the hull's armor and structure. Armor itself is free. */
  mult: number;
  requires: string;
}

export const ARMORS: ArmorDef[] = [
  { id: "titaniumArmor", name: "Titanium", mult: 1, requires: "titaniumArmor" },
  { id: "tritaniumArmor", name: "Tritanium", mult: 2, requires: "tritaniumArmor" },
  { id: "zortriumArmor", name: "Zortrium", mult: 4, requires: "zortriumArmor" },
  { id: "neutroniumArmor", name: "Neutronium", mult: 6, requires: "neutroniumArmor" },
  { id: "adamantiumArmor", name: "Adamantium", mult: 8, requires: "adamantiumArmor" },
  { id: "xentroniumArmor", name: "Xentronium", mult: 10, requires: "xentroniumArmor" },
];

/** Space and cost of a shield generator and a combat computer by hull, frigate … doom star. */
export const SHIELD_SPACE_BY_HULL = [5, 10, 20, 50, 100, 200];
export const SHIELD_COST_BY_HULL = [3, 5, 10, 25, 50, 100];
export const COMPUTER_COST_BY_HULL = [5, 15, 50, 125, 300, 800];

export interface ShieldDef {
  id: string;
  name: string;
  /** Shield class: damage taken off every hit; each facing holds class x 5 x size class points. */
  absorb: number;
  requires: string;
}

export const SHIELDS: ShieldDef[] = [
  { id: "classIShield", name: "Class I", absorb: 1, requires: "classIShield" },
  { id: "classIIIShield", name: "Class III", absorb: 3, requires: "classIIIShield" },
  { id: "classVShield", name: "Class V", absorb: 5, requires: "classVShield" },
  { id: "classVIIShield", name: "Class VII", absorb: 7, requires: "classVIIShield" },
  { id: "classXShield", name: "Class X", absorb: 10, requires: "classXShield" },
];

export interface ComputerDef {
  id: string;
  name: string;
  /** Beam attack bonus while the computer is intact. */
  attack: number;
  requires: string;
}

export const COMPUTERS: ComputerDef[] = [
  { id: "electronicComputer", name: "Electronic", attack: 25, requires: "electronicComputer" },
  { id: "optronicComputer", name: "Optronic", attack: 50, requires: "optronicComputer" },
  { id: "positronicComputer", name: "Positronic", attack: 75, requires: "positronicComputer" },
  { id: "cyberneticComputer", name: "Cybertronic", attack: 100, requires: "cyberneticComputer" },
  { id: "moleculartronicComputer", name: "Moleculartronic", attack: 125, requires: "moleculartronicComputer" },
];

export interface DriveDef {
  tech: string;
  name: string;
  /** Parsecs per turn on the galaxy map. */
  speed: number;
  /** Combat speed by hull (frigate … doom star) when fully loaded and when empty; designs fall between. */
  combatFull: number[];
  combatEmpty: number[];
}

/** Speed comes from the best drive known; drives take no space and cost nothing. */
export const DRIVES: DriveDef[] = [
  { tech: "nuclearDrive", name: "Nuclear", speed: 2, combatFull: [10, 8, 6, 5, 4, 3], combatEmpty: [20, 18, 16, 15, 14, 13] },
  { tech: "fusionDrive", name: "Fusion", speed: 3, combatFull: [12, 10, 8, 7, 6, 5], combatEmpty: [22, 20, 18, 17, 16, 15] },
  { tech: "ionDrive", name: "Ion", speed: 4, combatFull: [14, 12, 10, 9, 8, 7], combatEmpty: [24, 22, 20, 19, 18, 17] },
  { tech: "antimatterDrive", name: "Anti-Matter", speed: 5, combatFull: [16, 14, 12, 11, 10, 9], combatEmpty: [26, 24, 22, 21, 20, 19] },
  { tech: "hyperDrive", name: "Hyper", speed: 6, combatFull: [18, 16, 14, 13, 12, 11], combatEmpty: [28, 26, 24, 23, 22, 21] },
  { tech: "interphasedDrive", name: "Interphased", speed: 7, combatFull: [20, 18, 16, 15, 14, 13], combatEmpty: [30, 28, 26, 25, 24, 23] },
];

export const FUEL_RANGES: { tech: string; range: number }[] = [
  { tech: "standardFuelCells", range: 4 },
  { tech: "deuteriumFuelCells", range: 6 },
  { tech: "iridiumFuelCells", range: 9 },
  { tech: "uridiumFuelCells", range: 12 },
  { tech: "thoriumFuelCells", range: 99 },
];

/** Scanners lower the missile evasion of the ships they fire at. */
export const SCANNER_ECCM: { tech: string; value: number }[] = [
  { tech: "tachyonScanner", value: 20 },
  { tech: "neutronScanner", value: 40 },
  { tech: "sensors", value: 70 },
];

/** Hull space added by Megafluxers once the tech is known. */
export const MEGAFLUXER_SPACE_PCT = 25;

// ---------------------------------------------------------------- specials

export interface SpecialEffects {
  /** Beam attack points (Battle Scanner). */
  beamAttack?: number;
  /** Beam defense points (Inertial Stabilizer, Nullifier). */
  beamDefense?: number;
  /** Beam defense while the ship has not fired (cloaks). */
  cloakDefense?: number;
  /** Rounds a phasing cloak makes the ship untouchable before it works like a normal cloak. */
  phasing?: number;
  missileEvasion?: number;
  /** Missile evasion given to the rest of the fleet (Wide Area Jammer). */
  fleetMissileEvasion?: number;
  combatSpeed?: number;
  armorMult?: number;
  /** Multiplies structure and drive hit points. */
  structureMult?: number;
  /** Extra damage taken off every hit; also immune to shield piercing and keeps shields in nebulas. */
  hardShields?: number;
  shieldStrengthMult?: number;
  /** Extra shield regeneration per turn, as a fraction of the facing strength. */
  shieldRegen?: number;
  /** Fraction of incoming damage removed (Damper Field leaves a quarter, Energy Absorber takes a quarter). */
  damageTaken?: number;
  absorber?: number;
  /** Chance that any weapon aimed at the ship misses. */
  displacement?: number;
  /** Reflection field strength; reflects with chance strength / (damage + strength). */
  reflection?: number;
  beamDamagePct?: number;
  /** Multiplies damage that gets through shields. */
  penetratingMult?: number;
  /** Bypasses armor and weights weapon and shield systems when choosing internal hits. */
  achilles?: number;
  /** Range divided by this for to-hit. */
  rangeDivisor?: number;
  /** Fraction of armor and structure, and of internal systems, repaired each combat turn. */
  repair?: number;
  repairSystems?: number;
  /** Beams fire twice every other turn. */
  hyperX?: boolean;
  /** Missiles fire two volleys every other turn. */
  fastRacks?: boolean;
  /** Chance to destroy each incoming missile, torpedo or fighter. */
  lightning?: number;
  marinesMult?: number;
  /** Bonus to the ship's marines when repelling boarders. */
  boardingDefense?: number;
  extraTurn?: boolean;
  /** Squares the ship can jump once per turn. */
  teleport?: number;
  /** Hull space added, percent. */
  hullSpacePct?: number;
  fuelRangePct?: number;
  /** Enemies cannot retreat from the battle. */
  warpDissipator?: boolean;
  /** Explosion damage multiplier and self-destruct chance on capture. */
  detonator?: number;
  /** Attack bonus per size class against monsters, for the whole fleet. */
  monsterAttackPerSize?: number;
  /** Research per turn by hull: 1, 2, 4, 8, 16, 32. */
  scoutLab?: boolean;
  transporters?: number;
  /** Hidden from enemy scanners on the galaxy map. */
  stealth?: boolean;
  /** Fraction of the movement cost of turning (stabilizer halves, nullifier removes it). */
  turnCost?: number;
}

export interface SpecialDef {
  id: string;
  name: string;
  /** Space and cost by hull, frigate … doom star. */
  space: number[];
  cost: number[];
  effects: SpecialEffects;
  /** Specials that cannot share a ship with this one. */
  excludes?: string[];
  requires: string;
}

const S_10 = [10, 15, 25, 50, 100, 250];
const S_12 = [12, 18, 30, 60, 125, 325];
const S_15 = [15, 25, 40, 75, 150, 375];
const C_5 = [5, 7, 12, 25, 50, 125];
const C_15 = [15, 22, 37, 75, 150, 375];
const C_22 = [22, 40, 60, 100, 225, 500];

export const SPECIALS: SpecialDef[] = [
  { id: "achillesTargetingUnit", name: "Achilles Targeting Unit", space: S_10, cost: C_15, effects: { achilles: 3 }, requires: "achillesTargetingUnit" },
  { id: "augmentedEngines", name: "Augmented Engines", space: S_10, cost: C_5, effects: { combatSpeed: 5 }, requires: "augmentedEngines" },
  { id: "automatedRepairUnit", name: "Automated Repair Unit", space: S_10, cost: S_10, effects: { repair: 0.2, repairSystems: 0.1 }, requires: "automatedRepairUnit" },
  { id: "battlePods", name: "Battle Pods", space: [-12, -30, -60, -125, -250, -600], cost: [20, 60, 175, 400, 800, 2500], effects: { hullSpacePct: 50 }, requires: "battlePods" },
  { id: "battleScanner", name: "Battle Scanner", space: S_12, cost: C_5, effects: { beamAttack: 50 }, requires: "battleScanner" },
  { id: "cloakingDevice", name: "Cloaking Device", space: S_12, cost: S_12, effects: { cloakDefense: 80 }, excludes: ["phasingCloak"], requires: "cloakingDevice" },
  { id: "damperField", name: "Damper Field", space: [5, 7, 12, 25, 50, 125], cost: [7, 10, 18, 40, 75, 190], effects: { damageTaken: 0.25 }, excludes: ["hardShields", "multiPhasedShields", "shieldCapacitors"], requires: "damperField" },
  { id: "displacementDevice", name: "Displacement Device", space: S_10, cost: [15, 22, 40, 75, 150, 375], effects: { displacement: 0.3 }, requires: "displacementDevice" },
  { id: "ecmJammer", name: "ECM Jammer", space: S_10, cost: C_5, effects: { missileEvasion: 70 }, excludes: ["multiWaveEcm", "wideAreaJammer"], requires: "ecmJammer" },
  { id: "energyAbsorber", name: "Energy Absorber", space: S_12, cost: S_12, effects: { absorber: 0.25 }, requires: "energyAbsorber" },
  { id: "extendedFuelTanks", name: "Extended Fuel Tanks", space: S_12, cost: [5, 10, 15, 30, 60, 100], effects: { fuelRangePct: 50 }, requires: "extendedFuelTanks" },
  { id: "fastMissileRacks", name: "Fast Missile Racks", space: S_10, cost: S_10, effects: { fastRacks: true }, requires: "fastMissileRacks" },
  { id: "hardShields", name: "Hard Shields", space: S_10, cost: S_10, effects: { hardShields: 3 }, excludes: ["damperField"], requires: "hardShields" },
  { id: "heavyArmor", name: "Heavy Armor", space: S_10, cost: C_5, effects: { armorMult: 3 }, requires: "heavyArmor" },
  { id: "highEnergyFocus", name: "High Energy Focus", space: S_10, cost: S_10, effects: { beamDamagePct: 50 }, requires: "highEnergyFocus" },
  { id: "hyperXCapacitors", name: "Hyper-X Capacitors", space: S_10, cost: S_10, effects: { hyperX: true }, requires: "hyperXCapacitors" },
  { id: "inertialNullifier", name: "Inertial Nullifier", space: S_15, cost: C_22, effects: { beamDefense: 100, missileEvasion: 50, turnCost: 0 }, excludes: ["inertialStabilizer"], requires: "inertialNullifier" },
  { id: "inertialStabilizer", name: "Inertial Stabilizer", space: S_15, cost: C_5, effects: { beamDefense: 50, missileEvasion: 25, turnCost: 0.5 }, excludes: ["inertialNullifier"], requires: "inertialStabilizer" },
  { id: "lightningField", name: "Lightning Field", space: S_10, cost: S_10, effects: { lightning: 0.5 }, requires: "lightningField" },
  { id: "multiPhasedShields", name: "Multi-Phased Shields", space: S_10, cost: S_10, effects: { shieldStrengthMult: 1.5 }, excludes: ["damperField"], requires: "multiPhasedShields" },
  { id: "multiWaveEcm", name: "Multi-Wave ECM Jammer", space: S_10, cost: S_10, effects: { missileEvasion: 100 }, excludes: ["ecmJammer", "wideAreaJammer"], requires: "multiWaveEcm" },
  { id: "phaseShifter", name: "Phase Shifter", space: S_10, cost: C_15, effects: { teleport: 18 }, excludes: ["subspaceTeleporter"], requires: "phaseShifter" },
  { id: "phasingCloak", name: "Phasing Cloak", space: S_15, cost: C_22, effects: { phasing: 10, cloakDefense: 80 }, excludes: ["cloakingDevice"], requires: "phasingCloak" },
  { id: "quantumDetonator", name: "Quantum Detonator", space: [2, 3, 7, 15, 30, 75], cost: [3, 5, 10, 22, 45, 100], effects: { detonator: 3 }, requires: "quantumDetonator" },
  { id: "rangemasterUnit", name: "Rangemaster Unit", space: S_10, cost: S_10, effects: { rangeDivisor: 3 }, requires: "rangemasterUnit" },
  { id: "reflectionField", name: "Reflection Field", space: S_10, cost: C_15, effects: { reflection: 15 }, requires: "reflectionField" },
  { id: "reinforcedHull", name: "Reinforced Hull", space: S_10, cost: C_5, effects: { structureMult: 3 }, requires: "reinforcedHull" },
  { id: "scoutLab", name: "Scout Lab", space: [12, 20, 40, 75, 150, 375], cost: [7, 12, 20, 37, 75, 180], effects: { scoutLab: true, monsterAttackPerSize: 10 }, requires: "scoutLab" },
  { id: "securityStations", name: "Security Stations", space: [5, 7, 12, 25, 50, 125], cost: [2, 3, 6, 12, 25, 70], effects: { boardingDefense: 20 }, requires: "securityStations" },
  { id: "shieldCapacitors", name: "Shield Capacitors", space: S_10, cost: S_10, effects: { shieldRegen: 0.7 }, excludes: ["damperField"], requires: "shieldCapacitors" },
  { id: "stealthField", name: "Stealth Field", space: S_10, cost: S_10, effects: { stealth: true }, requires: "stealthField" },
  { id: "structuralAnalyzer", name: "Structural Analyzer", space: [7, 10, 18, 40, 75, 190], cost: S_10, effects: { penetratingMult: 2 }, requires: "structuralAnalyzer" },
  { id: "subspaceTeleporter", name: "Subspace Teleporter", space: S_10, cost: C_15, effects: { teleport: 20 }, excludes: ["phaseShifter"], requires: "subspaceTeleporter" },
  { id: "timeWarpFacilitator", name: "Time Warp Facilitator", space: S_15, cost: C_22, effects: { extraTurn: true }, requires: "timeWarpFacilitator" },
  { id: "transporters", name: "Transporters", space: S_10, cost: C_5, effects: { transporters: 12 }, requires: "transporters" },
  { id: "troopPods", name: "Troop Pods", space: S_12, cost: C_5, effects: { marinesMult: 2 }, requires: "troopPods" },
  { id: "warpDissipator", name: "Warp Dissipator", space: S_15, cost: S_15, effects: { warpDissipator: true }, requires: "warpDissipator" },
  { id: "wideAreaJammer", name: "Wide Area Jammer", space: [20, 30, 50, 100, 200, 500], cost: [20, 30, 50, 100, 200, 500], effects: { missileEvasion: 130, fleetMissileEvasion: 70 }, excludes: ["ecmJammer", "multiWaveEcm"], requires: "wideAreaJammer" },
];

/** Specials that have no hit points of their own and cannot be knocked out. */
export const UNHITTABLE_SPECIALS = new Set(["battlePods", "extendedFuelTanks", "heavyArmor", "quantumDetonator", "reinforcedHull"]);

export const HULLS_BY_ID = Object.fromEntries([...HULLS, ...STATION_HULLS].map((h) => [h.id, h])) as Record<HullSize, HullDef<HullSize>> & Record<StationHull, HullDef<StationHull>>;
export const WEAPONS_BY_ID: Record<string, WeaponDef> = Object.fromEntries(WEAPONS.map((w) => [w.id, w]));
export const WEAPON_MODS_BY_ID = Object.fromEntries(WEAPON_MODS.map((m) => [m.id, m])) as Record<WeaponModId, WeaponModDef>;
export const ARMORS_BY_ID: Record<string, ArmorDef> = Object.fromEntries(ARMORS.map((a) => [a.id, a]));
export const SHIELDS_BY_ID: Record<string, ShieldDef> = Object.fromEntries(SHIELDS.map((s) => [s.id, s]));
export const COMPUTERS_BY_ID: Record<string, ComputerDef> = Object.fromEntries(COMPUTERS.map((c) => [c.id, c]));
export const SPECIALS_BY_ID: Record<string, SpecialDef> = Object.fromEntries(SPECIALS.map((s) => [s.id, s]));

/** Research points a Scout Lab makes each turn, by hull (frigate … doom star). */
export const SCOUT_LAB_RESEARCH = [1, 2, 4, 8, 16, 32] as const;

/** Index into the per-hull tables (frigate 0 … doom star 5); stations use the doom star column. */
export function hullIndex(hull: HullId): number {
  const i = HULLS.findIndex((h) => h.id === hull);
  return i < 0 ? HULLS.length - 1 : i;
}

// ---------------------------------------------------------------- support ships

/**
 * Colony ships, outpost ships and transports are fixed designs, as in the
 * original: they are not built in the ship designer but picked straight from
 * the build list. Each is a frigate hull with the empire's best armor and
 * drive and no weapons, priced 500 (colony ship), 100 (outpost ship) and 100
 * (transport) before the government's ship cost; the hull itself is free.
 * They use command points like the smallest warship.
 */
export const MODULES: Record<"colony" | "outpost" | "transport", { name: string; cost: number; troops: number }> = {
  colony: { name: "Colony Ship", cost: 500, troops: 0 },
  outpost: { name: "Outpost Ship", cost: 100, troops: 0 },
  transport: { name: "Transport", cost: 100, troops: 4 },
};
/** The hull every support ship is built on. */
export const SUPPORT_HULL: HullSize = "frigate";
export const SUPPORT_SHIP_COMMAND_POINTS = 1;
