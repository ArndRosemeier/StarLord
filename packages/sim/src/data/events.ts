/**
 * Random events, after the original's Galactic News list. How often they come,
 * whom they strike and how hard follow the original program. Each kind of
 * event happens at most once a game, as in the original (its slot stays taken
 * once used).
 */

export type EventId =
  | "derelict" | "axisShift" | "comet" | "computerVirus" | "assassination" | "diplomaticMarriage" | "donation"
  | "earthquake" | "shipExplosion" | "hyperspaceFlux" | "industrialAccident" | "mineralDepletion" | "mineralDeposit"
  | "mutiny" | "pirates" | "pirateRaid" | "plague" | "populationBoom" | "breakthrough" | "supernova" | "timeSpaceAnomaly"
  | "warpBeast" | "warpFunnel" | "unstableWormhole"
  | "amoeba" | "crystal" | "dragon" | "eel" | "hydra";

export interface EventDef {
  /** Disasters strike big empires and spare lucky ones; good events go to small empires. */
  mood: "good" | "bad" | "neutral";
  /** Strikes the whole galaxy (or a star picked at random) rather than one empire. */
  global?: boolean;
  /** Needs the monsters setting. */
  monster?: boolean;
  /** Can't happen before this turn. */
  fromTurn?: number;
  /** Only while hyperspace flux is active (the original's comet works this way). */
  needsFlux?: boolean;
  /** Before this turn the monster only appears while hyperspace flux is active. */
  fluxBefore?: number;
  /** In the list but switched off, as in the original. */
  disabled?: boolean;
  /** Fires and uses up its slot but does nothing, as in the original (its effect was never wired up). */
  dud?: boolean;
}

export const EVENTS: Record<EventId, EventDef> = {
  derelict: { mood: "good" },
  axisShift: { mood: "good" },
  comet: { mood: "bad", fromTurn: 200, needsFlux: true },
  computerVirus: { mood: "bad" },
  assassination: { mood: "bad" },
  diplomaticMarriage: { mood: "good" },
  donation: { mood: "good" },
  earthquake: { mood: "bad" },
  shipExplosion: { mood: "bad" },
  hyperspaceFlux: { mood: "bad", global: true },
  industrialAccident: { mood: "bad" },
  mineralDepletion: { mood: "bad" },
  mineralDeposit: { mood: "good" },
  mutiny: { mood: "bad", disabled: true },
  pirates: { mood: "bad" },
  pirateRaid: { mood: "bad" },
  plague: { mood: "bad" },
  populationBoom: { mood: "good" },
  breakthrough: { mood: "good" },
  amoeba: { mood: "bad", monster: true, fluxBefore: 100 },
  crystal: { mood: "bad", monster: true, fluxBefore: 200 },
  dragon: { mood: "bad", monster: true, fluxBefore: 300 },
  eel: { mood: "bad", monster: true, fluxBefore: 150 },
  hydra: { mood: "bad", monster: true, fluxBefore: 250 },
  supernova: { mood: "bad", global: true, fromTurn: 200 },
  timeSpaceAnomaly: { mood: "bad" },
  warpBeast: { mood: "bad" },
  warpFunnel: { mood: "bad", dud: true },
  unstableWormhole: { mood: "good" },
};

/**
 * How often events come. From EVENT_START on, each quiet turn makes the next
 * event likelier: the chance is the quiet turns, times (d + 1) / (d + 2) for
 * difficulty d (0 tutor to 4 impossible), out of `dieSides`. For `cooldown`
 * turns after an event nothing happens.
 */
export const EVENT_START = 50;
export const EVENT_TIMING = {
  dieSides: 512,
  cooldown: 5,
  /** Tries to find an event that can happen. */
  tries: 5,
  /** Lucky empires: each turn rnd(1000) <= turns waited / k forces a windfall; k by settings. */
  luckDie: 1000,
  luckDivisor: { events: 6, eventsAndRaiders: 8, noEvents: 10, noEventsWithRaiders: 12 },
} as const;

/** Event magnitudes, as the original program has them. Ranges are inclusive [min, max]. */
export const EVENT_NUMBERS = {
  /** Donation: base + step × floor(turn / perTurns) BC, so it grows with the game. */
  donation: { base: 100, step: 100, perTurns: 20 },
  /**
   * Derelict ship: the beam weapon closest at or above the strongest beam any
   * empire has (by top damage, at most `beamReach` higher), and the best armor
   * any empire has, each if the empire lacks it. Xenon weapons are never found.
   */
  derelict: { beamReach: 50, defaultBeam: "laserCannon" },
  /**
   * Comet: hit points (rnd(5) + 10 + difficulty) × 10 and impact in
   * rnd(5) + 10 − difficulty turns. Every ship in orbit there, of any empire,
   * takes off its hull size (frigate 1 … doom star 6) each turn. On impact
   * it scores (rnd(3) + rnd(3)) × (buildings + population) / 10 hits.
   */
  cometHp: { die: 5, base: 10, mult: 10 },
  cometTurns: { die: 5, base: 10 },
  cometImpact: { dice: [3, 3] as [number, number] },
  /** Computer virus: needs this much stored research and wipes min(base + rnd(die), stored). */
  virus: { minStored: 10, base: 50, die: 50 },
  /** Assassination and diplomatic marriage: a relation event of this size with a random empire in contact, not at war. */
  relationShift: 100,
  /** Earthquake: (rnd(3) + rnd(2)) × (buildings + population) / 10 hits, at least 1. */
  earthquake: { dice: [3, 2] as [number, number] },
  /** Industrial accident: (rnd(3) + rnd(3)) × population / 10 colonists die, and one more hit lands. */
  industrialAccident: { dice: [3, 3] as [number, number], hits: 1 },
  /** Pirate raid: needs this much BC and steals (base + rnd(die))% of the treasury. */
  pirateMinBc: 100,
  pirateLootPercent: { base: 29, die: 21 },
  /**
   * Pirates: need this many freighters. Their base's strength is the fleet
   * size (each ship's hull size, frigate 1 … doom star 6) of every empire
   * with a colony in the system, times a fraction by difficulty (tutor …
   * impossible); under `minStrength` they don't come. Each turn, with a
   * chance of strength left / starting strength, every empire there loses a
   * freighter; then the ships in orbit wear the strength down by their hull
   * sizes. They stay until it is gone.
   */
  pirates: { minFreighters: 4, minStrength: 5, difficultyShare: [1 / 5, 2 / 5, 3 / 5, 1, 4 / 5] },
  /** Plague: the cure takes the colony's research × (rnd(die) + perDifficulty × difficulty). */
  plague: { die: 8, perDifficulty: 2 },
  /**
   * Supernova: explodes in rnd(5) + 10 − difficulty turns; stopping it takes
   * that many turns of the system's current research. The system's worlds
   * are left radiated.
   */
  supernovaTurns: { die: 5, base: 10 },
  /**
   * Lasting events (hyperspace flux, time-space anomaly, warp beast,
   * population boom) end with a 1 in `endDie` chance each turn once they are
   * `minTurns` old, and always at `maxTurns`.
   */
  lasting: { minTurns: 6, maxTurns: 22, endDie: 20 },
  /** Mineral deposits raise a planet's richness this many steps; depletion only strikes ultra rich worlds. */
  depositSteps: 2,
};

