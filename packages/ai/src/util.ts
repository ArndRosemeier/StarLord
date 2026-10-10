import { DESIGNS_BY_ID, distance, type Fleet, type PlayerView, type ShipRole, type Star } from "@starlord/sim";

export function myColonies(view: PlayerView) {
  return Object.values(view.colonies).filter((c) => c.ownerId === view.viewer);
}

export function myFleets(view: PlayerView) {
  return Object.values(view.fleets).filter((f) => f.ownerId === view.viewer);
}

export function fleetRoles(f: Fleet): Set<ShipRole> {
  return new Set(f.ships.map((s) => DESIGNS_BY_ID[s.designId]!.role));
}

export function isOnly(f: Fleet, role: ShipRole): boolean {
  const roles = fleetRoles(f);
  return roles.size === 1 && roles.has(role);
}

export function starById(view: PlayerView, id: string): Star {
  return view.galaxy.stars.find((s) => s.id === id)!;
}

export function nearest<T extends { x: number; y: number }>(from: { x: number; y: number }, items: T[]): T | undefined {
  let best: T | undefined;
  let bestD = Infinity;
  for (const it of items) {
    const d = distance(from, it);
    if (d < bestD) {
      bestD = d;
      best = it;
    }
  }
  return best;
}
