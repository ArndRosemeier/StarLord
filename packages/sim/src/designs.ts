import {
  ARCS, ARMORS, ARMORS_BY_ID, COMPUTERS, COMPUTERS_BY_ID, COMPUTER_COST_BY_HULL, DEFAULT_MISSILE_SHOTS, DRIVES,
  HULLS, HULLS_BY_ID, MEGAFLUXER_SPACE_PCT, MINIATURIZATION, MISSILE_RACKS, MODULES, MOD_EFFECTS, NEVER_SHRINKS, SHIELDS,
  SHIELDS_BY_ID, SHIELD_COST_BY_HULL, SHIELD_SPACE_BY_HULL, SPECIALS_BY_ID, SUPPORT_HULL_COST_SHARE, WEAPONS,
  WEAPON_MODS_BY_ID, hullIndex, type DriveDef, type FiringArc, type HullDef, type HullSize, type SpecialEffects,
  type WeaponDef, type WeaponModId,
} from "./data/components.js";
import { BEAM_HIT, DEFENSE_PER_SPEED, PLANET_WEAPON_SPACE, RANGE_BANDS } from "./data/combat.js";
import { NPC_WEAPONS } from "./data/monsters.js";
import { getRace } from "./data/races.js";
import { TIER_OF_TECH, TIERS_BY_ID } from "./data/techs.js";
import { empireBonus, government, knows } from "./empire.js";
import type { Player, ShipDesign, WeaponMount } from "./types.js";

export { MODULES };

export const ALL_WEAPONS: Record<string, WeaponDef> = Object.fromEntries(
  [...WEAPONS, ...NPC_WEAPONS].map((w) => [w.id, w as WeaponDef]),
);

/** Beam attack and beam defense points per race pick level. */
const PICK_POINTS = 20;

/** Most weapon types a design may carry, as in the original's eight weapon slots. */
export const MAX_WEAPON_SLOTS = 8;

/**
 * Refinement level of a component: how many tiers its field has advanced
 * past the one that gave it. It shrinks the component and unlocks weapon
 * modifications.
 */
export function refinement(player: Player, tech: string): number {
  const tier = TIER_OF_TECH[tech];
  if (!tier) return 0;
  let best = tier.level;
  for (const t of player.tiers) {
    const other = TIERS_BY_ID[t];
    if (other && other.field === tier.field) best = Math.max(best, other.level);
  }
  return best - tier.level;
}

const at = (table: readonly number[], level: number) => table[Math.min(level, table.length - 1)]! / 100;

/** Space and cost factors of a component at the player's refinement level. */
export function miniaturization(player: Player, tech: string, mode: "space0" | "space1" | "none" = "space0"): { space: number; cost: number } {
  const level = refinement(player, tech);
  return { space: mode === "none" ? 1 : at(MINIATURIZATION[mode], level), cost: at(MINIATURIZATION.cost, level) };
}

function spaceMode(w: WeaponDef): "space0" | "space1" | "none" {
  if (NEVER_SHRINKS.has(w.id)) return "none";
  return w.kind === "torpedo" || w.kind === "special" ? "space1" : "space0";
}

/** Rounds halves up, tolerating float noise. */
const roundHalfUp = (x: number) => Math.floor(x + 0.5 + 1e-9);

export function mountMods(m: WeaponMount): Set<WeaponModId> {
  return new Set(m.mods ?? []);
}

/** Missile rack size of a mount (shots per battle). */
export function rackShots(w: WeaponDef, m: WeaponMount): number {
  return w.kind === "missile" ? (m.ammo ?? DEFAULT_MISSILE_SHOTS) : (w.ammo ?? Infinity);
}

