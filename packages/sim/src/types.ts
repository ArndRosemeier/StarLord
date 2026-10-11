import type { RngState } from "./rng.js";
import type { FiringArc, HullSize, WeaponModId } from "./data/components.js";
import type { Gravity, Minerals, PlanetSize, PlanetType, StarColor } from "./data/planets.js";
import type { Government, RaceDef } from "./data/races.js";
import type { TechField } from "./data/techs.js";
import type { HeroSkill } from "./data/leaders.js";

export type PlayerId = number;
export type Id = string;

export type GalaxySize = "small" | "medium" | "large" | "huge";

export interface GameSettings {
  galaxySize: GalaxySize;
  /** Race id per empire slot. */
  races: string[];
  humanPlayers: PlayerId[];
  /** Turn after which the highest score wins; 0 means no limit, as in the original. */
  maxTurns: number;
  /** Monsters guarding systems, Orion's guardian and the late-game raiders. */
  monsters: boolean;
  raiders: boolean;
  /** Galactic council elections as a victory path. */
  council: boolean;
  /** Player-built races in this game, so saves and replays carry their rules. */
  customRaces?: RaceDef[];
  /** AI production, research and attitude toward human players. Missing means "average". */
  difficulty?: Difficulty;
  /** Star colour mix: young galaxies are hot and mineral rich, old ones cool and fertile. */
  galaxyAge?: GalaxyAge;
  /** Starting civilization: pre-warp, average or advanced. */
  techLevel?: TechLevel;
  /** Random events (disasters, windfalls, invading monsters). Missing means on. */
  randomEvents?: boolean;
  /**
   * The original's "ship initiative" option: in battle every unit of both
   * sides acts in order of combat speed + beam attack / 10, instead of the
   * attacker's whole side first. Missing means off.
   */
  shipInitiative?: boolean;
  /** Started with Ctrl+Alt held: the debug menu's commands are allowed. */
  debug?: boolean;
}

export type Difficulty = "tutor" | "easy" | "average" | "hard" | "impossible";
export type GalaxyAge = "young" | "average" | "old";
export type TechLevel = "preWarp" | "average" | "advanced";

/** One-time or system-wide specials found when a system is first explored. */
export type SystemFeature = "cache" | "debris" | "hero" | "wormhole";

export interface Star {
  id: Id;
  name: string;
  x: number;
  y: number;
  color: StarColor;
  planetIds: Id[];
  special: "orion" | "raiderHome" | null;
  /** The system's special, if it is a system-wide one (planet specials sit on the planet). */
  feature?: SystemFeature;
  /** Other end of this system's stable wormhole. */
  wormholeTo?: Id;
  /** Inside a nebula: ships crawl at 1 parsec per turn and only hard shields work in combat. */
  nebula?: boolean;
}

/** A nebula cloud on the galaxy map. */
export interface Nebula {
  x: number;
  y: number;
  r: number;
}

export interface Planet {
  id: Id;
  starId: Id;
  orbit: number;
  type: PlanetType;
  size: PlanetSize;
  minerals: Minerals;
  gravity: Gravity;
  special: "none" | "artifacts" | "gold" | "gems" | "natives" | "splinter";
  colonyId: Id | null;
  /** Native population units living here before anyone settles (natives special). */
  natives?: number;
  /** Set once an empire has colonized an artifacts planet and taken its breakthrough. */
  artifactsClaimed?: boolean;
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
  /** No longer used: conquered people now assimilate instead (see `aliens`). Kept for old saves. */
  unrestUntil: number;
  /** Population units not yet assimilated after a conquest; they produce half and may revolt. */
  aliens?: number;
  /** Turns spent assimilating the next alien unit. */
  assimilation?: number;
  /** Empire the colony was taken from, which revolting aliens return it to. */
  formerOwnerId?: PlayerId;
  /**
   * Native farmers counted among the farmers; they never change jobs and
   * farm at +2 food.
   */
  natives?: number;
  /** Android population units by job; they count toward max population but eat no food. */
  androids?: AndroidCounts;
  /** Marines and tank battalions trained by the barracks beyond the ones present when built. */
  marinesTrained?: number;
  tanksTrained?: number;
  /**
   * Finished Colony Bases, Outpost Bases and Artificial Planets (project ids)
   * waiting for the owner to pick which planet in the system they go to.
   */
  readyBases?: string[];
  /** A Dimensional Portal stands here: fleets in this system can strike at the raiders' home. */
  portal?: boolean;
}

export interface AndroidCounts {
  farmers: number;
  workers: number;
  scientists: number;
}

