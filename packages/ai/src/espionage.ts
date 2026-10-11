import { empireTotals, relation, type Command, type PlayerView } from "@starlord/sim";
import { strategyOf } from "./strategies.js";
import { me } from "./util.js";

/**
 * Keeps a home guard of spies and sends the rest to steal from the most advanced rival or sabotage enemies.
 * Defensive keeps (and calls back) every spy; thieves always steal; saboteurs always sabotage an enemy at war.
 */
export function espionageOrders(view: PlayerView): Command[] {
  const player = me(view);
  const strategy = strategyOf(view, "espionage");
  const out: Command[] = [];
  if (strategy === "defensive") {
    for (const [target, s] of Object.entries(player.spies.abroad)) {
      if (s.count > 0 && player.contacts.includes(Number(target))) out.push({ type: "setSpies", target: Number(target), count: 0, mission: s.mission });
    }
    return out;
  }
  const guard = Math.ceil(Object.values(view.colonies).filter((c) => c.ownerId === view.viewer).length / 5);
  const spare = player.spies.home - guard;
  if (spare <= 0) return out;
  const rivals = player.contacts.filter((id) => view.players[id]!.alive);
  if (rivals.length === 0) return out;
  const enemy = rivals.find((id) => relation(view, view.viewer, id).status === "war");
  const leader = rivals.sort((a, b) => view.players[b]!.techs.length - view.players[a]!.techs.length)[0]!;
  // Thieves go where the technology is, war or not.
  const target = strategy === "thieves" ? leader : enemy ?? leader;
  if ((strategy === "thieves" || enemy === undefined) && view.players[leader]!.techs.length <= player.techs.length) return out;
  const current = player.spies.abroad[target]?.count ?? 0;
  const sabotage = strategy === "saboteurs" || empireTotals(view, view.viewer).population > 10;
  const mission = strategy !== "thieves" && target === enemy && sabotage ? "sabotage" : "steal";
  out.push({ type: "setSpies", target, count: current + spare, mission });
  return out;
}
