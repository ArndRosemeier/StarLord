import {
  designStyle, findDesign, raceShipStyle,
  HULLS, MONSTER_DESIGNS, WEAPONS_BY_ID,
  type CombatReport, type CombatShipSnapshot, type HullSize, type PlanetType, type PlayerView,
} from "@starlord/sim";

/**
 * Renderer-independent model of a battle replay: what each unit is, where it
 * stands after a given number of events and how to describe an event. Both
 * the 2D canvas and the 3D view draw from this.
 *
 * Reports from older saves (and today's sim) only know ships and `isPlanet`;
 * newer reports add stations, monsters, damage layers and more event kinds.
 * Everything new is optional here and unknown event kinds are ignored.
 */

/** Milliseconds per replayed event. */
export const STEP_MS = 160;

export type UnitKind ="ship" | "station" | "planet" | "monster";
export type StationTier = "starBase" | "battlestation" | "starFortress";

/** A unit snapshot with every field newer reports may carry. */
export type UnitSnapshot = Omit<CombatShipSnapshot, "kind" | "hullId" | "sizeClass" | "maxArmor" | "maxStructure" | "maxShield"> & {
  kind?: string;
  hullId?: string;
  sizeClass?: number | string;
  maxArmor?: number;
  maxStructure?: number;
  maxShield?: number;
};

/** A battle event with every field newer reports may carry. */
export interface CombatEvent {
  kind: string;
  ship: string;
  target?: string;
  x?: number;
  y?: number;
  damage?: number;
  weapon?: string;
  hit?: boolean;
  absorbed?: number;
  armorDamage?: number;
  structureDamage?: number;
  systemHit?: string | boolean;
}

export interface UnitInfo {
  snap: UnitSnapshot;
  kind: UnitKind;
  /** Hull class for ships; monsters get one from their size too. */
  hull: HullSize;
  /** Ship style for the model family. */
  style: string;
  station: StationTier | null;
  /** 0 for the smallest frigate up to 1 for the biggest station. */
  size: number;
  /** Planet type of a planet unit, for its texture. */
  planetType: PlanetType | null;
  /** Battlefield side, 0 (left) or 1 (right). */
  side: 0 | 1;
}

export interface UnitState {
  x: number;
  y: number;
  hits: number;
  armor: number | null;
  structure: number | null;
  /** Heading in battlefield coordinates, radians (0 = +x). */
  heading: number;
  alive: boolean;
  gone: boolean;
}

export type UnitStates = Map<string, UnitState>;

export interface ReplayStep {
  round: number;
  e: CombatEvent;
}

const HULL_ORDER: HullSize[] = HULLS.map((h) => h.id);
const STATION_TIERS: StationTier[] = ["starBase", "battlestation", "starFortress"];
const STATION_NAMES: Record<string, StationTier> = {
  starbase: "starBase", "star base": "starBase", battlestation: "battlestation", "battle station": "battlestation",
  starfortress: "starFortress", "star fortress": "starFortress",
};

export const unitsOf = (report: CombatReport): UnitSnapshot[] => report.ships as readonly object[] as UnitSnapshot[];
export const eventsOf = (report: CombatReport): CombatEvent[][] => report.rounds as readonly object[][] as CombatEvent[][];

/**
 * The player whose units start on the left of the field. The defender usually
 * deploys there, the attacker when it is a human player; older reports put
 * the first side there.
 */
export function leftOwner(report: CombatReport): number {
  const meanX = (owner: number) => {
    const xs = report.ships.filter((s) => s.ownerId === owner).map((s) => s.x);
    return xs.length > 0 ? xs.reduce((a, b) => a + b, 0) / xs.length : Infinity;
  };
  const [a, b] = report.sides;
  return meanX(b) < meanX(a) ? b : a;
}

export function replaySteps(report: CombatReport): ReplayStep[] {
  return eventsOf(report).flatMap((r, round) => r.map((e) => ({ round, e })));
}

function stationTier(s: UnitSnapshot): StationTier | null {
  for (const v of [s.hullId, s.designId, s.name]) {
    if (!v) continue;
    const t = STATION_NAMES[v.toLowerCase()];
    if (t) return t;
  }
  if (typeof s.sizeClass === "number" && s.sizeClass >= 8) return STATION_TIERS[Math.min(2, s.sizeClass - 8)]!;
  return null;
}

