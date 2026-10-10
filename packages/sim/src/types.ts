import type { RngState } from "./rng.js";
import type { HullSize } from "./data/components.js";
import type { Gravity, Minerals, PlanetSize, PlanetType, StarColor } from "./data/planets.js";
import type { Government } from "./data/races.js";
import type { TechField } from "./data/techs.js";

export type PlayerId = number;
export type Id = string;

export type GalaxySize = "small" | "medium" | "large" | "huge";

export interface GameSettings {
  galaxySize: GalaxySize;
  /** Race id per empire slot. */
  races: string[];
  humanPlayers: PlayerId[];
  maxTurns: number;
  /** Monsters guarding systems, Orion's guardian and the late-game raiders. */
  monsters: boolean;
  raiders: boolean;
  /** Galactic council elections as a victory path. */
  council: boolean;
}

export interface Star {
  id: Id;
  name: string;
  x: number;
  y: number;
  color: StarColor;
  planetIds: Id[];
  special: "orion" | "raiderHome" | null;
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
  | { kind: "project"; id: string; planetId?: Id }
  | { kind: "tradeGoods" };

export interface Colony {
  id: Id;
  planetId: Id;
  ownerId: PlayerId;
  /** Race of the people living here; conquered colonies keep their race. */
  raceId: string;
  name: string;
  /** Outposts hold no population and produce nothing, but claim the planet. */
  outpost: boolean;
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
  terraformed: number;
  /** Turn until which recently conquered people resent their rulers. */
  unrestUntil: number;
}

export interface ShipStack {
  designId: string;
  count: number;
}

export type FleetStance = "defend" | "attack";

export interface Fleet {
  id: Id;
  ownerId: PlayerId;
  x: number;
  y: number;
  /** Star the fleet is orbiting, or null while in transit. */
  starId: Id | null;
  destStarId: Id | null;
  ships: ShipStack[];
  /** Attack fleets engage enemy colonies at their star and bombard them. */
  stance: FleetStance;
  name: string;
  /** Colony this fleet's troops will invade once its defenses are down. */
  invadeTarget?: Id;
}

export interface WeaponMount {
  weaponId: string;
  count: number;
}

export type DesignModule = "colony" | "outpost" | "transport";

export interface ShipDesign {
  id: Id;
  name: string;
  hull: HullSize;
  armor: string;
  shield: string | null;
  computer: string | null;
  weapons: WeaponMount[];
  specials: string[];
  module: DesignModule | null;
  /** Hidden from build lists but kept for existing ships. */
  obsolete: boolean;
  /** Monster and raider designs set their stats directly. */
  fixed?: FixedStats;
}

export interface FixedStats {
  hits: number;
  attack: number;
  defense: number;
  shield: number;
  combatSpeed: number;
  weapons: WeaponMount[];
}

export type PlayerKind = "empire" | "monsters" | "raiders";

export type SpyMission = "steal" | "sabotage" | "idle";

export interface CombatDoctrine {
  /** Retreat when the fleet's strength falls below this fraction of the enemy's. */
  retreatBelow: number;
  focus: "nearest" | "weakest" | "strongest";
}

export interface Player {
  id: PlayerId;
  kind: PlayerKind;
  name: string;
  raceId: string;
  color: string;
  isHuman: boolean;
  alive: boolean;
  government: Government | AdvancedGovernment;
  bc: number;
  /** Fraction of industry collected as BC. */
  taxRate: number;
  techs: string[];
  tiers: string[];
  research: {
    /** Tier being researched and the tech chosen from it. */
    tierId: string | null;
    techChoice: string | null;
    progress: number;
  };
  explored: Id[];
  /** Other empires this one has met. */
  contacts: PlayerId[];
  homeStarId: Id;
  designs: ShipDesign[];
  spies: { home: number; abroad: Record<string, { count: number; mission: SpyMission }> };
  leaderOffers: Leader[];
  /** Empires this player votes for at the council; "self" and "abstain" are allowed. */
  councilVote: PlayerId | "abstain" | "auto";
  doctrine: CombatDoctrine;
  /** Areas a human has handed to automation; ignored for AI players. */
  automation: string[];
  hasPortal: boolean;
  eliminatedTurn: number | null;
}

export type AdvancedGovernment = "confederation" | "imperium" | "federation" | "galacticUnification";

export type LeaderKind = "administrator" | "captain";

export interface LeaderSkills {
  industry?: number;
  research?: number;
  food?: number;
  bc?: number;
  morale?: number;
  attack?: number;
  defense?: number;
  combatSpeed?: number;
}

export interface Leader {
  id: Id;
  name: string;
  kind: LeaderKind;
  level: number;
  skills: LeaderSkills;
  hireCost: number;
  /** BC per turn. */
  salary: number;
  ownerId: PlayerId | null;
  /** Star system for administrators, fleet for captains. */
  assignedTo: Id | null;
  /** Offer expires after this turn. */
  availableUntil: number;
}

export type DiplomaticStatus = "none" | "war" | "peace" | "alliance";

export interface Relation {
  status: DiplomaticStatus;
  trade: boolean;
  research: boolean;
  since: number;
}

export type ProposalKind = "peace" | "alliance" | "trade" | "research" | "ceasefire";

export interface Proposal {
  id: Id;
  from: PlayerId;
  to: PlayerId;
  kind: ProposalKind;
  turn: number;
}

export interface CombatShipSnapshot {
  key: string;
  ownerId: PlayerId;
  designId: string;
  name: string;
  maxHits: number;
  /** Starting battlefield position. */
  x: number;
  y: number;
  isPlanet: boolean;
}

export interface CombatRoundEvent {
  kind: "move" | "fire" | "destroyed" | "retreat";
  ship: string;
  target?: string;
  x?: number;
  y?: number;
  damage?: number;
  weapon?: string;
  hit?: boolean;
}

export interface CombatReport {
  id: Id;
  turn: number;
  starId: Id;
  sides: [PlayerId, PlayerId];
  ships: CombatShipSnapshot[];
  rounds: CombatRoundEvent[][];
  winner: PlayerId | null;
  losses: Record<string, number>;
}

export type VictoryKind = "conquest" | "council" | "raiders" | "score";

export type GameEvent =
  | { turn: number; kind: "colonyFounded"; playerId: PlayerId; colonyId: Id; planetId: Id }
  | { turn: number; kind: "techLearned"; playerId: PlayerId; techId: string; tierId: string; source?: "research" | "stolen" | "trade" | "salvage" | "event" }
  | { turn: number; kind: "built"; playerId: PlayerId; colonyId: Id; item: BuildItem }
  | { turn: number; kind: "starvation"; playerId: PlayerId; colonyId: Id }
  | { turn: number; kind: "explored"; playerId: PlayerId; starId: Id }
  | { turn: number; kind: "commandRejected"; playerId: PlayerId; reason: string }
  | { turn: number; kind: "combat"; playerId: PlayerId; reportId: Id; starId: Id; won: boolean }
  | { turn: number; kind: "colonyLost"; playerId: PlayerId; colonyId: Id; to: PlayerId | null; how: "invaded" | "destroyed" }
  | { turn: number; kind: "colonyCaptured"; playerId: PlayerId; colonyId: Id; from: PlayerId }
  | { turn: number; kind: "invasionFailed"; playerId: PlayerId; colonyId: Id }
  | { turn: number; kind: "bombarded"; playerId: PlayerId; colonyId: Id; popLost: number }
  | { turn: number; kind: "diplomacy"; playerId: PlayerId; other: PlayerId; what: string }
  | { turn: number; kind: "spy"; playerId: PlayerId; other: PlayerId; what: string }
  | { turn: number; kind: "leader"; playerId: PlayerId; leaderId: Id; what: string }
  | { turn: number; kind: "council"; playerId: PlayerId; what: string }
  | { turn: number; kind: "random"; playerId: PlayerId; what: string }
  | { turn: number; kind: "raid"; playerId: PlayerId; starId: Id }
  | { turn: number; kind: "eliminated"; playerId: PlayerId }
  | { turn: number; kind: "victory"; playerId: PlayerId; how: VictoryKind };

export interface CouncilState {
  nextTurn: number;
  lastResult: { turn: number; candidates: PlayerId[]; votes: Record<string, number>; winner: PlayerId | null } | null;
}

export interface GameState {
  version: 2;
  seed: string;
  rng: RngState;
  turn: number;
  settings: GameSettings;
  galaxy: { width: number; height: number; stars: Star[] };
  planets: Record<Id, Planet>;
  colonies: Record<Id, Colony>;
  fleets: Record<Id, Fleet>;
  players: Player[];
  /** Key `${a}-${b}` with a < b. */
  relations: Record<string, Relation>;
  /** attitude[a][b]: how a feels about b, -100..100. */
  attitude: Record<string, Record<string, number>>;
  proposals: Proposal[];
  leaders: Record<Id, Leader>;
  council: CouncilState;
  raiders: { nextRaid: number; defeated: boolean };
  /** Combats from the most recent turn, kept for replay. */
  combats: CombatReport[];
  /** Events produced by the most recent turn. */
  events: GameEvent[];
  nextId: number;
  winner: PlayerId | null;
  victory: VictoryKind | null;
  over: boolean;
}

export type { TechField };
