import { CUSTOM_RACE_POINTS } from "./data/racePicks.js";
import { getRace } from "./data/races.js";
import { GALAXY_SIZE_STEP, SCORE } from "./data/score.js";
import { TECH_FIELDS, TIERS_BY_ID } from "./data/techs.js";
import { raceCost } from "./customRace.js";
import { androids, empireTotals, population } from "./economy.js";
import { hyperLevel } from "./empire.js";
import { fleetPower } from "./relations.js";
import type { GameState, HistoryPoint, PlayerId } from "./types.js";

/** The original's score of one empire, term by term (see SCORE). */
export interface ScoreBreakdown {
  /** Turns played, as a penalty (zero or negative). */
  turns: number;
  /** Galaxy size and number of empires; zero for an empire with no population. */
  galaxy: number;
  /** Researched fields. */
  research: number;
  /** Categories with a hyper-advanced level. */
  hyper: number;
  population: number;
  /** Premium for population taken by invasion. */
  captured: number;
  /** Empires eliminated. */
  eliminations: number;
  orion: number;
  council: number;
  antares: number;
  /** Sum of the terms above. */
  subtotal: number;
  /** Race pick multiplier in percent (100..200). */
  multiplier: number;
  /** The score: subtotal × multiplier, rounded. */
  total: number;
  /** Counts behind the terms, for explanations. */
  counts: { turns: number; empires: number; fields: number; hyperCategories: number; population: number; capturedPop: number; eliminated: number; unspentPicks: number };
}

/** Race picks the empire's race left unspent (0 for every preset race). */
export function unspentPicks(state: GameState, playerId: PlayerId): number {
  const p = state.players[playerId]!;
  return Math.max(0, CUSTOM_RACE_POINTS - raceCost(getRace(p.raceId).picks).total);
}

/**
 * The original's score, usable at any time during play (the original shows
 * the same running score from its cheat menu). In a player's view an other
 * empire's colonies may be hidden, so only the viewer's own score is exact there.
 */
export function scoreBreakdown(state: GameState, playerId: PlayerId): ScoreBreakdown {
  const p = state.players[playerId]!;
  const step = GALAXY_SIZE_STEP[state.settings.galaxySize];
  let pop = 0;
  for (const c of Object.values(state.colonies)) {
    if (c.ownerId !== playerId || c.outpost) continue;
    const a = androids(c);
    pop += population(c) + a.farmers + a.workers + a.scientists;
  }
  const empires = state.players.filter((x) => x.kind === "empire").length;
  const turnsPlayed = Math.max(0, state.turn - 1);
  // An empire with no population gets neither the size bonus nor the turn penalty.
  const turns = pop > 0 && turnsPlayed > 0 ? -turnsPlayed * SCORE.perTurn : 0;
  const galaxy = pop > 0 ? (SCORE.perRace.base + SCORE.perRace.perSize * step) * empires : 0;
  const fields = p.tiers.filter((t) => TIERS_BY_ID[t] && !TIERS_BY_ID[t]!.hyper).length;
  const hyperCategories = TECH_FIELDS.filter((f) => hyperLevel(p, f) > 0).length;
  const capturedPop = p.capturedPop ?? 0;
  const eliminated = p.eliminated?.length ?? 0;
  const won = (how: GameState["victory"]) => state.victory === how && state.winner === playerId;
  const b = {
    turns,
    galaxy,
    research: fields * SCORE.perField,
    hyper: hyperCategories * SCORE.perHyperCategory,
    population: pop * SCORE.perPop,
    captured: Math.trunc((capturedPop * SCORE.capturedPremium) / (step + 1)),
    eliminations: eliminated * SCORE.perEliminated,
    orion: state.guardianSlainBy === playerId ? SCORE.orion : 0,
    council: won("council") ? SCORE.council : 0,
    antares: state.raiders.defeatedBy === playerId ? SCORE.antares : 0,
  };
  const subtotal = Object.values(b).reduce((s, v) => s + v, 0);
  const unspent = unspentPicks(state, playerId);
  const multiplier = 100 + unspent * SCORE.perUnspentPick;
  return {
    ...b,
    subtotal,
    multiplier,
    total: Math.trunc((subtotal * multiplier + 50) / 100),
    counts: { turns: turnsPlayed, empires, fields, hyperCategories, population: pop, capturedPop, eliminated, unspentPicks: unspent },
  };
}

/** Empire score: the original's formula (see SCORE). */
export function score(state: GameState, playerId: PlayerId): number {
  return scoreBreakdown(state, playerId).total;
}

/** Notes that `attacker` attacked a colony of `victim`; the last such empire is credited if the victim is eliminated. */
export function noteAttack(state: GameState, victim: PlayerId, attacker: PlayerId): void {
  if (victim === attacker) return;
  const v = state.players[victim];
  const a = state.players[attacker];
  if (v?.kind === "empire" && a?.kind === "empire") v.lastAttackedBy = attacker;
}

/** Credits the elimination of `victim` to the last empire that attacked it, as the original does. */
export function creditElimination(state: GameState, victim: PlayerId): void {
  const by = state.players[victim]?.lastAttackedBy;
  const killer = by === undefined ? undefined : state.players[by];
  if (!killer || killer.kind !== "empire" || killer.id === victim) return;
  killer.eliminated = [...(killer.eliminated ?? []), victim];
}

/** One turn's history row for an empire, in HISTORY_STATS order. */
export const HISTORY_STATS = ["score", "population", "colonies", "techs", "industry", "fleet"] as const;
export type HistoryStat = (typeof HISTORY_STATS)[number];

/** Appends the current turn's statistics of every living empire to the history record. */
export function recordHistory(state: GameState): void {
  const rows = state.players.map((p) => {
    if (p.kind !== "empire" || !p.alive) return null;
    const t = empireTotals(state, p.id);
    const values: Record<HistoryStat, number> = {
      score: score(state, p.id),
      population: t.population + t.androids,
      colonies: t.colonies + t.outposts,
      techs: p.techs.length,
      industry: Math.round(t.industry),
      fleet: Math.round(fleetPower(state, p.id)),
    };
    return HISTORY_STATS.map((k) => values[k]);
  });
  const point: HistoryPoint = { turn: state.turn, rows };
  const history = (state.history ??= []);
  if (history.length > 0 && history[history.length - 1]!.turn === state.turn) history[history.length - 1] = point;
  else history.push(point);
}

/**
 * Whether `viewer` may see `other`'s statistics: their own and those of empires
 * they are in contact with, as the original's race statistics and history graph show.
 */
export function knowsStats(state: GameState, viewer: PlayerId, other: PlayerId): boolean {
  return viewer === other || state.players[viewer]!.contacts.includes(other);
}
