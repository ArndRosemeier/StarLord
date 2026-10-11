import { mergeCrew } from "./crew.js";
import type { Fleet, GameState, Id } from "./types.js";

/** Small fleet bookkeeping shared by the turn phases. */

export function addShips(f: Fleet, designId: string, count: number, xp = 0): void {
  const s = f.ships.find((x) => x.designId === designId);
  if (s) mergeCrew(s, count, xp);
  else f.ships.push(xp > 0 ? { designId, count, xp } : { designId, count });
}

export function removeShips(state: GameState, f: Fleet, designId: string, count: number): void {
  const s = f.ships.find((x) => x.designId === designId);
  if (s) s.count -= count;
  f.ships = f.ships.filter((x) => x.count > 0);
  if (f.ships.length === 0) deleteFleet(state, f.id);
}

export function deleteFleet(state: GameState, id: Id): void {
  delete state.fleets[id];
  for (const l of Object.values(state.leaders)) if (l.assignedTo === id) l.assignedTo = null;
}
