import {
  HALL_OF_FAME_SIZE, getRace, registerRaces, score, type Difficulty, type GalaxySize, type GameState, type PlayerId, type VictoryKind,
} from "@starlord/sim";

/** The best final scores of past games, kept in this browser. */

const KEY = "starlord.hallOfFame";

export interface HallEntry {
  /** One entry per game and player: the game's seed and the player's seat. */
  id: string;
  empire: string;
  race: string;
  score: number;
  won: boolean;
  /** How the game ended, whoever won it. */
  victory: VictoryKind | null;
  turn: number;
  difficulty: Difficulty;
  galaxySize: GalaxySize;
  /** When the game ended, as an ISO date. */
  date: string;
}

export function loadHallOfFame(): HallEntry[] {
  try {
    const list = JSON.parse(localStorage.getItem(KEY) ?? "[]") as HallEntry[];
    return Array.isArray(list) ? list.filter((e) => typeof e?.score === "number" && typeof e.id === "string") : [];
  } catch {
    return [];
  }
}

function saveHallOfFame(list: HallEntry[]): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(list));
  } catch {
    // Storage full or blocked: the hall simply stays as it was.
  }
}

/** Highest score first; ties go to the earlier game. */
export function rankEntries(list: HallEntry[]): HallEntry[] {
  return [...list].sort((a, b) => b.score - a.score || a.date.localeCompare(b.date));
}

/**
 * The entry a finished game earns its human player, or null when it earns none:
 * the game is not over, or it was started with the debug menu (the original
 * leaves cheaters out of its Hall of Fame too).
 */
export function hallEntryFor(state: GameState, me: PlayerId, date: Date): HallEntry | null {
  if (!state.over || state.settings.debug) return null;
  registerRaces(state.settings.customRaces);
  const p = state.players[me];
  if (!p || p.kind !== "empire") return null;
  return {
    id: `${state.seed}|${me}`,
    empire: p.name,
    race: getRace(p.raceId).plural,
    score: score(state, me),
    won: state.winner === me,
    victory: state.victory,
    turn: state.turn,
    difficulty: state.settings.difficulty ?? "average",
    galaxySize: state.settings.galaxySize,
    date: date.toISOString(),
  };
}

/**
 * Adds a game's entry if it is good enough for the hall (a game already in the
 * hall keeps its first entry). Returns the hall and the entry's place in it
 * (0-based), or null if it did not make it.
 */
export function enterHallOfFame(entry: HallEntry): { list: HallEntry[]; place: number | null } {
  const old = loadHallOfFame();
  const known = old.find((e) => e.id === entry.id);
  const list = known ? rankEntries(old) : rankEntries([...old, entry]).slice(0, HALL_OF_FAME_SIZE);
  if (!known) saveHallOfFame(list);
  const place = list.findIndex((e) => e.id === entry.id);
  return { list, place: place < 0 ? null : place };
}
