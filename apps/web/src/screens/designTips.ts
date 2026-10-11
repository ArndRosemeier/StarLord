import {
  ARCS, ARMORS_BY_ID, COMPUTERS_BY_ID, HULLS_BY_ID, MISSILE_RACKS, MOD_EFFECTS, MODULES, SHIELDS_BY_ID,
  SHIP_STYLES_BY_ID, SPECIALS_BY_ID, WEAPON_MODS_BY_ID, WEAPONS_BY_ID, bestDrive, designStats, refinement, weaponUnitCost,
  type DesignModule, type FiringArc, type HullSize, type Player, type ShipDesign, type WeaponDef, type WeaponEffect,
  type WeaponKind, type WeaponModId, type WeaponMount, type WeaponTrait,
} from "@starlord/sim";
import { specialEffects } from "../help/effects";
import { fmt, signed, words } from "../ui/format";
import type { TipCard } from "../ui/Tip";

/**
 * What the ship designer's tooltips say: for every hull, part, weapon,
 * modification and stat, its numbers on the design being edited and what it
 * does in play. Space and cost come from the design itself, so they include
 * miniaturization and the hull size.
 */

const KIND_TEXT: Record<WeaponKind, string> = {
  beam: "Fires every round. Attack against the target's beam defense sets the chance to hit; range lowers hit chance and damage. Shields take their class off every hit.",
  missile: "Launched as a salvo that flies across the battlefield. Point defense, anti-missile rockets and jammers can stop it before it lands.",
  torpedo: "Flies like a missile but cannot be shot down; the launcher reloads for a round after each shot.",
  bomb: "Used against colonies whose defenses are down, by fleets set to attack. Kills population and may wreck buildings.",
  spores: "Biological weapon against colonies: kills population directly, ignoring buildings.",
  special: "A special device with its own effect in battle.",
  bay: "Launches small craft that fly to their targets, attack and return to rearm.",
};

const TRAIT_TEXT: Record<WeaponTrait, string> = {
  noRangeDissipation: "Full damage at any range.",
  doubleRangePenalty: "Range costs twice the usual hit chance.",
  systemsOnly: "Damages only internal systems (computer, drive, shields, weapons); a quarter damage against monsters.",
  killsMarines: "Each 5 damage that gets through kills a marine aboard.",
  extraStructural: "Damage past the armor hits structure half again as hard.",
  continuous: "Steady beam: +25 to hit.",
  shieldPiercing: "Ignores shields (except hard shields).",
  enveloping: "Hits all four shield facings at once.",
  alwaysHits: "Never misses.",
  dissipates: "Loses strength for every square it travels.",
  area: "Hits everything around the firing ship, ignoring shields.",
};

const EFFECT_TEXT: Record<WeaponEffect, string> = {
  spatialCompressor: "Crushes every enemy ship within reach, harder against bigger hulls; ignores shields.",
  stasis: "Freezes one ship for the round: it can neither act nor be harmed.",
  antiMissile: "Shoots down incoming missiles before they reach the ship.",
  gyro: "Shakes the target apart: damage that skips shields and armor, more against bigger hulls.",
  plasmaWeb: "Wraps the target in plasma that keeps burning it in later rounds, weaker each time.",
  pulsar: "An energy burst that hits every enemy ship within reach, harder against bigger hulls.",
  blackHole: "Traps one ship so it cannot move; if the generator holds it for a few rounds, the ship is destroyed.",
  stellarConverter: "400 damage to every shield facing of the target; never misses.",
  tractor: "Slows the target; enough tractor beams for its size hold it in place.",
  fighters: "Launches interceptors that dogfight missiles, craft and ships.",
  bombers: "Launches bombers that strike ships and planets hard but cannot stop craft.",
  heavyFighters: "Launches heavy fighters: tougher interceptors with stronger guns.",
  shuttles: "Launches assault shuttles that land marines on enemy ships to capture them.",
};

