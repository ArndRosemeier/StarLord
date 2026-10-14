import { empires, getRace, raceShipStyle, score, type GameState, type Player, type PlayerId } from "@starlord/sim";
import { fmt } from "../ui/format";

/**
 * Which end sequence a finished (or, for the player, lost) game plays, who
 * stars in it, and the captions with the real numbers behind the ending.
 */

export type EndingKind = "conquest" | "council" | "raiders" | "score" | "defeat";

/** How an empire looks on screen: its colour, its ships' design language and its homeworld. */
export interface EmpireLook {
  color: string;
  style: string;
  planet: string;
}

export interface EndingSpec {
  kind: EndingKind;
  /** Whose triumph it is: the winner, or for a defeat the player's own fallen empire. */
  hero: EmpireLook;
  /** For a defeat, the empire whose fleets stand over the player's homeworld. */
  foe: EmpireLook | null;
  /** Other empires: the fallen ones for a conquest, the surviving ones (whose envoys attend) for a council victory. */
  others: EmpireLook[];
  /** The Vexari colour. */
  raiders: string;
}

export interface EndingText {
  title: string;
  lines: string[];
}

export interface Ending {
  spec: EndingSpec;
  text: EndingText;
  won: boolean;
}

const NOT_HOMEWORLDS = new Set(["gasGiant", "asteroids"]);

/** The world an empire's scenes play over: its most populous colony at home, else its biggest colony, else its old home planet. */
function homePlanet(state: GameState, p: Player): string {
  const pop = (c: GameState["colonies"][string]) => c.farmers + c.workers + c.scientists;
  const own = Object.values(state.colonies).filter((c) => c.ownerId === p.id && !c.outpost);
  const atHome = own.filter((c) => state.planets[c.planetId]?.starId === p.homeStarId);
  const best = [...(atHome.length ? atHome : own)].sort((a, b) => pop(b) - pop(a))[0];
  if (best) return state.planets[best.planetId]!.type;
  const star = state.galaxy.stars.find((s) => s.id === p.homeStarId);
  const old = (star?.planetIds ?? []).map((id) => state.planets[id]!).filter((pl) => pl && !NOT_HOMEWORLDS.has(pl.type));
  return old[0]?.type ?? "terran";
}

export function empireLook(state: GameState, id: PlayerId): EmpireLook {
  const p = state.players[id]!;
  return { color: p.color, style: raceShipStyle(p.raceId), planet: homePlanet(state, p) };
}

/** The empire credited with destroying `victim` (see `creditElimination`), else the empire that leads on score. */
function destroyerOf(state: GameState, victim: PlayerId): Player | undefined {
  const all = empires(state).filter((p) => p.id !== victim);
  return all.find((p) => p.eliminated?.includes(victim))
    ?? all.filter((p) => p.alive).sort((a, b) => score(state, b.id) - score(state, a.id))[0];
}

/**
 * The ending to show `me` (null for a spectator): the winner's victory scene
 * when `me` won or is only watching, otherwise a defeat over `me`'s homeworld.
 * A game that is not over gives a defeat only once `me` has been eliminated.
 */
export function endingFor(state: GameState, me: PlayerId | null): Ending | null {
  const raiders = state.players.find((p) => p.kind === "raiders")?.color ?? "#c0208a";
  const lastTurn = state.turn - 1;
  const mine = me !== null ? state.players[me] : undefined;
  const all = empires(state);

  if (!state.over) {
    if (!mine || mine.alive) return null;
    const killer = destroyerOf(state, mine.id);
    const turn = mine.eliminatedTurn ?? lastTurn;
    return {
      won: false,
      spec: { kind: "defeat", hero: empireLook(state, mine.id), foe: killer ? empireLook(state, killer.id) : null, others: [], raiders },
      text: {
        title: "Your empire has fallen",
        lines: [
          `The ${mine.name} lost their last populated colony on turn ${turn}.`,
          killer ? `The ${killer.name} ${killer.eliminated?.includes(mine.id) ? "struck the final blow" : "lead the galaxy you leave behind"}.` : "",
        ].filter(Boolean),
      },
    };
  }

  if (state.winner === null || !state.victory) return null;
  const winner = state.players[state.winner]!;
  const race = getRace(winner.raceId).plural;
  const lookW = empireLook(state, winner.id);
  const victory = state.victory;
  const watching = me === null;
  if (watching || me === winner.id) {
    const you = watching ? `The ${winner.name}` : "You";
    const others = (victory === "council" ? all.filter((p) => p.alive) : all).filter((p) => p.id !== winner.id).map((p) => empireLook(state, p.id));
    const spec: EndingSpec = { kind: victory, hero: lookW, foe: null, others, raiders };
    return { won: !watching, spec, text: victoryText(state, winner, you, race, lastTurn) };
  }
  const meP = mine!;
  return {
    won: false,
    spec: { kind: "defeat", hero: empireLook(state, meP.id), foe: lookW, others: [], raiders },
    text: { title: "Defeat", lines: defeatLines(state, winner, meP, lastTurn) },
  };
}

