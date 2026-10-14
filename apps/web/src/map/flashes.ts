import type { GameEvent, PlayerView } from "@starlord/sim";
import { itemName } from "../ui/format";

/** What a flash on the galaxy map stands for; each kind has its own colour. */
export type FlashKind = "battleLost" | "loss" | "raid" | "battleWon" | "captured" | "colony" | "event" | "warning" | "built" | "explored";

/** Most important first: a star with several events flashes in the colour of the first. */
const PRIORITY: FlashKind[] = ["battleLost", "loss", "raid", "battleWon", "captured", "colony", "event", "warning", "built", "explored"];

export const FLASH_COLORS: Record<FlashKind, number> = {
  battleLost: 0xff4d4d,
  loss: 0xff4d4d,
  raid: 0xff3fa4,
  battleWon: 0xffc94a,
  captured: 0xffc94a,
  colony: 0x5dff9a,
  event: 0xc48bff,
  warning: 0xffa13d,
  built: 0x5ee7ff,
  explored: 0x9fb8ff,
};

/** What each colour means, for the settings. */
export const FLASH_LEGEND: { kind: FlashKind; text: string }[] = [
  { kind: "built", text: "built" },
  { kind: "colony", text: "colony founded" },
  { kind: "battleWon", text: "battle won or colony captured" },
  { kind: "battleLost", text: "battle lost or colony hit" },
  { kind: "raid", text: "raid" },
  { kind: "event", text: "galactic event" },
  { kind: "warning", text: "starving or base scrapped" },
  { kind: "explored", text: "explored" },
];

/** One flash: where, which colour, how big (0..1), what it says and when it starts after the turn begins. */
export interface MapFlash {
  starId: string;
  x: number;
  y: number;
  kind: FlashKind;
  color: number;
  strength: number;
  label: string;
  /** Seconds after the turn starts. */
  delay: number;
}

/** Seconds between one flash and the next, so a busy turn ripples across the map instead of firing all at once. */
export const FLASH_STAGGER = 0.14;
/** The last flash starts by this many seconds after the turn, however many there are. */
export const FLASH_SPREAD = 2;

interface Hit { kind: FlashKind; label: string }

function hitOf(view: PlayerView, e: GameEvent): { starId: string | undefined; hit: Hit } | null {
  const colonyStar = (colonyId: string) => {
    const c = view.colonies[colonyId];
    return c ? view.planets[c.planetId]?.starId : undefined;
  };
  switch (e.kind) {
    case "built":
      return { starId: colonyStar(e.colonyId), hit: { kind: "built", label: `${itemName(view, e.item)} built` } };
    case "baseReady":
      return { starId: colonyStar(e.colonyId), hit: { kind: "built", label: "Base ready" } };
    case "baseScrapped":
      return { starId: colonyStar(e.colonyId), hit: { kind: "warning", label: "Base scrapped" } };
    case "starvation":
      return { starId: colonyStar(e.colonyId), hit: { kind: "warning", label: "Starving" } };
    case "colonyFounded":
      return { starId: view.planets[e.planetId]?.starId, hit: { kind: "colony", label: "Colony founded" } };
    case "colonyCaptured":
      return { starId: colonyStar(e.colonyId), hit: { kind: "captured", label: "Colony captured" } };
    case "colonyLost":
      return { starId: colonyStar(e.colonyId), hit: { kind: "loss", label: e.how === "destroyed" ? "Colony destroyed" : e.how === "revolted" ? "Colony revolted" : e.how === "mindControlled" ? "Mind controlled" : "Colony lost" } };
    case "invasionFailed":
      return { starId: colonyStar(e.colonyId), hit: { kind: "loss", label: "Invasion repelled" } };
    case "bombarded":
      return { starId: colonyStar(e.colonyId), hit: { kind: "loss", label: "Bombarded" } };
    case "combat":
      return { starId: e.starId, hit: e.won ? { kind: "battleWon", label: "Victory" } : { kind: "battleLost", label: "Defeat" } };
    case "orbitalStrike":
      return { starId: e.starId, hit: e.by === view.viewer ? { kind: "battleWon", label: e.planetDestroyed ? "Planet destroyed" : "Orbital strike" } : { kind: "loss", label: "Planet destroyed" } };
    case "raid":
      return { starId: e.starId, hit: { kind: "raid", label: "Raiders!" } };
    case "random":
      return { starId: e.starId, hit: { kind: "event", label: "Galactic event" } };
    case "explored":
      return { starId: e.starId, hit: { kind: "explored", label: "Explored" } };
    default:
      return null;
  }
}

/**
 * The flashes for the viewer's events of the last turn: one per star, in the
 * colour of its most important event, with the label of that event (plus how
 * many more happened there). Stars flash in order of importance, a little
 * apart, so many at once stay readable.
 */
export function turnFlashes(view: PlayerView, events: readonly GameEvent[]): MapFlash[] {
  const byStar = new Map<string, Hit[]>();
  for (const e of events) {
    if (e.playerId !== view.viewer) continue;
    const h = hitOf(view, e);
    if (!h?.starId) continue;
    const list = byStar.get(h.starId) ?? [];
    list.push(h.hit);
    byStar.set(h.starId, list);
  }
  const stars = new Map(view.galaxy.stars.map((s) => [s.id, s]));
  const rank = (k: FlashKind) => PRIORITY.indexOf(k);
  const flashes: Omit<MapFlash, "delay">[] = [];
  for (const [starId, hits] of byStar) {
    const star = stars.get(starId);
    if (!star) continue;
    hits.sort((a, b) => rank(a.kind) - rank(b.kind));
    const top = hits[0]!;
    // Exploring only matters when nothing else happened there; it gets a small flash.
    const rest = hits.filter((h) => h.kind !== "explored").length - (top.kind === "explored" ? 0 : 1);
    const strength = top.kind === "explored" ? 0.45 : top.kind === "built" ? 0.75 : 1;
    flashes.push({ starId, x: star.x, y: star.y, kind: top.kind, color: FLASH_COLORS[top.kind], strength, label: rest > 0 ? `${top.label} +${rest}` : top.label });
  }
  flashes.sort((a, b) => rank(a.kind) - rank(b.kind) || a.starId.localeCompare(b.starId));
  const step = flashes.length > 1 ? Math.min(FLASH_STAGGER, FLASH_SPREAD / (flashes.length - 1)) : 0;
  return flashes.map((f, i) => ({ ...f, delay: i * step }));
}
