import { FIGHTER_GARRISON, type BuildingEffects, type EmpireBonus, type PlanetDefense, type SpecialEffects } from "@starlord/sim";
import { fmt, pct, signed } from "../ui/format";

/**
 * Player-facing text for the declarative effect objects in the rules data.
 * Each table is keyed by every field of its type, so adding a new effect to
 * the data without explaining it here fails the typecheck.
 */

type Explain<T> = { [K in keyof Required<T>]: (v: NonNullable<T[K]>) => string };

const STATION_NAMES = { starBase: "star base", battlestation: "battlestation", starFortress: "star fortress" } as const;
const INSTALLATION_NAMES = {
  groundBatteries: "ground batteries: 300 space of your best beam weapon on the planet",
  missileBase: "missile base: 300 space of your best missile, never out of ammunition",
  stellarConverter: "stellar converter: 400 damage to every shield of a ship in orbit each combat turn",
} as const;

const PLANET_DEFENSE: Explain<PlanetDefense> = {
  station: (v) => `orbital ${STATION_NAMES[v]} that fights in every battle here and lets the colony build cruisers and larger hulls`,
  installation: (v) => INSTALLATION_NAMES[v],
  mines: () => "space mines that strike attacking ships before the battle starts",
  shield: (v) => `planetary shield stops ${v} damage per hit`,
  fighters: (v) => `${v} interceptors based on the planet (${FIGHTER_GARRISON.bombers} bombers or ${FIGHTER_GARRISON.heavyFighters} heavy fighters once known)`,
};

const BUILDING: Explain<BuildingEffects> = {
  foodFlat: (v) => `${signed(v)} food`,
  foodPerFarmer: (v) => `${signed(v)} food per farmer`,
  industryFlat: (v) => `${signed(v)} industry`,
  industryPerWorker: (v) => `${signed(v)} industry per worker`,
  researchFlat: (v) => `${signed(v)} research`,
  researchPerScientist: (v) => `${signed(v)} research per scientist`,
  needsSoil: () => "only on worlds with soil (not barren, radiated or toxic)",
  industryByMinerals: (v) => `industry by minerals: ${Object.values(v).map((x) => signed(x)).join(" / ")} (ultra poor to ultra rich)`,
  industryPerPop: (v) => `${signed(v)} industry per population unit, whatever its job; it never pollutes`,
  maxPopFlat: (v) => `${signed(v)} max population`,
  bcFlat: (v) => `${signed(v)} BC per turn`,
  bcMult: (v) => `${signed(v * 100)}% BC from every source at this colony`,
  morale: (v) => `${signed(v)}% morale`,
  pollutionFactor: (v) => `only ${pct(v)} of the industry counts toward pollution (several multiply)`,
  noPollution: () => "no pollution on this colony",
  foodReplicator: (v) => `turns ${v} industry into 1 food whenever the colony is short`,
  growthK: (v) => `${signed(v)}k population growth per turn`,
  troops: (v) => `${signed(v)} defending troops when built`,
  training: (v) => `trains another ${v.kind === "marines" ? "marine" : "tank battalion"} every ${v.every} turns, up to ${pct(v.capOfMaxPop)} of the max population`,
  garrison: () => "lifts the morale penalty for colonies without barracks",
  commandPoints: (v) => `${signed(v)} command point${v === 1 ? "" : "s"}`,
  security: (v) => `${signed(v)} spy defense, empire-wide`,
  gravityFix: () => "removes the gravity penalty on this planet",
  defense: (d) => explain(PLANET_DEFENSE, d).join(", "),
  scanRange: (v) => `${signed(v)} parsec scanner range around this colony`,
  alienManagement: (v) => `conquered people assimilate one unit every ${v.assimilationTurns} turns, revolts ${pct(1 - v.revoltMult)} less likely, no multi-race morale penalty`,
  capitol: () => "seat of government; losing it hurts morale everywhere until rebuilt",
  crew: (v) => `ships built here start ${v.startLevels} crew level higher; crews in the system gain ${v.xpPerTurn} experience a turn`,
  interdictRadius: (v) => `hostile fleets within ${v} parsecs move only 1 parsec per turn`,
  blocksInvasion: () => "no ground troops or biological weapons get through",
  radiatedToBarren: () => "a radiated planet becomes barren",
};

