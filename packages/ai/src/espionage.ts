import { empireTotals, relation, type Command, type PlayerView } from "@starlord/sim";
import { me } from "./util.js";

/** Keeps a home guard of spies and sends the rest to steal from the most advanced rival or sabotage enemies. */
export function espionageOrders(view: PlayerView): Command[] {
  const player = me(view);
  const out: Command[] = [];
  const guard = Math.ceil(Object.values(view.colonies).filter((c) => c.ownerId === view.viewer).length / 5);
  const spare = player.spies.home - guard;
  if (spare <= 0) return out;
  const rivals = player.contacts.filter((id) => view.players[id]!.alive);
  if (rivals.length === 0) return out;
  const enemy = rivals.find((id) => relation(view, view.viewer, id).status === "war");
  const leader = rivals.sort((a, b) => view.players[b]!.techs.length - view.players[a]!.techs.length)[0]!;
  const target = enemy ?? leader;
  if (enemy === undefined && view.players[leader]!.techs.length <= player.techs.length) return out;
  const current = player.spies.abroad[target]?.count ?? 0;
  const mission = enemy !== undefined && empireTotals(view, view.viewer).population > 10 ? "sabotage" : "steal";
  out.push({ type: "setSpies", target, count: current + spare, mission });
  return out;
}
