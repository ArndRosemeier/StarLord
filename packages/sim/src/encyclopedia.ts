import { BUILDINGS, PROJECTS } from "./data/buildings.js";
import { ARMORS, COMPUTERS, DRIVES, FUEL_RANGES, HULLS, SHIELDS, SPECIALS, WEAPONS } from "./data/components.js";
import { TECHS, TECH_TIERS, TIER_OF_TECH, previousTier, type TechTier } from "./data/techs.js";
import { MODULES } from "./designs.js";
import type { DesignModule } from "./types.js";

/**
 * Cross-references between the rules tables, for the in-game encyclopedia.
 * Everything is derived from the data, so the help can never drift from the
 * rules.
 */

export type UnlockKind =
  | "building" | "project" | "hull" | "weapon" | "armor" | "shield" | "computer" | "special" | "drive" | "fuel" | "module";

export interface Unlock {
  kind: UnlockKind;
  /** Id in its own table (drives and fuel cells use the tech id). */
  id: string;
  name: string;
}

function collect(): Map<string, Unlock[]> {
  const out = new Map<string, Unlock[]>();
  const add = (tech: string | null, u: Unlock) => {
    if (!tech) return;
    const list = out.get(tech) ?? [];
    list.push(u);
    out.set(tech, list);
  };
  for (const b of BUILDINGS) add(b.requires, { kind: "building", id: b.id, name: b.name });
  for (const p of PROJECTS) add(p.requires, { kind: "project", id: p.id, name: p.name });
  for (const h of HULLS) add(h.requires, { kind: "hull", id: h.id, name: `${h.name} hull` });
  for (const w of WEAPONS) add(w.requires, { kind: "weapon", id: w.id, name: w.name });
  for (const a of ARMORS) add(a.requires, { kind: "armor", id: a.id, name: `${a.name} armor` });
  for (const s of SHIELDS) add(s.requires, { kind: "shield", id: s.id, name: `${s.name} shield` });
  for (const c of COMPUTERS) add(c.requires, { kind: "computer", id: c.id, name: `${c.name} computer` });
  for (const s of SPECIALS) add(s.requires, { kind: "special", id: s.id, name: s.name });
  for (const d of DRIVES) add(d.tech, { kind: "drive", id: d.tech, name: `${d.name} drive` });
  for (const f of FUEL_RANGES) add(f.tech, { kind: "fuel", id: f.tech, name: TECHS[f.tech]?.name ?? f.tech });
  // The outpost module is gated in design validation rather than in its table.
  add("outpostShip", { kind: "module", id: "outpost" satisfies DesignModule, name: MODULES.outpost.name });
  return out;
}

const UNLOCKS = collect();

/** Everything a tech makes available in the other rules tables. */
export function techUnlocks(techId: string): Unlock[] {
  return UNLOCKS.get(techId) ?? [];
}

/** Whether a tech does anything at all: unlocks something, raises a number, or has a described rule. */
export function techHasEffect(techId: string): boolean {
  const t = TECHS[techId];
  return !!t && (techUnlocks(techId).length > 0 || !!t.bonus || t.description !== "");
}

export interface TechInfo {
  tier: TechTier;
  /** Rung that must be finished before this tier can be researched. */
  prerequisite: TechTier | null;
  /** The next rung in the same field, if any. */
  leadsTo: TechTier | null;
  /** Other techs offered by the same tier. */
  alternatives: string[];
}

export function techInfo(techId: string): TechInfo | null {
  const tier = TIER_OF_TECH[techId];
  if (!tier) return null;
  return {
    tier,
    prerequisite: previousTier(tier),
    leadsTo: TECH_TIERS.find((t) => t.field === tier.field && t.level === tier.level + 1) ?? null,
    alternatives: tier.techs.filter((t) => t !== techId),
  };
}

/** Research points needed to reach and finish a tier, counting every earlier rung in its field. */
export function cumulativeTierCost(tier: TechTier): number {
  return TECH_TIERS.filter((t) => t.field === tier.field && t.level <= tier.level).reduce((sum, t) => sum + t.cost, 0);
}
