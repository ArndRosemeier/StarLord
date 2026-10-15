import {
  BLOCKADE_PENALTY, BUILDINGS_BY_ID, FIELD_NAMES, PROJECTS_BY_ID, TECHS, findDesign,
  type BuildItem, type CombatReport, type GameEvent, type PlayerView,
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

/** What became of each beaten empire's ships left at the star after a battle, one sentence each. */
export function aftermathLines(view: PlayerView, report: CombatReport): string[] {
  return (report.aftermath ?? []).map((a) => {
    const mine = a.ownerId === view.viewer;
    const owner = view.players[a.ownerId];
    const total = a.ships.reduce((n, s) => n + s.count, 0);
    const ships = mine
      ? a.ships.map((s) => `${s.count} ${findDesign(owner!, s.designId)?.name ?? words(s.designId)}`).join(", ")
      : `${total} ship${total === 1 ? "" : "s"}`;
    const whose = mine ? "Your" : `${playerName(view, a.ownerId)}'s`;
    const verb = total === 1 ? "was" : "were";
    switch (a.fate) {
      case "withdrew":
        return `${whose} remaining ships (${ships}) withdrew to ${starName(view, a.toStarId!)}.`;
      case "stayed":
        return `${whose} remaining ships (${ships}) stay in orbit by their colony here.`;
      case "lost":
        return `${whose} remaining ships (${ships}) ${verb} lost: ${a.why === "unescorted" ? "no warship protected them"
          : a.why === "flux" ? "the hyperspace flux kept them from getting away" : "there was no colony to withdraw to"}.`;
    }
  });
}

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
    case "refit": {
      const me = view.players[view.viewer]!;
      const from = findDesign(me, item.fromDesignId)?.name ?? item.fromDesignId;
      return `Refit ${from} → ${findDesign(me, item.designId)?.name ?? item.designId}`;
    }
  }
}

export const playerName = (view: PlayerView, id: number) => view.players[id]?.name ?? `Player ${id}`;
export const starName = (view: PlayerView, id: string) => view.galaxy.stars.find((s) => s.id === id)?.name ?? "an unknown star";
export const colonyName = (view: PlayerView, id: string) => view.colonies[id]?.name ?? "a colony";
export const climateName = (t: string) => words(t);

/** Who holds a blockade, for player-facing text: "the Kaltari and a space monster". */
export function blockaderNames(view: PlayerView, ids: readonly number[]): string {
  const names = ids.map((id) => (view.players[id]?.kind === "monsters" ? "a space monster" : `the ${playerName(view, id)}`));
  return names.length <= 1 ? names[0] ?? "an enemy" : `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`;
}

/** Player-facing text for a turn event, plus the star it happened at if any. */
const buildingList = (ids: readonly string[]) => ids.map((b) => BUILDINGS_BY_ID[b]?.name ?? b).join(", ");

