/** Colony economy numbers that aren't tied to a building, planet or government. */

/** BC each population unit pays before race, tech and building bonuses. Not in our references; kept from earlier StarLord. */
export const TAX_PER_POP = 0.5;
/** BC per point of industry produced as Trade Goods. */
export const TRADE_GOODS_RATE = 0.5;
/** BC per point of industry taken by the tax rate; the original calls taxes exactly like Trade Goods. */
export const TAX_BC_PER_INDUSTRY = 0.5;
/**
 * Share of a new colony's non-farmers that start as scientists, so empires
 * that never touch their jobs still research as hard as they build. The
 * original leaves job assignment to the player; this is StarLord's default.
 */
export const DEFAULT_RESEARCH_SHARE = 0.5;
/** Tax rates the player may choose. */
export const TAX_STEPS = [0, 0.1, 0.2, 0.3, 0.4, 0.5];

/** Every farmer, worker and scientist makes at least this much, farmers only where farming is possible. */
export const MIN_OUTPUT_PER_UNIT = 1;
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
  /** Population lost per turn by a colony whose food need isn't met. */
  starvationPerTurn: 1,
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

/** Extra BC a gold or gem deposit pays every turn; the original only says "extra" and "lots of extra". */
export const SPECIAL_INCOME = { gold: 5, gems: 8 } as const;

/** Production lost while an enemy fleet sits unopposed in the system. */
export const BLOCKADE_PRODUCTION = 0.5;

/** Research per scientist before bonuses, and the artifacts bonus. */
export const RESEARCH_PER_SCIENTIST = 3;
export const ARTIFACTS_RESEARCH = 2;
