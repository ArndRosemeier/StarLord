/**
 * Leaders: a fixed roster of heroes who offer their services over the game,
 * after the original's hero table. Names and titles are StarLord's own; type,
 * starting experience, skills (normal or improved) and the technologies each
 * hero brings mirror the original records, as do the skill magnitudes, the
 * experience levels and the hiring rules decoded from the original program.
 */

export type HeroSkill =
  | "assassin" | "commando" | "diplomat" | "famous" | "megawealth" | "operations" | "researcher" | "spyMaster" | "telepath" | "trader"
  | "engineer" | "fighterPilot" | "galacticLore" | "helmsman" | "navigator" | "ordnance" | "security" | "weaponry"
  | "environmentalist" | "farmingLeader" | "financialLeader" | "instructor" | "laborLeader" | "medicine" | "scienceLeader"
  | "spiritualLeader" | "tactics";

/** Common skills work for either kind of leader; the others only for captains (ship) or administrators (colony). */
export type HeroSkillGroup = "common" | "ship" | "colony";

export interface HeroSkillDef {
  name: string;
  group: HeroSkillGroup;
  /**
   * Value per level in tenths, normal and improved: the skill is worth
   * floor(steps * mult / 10), where steps is the level, or the level halved
   * (rounded up) for skills with `halfLevels`.
   */
  mult: [number, number];
  halfLevels?: boolean;
  /** Hiring-price weight of the skill, normal and improved. */
  weight: [number, number];
  /** What one point of the value means; `{v}` is replaced by the value. */
  text: string;
}

export const HERO_SKILLS: Record<HeroSkill, HeroSkillDef> = {
  assassin: { name: "Assassin", group: "common", mult: [30, 45], weight: [2, 4], text: "{v}% chance each turn to kill an enemy spy in your empire." },
  commando: { name: "Commando", group: "common", mult: [20, 30], weight: [3, 6], text: "+{v} ground combat for all your troops in the same system, on planets and ships." },
  diplomat: { name: "Diplomat", group: "common", mult: [100, 150], weight: [1, 2], text: "+{v} diplomatic points in every negotiation." },
  famous: { name: "Famous", group: "common", mult: [600, 900], weight: [2, 4], text: "Other leaders apply more often and cost {v} BC less to hire." },
  megawealth: { name: "Megawealth", group: "common", mult: [100, 100], weight: [1, 2], text: "Needs no upkeep and pays {v} BC into the treasury each turn." },
  operations: { name: "Operations", group: "common", mult: [20, 30], weight: [2, 4], text: "+{v} command points." },
  researcher: { name: "Researcher", group: "common", mult: [50, 75], weight: [2, 4], text: "+{v} research points each turn." },
  spyMaster: { name: "Spy Master", group: "common", mult: [20, 30], weight: [3, 6], text: "+{v} on the rolls of all your spies abroad." },
  telepath: { name: "Telepath", group: "common", mult: [20, 30], weight: [2, 4], text: "+{v} on the rolls of all your spies defending at home." },
  trader: { name: "Trader", group: "common", mult: [100, 150], weight: [2, 4], text: "+{v}% income from trade treaties." },
  engineer: { name: "Engineer", group: "ship", mult: [20, 30], weight: [3, 6], text: "Shields recharge {v}% faster; repairs all damage after a battle." },
  fighterPilot: { name: "Fighter Pilot", group: "ship", mult: [50, 75], weight: [3, 6], text: "+{v} attack and defense for the fleet's fighters." },
  galacticLore: { name: "Galactic Lore", group: "ship", mult: [50, 75], weight: [2, 4], text: "Knows every star system; +{v} attack and defense against monsters and raiders." },
  helmsman: { name: "Helmsman", group: "ship", mult: [50, 75], weight: [4, 8], text: "+{v} beam defense for the fleet." },
  navigator: { name: "Navigator", group: "ship", mult: [10, 15], halfLevels: true, weight: [1, 2], text: "Fleet moves +{v} parsecs per turn and ignores nebulae." },
  ordnance: { name: "Ordnance", group: "ship", mult: [50, 75], weight: [3, 6], text: "+{v}% maximum weapon damage for the fleet." },
  security: { name: "Security", group: "ship", mult: [20, 30], weight: [1, 2], text: "+{v} for the fleet's marines against boarders." },
  weaponry: { name: "Weaponry", group: "ship", mult: [50, 75], weight: [3, 6], text: "+{v} beam attack for the fleet." },
  environmentalist: { name: "Environmentalist", group: "colony", mult: [100, 150], weight: [2, 4], text: "-{v}% pollution in the system." },
  farmingLeader: { name: "Farming Leader", group: "colony", mult: [100, 150], weight: [3, 6], text: "+{v}% food in the system." },
  financialLeader: { name: "Financial Leader", group: "colony", mult: [100, 150], weight: [3, 6], text: "+{v}% BC income in the system." },
  instructor: { name: "Instructor", group: "colony", mult: [10, 15], weight: [1, 2], text: "+{v} experience per turn for every leader and crew; only the best instructor counts." },
  laborLeader: { name: "Labor Leader", group: "colony", mult: [100, 150], weight: [3, 6], text: "+{v}% industry in the system." },
  medicine: { name: "Medicine", group: "colony", mult: [100, 150], weight: [2, 4], text: "+{v}% population growth in the system." },
  scienceLeader: { name: "Science Leader", group: "colony", mult: [100, 150], weight: [3, 6], text: "+{v}% research in the system." },
  spiritualLeader: { name: "Spiritual Leader", group: "colony", mult: [50, 75], weight: [4, 8], text: "+{v}% morale in the system." },
  tactics: { name: "Tactics", group: "colony", mult: [20, 30], weight: [2, 4], text: "+{v} initiative for your ships in the system." },
};