const MOD_TEXT: Record<WeaponModId, string> = {
  heavyMount: `Bigger gun: ${signed(MOD_EFFECTS.heavyMountDamagePct)}% damage and longer range bands. Doubles the base size and cost.`,
  pointDefense: `Small rapid mount that can also shoot down missiles and craft: +${MOD_EFFECTS.pointDefenseToHit} to hit, ${MOD_EFFECTS.pointDefenseDamagePct}% damage, shorter range. Halves the base size and cost.`,
  armorPiercing: "Damage goes straight past the armor into structure.",
  continuous: `Steady beam: +${MOD_EFFECTS.continuousToHit} to hit.`,
  noRangeDissipation: "Full damage at any range.",
  shieldPiercing: "Ignores shields (except hard shields).",
  autoFire: `Fires ${MOD_EFFECTS.autoFireShots} shots a round at ${MOD_EFFECTS.autoFireToHit} to hit.`,
  enveloping: "Hits all four shield facings at once.",
  mirv: `Each missile splits into ${MOD_EFFECTS.mirvWarheads} warheads.`,
  eccm: "Halves the chance that enemy jammers lead the missile astray.",
  armored: `Missiles take ${MOD_EFFECTS.armoredHpMult}× the hits to shoot down.`,
  fast: `Flies ${MOD_EFFECTS.fastSpeed} squares a round faster.`,
  emissionsGuidance: "Homes in on engine emissions: hits skip armor and strike the structure.",
  overloaded: `${signed(MOD_EFFECTS.overloadedDamagePct)}% damage.`,
};

const MODULE_TEXT: Record<DesignModule, string> = {
  colony: "Settles a new colony on an empty planet; the ship is used up.",
  outpost: "Founds an outpost on any planet, asteroid belt or gas giant, claiming the system; the ship is used up.",
  transport: "Carries ground troops to invade enemy colonies.",
};

/** Space and cost a part adds to this design: the design with it minus the design without it. */
function partDelta(player: Player, without: ShipDesign, withIt: ShipDesign): { space: number; cost: number } {
  const a = designStats(player, without);
  const b = designStats(player, withIt);
  return { space: b.spaceUsed - a.spaceUsed, cost: b.cost - a.cost };
}

const spaceRow = (d: { space: number; cost: number }, hull: HullSize): [string, string][] => [
  [`Space on a ${HULLS_BY_ID[hull].name.toLowerCase()}`, fmt(d.space)],
  ["Cost", `${fmt(d.cost)} BC`],
];

const dmg = (w: WeaponDef) => (w.damageMin === w.damageMax ? `${w.damageMin}` : `${w.damageMin}–${w.damageMax}`);

export function hullTip(player: Player, draft: ShipDesign, hull: HullSize): TipCard {
  const h = HULLS_BY_ID[hull];
  const s = designStats(player, { ...draft, hull });
  return {
    title: h.name, kind: `Hull, size class ${h.sizeClass}`,
    rows: [
      ["Space", fmt(s.spaceTotal)],
      ["Hull cost", `${fmt(h.cost)} BC`],
      ["Armor / structure", `${fmt(s.armor)} / ${fmt(s.structure)}`],
      ["Combat speed now", fmt(s.combatSpeed)],
      ["Marines", fmt(s.marines)],
      ["Command points", fmt(h.commandPoints)],
    ],
    text: [
      "Bigger hulls hold more space for weapons and parts and take more punishment, but cost more and use more command points.",
      "Shields, computers and specials grow with the hull; shield strength scales with the size class.",
      ...(hull !== "frigate" && hull !== "destroyer" ? ["Colonies need an orbital star base to build this hull."] : []),
    ],
  };
}

