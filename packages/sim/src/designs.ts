import {
  ARMORS_BY_ID, COMPUTERS_BY_ID, HULLS_BY_ID, SHIELDS_BY_ID, SPECIALS_BY_ID, WEAPONS, type HullSize,
  type SpecialEffects, type WeaponDef,
} from "./data/components.js";
import { NPC_WEAPONS } from "./data/monsters.js";
import { getRace } from "./data/races.js";
import { TIER_OF_TECH, TIERS_BY_ID } from "./data/techs.js";
import { combatSpeed, empireBonus, government, knows } from "./empire.js";
import type { DesignModule, Player, ShipDesign, WeaponMount } from "./types.js";

export const ALL_WEAPONS: Record<string, WeaponDef> = Object.fromEntries(
  [...WEAPONS, ...NPC_WEAPONS].map((w) => [w.id, w as WeaponDef]),
);

export const MODULES: Record<DesignModule, { name: string; space: number; cost: number; minHull: HullSize; troops: number }> = {
  colony: { name: "Colony Module", space: 90, cost: 120, minHull: "cruiser", troops: 0 },
  outpost: { name: "Outpost Module", space: 40, cost: 30, minHull: "destroyer", troops: 0 },
  transport: { name: "Troop Module", space: 40, cost: 15, minHull: "destroyer", troops: 2 },
};

/** Beam defense and attack points per race pick level. */
const PICK_POINTS = 20;

/**
 * MoO2 miniaturization: each tier researched in a field after the one that
 * gave a component makes it 10% smaller and cheaper, down to half.
 */
export function miniaturization(player: Player, tech: string): number {
  const tier = TIER_OF_TECH[tech];
  if (!tier) return 1;
  let best = tier.level;
  for (const t of player.tiers) {
    const other = TIERS_BY_ID[t];
    if (other && other.field === tier.field) best = Math.max(best, other.level);
  }
  return Math.max(0.5, 1 - 0.1 * (best - tier.level));
}

export interface DesignStats {
  spaceUsed: number;
  spaceTotal: number;
  cost: number;
  hits: number;
  shield: number;
  attack: number;
  defense: number;
  combatSpeed: number;
  weapons: WeaponMount[];
  missileEvasion: number;
  pointDefense: number;
  repair: number;
  damageBonus: number;
  shieldPierce: number;
  displacement: number;
  bombBonus: number;
  troops: number;
  role: "scout" | "warship" | "colony" | "outpost" | "transport";
  /** Rough combat value used by AI and auto-resolve odds. */
  strength: number;
}

