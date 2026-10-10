import type { BuildingEffects, EmpireBonus, PlanetDefense, SpecialEffects } from "@starlord/sim";
import { fmt, pct, signed } from "../ui/format";

/**
 * Player-facing text for the declarative effect objects in the rules data.
 * Each table is keyed by every field of its type, so adding a new effect to
 * the data without explaining it here fails the typecheck.
 */

type Explain<T> = { [K in keyof Required<T>]: (v: NonNullable<T[K]>) => string };

const PLANET_DEFENSE: Explain<PlanetDefense> = {
  hits: (v) => `${fmt(v)} defense hit points`,
  shield: (v) => `planetary shield stops ${v} damage per hit`,
  beams: (v) => `${v} beam batteries (best known beam weapon)`,
  missiles: (v) => `${v} missile launchers (best known missile)`,
  attack: (v) => `${signed(v)} attack for its guns`,
};

const BUILDING: Explain<BuildingEffects> = {
  foodFlat: (v) => `${signed(v)} food`,
  foodPerFarmer: (v) => `${signed(v)} food per farmer`,
  industryFlat: (v) => `${signed(v)} industry`,
  industryPerWorker: (v) => `${signed(v)} industry per worker`,
  researchFlat: (v) => `${signed(v)} research`,
  researchPerScientist: (v) => `${signed(v)} research per scientist`,
  maxPopBySize: (v) => `${signed(v, 2)} max population per planet size step`,
  bcFlat: (v) => `${signed(v)} BC per turn`,
  bcMult: (v) => `${signed(v * 100)}% BC from this colony`,
  morale: (v) => `${signed(v)}% morale`,
  pollutionCleanup: (v) => `removes ${pct(v)} of this colony's pollution`,
  growthK: (v) => `${signed(v)}k population growth per turn`,
  troops: (v) => `${signed(v)} defending troops`,
  commandPoints: (v) => `${signed(v)} command point${v === 1 ? "" : "s"}`,
  security: (v) => `${signed(v)} spy defense, empire-wide`,
  gravityFix: () => "removes the gravity penalty on this planet",
  defense: (d) => explain(PLANET_DEFENSE, d).join(", "),
};

const BONUS: Explain<EmpireBonus> = {
  foodPerFarmer: (v) => `${signed(v)} food per farmer`,
  industryPerWorker: (v) => `${signed(v)} industry per worker`,
  researchPerScientist: (v) => `${signed(v)} research per scientist`,
  maxPopPerSize: (v) => `${signed(v)} max population per planet size step`,
  growth: (v) => `${signed(v * 100)}% population growth`,
  groundCombat: (v) => `${signed(v)} ground combat`,
  spying: (v) => `${signed(v)} spying`,
  scanRange: (v) => `${signed(v)} parsec scanner range`,
  bcPerPop: (v) => `${signed(v, 1)} BC per population`,
  morale: (v) => `${signed(v)}% morale on every colony`,
  shipAttack: (v) => `${signed(v)} ship attack`,
  shipDefense: (v) => `${signed(v)} ship defense`,
  commandPoints: (v) => `${signed(v)} command point${v === 1 ? "" : "s"}`,
  pollutionCleanup: (v) => `removes ${pct(v)} of pollution on every colony`,
  maxPopFlat: (v) => `${signed(v)} max population on every colony`,
  freeFood: (v) => `each population eats ${fmt(v, 1)} food less`,
  security: (v) => `${signed(v)} spy defense`,
};

const SPECIAL: Explain<SpecialEffects> = {
  attack: (v) => `${signed(v)} beam attack`,
  defense: (v) => `${signed(v)} beam defense`,
  missileEvasion: (v) => `${pct(v)} chance to dodge each missile (half against torpedoes)`,
  pointDefense: (v) => `${pct(v)} chance to shoot down each incoming missile or torpedo`,
  structureMult: (v) => `structure ×${fmt(v, 2)}`,
  armorMult: (v) => `armor ×${fmt(v, 2)}`,
  repair: (v) => `repairs ${pct(v)} of max hit points every combat round`,
  combatSpeed: (v) => `${signed(v)} combat speed`,
  shieldPierce: (v) => `weapons ignore ${pct(v)} of enemy shields`,
  displacement: (v) => `${pct(v)} chance that each enemy shot misses outright`,
  damageBonus: (v) => `${signed(v)} damage per beam hit`,
  bombBonus: (v) => `${signed(v * 100)}% bombing damage`,
  troops: (v) => `carries ${v} troop${v === 1 ? "" : "s"}`,
};

function explain<T extends object>(table: Explain<T>, values: T): string[] {
  const out: string[] = [];
  for (const [k, v] of Object.entries(values) as [keyof T, T[keyof T]][]) {
    if (v === undefined || v === null || v === false || v === 0) continue;
    out.push((table[k] as (x: unknown) => string)(v));
  }
  return out;
}

export const buildingEffects = (e: BuildingEffects) => explain(BUILDING, e);
export const empireBonus = (b: EmpireBonus) => explain(BONUS, b);
export const specialEffects = (e: SpecialEffects) => explain(SPECIAL, e);