export function armorTip(player: Player, draft: ShipDesign, id: string): TipCard {
  const a = ARMORS_BY_ID[id]!;
  const s = designStats(player, { ...draft, armor: id });
  return {
    title: `${a.name} armor`, kind: "Armor",
    rows: [["Armor grade", `×${a.mult}`], ["Armor / structure here", `${fmt(s.armor)} / ${fmt(s.structure)}`], ["Space and cost", "none"]],
    text: ["Multiplies the hull's armor and structure. Armor soaks hits first; when the structure is gone the ship is destroyed."],
  };
}

export function shieldTip(player: Player, draft: ShipDesign, id: string | null): TipCard {
  if (!id) return { title: "No shield", kind: "Shield", text: ["Every hit lands at full strength. A shield takes its class off each hit and soaks damage on the side that was struck."] };
  const sh = SHIELDS_BY_ID[id]!;
  const s = designStats(player, { ...draft, shield: id });
  return {
    title: `${sh.name} shield`, kind: "Shield",
    rows: [
      ["Stops per hit", fmt(s.shield)],
      ["Strength per facing", fmt(s.shieldStrength)],
      ...spaceRow(partDelta(player, { ...draft, shield: null }, { ...draft, shield: id }), draft.hull),
    ],
    text: ["Takes its class off every hit, then soaks damage from a pool on the side that was hit. The pool recovers part of its strength each round."],
  };
}

export function computerTip(player: Player, draft: ShipDesign, id: string | null): TipCard {
  if (!id) return { title: "No computer", kind: "Computer", text: ["Beams aim without help. A combat computer raises beam attack, the chance to hit."] };
  const c = COMPUTERS_BY_ID[id]!;
  return {
    title: `${c.name} computer`, kind: "Computer",
    rows: [["Beam attack", signed(c.attack)], ...spaceRow(partDelta(player, { ...draft, computer: null }, { ...draft, computer: id }), draft.hull)],
    text: ["Raises the chance that beams hit. Takes no space. It can be knocked out by system damage, losing the bonus."],
  };
}

export function moduleTip(player: Player, draft: ShipDesign, id: DesignModule | null): TipCard {
  if (!id) return { title: "No module", kind: "Module", text: ["A warship or scout. Add a colony, outpost or troop module to make a support ship."] };
  const m = MODULES[id];
  return {
    title: m.name, kind: "Module",
    rows: [
      ["Space", fmt(m.space)], ["Cost", `${fmt(m.cost)} BC`],
      ["Smallest hull", HULLS_BY_ID[m.minHull].name],
      ...(m.troops ? [["Troops carried", fmt(m.troops)] as [string, string]] : []),
    ],
    text: [MODULE_TEXT[id], "Support ships pay only a quarter of the hull's cost and may use hulls you have not researched yet."],
  };
}

export function weaponTip(player: Player, draft: ShipDesign, weaponId: string, mount?: WeaponMount): TipCard {
  const w = WEAPONS_BY_ID[weaponId]!;
  const m: WeaponMount = mount ?? { weaponId, count: 1 };
  const unit = weaponUnitCost(player, m);
  const level = refinement(player, w.requires);
  return {
    title: w.name, kind: `${words(w.kind)} weapon`,
    rows: [
      ...(w.damageMax > 0 ? [["Damage per shot", w.perSize ? `${dmg(w)} × size class` : dmg(w)] as [string, string]] : []),
      ["Space each", fmt(unit.space)],
      ["Cost each", `${fmt(unit.cost)} BC`],
      ...(w.ammo ? [["Shots per battle", fmt(w.ammo)] as [string, string]] : []),
      ...(w.reload ? [["Fires", `every ${w.reload} rounds`] as [string, string]] : []),
      ...(w.speed !== undefined ? [["Speed", Number.isFinite(w.speed) ? `${w.speed} squares a round` : "instant"] as [string, string]] : []),
      ...(w.range !== undefined ? [["Range", `${w.range} squares`] as [string, string]] : []),
      ...(w.mods.length ? [["Refinement", `${level} level${level === 1 ? "" : "s"}`] as [string, string]] : []),
    ],
    text: [
      KIND_TEXT[w.kind],
      ...(w.traits ?? []).map((t) => TRAIT_TEXT[t]),
      ...(w.effect ? [EFFECT_TEXT[w.effect]] : []),
      ...(w.mods.length ? [`Modifications: ${w.mods.map((x) => WEAPON_MODS_BY_ID[x].name).join(", ")}.`] : []),
    ],
  };
}

