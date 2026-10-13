import {
  canReach, distance, distanceToNearestColony, findDesign, fleetFuelRange, fleetRange, refuelStars, scannerEyes, travelTurns,
  type Fleet, type HullSize, type Player, type PlayerView, type Star,
} from "@starlord/sim";

/**
 * What the galaxy map shows, independent of how it is drawn. Renderers
 * (PixiJS today, maybe three.js later) only ever receive a MapScene.
 */
export interface MapScene {
  width: number;
  height: number;
  stars: SceneStar[];
  fleets: SceneFleet[];
  /** Range rings around the selected fleet and the empire's reach. */
  selectedStarId: string | null;
  /** Every selected fleet; shift-click adds to or removes from the selection. */
  selectedFleetIds: Set<string>;
  /** Stars at least one selected fleet can reach this order. */
  reachable: Set<string>;
  /** Where the selection could be sent, keyed by star; empty unless it holds fleets the viewer can order. */
  routes: Map<string, Route>;
  /** The same per selected fleet the viewer can order, keyed by fleet then star. */
  fleetRoutes: Map<string, Map<string, Route>>;
  /** Nebula clouds: they slow ships and switch off shields. */
  nebulae: { x: number; y: number; r: number }[];
  /** Wormhole pairs, drawn as links between their stars. */
  wormholes: { x1: number; y1: number; x2: number; y2: number }[];
  /** The viewer's fuel range around every star it refuels at, when that overlay is on. */
  fuelRange: RangeCircle[];
  /** The viewer's scanner coverage around its colonies and fleets, when that overlay is on. */
  scanRange: RangeCircle[];
}

/** A disc on the map in galaxy units (parsecs). */
export interface RangeCircle { x: number; y: number; r: number }

/** Which empire-wide range displays the map draws. */
export interface MapOverlays { fuel: boolean; scan: boolean }

