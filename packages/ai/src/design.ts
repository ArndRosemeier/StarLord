import {
  ARMORS, COMPUTERS, HULLS, SHIELDS, SPECIALS, WEAPONS, bestOf, designStats, empireTotals, knows, validateDesign,
  type Command, type HullSize, type PlayerView, type ShipDesign,
} from "@starlord/sim";
import { me } from "./util.js";

/** Specials worth their space on a warship, best first. */
const SPECIAL_PRIORITY = [
  "automatedRepairUnit", "battleScanner", "multiWaveEcm", "inertialStabilizer", "reinforcedHull", "heavyArmor",
  "ecmJammer", "advancedDamageControl", "achillesTargetingUnit", "structuralAnalyzer", "displacementDevice",
];

/** Largest hull whose cost a decent colony can turn out in about eight turns. */
function pickHull(view: PlayerView, industry: number): HullSize {
  const player = me(view);
  const known = HULLS.filter((h) => knows(player, h.requires) && h.id !== "doomStar");
  const affordable = known.filter((h) => h.cost * 3 <= industry * 8);
  return (affordable.at(-1) ?? known[0]!).id;
}

export function bestWarship(view: PlayerView, hull: HullSize, kind: "beam" | "missile" | "bomb", id: string): ShipDesign | null {
  const player = me(view);
  const design: ShipDesign = {
    id,
    name: "",
    hull,
    armor: bestOf(player, ARMORS)!.id,
    shield: bestOf(player, SHIELDS)?.id ?? null,
    computer: bestOf(player, COMPUTERS)?.id ?? null,
    weapons: [],
    specials: [],
    module: null,
    obsolete: false,
  };
  const hullDef = HULLS.find((h) => h.id === hull)!;
  // Up to two specials, keeping at least half the hull for weapons.
  for (const s of SPECIAL_PRIORITY) {
    if (design.specials.length >= 2) break;
    const def = SPECIALS.find((x) => x.id === s);
    if (!def || !knows(player, def.requires)) continue;
    design.specials.push(s);
    if (designStats(player, design).spaceUsed > hullDef.space * 0.5) design.specials.pop();
  }
  const weapons = WEAPONS.filter((w) => w.kind === kind && knows(player, w.requires));
  const main = weapons.at(-1);
  if (!main) return null;
  // Fill the rest with the best weapon, then use leftover space for a cheaper one.
  design.weapons = [{ weaponId: main.id, count: 1 }];
  if (designStats(player, design).spaceUsed > hullDef.space) return null;
  while (true) {
    design.weapons[0]!.count++;
    if (designStats(player, design).spaceUsed > hullDef.space) {
      design.weapons[0]!.count--;
      break;
    }
  }
  const beam = kind === "beam" ? undefined : WEAPONS.filter((w) => w.kind === "beam" && knows(player, w.requires)).at(-1);
  if (beam) {
    design.weapons.push({ weaponId: beam.id, count: 1 });
    if (designStats(player, design).spaceUsed > hullDef.space) design.weapons.pop();
  }
  return validateDesign(player, { ...design, name: "x" }) === null ? design : null;
}

const HULL_NAMES: Record<HullSize, string> = {
  frigate: "Lancer", destroyer: "Hunter", cruiser: "Vanguard", battleship: "Sovereign", titan: "Colossus", doomStar: "Doom",
};

/** Keeps a current warship and bomber design; old ones are marked obsolete. */
export function designOrders(view: PlayerView): Command[] {
  const player = me(view);
  const industry = Math.max(10, empireTotals(view, view.viewer).industry / Math.max(1, Object.values(view.colonies).filter((c) => c.ownerId === view.viewer).length) * 2);
  const hull = pickHull(view, industry);
  const out: Command[] = [];
  for (const kind of ["beam", "bomb"] as const) {
    const tag = kind === "beam" ? "W" : "B";
    const current = player.designs.filter((d) => !d.obsolete && !d.module && d.id.startsWith(`ai${tag}`));
    const candidate = bestWarship(view, hull, kind === "bomb" ? "bomb" : "beam", `ai${tag}${view.turn}`);
    if (!candidate) continue;
    if (kind === "bomb") {
      // Bombers carry a beam for self-defense when there's room.
      if (!candidate.weapons.some((w) => WEAPONS.find((x) => x.id === w.weaponId)?.kind === "beam")) continue;
    }
    const strength = designStats(player, candidate).strength;
    const best = Math.max(0, ...current.map((d) => designStats(player, d).strength));
    if (current.length > 0 && strength < best * 1.15) continue;
    const mk = player.designs.filter((d) => d.id.startsWith(`ai${tag}`)).length + 1;
    candidate.name = `${HULL_NAMES[hull]}${kind === "bomb" ? " Bomber" : ""} Mk ${mk}`;
    out.push({ type: "saveDesign", design: candidate });
  }
  // Retire older designs a turn after a replacement exists, so queued orders stay valid.
  for (const tag of ["W", "B"]) {
    const live = player.designs.filter((d) => !d.obsolete && d.id.startsWith(`ai${tag}`));
    for (const d of live.slice(0, -1)) out.push({ type: "obsoleteDesign", designId: d.id, obsolete: true });
  }
  // The starting frigate goes once a real warship exists.
  const frigate = player.designs.find((d) => d.id === "frigate" && !d.obsolete);
  if (frigate && player.designs.some((d) => d.id.startsWith("aiW"))) out.push({ type: "obsoleteDesign", designId: "frigate", obsolete: true });
  return out;
}

/** The AI's current warship design id, falling back to the starting frigate. */
export function currentWarship(view: PlayerView, kind: "W" | "B" = "W"): string | null {
  const player = me(view);
  const d = player.designs.filter((x) => !x.obsolete && x.id.startsWith(`ai${kind}`)).at(-1);
  if (d) return d.id;
  if (kind === "B") return null;
  return player.designs.find((x) => x.id === "frigate" && !x.obsolete)?.id ?? null;
}
