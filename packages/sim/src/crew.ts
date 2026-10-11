import { BUILDINGS_BY_ID } from "./data/buildings.js";
import { CREW } from "./data/combat.js";
import { getRace } from "./data/races.js";
import { leaderInstructorXp } from "./leaders.js";
import { raceCrewBonus } from "./raceEffects.js";
import type { Colony, Fleet, GameState, Player, ShipStack } from "./types.js";

export { CREW };

/**
 * Ship crews gain experience every turn and in battle. Each stack of ships
 * shares one crew rating; when ships join a stack their experience is
 * averaged in.
 */

/** Crew level (0 Green ... 4 Ultra-Elite) of a stack at an XP value; warlord crews rank one higher. */
export function crewLevel(xp: number, player: Player | undefined): number {
  let level = CREW.xp.filter((t, i) => i > 0 && xp >= t).length;
  if (player?.kind === "empire") level += raceCrewBonus(getRace(player.raceId)).startLevels;
  return Math.min(CREW.xp.length - 1, level);
}

export function crewName(level: number): string {
  return CREW.names[level] ?? CREW.names[0]!;
}

/** A colony's crew training (Space Academy), if any. */
function academy(colony: Colony): { startLevels: number; xpPerTurn: number } | undefined {
  for (const b of colony.buildings) {
    const crew = BUILDINGS_BY_ID[b]?.effects.crew;
    if (crew) return crew;
  }
  return undefined;
}

/** XP a new ship built at this colony starts with: a level up with a Space Academy. */
export function builtCrewXp(colony: Colony): number {
  return CREW.xp[academy(colony)?.startLevels ?? 0] ?? 0;
}

/** Adds ships to a stack, averaging the crews' experience. */
export function mergeCrew(stack: ShipStack, count: number, xp: number): void {
  const total = stack.count + count;
  if (total > 0) stack.xp = Math.floor(((stack.xp ?? 0) * stack.count + xp * count) / total);
  stack.count = total;
}

/** Once a turn: every empire ship gains experience, more at its own Space Academies, then XP is capped. */
export function crewTick(state: GameState): void {
  const academies = new Map<string, number>();
  for (const c of Object.values(state.colonies)) {
    const a = academy(c);
    if (!a) continue;
    const key = `${c.ownerId}:${state.planets[c.planetId]!.starId}`;
    academies.set(key, (academies.get(key) ?? 0) + a.xpPerTurn);
  }
  const instructor = new Map<number, number>();
  for (const f of Object.values(state.fleets) as Fleet[]) {
    const owner = state.players[f.ownerId];
    if (owner?.kind !== "empire") continue;
    if (!instructor.has(f.ownerId)) instructor.set(f.ownerId, leaderInstructorXp(state, f.ownerId));
    const inOrbit = f.starId && !f.destStarId;
    const gain = CREW.xpPerTurn + instructor.get(f.ownerId)! + (inOrbit ? academies.get(`${f.ownerId}:${f.starId}`) ?? 0 : 0);
    for (const s of f.ships) s.xp = Math.min(CREW.xpCap, (s.xp ?? 0) + gain);
  }
}