export function modTip(player: Player, mount: WeaponMount, id: WeaponModId): TipCard {
  const mod = WEAPON_MODS_BY_ID[id];
  const w = WEAPONS_BY_ID[mount.weaponId]!;
  const level = refinement(player, w.requires);
  const mods = new Set(mount.mods ?? []);
  const on = mods.has(id);
  mods.delete(id);
  const without = weaponUnitCost(player, { ...mount, mods: [...mods] });
  const withIt = weaponUnitCost(player, { ...mount, mods: [...mods, id] });
  const blocked = level < mod.refinement
    ? `Needs ${mod.refinement} refinement level${mod.refinement === 1 ? "" : "s"} of this weapon; you have ${level}. Research later techs in its field.`
    : mod.requires && !player.techs.includes(mod.requires)
      ? `Needs ${words(mod.requires)} researched.`
      : undefined;
  const clash = mod.excludes?.filter((x) => mods.has(x)).map((x) => WEAPON_MODS_BY_ID[x].name);
  return {
    title: mod.name, kind: `Weapon mod · ${mod.abbr}${on ? " · fitted" : ""}`,
    rows: [
      ["Space each", `${signed(withIt.space - without.space)}`],
      ["Cost each", `${signed(withIt.cost - without.cost)} BC`],
    ],
    text: [MOD_TEXT[id]],
    note: blocked ?? (clash?.length ? `Replaces ${clash.join(", ")}.` : undefined),
  };
}

export function arcTip(arc: FiringArc): TipCard {
  const a = ARCS[arc];
  return {
    title: `${a.name} arc`, kind: "Firing arc",
    rows: [["Covers", `${a.half * 2}°`], ["Space and cost", a.pct ? `${signed(a.pct)}%` : "base"]],
    text: ["The directions this beam can shoot. Wider arcs let the ship fire while turning or retreating, for more space."],
  };
}

export function rackTip(player: Player, mount: WeaponMount, shots: number): TipCard {
  const rack = MISSILE_RACKS.find((r) => r.shots === shots)!;
  const u = weaponUnitCost(player, { ...mount, ammo: shots });
  return {
    title: `${shots}-shot rack`, kind: "Missile rack",
    rows: [["Rack base space", fmt(rack.space)], ["Space each", fmt(u.space)], ["Cost each", `${fmt(u.cost)} BC`]],
    text: ["How many salvos this mount fires per battle. More shots need a bigger rack."],
  };
}

export function specialTip(player: Player, draft: ShipDesign, id: string): TipCard {
  const s = SPECIALS_BY_ID[id]!;
  const without = { ...draft, specials: draft.specials.filter((x) => x !== id) };
  const d = partDelta(player, without, { ...without, specials: [...without.specials, id] });
  const clash = (s.excludes ?? []).filter((x) => draft.specials.includes(x)).map((x) => SPECIALS_BY_ID[x]?.name ?? words(x));
  const fitted = draft.specials.includes(id);
  return {
    title: s.name, kind: `Special${fitted ? " · fitted" : ""}`,
    rows: spaceRow(d, draft.hull),
    text: specialEffects(s.effects).map((t) => t[0]!.toUpperCase() + t.slice(1) + "."),
    note: clash.length ? `Cannot share a ship with ${clash.join(", ")}.` : s.excludes?.length ? `Excludes ${s.excludes.map((x) => SPECIALS_BY_ID[x]?.name ?? words(x)).join(", ")}.` : undefined,
  };
}

