import { EXCLUSIVE_TRAITS, PICK_OPTIONS, TRAIT_COSTS, type NumericPick } from "./data/racePicks.js";
import { getRace, registerRaces, type RaceDef, type RacePicks } from "./data/races.js";
import type { GameState, Player, PlayerId } from "./types.js";

/**
 * Evolutionary Mutation: the race spends pick points to remove drawbacks or
 * raise strengths. The mutated race is registered like a custom race and the
 * empire and its own colonies switch to it.
 */

const pickCost = (key: NumericPick, value: number): number | null =>
  value === 0 ? 0 : (PICK_OPTIONS[key].options.find((o) => o.value === value)?.cost ?? null);

/** Points a change of picks costs, or a reason it isn't allowed. */
export function mutationCost(from: RacePicks, to: RacePicks): number | string {
  if (!to || typeof to !== "object" || !Array.isArray(to.traits)) return "invalid picks";
  if (to.government !== from.government) return "government can't mutate";
  let total = 0;
  let changes = 0;
  for (const key of Object.keys(PICK_OPTIONS) as NumericPick[]) {
    if (to[key] === from[key]) continue;
    const before = pickCost(key, from[key]);
    const after = pickCost(key, to[key]);
    if (before === null) return `${key} can't mutate`;
    if (after === null) return `invalid ${key}`;
    if (after <= before) return "mutation only improves a race";
    total += after - before;
    changes++;
  }
  const added = to.traits.filter((t) => !from.traits.includes(t));
  const removed = from.traits.filter((t) => !to.traits.includes(t));
  if (new Set(to.traits).size !== to.traits.length) return "duplicate trait";
  for (const t of added) {
    const c = TRAIT_COSTS[t]?.cost;
    if (c === undefined) return `trait ${t} not available`;
    if (c <= 0) return "mutation only improves a race";
    total += c;
    changes++;
  }
  for (const t of removed) {
    const c = TRAIT_COSTS[t]?.cost;
    if (c === undefined || c >= 0) return `trait ${t} can't be removed`;
    total -= c;
    changes++;
  }
  for (const group of EXCLUSIVE_TRAITS) {
    if (group.filter((t) => to.traits.includes(t)).length > 1) return `${group.join(" and ")} exclude each other`;
  }
  if (changes === 0) return "nothing changes";
  return total;
}

export function validateMutation(player: Player, picks: RacePicks): string | null {
  if (!(player.mutationPoints > 0)) return "no mutation points";
  const cost = mutationCost(getRace(player.raceId).picks, picks);
  if (typeof cost === "string") return cost;
  return cost > player.mutationPoints ? `needs ${cost} points, ${player.mutationPoints} available` : null;
}

function hashString(s: string): string {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619) >>> 0;
  return h.toString(16).padStart(8, "0");
}

/** Applies a validated mutation. */
export function applyMutation(state: GameState, playerId: PlayerId, picks: RacePicks): void {
  const player = state.players[playerId]!;
  const old = getRace(player.raceId);
  const cost = mutationCost(old.picks, picks);
  if (typeof cost === "string") return;
  const clean: RacePicks = { ...picks, traits: [...picks.traits].sort() };
  const root = old.id.split("~")[0]!;
  const def: RaceDef = { ...old, id: `${root}~${hashString(JSON.stringify([old.id, clean]))}`, picks: clean };
  const list = (state.settings.customRaces ??= []);
  if (!list.some((r) => r.id === def.id)) list.push(def);
  registerRaces([def]);
  for (const c of Object.values(state.colonies)) if (c.ownerId === playerId && c.raceId === old.id) c.raceId = def.id;
  player.raceId = def.id;
  player.mutationPoints -= cost;
}
