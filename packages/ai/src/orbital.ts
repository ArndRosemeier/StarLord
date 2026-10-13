import {
  ALL_WEAPONS, blocksInvasion, canMindControl, defendingTroops, findDesign, isHostile, relation,
  type Colony, type Command, type Fleet, type OrbitalChoice, type PlayerView,
} from "@starlord/sim";
import { me, myFleets, personality, shipStats } from "./util.js";

/** Aggression from which a computer ruler releases biological weapons despite the outrage (an estimate). */
const BIO_AGGRESSION = 0.6;

const carries = (view: PlayerView, f: Fleet, effect: "stellarConverter" | "spores") => {
  const owner = me(view);
  return f.ships.some((s) => findDesign(owner, s.designId)?.weapons.some((m) => {
    const w = ALL_WEAPONS[m.weaponId];
    return effect === "spores" ? w?.kind === "spores" : w?.effect === effect;
  }));
};

const troopsIn = (view: PlayerView, f: Fleet) =>
  f.ships.reduce((n, s) => n + (shipStats(view, f.ownerId, s.designId)?.troops ?? 0) * s.count, 0);

/**
 * What the empire's fleets do from orbit this turn to each enemy colony at a
 * star they are at or bound for, by intent, as the original's computer
 * players decide after a won battle:
 * - a colony we mean to take (troops or mind control in the fleets, no
 *   barrier shield) is bombed only while our troops can't yet beat its
 *   garrison, and never with biological weapons, so its people are kept;
 * - with a Stellar Converter in orbit, a colony we can't take is destroyed
 *   when it is behind a barrier shield or its owner's last system (the
 *   original's rule for finishing an empire off);
 * - otherwise bombard, adding biological weapons when the ruler is
 *   aggressive enough to bear the outrage.
 */
export function orbitalOrders(view: PlayerView): Command[] {
  const out: Command[] = [];
  const fleetsAt = new Map<string, Fleet[]>();
  for (const f of myFleets(view)) {
    const star = f.destStarId ?? f.starId;
    if (!star) continue;
    fleetsAt.set(star, [...(fleetsAt.get(star) ?? []), f]);
  }
  const aggression = personality(view).aggression;
  for (const c of Object.values(view.colonies)) {
    const starId = view.planets[c.planetId]?.starId;
    const fleets = starId ? fleetsAt.get(starId) : undefined;
    if (!fleets || !isHostile(view, view.viewer, c.ownerId) || view.players[c.ownerId]?.kind !== "empire") continue;
    if (relation(view, view.viewer, c.ownerId).status !== "war") continue;
    out.push({ type: "orbitalStrike", colonyId: c.id, choice: decide(view, c, fleets, aggression) });
  }
  return out;
}

function decide(view: PlayerView, c: Colony, fleets: Fleet[], aggression: number): OrbitalChoice {
  const barrier = blocksInvasion(c);
  const troops = fleets.reduce((n, f) => n + troopsIn(view, f), 0);
  const takeable = !barrier && (troops > 0 || fleets.some((f) => canMindControl(view, f, c)));
  if (takeable) return troops > defendingTroops(view, c) || fleets.some((f) => canMindControl(view, f, c)) ? "none" : "bomb";
  if (fleets.some((f) => carries(view, f, "stellarConverter"))) {
    const theirSystems = new Set(
      Object.values(view.colonies).filter((o) => o.ownerId === c.ownerId).map((o) => view.planets[o.planetId]?.starId),
    );
    if (barrier || theirSystems.size <= 1) return "destroy";
  }
  if (aggression >= BIO_AGGRESSION && !barrier && fleets.some((f) => carries(view, f, "spores"))) return "bio";
  return "bomb";
}
