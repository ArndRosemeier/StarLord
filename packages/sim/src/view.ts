import { getRace, registerRaces } from "./data/races.js";
import { hasStealthyShips, seesAllFleets } from "./raceEffects.js";
import { colonyScanBonus, scanRange } from "./empire.js";
import { distance } from "./galaxy.js";
import type { GameState, PlayerId } from "./types.js";

export type PlayerView = GameState & { viewer: PlayerId };

/**
 * The game as one player knows it: every star position, but planets only in
 * explored systems and foreign fleets only within scanner range. AI and
 * automation read this, never the full state, so they can't cheat.
 */
export function playerView(state: GameState, viewer: PlayerId): PlayerView {
  registerRaces(state.settings.customRaces);
  const me = state.players[viewer]!;
  const explored = new Set(me.explored);
  const stars = state.galaxy.stars.filter((s) => s.special !== "raiderHome" || me.hasPortal || explored.has(s.id));
  const starById = new Map(state.galaxy.stars.map((s) => [s.id, s]));
  const planets = Object.fromEntries(Object.entries(state.planets).filter(([, p]) => explored.has(p.starId)));
  const colonies = Object.fromEntries(
    Object.entries(state.colonies).filter(([, c]) => c.ownerId === viewer || planets[c.planetId]),
  );
  const range = scanRange(me);
  const eyes: { x: number; y: number; range: number }[] = [
    ...Object.values(state.fleets).filter((f) => f.ownerId === viewer).map((f) => ({ x: f.x, y: f.y, range })),
    ...Object.values(state.colonies)
      .filter((c) => c.ownerId === viewer)
      .map((c) => {
        const s = starById.get(state.planets[c.planetId]!.starId)!;
        return { x: s.x, y: s.y, range: range + colonyScanBonus(c) };
      }),
  ];
  // Monster lairs are landmarks: once a system is explored its guardian is known.
  const lair = (f: { ownerId: PlayerId; starId: string | null }) =>
    state.players[f.ownerId]!.kind === "monsters" && f.starId !== null && explored.has(f.starId);
  // Omniscient races see every fleet. Stealthy races' fleets slip past scanners
  // and only show when they share a system with the viewer's ships or colonies.
  const omniscient = seesAllFleets(getRace(me.raceId));
  const stealthy = (ownerId: PlayerId) => {
    const p = state.players[ownerId]!;
    return p.kind === "empire" && hasStealthyShips(getRace(p.raceId));
  };
  const fleets = Object.fromEntries(
    Object.entries(state.fleets).filter(([, f]) => {
      if (f.ownerId === viewer || omniscient || lair(f)) return true;
      if (stealthy(f.ownerId)) return eyes.some((e) => distance(e, f) === 0);
      return eyes.some((e) => distance(e, f) <= e.range);
    }),
  );
  // Leaders in the viewer's service and those offering to join; other empires' hiring queues stay private.
  const leaders = Object.fromEntries(
    Object.entries(state.leaders).filter(([, l]) => l.ownerId === viewer || (l.status === "offered" && l.offeredTo === viewer)),
  );
  const players = state.players.map((p) => (p.id === viewer ? p : { ...p, leaderOffers: [] }));
  const proposals = state.proposals.filter((p) => p.from === viewer || p.to === viewer);
  const combats = state.combats.filter((c) => c.sides.includes(viewer));
  const events = state.events.filter((e) => e.playerId === viewer);
  return structuredClone({
    ...state,
    players,
    galaxy: { ...state.galaxy, stars },
    planets, colonies, fleets, leaders, proposals, combats, events, viewer,
  });
}