/** What a takeover cost and left behind, for the captor's report. */
function captureDetail(e: Extract<GameEvent, { kind: "colonyCaptured" }>): string {
  const parts: string[] = [];
  if (e.lostBuildings?.length) parts.push(`Torn down: ${buildingList(e.lostBuildings)}${e.refund ? ` (${fmt(e.refund)} BC back)` : ""}.`);
  if (e.garrison !== undefined) parts.push(`Garrison: ${fmt(e.garrison)} marine${e.garrison === 1 ? "" : "s"}.`);
  if (e.reboarded) parts.push(`${fmt(e.reboarded)} troop ship${e.reboarded === 1 ? "" : "s"} re-boarded by the survivors.`);
  parts.push("Build queue and trained tanks lost.");
  return ` ${parts.join(" ")}`;
}

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
    case "baseReady":
      return { text: `${colonyName(view, e.colonyId)} finished a ${PROJECTS_BY_ID[e.projectId]?.name ?? e.projectId}. Choose which planet it goes to.`, starId: colonyStar(e.colonyId), tone: "good" };
    case "baseScrapped":
      return { text: `${colonyName(view, e.colonyId)} finished a ${PROJECTS_BY_ID[e.projectId]?.name ?? e.projectId}, but no free planet was left in the system. It was scrapped for ${fmt(e.refund)} BC.`, starId: colonyStar(e.colonyId), tone: "bad" };
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
        text: (e.how === "invaded"
          ? `${colonyName(view, e.colonyId)} was invaded by ${e.to === null ? "an enemy" : playerName(view, e.to)}.`
          : e.how === "mindControlled"
            ? `${colonyName(view, e.colonyId)} fell under the mind control of ${e.to === null ? "an enemy" : playerName(view, e.to)}.`
          : e.how === "revolted"
            ? `${colonyName(view, e.colonyId)} revolted and went back to ${e.to === null ? "its old rulers" : playerName(view, e.to)}.`
            : `${colonyName(view, e.colonyId)} was destroyed.`) +
          (e.lostBuildings?.length ? ` Torn down in the takeover: ${buildingList(e.lostBuildings)}.` : ""),
        starId: colonyStar(e.colonyId),
        tone: "bad",
      };
    case "colonyCaptured": {
      const head = e.mindControl
        ? `Our telepaths took ${colonyName(view, e.colonyId)} from ${playerName(view, e.from)} by mind control; its people are ours at once.`
        : e.revolt
          ? `${colonyName(view, e.colonyId)} rose against ${playerName(view, e.from)} and is ours again.`
          : `We captured ${colonyName(view, e.colonyId)} from ${playerName(view, e.from)}.`;
      return { text: `${head}${captureDetail(e)}`, starId: colonyStar(e.colonyId), tone: "good" };
    }
    case "invasionFailed":
      return { text: `Our invasion of ${colonyName(view, e.colonyId)} was repelled.`, starId: colonyStar(e.colonyId), tone: "bad" };
    case "bombarded":
      return { text: `${colonyName(view, e.colonyId)} was bombarded; ${fmt(e.popLost)} population lost.`, starId: colonyStar(e.colonyId), tone: "bad" };
    case "orbitalStrike": {
      if (e.planetDestroyed) {
        const who = e.by === view.viewer ? "Our Stellar Converter destroyed" : `The ${playerName(view, e.by)} destroyed`;
        return { text: `${who} the planet of ${e.colonyName} at ${starName(view, e.starId)}; it is an asteroid belt now and ${fmt(e.popKilled)} population died.`, starId: e.starId, tone: e.by === view.viewer ? "info" : "bad" };
      }
      const how = e.choice === "bio" ? "Our bombs and biological weapons struck" : "Our fleet bombarded";
      const losses = [`${fmt(e.popKilled)} population`, `${fmt(e.buildingsLost)} building${e.buildingsLost === 1 ? "" : "s"}`].join(" and ");
      const end = e.colonyGone ? "; nobody is left there" : "";
      return { text: `${how} ${e.colonyName} (${playerName(view, e.victim)}): ${losses} destroyed${end}.`, starId: e.starId, tone: "info" };
    }
    case "diplomacy":
      return { text: `${playerName(view, e.other)}: ${e.what}.`, tone: "info" };
    case "spy":
      return { text: `Espionage (${playerName(view, e.other)}): ${e.what}.`, tone: "info" };
    case "leader":
      return { text: `Leader: ${e.what}.`, tone: "info" };
    case "council":
      return { text: `Galactic council: ${e.what.replace(/\.$/, "")}.`, tone: "info" };
    case "random":
      return { text: e.what, tone: "info" };
    case "blockade": {
      const at = starName(view, e.starId);
      if (e.lifted) return { text: `The blockade of ${at} is over: production there is back to normal and freighters get through again.`, starId: e.starId, tone: "good" };
      if (e.victim === view.viewer) {
        const who = blockaderNames(view, e.by);
        return { text: `${who.charAt(0).toUpperCase()}${who.slice(1)} blockade${e.by.length === 1 && view.players[e.by[0]!]?.kind === "monsters" ? "s" : ""} ${at}: farmers and workers there make ${BLOCKADE_PENALTY}% less, and no freighter brings food or colonists in or takes food out.`, starId: e.starId, tone: "bad" };
      }
      return { text: `Our warships blockade the ${playerName(view, e.victim)} at ${at}: their farmers and workers there make ${BLOCKADE_PENALTY}% less, and their freighters can't get through.`, starId: e.starId, tone: "good" };
    }
    case "raid":
      return { text: `Raiders strike at ${starName(view, e.starId)}!`, starId: e.starId, tone: "bad" };
    case "eliminated":
      return { text: `${playerName(view, e.playerId)} has been eliminated.`, tone: "bad" };
    case "empireFell":
      return e.how === "destroyed"
        ? { text: `Galactic News: the ${playerName(view, e.fallen)} have been destroyed.`, tone: e.fallen === view.viewer ? "bad" : "info" }
        : {
          text: `Galactic News: the ${playerName(view, e.fallen)} surrendered to the ${playerName(view, e.to ?? e.fallen)}.`,
          tone: e.to === view.viewer ? "good" : e.fallen === view.viewer ? "bad" : "info",
        };
    case "raidersDefeated":
      return {
        text: e.by === view.viewer
          ? "Your fleet has destroyed the Vexari in their own dimension. The galaxy bows to you."
          : `The ${playerName(view, e.by)} have destroyed the Vexari in their own dimension. Every empire capitulates to them.`,
        tone: e.by === view.viewer ? "good" : "bad",
      };
    case "victory":
      return { text: `${playerName(view, e.playerId)} wins the game (${e.how}).`, tone: "good" };
  }
}