/** Space and cost of one weapon of a mount, with its rack, mods, arc and miniaturization. */
export function weaponUnitCost(player: Player, m: WeaponMount): { space: number; cost: number } {
  const w = ALL_WEAPONS[m.weaponId];
  if (!w) return { space: 0, cost: 0 };
  if (w.requires === "never") return { space: w.space, cost: w.cost };
  const mods = mountMods(m);
  const rack = w.kind === "missile" ? (MISSILE_RACKS.find((r) => r.shots === rackShots(w, m))?.space ?? 0) : 0;
  let basePct = 100;
  let pct = 100;
  for (const id of mods) {
    const def = WEAPON_MODS_BY_ID[id];
    if (!def) continue;
    if (def.multipliesBase) basePct += def.pct;
    else pct += def.pct;
  }
  if (w.kind === "beam" && m.arc) pct += ARCS[m.arc].pct;
  const mini = miniaturization(player, w.requires, spaceMode(w));
  const raw = ((w.space + rack) * basePct) / 100 * pct / 100;
  const rawCost = ((w.cost + rack) * basePct) / 100 * pct / 100;
  return {
    space: Math.max(1, roundHalfUp(raw * mini.space)),
    cost: Math.max(1, Math.floor(rawCost * mini.cost + 1e-9)),
  };
}

/** Internal hit points of one weapon: a tenth of its space, at least 1. */
export function weaponHP(space: number): number {
  return Math.max(1, Math.floor(space / 10));
}

const ADDITIVE: (keyof SpecialEffects)[] = [
  "beamAttack", "beamDefense", "cloakDefense", "missileEvasion", "combatSpeed", "hardShields", "shieldRegen", "absorber",
  "reflection", "beamDamagePct", "repair", "repairSystems", "boardingDefense", "monsterAttackPerSize", "fuelRangePct",
  "fleetMissileEvasion", "lightning", "displacement",
];
const MULTIPLY: (keyof SpecialEffects)[] = ["armorMult", "structureMult", "shieldStrengthMult", "penetratingMult", "marinesMult", "damageTaken"];
const MAXIMUM: (keyof SpecialEffects)[] = ["phasing", "achilles", "rangeDivisor", "teleport", "transporters", "detonator"];

export type MergedEffects = Required<Pick<SpecialEffects, "beamAttack" | "beamDefense" | "cloakDefense" | "missileEvasion" | "combatSpeed" | "hardShields" | "shieldRegen" | "absorber" | "reflection" | "beamDamagePct" | "repair" | "repairSystems" | "boardingDefense" | "monsterAttackPerSize" | "fuelRangePct" | "fleetMissileEvasion" | "lightning" | "displacement" | "armorMult" | "structureMult" | "shieldStrengthMult" | "penetratingMult" | "marinesMult" | "damageTaken" | "phasing" | "achilles" | "rangeDivisor" | "teleport" | "transporters" | "detonator" | "turnCost">> & {
  hyperX: boolean; fastRacks: boolean; extraTurn: boolean; warpDissipator: boolean; scoutLab: boolean; stealth: boolean;
};

export function noEffects(): MergedEffects {
  return {
    beamAttack: 0, beamDefense: 0, cloakDefense: 0, missileEvasion: 0, combatSpeed: 0, hardShields: 0, shieldRegen: 0,
    absorber: 0, reflection: 0, beamDamagePct: 0, repair: 0, repairSystems: 0, boardingDefense: 0, monsterAttackPerSize: 0,
    fuelRangePct: 0, fleetMissileEvasion: 0, lightning: 0, displacement: 0, armorMult: 1, structureMult: 1,
    shieldStrengthMult: 1, penetratingMult: 1, marinesMult: 1, damageTaken: 1, phasing: 0, achilles: 0, rangeDivisor: 1,
    teleport: 0, transporters: 0, detonator: 0, turnCost: 1,
    hyperX: false, fastRacks: false, extraTurn: false, warpDissipator: false, scoutLab: false, stealth: false,
  };
}