export function designStats(player: Player, design: ShipDesign): DesignStats {
  if (design.fixed) {
    const f = design.fixed;
    return {
      spaceUsed: 0, spaceTotal: 0, cost: 0, hits: f.hits, shield: f.shield, attack: f.attack, defense: f.defense,
      combatSpeed: f.combatSpeed, weapons: f.weapons, missileEvasion: 0, pointDefense: 0, repair: 0, damageBonus: 0,
      shieldPierce: 0, displacement: 0, bombBonus: 0, troops: 0, role: "warship",
      strength: strengthOf(f.hits, f.attack, f.defense, f.shield, f.weapons),
    };
  }
  const hull = HULLS_BY_ID[design.hull];
  const race = getRace(player.raceId);
  const bonus = empireBonus(player);
  const fx: Required<SpecialEffects> = {
    attack: 0, defense: 0, missileEvasion: 0, pointDefense: 0, structureMult: 1, armorMult: 1, repair: 0,
    combatSpeed: 0, shieldPierce: 0, displacement: 0, damageBonus: 0, bombBonus: 0, troops: 0,
  };
  let space = 0;
  let cost = hull.cost;

  for (const m of design.weapons) {
    const w = ALL_WEAPONS[m.weaponId];
    if (!w) continue;
    const mini = miniaturization(player, w.requires);
    space += w.space * mini * m.count;
    cost += w.cost * mini * m.count;
  }
  const fractional = (fraction: number, costPerSpace: number, tech: string) => {
    const mini = miniaturization(player, tech);
    space += hull.space * fraction * mini;
    cost += hull.space * fraction * costPerSpace * mini;
  };
  const shield = design.shield ? SHIELDS_BY_ID[design.shield] : undefined;
  if (shield) fractional(shield.spaceFraction, shield.costPerSpace, shield.requires);
  const computer = design.computer ? COMPUTERS_BY_ID[design.computer] : undefined;
  if (computer) fractional(computer.spaceFraction, computer.costPerSpace, computer.requires);
  for (const id of design.specials) {
    const s = SPECIALS_BY_ID[id];
    if (!s) continue;
    fractional(s.spaceFraction, s.costPerSpace, s.requires);
    for (const [k, v] of Object.entries(s.effects) as [keyof SpecialEffects, number][]) {
      if (k === "structureMult" || k === "armorMult") fx[k] *= v;
      else fx[k] += v;
    }
  }
  const armor = ARMORS_BY_ID[design.armor] ?? ARMORS_BY_ID.titaniumArmor!;
  cost += hull.cost * 0.2 * (armor.mult - 1);
  let troops = fx.troops;
  if (design.module) {
    const mod = MODULES[design.module];
    space += mod.space;
    cost += mod.cost;
    troops += mod.troops;
  }
  cost *= government(player).shipCostMult;

  const hits = Math.round(hull.structure * fx.structureMult + hull.armorBase * armor.mult * fx.armorMult);
  const attack = (computer?.attack ?? 0) + fx.attack + race.picks.shipAttack * PICK_POINTS + bonus.shipAttack;
  const speed = combatSpeed(player) + fx.combatSpeed;
  const defense = hull.defense + fx.defense + race.picks.shipDefense * PICK_POINTS + bonus.shipDefense + speed * 3;
  const shieldAbsorb = shield?.absorb ?? 0;
  const role: DesignStats["role"] = design.module ?? (design.weapons.length === 0 ? "scout" : "warship");

  return {
    spaceUsed: Math.round(space * 10) / 10,
    spaceTotal: hull.space,
    cost: Math.round(cost),
    hits,
    shield: shieldAbsorb,
    attack,
    defense,
    combatSpeed: speed,
    weapons: design.weapons,
    missileEvasion: Math.min(0.8, fx.missileEvasion),
    pointDefense: Math.min(0.8, fx.pointDefense),
    repair: fx.repair,
    damageBonus: fx.damageBonus,
    shieldPierce: Math.min(1, fx.shieldPierce),
    displacement: Math.min(0.5, fx.displacement),
    bombBonus: fx.bombBonus,
    troops,
    role,
    strength: strengthOf(hits, attack, defense, shieldAbsorb, design.weapons, fx.damageBonus),
  };
}

function strengthOf(hits: number, attack: number, defense: number, shield: number, weapons: WeaponMount[], damageBonus = 0): number {
  let firepower = 0;
  for (const m of weapons) {
    const w = ALL_WEAPONS[m.weaponId];
    if (!w || w.kind === "bomb" || w.kind === "spores") continue;
    const avg = (w.damageMin + w.damageMax) / 2 + damageBonus;
    firepower += avg * m.count * (w.ammo ? 0.6 : 1);
  }
  const hitChance = Math.min(0.95, Math.max(0.2, 0.5 + attack / 200));
  const toughness = hits * (1 + shield / 5) * (1 + defense / 100);
  return Math.round(Math.sqrt(Math.max(0, firepower * hitChance) * toughness) * 10) / 10;
}

/** Returns a reason the design is invalid for this player, or null. */
export function validateDesign(player: Player, design: ShipDesign): string | null {
  const hull = HULLS_BY_ID[design.hull];
  if (!hull) return "unknown hull";
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
  for (const m of design.weapons) {
    const w = ALL_WEAPONS[m.weaponId];
    if (!w || !knows(player, w.requires)) return `weapon ${m.weaponId} not available`;
    if (!Number.isInteger(m.count) || m.count < 1) return "weapon counts must be positive";
  }
  for (const s of design.specials) {
    const def = SPECIALS_BY_ID[s];
    if (!def || !knows(player, def.requires)) return `special ${s} not available`;
  }
  if (new Set(design.specials).size !== design.specials.length) return "duplicate special";
  const stats = designStats(player, design);
  if (stats.spaceUsed > stats.spaceTotal + 1e-9) return "not enough space";
  if (!design.name.trim()) return "design needs a name";
  return null;
}

export function bestOf<T extends { requires: string }>(player: Player, items: T[]): T | undefined {
  return items.filter((i) => knows(player, i.requires)).at(-1);
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