/** Drops circles that repeat another exactly, so overlapping colonies and fleets draw one outline. */
function uniqueCircles(circles: RangeCircle[]): RangeCircle[] {
  const seen = new Set<string>();
  return circles.filter((c) => {
    const key = `${c.x},${c.y},${c.r}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** Arcs (start and end angle, radians) of each circle's rim that lie outside every other circle. */
export function unionArcs(circles: readonly RangeCircle[], step = 0.05): { circle: RangeCircle; arcs: [number, number][] }[] {
  return circles.map((c, i) => {
    const arcs: [number, number][] = [];
    const n = Math.max(24, Math.ceil((Math.PI * 2) / step));
    const d = (Math.PI * 2) / n;
    let start: number | null = null;
    for (let k = 0; k <= n; k++) {
      const a = k * d;
      const mid = a + d / 2;
      const px = c.x + Math.cos(mid) * c.r;
      const py = c.y + Math.sin(mid) * c.r;
      const covered = k < n && circles.some((o, j) => j !== i && Math.hypot(px - o.x, py - o.y) < o.r - 1e-9);
      const outside = k < n && !covered;
      if (outside && start === null) start = a;
      if (!outside && start !== null) {
        arcs.push([start, a]);
        start = null;
      }
    }
    // Join an arc that wraps past angle zero.
    if (arcs.length > 1 && arcs[0]![0] === 0 && Math.abs(arcs[arcs.length - 1]![1] - Math.PI * 2) < 1e-9) {
      const last = arcs.pop()!;
      arcs[0] = [last[0] - Math.PI * 2, arcs[0]![1]];
    }
    return { circle: c, arcs };
  });
}

/** Where the viewer's ships may fly (fuel range from every refuelling star) and what its scanners see. */
export function rangeOverlays(view: PlayerView, overlays: MapOverlays): Pick<MapScene, "fuelRange" | "scanRange"> {
  const me = view.players[view.viewer]!;
  const range = fleetRange(me);
  return {
    fuelRange: overlays.fuel ? uniqueCircles(refuelStars(view, view.viewer).map((s) => ({ x: s.x, y: s.y, r: range }))) : [],
    scanRange: overlays.scan ? uniqueCircles(scannerEyes(view, view.viewer).map((e) => ({ x: e.x, y: e.y, r: e.range }))) : [],
  };
}

/** Whether a fleet can be sent to a star, and how long it would take or why not. */
export type Route = { ok: true; turns: number } | { ok: false; reason: string };

export function routeTo(view: PlayerView, fleet: Fleet, starId: string): Route {
  const dest = view.galaxy.stars.find((s) => s.id === starId)!;
  if (canReach(view, fleet.ownerId, fleet, starId)) return { ok: true, turns: travelTurns(view, fleet, starId) };
  const here = fleet.starId ? view.galaxy.stars.find((s) => s.id === fleet.starId) : undefined;
  if (dest.special === "raiderHome") return { ok: false, reason: `Only fleets in a system with one of your Dimensional Portals can cross over to ${dest.name}.` };
  if (here?.special === "raiderHome") return { ok: false, reason: "From here the way back leads only to your Dimensional Portals." };
  const d = distanceToNearestColony(view, fleet.ownerId, dest);
  if (!Number.isFinite(d)) return { ok: false, reason: "With no colony left to refuel at, your ships cannot leave." };
  return {
    ok: false,
    reason: `${dest.name} is out of range: ${d.toFixed(1)} parsecs from your nearest colony, but this fleet's fuel range is ${fleetFuelRange(view, fleet)}.`,
  };
}

/**
 * Several fleets sent to one star: it can be ordered if any of them gets there, and the
 * combined trip takes as long as the slowest of those. With none, the first reason stands.
 */
export function combineRoutes(routes: Route[]): Route {
  const ok = routes.filter((r): r is Extract<Route, { ok: true }> => r.ok);
  if (ok.length > 0) return { ok: true, turns: Math.max(...ok.map((r) => r.turns)) };
  return routes[0] ?? { ok: false, reason: "No fleet selected." };
}

/**
 * A click on a fleet: a plain click selects only it; a shift-click adds it to the
 * selection, or takes it out if it was already in. Only your own fleets are gathered
 * this way, since only those take orders; anything else is selected on its own.
 */
export function toggleFleetSelection(
  view: PlayerView,
  selected: readonly string[],
  fleetId: string,
  additive: boolean,
): string[] {
  const mine = (id: string) => view.fleets[id]?.ownerId === view.viewer;
  if (!additive || !mine(fleetId) || !selected.every(mine)) return [fleetId];
  return selected.includes(fleetId) ? selected.filter((id) => id !== fleetId) : [...selected, fleetId];
}

export interface SceneStar {
  id: string;
  name: string;
  x: number;
  y: number;
  color: string;
  explored: boolean;
  /** Owner colours of colonies here, in planet order. */
  owners: string[];
  special: Star["special"];
  /** A monster lair or other hostile guard is known to be here. */
  guarded: boolean;
  blackHole: boolean;
}

export interface SceneFleet {
  id: string;
  x: number;
  y: number;
  color: string;
  mine: boolean;
  ships: number;
  dest: { x: number; y: number } | null;
  /** Turns until arrival, for the viewer's own fleets under way. */
  eta: number | null;
  starId: string | null;
  kind: "empire" | "monsters" | "raiders";
  /** The fleet's most significant ship, which picks its icon: the biggest warship, else its civilian role. */
  look: FleetLook;
}

export type ShipRole = "scout" | "warship" | "colony" | "outpost" | "transport";
export interface FleetLook { role: ShipRole; hull: HullSize }

const HULL_ORDER: HullSize[] = ["frigate", "destroyer", "cruiser", "battleship", "titan", "doomStar"];
/** Civilian roles rank below every warship; a colony ship outranks an outpost ship, and so on down to scouts. */
const CIVIL_RANK: Record<Exclude<ShipRole, "warship">, number> = { scout: 0, transport: 1, outpost: 2, colony: 3 };

export function fleetLook(owner: Player, fleet: Fleet): FleetLook {
  let best: FleetLook | null = null;
  let bestRank = -1;
  for (const s of fleet.ships) {
    const d = findDesign(owner, s.designId);
    if (!d) continue;
    const role: ShipRole = d.module ?? (d.weapons.length === 0 && !d.fixed ? "scout" : "warship");
    const rank = role === "warship" ? 10 + HULL_ORDER.indexOf(d.hull) : CIVIL_RANK[role];
    if (rank > bestRank) {
      bestRank = rank;
      best = { role, hull: d.hull };
    }
  }
  return best ?? { role: "warship", hull: "frigate" };
}

export const STAR_COLORS: Record<string, string> = {
  blue: "#8fb8ff", white: "#f2f4ff", yellow: "#ffe27a", orange: "#ffad5c",
  red: "#ff6b5a", brown: "#a0785a", blackHole: "#7a4dff",
};

export function buildScene(
  view: PlayerView,
  selectedStarId: string | null,
  selectedFleetIds: string | readonly string[] | null,
  canOrder = false,
  overlays: MapOverlays = { fuel: false, scan: false },
): MapScene {
  const me = view.players[view.viewer]!;
  const explored = new Set(me.explored);
  const starById = new Map(view.galaxy.stars.map((s) => [s.id, s]));
  const colonyOwners = new Map<string, string[]>();
  for (const c of Object.values(view.colonies)) {
    const planet = view.planets[c.planetId];
    if (!planet) continue;
    const list = colonyOwners.get(planet.starId) ?? [];
    list.push(view.players[c.ownerId]!.color);
    colonyOwners.set(planet.starId, list);
  }
  const guarded = new Set(
    Object.values(view.fleets)
      .filter((f) => f.starId && view.players[f.ownerId]!.kind !== "empire")
      .map((f) => f.starId!),
  );
  const stars: SceneStar[] = view.galaxy.stars.map((s) => ({
    id: s.id,
    name: s.name,
    x: s.x,
    y: s.y,
    color: STAR_COLORS[s.color] ?? "#fff",
    explored: explored.has(s.id),
    owners: colonyOwners.get(s.id) ?? [],
    special: s.special,
    guarded: guarded.has(s.id),
    blackHole: s.color === "blackHole",
  }));
  const fleets: SceneFleet[] = Object.values(view.fleets).map((f) => {
    const dest = f.destStarId ? starById.get(f.destStarId) : undefined;
    const owner = view.players[f.ownerId]!;
    return {
      id: f.id,
      x: f.x,
      y: f.y,
      color: owner.color,
      mine: f.ownerId === view.viewer,
      ships: f.ships.reduce((n, s) => n + s.count, 0),
      dest: dest && f.ownerId === view.viewer ? { x: dest.x, y: dest.y } : null,
      eta: dest && f.ownerId === view.viewer ? travelTurns(view, f, dest.id) : null,
      starId: f.starId,
      kind: owner.kind,
      look: fleetLook(owner, f),
    };
  });
  const selected = new Set(selectedFleetIds === null ? [] : typeof selectedFleetIds === "string" ? [selectedFleetIds] : selectedFleetIds);
  const reachable = new Set<string>();
  const routes = new Map<string, Route>();
  const fleetRoutes = new Map<string, Map<string, Route>>();
  const orderable = canOrder
    ? [...selected].map((id) => view.fleets[id]).filter((f): f is Fleet => !!f && f.ownerId === view.viewer)
    : [];
  for (const f of orderable) {
    fleetRoutes.set(f.id, new Map(view.galaxy.stars.map((s) => [s.id, routeTo(view, f, s.id)])));
  }
  if (orderable.length > 0) {
    for (const s of view.galaxy.stars) {
      const route = combineRoutes(orderable.map((f) => fleetRoutes.get(f.id)!.get(s.id)!));
      routes.set(s.id, route);
      if (route.ok) reachable.add(s.id);
    }
  }
  const wormholes: MapScene["wormholes"] = [];
  for (const s of view.galaxy.stars) {
    const other = s.wormholeTo ? starById.get(s.wormholeTo) : undefined;
    if (other && s.id < other.id) wormholes.push({ x1: s.x, y1: s.y, x2: other.x, y2: other.y });
  }
  return {
    width: view.galaxy.width,
    height: view.galaxy.height,
    stars, fleets, selectedStarId, selectedFleetIds: selected, reachable, routes, fleetRoutes,
    nebulae: (view.nebulae ?? []).map((n) => ({ x: n.x, y: n.y, r: n.r })),
    wormholes,
    ...rangeOverlays(view, overlays),
  };
}

export { distance };
