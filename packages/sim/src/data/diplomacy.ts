/** Diplomacy, espionage and Galactic Council numbers. */

/** Proposals not answered within this many turns lapse. */
export const PROPOSAL_LIFETIME = 2;
/**
 * How a computer empire answers a treaty, after the original: it accepts when
 * attitude + d100 − need + temperament + patience + the proposer's diplomatic
 * bonuses comes to 0 or more. An alliance also needs a non-aggression pact in
 * force and attitude of at least `allianceMinAttitude`; peace needs the war to
 * have lasted `peaceMinWarTurns`.
 */
export const TREATY_ANSWER = {
  need: { nonAggression: 75, alliance: 125, trade: 60, research: 40 } as Record<string, number>,
  allianceMinAttitude: 50,
  peaceMinWarTurns: 10,
  /** A score from `smallPrice` up to -1 lets them name a small price; from `bigPrice` a big one; below, they refuse. */
  smallPrice: -50,
  bigPrice: -75,
  /** Chance they name a price at all instead of refusing (trade and research never do). */
  counterChance: { nonAggression: 0.5, alliance: 0.25, peace: 1 } as Record<string, number>,
  /** An Honorable ruler you broke faith with uses this instead of its temperament. */
  dishonored: -70,
} as const;

/**
 * The original's peace answer. Attitude cancels out; what counts is how the
 * war goes. The score adds `perWarTurn` for every turn of war beyond
 * `warTurnsOffset`, `perTheirWar` for each other war they fight (`humanWarWeight`
 * for a human enemy), minus the same for each other war you fight, minus half
 * of how far their strength exceeds yours in percent (capped at `strengthCap`%,
 * halved per other war they fight against a computer empire), minus
 * `theirFleetInYourSystem` for each of your systems their ships sit in, plus
 * `yourFleetInTheirSystem` for each of theirs where yours do. Trust and
 * reputation count twice.
 */
export const PEACE_ANSWER = {
  need: 100,
  warTurnsOffset: 9,
  perWarTurn: 1,
  perTheirWar: 25,
  perYourWar: 25,
  humanWarWeight: 2,
  strengthCap: 800,
  theirFleetInYourSystem: 100,
  yourFleetInTheirSystem: 50,
} as const;

/**
 * The price a ruler names for a treaty it would otherwise refuse. BC prices
 * are `bcTurnsOfIncome` turns of the ruler's own income for a small price and
 * twice that for a big one (the original's exact sum is not decoded; this is
 * our estimate), never more than you have. A small price may also be a
 * technology or a 5% tribute; a big one a technology, a 10% tribute or a
 * star system.
 */
export const COUNTER_PRICE = {
  bcTurnsOfIncome: 2,
  minBc: 20,
  smallTribute: 5,
  bigTribute: 10,
} as const;

/**
 * Trust and reputation, after the original. Breaking a treaty costs the wronged
 * empire's trust in you (more if they are Honorable) and every other empire in
 * contact a little of your reputation (more if they are Honorable). Both count
 * in every later treaty answer, and never recover.
 */
export const TRUST = {
  broken: { nonAggression: 20, alliance: 40, peace: 40, trade: 5, research: 5, tribute: 5 } as Record<string, number>,
  honorableMult: 3,
  reputation: 10,
  honorableReputation: 20,
} as const;

/** The original's six computer personalities and what each adds to its treaty answers. */
export const TEMPERAMENTS = {
  xenophobic: { name: "Xenophobic", treaty: -50 },
  ruthless: { name: "Ruthless", treaty: -20 },
  aggressive: { name: "Aggressive", treaty: -20 },
  erratic: { name: "Erratic", treaty: 0 },
  honorable: { name: "Honorable", treaty: 20 },
  pacifistic: { name: "Pacifistic", treaty: 30 },
} as const;
export type Temperament = keyof typeof TEMPERAMENTS;

/**
 * Patience: how much more an empire will hear. Every proposal costs the
 * listener `perAsk` (and `firstAsk` plus up to `firstAskRoll` more for the
 * first one in a turn), which counts against the next answers. The asker keeps
 * four tallies (pacts, trade, research, everything else): each ask lowers all
 * four by `perAsk` and its own by `sameKind` more; a demand lowers all four by
 * `demand`. Once any tally reaches
 * `refuse` they will hear no more. Patience recovers by `recovery` a turn up
 * to 0, and breaking a treaty sets it to `broken`.
 */
export const PATIENCE = {
  perAsk: 10,
  firstAsk: 20,
  firstAskRoll: 30,
  sameKind: 20,
  demand: 50,
  refuse: -100,
  recovery: 16,
  broken: -200,
} as const;
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
  /** A framed empire loses rnd(first) + rnd(second) attitude with the victim. */
  blameDrop: [15, 5] as const,
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
