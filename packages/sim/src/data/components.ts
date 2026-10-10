/**
 * Ship hulls and components for the design screen. Values follow MoO2 in
 * spirit: bigger hulls carry more and are easier to hit; better tech makes old
 * components smaller and cheaper (miniaturization).
 */

export type HullSize = "frigate" | "destroyer" | "cruiser" | "battleship" | "titan" | "doomStar";

export interface HullDef {
  id: HullSize;
  name: string;
  space: number;
  cost: number;
  structure: number;
  /** Armor hit points per armor multiplier. */
  armorBase: number;
  /** Beam defense from size alone. */
  defense: number;
  commandPoints: number;
  requires: string | null;
}

export const HULLS: HullDef[] = [
  { id: "frigate", name: "Frigate", space: 25, cost: 10, structure: 3, armorBase: 3, defense: 40, commandPoints: 1, requires: null },
  { id: "destroyer", name: "Destroyer", space: 60, cost: 30, structure: 8, armorBase: 8, defense: 25, commandPoints: 1, requires: null },
  { id: "cruiser", name: "Cruiser", space: 120, cost: 60, structure: 20, armorBase: 20, defense: 15, commandPoints: 2, requires: null },
  { id: "battleship", name: "Battleship", space: 250, cost: 120, structure: 50, armorBase: 50, defense: 0, commandPoints: 3, requires: null },
  { id: "titan", name: "Titan", space: 500, cost: 250, structure: 120, armorBase: 120, defense: -10, commandPoints: 5, requires: "titanHull" },
  { id: "doomStar", name: "Doom Star", space: 1200, cost: 600, structure: 300, armorBase: 300, defense: -25, commandPoints: 10, requires: "doomStarHull" },
];

export type WeaponKind = "beam" | "missile" | "torpedo" | "bomb" | "spores";

export interface WeaponDef {
  id: string;
  name: string;
  kind: WeaponKind;
  damageMin: number;
  damageMax: number;
  space: number;
  cost: number;
  /** Combat range in battlefield squares; beams lose damage past half range. */
  range: number;
  /** Missiles and torpedoes fire a limited number of volleys per battle. */
  ammo?: number;
  /** Damage that ignores shields. */
  pierce?: number;
  requires: string;
}