/** Combines the effects of a ship's specials. */
export function mergeEffects(specials: string[]): MergedEffects {
  const fx = noEffects() as unknown as Record<string, number | boolean>;
  for (const id of specials) {
    const e = SPECIALS_BY_ID[id]?.effects;
    if (!e) continue;
    for (const [k, v] of Object.entries(e) as [keyof SpecialEffects, number | boolean][]) {
      if (typeof v === "boolean") fx[k] = (fx[k] as boolean) || v;
      else if (ADDITIVE.includes(k)) fx[k] = (fx[k] as number) + v;
      else if (MULTIPLY.includes(k)) fx[k] = (fx[k] as number) * v;
      else if (MAXIMUM.includes(k)) fx[k] = Math.max(fx[k] as number, v);
      else if (k === "turnCost") fx[k] = Math.min(fx[k] as number, v);
    }
  }
  return fx as unknown as MergedEffects;
}

export interface DesignStats {
  spaceUsed: number;
  spaceTotal: number;
  cost: number;
  armor: number;
  structure: number;
  /** Armor plus structure. */
  hits: number;
  /** Damage taken off every hit (shield class, plus Hard Shields). */
  shield: number;
  /** Shield points on each of the four facings. */
  shieldStrength: number;
  /** Beam attack and beam defense. */
  attack: number;
  defense: number;
  combatSpeed: number;
  missileEvasion: number;
  weapons: WeaponMount[];
  marines: number;
  /** Ground troops landed by a transport. */
  troops: number;
  sizeClass: number;
  driveHP: number;
  computerHP: number;
  shieldGenHP: number;
  effects: MergedEffects;
  role: "scout" | "warship" | "colony" | "outpost" | "transport";
  /** Rough combat value used by AI and the battle's retreat decisions. */
  strength: number;
}

export function bestDrive(player: Player): DriveDef {
  return DRIVES.filter((d) => knows(player, d.tech)).at(-1) ?? DRIVES[0]!;
}

/** Combat speed of a hull: the empty value falls toward the full value as the hull fills up. */
export function combatSpeed(player: Player, hull: HullSize, usedFraction: number): number {
  const d = bestDrive(player);
  const i = hullIndex(hull);
  const full = d.combatFull[i]!;
  const empty = d.combatEmpty[i]!;
  return Math.max(full, Math.round(empty - Math.min(1, Math.max(0, usedFraction)) * (empty - full)));
}

/** Total hull space of a design, with Megafluxers and Battle Pods. */
function hullSpace(player: Player, design: ShipDesign): number {
  const hull = HULLS_BY_ID[design.hull];
  let total = hull.space;
  if (knows(player, "megafluxers")) total += Math.floor((hull.space * MEGAFLUXER_SPACE_PCT) / 100);
  for (const id of design.specials) {
    const s = SPECIALS_BY_ID[id];
    const sp = s?.space[hullIndex(design.hull)] ?? 0;
    if (sp < 0) total -= sp;
  }
  return total;
}