/** Colonists carried by freighters to another colony of the same race. */
export interface ColonistTransfer {
  fromColonyId: Id;
  toColonyId: Id;
  raceId: string;
  count: number;
  /** Turn on whose economy phase they arrive. */
  arrives: number;
}

export interface ShipStack {
  designId: string;
  count: number;
  /** Crew experience the stack shares; missing means a green crew. */
  xp?: number;
  /**
   * Hit points (armor, then structure) each damaged ship of the stack has
   * lost, one entry per damaged ship; the rest are intact. Damage stays until
   * the ship is repaired.
   */
  damage?: number[];
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
  /** Star the fleet last left, for jump gates between your own colonies. */
  fromStarId?: Id;
  /** Fixed speed in parsecs per turn for monsters roaming the galaxy. */
  speed?: number;
}

export interface WeaponMount {
  weaponId: string;
  count: number;
  /** Weapon modifications (heavy mount, point defense, autofire …). */
  mods?: WeaponModId[];
  /** Beams fire forward unless given a wider arc; missiles and stations always fire all round. */
  arc?: FiringArc;
  /** Missile rack size: shots per battle (2, 5, 10, 15 or 20). */
  ammo?: number;
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
  /** Monster designs and the raiders' citadel set their stats directly. */
  fixed?: FixedStats;
  /** Owner of the ship this design was copied from when boarders took it; scrapping one can teach its technology. */
  capturedFrom?: PlayerId;
  /** Look of the ship (a ship style id); unset means the owner's race style. Purely visual. */
  style?: string;
}

export interface FixedStats {
  /** Structure points; monsters have no armor layer unless given one. */
  hits: number;
  armor?: number;
  /** Beam attack and beam defense. */
  attack: number;
  defense: number;
  /** Damage taken off every hit. */
  shield: number;
  /** Strength of each shield facing (0: the shield class alone). */
  shieldStrength?: number;
  /** Squares per combat turn. */
  combatSpeed: number;
  weapons: WeaponMount[];
  missileEvasion?: number;
  sizeClass?: number;
  /** Fights as an immobile fortress, like an orbital station. */
  immobile?: boolean;
  /** Crew level (index into CREW); monsters have none. */
  crew?: number;
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
  /** Hyper-advanced levels researched per category; each improves miniaturization in that category. */
  hyperLevels: Record<TechField, number>;
  /** Unspent race pick points from Evolutionary Mutation. */
  mutationPoints: number;
  explored: Id[];
  /** Other empires this one has met. */
  contacts: PlayerId[];
  homeStarId: Id;
  designs: ShipDesign[];
  spies: { home: number; abroad: Record<string, { count: number; mission: SpyMission }> };
  /** Heroes offering their services to this empire (copies kept current by the turn; the roster is in GameState.leaders). */
  leaderOffers: Leader[];
  /** Turn of the last hero offer, which sets the chance of the next. */
  lastLeaderOffer?: number;
  /** Diplomatic points from race and leaders, public so rivals' deal-making can read it. */
  diplomacyBonus?: number;
  /** Empires this player votes for at the council; "self" and "abstain" are allowed. */
  councilVote: PlayerId | "abstain" | "auto";
  doctrine: CombatDoctrine;
  /** Areas a human has handed to automation; ignored for AI players. */
  automation: string[];
  /** Strategy each automated area follows, by area; areas not listed play the balanced strategy. */
  automationStrategies?: Record<string, string>;
  /** Whether any colony of the empire has a Dimensional Portal (kept in step with `Colony.portal`). */
  hasPortal: boolean;
  eliminatedTurn: number | null;
  /** Freighter ships owned; they carry food and colonists. */
  freighters?: number;
  /** Colonists in transit. */
  transfers?: ColonistTransfer[];
  /** Whether the empire still holds its Capitol. Unset for empires that never had one. */
  capitol?: "held" | "lost";
}

export type AdvancedGovernment = "confederation" | "imperium" | "federation" | "galacticUnification";

export type LeaderKind = "administrator" | "captain";

/**
 * What a leader does where they serve, derived from their skills and level
 * (see leaders.ts). Administrators' numbers apply to every colony in their
 * system, captains' to their fleet. Percentages are whole numbers.
 */
