import {
  CLIMATES, canFarm, canReach, distance, distanceToNearestColony, fleetRange, getRace, gravityMultiplier, guarded,
  hasTrait, knows, maxPopulation, type Command, type Planet, type PlayerView,
} from "@starlord/sim";
import { isOnly, me, myFleets, starById } from "./util.js";

export interface Target {
  planet: Planet;
  value: number;
}

const MINERAL_VALUE = { ultraPoor: 0.7, poor: 0.85, abundant: 1, rich: 1.2, ultraRich: 1.4 } as const;
/** Colonies smaller than this cost more in food and upkeep than they return. */
const MIN_COLONY_POP = 3;

/** Known free planets in range that a colony ship could settle, best first. */
export function colonizationTargets(view: PlayerView): Target[] {
  const player = me(view);
  const race = getRace(player.raceId);
  const range = fleetRange(player);
  const eats = !hasTrait(race, "lithovore");
  const ownFood = knows(player, "hydroponicFarm");
  const targets: Target[] = [];
  for (const planet of Object.values(view.planets)) {
    if (planet.colonyId) continue;
    const pop = maxPopulation(planet, race, [], player);
    if (pop < MIN_COLONY_POP || !CLIMATES[planet.type].habitable) continue;
    // A world that can't farm lives on food shipped from elsewhere, which ties up farmers at home.
    const food = !eats || canFarm(planet, player) ? 1 : ownFood ? 0.6 : 0.3;
    const star = starById(view, planet.starId);
    const d = distanceToNearestColony(view, view.viewer, star);
    if (d > range || guarded(view, view.viewer, star.id)) continue;
    const special = planet.special === "none" ? 1 : 1.3;
    targets.push({
      planet,
      value: (pop * gravityMultiplier(race, planet.gravity) * MINERAL_VALUE[planet.minerals] * special * food) / (1 + d / 6),
    });
  }
  return targets.sort((a, b) => b.value - a.value);
}

/** Hostile worlds worth an outpost: they extend fuel range and claim systems. */
export function outpostTargets(view: PlayerView): Target[] {
  const player = me(view);
  const range = fleetRange(player);
  const targets: Target[] = [];
  for (const planet of Object.values(view.planets)) {
    const climate = CLIMATES[planet.type];
    if (planet.colonyId || !climate.habitable || !climate.hostile) continue;
    const star = starById(view, planet.starId);
    const d = distanceToNearestColony(view, view.viewer, star);
    if (d > range || d < 1 || guarded(view, view.viewer, star.id)) continue;
    targets.push({ planet, value: d / (1 + d / 4) });
  }
  return targets.sort((a, b) => b.value - a.value);
}

function settle(view: PlayerView, role: "colony" | "outpost", targets: Target[]): Command[] {
  const out: Command[] = [];
  const ships = myFleets(view).filter((f) => isOnly(view, f, role));
  const claimedStars = new Set(ships.map((f) => f.destStarId).filter(Boolean));
  const claimed = new Set<string>();
  for (const f of ships) {
    if (f.destStarId || !f.starId) continue;
    const here = targets.find((t) => t.planet.starId === f.starId && !claimed.has(t.planet.id));
    const best = targets.find((t) => !claimed.has(t.planet.id) && !claimedStars.has(t.planet.starId) && canReach(view, view.viewer, f, t.planet.starId));
    if (here && (!best || here.value >= best.value * 0.8)) {
      claimed.add(here.planet.id);
      out.push({ type: "colonize", fleetId: f.id, planetId: here.planet.id });
      continue;
    }
    if (best) {
      claimed.add(best.planet.id);
      claimedStars.add(best.planet.starId);
      const dest = starById(view, best.planet.starId);
      if (distance(f, dest) > 0) out.push({ type: "moveFleet", fleetId: f.id, destStarId: dest.id });
    }
  }
  return out;
}

export function colonizationOrders(view: PlayerView): Command[] {
  return [...settle(view, "colony", colonizationTargets(view)), ...settle(view, "outpost", outpostTargets(view))];
}