/** Style of a ship's design when the viewer can see it, else the owner's race style. */
function designStyleOf(owner: PlayerView["players"][number], designId: string): string {
  const d = findDesign(owner, designId);
  return d ? designStyle(owner, d) : raceShipStyle(owner.raceId);
}

/** The hull the report states outright, if it does. */
function reportedHull(s: UnitSnapshot): HullSize | null {
  if (s.hullId && (HULL_ORDER as string[]).includes(s.hullId)) return s.hullId as HullSize;
  if (typeof s.sizeClass === "string" && (HULL_ORDER as string[]).includes(s.sizeClass)) return s.sizeClass as HullSize;
  if (typeof s.sizeClass === "number" && s.sizeClass >= 1 && s.sizeClass < 8) {
    return HULL_ORDER[Math.min(HULL_ORDER.length - 1, Math.round(s.sizeClass) - 1)]!;
  }
  return null;
}

function designHull(s: UnitSnapshot, view: PlayerView): HullSize | null {
  return view.players[s.ownerId]?.designs.find((d) => d.id === s.designId)?.hull ?? null;
}

/** Hull class from hit points alone, for monsters and designs the viewer can't see. */
function hullFromHits(maxHits: number): HullSize {
  const bounds = [12, 40, 110, 260, 650];
  const i = bounds.findIndex((b) => maxHits < b);
  return HULL_ORDER[i === -1 ? HULL_ORDER.length - 1 : i]!;
}

function npcHull(designId: string): HullSize | null {
  const monster = MONSTER_DESIGNS.find((d) => d.id === designId);
  return monster?.fixed ? hullFromHits(monster.fixed.hits) : null;
}

function planetTypeOf(s: UnitSnapshot, report: CombatReport, view: PlayerView): PlanetType | null {
  const colonyId = s.key.startsWith("planet:") ? s.key.slice(7) : null;
  const colony = colonyId ? view.colonies[colonyId] : undefined;
  const planet = colony ? view.planets[colony.planetId] : undefined;
  if (planet) return planet.type;
  return starPlanetType(report, view, s.ownerId);
}

/** The most notable planet at the battle's star: the owner's colony, else any colony, else the first planet. */
export function starPlanetType(report: CombatReport, view: PlayerView, ownerId?: number): PlanetType | null {
  const here = Object.values(view.planets).filter((p) => p.starId === report.starId);
  const colonies = Object.values(view.colonies).filter((c) => here.some((p) => p.id === c.planetId));
  const colony = colonies.find((c) => c.ownerId === ownerId) ?? colonies[0];
  const planet = colony ? view.planets[colony.planetId] : here[0];
  return planet?.type ?? null;
}

export function unitInfo(report: CombatReport, view: PlayerView): UnitInfo[] {
  const left = leftOwner(report);
  return unitsOf(report).map((snap) => {
    const owner = view.players[snap.ownerId];
    const side: 0 | 1 = snap.ownerId === left ? 0 : 1;
    const station = snap.kind === "station" || !snap.kind ? stationTier(snap) : null;
    let kind: UnitKind;
    if (snap.kind === "ship" || snap.kind === "station" || snap.kind === "planet" || snap.kind === "monster") kind = snap.kind;
    else if (snap.isPlanet) kind = "planet";
    else if (station) kind = "station";
    else if (owner?.kind === "monsters" || MONSTER_DESIGNS.some((d) => d.id === snap.designId)) kind = "monster";
    else kind = "ship";
    if (snap.isPlanet && kind !== "planet") kind = "planet";
    const hull = reportedHull(snap) ?? npcHull(snap.designId) ?? designHull(snap, view) ?? hullFromHits(snap.maxHits);
    const tier = kind === "station" ? station ?? "starBase" : null;
    const size = kind === "station"
      ? 0.7 + 0.15 * STATION_TIERS.indexOf(tier!)
      : kind === "planet" ? 1 : HULL_ORDER.indexOf(hull) / (HULL_ORDER.length - 1) * 0.8;
    return {
      snap, kind, hull, station: tier, size, side,
      style: snap.shipStyle ?? (owner ? designStyleOf(owner, snap.designId) : "standard"),
      planetType: kind === "planet" ? planetTypeOf(snap, report, view) : null,
    };
  });
}

export function initialStates(report: CombatReport): UnitStates {
  const left = leftOwner(report);
  return new Map(unitsOf(report).map((s) => [s.key, {
    x: s.x,
    y: s.y,
    hits: s.armor !== undefined && s.structure !== undefined ? s.armor + s.structure : s.maxHits,
    armor: s.armor ?? s.maxArmor ?? null,
    structure: s.structure ?? s.maxStructure ?? null,
    heading: s.ownerId === left ? 0 : Math.PI,
    alive: true,
    gone: false,
  }]));
}