export interface LeaderSkills {
  /** Administrator: % more industry, research, food and BC, morale points (%). */
  industry?: number;
  research?: number;
  food?: number;
  bc?: number;
  morale?: number;
  /** Administrator: % less pollution, % faster growth, initiative for own ships in the system. */
  pollution?: number;
  growth?: number;
  initiative?: number;
  /** Captain: beam attack and defense points for the fleet. */
  attack?: number;
  defense?: number;
  /** Combat speed for the fleet (no original skill gives it; kept for older saves). */
  combatSpeed?: number;
  /** Captain: parsecs per turn added to the fleet's galaxy speed; nebulae don't slow it. */
  galaxySpeed?: number;
  /** Captain: % faster shield recharge; full repair after battle. */
  shieldRecharge?: number;
  /** Captain: attack and defense for the fleet's fighters. */
  fighters?: number;
  /** Captain: attack and defense against monsters and raiders. */
  monsterBonus?: number;
  /** Captain: % more maximum weapon damage. */
  maxDamage?: number;
  /** Captain: points for the fleet's marines defending against boarders. */
  boardingDefense?: number;
  /** Either: ground combat points for own troops in the leader's system (Commando). */
  groundCombat?: number;
}

export interface LeaderAbility {
  skill: HeroSkill;
  /** The improved ("starred") version of the skill. */
  improved: boolean;
}

/** Where a hero stands: waiting to be offered, offered to one empire, in an empire's service. */
/** "dead": killed with their ship; they never come back. */
export type LeaderStatus = "pool" | "offered" | "hired" | "dead";

export interface Leader {
  id: Id;
  /** Index into HEROES. */
  heroId: number;
  name: string;
  title: string;
  kind: LeaderKind;
  xp: number;
  /** Level 1-5, or 6 with the Warlord trait, from experience. */
  level: number;
  abilities: LeaderAbility[];
  /** Applications the leader teaches the empire that hires them. */
  techs: string[];
  /** Effects where the leader serves, recomputed from abilities and level. */
  skills: LeaderSkills;
  hireCost: number;
  /** BC per turn; negative when the leader pays into the treasury (Megawealth). */
  salary: number;
  status: LeaderStatus;
  /** Empire the hero is offered to while status is "offered". */
  offeredTo: PlayerId | null;
  ownerId: PlayerId | null;
  /** Star system for administrators, fleet for captains. */
  assignedTo: Id | null;
  /** Post the leader is travelling to, and the turn they arrive. */
  travel: { to: Id; arrives: number } | null;
  /** An offer waits in the hiring queue until this turn. */
  availableUntil: number;
}

/** none = no treaty; peace = a signed peace treaty; nonAggression = pact; alliance. */
export type DiplomaticStatus = "none" | "war" | "peace" | "nonAggression" | "alliance";

export interface Relation {
  status: DiplomaticStatus;
  trade: boolean;
  research: boolean;
  /** Turn the status last changed. */
  since: number;
  /** Turns the trade and research treaties were signed; their yield ramps up from a loss. */
  tradeSince?: number;
  researchSince?: number;
  /** Only in games saved before peace treaties lapsed by the no-war counter (see GameState.noWar); read once to carry them over. */
  peaceUntil?: number;
}

export type ProposalKind =
  | "peace" | "ceasefire" | "nonAggression" | "alliance" | "trade" | "research"
  /** One-for-one swap: the proposer gives techId and asks for wantTechId. */
  | "techExchange"
  /** Demands the receiver may accept or refuse. */
  | "demandTribute" | "demandTech" | "demandSystem" | "demandWar" | "demandPeace" | "demandBreakAlliance"
  | "demandStopSpying" | "demandRemoveFleet"
  /** A computer ruler with two strikes against you asks this price (in `price`) to keep its treaties; refusing ends them. */
  | "compensation";

/** What one empire pays another, as the price of a treaty. */
export interface Price {
  bc?: number;
  techId?: string;
  /** A standing tribute of this percentage. */
  tribute?: number;
  starId?: Id;
}

export interface Proposal {
  id: Id;
  from: PlayerId;
  to: PlayerId;
  kind: ProposalKind;
  turn: number;
  techId?: string;
  wantTechId?: string;
  starId?: Id;
  /** Third empire named by a war, peace or alliance demand. */
  third?: PlayerId;
  /** Tribute percentage (5 or 10). */
  percent?: number;
  /** A price the proposer asks of the receiver for signing (a counter-offer). */
  price?: Price;
  /** The listener's d100 for its answer, fixed when the proposal is made. */
  roll?: number;
  /** The listener's patience with the proposer just before this ask. */
  patience?: number;
}

/** Standing tribute: `from` pays `percent` of its income to `to` every turn. */
export interface Tribute {
  from: PlayerId;
  to: PlayerId;
  percent: number;
}

