import {
  HULLS, SPECIALS, WEAPONS, WEAPON_MODS_BY_ID, bestArmor, bestComputer, bestShield, colonyOutput, designStats, empireTotals, hasStarDock,
  knows, mountFirepower, refinement, validateDesign, weaponUnitCost,
  type Colony, type Command, type HullSize, type PlayerView, type ShipDesign, type WeaponDef, type WeaponModId,
  type WeaponMount,
} from "@starlord/sim";
import { strategyOf } from "./strategies.js";
import { me } from "./util.js";

/** Specials worth their space on a warship, best first. */
const SPECIAL_PRIORITY = [
  "battleScanner", "automatedRepairUnit", "inertialNullifier", "inertialStabilizer", "highEnergyFocus", "structuralAnalyzer",
  "achillesTargetingUnit", "reinforcedHull", "heavyArmor", "multiPhasedShields", "hardShields", "wideAreaJammer",
  "multiWaveEcm", "ecmJammer", "displacementDevice", "augmentedEngines",
];

/** Mod combinations the AI considers for a weapon. */
const MOD_SETS: WeaponModId[][] = [
  [], ["heavyMount"], ["autoFire"], ["continuous"], ["armorPiercing"], ["shieldPiercing"], ["noRangeDissipation"],
  ["heavyMount", "continuous"], ["heavyMount", "armorPiercing"], ["autoFire", "continuous"], ["heavyMount", "shieldPiercing"],
  ["mirv"], ["fast"], ["eccm"], ["overloaded"], ["enveloping"],
];

/** Turns of a colony's industry a warship may cost, by design strategy. */
const BUILD_TURNS: Record<string, number> = { balanced: 12, heavy: 25, light: 6 };

/** Largest hull whose cost a colony with this industry can turn out in about twelve turns (more or less by strategy). */
function pickHull(view: PlayerView, industry: number, maxHull: HullSize = "titan"): HullSize {
  const player = me(view);
  const limit = HULLS.findIndex((h) => h.id === maxHull);
  const known = HULLS.filter((h, i) => knows(player, h.requires) && i <= limit);
  const turns = BUILD_TURNS[strategyOf(view, "design")] ?? BUILD_TURNS.balanced!;
  const affordable = known.filter((h) => h.cost <= industry * turns);
  return (affordable.at(-1) ?? known[0]!).id;
}

function modsAllowed(view: PlayerView, w: WeaponDef, mods: WeaponModId[]): boolean {
  const player = me(view);
  const level = refinement(player, w.requires);
  return mods.every((id) => {
    const def = WEAPON_MODS_BY_ID[id];
    return w.mods.includes(id) && level >= def.refinement && (!def.requires || knows(player, def.requires));
  });
}

/** The weapon and mods giving the most damage for their space. */
function bestMount(view: PlayerView, kinds: WeaponDef["kind"][], attack: number): WeaponMount | null {
  const player = me(view);
  let best: WeaponMount | null = null;
  let bestValue = 0;
  for (const w of WEAPONS) {
    if (!kinds.includes(w.kind) || !knows(player, w.requires)) continue;
    for (const mods of MOD_SETS) {
      if (!modsAllowed(view, w, mods)) continue;
      const m: WeaponMount = { weaponId: w.id, count: 1, mods, ...(w.kind === "missile" ? { ammo: 10 } : {}) };
      // Bombs never fire at ships, so firepower rates them 0; weigh them by their damage to planets instead.
      const firepower = w.kind === "bomb" ? (w.damageMin + w.damageMax) / 2 : mountFirepower(m, attack);
      const value = firepower / weaponUnitCost(player, m).space;
      if (value > bestValue) {
        bestValue = value;
        best = m;
      }
    }
  }
  return best;
}

/** Best beam that takes the point-defense mod, for knocking down missiles and fighters. */
function pointDefenseMount(view: PlayerView): WeaponMount | null {
  const player = me(view);
  const beams = WEAPONS.filter((w) => w.kind === "beam" && w.mods.includes("pointDefense") && knows(player, w.requires));
  const w = beams.reduce<WeaponDef | null>((b, x) => (!b || x.damageMax + x.damageMin > b.damageMax + b.damageMin ? x : b), null);
  return w ? { weaponId: w.id, count: 1, mods: ["pointDefense"], arc: "full" } : null;
}