const BONUS: Explain<EmpireBonus> = {
  foodPerFarmer: (v) => `${signed(v)} food per farmer`,
  industryPerWorker: (v) => `${signed(v)} industry per worker`,
  researchPerScientist: (v) => `${signed(v)} research per scientist`,
  maxPopPerSize: (v) => `${signed(v)} max population per planet size step`,
  growth: (v) => `${signed(v * 100)}% population growth`,
  groundCombat: (v) => `${signed(v, 1)} ground combat`,
  spying: (v) => `${signed(v, 1)} spying`,
  scanRange: (v) => `${signed(v)} parsec scanner range`,
  bcPerPop: (v) => `${signed(v, 1)} BC per population`,
  incomePercent: (v) => `+${v}% BC at every colony`,
  morale: (v) => `${signed(v)}% morale on every colony`,
  shipAttack: (v) => `${signed(v)} ship attack`,
  shipDefense: (v) => `${signed(v)} ship defense`,
  commandPoints: (v) => `${signed(v)} command point${v === 1 ? "" : "s"}`,
  pollutionTolerance: (v) => `pollution tolerance ${signed(v * 100)}% on every planet`,
  maxPopFlat: (v) => `${signed(v)} max population on every colony`,
  hostileFarming: () => "farming becomes possible on worlds without soil",
  security: (v) => `${signed(v)} spy defense`,
  commandPointsPerBase: (v) => `${signed(v)} command point${v === 1 ? "" : "s"} per star base, battlestation or star fortress`,
  diplomacy: (v) => `${signed(v)} diplomatic points on every deal you offer`,
};

const SPECIAL: Explain<SpecialEffects> = {
  beamAttack: (v) => `${signed(v)} beam attack`,
  beamDefense: (v) => `${signed(v)} beam defense`,
  cloakDefense: (v) => `${signed(v)} beam defense until the ship fires`,
  phasing: (v) => `out of phase for the first ${v} rounds: cannot be targeted`,
  missileEvasion: (v) => `${signed(v)} missile evasion`,
  fleetMissileEvasion: (v) => `${signed(v)} missile evasion for every ship in the fleet`,
  combatSpeed: (v) => `${signed(v)} combat speed`,
  armorMult: (v) => `armor ×${fmt(v, 2)}`,
  structureMult: (v) => `structure ×${fmt(v, 2)}`,
  hardShields: (v) => `shields stop ${v} more damage per hit and cannot be pierced`,
  shieldStrengthMult: (v) => `shield strength ×${fmt(v, 2)}`,
  shieldRegen: (v) => `shields recover ${pct(v)} more each round`,
  damageTaken: (v) => `only ${pct(v)} of each hit's damage gets through`,
  absorber: (v) => `soaks up ${pct(v)} of beam damage that would hit the ship`,
  displacement: (v) => `${pct(v)} chance that any shot at the ship misses`,
  reflection: (v) => `may reflect beam hits back at the shooter (strength ${v})`,
  beamDamagePct: (v) => `${signed(v)}% beam damage`,
  penetratingMult: (v) => `damage that gets past shields ×${fmt(v, 1)}`,
  achilles: () => "hits skip armor and favor weapons and shield generators",
  rangeDivisor: (v) => `range penalties as if targets were ${v}× closer`,
  repair: (v) => `repairs ${pct(v)} of armor and structure each round`,
  repairSystems: (v) => `repairs ${pct(v)} of damaged systems each round`,
  hyperX: () => "beams fire twice every other round",
  fastRacks: () => "missile racks fire two volleys every other round",
  lightning: (v) => `${pct(v)} chance to destroy each incoming missile, torpedo or fighter`,
  marinesMult: (v) => `marines ×${fmt(v, 1)}`,
  boardingDefense: (v) => `${signed(v)} to marines repelling boarders`,
  extraTurn: () => "acts twice each round",
  teleport: (v) => `can jump up to ${v} squares once a round`,
  hullSpacePct: (v) => `${signed(v)}% hull space`,
  fuelRangePct: (v) => `${signed(v)}% fuel range`,
  warpDissipator: () => "enemies cannot retreat from the battle",
  detonator: (v) => `explodes with ×${v} force when destroyed`,
  monsterAttackPerSize: (v) => `${signed(v)} attack per size class against monsters, for the whole fleet`,
  scoutLab: () => "produces research each turn, more on bigger hulls",
  transporters: (v) => `beams marines aboard enemy ships up to ${v} squares away`,
  stealth: () => "hidden from enemy scanners on the galaxy map",
  turnCost: (v) => (v === 0 ? "turns for free" : `turning costs ${pct(v)} of normal`),
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