const cloneStates = (m: UnitStates): UnitStates => new Map([...m].map(([k, v]) => [k, { ...v }]));

export interface Frames {
  /** Unit states after `step` events. */
  now: UnitStates;
  /** One event earlier, so moves can glide between them. */
  prev: UnitStates;
}

export function framesAt(report: CombatReport, steps: ReplayStep[], step: number): Frames {
  const units = initialStates(report);
  let prev = cloneStates(units);
  for (let i = 0; i < step && i < steps.length; i++) {
    if (i === step - 1) prev = cloneStates(units);
    applyEvent(units, steps[i]!.e);
  }
  return { now: units, prev };
}

export function applyEvent(units: UnitStates, e: CombatEvent): void {
  const s = units.get(e.ship);
  if (!s) return;
  switch (e.kind) {
    case "move": {
      const x = e.x ?? s.x;
      const y = e.y ?? s.y;
      if (x !== s.x || y !== s.y) s.heading = Math.atan2(y - s.y, x - s.x);
      s.x = x;
      s.y = y;
      break;
    }
    case "fire": {
      const t = e.target ? units.get(e.target) : undefined;
      if (!t) break;
      t.hits -= e.damage ?? 0;
      if (t.armor !== null) t.armor = Math.max(0, t.armor - (e.armorDamage ?? 0));
      if (t.structure !== null) t.structure = Math.max(0, t.structure - (e.structureDamage ?? 0));
      break;
    }
    case "repair": {
      // Repairs give back hit points; the amount rides in `damage` when the sim records one.
      const amount = e.damage ?? 0;
      s.hits += amount;
      break;
    }
    case "destroyed":
      s.alive = false;
      break;
    case "retreat":
      s.gone = true;
      break;
    case "captured":
      // A prize sits out the rest of the battle, unless its telepathic captor turns it on its old side.
      if (!e.hit) s.gone = true;
      break;
    // launch, board and any future kinds change nothing we track.
  }
}

export type WeaponLook = "beam" | "missile" | "torpedo" | "spores";

export function weaponLook(weapon?: string): WeaponLook {
  const kind = weapon ? WEAPONS_BY_ID[weapon]?.kind : undefined;
  if (kind === "missile" || kind === "torpedo" || kind === "spores") return kind;
  return "beam";
}

export const isProjectile = (weapon?: string): boolean => {
  const look = weaponLook(weapon);
  return look === "missile" || look === "torpedo";
};

export function describe(report: CombatReport, e: CombatEvent | undefined): string {
  if (!e) return "";
  const n = (k?: string) => report.ships.find((s) => s.key === k)?.name ?? "?";
  switch (e.kind) {
    case "move": return `${n(e.ship)} moves`;
    case "fire": {
      if (!e.hit) return `${n(e.ship)} misses ${n(e.target)}`;
      const absorbed = e.absorbed ? ` (${e.absorbed} absorbed by shields)` : "";
      const system = typeof e.systemHit === "string" && e.systemHit ? `, ${systemName(e.systemHit)} knocked out` : "";
      return `${n(e.ship)} hits ${n(e.target)} for ${e.damage ?? 0}${absorbed}${system}`;
    }
    case "destroyed": return `${n(e.ship)} destroyed`;
    case "retreat": return `${n(e.ship)} retreats`;
    case "launch": return `${n(e.ship)} launches${e.target ? ` at ${n(e.target)}` : ""}`;
    case "board": return `${n(e.ship)} boards ${n(e.target)}${e.hit === false ? ", and is beaten back" : ""}`;
    case "captured": return `${n(e.ship)} is captured by ${n(e.target)}'s marines${e.hit ? " and turns on its old side" : ""}`;
    case "repair": return `${n(e.ship)} repairs${e.damage ? ` ${e.damage}` : ""}`;
    default: return "";
  }
}

/** Readable name for a knocked-out system id ("drive", a weapon id, ...). */
export function systemName(id: string): string {
  const weapon = WEAPONS_BY_ID[id];
  if (weapon) return weapon.name;
  return id.replace(/([a-z])([A-Z])/g, "$1 $2").toLowerCase();
}

export function unitAlive(frames: Frames, key: string): boolean {
  const s = frames.now.get(key);
  return !!s && s.alive && !s.gone;
}
