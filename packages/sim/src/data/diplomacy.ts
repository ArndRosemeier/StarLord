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
/** Fantastic traders multiply their trade treaty income by this. */
export const FANTASTIC_TRADER_MULT = 2;

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

/** Charismatic races double good diplomatic effects on them and halve bad ones. */
export const CHARISMATIC_GOOD = 2;
export const CHARISMATIC_BAD = 0.5;
/** Bonus to the chance a deal is accepted: charismatic +50%, telepathic +25% (in AI deal points). */
export const DEAL_BONUS = { charismatic: 50, telepathic: 25 } as const;

/** Espionage rolls: d100 + 10 x (spying - security) - per counter-agent. */
export const SPY = {
  success: 88,
  caught: 20,
  perCounterAgent: 2,
  /** Rolls in [killCounterAgent, success) kill one enemy counter-agent. */
  killCounterAgent: 80,
  /** A successful agent is sometimes killed doing the job anyway. */
  diesOnSuccess: 0.1,
  /** Sabotage destroys a building this often, else kills a colonist. */
  sabotageBuilding: 0.6,
} as const;

/** The Galactic Council. */
export const COUNCIL = {
  /** It first meets once this share of the habitable systems are settled ("nearly the entire galaxy")... */
  settledShare: 2 / 3,
  /** ...or by this turn at the latest, so long games still get elections. */
  latestFirstTurn: 200,
  /** Earliest possible meeting. */
  earliestTurn: 50,
  interval: 25,
  majority: 2 / 3,
  /** One vote per this many population units, at least one. */
  popPerVote: 5,
  minEmpires: 3,
} as const;