export function designStats(player: Player, design: ShipDesign): DesignStats {
  if (design.fixed) {
    const f = design.fixed;
    const stats: DesignStats = {
      spaceUsed: 0, spaceTotal: 0, cost: 0, armor: f.armor ?? 0, structure: f.hits, hits: f.hits + (f.armor ?? 0),
      shield: f.shield, shieldStrength: 0, attack: f.attack, defense: f.defense, combatSpeed: f.combatSpeed,
      missileEvasion: f.missileEvasion ?? 0, weapons: f.weapons, marines: 0, troops: 0, sizeClass: f.sizeClass ?? 5,
      driveHP: 0, computerHP: 0, shieldGenHP: 0, effects: noEffects(), role: "warship", strength: 0,
    };
    stats.strength = strengthOf(stats);
    return stats;
  }
  const hull = HULLS_BY_ID[design.hull];
  const idx = hullIndex(design.hull);
  const race = getRace(player.raceId);
  const bonus = empireBonus(player);
  const fx = mergeEffects(design.specials);
  let space = 0;
  let cost = design.module ? hull.cost * SUPPORT_HULL_COST_SHARE : hull.cost;

  for (const m of design.weapons) {
    const u = weaponUnitCost(player, m);
    space += u.space * m.count;
    cost += u.cost * m.count;
  }
  const shield = design.shield ? SHIELDS_BY_ID[design.shield] : undefined;
  if (shield) {
    const mini = miniaturization(player, shield.requires, "space0");
    space += Math.max(1, roundHalfUp(SHIELD_SPACE_BY_HULL[idx]! * mini.space));
    cost += Math.max(1, Math.floor(SHIELD_COST_BY_HULL[idx]! * mini.cost));
  }
  const computer = design.computer ? COMPUTERS_BY_ID[design.computer] : undefined;
  if (computer) cost += Math.max(1, Math.floor(COMPUTER_COST_BY_HULL[idx]! * miniaturization(player, computer.requires).cost));
  for (const id of design.specials) {
    const s = SPECIALS_BY_ID[id];
    if (!s) continue;
    const mini = miniaturization(player, s.requires, NEVER_SHRINKS.has(id) ? "none" : "space1");
    const sp = s.space[idx]!;
    if (sp > 0) space += Math.max(1, roundHalfUp(sp * mini.space));
    cost += Math.max(1, Math.floor(s.cost[idx]! * mini.cost));
  }
  const armor = ARMORS_BY_ID[design.armor] ?? ARMORS_BY_ID.titaniumArmor!;
  let troops = 0;
  if (design.module) {
    const mod = MODULES[design.module];
    space += mod.space;
    cost += mod.cost;
    troops += mod.troops;
  }
  cost *= government(player).shipCostMult;
  const spaceTotal = hullSpace(player, design);

  const speed = combatSpeed(player, design.hull, space / spaceTotal) + fx.combatSpeed;
  const attack = (computer?.attack ?? 0) + fx.beamAttack + race.picks.shipAttack * PICK_POINTS + bonus.shipAttack;
  const defense = speed * DEFENSE_PER_SPEED + fx.beamDefense + race.picks.shipDefense * PICK_POINTS + bonus.shipDefense;
  const shieldClass = shield ? shield.absorb + fx.hardShields : 0;
  const role: DesignStats["role"] = design.module ?? (design.weapons.length === 0 ? "scout" : "warship");

  const stats: DesignStats = {
    spaceUsed: space,
    spaceTotal,
    cost: Math.round(cost),
    armor: Math.round(hull.armor * armor.mult * fx.armorMult),
    structure: Math.round(hull.structure * armor.mult * fx.structureMult),
    hits: 0,
    shield: shieldClass,
    shieldStrength: shield ? Math.round(shield.absorb * 5 * hull.sizeClass * fx.shieldStrengthMult) : 0,
    attack,
    defense,
    combatSpeed: speed,
    missileEvasion: fx.missileEvasion,
    weapons: design.weapons,
    marines: Math.round(hull.marines * fx.marinesMult),
    troops,
    sizeClass: hull.sizeClass,
    driveHP: Math.round(hull.driveHP * fx.structureMult),
    computerHP: computer ? hull.computerHP : 0,
    shieldGenHP: shield ? hull.shieldGenHP : 0,
    effects: fx,
    role,
    strength: 0,
  };
  stats.hits = stats.armor + stats.structure;
  stats.strength = strengthOf(stats);
  return stats;
}

/** Defense a reference enemy is assumed to have when rating weapons. */
const REF_DEFENSE = 60;
const REF_SHIELD = 3;
const REF_BAND = 2;

