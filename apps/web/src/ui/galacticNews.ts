import type { GameEvent, PlayerView } from "@starlord/sim";
import { fmt, playerName } from "./format";

export type FallNews = Extract<GameEvent, { kind: "empireFell" }>;

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
