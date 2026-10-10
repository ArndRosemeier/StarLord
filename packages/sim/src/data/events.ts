/**
 * Random events, after the original's Galactic News list. The original gives
 * no frequencies or magnitudes; the numbers here are ours. "bad" events never
 * strike lucky races, and lucky races are twice as likely to get good ones.
 */

export type EventId =
  | "derelict" | "axisShift" | "comet" | "computerVirus" | "assassination" | "diplomaticMarriage" | "donation"
  | "earthquake" | "shipExplosion" | "hyperspaceFlux" | "industrialAccident" | "mineralDepletion" | "mineralDeposit"
  | "mutiny" | "pirates" | "plague" | "populationBoom" | "breakthrough" | "supernova" | "timeSpaceAnomaly"
  | "warpBeast" | "warpFunnel" | "unstableWormhole"
  | "amoeba" | "crystal" | "dragon" | "eel" | "hydra";

export interface EventDef {
  weight: number;
  /** Disasters spare lucky races; good events favour them. */
  mood: "good" | "bad" | "neutral";
  /** Strikes the whole galaxy rather than one empire. */
  global?: boolean;
  /** Needs the monsters setting. */
  monster?: boolean;
}

export const EVENTS: Record<EventId, EventDef> = {
  derelict: { weight: 4, mood: "good" },
  axisShift: { weight: 2, mood: "good" },
  donation: { weight: 4, mood: "good" },
  mineralDeposit: { weight: 3, mood: "good" },
  populationBoom: { weight: 3, mood: "good" },
  breakthrough: { weight: 3, mood: "good" },
  diplomaticMarriage: { weight: 2, mood: "good" },
  comet: { weight: 3, mood: "bad" },
  computerVirus: { weight: 3, mood: "bad" },
  assassination: { weight: 2, mood: "bad" },
  earthquake: { weight: 3, mood: "bad" },
  shipExplosion: { weight: 3, mood: "bad" },
  hyperspaceFlux: { weight: 2, mood: "neutral", global: true },
  industrialAccident: { weight: 2, mood: "bad" },
  mineralDepletion: { weight: 3, mood: "bad" },
  mutiny: { weight: 2, mood: "bad" },
  pirates: { weight: 3, mood: "bad" },
  plague: { weight: 3, mood: "bad" },
  supernova: { weight: 1, mood: "bad" },
  timeSpaceAnomaly: { weight: 2, mood: "bad" },
  warpBeast: { weight: 2, mood: "neutral", global: true },
  warpFunnel: { weight: 2, mood: "bad" },
  unstableWormhole: { weight: 2, mood: "neutral" },
  amoeba: { weight: 1, mood: "bad", monster: true },
  crystal: { weight: 1, mood: "bad", monster: true },
  dragon: { weight: 1, mood: "bad", monster: true },
  eel: { weight: 1, mood: "bad", monster: true },
  hydra: { weight: 1, mood: "bad", monster: true },
};

/** Chance per turn that something happens, from EVENT_START on. */
export const EVENT_CHANCE = 0.06;
export const EVENT_START = 20;

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
  plagueKillChance: 0.5,
  plagueTimeout: 40,
  boomTurns: [10, 20] as [number, number],
  boomGrowthMult: 2,
  supernovaStrength: [200, 500] as [number, number],
  supernovaTurns: [10, 15] as [number, number],
  anomalyTurns: [5, 10] as [number, number],
  warpBeastTurns: [10, 20] as [number, number],
  /** Chance per turn the warp beast eats a ship from a fleet in hyperspace. */
  warpBeastStrike: 0.4,
  funnelTurns: [3, 6] as [number, number],
};