/** Average damage per combat turn a mount does against a typical target. */
export function mountFirepower(m: WeaponMount, attack: number, fx?: MergedEffects): number {
  const w = ALL_WEAPONS[m.weaponId];
  if (!w || w.kind === "bomb" || w.kind === "spores") return 0;
  const mods = mountMods(m);
  const traits = new Set(w.traits ?? []);
  let perShot = (w.damageMin + w.damageMax) / 2;
  if (w.perSize) perShot *= 3;
  let shots = m.count;
  let hit = 1;
  if (w.kind === "beam") {
    let pct = 100 + (traits.has("noRangeDissipation") || mods.has("noRangeDissipation") ? 0 : RANGE_BANDS.damagePct[REF_BAND]!);
    if (mods.has("heavyMount")) pct += MOD_EFFECTS.heavyMountDamagePct;
    if (mods.has("pointDefense")) pct += MOD_EFFECTS.pointDefenseDamagePct;
    pct += fx?.beamDamagePct ?? 0;
    perShot *= pct / 100;
    let diff = attack - REF_DEFENSE;
    if (traits.has("continuous") || mods.has("continuous")) diff += MOD_EFFECTS.continuousToHit;
    if (mods.has("pointDefense")) diff += MOD_EFFECTS.pointDefenseToHit;
    if (mods.has("autoFire")) {
      diff += MOD_EFFECTS.autoFireToHit;
      shots *= MOD_EFFECTS.autoFireShots;
    }
    const threshold = BEAM_HIT.threshold - RANGE_BANDS.toHit[REF_BAND]! * (traits.has("doubleRangePenalty") ? 2 : 1);
    hit = traits.has("alwaysHits") ? 1 : Math.min(0.95, Math.max(0.05, (100 - threshold + diff) / 100));
    // Damage scales with how well the roll beat the threshold: about half the spread on average.
    perShot = Math.max(1, perShot * (0.6 + 0.4 * hit));
  } else if (w.kind === "missile") {
    if (mods.has("mirv")) perShot *= MOD_EFFECTS.mirvWarheads;
    hit = 0.75;
    // Limited racks spread their damage over a long battle.
    const shotsPerBattle = rackShots(w, m);
    hit *= Math.min(1, shotsPerBattle / 8);
  } else if (w.kind === "torpedo") {
    if (mods.has("overloaded")) perShot *= 1 + MOD_EFFECTS.overloadedDamagePct / 100;
    if (traits.has("dissipates") && !mods.has("noRangeDissipation")) perShot *= 0.75;
    hit = 0.85 / (w.reload ?? 1);
  } else if (w.kind === "bay") {
    perShot = w.effect === "shuttles" ? 0 : w.effect === "bombers" ? 30 : w.effect === "heavyFighters" ? 25 : 12;
    hit = 0.4;
  } else if (w.kind === "special") {
    if (w.effect === "antiMissile" || w.effect === "tractor" || w.effect === "stasis") return 0;
    if (w.effect === "blackHole") perShot = 200;
    hit = 0.8;
  }
  if (traits.has("enveloping") || mods.has("enveloping")) perShot *= 2;
  const vsShield = Math.max(0.5, perShot - (traits.has("shieldPiercing") || mods.has("shieldPiercing") ? 0 : REF_SHIELD));
  return vsShield * shots * hit;
}

/** Combat value: the geometric mean of damage dealt per turn and damage soaked. */
export function strengthOf(s: Pick<DesignStats, "weapons" | "attack" | "defense" | "hits" | "shield" | "shieldStrength" | "missileEvasion"> & { effects?: MergedEffects }): number {
  let firepower = 0;
  for (const m of s.weapons) firepower += mountFirepower(m, s.attack, s.effects);
  firepower *= s.effects?.penetratingMult ?? 1;
  const evade = 1 + Math.max(0, s.defense - REF_DEFENSE) / 100 + s.missileEvasion / 400;
  const toughness = (s.hits * (1 + s.shield / 6) + s.shieldStrength * 3) * evade / (s.effects?.damageTaken ?? 1);
  return Math.round(Math.sqrt(Math.max(0, firepower) * Math.max(0, toughness)) * 10) / 10;
}

