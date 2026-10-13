import { EVENTS, EVENT_NUMBERS as N, type EventId } from "./data/events.js";
import { GROWTH } from "./data/economy.js";
import { DRAGON_BRIBE_PER_POP, DRAGON_PILLAGE, HYDRA_KILL_SHARE, ROAMING_MONSTERS } from "./data/monsters.js";
import { getRace } from "./data/races.js";
import { ignoresSpaceHazards } from "./raceEffects.js";
import type { ActiveEvent, GameState, Id, PlayerId } from "./types.js";

/** A random event still in play, as a player sees it: what it is, what it does and when it ends. */
export interface OngoingEvent {
  id: Id;
  kind: string;
  mood: "good" | "bad" | "neutral";
  title: string;
  /** What it does, with the rules' numbers. */
  effect: string;
  /** When it ends, or what ends it. */
  ends: string;
  starId?: Id;
}

const pct = (n: number) => `${n > 0 ? "+" : ""}${n}%`;

/** When a lasting event (flux, anomaly, beast, boom) ends: a 1 in N chance each turn once old enough, and surely by its last turn. */
function lastingEnds(state: Pick<GameState, "turn">, ev: ActiveEvent): string {
  const fadeFrom = ev.until - N.lasting.maxTurns + N.lasting.minTurns;
  const chance = `1 in ${N.lasting.endDie} chance to end each turn`;
  return state.turn >= fadeFrom
    ? `${chance}; over by turn ${ev.until} at the latest`
    : `${chance} from turn ${fadeFrom}; over by turn ${ev.until} at the latest`;
}

/**
 * The random events in play that concern a player: those that strike the
 * whole galaxy, and those on its colonies, its systems or heading for them.
 * Works on a PlayerView as well as on the full state.
 */
export function ongoingEvents(state: GameState, viewer: PlayerId): OngoingEvent[] {
  const starName = (id: Id | undefined) => state.galaxy.stars.find((s) => s.id === id)?.name ?? "an unknown system";
  const mineAt = (starId: Id | undefined) =>
    !!starId && Object.values(state.colonies).some((c) => c.ownerId === viewer && state.planets[c.planetId]?.starId === starId);
  const player = state.players[viewer];
  const out: OngoingEvent[] = [];
  for (const ev of state.activeEvents ?? []) {
    const mood = EVENTS[ev.kind as EventId]?.mood ?? "neutral";
    const base = { id: ev.id, kind: ev.kind, mood, ...(ev.starId ? { starId: ev.starId } : {}) };
    const colony = ev.colonyId ? state.colonies[ev.colonyId] : undefined;
    const mine = (colony && colony.ownerId === viewer) || mineAt(ev.starId);
    const turnsLeft = Math.max(0, ev.until - state.turn);
    switch (ev.kind) {
      case "hyperspaceFlux": {
        const immune = player?.kind === "empire" && ignoresSpaceHazards(getRace(player.raceId));
        out.push({
          ...base, title: "Hyperspace flux",
          effect: immune
            ? "No other empire's ships can move. Your trans-dimensional ships travel as usual."
            : "No ship can move: fleets in orbit cannot leave (not even through wormholes or gates) and fleets in flight stop where they are.",
          ends: lastingEnds(state, ev),
        });
        break;
      }
      case "warpBeast":
        out.push({
          ...base, title: "Hyperspace beast",
          effect: `Each turn it destroys one ship in flight of the empire it hunts${ev.playerId === viewer ? " (now yours)" : ""}. Ships in orbit are safe.`,
          ends: lastingEnds(state, ev),
        });
        break;
      case "supernova":
        out.push({
          ...base, title: `Supernova at ${starName(ev.starId)}`,
          effect: `In ${turnsLeft} turn${turnsLeft === 1 ? "" : "s"} the star explodes, destroying the system's colonies and leaving its worlds radiated, unless its colonies' research reaches ${ev.strength} points (${ev.progress ?? 0} so far).`,
          ends: `averted by the research, else explodes on turn ${ev.until}`,
        });
        break;
      case "timeSpaceAnomaly":
        if (!mine) break;
        out.push({
          ...base, title: `Time-space anomaly at ${starName(ev.starId)}`,
          effect: "The system's colonies stand still (no food, industry, research, income, upkeep or growth) and nobody can fight there.",
          ends: lastingEnds(state, ev),
        });
        break;
      case "populationBoom":
        if (!colony || colony.ownerId !== viewer) break;
        out.push({ ...base, title: `Population boom on ${colony.name}`, effect: `Growth ${pct(GROWTH.boomPercent)}.`, ends: lastingEnds(state, ev) });
        break;
      case "plague":
        if (!colony || colony.ownerId !== viewer) break;
        out.push({
          ...base, title: `Plague on ${colony.name}`,
          effect: `Growth ${pct(GROWTH.plaguePercent)}; the colony's research goes to the cure (${ev.progress ?? 0} of ${ev.strength} points).`,
          ends: "when the cure is found",
        });
        break;
      case "comet":
        if (!colony || colony.ownerId !== viewer) break;
        out.push({
          ...base, title: `Comet bound for ${colony.name}`,
          effect: `Strikes in ${turnsLeft} turn${turnsLeft === 1 ? "" : "s"}, killing colonists and wrecking buildings. ${ev.strength} hit points left; every ship in orbit there wears it down by its hull size (frigate 1 … doom star 6) each turn.`,
          ends: `broken up by ships in orbit, else strikes on turn ${ev.until}`,
        });
        break;
      case "pirates":
        if (!mine) break;
        out.push({
          ...base, title: `Pirates at ${starName(ev.starId)}`,
          effect: `They take freighters from every empire with a colony there (chance: strength left ${ev.strength} of ${ev.progress}). Every ship in orbit wears their base down by its hull size each turn.`,
          ends: "when their base is worn down",
        });
        break;
      default: {
        const m = ROAMING_MONSTERS[ev.kind];
        if (!m || (ev.playerId !== viewer && !mine)) break;
        const what = {
          engulf: "turns the system's worlds toxic",
          killAll: "kills every colonist in the system (outposts survive)",
          kill: `kills ${HYDRA_KILL_SHARE * 100}% of the system's colonists`,
          pillage: `demands ${DRAGON_BRIBE_PER_POP} BC per population; unpaid, it wrecks ${DRAGON_PILLAGE.buildings} buildings per colony and kills ${DRAGON_PILLAGE.popShare * 100}% of the colonists`,
          blockade: "blockades the system",
        }[m.effect];
        out.push({
          ...base, mood: "bad", title: `${m.name} heading for ${starName(ev.starId)}`,
          effect: `On arrival it ${what}. It can be fought.`,
          ends: `leaves the galaxy on turn ${ev.until}, or when destroyed`,
        });
      }
    }
  }
  return out;
}
