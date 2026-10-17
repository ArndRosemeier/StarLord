import { AVENGER_DESIGN, GUARDIAN_SCORE, HEROES, TECHS, type GameEvent, type PlayerView } from "@starlord/sim";
import { fmt, playerName, starName } from "./format";

export type FallNews = Extract<GameEvent, { kind: "empireFell" }>;
export type GuardianNews = Extract<GameEvent, { kind: "guardianSlain" }>;

/** Headlines for an empire's end, four of each like the original's news desk; the turn and empire pick one. */
const DESTROYED = [
  (x: string) => `The ${x} have been wiped from the galaxy`,
  (x: string) => `The ${x} have fallen and will wield power no more`,
  (x: string) => `The last colony of the ${x} is gone: not a world, not a fleet remains`,
  (x: string) => `The ${x} now live on only in the history books`,
];
const SURRENDERED = [
  (x: string, y: string) => `The ${x} surrender to the ${y}`,
  (x: string, y: string) => `Shock across the galaxy as the ${x} surrender to the ${y}`,
  (x: string, y: string) => `Once a galactic power, the ${x} today surrendered to the ${y}`,
  (x: string, y: string) => `The ${x} finally announce their long-awaited surrender to the ${y}`,
];

const pick = <T,>(list: T[], e: FallNews) => list[(e.turn + e.fallen) % list.length]!;
const plural = (n: number, one: string, many = `${one}s`) => `${fmt(n)} ${n === 1 ? one : many}`;

/** The big headline for an empire's fall. */
export function fallHeadline(view: PlayerView, e: FallNews): string {
  const x = playerName(view, e.fallen);
  return e.how === "destroyed" ? pick(DESTROYED, e)(x) : pick(SURRENDERED, e)(x, playerName(view, e.to ?? e.fallen));
}

/** What the fall means, in the game's own numbers: who is credited, what passed to whom, who is left. */
export function fallDetails(view: PlayerView, e: FallNews): string[] {
  const lines: string[] = [];
  if (e.how === "destroyed") {
    if (e.by === view.viewer) lines.push("Your empire is credited with their destruction.");
    else if (e.by !== undefined) lines.push(`The ${playerName(view, e.by)} are credited with their destruction.`);
  } else if (e.handed) {
    const h = e.handed;
    const who = e.to === view.viewer ? "you" : `the ${playerName(view, e.to ?? e.fallen)}`;
    const parts = [
      plural(h.colonies, "colony", "colonies") + (h.population > 0 ? ` (${fmt(h.population)} pop)` : ""),
      plural(h.ships, "ship"),
      plural(h.techs, "new technology", "new technologies"),
      `${fmt(Math.round(h.bc))} BC`,
      ...(h.freighters > 0 ? [plural(h.freighters, "freighter")] : []),
      ...(h.spies > 0 ? [plural(h.spies, "spy", "spies")] : []),
    ];
    lines.push(`Their whole empire passes to ${who}: ${parts.join(", ")}. Their leaders leave service.`);
  }
  if (e.fallen === view.viewer) lines.push(e.how === "destroyed" ? "Your empire is no more." : "Your reign is over.");
  else {
    const left = view.players.filter((p) => p.kind === "empire" && p.alive).length;
    lines.push(`${plural(left, "empire")} remain${left === 1 ? "s" : ""} in the galaxy.`);
  }
  return lines;
}

/** The last of the elders, who takes command of the Avenger when a captain's post is free. */
export const ELDER = HEROES.find((h) => h.special === "guardian")!;

/** The headline for the Guardian's fall: the original's "visited the legendary Orion star system". */
export function guardianHeadline(view: PlayerView, e: GuardianNews): string {
  return e.by === view.viewer
    ? `Your fleet destroys the Guardian of ${starName(view, e.starId)}`
    : `Ships of the ${playerName(view, e.by)} have visited the legendary ${starName(view, e.starId)} system`;
}

/** What the victor found on the elders' ship, in the game's own names and numbers. */
export function guardianDetails(view: PlayerView, e: GuardianNews): string[] {
  if (e.by !== view.viewer) return [`They destroyed its Guardian and took the elders' ship, the ${AVENGER_DESIGN.name}, with its xenon technology.`];
  const lines: string[] = [];
  lines.push(e.heroJoined
    ? `You rescue the ${AVENGER_DESIGN.name}, a mighty warship of the elders. ${ELDER.name}, ${ELDER.title}, takes command and shares the elders' knowledge.`
    : `You find the ${AVENGER_DESIGN.name}, an abandoned warship of the elders, now yours at ${starName(view, e.starId)}.`
      + ` (${ELDER.name} would have taken command, but you have no free captain's post.)`);
  const techs = e.techs ?? [];
  lines.push(techs.length > 0
    ? `On board you find knowledge of: ${techs.map((t) => TECHS[t]?.name ?? t).join(", ")}.`
    : "Its technology holds nothing you do not already know.");
  lines.push(`Score +${fmt(GUARDIAN_SCORE)}.`);
  return lines;
}
