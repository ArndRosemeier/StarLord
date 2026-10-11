import { mergeCrew } from "./crew.js";
import type { Fleet, GameState, Id, ShipStack } from "./types.js";

/** Small fleet bookkeeping shared by the turn phases. */

export function addShips(f: Fleet, designId: string, count: number, xp = 0, damage: number[] = []): void {
  const s = f.ships.find((x) => x.designId === designId);
  if (s) {
    mergeCrew(s, count, xp);
    if (damage.length > 0) s.damage = [...(s.damage ?? []), ...damage];
  } else {
    f.ships.push({ designId, count, ...(xp > 0 ? { xp } : {}), ...(damage.length > 0 ? { damage } : {}) });
  }
}

/** Takes ships out of a stack, intact ones first, and returns the damage of the ones taken. */
export function takeShips(s: ShipStack, count: number): number[] {
  const n = Math.min(count, s.count);
  const intact = s.count - (s.damage?.length ?? 0);
  const taken = s.damage?.splice(0, Math.max(0, n - intact)) ?? [];
  if (s.damage?.length === 0) delete s.damage;
  s.count -= n;
  return taken;
}

export function removeShips(state: GameState, f: Fleet, designId: string, count: number): void {
  const s = f.ships.find((x) => x.designId === designId);
  if (s) takeShips(s, count);
  f.ships = f.ships.filter((x) => x.count > 0);
  if (f.ships.length === 0) deleteFleet(state, f.id);
}

export function deleteFleet(state: GameState, id: Id): void {
  delete state.fleets[id];
  for (const l of Object.values(state.leaders)) if (l.assignedTo === id) l.assignedTo = null;
}
