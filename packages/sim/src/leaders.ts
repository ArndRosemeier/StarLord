import { ADMIN_SKILLS, CAPTAIN_SKILLS, LEADER_FIRST, LEADER_LAST, LEADER_OFFER_INTERVAL, SKILL_PER_LEVEL } from "./data/leaders.js";
import type { Rng } from "./rng.js";
import type { GameState, Leader, LeaderKind, LeaderSkills } from "./types.js";

/**
 * Leaders offer their services every few turns. Administrators boost every
 * colony in the star system they govern; captains boost the fleet they command.
 */

export function generateLeader(state: GameState, rng: Rng, kind: LeaderKind): Leader {
  const level = rng.weighted({ 1: 40, 2: 30, 3: 18, 4: 9, 5: 3 } as Record<string, number>);
  const lvl = Number(level);
  const pool = kind === "administrator" ? ADMIN_SKILLS : CAPTAIN_SKILLS;
  const picks = rng.shuffle([...pool]).slice(0, Math.min(pool.length, 1 + Math.floor(lvl / 2)));
  const skills: LeaderSkills = {};
  for (const s of picks) skills[s] = SKILL_PER_LEVEL[s] * lvl;
  return {
    id: `l${state.nextId++}`,
    name: `${rng.pick(LEADER_FIRST)} ${rng.pick(LEADER_LAST)}`,
    kind,
    level: lvl,
    skills,
    hireCost: 40 * lvl + 20 * lvl * lvl,
    salary: lvl,
    ownerId: null,
    assignedTo: null,
    availableUntil: state.turn + LEADER_OFFER_INTERVAL,
  };
}

export function leaderTick(state: GameState, rng: Rng): void {
  for (const p of state.players) {
    if (p.kind !== "empire" || !p.alive) continue;
    p.leaderOffers = p.leaderOffers.filter((l) => l.availableUntil >= state.turn);
    if (state.turn % LEADER_OFFER_INTERVAL === p.id % LEADER_OFFER_INTERVAL && p.leaderOffers.length < 3) {
      p.leaderOffers.push(generateLeader(state, rng, rng.chance(0.5) ? "administrator" : "captain"));
    }
  }
  // Captains whose fleet is gone go back to the pool.
  for (const l of Object.values(state.leaders)) {
    if (l.kind === "captain" && l.assignedTo && !state.fleets[l.assignedTo]) l.assignedTo = null;
  }
}

export function hiredLeaders(state: GameState, playerId: number): Leader[] {
  return Object.values(state.leaders).filter((l) => l.ownerId === playerId);
}

export function salaries(state: GameState, playerId: number): number {
  return hiredLeaders(state, playerId).reduce((sum, l) => sum + l.salary, 0);
}