export const WEAPONS: WeaponDef[] = [
  { id: "laserCannon", name: "Laser Cannon", kind: "beam", damageMin: 1, damageMax: 4, space: 10, cost: 10, range: 8, requires: "laserCannon" },
  { id: "massDriver", name: "Mass Driver", kind: "beam", damageMin: 2, damageMax: 5, space: 12, cost: 12, range: 8, requires: "massDriver" },
  { id: "fusionBeam", name: "Fusion Beam", kind: "beam", damageMin: 2, damageMax: 6, space: 12, cost: 14, range: 8, requires: "fusionBeam" },
  { id: "ionPulseCannon", name: "Ion Pulse Cannon", kind: "beam", damageMin: 3, damageMax: 8, space: 15, cost: 18, range: 8, requires: "ionPulseCannon" },
  { id: "neutronBlaster", name: "Neutron Blaster", kind: "beam", damageMin: 3, damageMax: 12, space: 15, cost: 20, range: 8, requires: "neutronBlaster" },
  { id: "gravitonBeam", name: "Graviton Beam", kind: "beam", damageMin: 1, damageMax: 15, space: 15, cost: 22, range: 9, requires: "gravitonBeam" },
  { id: "gaussCannon", name: "Gauss Cannon", kind: "beam", damageMin: 6, damageMax: 14, space: 20, cost: 28, range: 9, requires: "gaussCannon" },
  { id: "phasor", name: "Phasor", kind: "beam", damageMin: 5, damageMax: 20, space: 20, cost: 30, range: 10, requires: "phasor" },
  { id: "plasmaCannon", name: "Plasma Cannon", kind: "beam", damageMin: 6, damageMax: 30, space: 25, cost: 40, range: 10, requires: "plasmaCannon" },
  { id: "disruptorCannon", name: "Disruptor Cannon", kind: "beam", damageMin: 10, damageMax: 40, space: 30, cost: 50, range: 10, requires: "disruptorCannon" },
  { id: "deathRay", name: "Death Ray", kind: "beam", damageMin: 20, damageMax: 60, space: 30, cost: 60, range: 12, requires: "deathRay" },
  { id: "stellarConverter", name: "Stellar Converter", kind: "beam", damageMin: 40, damageMax: 80, space: 80, cost: 150, range: 12, pierce: 40, requires: "stellarConverter" },

  { id: "nuclearMissile", name: "Nuclear Missile", kind: "missile", damageMin: 8, damageMax: 8, space: 10, cost: 10, range: 20, ammo: 3, requires: "nuclearMissile" },
  { id: "merculiteMissile", name: "Merculite Missile", kind: "missile", damageMin: 10, damageMax: 10, space: 11, cost: 12, range: 20, ammo: 3, requires: "merculiteMissile" },
  { id: "pulsonMissile", name: "Pulson Missile", kind: "missile", damageMin: 14, damageMax: 14, space: 12, cost: 15, range: 20, ammo: 3, requires: "pulsonMissile" },
  { id: "zeonMissile", name: "Zeon Missile", kind: "missile", damageMin: 20, damageMax: 20, space: 14, cost: 20, range: 20, ammo: 3, requires: "zeonMissile" },

  { id: "antimatterTorpedo", name: "Anti-Matter Torpedo", kind: "torpedo", damageMin: 30, damageMax: 30, space: 25, cost: 35, range: 14, ammo: 4, requires: "antimatterTorpedo" },
  { id: "protonTorpedo", name: "Proton Torpedo", kind: "torpedo", damageMin: 40, damageMax: 40, space: 30, cost: 45, range: 14, ammo: 4, pierce: 10, requires: "protonTorpedo" },
  { id: "plasmaTorpedo", name: "Plasma Torpedo", kind: "torpedo", damageMin: 60, damageMax: 60, space: 35, cost: 60, range: 14, ammo: 4, pierce: 20, requires: "plasmaTorpedo" },

  { id: "nuclearBomb", name: "Nuclear Bomb", kind: "bomb", damageMin: 3, damageMax: 12, space: 8, cost: 6, range: 1, requires: "nuclearBomb" },
  { id: "fusionBomb", name: "Fusion Bomb", kind: "bomb", damageMin: 4, damageMax: 16, space: 9, cost: 8, range: 1, requires: "fusionBomb" },
  { id: "antimatterBomb", name: "Anti-Matter Bomb", kind: "bomb", damageMin: 5, damageMax: 20, space: 10, cost: 10, range: 1, requires: "antimatterBomb" },
  { id: "neutroniumBomb", name: "Neutronium Bomb", kind: "bomb", damageMin: 7, damageMax: 28, space: 12, cost: 14, range: 1, requires: "neutroniumBomb" },
  { id: "deathSpores", name: "Death Spores", kind: "spores", damageMin: 1, damageMax: 1, space: 10, cost: 10, range: 1, requires: "deathSpores" },
  { id: "doomVirus", name: "Doom Virus", kind: "spores", damageMin: 2, damageMax: 2, space: 10, cost: 15, range: 1, requires: "bioTerminator" },
];

export interface ArmorDef {
  id: string;
  name: string;
  mult: number;
  requires: string;
}

export const ARMORS: ArmorDef[] = [
  { id: "titaniumArmor", name: "Titanium", mult: 1, requires: "titaniumArmor" },
  { id: "tritaniumArmor", name: "Tritanium", mult: 2, requires: "tritaniumArmor" },
  { id: "zortriumArmor", name: "Zortrium", mult: 3, requires: "zortriumArmor" },
  { id: "neutroniumArmor", name: "Neutronium", mult: 4, requires: "neutroniumArmor" },
  { id: "adamantiumArmor", name: "Adamantium", mult: 5, requires: "adamantiumArmor" },
  { id: "xentroniumArmor", name: "Xentronium", mult: 7, requires: "xentroniumArmor" },
];

export interface ShieldDef {
  id: string;
  name: string;
  /** Damage stopped per hit. */
  absorb: number;
  /** Space as a fraction of hull space. */
  spaceFraction: number;
  costPerSpace: number;
  requires: string;
}

export const SHIELDS: ShieldDef[] = [
  { id: "classIShield", name: "Class I", absorb: 1, spaceFraction: 0.05, costPerSpace: 1, requires: "classIShield" },
  { id: "classIIIShield", name: "Class III", absorb: 3, spaceFraction: 0.07, costPerSpace: 1.2, requires: "classIIIShield" },
  { id: "classVShield", name: "Class V", absorb: 5, spaceFraction: 0.09, costPerSpace: 1.4, requires: "classVShield" },
  { id: "classVIIShield", name: "Class VII", absorb: 7, spaceFraction: 0.11, costPerSpace: 1.6, requires: "classVIIShield" },
  { id: "classXShield", name: "Class X", absorb: 10, spaceFraction: 0.13, costPerSpace: 1.8, requires: "classXShield" },
];

