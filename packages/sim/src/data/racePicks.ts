import type { Government, RacePicks, RaceTrait } from "./races.js";
import { COUNCIL_VOTE, RELATION, TREATY_YIELD } from "./diplomacy.js";
import { LEADER_RULES } from "./leaders.js";
import { INDUSTRY_PER_WORKER } from "./planets.js";
import { RAID_LUCKY_POP_MULT } from "./raiders.js";

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
  /** Diplomatic points a repulsive proposer loses on every ask (it can only ask for peace). */
  repulsiveDiplomacy: -50,
  /** Smallest hull (index, frigate 0) a telepathic fleet needs in orbit to mind-control a colony: cruiser. */
  telepathicMindControlSize: 2,
  /** Cybernetic repair per combat round: armor/structure and internal systems. */
  cyberneticRepair: 0.1,
  cyberneticSystemsRepair: 0.05,
  /** BC per surplus food (instead of ½) for fantastic traders (their trade treaty bonus is TREATY_YIELD.traderPoints). */
  traderFoodBc: 1,
  normalFoodBc: 0.5,
  traderGoodsMult: 2,
} as const;

/** Every special ability with its original cost. All of them are pickable. */
export const TRAIT_COSTS: Record<RaceTrait, { cost: number; text: string; name?: string }> = {
  lowG: { name: "Low-G world", cost: -5, text: `Output -25% on normal-G and -50% on heavy-G planets; troops fight at ${TRAIT_EFFECTS.lowGGround}.` },
  highG: { name: "High-G world", cost: 6, text: "Full output on normal and heavy planets; troops take one extra hit." },
  aquatic: { cost: 5, text: "Tundra and swamp count as terran, ocean and terran as gaia, for food and population. Ocean homeworld." },
  subterranean: { cost: 6, text: "Max population +2 per planet size class; troops +10 when defending their colonies." },
  tolerant: { cost: 10, text: "+25% max population on every climate (at most Gaia level); no pollution." },
  largeHomeworld: { cost: 1, text: "Starts on a large homeworld." },
  richHomeworld: { cost: 2, text: `Homeworld has rich minerals: ${INDUSTRY_PER_WORKER.rich} production per worker instead of ${INDUSTRY_PER_WORKER.abundant}.` },
  poorHomeworld: { cost: -1, text: `Homeworld has poor minerals: ${INDUSTRY_PER_WORKER.poor} production per worker instead of ${INDUSTRY_PER_WORKER.abundant}.` },
  artifactsHomeworld: { cost: 3, text: "Ancient artifacts on the homeworld: +2 research per scientist there." },
  cybernetic: { cost: 4, text: `Each colonist eats ½ food and ½ production. Ships repair ${Math.round(TRAIT_EFFECTS.cyberneticRepair * 100)}% of armor and structure and ${Math.round(TRAIT_EFFECTS.cyberneticSystemsRepair * 100)}% of systems each combat round, and all damage after battle.` },
  lithovore: { cost: 10, text: "Eats no food at all." },
  charismatic: { cost: 3, text: `Good relation changes count ×${RELATION.charismaticGainMult}, bad ×${RELATION.charismaticLossMult}; +${TRAIT_EFFECTS.charismaticDiplomacy} on every deal you ask for; conquered people assimilate twice as fast; +${COUNCIL_VOTE.charismatic} with council voters; leaders cost ×${LEADER_RULES.charismaticCostMult}, +${LEADER_RULES.charismaticOfferBonus}% offer chance per turn and come from a wider pool.` },
  repulsive: { cost: -6, text: `Only war and peace with others (no treaties, trades, demands or gifts); ${TRAIT_EFFECTS.repulsiveDiplomacy} on peace offers; conquered people assimilate at half speed; ${COUNCIL_VOTE.repulsive} with council voters; leaders cost ×${LEADER_RULES.repulsiveCostMult}, ${LEADER_RULES.repulsiveOfferBonus}% offer chance per turn and come from half the pool.` },
  creative: { cost: 8, text: "Learns every application in a researched field." },
  uncreative: { cost: -4, text: "Learns one random application per field." },
  fantasticTraders: { cost: 4, text: `+${TREATY_YIELD.traderPoints}% trade treaty income, ${TRAIT_EFFECTS.traderFoodBc} BC per surplus food instead of ${TRAIT_EFFECTS.normalFoodBc}, trade goods 1 BC per production instead of ½.` },
  telepathic: { cost: 6, text: "+25 on diplomacy, +10 on all spy rolls; mind-controls undefended colonies." },
  lucky: { cost: 3, text: `Never picked for random disasters (galaxy-wide hyperspace flux and supernovas still hit); extra lucky windfalls; Vexari raiders count your population at ${Math.round(RAID_LUCKY_POP_MULT * 100)}%; monsters and raiders attack others at the same star first.` },
  omniscient: { cost: 3, text: "Knows every star system from the start and sees every fleet, stealthy or not." },
  stealthy: { name: "Stealthy ships", cost: 4, text: "Your fleets can't be seen on the galaxy map outside your rivals' own systems." },
  transDimensional: { name: "Trans-dimensional", cost: 5, text: "Fleets move +2 parsecs per turn, ships and fighters +4 combat speed; immune to hyperspace flux." },
  warlord: { cost: 4, text: `Crews fight one rank higher and can reach ultra-elite; barracks train and hold ×${TRAIT_EFFECTS.warlordTroopMult} marines and tanks; leaders can reach their top level; +${TRAIT_EFFECTS.warlordCommandPerColony} command points per colony.` },
};

/** Traits that can't be taken together. */
export const EXCLUSIVE_TRAITS: RaceTrait[][] = [
  ["lowG", "highG"],
  ["richHomeworld", "poorHomeworld"],
  ["creative", "uncreative"],
  ["charismatic", "repulsive"],
  ["cybernetic", "lithovore"],
];
