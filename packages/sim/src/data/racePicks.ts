import type { Government, RacePicks, RaceTrait } from "./races.js";

/**
 * Point costs for building a custom race, MoO2-style: every race gets
 * CUSTOM_RACE_POINTS to spend, and may take up to MAX_NEGATIVE_POINTS of
 * drawbacks to afford more.
 */

export const CUSTOM_RACE_POINTS = 10;
export const MAX_NEGATIVE_POINTS = 10;

export type NumericPick = Exclude<keyof RacePicks, "government" | "traits">;

/** Allowed values for each numeric pick and what each costs; 0 is the free default. */
export const PICK_OPTIONS: Record<NumericPick, { label: string; options: { value: number; cost: number; text: string }[] }> = {
  growth: { label: "Population growth", options: [
    { value: -0.5, cost: -4, text: "-50%" }, { value: 0.5, cost: 3, text: "+50%" }, { value: 1, cost: 6, text: "+100%" },
  ] },
  farming: { label: "Farming", options: [
    { value: -0.5, cost: -3, text: "-½ food" }, { value: 1, cost: 4, text: "+1 food" }, { value: 2, cost: 7, text: "+2 food" },
  ] },
  industry: { label: "Industry", options: [
    { value: -1, cost: -3, text: "-1" }, { value: 1, cost: 3, text: "+1" }, { value: 2, cost: 6, text: "+2" },
  ] },
  science: { label: "Research", options: [
    { value: -1, cost: -3, text: "-1" }, { value: 1, cost: 3, text: "+1" }, { value: 2, cost: 6, text: "+2" },
  ] },
  money: { label: "Money", options: [
    { value: -0.5, cost: -4, text: "-½ BC" }, { value: 0.5, cost: 5, text: "+½ BC" }, { value: 1, cost: 8, text: "+1 BC" },
  ] },
  shipAttack: { label: "Ship attack", options: [
    { value: -1, cost: -2, text: "-20" }, { value: 1, cost: 2, text: "+20" }, { value: 2, cost: 4, text: "+40" },
  ] },
  shipDefense: { label: "Ship defense", options: [
    { value: -1, cost: -2, text: "-20" }, { value: 1, cost: 3, text: "+20" }, { value: 2, cost: 7, text: "+40" },
  ] },
  groundCombat: { label: "Ground combat", options: [
    { value: -1, cost: -2, text: "-1" }, { value: 1, cost: 2, text: "+1" }, { value: 2, cost: 4, text: "+2" },
  ] },
  spying: { label: "Spying", options: [
    { value: -1, cost: -3, text: "-1" }, { value: 1, cost: 3, text: "+1" }, { value: 2, cost: 6, text: "+2" },
  ] },
};

export const GOVERNMENT_COSTS: Record<Government, number> = {
  feudal: -4,
  dictatorship: 0,
  democracy: 7,
  unification: 6,
};

/** Traits a custom race can take; each has an effect in the rules. */
export const TRAIT_COSTS: Partial<Record<RaceTrait, { cost: number; text: string; name?: string }>> = {
  lowG: { name: "Low-G world", cost: -5, text: "Low-gravity world: weaker on normal and heavy planets." },
  highG: { name: "High-G world", cost: 6, text: "Heavy-gravity world: full output on normal and heavy planets." },
  aquatic: { cost: 5, text: "More population on ocean and swamp worlds." },
  subterranean: { cost: 6, text: "More population on every planet." },
  tolerant: { cost: 10, text: "More population on hostile worlds; no pollution." },
  largeHomeworld: { cost: 1, text: "Starts on a large homeworld." },
  richHomeworld: { cost: 2, text: "Homeworld has rich minerals." },
  poorHomeworld: { cost: -1, text: "Homeworld has poor minerals." },
  artifactsHomeworld: { cost: 3, text: "Ancient artifacts on the homeworld boost research." },
  cybernetic: { cost: 4, text: "Eats half as much food but needs industry for upkeep." },
  lithovore: { cost: 10, text: "Eats no food at all." },
  charismatic: { cost: 3, text: "Other empires like you more." },
  repulsive: { cost: -6, text: "Others dislike you; no alliances or treaties." },
  creative: { cost: 8, text: "Learns every technology in a researched tier." },
  uncreative: { cost: -4, text: "Learns one random technology per tier." },
  fantasticTraders: { cost: 4, text: "Double income from trade treaties." },
  telepathic: { cost: 6, text: "Enemy spies have a much harder time against you." },
  omniscient: { cost: 3, text: "Knows every star system from the start." },
};

/** Traits that can't be taken together. */
export const EXCLUSIVE_TRAITS: RaceTrait[][] = [
  ["lowG", "highG"],
  ["richHomeworld", "poorHomeworld"],
  ["creative", "uncreative"],
  ["charismatic", "repulsive"],
  ["cybernetic", "lithovore"],
];