export interface ComputerDef {
  id: string;
  name: string;
  attack: number;
  spaceFraction: number;
  costPerSpace: number;
  requires: string;
}

export const COMPUTERS: ComputerDef[] = [
  { id: "electronicComputer", name: "Electronic", attack: 25, spaceFraction: 0.05, costPerSpace: 1, requires: "electronicComputer" },
  { id: "optronicComputer", name: "Optronic", attack: 50, spaceFraction: 0.05, costPerSpace: 1.2, requires: "optronicComputer" },
  { id: "positronicComputer", name: "Positronic", attack: 75, spaceFraction: 0.05, costPerSpace: 1.4, requires: "positronicComputer" },
  { id: "cyberneticComputer", name: "Cybernetic", attack: 100, spaceFraction: 0.05, costPerSpace: 1.6, requires: "cyberneticComputer" },
  { id: "moleculartronicComputer", name: "Moleculartronic", attack: 125, spaceFraction: 0.05, costPerSpace: 1.8, requires: "moleculartronicComputer" },
];

/** Speed comes from the best drive known; it is not a design choice. */
export const DRIVES: { tech: string; name: string; speed: number; combatSpeed: number }[] = [
  { tech: "nuclearDrive", name: "Nuclear", speed: 2, combatSpeed: 3 },
  { tech: "fusionDrive", name: "Fusion", speed: 3, combatSpeed: 4 },
  { tech: "ionDrive", name: "Ion", speed: 4, combatSpeed: 5 },
  { tech: "antimatterDrive", name: "Anti-Matter", speed: 5, combatSpeed: 6 },
  { tech: "hyperDrive", name: "Hyper", speed: 6, combatSpeed: 7 },
  { tech: "interphasedDrive", name: "Interphased", speed: 8, combatSpeed: 8 },
];

export const FUEL_RANGES: { tech: string; range: number }[] = [
  { tech: "standardFuelCells", range: 4 },
  { tech: "deuteriumFuelCells", range: 6 },
  { tech: "iridiumFuelCells", range: 9 },
  { tech: "uridiumFuelCells", range: 12 },
  { tech: "thoriumFuelCells", range: 99 },
];

export interface SpecialEffects {
  attack?: number;
  defense?: number;
  /** Chance to dodge missiles and torpedoes. */
  missileEvasion?: number;
  /** Chance to shoot down each incoming missile. */
  pointDefense?: number;
  structureMult?: number;
  armorMult?: number;
  /** Fraction of max hit points repaired each combat round. */
  repair?: number;
  combatSpeed?: number;
  /** Fraction of shields ignored by this ship's weapons. */
  shieldPierce?: number;
  /** Chance enemy shots miss entirely. */
  displacement?: number;
  /** Extra damage per beam hit. */
  damageBonus?: number;
  /** Planet bombardment multiplier. */
  bombBonus?: number;
  troops?: number;
}

export interface SpecialDef {
  id: string;
  name: string;
  /** Space as a fraction of hull space. */
  spaceFraction: number;
  costPerSpace: number;
  effects: SpecialEffects;
  requires: string;
}

