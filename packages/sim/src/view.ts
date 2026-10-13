import { relation, treatyPopulation } from "./diplomacy.js";
import { empireTotals } from "./economy.js";
import { BATTLE_SCANNER_RANGE, TRANSIT_DETECTION_PER_SIZE } from "./data/movement.js";
import { getRace, registerRaces } from "./data/races.js";
import { designStats, findDesign } from "./designs.js";
import { hasStealthyShips, seesAllFleets } from "./raceEffects.js";
import { colonyScanBonus, scanRange } from "./empire.js";
import { distance } from "./galaxy.js";
import type { Fleet, GameState, PlayerId } from "./types.js";

/** What an empire calls a system it has not explored yet. */
export const UNKNOWN_STAR_NAME = "Unknown system";

export type PlayerView = GameState & {
  viewer: PlayerId;
  /** Population of each empire the viewer has a trade or research treaty with: the treaty's yield depends on it. */
  knownPopulation?: Record<PlayerId, number>;
  /** The same partners' population as treaties count it (see treatyPopulation). */
  knownTreatyPop?: Record<PlayerId, { trade: number; research: number }>;
};

/** A point a player's scanners see from: one of its fleets or colonies, with that scanner's range in parsecs. */
export interface ScannerEye { x: number; y: number; range: number; source: "fleet" | "colony"; id: string }

/**
 * Where a player's scanners reach: every fleet sees the empire's scanner range (plus a Battle
 * Scanner's bonus) and every colony the same plus its orbital station's bonus. Works on a
 * PlayerView too, since a view holds all of the viewer's own fleets and colonies.
 */
export function scannerEyes(state: GameState, playerId: PlayerId): ScannerEye[] {
  const me = state.players[playerId]!;
  const range = scanRange(me);
  const hasSpecial = (f: Fleet, special: string) =>
    f.ships.some((s) => findDesign(me, s.designId)?.specials?.includes(special));
  const starById = new Map(state.galaxy.stars.map((s) => [s.id, s]));
  const eyes: ScannerEye[] = [];
  for (const f of Object.values(state.fleets)) {
    if (f.ownerId !== playerId) continue;
    eyes.push({ x: f.x, y: f.y, range: range + (hasSpecial(f, "battleScanner") ? BATTLE_SCANNER_RANGE : 0), source: "fleet", id: f.id });
  }
  for (const c of Object.values(state.colonies)) {
    if (c.ownerId !== playerId) continue;
    const s = starById.get(state.planets[c.planetId]?.starId ?? "");
    if (s) eyes.push({ x: s.x, y: s.y, range: range + colonyScanBonus(c), source: "colony", id: c.id });
  }
  return eyes;
}

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
  const eyes = scannerEyes(state, viewer);
  // Monsters sitting in a system are a surprise: nobody sees them, not even by
  // scanner or omniscience, until the system is explored; from then on the lair is a known landmark.
  const parkedMonster = (f: { ownerId: PlayerId; starId: string | null }) =>
    state.players[f.ownerId]!.kind === "monsters" && f.starId !== null;
  // Omniscient races see every fleet. Stealthy races' fleets slip past scanners
  // and only show when they share a system with the viewer's ships or colonies.
  const omniscient = seesAllFleets(getRace(me.raceId));
  const stealthy = (ownerId: PlayerId) => {
    const p = state.players[ownerId]!;
    return p.kind === "empire" && hasStealthyShips(getRace(p.raceId));
  };
  // Fleets whose every ship carries a Stealth Field or a cloak hide the same way.
  // Big ships are easier to spot: each size class past the frigate adds to the range they are seen at.
  const fleetLooks = (f: Fleet): { hidden: boolean; size: number } => {
    const owner = state.players[f.ownerId]!;
    let hidden = f.ships.length > 0;
    let size = 1;
    for (const s of f.ships) {
      const d = findDesign(owner, s.designId);
      if (!d) continue;
      const stats = designStats(owner, d);
      size = Math.max(size, stats.sizeClass);
      if (!stats.effects.stealth && !(stats.effects.cloakDefense > 0)) hidden = false;
    }
    return { hidden, size };
  };
  const fleets = Object.fromEntries(
    Object.entries(state.fleets).filter(([, f]) => {
      if (f.ownerId === viewer) return true;
      if (parkedMonster(f)) return explored.has(f.starId!);
      if (omniscient) return true;
      const look = fleetLooks(f);
      if (stealthy(f.ownerId) || look.hidden) return eyes.some((e) => distance(e, f) === 0);
      const bonus = (look.size - 1) * TRANSIT_DETECTION_PER_SIZE;
      return eyes.some((e) => distance(e, f) <= e.range + bonus);
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
  // Unexplored systems keep their names to themselves, and one-time finds
  // (pirate caches, wrecks, stranded heroes) are only known once a system is explored.
  // A wormhole is known once either of its two stars is explored.
  const wormholeKnown = (s: (typeof stars)[number]) =>
    !!s.wormholeTo && (explored.has(s.id) || explored.has(s.wormholeTo));
  const shownStars = stars.map((s) => {
    let base = s;
    if (s.wormholeTo && !wormholeKnown(s)) {
      const { wormholeTo: _link, feature, ...rest } = s;
      base = { ...rest, ...(feature && feature !== "wormhole" ? { feature } : {}) };
    }
    // The raiders' home is only shown once a portal leads there, and the portal tells you its name.
    if (explored.has(s.id) || s.special === "raiderHome") return base;
    const { feature, ...rest } = base;
    return { ...rest, name: UNKNOWN_STAR_NAME, ...(feature === "wormhole" ? { feature } : {}) };
  });
  const knownPopulation: Record<PlayerId, number> = {};
  const knownTreatyPop: Record<PlayerId, { trade: number; research: number }> = {};
  for (const p of state.players) {
    if (p.id === viewer || p.kind !== "empire" || !p.alive) continue;
    const r = relation(state, viewer, p.id);
    if (!r.trade && !r.research) continue;
    knownPopulation[p.id] = empireTotals(state, p.id).population;
    knownTreatyPop[p.id] = { trade: treatyPopulation(state, p.id, "trade"), research: treatyPopulation(state, p.id, "research") };
  }
  return structuredClone({
    ...state,
    knownPopulation,
    knownTreatyPop,
    players,
    galaxy: { ...state.galaxy, stars: shownStars },
    planets, colonies, fleets, leaders, proposals, combats, events, viewer,
  });
}
