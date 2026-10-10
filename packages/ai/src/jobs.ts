import {
  FREIGHTERS, canFarm, computeOutput, isBlockaded, population, type Colony, type ColonyOutput, type Command, type PlayerView,
} from "@starlord/sim";
import { me, myColonies, personality } from "./util.js";

/** Food is worth this much industry or research where it is eaten... */
const FOOD_WORTH_LOCAL = 3;
/** ...and less when freighters have to carry it, since each one in use costs upkeep. */
const FOOD_WORTH_SHIPPED = FOOD_WORTH_LOCAL - 2 * FREIGHTERS.upkeepInUse;

/**
 * Feeds the empire with as few farmers as possible, putting each new farmer
 * where the food gained is worth most against the industry and research lost,
 * then splits the rest between industry and research. Food only moves by
 * freighter, so hungry colonies farm for themselves when the empire lacks the
 * freighters to feed them.
 */
export function jobOrders(view: PlayerView): Command[] {
  const player = me(view);
  const colonies = myColonies(view).filter((c) => !c.outpost);
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
  const output = (c: Colony): ColonyOutput => computeOutput(view.planets[c.planetId]!, player, c, ctx);
  const farmable = new Map(colonies.map((c) => [c.id, canFarm(view.planets[c.planetId]!, player)]));
  const blockaded = new Map(colonies.map((c) => [c.id, isBlockaded(view, c)]));
  const moving = (player.transfers ?? []).reduce((n, t) => n + t.count * FREIGHTERS.perColonist, 0);
  const capacity = Math.max(0, (player.freighters ?? 0) - moving) * FREIGHTERS.foodPerShip;

  /** The same colony with one more farmer, taken from research or industry to keep the wanted split. */
  const withFarmer = (c: Colony): Colony => {
    const next = { ...c, farmers: c.farmers + 1 };
    const rest = c.workers + c.scientists;
    if (c.scientists > 0 && (c.workers === 0 || c.scientists > Math.round((rest - 1) * share))) next.scientists--;
    else next.workers--;
    return next;
  };
  const current = new Map<string, ColonyOutput>();
  const trial = new Map<string, { colony: Colony; out: ColonyOutput }>();
  const refresh = (c: Colony) => {
    current.set(c.id, output(c));
    trial.delete(c.id);
  };
  for (const c of plan.values()) refresh(c);

  // Add farmers one at a time until every colony is fed, by freighter or by its own farms.
  for (let guard = 0; guard < 500; guard++) {
    let surplus = 0;
    let deficit = 0;
    let cutOff = false;
    const hungry = new Set<string>();
    for (const c of plan.values()) {
      const net = current.get(c.id)!.foodNet;
      if (net > 0 && !blockaded.get(c.id)) surplus += net;
      if (net < 0) {
        deficit += -net;
        hungry.add(c.id);
        if (blockaded.get(c.id)) cutOff = true;
      }
    }
    const shipped = deficit <= capacity && !cutOff;
    if (surplus >= deficit && shipped) break;
    const open = [...plan.values()].filter((c) => (c.workers > 0 || c.scientists > 0) && farmable.get(c.id));
    // Without enough freighters (or under blockade) a hungry colony must grow its own food;
    // a colony that can't farm waits for freighters, and farmers elsewhere only help if the empire is short overall.
    const local = open.filter((c) => hungry.has(c.id));
    const candidates = shipped ? open : local.length > 0 ? local : surplus < deficit ? open : [];
    let best: { c: Colony; score: number } | null = null;
    for (const c of candidates) {
      let t = trial.get(c.id);
      if (!t) {
        const colony = withFarmer(c);
        t = { colony, out: output(colony) };
        trial.set(c.id, t);
      }
      const now = current.get(c.id)!;
      const food = t.out.foodNet - now.foodNet;
      if (food <= 0) continue;
      const lost = now.industry - t.out.industry + now.research - t.out.research;
      const score = food * (hungry.has(c.id) ? FOOD_WORTH_LOCAL : FOOD_WORTH_SHIPPED) - lost;
      if (!best || score > best.score || (score === best.score && c.id < best.c.id)) best = { c, score };
    }
    if (!best) break;
    const next = trial.get(best.c.id)!.colony;
    plan.set(next.id, next);
    refresh(next);
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
