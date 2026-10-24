import type { Command, PlayerView } from "@starlord/sim";
import { colonizationOrders } from "./colonization.js";
import { designOrders } from "./design.js";
import { diplomacyOrders } from "./diplomacy.js";
import { espionageOrders } from "./espionage.js";
import { explorationOrders } from "./exploration.js";
import { jobOrders } from "./jobs.js";
import { leaderOrders } from "./leaders.js";
import { militaryOrders } from "./military.js";
import { autoBuildOrders, productionOrders } from "./production.js";
import { researchOrders } from "./research.js";
import type { AutomationDomain } from "./strategies.js";

/**
 * Anything that issues orders for a player: the AI, the player's own
 * automation, or (later) a network peer. All of them only ever see a
 * PlayerView and only ever return Commands.
 */
export interface Controller {
  orders(view: PlayerView): Command[];
}

export const DOMAIN_INFO: Record<AutomationDomain, { name: string; description: string }> = {
  jobs: { name: "Jobs", description: "Balance farmers, workers and scientists on every colony." },
  production: { name: "Production", description: "Pick what each colony builds and rush items when rich." },
  research: { name: "Research", description: "Choose the next technology." },
  exploration: { name: "Exploration", description: "Send scouts to unexplored stars." },
  colonization: { name: "Colonization", description: "Send colony and outpost ships to the best planets." },
  design: { name: "Ship design", description: "Keep warship designs up to date with new technology." },
  military: { name: "Military", description: "Defend colonies, attack enemies and clear monster lairs." },
  diplomacy: { name: "Diplomacy", description: "Answer proposals, offer treaties and decide on war." },
  espionage: { name: "Espionage", description: "Assign spies to steal technology or sabotage." },
  leaders: { name: "Leaders", description: "Hire and assign leaders." },
};

export const ALL_DOMAINS = Object.keys(DOMAIN_INFO) as AutomationDomain[];

/** Order matters: designs before production, leaders before military merges fleets. */
const MODULES: [AutomationDomain, (view: PlayerView) => Command[]][] = [
  ["diplomacy", diplomacyOrders],
  ["research", researchOrders],
  ["design", designOrders],
  ["jobs", jobOrders],
  ["production", productionOrders],
  ["exploration", explorationOrders],
  ["colonization", colonizationOrders],
  ["leaders", leaderOrders],
  ["military", militaryOrders],
  ["espionage", espionageOrders],
];

export function createController(domains: readonly AutomationDomain[] = ALL_DOMAINS): Controller {
  const on = new Set(domains);
  return {
    orders(view) {
      return dropScrappedFleets(view, MODULES.filter(([d]) => on.has(d)).flatMap(([, run]) => run(view)));
    },
  };
}

/** Production may scrap or refit a whole fleet; later modules' orders for it would be rejected, so drop them. */
function dropScrappedFleets(view: PlayerView, orders: Command[]): Command[] {
  const scrapped = new Map<string, number>();
  for (const c of orders) if (c.type === "scrapShips" || c.type === "refitShips") scrapped.set(c.fleetId, (scrapped.get(c.fleetId) ?? 0) + c.count);
  const gone = new Set(
    [...scrapped].filter(([id, n]) => {
      const f = view.fleets[id];
      return !!f && n >= f.ships.reduce((m, s) => m + s.count, 0);
    }).map(([id]) => id),
  );
  if (gone.size === 0) return orders;
  return orders.filter((c) => {
    if (c.type === "scrapShips" || c.type === "refitShips") return true;
    const ids: unknown[] = [(c as { fleetId?: string }).fleetId, c.type === "assignLeader" ? c.targetId : undefined];
    return !ids.some((id) => typeof id === "string" && gone.has(id));
  });
}

/** Orders for one player: full AI for computer empires, chosen areas for humans. */
export function automationOrders(view: PlayerView): Command[] {
  const p = view.players[view.viewer]!;
  const domains = p.isHuman ? (p.automation.filter((d) => d in DOMAIN_INFO) as AutomationDomain[]) : ALL_DOMAINS;
  // Auto build items in the queue run whatever the player automates.
  return [...createController(domains).orders(view), ...autoBuildOrders(view)];
}

/**
 * Orders for a human empire whose player is away from an online game: the computer runs everything
 * but diplomacy, so no treaty is signed or broken in their name.
 */
export function standInOrders(view: PlayerView): Command[] {
  return [...createController(ALL_DOMAINS.filter((d) => d !== "diplomacy")).orders(view), ...autoBuildOrders(view)];
}

export { STRATEGIES, strategyOf, type AutomationDomain, type StrategyInfo } from "./strategies.js";
export { colonizationOrders, colonizationTargets, outpostTargets } from "./colonization.js";
export { DOCTRINE_MARGIN, HULL_STRATEGIES, autoDesign, bestWarship } from "./design.js";
export { autoBuildPick, type AutoBuildPick } from "./production.js";
export { LEAN_PULL } from "./research.js";
export { BIO_AGGRESSION } from "./orbital.js";
export {
  BOLD_AGGRESSION, BOLD_RETREAT, CAUTIOUS_RETREAT, MILITARIST_AGGRESSION, OBJECTIVE_SCIENCE, TEMPER_AGGRESSION, personalityOf,
} from "./util.js";
export { answerOrders, answerProposal, audienceAnswer } from "./diplomacy.js";
export * from "./simulate.js";
export * from "./combatLab.js";
