import type { TurnContext } from "./context.js";
import { findDesign } from "./designs.js";
import { isHostile } from "./diplomacy.js";
import type { Blockades, Colony, Fleet, GameState, Id, PlayerId } from "./types.js";

/**
 * Blockades, as the original works them out once a turn after the battles
 * (FUN_000e507b): every warship in orbit at a star (any design but colony,
 * outpost and transport ships, armed or not, so a lone scout will do)
 * blockades each empire with a colony there it is at war with; monsters and
 * raiders blockade every empire with a colony there. Ships of the blockaded
 * empire do not lift it: it lasts while the enemy warship stays at the end
 * of a turn. Production uses what was worked out at the end of the last turn.
 */
export function computeBlockades(state: GameState): Blockades {
  const settled = new Map<Id, Set<PlayerId>>();
  for (const c of Object.values(state.colonies)) {
    const starId = state.planets[c.planetId]?.starId;
    if (!starId) continue;
    if (!settled.has(starId)) settled.set(starId, new Set());
    settled.get(starId)!.add(c.ownerId);
  }
  const out: Blockades = {};
  for (const f of Object.values(state.fleets)) {
    if (!f.starId) continue;
    const owners = settled.get(f.starId);
    if (!owners || !hasWarship(state, f)) continue;
    for (const victim of owners) {
      if (victim === f.ownerId || !isHostile(state, f.ownerId, victim)) continue;
      const row = ((out[f.starId] ??= {})[victim] ??= []);
      if (!row.includes(f.ownerId)) row.push(f.ownerId);
    }
  }
  for (const byVictim of Object.values(out)) for (const row of Object.values(byVictim)) row.sort((a, b) => a - b);
  return out;
}

/** A fleet holds a warship: a ship of any design but the colony, outpost and transport ships (monsters count). */
function hasWarship(state: GameState, f: Fleet): boolean {
  const owner = state.players[f.ownerId];
  if (!owner) return false;
  return f.ships.some((s) => s.count > 0 && findDesign(owner, s.designId)?.module === null);
}

/** The players whose warships blockade the colony's system for its owner (none for an outpost). */
export function blockadersOf(state: GameState, colony: Colony, blockades: Blockades | undefined = state.blockades): PlayerId[] {
  if (colony.outpost) return [];
  const starId = state.planets[colony.planetId]?.starId;
  return (starId && blockades?.[starId]?.[colony.ownerId]) || [];
}

/**
 * Works out the blockades for the coming turn and tells each empire about
 * those that started or ended at its colonies, and about those its own
 * warships started.
 */
export function updateBlockades(ctx: TurnContext): void {
  const { state } = ctx;
  const before = state.blockades ?? {};
  const after = computeBlockades(state);
  const live = (id: PlayerId) => state.players[id]?.kind === "empire" && state.players[id]!.alive;
  for (const [starId, byVictim] of Object.entries(after)) {
    for (const [key, by] of Object.entries(byVictim)) {
      const victim = Number(key);
      const was = before[starId]?.[victim] ?? [];
      const fresh = by.filter((b) => !was.includes(b));
      if (fresh.length === 0) continue;
      if (live(victim)) ctx.emit({ kind: "blockade", playerId: victim, starId, victim, by });
      for (const b of fresh) if (live(b)) ctx.emit({ kind: "blockade", playerId: b, starId, victim, by: [b] });
    }
  }
  for (const [starId, byVictim] of Object.entries(before)) {
    for (const key of Object.keys(byVictim)) {
      const victim = Number(key);
      if (after[starId]?.[victim]?.length) continue;
      const stillSettled = Object.values(state.colonies).some((c) => c.ownerId === victim && state.planets[c.planetId]?.starId === starId);
      if (live(victim) && stillSettled) ctx.emit({ kind: "blockade", playerId: victim, starId, victim, by: [], lifted: true });
    }
  }
  state.blockades = after;
}
