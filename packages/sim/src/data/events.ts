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
  donationBc: [50, 200] as [number, number],
  derelictMaxCost: 1500,
  /** Comet: hit points, turns until impact; each armed ship in orbit does its size class in damage per turn. */
  cometStrength: [20, 40] as [number, number],
  cometTurns: [8, 12] as [number, number],
  cometDamagePerSize: 2,
  /** Share of current research progress a computer virus wipes out. */
  virusLoss: [0.5, 1] as [number, number],
  attitudeShift: 20,
  earthquakeKills: [0, 2] as [number, number],
  earthquakeBuildings: [1, 2] as [number, number],
  fluxTurns: [3, 6] as [number, number],
  /** Pirates: lasting turns, chance per turn of a raid and the BC stolen; ended by armed ships of this total size class in the system. */
  pirateTurns: [10, 20] as [number, number],
  pirateRaidChance: 0.5,
  pirateLoot: [10, 40] as [number, number],
  pirateHunterSize: 6,
  /** Plague: research points to cure, a colonist dies with this chance each turn, and the outbreak burns out after the timeout. */
  plagueStrength: [100, 300] as [number, number],
  plagueTimeout: 40,
  boomTurns: [10, 20] as [number, number],
  supernovaStrength: [200, 500] as [number, number],
  supernovaTurns: [10, 15] as [number, number],
  anomalyTurns: [5, 10] as [number, number],
  warpBeastTurns: [10, 20] as [number, number],
  /** Chance per turn the warp beast eats a ship from a fleet in hyperspace. */
  warpBeastStrike: 0.4,
  funnelTurns: [3, 6] as [number, number],
};