/** Returns a reason the design is invalid for this player, or null. */
export function validateDesign(player: Player, design: ShipDesign): string | null {
  if (!HULLS.some((h) => h.id === design.hull)) return "unknown hull";
  const hull = HULLS_BY_ID[design.hull];
  if (!design.module && !knows(player, hull.requires)) return "hull not researched";
  if (design.module) {
    const order: HullSize[] = ["frigate", "destroyer", "cruiser", "battleship", "titan", "doomStar"];
    if (order.indexOf(design.hull) < order.indexOf(MODULES[design.module].minHull)) return "hull too small for module";
    if (design.module === "outpost" && !knows(player, "outpostShip")) return "outposts not researched";
  }
  const armor = ARMORS_BY_ID[design.armor];
  if (!armor || !knows(player, armor.requires)) return "armor not available";
  if (design.shield && (!SHIELDS_BY_ID[design.shield] || !knows(player, SHIELDS_BY_ID[design.shield]!.requires))) return "shield not available";
  if (design.computer && (!COMPUTERS_BY_ID[design.computer] || !knows(player, COMPUTERS_BY_ID[design.computer]!.requires))) return "computer not available";
  if (design.weapons.length > MAX_WEAPON_SLOTS) return `at most ${MAX_WEAPON_SLOTS} weapon slots`;
  for (const m of design.weapons) {
    const w = ALL_WEAPONS[m.weaponId];
    if (!w || !knows(player, w.requires)) return `weapon ${m.weaponId} not available`;
    if (!Number.isInteger(m.count) || m.count < 1) return "weapon counts must be positive";
    const mods = m.mods ?? [];
    if (new Set(mods).size !== mods.length) return "duplicate weapon modification";
    const level = refinement(player, w.requires);
    for (const id of mods) {
      const def = WEAPON_MODS_BY_ID[id];
      if (!def || !w.mods.includes(id)) return `${w.name} cannot take ${def?.name ?? id}`;
      if (level < def.refinement) return `${def.name} needs ${def.refinement} refinement of ${w.name}`;
      if (def.requires && !knows(player, def.requires)) return `${def.name} not researched`;
      if (def.excludes?.some((x) => mods.includes(x))) return `${def.name} cannot be combined with ${def.excludes.map((x) => WEAPON_MODS_BY_ID[x].name).join(", ")}`;
    }
    if (m.arc && !(m.arc in ARCS)) return "unknown firing arc";
    if (m.arc && w.kind !== "beam" && m.arc !== "full") return "only beams take firing arcs";
    if (m.ammo !== undefined && (w.kind !== "missile" || !MISSILE_RACKS.some((r) => r.shots === m.ammo))) return "invalid missile rack";
  }
  for (const s of design.specials) {
    const def = SPECIALS_BY_ID[s];
    if (!def || !knows(player, def.requires)) return `special ${s} not available`;
    const clash = def.excludes?.find((x) => design.specials.includes(x));
    if (clash) return `${def.name} cannot be combined with ${SPECIALS_BY_ID[clash]?.name ?? clash}`;
  }
  if (new Set(design.specials).size !== design.specials.length) return "duplicate special";
  if (!design.shield && design.specials.some((s) => ["hardShields", "multiPhasedShields", "shieldCapacitors"].includes(s))) return "needs a shield";
  const stats = designStats(player, design);
  if (stats.spaceUsed > stats.spaceTotal + 1e-9) return "not enough space";
  if (!design.name.trim()) return "design needs a name";
  return null;
}

export function bestOf<T extends { requires: string }>(player: Player, items: T[]): T | undefined {
  return items.filter((i) => knows(player, i.requires)).at(-1);
}

/** Damage per space of a weapon at the player's refinement, for picking the best one. */
function weaponValue(player: Player, w: WeaponDef, mods: WeaponModId[] = []): number {
  const m: WeaponMount = { weaponId: w.id, count: 1, mods };
  return mountFirepower(m, 50) / weaponUnitCost(player, m).space;
}

