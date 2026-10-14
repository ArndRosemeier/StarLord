import {
  designStats, distance, findDesign, getRace, isHostile, leanings, type Objective, type Temperament, type Colony, type DesignStats, type Fleet, type PlayerView, type Star,
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

/** How hard each temperament presses its fights (StarLord's tuning of the original's personalities). */
export const TEMPER_AGGRESSION: Record<Temperament, number> = {
  xenophobic: 0.6, ruthless: 0.7, aggressive: 0.8, erratic: 0.55, honorable: 0.4, pacifistic: 0.3,
};
/** Share of non-farmers on research, by objective. */
export const OBJECTIVE_SCIENCE: Record<Objective, number> = {
  diplomat: 0.35, militarist: 0.3, expansionist: 0.3, technologist: 0.5, industrialist: 0.25, ecologist: 0.35,
};
/** Extra aggression for a militarist. */
export const MILITARIST_AGGRESSION = 0.1;
/** Above this aggression an empire's fleets fight on until BOLD_RETREAT of their strength is left, else CAUTIOUS_RETREAT. */
export const BOLD_AGGRESSION = 0.6;
export const BOLD_RETREAT = 0.3;
export const CAUTIOUS_RETREAT = 0.55;

/**
 * Each AI empire's leanings: its temperament and objective (rolled at the
 * start like the original's computer players, see the sim's leanings) plus
 * its race's strengths. No randomness beyond the game's fixed rolls.
 */
export function personality(view: PlayerView): { aggression: number; science: number } {
  return personalityOf(view, view.viewer);
}

/** Any empire's leanings as its AI plays them (the diplomacy screen shows them for computer rulers). */
export function personalityOf(view: PlayerView, playerId: number): { aggression: number; science: number } {
  const p = view.players[playerId]!;
  const picks = getRace(p.raceId).picks;
  const l = leanings(view, playerId);
  const military = picks.shipAttack + picks.shipDefense + picks.groundCombat;
  const aggression = TEMPER_AGGRESSION[l.temperament] + (l.objective === "militarist" ? MILITARIST_AGGRESSION : 0) + 0.05 * military;
  const science = OBJECTIVE_SCIENCE[l.objective] + 0.06 * (picks.science - picks.industry);
  return { aggression: Math.min(1, aggression), science: Math.max(0.15, Math.min(0.6, science)) };
}
