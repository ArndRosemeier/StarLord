import {
  canColonize, canOutpost, distance, distanceToNearestColony, findDesign, fleetRange, fleetSpeed, getRace, maxPopulation, ownsColonyAt, travelTurns,
  type Colony, type Fleet, type Planet, type Player, type PlayerView, type Star,
} from "@starlord/sim";
import { routeTo } from "../map/scene";
import { colonizeOption, type ColonizeOption } from "./colonize";

/** A colony or outpost ship the viewer could send to a planet now, and how long it would take. */
export interface Dispatch {
  fleetId: string;
  fleetName: string;
  turns: number;
  /** Other ships fly along, since the whole fleet moves. */
  escorts: number;
}

/** One known planet as the Planets screen lists it, all from the viewer's PlayerView. */
export interface PlanetRow {
  planet: Planet;
  star: Star;
  /** The colony's name, or the star's name and orbit. */
  name: string;
  colony: Colony | null;
  owner: Player | null;
  /** Free, and a colony ship could found a colony here. */
  colonizable: boolean;
  /** Free, and an outpost ship could claim it. */
  outpostable: boolean;
  /** Most people of the viewer's race it holds with today's technology, before buildings; 0 when none can live here. */
  maxPop: number;
  /** Parsecs to the viewer's nearest own colony or outpost (Infinity when it has none). */
  distance: number;
  /** Turns at the empire's base speed to cover that distance (ignores nebulae and gates). */
  turns: number;
  /** Within fuel range of a colony the viewer's ships refuel at (its own, or an ally's). */
  inRange: boolean;
  /** Hostile monsters or raiders guard the system; settling there is refused until they are gone. */
  guarded: boolean;
  /** A colony or outpost ship already in orbit that could settle it this turn. */
  here: ColonizeOption | null;
  /** The nearest idle colony / outpost ship elsewhere that can reach it. */
  sendColony: Dispatch | null;
  sendOutpost: Dispatch | null;
  /** A colony or outpost ship of the viewer is already flying there. */
  enRoute: { fleetName: string; turns: number } | null;
}

const ROMAN = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X"];
const roman = (n: number) => ROMAN[n - 1] ?? String(n);

/** Which settler modules a fleet carries. */
function settlers(me: Player, f: Fleet): { colony: boolean; outpost: boolean } {
  let colony = false;
  let outpost = false;
  for (const s of f.ships) {
    if (s.count <= 0) continue;
    const m = findDesign(me, s.designId)?.module;
    if (m === "colony") colony = true;
    if (m === "outpost") outpost = true;
  }
  return { colony, outpost };
}

/** Every planet in the viewer's explored systems, with what it would take to settle it. */
export function planetRows(view: PlayerView): PlanetRow[] {
  const me = view.players[view.viewer]!;
  const race = getRace(me.raceId);
  const range = fleetRange(me);
  const speed = fleetSpeed(me);
  const starById = new Map(view.galaxy.stars.map((s) => [s.id, s]));
  const myStars = [...new Set(Object.values(view.colonies)
    .filter((c) => c.ownerId === me.id)
    .map((c) => view.planets[c.planetId]?.starId)
    .filter((id): id is string => !!id))]
    .map((id) => starById.get(id)!)
    .filter(Boolean);
  const guarded = new Set(Object.values(view.fleets)
    .filter((f) => f.starId && view.players[f.ownerId]?.kind !== "empire")
    .map((f) => f.starId!));
  const mine = Object.values(view.fleets).filter((f) => f.ownerId === me.id);
  const carriers = mine.map((f) => ({ f, ...settlers(me, f) })).filter((x) => x.colony || x.outpost);
  // Idle carriers can be sent; those under way are reported as en route to their destination.
  const idle = carriers.filter((x) => x.f.starId && (!x.f.destStarId || x.f.destStarId === x.f.starId));
  const routes = new Map<string, ReturnType<typeof routeTo>>();
  const route = (f: Fleet, starId: string) => {
    const key = `${f.id}|${starId}`;
    let r = routes.get(key);
    if (!r) routes.set(key, (r = routeTo(view, f, starId)));
    return r;
  };
  const best = (starId: string, kind: "colony" | "outpost"): Dispatch | null => {
    let out: Dispatch | null = null;
    for (const x of idle) {
      if (!x[kind] || x.f.starId === starId) continue;
      const r = route(x.f, starId);
      if (!r.ok) continue;
      const escorts = x.f.ships.reduce((n, s) => n + s.count, 0) - 1;
      if (!out || r.turns < out.turns || (r.turns === out.turns && escorts < out.escorts)) {
        out = { fleetId: x.f.id, fleetName: x.f.name, turns: r.turns, escorts };
      }
    }
    return out;
  };

  const rows: PlanetRow[] = [];
  for (const planet of Object.values(view.planets)) {
    const star = starById.get(planet.starId);
    if (!star) continue;
    const colony = planet.colonyId ? view.colonies[planet.colonyId] ?? null : null;
    const owner = colony ? view.players[colony.ownerId] ?? null : null;
    const free = !planet.colonyId;
    const colonizable = free && canColonize(planet.type);
    const outpostable = free && canOutpost(planet.type);
    const d = myStars.length ? Math.min(...myStars.map((s) => distance(s, star))) : Infinity;
    const refuel = distanceToNearestColony(view, me.id, star);
    const coming = carriers.find((x) => x.f.destStarId === star.id && x.f.starId !== star.id);
    rows.push({
      planet, star, colony, owner,
      name: colony?.name ?? `${star.name} ${roman(planet.orbit)}`,
      colonizable, outpostable,
      maxPop: canColonize(planet.type) ? maxPopulation(planet, race, [], me) : 0,
      distance: d,
      turns: Number.isFinite(d) ? Math.ceil(d / speed) : Infinity,
      inRange: ownsColonyAt(view, me.id, star.id) || refuel <= range,
      guarded: guarded.has(star.id),
      here: free ? colonizeOption(view, planet.id) : null,
      sendColony: colonizable ? best(star.id, "colony") : null,
      sendOutpost: outpostable ? best(star.id, "outpost") : null,
      enRoute: coming && free ? { fleetName: coming.f.name, turns: travelTurns(view, coming.f, star.id) } : null,
    });
  }
  return rows;
}
