import {
  attitude, canSign, empireBonus, empireTotals, relation, type Command, type PlayerView, type ProposalKind,
} from "@starlord/sim";
import { fleetStrength, me, myFleets, personality } from "./util.js";

function militaryPower(view: PlayerView, playerId: number): number {
  return Object.values(view.fleets)
    .filter((f) => f.ownerId === playerId)
    .reduce((s, f) => s + fleetStrength(view, f), 0);
}

/**
 * Accepts treaties from empires it likes, offers trade and research to
 * friendly neighbors, sues for peace when a war drags on, and declares war on
 * disliked, weaker neighbors when its personality is aggressive.
 */
export function diplomacyOrders(view: PlayerView): Command[] {
  const player = me(view);
  const out: Command[] = [];
  const pers = personality(view);
  const myPower = myFleets(view).reduce((s, f) => s + fleetStrength(view, f), 0);
  const myPop = empireTotals(view, view.viewer).population;

  for (const p of view.proposals.filter((x) => x.to === view.viewer)) {
    // Xeno Psychology, telepathy, charisma and Diplomat leaders make every deal the proposer offers more appealing.
    const proposer = view.players[p.from]!;
    const feel = attitude(view, view.viewer, p.from) + empireBonus(proposer).diplomacy + (proposer.diplomacyBonus ?? 0);
    const r = relation(view, view.viewer, p.from);
    let accept = false;
    if (p.kind === "peace" || p.kind === "ceasefire") {
      const theirPower = militaryPower(view, p.from);
      accept = view.turn - r.since > 15 && (feel > -50 || theirPower > myPower);
    } else if (p.kind === "trade" || p.kind === "research") accept = feel > -15;
    else if (p.kind === "alliance") accept = feel > 40;
    out.push({ type: "respond", proposalId: p.id, accept });
  }

  // One new initiative per turn keeps the diplomatic screen readable for humans.
  for (const other of player.contacts) {
    const them = view.players[other]!;
    if (!them.alive) continue;
    const r = relation(view, view.viewer, other);
    const feel = attitude(view, view.viewer, other);
    const offer = (kind: ProposalKind) => !canSign(view, view.viewer, other, kind) && !view.proposals.some((p) => p.from === view.viewer && p.to === other && p.kind === kind);
    if (r.status === "war") {
      if (view.turn - r.since > 30 && militaryPower(view, other) >= myPower * 0.8 && offer("peace")) {
        out.push({ type: "propose", to: other, kind: "peace" });
        return out;
      }
      continue;
    }
    if (feel > 5 && (view.turn + other) % 10 === 0) {
      for (const kind of ["trade", "research"] as const) {
        if (offer(kind)) {
          out.push({ type: "propose", to: other, kind });
          return out;
        }
      }
    }
    if (feel > 50 && r.status === "peace" && offer("alliance")) {
      out.push({ type: "propose", to: other, kind: "alliance" });
      return out;
    }
    if (r.status === "none" && feel > 10 && offer("peace")) {
      // A non-aggression pact (shown as peace) between friendly neighbors.
      continue;
    }
    // War: dislike plus a clear military edge, scaled by temperament. Never two wars at once.
    const wars = player.contacts.filter((id) => relation(view, view.viewer, id).status === "war").length;
    const theirPower = militaryPower(view, other);
    const theirPop = empireTotals(view, other).population;
    if (
      wars === 0 && view.turn > 60 && r.status !== "alliance" &&
      feel < 20 - pers.aggression * 60 && myPower > Math.max(20, theirPower * (2.2 - pers.aggression)) && myPop > theirPop * 0.7
    ) {
      out.push({ type: "declareWar", target: other });
      return out;
    }
  }
  return out;
}
