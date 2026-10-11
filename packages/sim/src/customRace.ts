import { CUSTOM_RACE_POINTS, EXCLUSIVE_TRAITS, GOVERNMENT_COSTS, MAX_NEGATIVE_POINTS, PICK_OPTIONS, TRAIT_COSTS, type NumericPick } from "./data/racePicks.js";
import { RACE_LOOKS, registerRaces, type RaceDef, type RacePicks } from "./data/races.js";
import { isShipStyle } from "./data/shipStyles.js";

/**
 * Player-built races, MoO2-style: pick strengths and drawbacks within a point
 * budget, borrow an existing race's portrait and video. A custom race's id is
 * derived from its contents, so the same race always gets the same id and
 * two games can never disagree about what an id means.
 */

export interface CustomRaceSpec {
  name: string;
  plural: string;
  description: string;
  color: string;
  /** Built-in race whose art this race uses. */
  assetKey: string;
  picks: RacePicks;
  /** Default ship style of the race's designs; unset borrows the style of the race whose art it uses. */
  shipStyle?: string;
}

export function raceCost(picks: RacePicks): { total: number; negative: number } {
  let total = GOVERNMENT_COSTS[picks.government];
  let negative = Math.min(0, total);
  for (const key of Object.keys(PICK_OPTIONS) as NumericPick[]) {
    const v = picks[key];
    if (v === 0) continue;
    const opt = PICK_OPTIONS[key].options.find((o) => o.value === v);
    const cost = opt ? opt.cost : Infinity;
    total += cost;
    if (cost < 0) negative += cost;
  }
  for (const t of picks.traits) {
    const cost = TRAIT_COSTS[t]?.cost ?? Infinity;
    total += cost;
    if (cost < 0) negative += cost;
  }
  return { total, negative: Math.abs(negative) };
}

export function validateCustomRace(spec: CustomRaceSpec): string | null {
  if (!spec.name.trim() || spec.name.length > 24) return "name must be 1-24 characters";
  if (!spec.plural.trim() || spec.plural.length > 24) return "plural must be 1-24 characters";
  if (!/^#[0-9a-fA-F]{6}$/.test(spec.color)) return "color must be #rrggbb";
  if (!RACE_LOOKS.some((l) => l.assetKey === spec.assetKey)) return "unknown appearance";
  if (spec.shipStyle !== undefined && !isShipStyle(spec.shipStyle)) return "unknown ship style";
  if (!(spec.picks.government in GOVERNMENT_COSTS)) return "unknown government";
  for (const key of Object.keys(PICK_OPTIONS) as NumericPick[]) {
    const v = spec.picks[key];
    if (v !== 0 && !PICK_OPTIONS[key].options.some((o) => o.value === v)) return `invalid ${key}`;
  }
  if (new Set(spec.picks.traits).size !== spec.picks.traits.length) return "duplicate trait";
  for (const t of spec.picks.traits) if (!TRAIT_COSTS[t]) return `trait ${t} not available`;
  for (const group of EXCLUSIVE_TRAITS) {
    if (group.filter((t) => spec.picks.traits.includes(t)).length > 1) return `${group.join(" and ")} exclude each other`;
  }
  const { total, negative } = raceCost(spec.picks);
  if (negative > MAX_NEGATIVE_POINTS) return `at most ${MAX_NEGATIVE_POINTS} points of drawbacks`;
  if (total > CUSTOM_RACE_POINTS) return `uses ${total} of ${CUSTOM_RACE_POINTS} points`;
  return null;
}

function hashString(s: string): string {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619) >>> 0;
  return h.toString(16).padStart(8, "0");
}

/** Turns a valid spec into a race definition and makes it known to the rules. */
export function buildCustomRace(spec: CustomRaceSpec): RaceDef {
  const why = validateCustomRace(spec);
  if (why) throw new Error(`Invalid custom race: ${why}`);
  const picks: RacePicks = { ...spec.picks, traits: [...spec.picks.traits].sort() };
  const body = {
    name: spec.name.trim(), plural: spec.plural.trim(), description: spec.description.trim().slice(0, 300),
    color: spec.color.toLowerCase(), assetKey: spec.assetKey, picks,
    ...(spec.shipStyle ? { shipStyle: spec.shipStyle } : {}),
  };
  const def: RaceDef = { id: `custom-${hashString(JSON.stringify(body))}`, archetype: "Custom race", ...body };
  registerRaces([def]);
  return def;
}
