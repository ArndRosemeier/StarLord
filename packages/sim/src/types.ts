import type { RngState } from "./rng.js";
import type { Gravity, Minerals, PlanetSize, PlanetType, StarColor } from "./data/planets.js";
import type { TechField } from "./data/techs.js";

export type PlayerId = number;
export type Id = string;

export type GalaxySize = "small" | "medium" | "large" | "huge";

export interface GameSettings {
  galaxySize: GalaxySize;
  /** Race id per player slot; the first slot is the human unless all are AI. */
  races: string[];
  humanPlayers: PlayerId[];
  maxTurns: number;
}

export interface Star {
  id: Id;
  name: string;
  x: number;
  y: number;
  color: StarColor;
  planetIds: Id[];
}

export interface Planet {
  id: Id;
  starId: Id;
  orbit: number;
  type: PlanetType;
  size: PlanetSize;
  minerals: Minerals;
  gravity: Gravity;
  special: "none" | "artifacts" | "gold" | "gems" | "natives";
  colonyId: Id | null;
}

export type BuildItem =
  | { kind: "building"; id: string }
  | { kind: "ship"; designId: string }
  | { kind: "tradeGoods" };

export interface Colony {
  id: Id;
  planetId: Id;
  ownerId: PlayerId;
  name: string;
  /** Whole population units; each unit works one job. */
  farmers: number;
  workers: number;
  scientists: number;
  /** Thousands of extra people towards the next unit (0..1000). */
  growthK: number;
  buildings: string[];
  queue: BuildItem[];
  /** Industry already spent on the head of the queue. */
  progress: number;
  founded: number;
}

export interface ShipStack {
  designId: string;
  count: number;
}

export interface Fleet {
  id: Id;
  ownerId: PlayerId;
  x: number;
  y: number;
  /** Star the fleet is orbiting, or null while in transit. */
  starId: Id | null;
  destStarId: Id | null;
  ships: ShipStack[];
}

export interface Player {
  id: PlayerId;
  name: string;
  raceId: string;
  color: string;
  isHuman: boolean;
  alive: boolean;
  bc: number;
  /** Known techs (applications) and researched tiers. */
  techs: string[];
  tiers: string[];
  research: {
    /** Tier being researched and the tech chosen from it. */
    tierId: string | null;
    techChoice: string | null;
    progress: number;
  };
  explored: Id[];
  homeStarId: Id;
}

export type GameEvent =
  | { turn: number; kind: "colonyFounded"; playerId: PlayerId; colonyId: Id; planetId: Id }
  | { turn: number; kind: "techLearned"; playerId: PlayerId; techId: string; tierId: string }
  | { turn: number; kind: "built"; playerId: PlayerId; colonyId: Id; item: BuildItem }
  | { turn: number; kind: "starvation"; playerId: PlayerId; colonyId: Id }
  | { turn: number; kind: "explored"; playerId: PlayerId; starId: Id }
  | { turn: number; kind: "commandRejected"; playerId: PlayerId; reason: string };

export interface GameState {
  version: 1;
  seed: string;
  rng: RngState;
  turn: number;
  settings: GameSettings;
  galaxy: { width: number; height: number; stars: Star[] };
  planets: Record<Id, Planet>;
  colonies: Record<Id, Colony>;
  fleets: Record<Id, Fleet>;
  players: Player[];
  /** Events produced by the most recent turn. */
  events: GameEvent[];
  nextId: number;
  winner: PlayerId | null;
  over: boolean;
}

export type { TechField };
