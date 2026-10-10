import { scanRange } from "./empire.js";
import { distance } from "./galaxy.js";
import type { GameState, PlayerId } from "./types.js";

export type PlayerView = GameState & { viewer: PlayerId };

/**
 * The game as one player knows it: every star position, but planets only in
 * explored systems and foreign fleets only within scanner range. AI and
 * automation read this, never the full state, so they can't cheat.
 */
export function playerView(state: GameState, viewer: PlayerId): PlayerView {
  const me = state.players[viewer]!;
  const explored = new Set(me.explored);
  const stars = state.galaxy.stars.filter((s) => s.special !== "raiderHome" || me.hasPortal || explored.has(s.id));
  const starById = new Map(state.galaxy.stars.map((s) => [s.id, s]));
  const planets = Object.fromEntries(Object.entries(state.planets).filter(([, p]) => explored.has(p.starId)));
  const colonies = Object.fromEntries(
    Object.entries(state.colonies).filter(([, c]) => c.ownerId === viewer || planets[c.planetId]),
  );
  const range = scanRange(me);
  const eyes: { x: number; y: number }[] = [
    ...Object.values(state.fleets).filter((f) => f.ownerId === viewer),
    ...Object.values(state.colonies)
      .filter((c) => c.ownerId === viewer)
      .map((c) => starById.get(state.planets[c.planetId]!.starId)!),
  ];
  // Monster lairs are landmarks: once a system is explored its guardian is known.
  const lair = (f: { ownerId: PlayerId; starId: string | null }) =>
    state.players[f.ownerId]!.kind === "monsters" && f.starId !== null && explored.has(f.starId);
  const fleets = Object.fromEntries(
    Object.entries(state.fleets).filter(
      ([, f]) => f.ownerId === viewer || lair(f) || eyes.some((e) => distance(e, f) <= range),
    ),
  );
  const leaders = Object.fromEntries(Object.entries(state.leaders).filter(([, l]) => l.ownerId === viewer));
  const proposals = state.proposals.filter((p) => p.from === viewer || p.to === viewer);
  const combats = state.combats.filter((c) => c.sides.includes(viewer));
  const events = state.events.filter((e) => e.playerId === viewer);
  return structuredClone({
    ...state,
    galaxy: { ...state.galaxy, stars },
    planets, colonies, fleets, leaders, proposals, combats, events, viewer,
  });
}
