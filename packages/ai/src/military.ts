import {
  canReach, colonyDefenseStrength, distance, isHostile, relation, type Command, type Fleet, type PlayerView,
} from "@starlord/sim";
import { colonyStar, fleetRoles, fleetStrength, hostileFleetsNear, me, myColonies, myFleets, personality, starById } from "./util.js";

function rallyStar(view: PlayerView): string | null {
  const player = me(view);
  const colonies = myColonies(view);
  const home = colonies.find((c) => colonyStar(view, c).id === player.homeStarId);
  const c = home ?? colonies.sort((a, b) => b.workers + b.farmers + b.scientists - (a.workers + a.farmers + a.scientists))[0];
  return c ? colonyStar(view, c).id : null;
}

/**
 * Gathers warships at a rally point, defends threatened colonies, and when at
 * war sends a strike force (with troop transports) against the nearest enemy
 * colony it can beat. In peacetime the strike force clears monster lairs.
 */
export function militaryOrders(view: PlayerView): Command[] {
  const player = me(view);
  const out: Command[] = [];
  const pers = personality(view);
  const wantDoctrine = pers.aggression > 0.6 ? 0.3 : 0.55;
  if (Math.abs(player.doctrine.retreatBelow - wantDoctrine) > 0.01) {
    out.push({ type: "setDoctrine", doctrine: { retreatBelow: wantDoctrine, focus: "nearest" } });
  }

  const rally = rallyStar(view);
  if (!rally) return out;
  const rallyPos = starById(view, rally);
  const fleets = myFleets(view);
  const military = fleets.filter((f) => {
    const roles = fleetRoles(view, f);
    return roles.has("warship") || roles.has("transport");
  });

  // Merge everything idle at the same star into one force.
  const byStar = new Map<string, Fleet[]>();
  for (const f of military) {
    if (!f.starId || f.destStarId) continue;
    const list = byStar.get(f.starId) ?? [];
    list.push(f);
    byStar.set(f.starId, list);
  }
  const merged = new Set<string>();
  for (const list of byStar.values()) {
    list.sort((a, b) => fleetStrength(view, b) - fleetStrength(view, a));
    if (list.length > 1) {
      out.push({ type: "mergeFleets", fleetIds: list.map((f) => f.id) });
      for (const f of list.slice(1)) merged.add(f.id);
    }
  }
  const forces = military.filter((f) => !merged.has(f.id));
  const strengthAt = (starId: string) =>
    (byStar.get(starId) ?? []).reduce((s, f) => s + fleetStrength(view, f), 0);

  // Defense: answer threats near our colonies with the closest strong-enough force.
  const busy = new Set<string>();
  for (const c of myColonies(view)) {
    const star = colonyStar(view, c);
    const threats = hostileFleetsNear(view, star, 3);
    if (threats.length === 0) continue;
    const threat = threats.reduce((s, f) => s + fleetStrength(view, f), 0);
    const responder = forces
      .filter((f) => !busy.has(f.id) && f.starId && fleetStrength(view, f) > threat * 1.2)
      .sort((a, b) => distance(a, star) - distance(b, star))[0];
    if (responder && responder.starId !== star.id && canReach(view, view.viewer, responder, star.id)) {
      busy.add(responder.id);
      out.push({ type: "moveFleet", fleetId: responder.id, destStarId: star.id });
    }
  }

  // Idle forces away from the rally point go home to gather.
  const main = forces
    .filter((f) => f.starId === rally && !f.destStarId)
    .sort((a, b) => fleetStrength(view, b) - fleetStrength(view, a))[0];
  for (const f of forces) {
    if (busy.has(f.id) || f.destStarId || !f.starId || f === main) continue;
    if (f.stance === "attack" && invadeOrStay(view, f, out)) continue;
    if (f.starId !== rally && canReach(view, view.viewer, f, rally)) out.push({ type: "moveFleet", fleetId: f.id, destStarId: rally });
  }
  if (!main || busy.has(main.id)) return out;
  const power = strengthAt(rally);

  const enemies = player.contacts.filter((id) => relation(view, view.viewer, id).status === "war");
  if (enemies.length > 0) {
    const targets = Object.values(view.colonies)
      .filter((c) => enemies.includes(c.ownerId))
      .map((c) => {
        const star = colonyStar(view, c);
        const guard = hostileFleetsNear(view, star, 1).reduce((s, f) => s + fleetStrength(view, f), 0);
        return { c, star, need: (colonyDefenseStrength(view, c) + guard) * 1.5 + 5 };
      })
      .filter((t) => t.need <= power && canReach(view, view.viewer, main, t.star.id))
      .sort((a, b) => distance(rallyPos, a.star) - distance(rallyPos, b.star));
    const t = targets[0];
    if (t && fleetRoles(view, main).has("warship")) {
      out.push({ type: "setStance", fleetId: main.id, stance: "attack" });
      out.push({ type: "moveFleet", fleetId: main.id, destStarId: t.star.id });
      return out;
    }
  }

  // Peacetime: clear the weakest monster lair we can beat.
  const monsters = Object.values(view.fleets).filter(
    (f) => view.players[f.ownerId]!.kind === "monsters" && f.starId && isHostile(view, view.viewer, f.ownerId),
  );
  const lair = monsters
    .filter((m) => fleetStrength(view, m) * 2 < power && canReach(view, view.viewer, main, m.starId!))
    .sort((a, b) => distance(rallyPos, a) - distance(rallyPos, b))[0];
  if (lair && fleetRoles(view, main).has("warship")) {
    out.push({ type: "moveFleet", fleetId: main.id, destStarId: lair.starId! });
    return out;
  }

  // Endgame: strike the raiders' home through the portal.
  const raiderHome = view.galaxy.stars.find((s) => s.special === "raiderHome");
  if (raiderHome && player.hasPortal && canReach(view, view.viewer, main, raiderHome.id)) {
    const fortress = Object.values(view.fleets).filter((f) => f.starId === raiderHome.id).reduce((s, f) => s + fleetStrength(view, f), 0);
    if (fortress > 0 ? power > fortress * 1.3 : power > 2000) out.push({ type: "moveFleet", fleetId: main.id, destStarId: raiderHome.id });
  }
  return out;
}

/** At an enemy colony: land troops when we have them, otherwise keep bombing. */
function invadeOrStay(view: PlayerView, f: Fleet, out: Command[]): boolean {
  const enemyColony = Object.values(view.colonies).find(
    (c) => view.planets[c.planetId]!.starId === f.starId && isHostile(view, view.viewer, c.ownerId),
  );
  if (!enemyColony) return false;
  if (fleetRoles(view, f).has("transport")) out.push({ type: "invade", fleetId: f.id, colonyId: enemyColony.id });
  return true;
}
