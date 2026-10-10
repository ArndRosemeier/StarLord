import {
  designStats, distance, findDesign, getRace, isHostile, type Colony, type DesignStats, type Fleet, type PlayerView, type Star,
} from "@starlord/sim";

export function me(view: PlayerView) {
  return view.players[view.viewer]!;
}

export function myColonies(view: PlayerView, includeOutposts = false): Colony[] {
  return Object.values(view.colonies).filter((c) => c.ownerId === view.viewer && (includeOutposts || !c.outpost));
}

export function myFleets(view: PlayerView): Fleet[] {
  return Object.values(view.fleets).filter((f) => f.ownerId === view.viewer);
}

export function starById(view: PlayerView, id: string): Star {
  return view.galaxy.stars.find((s) => s.id === id)!;
}

export function colonyStar(view: PlayerView, c: Colony): Star {
  return starById(view, view.planets[c.planetId]!.starId);
}

export type Role = DesignStats["role"];

export function shipStats(view: PlayerView, ownerId: number, designId: string): DesignStats | undefined {
  const owner = view.players[ownerId]!;
  const d = findDesign(owner, designId);
  return d ? designStats(owner, d) : undefined;
}

export function fleetRoles(view: PlayerView, f: Fleet): Set<Role> {
  return new Set(f.ships.map((s) => shipStats(view, f.ownerId, s.designId)?.role ?? "scout"));
}

export function isOnly(view: PlayerView, f: Fleet, role: Role): boolean {
  const roles = fleetRoles(view, f);
  return roles.size === 1 && roles.has(role);
}

export function fleetStrength(view: PlayerView, f: Fleet): number {
  return f.ships.reduce((sum, s) => sum + (shipStats(view, f.ownerId, s.designId)?.strength ?? 0) * s.count, 0);
}

export function hostileFleetsNear(view: PlayerView, point: { x: number; y: number }, radius: number): Fleet[] {
  return Object.values(view.fleets).filter(
    (f) => isHostile(view, view.viewer, f.ownerId) && distance(f, point) <= radius && fleetStrength(view, f) > 0,
  );
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

/**
 * Each AI empire's leanings, from its race's strengths plus a stable hash so
 * two empires of different races never play quite alike. No randomness.
 */
export function personality(view: PlayerView): { aggression: number; science: number } {
  const p = me(view);
  const picks = getRace(p.raceId).picks;
  let h = 0;
  for (const ch of p.raceId) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  const military = picks.shipAttack + picks.shipDefense + picks.groundCombat;
  const aggression = 0.3 + (h % 5) / 10 + 0.05 * military;
  const science = 0.3 + ((h >> 3) % 3) / 20 + 0.06 * (picks.science - picks.industry);
  return { aggression: Math.min(1, aggression), science: Math.max(0.15, Math.min(0.6, science)) };
}
