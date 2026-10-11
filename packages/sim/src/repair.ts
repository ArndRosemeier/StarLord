import type { GameState } from "./types.js";

/**
 * Once a turn, as in the original: ships in orbit at a system where their
 * owner has any colony or outpost are repaired completely. Ships in deep space
 * or at other systems keep their damage; there is no partial repair.
 */
export function repairTick(state: GameState): void {
  const docks = new Set<string>();
  for (const c of Object.values(state.colonies)) docks.add(`${c.ownerId}@${state.planets[c.planetId]!.starId}`);
  for (const f of Object.values(state.fleets)) {
    if (f.starId === null || !docks.has(`${f.ownerId}@${f.starId}`)) continue;
    for (const s of f.ships) delete s.damage;
  }
}
