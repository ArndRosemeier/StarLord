import type { Government, RacePicks, RaceTrait } from "./races.js";

/**
 * Point costs for building a custom race, MoO2-style: every race gets
 * CUSTOM_RACE_POINTS to spend, and may take up to MAX_NEGATIVE_POINTS of
 * drawbacks to afford more. Costs are the original's pick cost table.
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
    { value: -1, cost: -2, text: "-20" }, { value: 1, cost: 2, text: "+20" }, { value: 2, cost: 4, text: "+50" },
  ] },
  shipDefense: { label: "Ship defense", options: [
    { value: -1, cost: -2, text: "-20" }, { value: 1, cost: 3, text: "+25" }, { value: 2, cost: 7, text: "+50" },
  ] },
  groundCombat: { label: "Ground combat", options: [
    { value: -1, cost: -2, text: "-10" }, { value: 1, cost: 2, text: "+10" }, { value: 2, cost: 4, text: "+20" },
  ] },
  spying: { label: "Spying", options: [
    { value: -1, cost: -3, text: "-10" }, { value: 1, cost: 3, text: "+10" }, { value: 2, cost: 6, text: "+20" },
  ] },
};

/**
 * What a pick level is worth in the rules. Ship attack and defense are beam
 * to-hit points, ground combat points on the troop roll, spying points on the
 * spy roll (one StarLord spy level is 10 points).
 */
export const PICK_VALUES = {
  shipAttack: { [-1]: -20, 0: 0, 1: 20, 2: 50 } as Record<number, number>,
  shipDefense: { [-1]: -20, 0: 0, 1: 25, 2: 50 } as Record<number, number>,
  groundCombatPerLevel: 10,
  spyingPerLevel: 10,
} as const;

export const GOVERNMENT_COSTS: Record<Government, number> = {
  feudal: -4,
  dictatorship: 0,
  democracy: 7,
  unification: 6,
};

/** Every special ability with its original cost. All of them are pickable. */
export const TRAIT_COSTS: Record<RaceTrait, { cost: number; text: string; name?: string }> = {
  lowG: { name: "Low-G world", cost: -5, text: "Weaker on normal and heavy planets; troops fight at -10." },
  highG: { name: "High-G world", cost: 6, text: "Full output on normal and heavy planets; troops take one extra hit." },
  aquatic: { cost: 5, text: "Tundra and swamp count as terran, ocean and terran as gaia, for food and population. Ocean homeworld." },
  subterranean: { cost: 6, text: "Max population +2 per planet size class; troops +10 when defending their colonies." },
  tolerant: { cost: 10, text: "+25% max population on every climate (at most Gaia level); no pollution." },
  largeHomeworld: { cost: 1, text: "Starts on a large homeworld." },
  richHomeworld: { cost: 2, text: "Homeworld has rich minerals." },
  poorHomeworld: { cost: -1, text: "Homeworld has poor minerals." },
  artifactsHomeworld: { cost: 3, text: "Ancient artifacts on the homeworld: +2 research per scientist there." },
  cybernetic: { cost: 4, text: "Eats half food, half industry. Ships repair in battle and fully after it." },
  lithovore: { cost: 10, text: "Eats no food at all." },
  charismatic: { cost: 3, text: "Good diplomacy counts double, bad half; leaders cost half and come more often." },
  repulsive: { cost: -6, text: "Only war and peace with others; leaders cost more and come less often." },
  creative: { cost: 8, text: "Learns every application in a researched field." },
  uncreative: { cost: -4, text: "Learns one random application per field." },
  fantasticTraders: { cost: 4, text: "+25% trade treaty income, 1 BC per surplus food, double trade goods." },
  telepathic: { cost: 6, text: "+25 on diplomacy, +10 on all spy rolls; mind-controls undefended colonies." },
  lucky: { cost: 3, text: "No random disasters, more good events; raiders and monsters tend to pass you by." },
  omniscient: { cost: 3, text: "Knows every star system from the start and sees every fleet, stealthy or not." },
  stealthy: { name: "Stealthy ships", cost: 4, text: "Your fleets can't be seen on the galaxy map outside your rivals' own systems." },
  transDimensional: { name: "Trans-dimensional", cost: 5, text: "Fleets move +2 parsecs per turn and +4 combat speed; ignores nebulae." },
  warlord: { cost: 4, text: "Crews start a rank higher, leaders reach their top level, +2 command points per colony." },
};

/** Numbers behind the special abilities that aren't plain pick values. */
export const TRAIT_EFFECTS = {
  lowGGround: -10,
  /** Subterranean troops defending their own colony. */
  subterraneanDefense: 10,
  /** Max population per planet size class for subterranean races. */
  subterraneanPopPerSize: 2,
  /** Climate percentage points tolerant races add to max population, capped at 100. */
  tolerantPopPercent: 25,
  /** Extra hits each high-G troop takes before it dies. */
  highGTroopHits: 1,
  transDimensionalSpeed: 2,
  transDimensionalCombatSpeed: 4,
  warlordCommandPerColony: 2,
  /** Crew experience levels warlord crews start above normal. */
  warlordCrewLevels: 1,
  /** Warlord barracks train this much faster and hold this many times the troops. */
  warlordTroopMult: 2,
  /** Spy roll points a telepathic race adds to every one of its spy actions, offensive and defensive. */
  telepathicSpy: 10,
  /** Diplomatic points added to deals by telepaths and charismatic races (+25% / +50% acceptance in the original). */
  telepathicDiplomacy: 25,
  charismaticDiplomacy: 50,
  /** Multipliers on attitude changes towards a charismatic race. */
  charismaticGood: 2,
  charismaticBad: 0.5,
  /** Smallest hull (index, frigate 0) a telepathic fleet needs in orbit to mind-control a colony: cruiser. */
  telepathicMindControlSize: 2,
  /** Cybernetic repair per combat round: armor/structure and internal systems. */
  cyberneticRepair: 0.1,
  cyberneticSystemsRepair: 0.05,
  /** Trade treaty income bonus and BC per surplus food (instead of ½) for fantastic traders. */
  traderTreatyBonus: 0.25,
  traderFoodBc: 1,
  normalFoodBc: 0.5,
  traderGoodsMult: 2,
  /** Chance a raid or monster skips a lucky empire's colony and picks another target. */
  luckyOverlook: 0.75,
} as const;

/** Traits that can't be taken together. */
export const EXCLUSIVE_TRAITS: RaceTrait[][] = [
  ["lowG", "highG"],
  ["richHomeworld", "poorHomeworld"],
  ["creative", "uncreative"],
  ["charismatic", "repulsive"],
  ["cybernetic", "lithovore"],
];
