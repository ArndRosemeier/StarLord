import { DIFFICULTY_ORDER, STAR_COUNTS, type Difficulty, type GalaxyAge, type GalaxySize, type TechLevel } from "@starlord/sim";

/** The New Game options of the last game started, kept in this browser so the next game starts the same way. */

const KEY = "starlord.newGame";

export interface NewGamePrefs {
  /** A built-in race id or a custom race id; checked against the races on offer when the screen opens. */
  raceId: string | null;
  opponents: number;
  galaxy: GalaxySize;
  galaxyAge: GalaxyAge;
  difficulty: Difficulty;
  techLevel: TechLevel;
  turnLimit: boolean;
  maxTurns: number;
  monsters: boolean;
  raiders: boolean;
  council: boolean;
  randomEvents: boolean;
  shipInitiative: boolean;
}

export const NEW_GAME_DEFAULTS: NewGamePrefs = {
  raceId: null, opponents: 3, galaxy: "medium", galaxyAge: "average", difficulty: "average", techLevel: "average",
  turnLimit: false, maxTurns: 400, monsters: true, raiders: true, council: true, randomEvents: true, shipInitiative: false,
};

const GALAXY_AGES: readonly GalaxyAge[] = ["young", "average", "old"];
const TECH_LEVELS: readonly TechLevel[] = ["preWarp", "average", "advanced"];

const oneOf = <T,>(list: readonly T[], v: unknown, fallback: T): T => (list.includes(v as T) ? (v as T) : fallback);
const bool = (v: unknown, fallback: boolean): boolean => (typeof v === "boolean" ? v : fallback);
const intIn = (v: unknown, min: number, max: number, fallback: number): number =>
  typeof v === "number" && Number.isInteger(v) && v >= min && v <= max ? v : fallback;

/** The last game's options; any value that is missing or no longer valid falls back to its default. */
export function loadNewGamePrefs(): NewGamePrefs {
  const d = NEW_GAME_DEFAULTS;
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? "null") as Record<string, unknown> | null;
    if (!raw || typeof raw !== "object") return d;
    return {
      raceId: typeof raw.raceId === "string" ? raw.raceId : d.raceId,
      opponents: intIn(raw.opponents, 1, 7, d.opponents),
      galaxy: oneOf(Object.keys(STAR_COUNTS) as GalaxySize[], raw.galaxy, d.galaxy),
      galaxyAge: oneOf(GALAXY_AGES, raw.galaxyAge, d.galaxyAge),
      difficulty: oneOf(DIFFICULTY_ORDER, raw.difficulty, d.difficulty),
      techLevel: oneOf(TECH_LEVELS, raw.techLevel, d.techLevel),
      turnLimit: bool(raw.turnLimit, d.turnLimit),
      maxTurns: intIn(raw.maxTurns, 50, 1000, d.maxTurns),
      monsters: bool(raw.monsters, d.monsters),
      raiders: bool(raw.raiders, d.raiders),
      council: bool(raw.council, d.council),
      randomEvents: bool(raw.randomEvents, d.randomEvents),
      shipInitiative: bool(raw.shipInitiative, d.shipInitiative),
    };
  } catch {
    return d;
  }
}

export function saveNewGamePrefs(prefs: NewGamePrefs): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(prefs));
  } catch {
    // Storage full or blocked: the next game just starts with the defaults.
  }
}