/** Commando's hiring weight depends on the leader: ship officers pay full, colony leaders a third. */
export const COMMANDO_ADMIN_WEIGHT: [number, number] = [1, 2];

/** Experience needed for each level (level 1 at 0). The top level needs the Warlord trait. */
export const LEVEL_XP = [0, 60, 150, 300, 500, 1000];
export const MAX_LEVEL = 5;
export const WARLORD_MAX_LEVEL = 6;

export const LEADER_RULES = {
  /** No offers before this turn. */
  firstOfferTurn: 5,
  /** At most this many hired leaders of each kind, and in total. */
  maxPerKind: 4,
  maxTotal: 8,
  /** Offer chance in % per turn: turns since the last offer + 1, plus these, divided by hired leaders + 1. */
  charismaticOfferBonus: 5,
  repulsiveOfferBonus: -10,
  /** Famous leaders add their level (improved: 1.5x) to the offer chance. */
  famousOfferPerLevel: [1, 1.5] as [number, number],
  /** Heroes are drawn from the first (turn / poolTurns + poolBase) of the roster; charismatic widens it, repulsive halves it. */
  poolBase: 10,
  poolTurns: 5,
  charismaticPool: 10,
  repulsivePoolDivisor: 2,
  pickTries: 100,
  /** A rejected offer waits this many turns in the hiring queue. */
  queueTurns: 30,
  /** Turns a leader needs to reach a post in another system. */
  travelTurns: 5,
  /** Experience every hired leader gains each turn. */
  xpPerTurn: 1,
  /** Hiring price = sum of skill weights x level x this, doubled for Megawealth, minus the best Famous discount. */
  costPerWeightLevel: 10,
  megawealthCostMult: 2,
  /** Upkeep per turn = hiring price / this, rounded up, at least 1 (none with Megawealth). */
  upkeepDivisor: 100,
  /** Hiring price multipliers from race traits (the original's help text: half for charismatic, +50% for repulsive). */
  charismaticCostMult: 0.5,
  repulsiveCostMult: 1.5,
  /** Hiring weight of a technology a hero brings, by field cost: below 1000, below 5000, above. */
  techWeight: [[1000, 1], [5000, 3], [Infinity, 4]] as [number, number][],
  /** Heroes with random skills roll this many; each is a common skill with this chance, improved half the time. */
  randomSkillCount: 5,
  randomCommonChance: 2 / 7,
} as const;

