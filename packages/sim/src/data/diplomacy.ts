/** Diplomacy, espionage and Galactic Council numbers. */

/** Proposals not answered within this many turns lapse. */
export const PROPOSAL_LIFETIME = 2;
/**
 * How a computer empire answers a treaty, after the original: it accepts when
 * relation + d100 − need + temperament + patience + the proposer's diplomatic
 * bonuses comes to 0 or more. An alliance also needs a non-aggression pact in
 * force and a relation of at least `allianceMinAttitude`; peace needs the war to
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
 * halved for every other war they fight), minus
 * `theirFleetInYourSystem` for each of your systems their ships sit in, plus
 * `yourFleetInTheirSystem` for each of theirs where yours do, plus how the
 * ship losses compare (K: with yours = what you lost to all your computer
 * enemies and theirs = what they lost to you, each at least `minLosses`,
 * 100 x yours / theirs - 100 when you lost more, else 100 - 100 x theirs /
 * yours; held to -`lossCap`..`lossCap`). Trust
 * and reputation count twice.
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
  minLosses: 10,
  lossCap: 300,
} as const;

/**
 * The price a ruler names for a treaty it would otherwise refuse, after the
 * original. A score from -50 to -1 asks a small price (`levels.small`), from
 * -75 to -51 a big one (`levels.big`).
 * - BC: `bcPerLevel` x level x the ruler's expenses a turn (at least
 *   `minExpenses`), offered only if you have that much, rounded down to 10
 *   (under 100) or 100, at most `maxBc`.
 * - A technology of yours they lack, picked by percentile: the bigger the price
 *   and the further you are behind them in technology, the dearer the pick.
 * - For peace only: a 10% tribute (small price) or one of your more populous
 *   systems, never the capital (big price).
 */