/** A random event or invading monster still in progress. */
export interface ActiveEvent {
  id: Id;
  kind: string;
  playerId?: PlayerId;
  colonyId?: Id;
  starId?: Id;
  fleetId?: Id;
  planetId?: Id;
  /** Last turn the event lasts (inclusive). */
  until: number;
  /** Comet hit points, plague or supernova research needed, bribe asked… */
  strength?: number;
  progress?: number;
  /** Original planet climate for a temporary change. */
  restore?: string;
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
  /** What the unit is: a ship, an immobile orbital station, or the planet with its ground defenses. */
  kind?: "ship" | "station" | "planet" | "monster";
  /** Hull id for ships and stations (frigate … doomStar, starBase, battlestation, starFortress), for picking a 3D model. */
  hullId?: string;
  /** MoO2 size class (frigate 1 … doom star 7, stations 8-10); scales the model. */
  sizeClass?: number;
  /** Ship style of a ship's design, for picking its model family. */
  shipStyle?: string;
  /** Damage layers, when the combat model tracks them separately. maxHits is their sum. */
  maxArmor?: number;
  maxStructure?: number;
  /** Armor and structure at the start when the unit came in already damaged. */
  armor?: number;
  structure?: number;
  /** Shield points per facing at the start of the battle. */
  maxShield?: number;
}

