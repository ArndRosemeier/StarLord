import { CLIMATES, computeOutput, population, type Colony, type Command, type PlayerView } from "@starlord/sim";
import { myColonies } from "./util.js";

/** Share of non-farmers that do research. */
const SCIENCE_SHARE = 0.35;

/**
 * Feeds the empire with as few farmers as possible, putting them where food
 * yield is best, then splits the rest between industry and research.
 */
export function jobOrders(view: PlayerView): Command[] {
  const me = view.players[view.viewer]!;
  const colonies = myColonies(view);
  const plan = new Map<string, Colony>();
  for (const c of colonies) {
    const pop = population(c);
    const sci = pop >= 3 ? Math.round(pop * SCIENCE_SHARE) : 0;
    plan.set(c.id, { ...c, farmers: 0, workers: pop - sci, scientists: sci });
  }

  const foodYield = (c: Colony) => CLIMATES[view.planets[c.planetId]!.type].foodPerFarmer;
  const balance = () =>
    [...plan.values()].reduce((sum, c) => sum + computeOutput(view.planets[c.planetId]!, me, c).foodNet, 0);

  // Add farmers one at a time on the best farmland until the empire is fed.
  let guard = 0;
  while (balance() < 0 && guard++ < 500) {
    const candidates = [...plan.values()]
      .filter((c) => (c.workers > 0 || c.scientists > 0) && foodYield(c) > 0)
      .sort((a, b) => foodYield(b) - foodYield(a));
    const c = candidates[0];
    if (!c) break;
    c.farmers++;
    if (c.workers > 0) c.workers--;
    else c.scientists--;
  }

  const out: Command[] = [];
  for (const c of colonies) {
    const p = plan.get(c.id)!;
    if (p.farmers !== c.farmers || p.workers !== c.workers || p.scientists !== c.scientists) {
      out.push({ type: "setJobs", colonyId: c.id, farmers: p.farmers, workers: p.workers, scientists: p.scientists });
    }
  }
  return out;
}