export const COUNTER_PRICE = {
  levels: { small: 4, big: 8 },
  maxLevel: 10,
  minExpenses: 10,
  bcPerLevel: 10,
  maxBc: 32000,
  /** A tribute is only asked at this level or lower, a system only at this level or higher. */
  tributeMaxLevel: 6,
  systemMinLevel: 6,
  tribute: 10,
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

/**
 * The original's six computer personalities: what each adds to its treaty
 * answers (`treaty`), and `noWar`, the original's NOWAR table: every treaty a
 * computer empire signs keeps it from declaring war on that partner for a
 * while (a trade or research treaty noWar turns, a non-aggression pact 1.5x, an
 * alliance 2x; first contact 2x). `vsHumans` is the original's per-pair term
 * toward human players (it weighs on how often they come to you with offers),
 * and `breakChance` the percent chance that, after a second warning, they ask
 * compensation instead of breaking their treaties with you.
 */
export const TEMPERAMENTS = {
  xenophobic: { name: "Xenophobic", treaty: -50, noWar: 5, vsHumans: -3, breakChance: 0 },
  ruthless: { name: "Ruthless", treaty: -20, noWar: 10, vsHumans: -2, breakChance: 30 },
  aggressive: { name: "Aggressive", treaty: -20, noWar: 20, vsHumans: 0, breakChance: 80 },
  erratic: { name: "Erratic", treaty: 0, noWar: 5, vsHumans: 0, breakChance: 20 },
  honorable: { name: "Honorable", treaty: 20, noWar: 50, vsHumans: 2, breakChance: 10 },
  pacifistic: { name: "Pacifistic", treaty: 30, noWar: 40, vsHumans: 5, breakChance: 0 },
} as const;
export type Temperament = keyof typeof TEMPERAMENTS;
/** An Honorable ruler you broke faith with behaves like this instead (the original's seventh, virtual personality). */
export const DISHONORED = { name: "Dishonored", treaty: -70, noWar: 5, vsHumans: 2, breakChance: 80 } as const;

/**
 * Patience: how much more an empire will hear. Every proposal costs the
 * listener `perAsk` (and `firstAsk` plus up to `firstAskRoll` more for the
 * first one in a turn), which counts against the next answers. The asker keeps
 * four tallies (pacts, trade, research, everything else): each ask lowers all
 * four by `perAsk` and its own by `sameKind` more; a demand lowers all four by
 * `demand`. Once any tally reaches
 * `refuse` they will hear no more. Patience recovers by `recovery` a turn up
 * to 0, and breaking a treaty or declaring war sets it to `broken`.
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

/** A peace treaty lasts this many turns, during which a computer empire will not declare war; then it lapses to no treaty. */
export const PEACE_TREATY_TURNS = 30;

/**
 * Trade and research treaties, after the original. The base is half the
 * smaller partner's population of its own kind (androids and natives don't
 * count; android scientists do for research). Each side's full yield is the
 * base times its government's BC multiplier (trade) or research multiplier
 * (research); trade also adds `traderPoints`% for Fantastic Traders and the
 * best Trader leader's skill in %. A new treaty starts at minus the base (a
 * research treaty's setup cost is paid in BC) and climbs by a fifth of the full
 * yield each turn (the remainder rounds up by chance), so it breaks even after
 * about 5 turns and is full after about 10; if population falls, the yield
 * drops to the new full value at once. Pirates halve the trade base.
 */
export const TREATY_YIELD = {
  baseDivisor: 2,
  rampSteps: 5,
  traderPoints: 50,
  piratesDivisor: 2,
} as const;

/** Tribute payments, as a percentage of the payer's income each turn. */
export const TRIBUTE_PERCENTS = [5, 10] as const;

/**
 * How each race regards each other race at the start, after the original's
 * table: row = this race, column = the other, both in the order of RACES
 * (premade races mirror the original archetypes in order; a custom race uses
 * the row of the premade race whose appearance it wears). Relations start at
 * this value and drift back toward it (see RELATION).
 */
export const RACE_RELATIONS: readonly (readonly number[])[] = [
  [0, 0, -24, 24, 0, 0, -12, 0, -24, 0, 12, 0, 24],
  [0, 0, -12, 24, 0, 0, 0, -12, 0, 0, 0, 0, 0],
  [-24, -12, 0, 0, 12, 0, 0, 12, 0, 0, 0, 12, 0],
  [24, 24, 0, 0, -24, 0, 0, 0, 24, -12, 0, -12, 0],
  [0, 0, 12, -24, 0, 0, 0, 12, -12, 0, 0, 0, 0],
  [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  [-12, 0, 0, 0, 0, 0, 0, 0, -12, 0, -12, 12, 24],
  [0, 0, 12, 0, 12, 0, 0, 0, 12, 0, 0, -12, -12],
  [-24, 0, 0, 24, -12, 0, -12, 12, 0, 0, 0, 0, 12],
  [0, 0, 0, -12, 0, 0, 0, 0, 0, 0, 0, 0, 12],
  [12, 0, 0, 0, 0, 0, -12, 0, 0, 0, 0, 0, 0],
  [0, 0, 12, -12, 0, 0, 12, -12, 0, 0, 0, 0, 0],
  [24, 0, 0, 0, 0, 0, 24, -12, 12, 12, 0, 0, 0],
];

/**
 * Relations between two empires (-100..100), after the original. The value is
 * shared by both sides. Every change from an event is scaled:
 * - a gain on a relation below 0 is doubled (but cannot lift it past
 *   `doubledGainCap`); on one at 0 or more it is divided by (relation / `step` + 1);
 * - a loss on a relation above 0 is doubled; at 0 or below it is divided by
 *   (-relation / `step` + 1);
 * - an Honorable ruler takes losses twice as hard; a Xenophobic one takes losses
 *   x1.5 and gains x0.75; a charismatic actor's gains count double and losses half;
 * - between two computer empires after turn `aiPairTurn`, gains count double
 *   and losses are divided by (difficulty / 2 + 1).
 * Nothing changes while at war, and how a human feels is up to the human.
 * Without an alliance the relation cannot rise above `capWithoutAlliance`;
 * at war it is held at `warCeiling` or below.
 *
 * Each turn without an event, with chance (`driftDie` - |relation|) / `driftDie`
 * x 1/`driftOneIn` x 1/2 it moves one step back toward the pair's baseline
 * (the race table, changed by wars, gifts and broken treaties).
 */
export const RELATION = {
  min: -100,
  max: 100,
  step: 25,
  doubledGainCap: 10,
  capWithoutAlliance: 65,
  warCeiling: -90,
  honorableLossMult: 2,
  xenophobicLossMult: 1.5,
  xenophobicGainMult: 0.75,
  charismaticGainMult: 2,
  charismaticLossMult: 0.5,
  aiPairTurn: 100,
  aiPairGainMult: 2,
  driftDie: 105,
  driftOneIn: 4,
  /** Hatred cools: below this, while a treaty's no-war time runs, +1 on a coin flip each turn. */
  hatredBelow: -50,
} as const;

/**
 * What treaties add to relations every turn (a roll from 1 to the number):
 * a pact, trade or research treaty with chance (100 - relation)%, an
 * alliance always; tribute adds to how the receiver feels about the payer,
 * with the same chance.
 */
export const TREATY_WARMTH = {
  nonAggression: 3,
  trade: 3,
  research: 3,
  alliance: 5,
  tribute: { 5: 3, 10: 8 } as Record<number, number>,
} as const;

/** One-off relation events, after the original (rolls are 1..n; all go through the scaling in RELATION unless noted). */
export const RELATION_EVENTS = {
  techExchange: 12,
  /** You agree to a computer ruler's proposal: from..to. */
  agreedToRequest: [11, 23] as const,
  councilFor: 24,
  councilAgainst: -12,
  councilAbstain: -6,
  /** Every computer empire in contact, when an empire destroys a population with biological weapons or extermination: -d this. */
  destruction: 10,
  /**
   * Armed ships near a computer empire's colony of at least `minPop` population,
   * with strength over `minStrength`, cost -((pop - `popOffset`) + strength / `strengthPer`)
   * each turn unless allied (StarLord's fleet strength stands in for the original's threat rating: an estimate).
   */
  threat: { minPop: 5, minStrength: 100, popOffset: 4, strengthPer: 50 },
  /** Declaring war: relation set to `set` - d`roll` on both sides, baseline `baseline` (direct, not scaled). */
  declareWar: { set: -75, roll: 25, baseline: -10 },
  /** Peace: relation rises by `gain`, but no higher than `max` (direct). */
  peace: { gain: 50, max: 0 },
  /** Ending a research treaty: relation -(d20 + d20), baseline -d20 (direct). */
  researchBreak: { roll: 20, baselineRoll: 20 },
  /**
   * Gifts (direct, not scaled): worth m = BC / max(their expenses, `minExpenses`) / 10 (at most `maxBc`),
   * a technology `techPerLevel` x its level / their best level, a tribute `tribute`, a system its
   * population / 2 + 1 (an estimate); relation +m x (d`roll` + `rollBase`), baseline +m.
   */
  gift: { minExpenses: 10, maxBc: 8, techPerLevel: 5, tribute: 2, roll: 4, rollBase: 4 },
  /**
   * Computer empires envy a rival with too many big colonies: on even turns, 1 in `oneIn`,
   * for one with more than `perSize` x (galaxy size + 1) colonies of at least `minPop` population.
   */
  envy: { oneIn: 4, perSize: 3, minPop: 5 },
} as const;

/**
 * Jealousy (Hard and Impossible only): a computer empire with which a human
 * has no treaty at all loses relation each turn by the sum of that human's
 * treaties with others / 100 (pact 100, alliance 200, trade 50, research 50;
 * x2/3 with Xeno Psychology, halved on Hard). Pacifistic rulers are exempt.
 */
export const JEALOUSY = {
  minDifficulty: 3,
  nonAggression: 100,
  alliance: 200,
  trade: 50,
  research: 50,
  xenoPsychology: 2 / 3,
  hardDivisor: 2,
} as const;

/** Treaty multipliers on a personality's noWar turns (see TEMPERAMENTS). */
export const NO_WAR_MULT = { trade: 1, research: 1, nonAggression: 1.5, alliance: 2, contact: 2 } as const;

/**
 * Computer empires among themselves, after the original. Each turn each
 * ordered pair has a 1 in (`die` - `perDifficulty` x difficulty) chance to
 * consider treaties: relation + trust + treaties + shared wars + d100 + patience
 * + 50 per war either fights with a human + both temperaments; 200 or more
 * turns a pact into an alliance, 100 or more signs a pact. A second roll signs
 * research (over 110) or trade (over 80); a third may make the weaker, poorer
 * one pay tribute. On a turn it considers a partner it is allied to, an
 * empire also joins that ally's wars, and each consideration costs `patienceCost`.
 */
export const AI_TREATIES = {
  die: 250,
  perDifficulty: 40,
  minPatience: -30,
  pact: { nonAggression: 20, alliance: 40, trade: 10 },
  theirWar: 10,
  partnerWar: 20,
  partnerStrikes: 5,
  humanWar: 50,
  alliance: 200,
  nonAggression: 100,
  research: 110,
  trade: 80,
  tribute: 150,
  tributePercent: 5,
  /** How the receiver warms to a new tributary: 1..roll + base. */
  tributeWarmth: { roll: 3, base: 2 },
  patienceCost: 30,
} as const;

/**
 * How a war between two computer empires ends, after the original
 * (FUN_00026705): once it has lasted more than `baseTurns` - `perDifficulty` x
 * difficulty - `perHumanWar` x the human empires the first side also fights,
 * they make peace. (The original may instead have a collapsing empire join a
 * stronger one; StarLord leaves that out.)
 */
export const AI_AI_PEACE = { baseTurns: 90, perDifficulty: 15, perHumanWar: 20 } as const;

/**
 * When a computer empire goes to war with another computer empire, after the
 * original. Only a neighbor its fleets match (strength ratio 100% or more,
 * halved for every other war it fights) with no no-war time left is a target:
 * - an Erratic ruler 1 in `erratic` x (difficulty² + 1) a turn;
 * - hatred: once every few turns, d100 <= (-5 - relation) / (2 x difficulty + 1);
 * - a run of deficit turns: d100 under their number;
 * - when the target is already fighting a human, never;
 * - strength: once every few turns, ratio >= 125 + d200 + 3 x temperament +
 *   25 x difficulty + 50 pact + 100 alliance + 200 peace + 50 trade + 50 research
 *   + 50 / 100 tribute paid - the human fleets that outgun it near the target.
 * On Hard and Impossible they don't pile onto an empire already at war with another computer.
 */
export const AI_WAR = {
  erratic: 30,
  hatred: -5,
  strength: {
    base: 125, roll: 200, temperament: 3, perDifficulty: 25, nonAggression: 50, alliance: 100, peace: 200, trade: 50, research: 50,
    tribute: { 5: 50, 10: 100 } as Record<number, number>,
  },
  noDogpileFrom: 3,
  strengthCap: 800,
} as const;

/**
 * Warnings: a computer ruler that suffers spying, a threat or worse from a
 * human counts strikes. Each such event rolls three times (d100 against s,
 * s/2 and s/4, where s = twice the hurt - temperament - trust - reputation,
 * plus the hate when relations are below 0). One strike is a warning; an
 * Honorable ruler with a treaty goes to war at once; a second strike with a
 * treaty ends it (or asks compensation); more than two (or two without a
 * treaty) means war when their fleets are at least `warStrength`% of yours.
 */
export const STRIKES = { warStrength: 66, councilVote: 100 } as const;

/**
 * Before that war, a ruler that is not Honorable and covets one of your
 * systems demands it instead, after the original (FUN_0004f596); refusing
 * (or letting the demand lapse) means war. The original only covets from
 * average difficulty up (`minDifficulty`, its war planner's gate), a system
 * its fleets can reach, never your capital's, and only while you hold another,
 * when the system is worth at least `minValue`. That worth comes from its
 * invasion planner, which is not decoded: StarLord counts `perPop` for every
 * population unit there (an estimate, so a system of 10 is coveted).
 */
export const COVET = { minDifficulty: 2, minValue: 200, perPop: 20 } as const;

/**
 * A computer ruler pays to bring you into its war, after the original
 * (FUN_000501c5): when a treaty offer it picked falls through, it looks for an
 * enemy it has fought for at least `minWarTurns` turns, likes no more than
 * `maxRelation`, and has lost more ships to; you must know that enemy and not
 * be at war with it, and Xenophobic rulers never ask. The payment is a BC sum
 * or a technology at level (its ship losses / (the enemy's + 1)), at most `maxLevel`.
 */
export const PAID_WAR = { minWarTurns: 20, maxRelation: -50, maxLevel: 6 } as const;

/**
 * How often a computer ruler comes to a human with an offer, after the
 * original: x = 10 + 4 x difficulty - patience/20 - trust/20 + relation/20 -
 * diplomat/15 + 3 x the personality's vsHumans - temperament/5 - 4 (pact) - 8
 * (alliance) - 5 (Xeno Psychology), held to 0..40; they come when d100 <= the
 * turns since they last did / (x² / 50 + 1).
 */
export const AI_OFFERS = {
  base: 10, perDifficulty: 4, patienceDiv: 20, trustDiv: 20, relationDiv: 20, diplomatDiv: 15, vsHumans: 3, temperamentDiv: 5,
  nonAggression: 4, alliance: 8, xenoPsychology: 5, max: 40, clockMax: 250,
  /** Three d20 draws; the last that fits wins. */
  table: { tech: 5, nonAggression: 9, trade: 12, research: 15, alliance: 18 },
  pactDie: 500, allianceDie: 350, perDifficultyDie: 50,
  tradeDie: 300, tradePerDifficulty: 50,
  /** A computer ally asks you to join one of its wars, and joins yours, 1 in this many turns. */
  allyDuty: 10,
} as const;

/**
 * When a computer ruler offers peace, after the original: once the war has
 * lasted 10 turns, with t = turns at war - 9, S = 5 x its other wars - 5 x
 * yours + strength% / 10 - 10 + 40 per system of yours its ships hold - 20 per
 * system of its your ships hold + reputation + trust / 2 + K / 10 - temperament
 * / 5 + 20 per system of yours a third empire's ships hold. Chance %: -S x t
 * when S < 0, else t / sqrt(S + 3); over `askAbove` they ask a price, at
 * level (S - 10) / 5 + 2; under `payBelow` they offer to pay one (a sum, a
 * technology, a tribute or a system), at level (-10 - S) / 5 + 2.
 */
export const AI_PEACE = { minTurns: 10, askAbove: 10, payBelow: -10, priceStep: 5, priceBase: 2 } as const;

/**
 * How a computer ruler answers a demand, after the original: d200 + power +
 * patience + 2 x temperament + what the demand costs them. With a pact or
 * alliance: `pact` bands, without: `none` bands (war, a strike and broken
 * treaties, a strike and a worse baseline, refusal; above the last they give in). power = the average of how your fleets, size and technology
 * compare to theirs (-300..300 each; StarLord's estimate of the original's ratios).
 */
export const DEMAND_ANSWER = {
  die: 200,
  ratioCap: 300,
  /** Each band applies at or below its number: war, then broken treaties and a strike, then a strike and a worse baseline, then refusal. */
  pact: { war: -101, breakTreaties: -51, strike: -26, refuse: -1 },
  none: { war: -151, strike: -76, refuse: 0 },
  strikeBaseline: -10,
  /** What declaring war on a third empire costs them, by their treaty with it; -25 more if it is a computer empire. */
  war: { alliance: -150, nonAggression: -75, none: -25, computer: -25 },
  /** Tribute, ending spying, moving fleets (the original's flat types; which is which is an estimate). */
  other: -50,
  peaceBase: 80,
  systemCap: 300,
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
  /** Stolen technology or sabotage: the empire blamed (the thief, or whoever was framed) loses -(d first + d second) relation with the victim. */
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
  /** One vote per this many population units (androids and natives count), rounded up; no population, no vote. */
  popPerVote: 10,
  minEmpires: 3,
} as const;

/**
 * How a computer empire decides to back a council candidate, from the
 * original (FUN_00016021): it votes for a candidate when a d200 rolls at or
 * under relation + trust + 2 x reputation plus the points below. It never
 * backs one it is at war with and always backs an ally; it votes only when it
 * would back exactly one of the two candidates, and abstains otherwise. On
 * Hard and Impossible a human candidate's score is scaled by 6 / (6 + level).
 * A computer voter also weighs its mood toward a human candidate: minus
 * `mood` x its temperament's vsHumans (the original's per-pair mood starts
 * there; StarLord does not follow how audiences move it later). Between
 * computer empires the mood is 0.
 */
export const COUNCIL_VOTE = {
  die: 200,
  /** The voter is at war with the other candidate. */
  atWarWithRival: 100,
  /** The candidate holds Orion (the owner of the first settled habitable planet there). */
  holdsOrion: 40,
  charismatic: 40,
  repulsive: -100,
  /** The candidate knows Xeno Psychology. */
  xenoPsychology: 30,
  /** The voter backed this candidate at the last council. */
  sameAsLastTime: 50,
  nonAggression: 50,
  trade: 25,
  research: 25,
  /** Points per step of the voter's mood toward a human candidate, subtracted. */
  mood: 20,
  /** Difficulty index (Tutor 0 .. Impossible 4) above which a human candidate's score shrinks. */
  humanScaleAbove: 2,
  humanScaleBase: 6,
} as const;
