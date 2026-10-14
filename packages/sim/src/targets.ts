import { colonyDefenseStrength, planetDefense } from "./combat.js";
import { blocksInvasion } from "./commands.js";
import { isHostile } from "./diplomacy.js";
import { garrisonOf, mindControlProblem, type GroundForces } from "./ground.js";
import { population } from "./economy.js";
import { getRace, hasTrait } from "./data/races.js";
import { ATTACK_TARGET } from "./data/combat.js";
import { designStats, findDesign } from "./designs.js";
import type { StationHull } from "./data/components.js";
import type { Colony, GameState, Id, PlayerId } from "./types.js";

/**
 * Combat always has planet scale, as in the original: a battle is fought over
 * one planet, every fleet in the system can join it, and bombing, invasion and
 * mind control strike only the planet the battle was over. So each empire
 * attacks at most one planet per system per turn.
 */

/** The enemy colonies a player could attack at a star, by id. */
export function attackableColonies(state: GameState, playerId: PlayerId, starId: Id): Colony[] {
  return Object.values(state.colonies)
    .filter((c) => c.ownerId !== playerId && state.planets[c.planetId]?.starId === starId && isHostile(state, playerId, c.ownerId))
    .sort((a, b) => (a.id < b.id ? -1 : 1));
}

/** The colony the player picked for their fleets at (or bound for) a star: a fleet's invasion target first, then its attack target. */
export function chosenTarget(state: GameState, playerId: PlayerId, starId: Id): Colony | null {
  const open = attackableColonies(state, playerId, starId);
  if (open.length === 0) return null;
  const fleets = Object.values(state.fleets)
    .filter((f) => f.ownerId === playerId && (f.starId ?? f.destStarId) === starId)
    .sort((a, b) => (a.id < b.id ? -1 : 1));
  for (const key of ["invadeTarget", "attackTarget"] as const) {
    for (const f of fleets) {
      const c = f[key] ? open.find((x) => x.id === f[key]) : undefined;
      if (c) return c;
    }
  }
  return null;
}

/**
 * The colony a player attacks at a star this turn: the one they picked, else
 * the default the original's computer players take (see `defaultTarget`).
 * Null when no enemy colony is there.
 */
export function attackTargetAt(state: GameState, playerId: PlayerId, starId: Id): Colony | null {
  return chosenTarget(state, playerId, starId) ?? defaultTarget(state, playerId, starId);
}

/**
 * Without a pick, the planet the original's computer players go for
 * (FUN_000e7dae): the colony worth most for how surely the player's ships at
 * the star beat what defends it there (its own defenses plus its owner's
 * ships), see `ATTACK_TARGET`.
 */
export function defaultTarget(state: GameState, playerId: PlayerId, starId: Id): Colony | null {
  const player = state.players[playerId];
  if (!player) return null;
  const strengthOf = (owner: PlayerId) => Object.values(state.fleets)
    .filter((f) => f.ownerId === owner && (f.starId ?? f.destStarId) === starId)
    .reduce((n, f) => n + f.ships.reduce((m, s) => {
      const d = findDesign(state.players[owner]!, s.designId);
      return m + (d && !d.module ? designStats(state.players[owner]!, d).strength * s.count : 0);
    }, 0), 0);
  const ours = strengthOf(playerId);
  const T = ATTACK_TARGET;
  const scored = attackableColonies(state, playerId, starId).map((c) => {
    const theirs = colonyDefenseStrength(state, c) + strengthOf(c.ownerId);
    const ratio = Math.min(T.ratioCap, theirs > 0 ? ours / theirs : T.ratioCap);
    const value = (c.outpost ? T.outpostValue : population(c)) * (mindControlProblem(state, playerId, c) === null ? T.mindControlBonus : 1);
    return { c, score: value * ratio * ratio };
  });
  return scored.sort((x, y) => y.score - x.score || (x.c.id < y.c.id ? -1 : 1))[0]?.c ?? null;
}

/** The planet each player attacks at each star this turn, by `targetKey`. */
export type Targets = Map<string, Id>;

export const targetKey = (playerId: PlayerId, starId: Id) => `${playerId}:${starId}`;

/** One enemy colony the player could attack, with what defends it. */
export interface TargetOption {
  colonyId: Id;
  colonyName: string;
  ownerId: PlayerId;
  outpost: boolean;
  population: number;
  /** Combat strength of its station and ground defenses together (0: nothing on it fires back). */
  defense: number;
  station: StationHull | null;
  /** Ground installations: missile bases, ground batteries, fighter garrison. */
  installations: number;
  mines: boolean;
  /** Damage the planetary shield takes off every shot and bomb. */
  shield: number;
  barrier: boolean;
  troops: GroundForces;
  /** Why the player can't take it by mind control (null: they can once its orbit is won); absent for non-telepaths. */
  mindControl?: string | null;
}

/** The choice of which planet to attack at a star, as the turn asks a human with more than one (see `pendingTarget`). */
export interface TargetPrompt {
  playerId: PlayerId;
  starId: Id;
  /** The player's fleets there; each is set to attack the chosen planet. */
  fleetIds: Id[];
  options: TargetOption[];
  /** The colony attacked if the player doesn't choose. */
  defaultId: Id | null;
}

/** Thrown inside `processTurn` when a player has to pick which planet to attack (see `pendingTarget`). */
export class TargetPause {
  constructor(readonly prompt: TargetPrompt) {}
}

export function targetPrompt(state: GameState, playerId: PlayerId, starId: Id): TargetPrompt {
  const player = state.players[playerId];
  const telepath = player?.kind === "empire" && hasTrait(getRace(player.raceId), "telepathic");
  const options = attackableColonies(state, playerId, starId).map((c): TargetOption => {
    const d = planetDefense(c);
    return {
      colonyId: c.id, colonyName: c.name, ownerId: c.ownerId, outpost: !!c.outpost, population: population(c),
      defense: colonyDefenseStrength(state, c), station: d.station, installations: d.installations.length, mines: d.mines,
      shield: d.shield, barrier: blocksInvasion(c), troops: garrisonOf(state, c),
      ...(telepath ? { mindControl: mindControlProblem(state, playerId, c) } : {}),
    };
  });
  return {
    playerId, starId, options,
    fleetIds: Object.values(state.fleets).filter((f) => f.ownerId === playerId && f.starId === starId).map((f) => f.id).sort(),
    defaultId: defaultTarget(state, playerId, starId)?.id ?? null,
  };
}
