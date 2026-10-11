import { STARTING_SHIPS, STARTING_STATION, TECH_LEVELS } from "./data/galaxy.js";
import { GOVERNMENTS } from "./data/governments.js";
import { gravityOf, type Minerals, type PlanetSize, type PlanetType } from "./data/planets.js";
import { RACES, getRace, hasTrait } from "./data/races.js";
import { STARTING_TECH_APPS, TECH_TIERS, emptyHyperLevels, type TechTier } from "./data/techs.js";
import { startingDesigns } from "./designs.js";
import { distance, generateGalaxy, pickHomeStars, placeNebulae, placeSpecials } from "./galaxy.js";
import { assignDefaultJobs } from "./jobs.js";
import { buildCustomRace, type CustomRaceSpec } from "./customRace.js";
import { createRoster } from "./leaders.js";
import { setupNpcs } from "./npc.js";
import { COUNCIL_FIRST } from "./council.js";
import { maxPopulation } from "./economy.js";
import { learnsWholeField, researchOptions } from "./rules.js";
import { Rng, seedRng } from "./rng.js";
import type {
  Colony, Difficulty, Fleet, GalaxyAge, GameSettings, GameState, Id, Planet, Player, PlayerId, TechLevel,
} from "./types.js";

export interface NewGameOptions {
  seed: string | number;
  galaxySize?: GameSettings["galaxySize"];
  /** Race ids per player; defaults to random distinct races. */
  races?: string[];
  playerCount?: number;
  /** Player slots controlled by a person. Empty means an all-AI game. */
  humanPlayers?: PlayerId[];
  /** Optional turn limit with a score victory; omitted or 0 means none, as in the original. */
  maxTurns?: number;
  monsters?: boolean;
  /** Antaran-style attacks by the Vexari raiders (and the portal victory). */
  raiders?: boolean;
  council?: boolean;
  difficulty?: Difficulty;
  galaxyAge?: GalaxyAge;
  techLevel?: TechLevel;
  randomEvents?: boolean;
  shipInitiative?: boolean;
  /** Allows the debug menu's commands (games started with Ctrl+Alt held). */
  debug?: boolean;
  /** Player-built races; their ids (from buildCustomRace) may appear in `races`. */
  customRaces?: CustomRaceSpec[];
}

export const HOMEWORLD_POP = 8;
export const STARTING_BC = 50;
export const HOMEWORLD_BUILDINGS = [STARTING_STATION, ...TECH_LEVELS.average.buildings];

