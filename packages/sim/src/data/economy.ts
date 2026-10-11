/** Colony economy numbers that aren't tied to a building, planet or government. */

/** BC each population unit pays before race picks (decoded from the original program). */
export const TAX_PER_POP = 1;
/** BC per point of industry produced as Trade Goods, rounded up; fantastic traders get 1:1. */
export const TRADE_GOODS_RATE = 0.5;
/** BC per point of industry taken by the tax rate; no multiplier applies to it. */
export const TAX_BC_PER_INDUSTRY = 1;
/**
 * Share of a new colony's non-farmers that start as scientists, so empires
 * that never touch their jobs still research as hard as they build. The
 * original leaves job assignment to the player; this is StarLord's default.
 */
export const DEFAULT_RESEARCH_SHARE = 0.5;
/** Tax rates the player may choose. */
export const TAX_STEPS = [0, 0.1, 0.2, 0.3, 0.4, 0.5];

/**
 * Every worker and scientist makes at least this much before modifiers;
 * farmers make at least half a food where farming is possible.
 */
export const MIN_OUTPUT_PER_UNIT = 1;
export const MIN_FOOD_PER_FARMER = 0.5;
/** Morale can't push output below nothing; the original states no other limit. */
export const MORALE_FLOOR = -100;

/** Food each population unit eats. Cybernetic races eat half and use half an industry instead. */
export const FOOD_PER_POP = 1;
export const CYBERNETIC_FOOD = 0.5;
export const CYBERNETIC_INDUSTRY = 0.5;

/** Freighters and the food trade. */
export const FREIGHTERS = {
  /** Ships in one Freighter Fleet. */
  perFleet: 5,
  /** Food one freighter carries each turn. */
  foodPerShip: 1,
  /** Freighters tied up while moving one population unit. */
  perColonist: 5,
  /** BC upkeep per freighter in use; idle freighters cost nothing. */
  upkeepInUse: 0.5,
} as const;

/** Android population units. */
export const ANDROIDS = {
  /** Output above what the planet gives a normal unit, before racial bonuses (androids get none). */
  bonus: 3,
  /** Industry each android uses up every turn instead of food. */
  industryUpkeep: 1,
} as const;

/** Ground defenders every colony musters from its own population. */
export const MILITIA_PER_POP = 0.5;

/** Extra BC a gold or gem deposit pays every turn, untouched by morale. */
export const SPECIAL_INCOME = { gold: 5, gems: 10 } as const;

/** Percent lost from every farmer's and worker's output while an enemy fleet sits unopposed in the system. */
export const BLOCKADE_PENALTY = 50;

/** BC upkeep for each food Food Replicators make. */
export const REPLICATED_FOOD_UPKEEP = 1;

/** Population growth, decoded from the original program. */
export const GROWTH = {
  /** Base growth in thousands is the integer square root of scale × pop × (max − pop) / max. */
  scale: 2000,
  /** Growth percent added for each point of net production per colonist while the colony builds Housing. */
  housingPercent: 40,
  /** Thousands a Cloning Center adds each turn, never multiplied. */
  cloningK: 100,
  /** Growth percent from a population boom and from a plague. */
  boomPercent: 100,
  plaguePercent: -200,
  /** Thousands lost each turn for each food a colony is short. */
  starvationK: 50,
} as const;

/** Research per scientist before bonuses, and the artifacts bonus. */
export const RESEARCH_PER_SCIENTIST = 3;
export const ARTIFACTS_RESEARCH = 2;

/** BC per missing production point when buying: in the last half, from 10% to half done, and below 10%. */
export const BUY_PRICE_PER_POINT = [2, 5, 10] as const;