/** The player's best beam weapon by damage for its space. */
export function bestBeam(player: Player): WeaponDef {
  const beams = WEAPONS.filter((w) => w.kind === "beam" && knows(player, w.requires));
  if (beams.length === 0) return WEAPONS.find((w) => w.id === "laserCannon")!;
  return beams.reduce((best, w) => (weaponValue(player, w) > weaponValue(player, best) ? w : best));
}

/** The player's hardest-hitting missile. */
export function bestMissile(player: Player): WeaponDef {
  const missiles = WEAPONS.filter((w) => w.kind === "missile" && knows(player, w.requires));
  return missiles.at(-1) ?? WEAPONS.find((w) => w.kind === "missile")!;
}

function fill(player: Player, mount: Omit<WeaponMount, "count">, space: number): WeaponMount | null {
  const unit = weaponUnitCost(player, { ...mount, count: 1 }).space;
  const count = Math.floor(space / unit);
  return count > 0 ? { ...mount, count } : null;
}

/** Weapons of an orbital station: its space split between the best beam and missile by the hull's auto slots. */
export function stationWeapons(player: Player, hull: HullDef): WeaponMount[] {
  const [beams, missiles] = hull.autoSlots;
  const total = beams + missiles || 1;
  return [
    fill(player, { weaponId: bestBeam(player).id, arc: "full" }, (hull.space * beams) / total),
    fill(player, { weaponId: bestMissile(player).id, ammo: DEFAULT_MISSILE_SHOTS }, (hull.space * missiles) / total),
  ].filter((m): m is WeaponMount => m !== null);
}

/** Ground batteries: heavy-mount and point-defense versions of the best beam, as many as fit. */
export function groundBatteryWeapons(player: Player): WeaponMount[] {
  const beam = bestBeam(player);
  const half = PLANET_WEAPON_SPACE / 2;
  const hv = beam.mods.includes("heavyMount");
  const pd = beam.mods.includes("pointDefense");
  const mounts = [
    fill(player, { weaponId: beam.id, arc: "full", mods: hv ? ["heavyMount"] : [] }, pd ? half : PLANET_WEAPON_SPACE),
    pd ? fill(player, { weaponId: beam.id, arc: "full", mods: ["pointDefense"] }, half) : null,
  ];
  return mounts.filter((m): m is WeaponMount => m !== null);
}

/** Missile base: the best missile, as many launchers as fit; they never run out. */
export function missileBaseWeapons(player: Player): WeaponMount[] {
  const m = fill(player, { weaponId: bestMissile(player).id, ammo: DEFAULT_MISSILE_SHOTS }, PLANET_WEAPON_SPACE);
  return m ? [m] : [];
}

export function bestArmor(player: Player) {
  return bestOf(player, ARMORS) ?? ARMORS[0]!;
}
export function bestShield(player: Player) {
  return bestOf(player, SHIELDS);
}
export function bestComputer(player: Player) {
  return bestOf(player, COMPUTERS);
}

/** Space a weapon arc adds, for display. */
export function arcName(arc: FiringArc | undefined): string {
  return ARCS[arc ?? "forward"].name;
}

/** The ships every empire starts with. */
export function startingDesigns(): ShipDesign[] {
  const base = { armor: "titaniumArmor", shield: null, computer: null, specials: [], obsolete: false };
  return [
    { ...base, id: "scout", name: "Scout", hull: "frigate", weapons: [], module: null },
    { ...base, id: "frigate", name: "Frigate", hull: "frigate", computer: "electronicComputer", weapons: [{ weaponId: "laserCannon", count: 2 }], module: null },
    { ...base, id: "colonyShip", name: "Colony Ship", hull: "cruiser", weapons: [], module: "colony" },
    { ...base, id: "outpostShip", name: "Outpost Ship", hull: "destroyer", weapons: [], module: "outpost" },
    { ...base, id: "transport", name: "Transport", hull: "destroyer", weapons: [], module: "transport" },
  ];
}

export function findDesign(player: Player, designId: string): ShipDesign | undefined {
  return player.designs.find((d) => d.id === designId);
}
