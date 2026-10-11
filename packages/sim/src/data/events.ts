/**
 * Random events, after the original's Galactic News list. How often they come
 * and whom they strike follow the original program; most magnitudes are ours.
 */

export type EventId =
  | "derelict" | "axisShift" | "comet" | "computerVirus" | "assassination" | "diplomaticMarriage" | "donation"
  | "earthquake" | "shipExplosion" | "hyperspaceFlux" | "industrialAccident" | "mineralDepletion" | "mineralDeposit"
  | "mutiny" | "pirates" | "plague" | "populationBoom" | "breakthrough" | "supernova" | "timeSpaceAnomaly"
  | "warpBeast" | "warpFunnel" | "unstableWormhole"
  | "amoeba" | "crystal" | "dragon" | "eel" | "hydra";

export interface EventDef {
  /** Disasters strike big empires and spare lucky ones; good events go to small empires. */
  mood: "good" | "bad" | "neutral";
  /** Strikes the whole galaxy rather than one empire. */
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
}

export const EVENTS: Record<EventId, EventDef> = {
  derelict: { mood: "good" },
  axisShift: { mood: "good" },
  donation: { mood: "good" },
  mineralDeposit: { mood: "good" },
  populationBoom: { mood: "good" },
  breakthrough: { mood: "good" },
  diplomaticMarriage: { mood: "good" },
  comet: { mood: "bad", fromTurn: 200, needsFlux: true },
  computerVirus: { mood: "bad" },
  assassination: { mood: "bad" },
  earthquake: { mood: "bad" },
  shipExplosion: { mood: "bad" },
  hyperspaceFlux: { mood: "neutral", global: true },
  industrialAccident: { mood: "bad" },
  mineralDepletion: { mood: "bad" },
  mutiny: { mood: "bad", disabled: true },
  pirates: { mood: "bad" },
  plague: { mood: "bad" },
  supernova: { mood: "bad", fromTurn: 200 },
  timeSpaceAnomaly: { mood: "bad" },
  warpBeast: { mood: "neutral", global: true },
  warpFunnel: { mood: "bad" },
  unstableWormhole: { mood: "good" },
  amoeba: { mood: "bad", monster: true, fluxBefore: 100 },
  crystal: { mood: "bad", monster: true, fluxBefore: 200 },
  dragon: { mood: "bad", monster: true, fluxBefore: 300 },
  eel: { mood: "bad", monster: true, fluxBefore: 150 },
  hydra: { mood: "bad", monster: true, fluxBefore: 250 },
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

/** Event magnitudes. Ranges are inclusive [min, max]. */
export const EVENT_NUMBERS = {
  /** Donation: base + step × floor(turn / perTurns) BC, so it grows with the game. */
  donation: { base: 100, step: 100, perTurns: 20 },
  derelictMaxCost: 1500,
  /**
   * Comet: hit points (rnd(5) + 10 + difficulty) × 10 and impact in
   * rnd(5) + 10 − difficulty turns, as in the original. Each armed ship in orbit
   * does its size class times cometDamagePerSize per turn (ours).
   */
  cometHp: { die: 5, base: 10, mult: 10 },
  cometTurns: { die: 5, base: 10 },
  cometDamagePerSize: 10,
  /** Computer virus: needs this much stored research and wipes min(base + rnd(die), stored). */
  virus: { minStored: 10, base: 50, die: 50 },
  attitudeShift: 20,
  earthquakeKills: [0, 2] as [number, number],
  earthquakeBuildings: [1, 2] as [number, number],
  /**
   * Pirates need this much BC in the treasury and steal (base + rnd(die))% of
   * it when they strike; then their base chokes trade until armed ships of
   * this total size class come to the system or they move on.
   */
  pirateMinBc: 100,
  pirateLootPercent: { base: 29, die: 21 },
  pirateHunterSize: 6,
  /** Plague: research points to cure, a colonist dies with this chance each turn, and the outbreak burns out after the timeout. */
  plagueStrength: [100, 300] as [number, number],
  plagueTimeout: 40,
  boomTurns: [10, 20] as [number, number],
  supernovaStrength: [200, 500] as [number, number],
  /** Turns until the star explodes: rnd(5) + 10 − difficulty. */
  supernovaTurns: { die: 5, base: 10 },
  /**
   * Lasting events (hyperspace flux, time-space anomaly, pirates, warp beast)
   * end with a 1 in `endDie` chance each turn once they are `minTurns` old,
   * and always after `maxTurns`.
   */
  lasting: { minTurns: 5, maxTurns: 20, endDie: 20 },
  /** Mineral deposits raise a planet's richness this many steps. */
  depositSteps: 2,
  /** Chance per turn the warp beast eats a ship from a fleet in hyperspace. */
  warpBeastStrike: 0.4,
  funnelTurns: [3, 6] as [number, number],
};
