import {
  LEANING_BONUSES, LEANING_CAP, OBJECTIVE_ORDER, OBJECTIVE_WEIGHTS, SHIP_SPECIALTY_ORDER, SHIP_SPECIALTY_WEIGHTS,
  WEAPON_LEAN_ORDER, WEAPON_LEAN_WEIGHTS, type Objective, type ShipSpecialty, type WeaponLean,
} from "./data/aiPersonality.js";
import type { Temperament } from "./data/diplomacy.js";
import { getRace } from "./data/races.js";
import { fixedRoll, rolledTemperament } from "./diplomacy.js";
import { difficultyLevel } from "./relations.js";
import type { GameState, PlayerId } from "./types.js";

/**
 * Each empire's leanings, fixed for the game, after the original's computer
 * player setup (see data/aiPersonality.ts): temperament, objective, weapon
 * lean and ship specialty. The original rolls them for computer players only;
 * a human player's are rolled the same way and only steer the areas they
 * hand to the computer.
 */
export interface Leanings {
  temperament: Temperament;
  objective: Objective;
  weapon: WeaponLean;
  specialty: ShipSpecialty;
}

/** The weights each leaning is drawn from, after the race's picks and the difficulty. */
export function leaningWeights(state: GameState, playerId: PlayerId): {
  objective: Record<Objective, number>; weapon: Record<WeaponLean, number>; specialty: Record<ShipSpecialty, number>;
} {
  const picks = getRace(state.players[playerId]!.raceId).picks;
  const difficulty = difficultyLevel(state);
  const temper = rolledTemperament(state, playerId);
  const objective = { ...OBJECTIVE_WEIGHTS };
  const weapon = { ...WEAPON_LEAN_WEIGHTS };
  const specialty = { ...SHIP_SPECIALTY_WEIGHTS };
  for (const b of LEANING_BONUSES) {
    const applies = "pick" in b ? picks[b.pick] === b.value
      : "trait" in b ? picks.traits.includes(b.trait)
        : "difficulty" in b ? difficulty === b.difficulty
          : temper === b.temperament;
    if (!applies) continue;
    Object.assign(objective, b.setObjective);
    for (const [k, v] of Object.entries(b.objective ?? {})) objective[k as Objective] += v;
    for (const [k, v] of Object.entries(b.weapon ?? {})) weapon[k as WeaponLean] += v;
    for (const [k, v] of Object.entries(b.specialty ?? {})) specialty[k as ShipSpecialty] += v;
  }
  return { objective, weapon, specialty };
}

/** Halves every weight until they sum to at most LEANING_CAP, then draws one with a fixed roll. */
function draw<K extends string>(state: GameState, key: string, order: K[], weights: Record<K, number>): K {
  const w = order.map((k) => weights[k]);
  while (w.reduce((a, b) => a + b, 0) > LEANING_CAP) for (let i = 0; i < w.length; i++) w[i] = Math.trunc(w[i]! / 2);
  let r = fixedRoll(state, key, Math.max(1, w.reduce((a, b) => a + b, 0)));
  for (let i = 0; i < order.length; i++) {
    r -= w[i]!;
    if (r <= 0) return order[i]!;
  }
  return order.at(-1)!;
}

export function leanings(state: GameState, playerId: PlayerId): Leanings {
  const w = leaningWeights(state, playerId);
  return {
    temperament: rolledTemperament(state, playerId),
    objective: draw(state, `objective${playerId}`, OBJECTIVE_ORDER, w.objective),
    weapon: draw(state, `weaponLean${playerId}`, WEAPON_LEAN_ORDER, w.weapon),
    specialty: draw(state, `shipSpecialty${playerId}`, SHIP_SPECIALTY_ORDER, w.specialty),
  };
}

/** A computer empire's leanings; null for a human player or a non-empire. */
export function aiLeanings(state: GameState, playerId: PlayerId): Leanings | null {
  const p = state.players[playerId];
  if (!p || p.kind !== "empire" || p.isHuman) return null;
  return leanings(state, playerId);
}
