/** Diplomacy, espionage and Galactic Council numbers. */

/** Proposals not answered within this many turns lapse. */
export const PROPOSAL_LIFETIME = 2;
/** An emperor tires after this many agenda items from the same empire in one turn. */
export const AUDIENCE_ITEMS = 3;
/** A peace treaty forbids attacks for this many turns (the original says "a set number"). */
export const PEACE_TREATY_TURNS = 20;

/**
 * Trade and research treaties yield `perPop` x the smaller empire's
 * population (BC or research points). They start at a loss for setting up
 * routes, break even after `breakEven` turns and reach full yield after `full`.
 */
export const TREATY_YIELD = {
  trade: { perPop: 0.25, breakEven: 5, full: 10 },
  research: { perPop: 0.5, breakEven: 5, full: 10 },
} as const;

/** Tribute payments, as a percentage of the payer's income each turn. */
export const TRIBUTE_PERCENTS = [5, 10] as const;

/** Baseline attitude parts: how one empire feels about another before drift. */
export const ATTITUDE = {
  charismatic: 20,
  repulsive: -20,
  sameRace: 5,
  war: -30,
  peace: 5,
  nonAggression: 10,
  alliance: 20,
  /** Pacts and alliances warm relations the longer they hold: +1 per this many turns, up to the cap. */
  pactWarmthTurns: 10,
  nonAggressionWarmthCap: 10,
  allianceWarmthCap: 20,
  treaty: 5,
  /** Paying tribute to someone makes them like you; receiving it from someone makes you scorn them a little less. */
  tributePaid: 15,
  borders: -10,
  /** Colonies this close count as a shared border. */
  borderRange: 3,
  sharedEnemy: 10,
  /** Attitude drifts toward the baseline by at most this per turn. */
  driftPerTurn: 2,
} as const;

/** One-off attitude changes (the target's feelings toward the actor). */
export const ATTITUDE_EVENTS = {
  acceptedTreaty: 5,
  rejectedProposal: -2,
  declaredWar: -40,
  /** Everyone else, when war breaks a treaty; again if they liked the victim. */
  brokeTreatyOthers: -10,
  likedVictim: -10,
  likedVictimThreshold: 30,
  /** Attacking during a peace treaty is a grave offence, to the victim and to everyone. */
  brokePeace: -60,
  brokePeaceOthers: -20,
  /** Ending a treaty without war. */
  brokeTreaty: -10,
  brokeAlliance: -25,
  giftTech: 10,
  /** Attitude per BC gifted, up to the cap. */
  giftPerBc: 0.1,
  giftBcCap: 30,
  giftSystem: 25,
  techExchange: 5,
  demandRefused: -5,
  /** How the giver of a demanded tribute, tech or system feels about the bully. */
  demandMet: -10,
  /** Biological weapons and extermination appal everyone. */
  bioWeapons: -25,
  exterminate: -30,
  spyNoticed: -5,
  spyCaught: -8,
} as const;


/**
 * Espionage, as in the original: once a turn for each spying empire and
 * target, d100 + spying + spy count − d100 − security − their spy count.
 */
export const SPY = {
  /** Roll needed to steal a technology, and to sabotage a building. */
  steal: 80,
  sabotage: 70,
  /** A success this good pins the blame on a third empire. */
  blame: 90,
  /** Separate roll (with this penalty, removed when the spies only hide): this high kills a defender, this low an agent. */
  killPenalty: 20,
  killThreshold: 80,
} as const;

/** What a number of spies adds to the roll: 2 each up to 5, 1 each up to 10, half each beyond. */
export function spyCountBonus(n: number): number {
  if (n <= 5) return 2 * n;
  if (n <= 10) return n + 5;
  return 15 + Math.floor((n - 10) / 2);
}

/** The Galactic Council. */
export const COUNCIL = {
  /** It first meets once this share of all star systems has an owner... */
  settledShare: 1 / 2,
  /** ...and not before this turn. */
  earliestTurn: 25,
  interval: 25,
  majority: 2 / 3,
  /** One vote per this many population units, at least one. */
  popPerVote: 5,
  minEmpires: 3,
} as const;