export const SPECIALS: SpecialDef[] = [
  { id: "reinforcedHull", name: "Reinforced Hull", spaceFraction: 0.1, costPerSpace: 0.5, effects: { structureMult: 2 }, requires: "reinforcedHull" },
  { id: "heavyArmor", name: "Heavy Armor", spaceFraction: 0.1, costPerSpace: 1, effects: { armorMult: 1.5 }, requires: "heavyArmor" },
  { id: "antiMissileRockets", name: "Anti-Missile Rockets", spaceFraction: 0.08, costPerSpace: 1, effects: { pointDefense: 0.4 }, requires: "antiMissileRockets" },
  { id: "ecmJammer", name: "ECM Jammer", spaceFraction: 0.06, costPerSpace: 1, effects: { missileEvasion: 0.3 }, requires: "ecmJammer" },
  { id: "multiWaveEcm", name: "Multi-Wave ECM", spaceFraction: 0.08, costPerSpace: 1.2, effects: { missileEvasion: 0.55 }, requires: "multiWaveEcm" },
  { id: "battleScanner", name: "Battle Scanner", spaceFraction: 0.06, costPerSpace: 1, effects: { attack: 25 }, requires: "battleScanner" },
  { id: "inertialStabilizer", name: "Inertial Stabilizer", spaceFraction: 0.08, costPerSpace: 1, effects: { defense: 25, combatSpeed: 1 }, requires: "inertialStabilizer" },
  { id: "augmentedEngines", name: "Augmented Engines", spaceFraction: 0.1, costPerSpace: 1, effects: { combatSpeed: 2, defense: 10 }, requires: "augmentedEngines" },
  { id: "advancedDamageControl", name: "Advanced Damage Control", spaceFraction: 0.1, costPerSpace: 1, effects: { repair: 0.1 }, requires: "advancedDamageControl" },
  { id: "automatedRepairUnit", name: "Automated Repair Unit", spaceFraction: 0.1, costPerSpace: 1.2, effects: { repair: 0.2 }, requires: "automatedRepairUnit" },
  { id: "structuralAnalyzer", name: "Structural Analyzer", spaceFraction: 0.08, costPerSpace: 1.2, effects: { damageBonus: 2 }, requires: "structuralAnalyzer" },
  { id: "achillesTargetingUnit", name: "Achilles Targeting Unit", spaceFraction: 0.08, costPerSpace: 1.5, effects: { shieldPierce: 0.5 }, requires: "achillesTargetingUnit" },
  { id: "rangemasterUnit", name: "Rangemaster Unit", spaceFraction: 0.06, costPerSpace: 1, effects: { attack: 15 }, requires: "rangemasterUnit" },
  { id: "emissionsGuidance", name: "Emissions Guidance", spaceFraction: 0.06, costPerSpace: 1, effects: { attack: 20 }, requires: "emissionsGuidance" },
  { id: "highEnergyFocus", name: "High Energy Focus", spaceFraction: 0.08, costPerSpace: 1.2, effects: { damageBonus: 3 }, requires: "highEnergyFocus" },
  { id: "energyAbsorber", name: "Energy Absorber", spaceFraction: 0.08, costPerSpace: 1.2, effects: { defense: 15 }, requires: "energyAbsorber" },
  { id: "megafluxers", name: "Megafluxers", spaceFraction: 0.06, costPerSpace: 1, effects: { combatSpeed: 2 }, requires: "megafluxers" },
  { id: "warpDissipator", name: "Warp Dissipator", spaceFraction: 0.06, costPerSpace: 1, effects: { defense: 10 }, requires: "warpDissipator" },
  { id: "stealthField", name: "Stealth Field", spaceFraction: 0.08, costPerSpace: 1.2, effects: { defense: 20 }, requires: "stealthField" },
  { id: "cloakingDevice", name: "Cloaking Device", spaceFraction: 0.1, costPerSpace: 1.5, effects: { defense: 40 }, requires: "cloakingDevice" },
  { id: "displacementDevice", name: "Displacement Device", spaceFraction: 0.1, costPerSpace: 1.5, effects: { displacement: 0.33 }, requires: "displacementDevice" },
  { id: "lightningField", name: "Lightning Field", spaceFraction: 0.08, costPerSpace: 1.2, effects: { pointDefense: 0.6 }, requires: "lightningField" },
  { id: "tractorBeam", name: "Tractor Beam", spaceFraction: 0.08, costPerSpace: 1, effects: { attack: 10 }, requires: "tractorBeam" },
  { id: "battlePods", name: "Battle Pods", spaceFraction: 0.05, costPerSpace: 0.5, effects: { structureMult: 1.25 }, requires: "battlePods" },
  { id: "troopPods", name: "Troop Pods", spaceFraction: 0.2, costPerSpace: 0.4, effects: { troops: 2 }, requires: "troopPods" },
  { id: "assaultShuttles", name: "Assault Shuttles", spaceFraction: 0.15, costPerSpace: 0.6, effects: { troops: 3 }, requires: "assaultShuttles" },
  { id: "bomberBays", name: "Bomber Bays", spaceFraction: 0.12, costPerSpace: 1, effects: { bombBonus: 1 }, requires: "bomberBays" },
];

export const HULLS_BY_ID = Object.fromEntries(HULLS.map((h) => [h.id, h])) as Record<HullSize, HullDef>;
export const WEAPONS_BY_ID: Record<string, WeaponDef> = Object.fromEntries(WEAPONS.map((w) => [w.id, w]));
export const ARMORS_BY_ID: Record<string, ArmorDef> = Object.fromEntries(ARMORS.map((a) => [a.id, a]));
export const SHIELDS_BY_ID: Record<string, ShieldDef> = Object.fromEntries(SHIELDS.map((s) => [s.id, s]));
export const COMPUTERS_BY_ID: Record<string, ComputerDef> = Object.fromEntries(COMPUTERS.map((c) => [c.id, c]));
export const SPECIALS_BY_ID: Record<string, SpecialDef> = Object.fromEntries(SPECIALS.map((s) => [s.id, s]));