export function newGame(opts: NewGameOptions): GameState {
  const seed = String(opts.seed);
  const rngState = seedRng(seed);
  const rng = new Rng(rngState);
  let nextId = 1;
  const newId = (prefix: string): Id => `${prefix}${nextId++}`;

  const customRaces = (opts.customRaces ?? []).map(buildCustomRace);
  const playerCount = opts.races?.length ?? opts.playerCount ?? 4;
  const races = opts.races ?? rng.shuffle(RACES.map((r) => r.id)).slice(0, playerCount);
  races.forEach(getRace);

  const settings: GameSettings = {
    galaxySize: opts.galaxySize ?? "medium",
    races,
    humanPlayers: opts.humanPlayers ?? [],
    maxTurns: opts.maxTurns ?? 0,
    monsters: opts.monsters ?? true,
    raiders: opts.raiders ?? true,
    council: opts.council ?? true,
    difficulty: opts.difficulty ?? "average",
    galaxyAge: opts.galaxyAge ?? "average",
    techLevel: opts.techLevel ?? "average",
    randomEvents: opts.randomEvents ?? true,
  };
  if (opts.shipInitiative) settings.shipInitiative = true;
  if (opts.debug) settings.debug = true;
  if (customRaces.length > 0) settings.customRaces = customRaces;
  const level = TECH_LEVELS[settings.techLevel!];

  const galaxy = generateGalaxy(rng, settings.galaxySize, newId, settings.galaxyAge);
  const homes = pickHomeStars(rng, galaxy.stars, playerCount);
  const nebulae = placeNebulae(rng, settings.galaxySize, galaxy.width, galaxy.height, galaxy.stars, galaxy.planets, homes);

  const state: GameState = {
    version: 2,
    seed,
    rng: rngState,
    turn: 1,
    settings,
    galaxy: { width: galaxy.width, height: galaxy.height, stars: galaxy.stars },
    planets: galaxy.planets,
    colonies: {},
    fleets: {},
    players: [],
    relations: {},
    attitude: {},
    proposals: [],
    leaders: {},
    council: { nextTurn: COUNCIL_FIRST, lastResult: null },
    raiders: { nextRaid: Infinity, defeated: false },
    nebulae,
    tributes: [],
    activeEvents: [],
    combats: [],
    events: [],
    nextId: 0,
    winner: null,
    victory: null,
    over: false,
  };

  races.forEach((raceId, i) => {
    const race = getRace(raceId);
    const home = homes[i]!;
    home.color = "yellow";
    home.nebula = false;

    // Replace a middle orbit with the homeworld so every start is comparable.
    const size: PlanetSize = hasTrait(race, "largeHomeworld") ? "large" : "medium";
    const minerals: Minerals = hasTrait(race, "richHomeworld") ? "rich" : hasTrait(race, "poorHomeworld") ? "poor" : "abundant";
    const type: PlanetType = hasTrait(race, "aquatic") ? "ocean" : "terran";
    const hw: Planet = {
      id: newId("p"), starId: home.id, orbit: 3, type, size, minerals,
      // Home gravity always suits the race.
      gravity: hasTrait(race, "lowG") ? "low" : hasTrait(race, "highG") ? "heavy" : gravityOf("medium", "abundant"),
      special: hasTrait(race, "artifactsHomeworld") ? "artifacts" : "none",
      colonyId: null,
    };
    if (hw.special === "artifacts") hw.artifactsClaimed = true;
    for (const pid of home.planetIds) {
      if (state.planets[pid]!.orbit === 3) delete state.planets[pid];
    }
    home.planetIds = home.planetIds.filter((pid) => state.planets[pid]).concat(hw.id);
    state.planets[hw.id] = hw;

    const player: Player = {
      id: i,
      kind: "empire",
      name: race.name,
      raceId,
      color: race.color,
      isHuman: settings.humanPlayers.includes(i),
      alive: true,
      government: race.picks.government,
      bc: level.bc,
      taxRate: 0,
      techs: [...STARTING_TECH_APPS],
      tiers: [],
      research: { tierId: null, techChoice: null, progress: 0 },
      hyperLevels: emptyHyperLevels(),
      mutationPoints: 0,
      explored: [home.id],
      contacts: [],
      homeStarId: home.id,
      designs: startingDesigns(),
      spies: { home: 0, abroad: {} },
      leaderOffers: [],
      councilVote: "auto",
      doctrine: { retreatBelow: 0.5, focus: "nearest" },
      automation: [],
      hasPortal: false,
      eliminatedTurn: null,
      freighters: 0,
      transfers: [],
    };
    const needsCapitol = GOVERNMENTS[player.government].capitalLossMorale > 0;
    if (needsCapitol) player.capitol = "held";
    state.players.push(player);
    grantStartingTechs(rng, player, settings.techLevel!);

    const colony: Colony = {
      id: newId("c"), planetId: hw.id, ownerId: i, raceId, name: home.name, outpost: false,
      farmers: 0, workers: HOMEWORLD_POP, scientists: 0, growthK: 0,
      // Unified governments neither have nor need a capital.
      buildings: [...(needsCapitol ? ["capitol"] : []), STARTING_STATION, ...level.buildings], queue: [], progress: 0, founded: 1, terraformed: 0, unrestUntil: 0,
    };
    hw.colonyId = colony.id;
    state.colonies[colony.id] = colony;
    assignDefaultJobs(state, colony);

    for (const s of STARTING_SHIPS) {
      const f: Fleet = {
        id: newId("f"), ownerId: i, x: home.x, y: home.y, starId: home.id, destStarId: null,
        ships: [{ designId: s.designId, count: s.count }], stance: "defend", name: s.name,
      };
      state.fleets[f.id] = f;
    }
  });

  // Advanced starts: settled neighbourhoods and charted space.
  for (const player of state.players) {
    const home = state.galaxy.stars.find((s) => s.id === player.homeStarId)!;
    if (level.exploredRadius > 0) {
      for (const s of state.galaxy.stars) {
        if (!player.explored.includes(s.id) && distance(s, home) <= level.exploredRadius) player.explored.push(s.id);
      }
    }
    for (let n = 0; n < level.extraColonies; n++) {
      const race = getRace(player.raceId);
      const options = state.galaxy.stars
        .filter((s) => distance(s, home) <= 6 && !homes.some((h) => h !== home && distance(h, s) < distance(home, s)))
        .flatMap((s) => s.planetIds.map((id) => state.planets[id]!))
        .filter((p) => !p.colonyId && p.special !== "natives" && p.special !== "splinter" && maxPopulation(p, race) >= level.extraColonyPop)
        .sort((a, b) => maxPopulation(b, race) - maxPopulation(a, race) || (a.id < b.id ? -1 : 1));
      const planet = options[0];
      if (!planet) break;
      const star = state.galaxy.stars.find((s) => s.id === planet.starId)!;
      const c: Colony = {
        id: newId("c"), planetId: planet.id, ownerId: player.id, raceId: player.raceId, name: `${star.name} ${["I", "II", "III", "IV", "V"][planet.orbit - 1]}`,
        outpost: false, farmers: 0, workers: level.extraColonyPop, scientists: 0, growthK: 0,
        buildings: [], queue: [], progress: 0, founded: 1, terraformed: 0, unrestUntil: 0,
      };
      planet.colonyId = c.id;
      state.colonies[c.id] = c;
      assignDefaultJobs(state, c);
      if (!player.explored.includes(star.id)) player.explored.push(star.id);
    }
  }

  state.nextId = nextId;
  setupNpcs(state, rng);
  placeSpecials(rng, state.galaxy.stars, state.planets, homes);
  createRoster(state, rng);
  for (const p of state.players) {
    if (p.kind === "empire" && hasTrait(getRace(p.raceId), "omniscient")) {
      p.explored = state.galaxy.stars.filter((s) => s.special !== "raiderHome").map((s) => s.id);
    }
  }
  return state;
}

