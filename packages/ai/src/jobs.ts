import { CLIMATES, computeOutput, population, type Colony, type Command, type PlayerView } from "@starlord/sim";
import { me, myColonies, personality } from "./util.js";

/**
 * Feeds the empire with as few farmers as possible, putting them where food
 * yield is best, then splits the rest between industry and research.
 */
export function jobOrders(view: PlayerView): Command[] {
  const player = me(view);
  const colonies = myColonies(view);
  const share = personality(view).science;
  const plan = new Map<string, Colony>();
  for (const c of colonies) {
    // Natives only ever farm.
    const natives = c.natives ?? 0;
    const free = population(c) - natives;
    const sci = free >= 3 ? Math.round(free * share) : 0;
    plan.set(c.id, { ...c, farmers: natives, workers: free - sci, scientists: sci });
  }

  const ctx = { turn: view.turn };
  const foodYield = (c: Colony) => CLIMATES[view.planets[c.planetId]!.type].foodPerFarmer;
  const balance = () =>
    [...plan.values()].reduce((sum, c) => sum + computeOutput(view.planets[c.planetId]!, player, c, ctx).foodNet, 0);

  // Add farmers one at a time on the best farmland until the empire is fed.
  let guard = 0;
  while (balance() < 0 && guard++ < 500) {
    const candidates = [...plan.values()]
      .filter((c) => (c.workers > 0 || c.scientists > 0) && foodYield(c) > 0)
      .sort((a, b) => foodYield(b) - foodYield(a));
    const c = candidates[0];
    if (!c) break;
    c.farmers++;
    // Keep the industry/research split the empire wants among whoever is left.
    const rest = c.workers + c.scientists;
    if (c.scientists > 0 && (c.workers === 0 || c.scientists > Math.round((rest - 1) * share))) c.scientists--;
    else c.workers--;
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