export interface CombatRoundEvent {
  /** Viewers must ignore kinds they don't know. */
  /**
   * "captured": boarders took `ship` for the owner of `target`; `hit` is true when the prize fights on for its
   * captor (a telepathic captor), otherwise it sits out the rest of the battle.
   */
  kind: "move" | "fire" | "destroyed" | "retreat" | "launch" | "board" | "repair" | "captured";
  ship: string;
  target?: string;
  x?: number;
  y?: number;
  damage?: number;
  weapon?: string;
  hit?: boolean;
  /** Damage split of a hit: soaked by shields, taken by armor, by structure. */
  absorbed?: number;
  armorDamage?: number;
  structureDamage?: number;
  /** Internal system knocked out by the hit (drive, computer, shield, weapon id, special id). */
  systemHit?: string;
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
  | { turn: number; kind: "hyperAdvance"; playerId: PlayerId; field: TechField; level: number }
  | { turn: number; kind: "built"; playerId: PlayerId; colonyId: Id; item: BuildItem }
  | { turn: number; kind: "starvation"; playerId: PlayerId; colonyId: Id }
  /** A finished base has several possible planets; the owner must pick one (placeBase). */
  | { turn: number; kind: "baseReady"; playerId: PlayerId; colonyId: Id; projectId: string }
  /** A finished base had no planet left to use; it was scrapped and paid back `refund` BC. */
  | { turn: number; kind: "baseScrapped"; playerId: PlayerId; colonyId: Id; projectId: string; refund: number }
  | { turn: number; kind: "explored"; playerId: PlayerId; starId: Id }
  | { turn: number; kind: "commandRejected"; playerId: PlayerId; reason: string }
  | { turn: number; kind: "combat"; playerId: PlayerId; reportId: Id; starId: Id; won: boolean }
  | { turn: number; kind: "colonyLost"; playerId: PlayerId; colonyId: Id; to: PlayerId | null; how: "invaded" | "destroyed" | "revolted" }
  | { turn: number; kind: "colonyCaptured"; playerId: PlayerId; colonyId: Id; from: PlayerId }
  | { turn: number; kind: "invasionFailed"; playerId: PlayerId; colonyId: Id }
  | { turn: number; kind: "bombarded"; playerId: PlayerId; colonyId: Id; popLost: number }
  | { turn: number; kind: "diplomacy"; playerId: PlayerId; other: PlayerId; what: string }
  | { turn: number; kind: "spy"; playerId: PlayerId; other: PlayerId; what: string }
  | { turn: number; kind: "leader"; playerId: PlayerId; leaderId: Id; what: string }
  | { turn: number; kind: "council"; playerId: PlayerId; what: string }
  | { turn: number; kind: "random"; playerId: PlayerId; what: string; starId?: Id }
  | { turn: number; kind: "raid"; playerId: PlayerId; starId: Id }
  /** Everyone hears when an empire destroys the raiders at home and the galaxy capitulates. */
  | { turn: number; kind: "raidersDefeated"; playerId: PlayerId; by: PlayerId }
  | { turn: number; kind: "eliminated"; playerId: PlayerId }
  | { turn: number; kind: "victory"; playerId: PlayerId; how: VictoryKind };

export interface CouncilState {
  nextTurn: number;
  lastResult: { turn: number; candidates: PlayerId[]; votes: Record<string, number>; winner: PlayerId | null } | null;
  /** An elected leader awaiting acceptance; any empire may refuse during the next turn. */
  pending?: { winner: PlayerId; turn: number; refused: PlayerId[] } | null;
  /** Whether the council has started meeting (it first meets once most of the galaxy is settled). */
  convened?: boolean;
  /** Who each empire backed at the last session (null: abstained). */
  lastVotes?: Record<string, PlayerId | null>;
}

export interface RaidersState {
  /** End of the grace period: the raiders' budgets grow from here. Infinity without raiders. */
  nextRaid: number;
  defeated: boolean;
  /** Build points not yet spent on raid ships. */
  budget?: number;
  /** Build points not yet spent on the home fleet. */
  homeBudget?: number;
  /** Raid ships owned, by hull, including those out on a raid. */
  pool?: Partial<Record<HullSize, number>>;
  /** Raid ships out on a raid this turn, by hull. */
  deployed?: Partial<Record<HullSize, number>>;
  /** Home fleet ships, by hull. */
  home?: Partial<Record<HullSize, number>>;
  /** Raid pool cap per hull; the small hulls' caps drop to 0 for good once reached. */
  caps?: Partial<Record<HullSize, number>>;
  /** Hull prices have been cut (Hard and Impossible, once the first titan is bought). */
  discounted?: boolean;
  /** Launch counter: each turn raid ships wait with the launch gate open makes the launch likelier. */
  launch?: number;
  /** Turn of the last raid. */
  lastRaid?: number;
  /** Empire that destroyed the raiders at home. */
  defeatedBy?: PlayerId;
  /** Empire the next raid goes for, set by the debug menu; cleared once the raid launches. */
  forcedTarget?: PlayerId;
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
  /** attitude[a][b]: the relation between a and b as a sees it, -100..100; kept equal on both sides at the end of every turn. */
  attitude: Record<string, Record<string, number>>;
  /** baseline[a][b]: the relation a's view drifts back toward (the race table, moved by wars, gifts and broken treaties). Missing: the race table. */
  baseline?: Record<string, Record<string, number>>;
  /** noWar[a][b]: turns computer empire a will not declare war on b; a peace treaty lapses when the lower-numbered side's count runs out. */
  noWar?: Record<string, Record<string, number>>;
  /** strikes[a][b]: warnings computer empire a holds against b. */
  strikes?: Record<string, Record<string, number>>;
  /** shipLosses[a][b]: what a lost to b's ships in the current war (2 to the power of hull size + 1 per ship). */
  shipLosses?: Record<string, Record<string, number>>;
  /** relationEvents[observer][actor]: the biggest relation event since the last diplomacy tick (it holds drift back and can earn a strike). */
  relationEvents?: Record<string, Record<string, { reason: number; size: number }>>;
  /** treatyYields[a][b]: what a's trade (BC) and research treaties with b yield a this turn; they ramp toward the full value. */
  treatyYields?: Record<string, Record<string, { trade?: number; research?: number }>>;
  /** audienceClock[a][b]: turns since a last came to b with a proposal (capped at 250). */
  audienceClock?: Record<string, Record<string, number>>;
  /** deficitTurns[a]: turns in a row a's treasury shrank. */
  deficitTurns?: Record<string, number>;
  /** patience[a][b]: how much more a will hear from b (0 at rest, lower after asks). */
  patience?: Record<string, Record<string, number>>;
  /** trust[a][b]: a's trust in b, lowered when b breaks a treaty with a. */
  trust?: Record<string, Record<string, number>>;
  /** reputation[a][b]: what a has heard of b's faithfulness, lowered when b breaks treaties with others. */
  reputation?: Record<string, Record<string, number>>;
  /** dishonored[a]: empires that broke faith with a. */
  dishonored?: Record<string, PlayerId[]>;
  /** asks[a][b][kind]: a's tally of asking b, per proposal kind. */
  asks?: Record<string, Record<string, Record<string, number>>>;
  proposals: Proposal[];
  leaders: Record<Id, Leader>;
  council: CouncilState;
  raiders: RaidersState;
  /** The empire that slew Orion's guardian. */
  guardianSlainBy?: PlayerId;
  /** Nebula clouds drawn on the map; stars inside carry `nebula`. */
  nebulae?: Nebula[];
  tributes?: Tribute[];
  activeEvents?: ActiveEvent[];
  /**
   * Turn the last random event struck, each lucky empire's count toward a
   * bonus windfall, and the kinds of event already used (each happens once a game).
   */
  eventClock?: { last: number; luck: Record<string, number>; used?: string[] };
  /** Empires that ordered a surrender this turn, mapped to who receives them. */
  surrenders?: Record<string, PlayerId>;

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
