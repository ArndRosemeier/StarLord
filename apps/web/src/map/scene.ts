import { distance, type Fleet, type PlayerView, type Star } from "@starlord/sim";

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
  selectedFleetId: string | null;
  /** Stars the selected fleet can reach this order. */
  reachable: Set<string>;
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
}

export interface SceneFleet {
  id: string;
  x: number;
  y: number;
  color: string;
  mine: boolean;
  ships: number;
  dest: { x: number; y: number } | null;
  starId: string | null;
  kind: "empire" | "monsters" | "raiders";
}

export const STAR_COLORS: Record<string, string> = {
  blue: "#8fb8ff", white: "#f2f4ff", yellow: "#ffe27a", orange: "#ffad5c",
  red: "#ff6b5a", brown: "#a0785a", blackHole: "#7a4dff",
};

export function buildScene(
  view: PlayerView,
  selectedStarId: string | null,
  selectedFleetId: string | null,
  reach?: (fleet: Fleet, starId: string) => boolean,
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
      starId: f.starId,
      kind: owner.kind,
    };
  });
  const reachable = new Set<string>();
  const sel = selectedFleetId ? view.fleets[selectedFleetId] : undefined;
  if (sel && sel.ownerId === view.viewer && reach) {
    for (const s of view.galaxy.stars) if (reach(sel, s.id)) reachable.add(s.id);
  }
  return {
    width: view.galaxy.width,
    height: view.galaxy.height,
    stars, fleets, selectedStarId, selectedFleetId, reachable,
  };
}

export { distance };
