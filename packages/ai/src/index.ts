import type { Command, PlayerView } from "@starlord/sim";
import { colonizationOrders } from "./colonization.js";
import { explorationOrders } from "./exploration.js";
import { jobOrders } from "./jobs.js";
import { productionOrders } from "./production.js";
import { researchOrders } from "./research.js";

/**
 * Anything that issues orders for a player: the AI, the player's own
 * automation, or (later) a network peer. All of them only ever see a
 * PlayerView and only ever return Commands.
 */
export interface Controller {
  orders(view: PlayerView): Command[];
}

/**
 * Areas of play that can be handed to the computer. The AI is simply every
 * domain switched on; a human player switches on only the ones they find dull.
 */
export type AutomationDomain = "jobs" | "production" | "research" | "exploration" | "colonization";

export const ALL_DOMAINS: AutomationDomain[] = ["jobs", "production", "research", "exploration", "colonization"];

const MODULES: Record<AutomationDomain, (view: PlayerView) => Command[]> = {
  jobs: jobOrders,
  production: productionOrders,
  research: researchOrders,
  exploration: explorationOrders,
  colonization: colonizationOrders,
};

export function createController(domains: AutomationDomain[] = ALL_DOMAINS): Controller {
  return {
    orders(view) {
      return domains.flatMap((d) => MODULES[d](view));
    },
  };
}

export { colonizationTargets } from "./colonization.js";