export function bestWarship(view: PlayerView, hull: HullSize, kind: "beam" | "missile" | "bomb", id: string): ShipDesign | null {
  const player = me(view);
  const design: ShipDesign = {
    id,
    name: "",
    hull,
    armor: bestArmor(player).id,
    shield: bestShield(player)?.id ?? null,
    computer: bestComputer(player)?.id ?? null,
    weapons: [],
    specials: [],
    module: null,
    obsolete: false,
  };
  const space = () => designStats(player, design);
  const fits = () => space().spaceUsed <= space().spaceTotal;
  // Up to three specials, keeping most of the hull for weapons.
  for (const s of SPECIAL_PRIORITY) {
    if (design.specials.length >= (hull === "frigate" ? 0 : hull === "destroyer" ? 1 : 3)) break;
    const def = SPECIALS.find((x) => x.id === s);
    if (!def || !knows(player, def.requires) || def.excludes?.some((x) => design.specials.includes(x))) continue;
    design.specials.push(s);
    const st = space();
    if (st.spaceUsed > st.spaceTotal * 0.35 || validateDesign(player, { ...design, name: "x" }) !== null) design.specials.pop();
  }
  const attack = space().attack;
  const main = bestMount(view, kind === "missile" ? ["missile", "torpedo"] : kind === "bomb" ? ["bomb"] : ["beam"], attack);
  if (!main) return null;
  // Cruisers and up carry some point defense against missiles and fighters.
  const pd = hull !== "frigate" && hull !== "destroyer" && kind !== "bomb" ? pointDefenseMount(view) : null;
  if (pd) {
    design.weapons.push({ ...pd });
    const pdCount = Math.max(1, Math.floor((space().spaceTotal * 0.1) / weaponUnitCost(player, pd).space));
    design.weapons[0]!.count = pdCount;
    if (!fits()) design.weapons = [];
  }
  design.weapons.unshift({ ...main, count: 1 });
  if (!fits()) return null;
  while (true) {
    design.weapons[0]!.count++;
    if (!fits()) {
      design.weapons[0]!.count--;
      break;
    }
  }
  // Leftover space goes to a cheaper beam.
  if (kind !== "beam") {
    const beam = bestMount(view, ["beam"], attack);
    if (beam) {
      design.weapons.push({ ...beam, count: 1 });
      if (!fits()) design.weapons.pop();
    }
  }
  return validateDesign(player, { ...design, name: "x" }) === null ? design : null;
}

const HULL_NAMES: Record<HullSize, string> = {
  frigate: "Lancer", destroyer: "Hunter", cruiser: "Vanguard", battleship: "Sovereign", titan: "Colossus", doomStar: "Doom",
};

/**
 * Keeps two current warship designs: "W" on the biggest hull the economy
 * carries, built where a star dock stands, and "S" on a destroyer or smaller
 * for colonies without one. Old designs are marked obsolete.
 */
export function designOrders(view: PlayerView): Command[] {
  const player = me(view);
  const mine = Object.values(view.colonies).filter((c) => c.ownerId === view.viewer && !c.outpost);
  const output = (c: Colony) => colonyOutput(view, c).industry;
  // Big ships come from the best star-dock colony; small ones from an average colony.
  const docked = Math.max(0, ...mine.filter(hasStarDock).map(output));
  const average = empireTotals(view, view.viewer).industry / Math.max(1, mine.length);
  const out: Command[] = [];
  for (const tag of ["W", "S"] as const) {
    const hull = tag === "W" ? pickHull(view, Math.max(10, docked), "titan") : pickHull(view, Math.max(10, average * 2), "destroyer");
    const current = player.designs.filter((d) => !d.obsolete && !d.module && d.id.startsWith(`ai${tag}`));
    // Missile boats when missiles out-hit beams; otherwise beam ships.
    // The beam and missile strategies fix the weapon; missile boats use beams where missiles don't fit (frigates).
    const strategy = strategyOf(view, "design");
    const beam = bestWarship(view, hull, "beam", `ai${tag}${view.turn}`);
    const missile = hull === "frigate" || strategy === "beams" ? null : bestWarship(view, hull, "missile", `ai${tag}${view.turn}`);
    const strength = (d: ShipDesign | null) => (d ? designStats(player, d).strength / Math.max(1, designStats(player, d).cost) : 0);
    const candidate = strategy === "missiles" ? missile ?? beam : strength(missile) > strength(beam) * 1.1 ? missile : beam;
    if (!candidate) continue;
    const value = designStats(player, candidate).strength;
    const best = Math.max(0, ...current.map((d) => designStats(player, d).strength));
    if (current.length > 0 && value < best * 1.15) continue;
    const mk = player.designs.filter((d) => d.id.startsWith(`ai${tag}`)).length + 1;
    candidate.name = `${HULL_NAMES[hull]} Mk ${mk}`;
    out.push({ type: "saveDesign", design: candidate });
  }
  // Retire older designs a turn after a replacement exists, so queued orders stay valid.
  for (const tag of ["W", "S", "B"]) {
    const live = player.designs.filter((d) => !d.obsolete && d.id.startsWith(`ai${tag}`));
    for (const d of live.slice(0, -1)) out.push({ type: "obsoleteDesign", designId: d.id, obsolete: true });
  }
  // The starting frigate goes once a real warship exists.
  const frigate = player.designs.find((d) => d.id === "frigate" && !d.obsolete);
  if (frigate && player.designs.some((d) => d.id.startsWith("aiS"))) out.push({ type: "obsoleteDesign", designId: "frigate", obsolete: true });
  return out;
}

/** The warship a colony should build: the big design at a star dock, the small one elsewhere. */
export function currentWarship(view: PlayerView, colony?: Colony): string | null {
  const player = me(view);
  const live = (tag: string) => player.designs.filter((x) => !x.obsolete && x.id.startsWith(`ai${tag}`)).at(-1)?.id ?? null;
  const big = live("W");
  const small = live("S") ?? player.designs.find((x) => x.id === "frigate" && !x.obsolete)?.id ?? null;
  if (colony && !hasStarDock(colony)) return small;
  return big ?? small;
}
