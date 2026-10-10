import { gravityOf, type Minerals, type PlanetSize, type PlanetType } from "./data/planets.js";
import { RACES, getRace, hasTrait } from "./data/races.js";
import { STARTING_TECHS, STARTING_TIERS } from "./data/techs.js";
import { startingDesigns } from "./designs.js";
import { generateGalaxy, pickHomeStars } from "./galaxy.js";
import { assignJobsForFood } from "./jobs.js";
import { setupNpcs } from "./npc.js";
import { COUNCIL_FIRST } from "./council.js";
import { Rng, seedRng } from "./rng.js";
import type { Colony, Fleet, GameSettings, GameState, Id, Planet, Player, PlayerId } from "./types.js";

export interface NewGameOptions {
  seed: string | number;
  galaxySize?: GameSettings["galaxySize"];
  /** Race ids per player; defaults to random distinct races. */
  races?: string[];
  playerCount?: number;
  /** Player slots controlled by a person. Empty means an all-AI game. */
  humanPlayers?: PlayerId[];
  maxTurns?: number;
  monsters?: boolean;
  raiders?: boolean;
  council?: boolean;
}

export const HOMEWORLD_POP = 8;
export const STARTING_BC = 50;
export const HOMEWORLD_BUILDINGS = ["marineBarracks", "starBase"];

export function newGame(opts: NewGameOptions): GameState {
  const seed = String(opts.seed);
  const rngState = seedRng(seed);
  const rng = new Rng(rngState);
  let nextId = 1;
  const newId = (prefix: string): Id => `${prefix}${nextId++}`;

  const playerCount = opts.races?.length ?? opts.playerCount ?? 4;
  const races = opts.races ?? rng.shuffle(RACES.map((r) => r.id)).slice(0, playerCount);
  races.forEach(getRace);

  const settings: GameSettings = {
    galaxySize: opts.galaxySize ?? "medium",
    races,
    humanPlayers: opts.humanPlayers ?? [],
    maxTurns: opts.maxTurns ?? 400,
    monsters: opts.monsters ?? true,
    raiders: opts.raiders ?? true,
    council: opts.council ?? true,
  };

  const galaxy = generateGalaxy(rng, settings.galaxySize, newId);
  const homes = pickHomeStars(rng, galaxy.stars, playerCount);

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
      bc: STARTING_BC,
      taxRate: 0,
      techs: [...STARTING_TECHS],
      tiers: [...STARTING_TIERS],
      research: { tierId: null, techChoice: null, progress: 0 },
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
    };
    state.players.push(player);

    const colony: Colony = {
      id: newId("c"), planetId: hw.id, ownerId: i, raceId, name: home.name, outpost: false,
      farmers: 0, workers: HOMEWORLD_POP, scientists: 0, growthK: 0,
      buildings: [...HOMEWORLD_BUILDINGS], queue: [], progress: 0, founded: 1, terraformed: 0, unrestUntil: 0,
    };
    hw.colonyId = colony.id;
    state.colonies[colony.id] = colony;
    assignJobsForFood(state, colony);

    const fleet = (name: string, ships: Fleet["ships"]): void => {
      const f: Fleet = {
        id: newId("f"), ownerId: i, x: home.x, y: home.y, starId: home.id, destStarId: null, ships,
        stance: "defend", name,
      };
      state.fleets[f.id] = f;
    };
    fleet("Scout I", [{ designId: "scout", count: 1 }]);
    fleet("Scout II", [{ designId: "scout", count: 1 }]);
    fleet("Colony Fleet", [{ designId: "colonyShip", count: 1 }]);
    fleet("Home Guard", [{ designId: "frigate", count: 2 }]);
  });

  state.nextId = nextId;
  setupNpcs(state, rng);
  for (const p of state.players) {
    if (p.kind === "empire" && hasTrait(getRace(p.raceId), "omniscient")) {
      p.explored = state.galaxy.stars.filter((s) => s.special !== "raiderHome").map((s) => s.id);
    }
  }
  return state;
}
