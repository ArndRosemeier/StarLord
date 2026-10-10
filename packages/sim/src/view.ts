import { distance } from "./galaxy.js";
import type { GameState, PlayerId } from "./types.js";

/** Scanner range around owned colonies and fleets, in parsecs. */
export const SCAN_RANGE = 2;

export type PlayerView = GameState & { viewer: PlayerId };

/**
 * The game as one player knows it: every star position, but planets only in
 * explored systems and foreign fleets only within scanner range. AI and
 * automation read this, never the full state, so they can't cheat.
 */
export function playerView(state: GameState, viewer: PlayerId): PlayerView {
  const me = state.players[viewer]!;
  const explored = new Set(me.explored);
  const planets = Object.fromEntries(
    Object.entries(state.planets).filter(([, p]) => explored.has(p.starId)),
  );
  const colonies = Object.fromEntries(
    Object.entries(state.colonies).filter(([, c]) => c.ownerId === viewer || planets[c.planetId]),
  );
  const eyes: { x: number; y: number }[] = [
    ...Object.values(state.fleets).filter((f) => f.ownerId === viewer),
    ...Object.values(state.colonies)
      .filter((c) => c.ownerId === viewer)
      .map((c) => state.galaxy.stars.find((s) => s.id === state.planets[c.planetId]!.starId)!),
  ];
  const fleets = Object.fromEntries(
    Object.entries(state.fleets).filter(
      ([, f]) => f.ownerId === viewer || eyes.some((e) => distance(e, f) <= SCAN_RANGE),
    ),
  );
  return structuredClone({ ...state, planets, colonies, fleets, viewer });
}
