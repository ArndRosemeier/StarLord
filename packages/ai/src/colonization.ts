import {
  distance, distanceToNearestColony, fleetRange, getRace, gravityMultiplier, maxPopulation,
  type Command, type Planet, type PlayerView,
} from "@starlord/sim";
import { isOnly, myFleets, starById } from "./util.js";

export interface Target {
  planet: Planet;
  value: number;
}

/** Known free planets in range, best first. */
export function colonizationTargets(view: PlayerView): Target[] {
  const me = view.players[view.viewer]!;
  const race = getRace(me.raceId);
  const range = fleetRange(view, view.viewer);
  const targets: Target[] = [];
  for (const planet of Object.values(view.planets)) {
    if (planet.colonyId) continue;
    const pop = maxPopulation(planet, race);
    if (pop <= 0) continue;
    const star = starById(view, planet.starId);
    const d = distanceToNearestColony(view, view.viewer, star);
    if (d > range) continue;
    const mineralBonus = { ultraPoor: 0.7, poor: 0.85, abundant: 1, rich: 1.2, ultraRich: 1.4 }[planet.minerals];
    targets.push({ planet, value: (pop * gravityMultiplier(race, planet.gravity) * mineralBonus) / (1 + d / 6) });
  }
  return targets.sort((a, b) => b.value - a.value);
}

export function colonizationOrders(view: PlayerView): Command[] {
  const out: Command[] = [];
  const ships = myFleets(view).filter((f) => isOnly(f, "colony"));
  const targets = colonizationTargets(view);
  const claimedStars = new Set(ships.map((f) => f.destStarId).filter(Boolean));
  const claimedPlanets = new Set<string>();

  for (const f of ships) {
    if (f.destStarId) continue;
    // Settle here if this system has a target worth taking.
    const here = targets.find((t) => t.planet.starId === f.starId && !claimedPlanets.has(t.planet.id));
    const best = targets.find((t) => !claimedPlanets.has(t.planet.id) && !claimedStars.has(t.planet.starId));
    if (here && (!best || here.value >= best.value * 0.8)) {
      claimedPlanets.add(here.planet.id);
      out.push({ type: "colonize", fleetId: f.id, planetId: here.planet.id });
      continue;
    }
    if (best) {
      claimedPlanets.add(best.planet.id);
      claimedStars.add(best.planet.starId);
      const dest = starById(view, best.planet.starId);
      if (distance(f, dest) > 0) out.push({ type: "moveFleet", fleetId: f.id, destStarId: dest.id });
    }
  }
  return out;
}
