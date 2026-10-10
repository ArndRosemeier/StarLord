import {
  BUILDINGS_BY_ID, FIELD_NAMES, PROJECTS_BY_ID, TECHS, findDesign,
  type BuildItem, type GameEvent, type PlayerView,
} from "@starlord/sim";

export const fmt = (n: number, digits = 0) =>
  Number.isFinite(n) ? n.toLocaleString("en-US", { maximumFractionDigits: digits, minimumFractionDigits: 0 }) : "–";

export const signed = (n: number, digits = 0) => (n > 0 ? "+" : "") + fmt(n, digits);

export const pct = (n: number) => `${Math.round(n * 100)}%`;

/** "gasGiant" -> "Gas giant". */
export const words = (id: string) => {
  const s = id.replace(/([a-z])([A-Z])/g, "$1 $2").toLowerCase();
  return s.charAt(0).toUpperCase() + s.slice(1);
};

export function itemName(view: PlayerView, item: BuildItem): string {
  switch (item.kind) {
    case "building":
      return BUILDINGS_BY_ID[item.id]?.name ?? item.id;
    case "ship":
      return findDesign(view.players[view.viewer]!, item.designId)?.name ?? item.designId;
    case "project":
      return PROJECTS_BY_ID[item.id]?.name ?? item.id;
    case "tradeGoods":
      return "Trade Goods";
  }
}

export const playerName = (view: PlayerView, id: number) => view.players[id]?.name ?? `Player ${id}`;
export const starName = (view: PlayerView, id: string) => view.galaxy.stars.find((s) => s.id === id)?.name ?? "an unknown star";
export const colonyName = (view: PlayerView, id: string) => view.colonies[id]?.name ?? "a colony";
export const climateName = (t: string) => words(t);

/** Player-facing text for a turn event, plus the star it happened at if any. */
export function describeEvent(view: PlayerView, e: GameEvent): { text: string; starId?: string; tone: "good" | "bad" | "info" } {
  const colonyStar = (colonyId: string) => {
    const c = view.colonies[colonyId];
    const p = c && view.planets[c.planetId];
    return p?.starId;
  };
  switch (e.kind) {
    case "colonyFounded":
      return { text: `New colony founded: ${colonyName(view, e.colonyId)}.`, starId: view.planets[e.planetId]?.starId, tone: "good" };
    case "techLearned": {
      const how = e.source === "stolen" ? " (stolen by our spies)" : e.source === "trade" ? " (through a treaty)" : e.source === "salvage" ? " (salvaged)" : e.source === "event" ? "" : "";
      return { text: `Learned ${TECHS[e.techId]?.name ?? e.techId}${how}.`, tone: "good" };
    }
    case "hyperAdvance":
      return { text: `Hyper-advanced ${FIELD_NAMES[e.field]} reached level ${e.level}.`, tone: "good" };
    case "built":
      return { text: `${colonyName(view, e.colonyId)} finished ${itemName(view, e.item)}.`, starId: colonyStar(e.colonyId), tone: "info" };
    case "starvation":
      return { text: `${colonyName(view, e.colonyId)} is starving.`, starId: colonyStar(e.colonyId), tone: "bad" };
    case "explored":
      return { text: `Explored ${starName(view, e.starId)}.`, starId: e.starId, tone: "info" };
    case "commandRejected":
      return { text: `Order not carried out: ${e.reason}.`, tone: "bad" };
    case "combat":
      return { text: `Battle at ${starName(view, e.starId)}: ${e.won ? "victory" : "defeat"}.`, starId: e.starId, tone: e.won ? "good" : "bad" };
    case "colonyLost":
      return {
        text: e.how === "invaded"
          ? `${colonyName(view, e.colonyId)} was invaded by ${e.to === null ? "an enemy" : playerName(view, e.to)}.`
          : `${colonyName(view, e.colonyId)} was destroyed.`,
        starId: colonyStar(e.colonyId),
        tone: "bad",
      };
    case "colonyCaptured":
      return { text: `We captured ${colonyName(view, e.colonyId)} from ${playerName(view, e.from)}.`, starId: colonyStar(e.colonyId), tone: "good" };
    case "invasionFailed":
      return { text: `Our invasion of ${colonyName(view, e.colonyId)} was repelled.`, starId: colonyStar(e.colonyId), tone: "bad" };
    case "bombarded":
      return { text: `${colonyName(view, e.colonyId)} was bombarded; ${fmt(e.popLost)} population lost.`, starId: colonyStar(e.colonyId), tone: "bad" };
    case "diplomacy":
      return { text: `${playerName(view, e.other)}: ${e.what}.`, tone: "info" };
    case "spy":
      return { text: `Espionage (${playerName(view, e.other)}): ${e.what}.`, tone: "info" };
    case "leader":
      return { text: `Leader: ${e.what}.`, tone: "info" };
    case "council":
      return { text: `Galactic council: ${e.what}.`, tone: "info" };
    case "random":
      return { text: e.what, tone: "info" };
    case "raid":
      return { text: `Raiders strike at ${starName(view, e.starId)}!`, starId: e.starId, tone: "bad" };
    case "eliminated":
      return { text: `${playerName(view, e.playerId)} has been eliminated.`, tone: "bad" };
    case "victory":
      return { text: `${playerName(view, e.playerId)} wins the game (${e.how}).`, tone: "good" };
  }
}