function victoryText(state: GameState, w: Player, you: string, race: string, turn: number): EndingText {
  const n = (w.eliminated ?? []).length;
  switch (state.victory) {
    case "conquest":
      return {
        title: "Conquest",
        lines: [
          `${you} rule the galaxy: the last rival empire fell on turn ${turn}.`,
          `${n} ${n === 1 ? "empire" : "empires"} destroyed by the ${race}, final score ${fmt(score(state, w.id))}.`,
        ],
      };
    case "council": {
      const r = state.council.lastResult;
      const votes = r && r.winner === w.id ? r.votes[w.id] ?? 0 : null;
      return {
        title: "Elected by the Galactic Council",
        lines: [
          `${you} were elected ruler of the galaxy on turn ${state.council.lastResult?.turn ?? turn}.`,
          votes !== null && r ? `${votes} of ${r.total} votes, ${r.needed} needed to win.` : `Final score ${fmt(score(state, w.id))}.`,
        ],
      };
    }
    case "raiders":
      return {
        title: "Vex Prime has fallen",
        lines: [
          `${you} broke the Vexari citadel in their own dimension on turn ${turn}.`,
          "The Vexari are gone for good, and every other empire capitulated.",
        ],
      };
    case "score":
    default: {
      const ranked = empires(state).filter((p) => p.alive).map((p) => ({ p, s: score(state, p.id) })).sort((a, b) => b.s - a.s);
      const lead = ranked[0]!;
      const second = ranked[1];
      return {
        title: "The age has ended",
        lines: [
          `Turn limit of ${state.settings.maxTurns} reached; ${you.toLowerCase() === "you" ? "you lead" : `the ${w.name} lead`} with ${fmt(lead.s)} points.`,
          second ? `${fmt(lead.s - second.s)} points ahead of the ${second.p.name}.` : "No rival survived to the end.",
        ],
      };
    }
  }
}

function defeatLines(state: GameState, w: Player, me: Player, turn: number): string[] {
  const mine = fmt(score(state, me.id));
  const theirs = fmt(score(state, w.id));
  switch (state.victory) {
    case "conquest":
      return [`The ${w.name} conquered the galaxy on turn ${turn}.`, `Your final score: ${mine}.`];
    case "council": {
      const r = state.council.lastResult;
      const votes = r && r.winner === w.id ? ` with ${r.votes[w.id] ?? 0} of ${r.total} votes` : "";
      return [`The council elected the ${w.name} ruler of the galaxy${votes}.`, `Your final score: ${mine}.`];
    }
    case "raiders":
      return [`The ${w.name} destroyed the Vexari at Vex Prime on turn ${turn}, and every empire bowed to them.`, `Your final score: ${mine}.`];
    case "score":
    default:
      return [`Time ran out with the ${w.name} ahead on score: ${theirs} to your ${mine}.`];
  }
}

/** A stand-in ending of any kind starring `me`, for the debug menu's preview; the captions say it is a preview. */
export function previewEnding(state: GameState, me: PlayerId, kind: EndingKind): Ending {
  const raiders = state.players.find((p) => p.kind === "raiders")?.color ?? "#c0208a";
  const rivals = empires(state).filter((p) => p.id !== me);
  const foe = [...rivals].sort((a, b) => score(state, b.id) - score(state, a.id))[0];
  const titles: Record<EndingKind, string> = {
    conquest: "Conquest", council: "Elected by the Galactic Council", raiders: "Vex Prime has fallen", score: "The age has ended", defeat: "Defeat",
  };
  return {
    won: kind !== "defeat",
    spec: {
      kind,
      hero: empireLook(state, me),
      foe: kind === "defeat" && foe ? empireLook(state, foe.id) : null,
      others: kind === "defeat" ? [] : rivals.map((p) => empireLook(state, p.id)),
      raiders,
    },
    text: { title: titles[kind], lines: ["Preview of this ending from the debug menu. Click or press a key to skip."] },
  };
}