export interface HeroDef {
  name: string;
  title: string;
  kind: "captain" | "administrator";
  xp: number;
  skills: string[];
  techs?: string[];
  /** Gets random skills at the start of each game. */
  randomSkills?: boolean;
  /** Never offered; joins through a deed instead. */
  special?: "guardian" | "raiders";
}

/** "skill*" is the improved version. Order is the original's: later heroes appear later in the game. */
export const HEROES: HeroDef[] = [
  { name: "Tavik Orrun", title: "Gunnery Officer", kind: "captain", xp: 0, skills: ["weaponry"] },
  { name: "Mela Dunsparrow", title: "Harvest Steward", kind: "administrator", xp: 0, skills: ["farmingLeader"] },
  { name: "Corso Lint", title: "Wing Leader", kind: "captain", xp: 0, skills: ["fighterPilot"] },
  { name: "Hadd Burrock", title: "Marine Sergeant", kind: "captain", xp: 0, skills: ["commando", "security"] },
  { name: "Iselle Marr", title: "Lab Director", kind: "administrator", xp: 0, skills: ["scienceLeader"] },
  { name: "Peregrin Dask", title: "Star Pilot", kind: "captain", xp: 0, skills: ["helmsman", "navigator"] },
  { name: "Bolo Krane", title: "Works Foreman", kind: "administrator", xp: 0, skills: ["laborLeader"] },
  { name: "Tinker Pell", title: "Tinkerer", kind: "captain", xp: 0, skills: ["researcher", "engineer"] },
  { name: "Ossa Venn", title: "Treasurer", kind: "administrator", xp: 0, skills: ["financialLeader"] },
  { name: "Merrow Sal", title: "Deepwater Navigator", kind: "captain", xp: 0, skills: ["helmsman", "navigator*", "weaponry"] },
  { name: "Ilya Fenwright", title: "Hull Warden", kind: "captain", xp: 0, skills: ["engineer*"] },
  { name: "Grast Vokk", title: "Scaled Armsman", kind: "captain", xp: 60, skills: ["commando", "security", "weaponry"] },
  { name: "Aubrin Cale", title: "Noble", kind: "administrator", xp: 0, skills: ["diplomat", "famous", "megawealth"] },
  { name: "Quent Varro", title: "Free Trader", kind: "captain", xp: 0, skills: ["megawealth", "helmsman", "navigator", "weaponry"] },
  { name: "Master Shoan", title: "Old Teacher", kind: "administrator", xp: 0, skills: ["famous*", "instructor*"] },
  { name: "Skiv Arrowind", title: "Sky Pilot", kind: "captain", xp: 0, skills: ["fighterPilot", "helmsman*", "navigator"] },
  { name: "Hesk Amaru", title: "Field Surgeon", kind: "administrator", xp: 0, skills: ["researcher", "medicine*"] },
  { name: "Gearwick", title: "Cyborg Mechanic", kind: "captain", xp: 0, skills: ["engineer*", "ordnance"], techs: ["advancedDamageControl"] },
  { name: "Corrin Dace", title: "Envoy", kind: "administrator", xp: 0, skills: ["diplomat*", "famous", "megawealth"] },
  { name: "Jessa Holloway", title: "Pathfinder", kind: "captain", xp: 60, skills: ["diplomat", "helmsman", "navigator*", "weaponry"] },
  { name: "Vesk the Quiet", title: "Shadow Broker", kind: "captain", xp: 0, skills: ["assassin*", "spyMaster*"] },
  { name: "Rhaal Kesh", title: "Clan Champion", kind: "captain", xp: 60, skills: ["commando", "weaponry*"] },
  { name: "Lysenne", title: "Songweaver", kind: "administrator", xp: 60, skills: ["diplomat*", "famous", "spiritualLeader*"] },
  { name: "Drey Mallick", title: "Blockade Runner", kind: "captain", xp: 60, skills: ["trader", "helmsman", "navigator", "weaponry"] },
  { name: "Urgo Thane", title: "Iron Overseer", kind: "administrator", xp: 60, skills: ["commando", "farmingLeader", "laborLeader", "tactics"] },
  { name: "Kor Vashti", title: "Warmaster", kind: "captain", xp: 60, skills: ["commando", "helmsman*", "navigator*"] },
  { name: "Ammon Teel", title: "Mind Scholar", kind: "administrator", xp: 60, skills: ["researcher*", "scienceLeader*"] },
  { name: "Nix Calder", title: "Renegade Pilot", kind: "captain", xp: 60, skills: ["helmsman", "navigator", "ordnance", "weaponry"] },
  { name: "Sabel Orre", title: "Merchant Prince", kind: "administrator", xp: 60, skills: ["megawealth", "trader*", "financialLeader"] },
  { name: "Eon Tharal", title: "Elder Voyager", kind: "captain", xp: 150, skills: ["galacticLore*", "helmsman", "navigator*"], techs: ["dimensionalPortal"] },
  { name: "Wren Sollis", title: "Prodigy", kind: "captain", xp: 60, skills: ["engineer", "ordnance*", "weaponry"] },
  { name: "Borrag Stonefist", title: "Shock Trooper", kind: "captain", xp: 60, skills: ["commando*", "famous", "operations", "security"] },
  { name: "Fennick Moss", title: "Worldshaper", kind: "administrator", xp: 60, skills: ["researcher", "environmentalist", "farmingLeader"], techs: ["terraforming"] },
  { name: "Cassor Rile", title: "Hired Gun", kind: "captain", xp: 60, skills: ["helmsman", "navigator", "ordnance", "security", "weaponry"] },
  { name: "Unit Seven", title: "Synthetic Steward", kind: "administrator", xp: 60, skills: ["farmingLeader", "financialLeader", "laborLeader", "medicine"] },
  { name: "Gobbel Raz", title: "Speculator", kind: "captain", xp: 60, skills: ["megawealth", "galacticLore*", "navigator"] },
  { name: "Strategos Ilm", title: "Grand Strategist", kind: "administrator", xp: 60, skills: ["commando*", "operations*", "instructor", "tactics*"] },
  { name: "Thessaly Fern", title: "Wilds Keeper", kind: "administrator", xp: 60, skills: ["environmentalist*", "farmingLeader*"] },
  { name: "Moggin Sharr", title: "Arms Broker", kind: "captain", xp: 60, skills: ["megawealth", "trader*", "helmsman", "navigator", "weaponry"] },
  { name: "Seer Ondine", title: "Oracle", kind: "administrator", xp: 60, skills: ["diplomat", "telepath*", "environmentalist", "spiritualLeader"], techs: ["telepathicTraining"] },
  { name: "Kael Dorne", title: "Exiled Blade", kind: "captain", xp: 60, skills: ["commando*", "security*", "weaponry*"] },
  { name: "Cipher", title: "Enigma", kind: "administrator", xp: 60, skills: [], randomSkills: true },
  { name: "Razik Voss", title: "Cyber Raider", kind: "captain", xp: 60, skills: ["assassin", "commando", "spyMaster", "ordnance", "weaponry"] },
  { name: "Alder Quill", title: "Great Scientist", kind: "captain", xp: 150, skills: ["famous*", "researcher*", "security*"], techs: ["researchLab", "autolab"] },
  { name: "Grond Hask", title: "Weaponsmaster", kind: "captain", xp: 60, skills: ["commando*", "ordnance*", "weaponry"] },
  { name: "Sable Nightjar", title: "Black Hand", kind: "captain", xp: 60, skills: ["assassin*", "spyMaster*", "fighterPilot", "galacticLore", "navigator"] },
  { name: "Kestra Vane", title: "Corsair", kind: "captain", xp: 60, skills: ["famous", "trader", "helmsman*", "navigator*", "weaponry"] },
  { name: "Tamsin Rook", title: "Firebrand", kind: "administrator", xp: 150, skills: ["farmingLeader", "laborLeader", "scienceLeader", "spiritualLeader"] },
  { name: "Halvard Crowe", title: "Manhunter", kind: "captain", xp: 150, skills: ["assassin", "commando", "helmsman*", "navigator", "weaponry*"] },
  { name: "Lumen", title: "Machine Seer", kind: "administrator", xp: 150, skills: ["assassin", "telepath*", "scienceLeader*", "spiritualLeader*"] },
  { name: "Serin Vael", title: "Peacebringer", kind: "captain", xp: 150, skills: ["diplomat*", "famous", "helmsman", "ordnance*", "weaponry*"] },
  { name: "Mother Kix", title: "Brood Overseer", kind: "administrator", xp: 150, skills: ["operations*", "farmingLeader*", "laborLeader*"] },
  { name: "The Stranger", title: "Unknown", kind: "captain", xp: 150, skills: [], randomSkills: true },
  { name: "Baron Mordrake", title: "Overlord", kind: "administrator", xp: 150, skills: ["commando", "farmingLeader*", "financialLeader*", "laborLeader*"] },
  { name: "Aria Swift", title: "Ace of Aces", kind: "captain", xp: 150, skills: ["famous*", "fighterPilot*", "helmsman*", "navigator", "weaponry"] },
  { name: "Oberon Lux", title: "Technomage", kind: "captain", xp: 150, skills: ["megawealth", "researcher*", "galacticLore*", "security*"], techs: ["virtualRealityNetwork"] },
  { name: "Redbeard Kasso", title: "Pirate King", kind: "captain", xp: 150, skills: ["galacticLore*", "helmsman*", "navigator*", "ordnance*", "weaponry*"] },
  { name: "The Custodian", title: "Ancient Automaton", kind: "administrator", xp: 150, skills: ["farmingLeader*", "laborLeader*", "scienceLeader*"], techs: ["androidFarmers", "androidScientists", "androidWorkers"] },
  { name: "Varro Blackmane", title: "Bandit Chief", kind: "captain", xp: 300, skills: ["famous*", "megawealth", "fighterPilot*", "helmsman", "weaponry*"] },
  { name: "Hollis Brand", title: "Master Builder", kind: "captain", xp: 300, skills: ["famous*", "operations*", "researcher*", "engineer*", "ordnance*"] },
  { name: "Mother Ysolde", title: "High Seer", kind: "captain", xp: 300, skills: ["telepath", "engineer*", "fighterPilot*", "weaponry*"] },
  { name: "Teodor Raine", title: "Fleet Legend", kind: "captain", xp: 300, skills: ["famous*", "fighterPilot*", "helmsman*", "ordnance*", "weaponry*"] },
  { name: "Brakka Holt", title: "Battle Marshal", kind: "administrator", xp: 300, skills: ["commando*", "instructor*", "laborLeader*", "spiritualLeader*"] },
  { name: "Malachar", title: "Shadow Lord", kind: "administrator", xp: 300, skills: ["telepath*", "financialLeader*", "laborLeader*", "scienceLeader*", "spiritualLeader*"] },
  { name: "Solenne", title: "Supreme Regent", kind: "administrator", xp: 300, skills: ["environmentalist*", "financialLeader*", "laborLeader*", "scienceLeader*", "spiritualLeader*"] },
  { name: "Aldric the Last", title: "Last of the Elders", kind: "captain", xp: 1000, skills: ["fighterPilot*", "galacticLore*", "helmsman*", "ordnance*", "weaponry*"], special: "guardian" },
  { name: "Xal Tereth", title: "Raider Renegade", kind: "captain", xp: 1000, skills: ["fighterPilot*", "helmsman*", "ordnance*", "security*", "weaponry*"], special: "raiders" },
];

/** Leader ids are fixed per hero. */
export const heroLeaderId = (heroId: number): string => `h${heroId}`;

/** Most leaders an empire can have in service at once. */
export const MAX_LEADERS = LEADER_RULES.maxTotal;