/**
 * Researched fields at the start. Pre-warp knows only the starting
 * applications; average adds every general field plus a few random extras;
 * advanced adds every field up to a tech level. Non-general fields teach the
 * race's usual share: all for creative races, otherwise one random application.
 */
export function grantStartingTechs(rng: Rng, player: Player, techLevel: TechLevel): void {
  const def = TECH_LEVELS[techLevel];
  const learn = (tier: TechTier) => {
    if (player.tiers.includes(tier.id)) return;
    player.tiers.push(tier.id);
    const options = researchOptions(player, tier);
    const apps = learnsWholeField(player, tier) ? options : options.length ? [rng.pick(options)] : [];
    for (const t of apps) if (!player.techs.includes(t)) player.techs.push(t);
  };
  for (const tier of TECH_TIERS) {
    if (tier.hyper) continue;
    if ((def.generalFields && tier.general) || tier.level <= def.maxFieldLevel) learn(tier);
  }
  for (let i = 0; i < def.extraFields; i++) {
    const next = TECH_TIERS.filter(
      (t) => !t.hyper && !player.tiers.includes(t.id) && t.level <= def.extraMaxLevel && (t.prev === null || player.tiers.includes(t.prev)),
    );
    if (next.length === 0) break;
    learn(rng.pick(next));
  }
}