export function styleTip(style: string, own: string): TipCard {
  const s = SHIP_STYLES_BY_ID[style as keyof typeof SHIP_STYLES_BY_ID];
  return {
    title: `${s?.name ?? style} style`, kind: style === own ? "Ship style · your race" : "Ship style",
    text: [s?.text ?? "", "Only changes how ships of this design look, in your empire's colour. Each race has its own style; new designs start in yours."],
  };
}

/** Explanations for the stat table rows, keyed by their labels. */
export function statTip(player: Player, label: string): TipCard {
  const drive = bestDrive(player);
  const text: Record<string, string> = {
    "Cost": "Production a colony spends to build one ship. Hull, weapons, shield, computer, specials and module all add up; your government may change it.",
    "Armor": "Hit points that soak damage first. Hull armor times the armor grade, tripled by Heavy Armor.",
    "Structure": "Hit points under the armor. When they run out the ship is destroyed. Tripled by Reinforced Hull.",
    "Shield class": "Damage taken off every incoming hit.",
    "Shield strength per facing": "Damage each of the four sides can soak before hits get through; recovers each round.",
    "Attack": "Bonus to the chance that beams hit, from the computer, specials, race and leaders.",
    "Defense": `How hard the ship is to hit with beams. Rises with combat speed, plus specials and race bonuses.`,
    "Combat speed": `Squares the ship moves each battle round. Comes from your ${drive.name} drive and the hull size; ships with free space move faster.`,
    "Marines": "Boarding crew for capturing enemy ships and repelling boarders.",
    "Troops": "Ground troops carried for invading colonies.",
    "Strength": "A rough fighting value used by the AI and automation to compare designs.",
    "Missile evasion": "Chance to make incoming missiles miss, from jammers and inertial devices.",
    "Repair per round": "Armor and structure the ship repairs itself each battle round.",
    "Role": "What the ship is for: a warship, a scout without weapons, or a support ship with a module.",
  };
  return { title: label, text: [text[label] ?? ""] };
}

export function spaceTip(used: number, total: number): TipCard {
  return {
    title: "Space", kind: "Hull capacity",
    rows: [["Used", fmt(used)], ["Free", fmt(total - used)], ["Hull total", fmt(total)]],
    text: ["Everything you fit takes room in the hull. A design can't be saved when it is over. Free space also makes the ship faster in combat."],
  };
}

export function designTip(player: Player, d: ShipDesign): TipCard {
  const parts = [
    `${ARMORS_BY_ID[d.armor]?.name ?? "No"} armor`,
    d.shield ? `${SHIELDS_BY_ID[d.shield]?.name} shield` : null,
    d.computer ? `${COMPUTERS_BY_ID[d.computer]?.name} computer` : null,
    d.module ? MODULES[d.module].name : null,
  ].filter(Boolean);
  const s = designStats(player, d);
  return {
    title: d.name, kind: HULLS_BY_ID[d.hull]?.name,
    rows: [
      ["Cost", `${fmt(s.cost)} BC`], ["Hits", fmt(s.hits)], ["Shield class", fmt(s.shield)],
      ["Attack / defense", `${fmt(s.attack)} / ${fmt(s.defense)}`], ["Combat speed", fmt(s.combatSpeed)],
    ],
    text: [
      parts.join(", ") + ".",
      d.weapons.length ? `Weapons: ${d.weapons.map((m) => `${m.count}× ${WEAPONS_BY_ID[m.weaponId]?.name ?? m.weaponId}${m.mods?.length ? ` (${m.mods.map((x) => WEAPON_MODS_BY_ID[x].abbr).join(" ")})` : ""}`).join(", ")}.` : "No weapons.",
      ...(d.specials.length ? [`Specials: ${d.specials.map((x) => SPECIALS_BY_ID[x]?.name ?? x).join(", ")}.`] : []),
    ],
  };
}
