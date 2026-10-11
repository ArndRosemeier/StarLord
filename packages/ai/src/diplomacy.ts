import {
  TIER_OF_TECH, attitude, canSign, empireBonus, empireTotals, isDemand, monsterDemands, relation, type Command, type PlayerView,
  type Proposal, type ProposalKind, type ProposalTerms,
} from "@starlord/sim";
import { fleetStrength, me, myFleets, personality } from "./util.js";

function militaryPower(view: PlayerView, playerId: number): number {
  return Object.values(view.fleets)
    .filter((f) => f.ownerId === playerId)
    .reduce((s, f) => s + fleetStrength(view, f), 0);
}

function techValue(tech: string | undefined): number {
  return tech ? (TIER_OF_TECH[tech]?.cost ?? 0) : 0;
}

/** Whether to give in to a demand: it depends on how strong the demander is and how we feel about them. */
function acceptDemand(view: PlayerView, p: Proposal, feel: number, myPower: number): boolean {
  const ratio = militaryPower(view, p.from) / Math.max(1, myPower);
  const third = p.third;
  switch (p.kind) {
    case "demandTribute":
    case "demandTech":
      return ratio > 1.5 && feel > -40;
    case "demandStopSpying":
    case "demandRemoveFleet":
      return ratio > 1 || feel > 10;
    case "demandSystem":
      return ratio > 3;
    case "demandWar":
      return third !== undefined && feel > 30 && attitude(view, view.viewer, third) < 0;
    case "demandPeace": {
      if (third === undefined) return false;
      const r = relation(view, view.viewer, third);
      return feel > 20 && view.turn - r.since > 10;
    }
    case "demandBreakAlliance":
      return third !== undefined && ratio > 1.5 && feel > attitude(view, view.viewer, third) + 30;
    default:
      return false;
  }
}

/**
 * Answers proposals and demands, offers treaties and tech swaps to friendly
 * neighbors, leans on weak ones for tribute, sues for peace when a war drags
 * on, declares war on disliked weaker neighbors when its personality is
 * aggressive, and pays off monsters that threaten its systems.
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
    else if (p.kind === "nonAggression") accept = feel > 0;
    else if (p.kind === "alliance") accept = feel > 40;
    else if (p.kind === "techExchange") accept = feel > -10 && techValue(p.wantTechId) <= techValue(p.techId) * 1.25;
    else if (isDemand(p.kind)) accept = acceptDemand(view, p, feel, myPower);
    if (accept && canSign(view, p.from, p.to, p.kind, p)) accept = false;
    out.push({ type: "respond", proposalId: p.id, accept });
  }

  // A monster demanding tribute leaves if paid; pay when we can afford it.
  for (const ev of monsterDemands(view, view.viewer)) {
    if ((ev.strength ?? Infinity) <= player.bc) out.push({ type: "bribeMonster", eventId: ev.id });
  }

  // One new initiative per turn keeps the diplomatic screen readable for humans.
  for (const other of player.contacts) {
    const them = view.players[other]!;
    if (!them.alive) continue;
    const r = relation(view, view.viewer, other);
    const feel = attitude(view, view.viewer, other);
    const offer = (kind: ProposalKind, terms: ProposalTerms = {}) =>
      !canSign(view, view.viewer, other, kind, terms) && !view.proposals.some((p) => p.from === view.viewer && p.to === other && p.kind === kind);
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
    if (r.status === "none" && feel > 10 && offer("nonAggression")) {
      out.push({ type: "propose", to: other, kind: "nonAggression" });
      return out;
    }
    if (feel > 50 && (r.status === "peace" || r.status === "nonAggression") && offer("alliance")) {
      out.push({ type: "propose", to: other, kind: "alliance" });
      return out;
    }
    // Swap technologies of similar value with friends every so often.
    if (feel > 0 && (view.turn + other) % 15 === 7) {
      const want = them.techs.filter((t) => !player.techs.includes(t) && TIER_OF_TECH[t]).sort((a, b) => techValue(b) - techValue(a))[0];
      const give = want
        ? player.techs.filter((t) => !them.techs.includes(t) && TIER_OF_TECH[t] && techValue(t) >= techValue(want) * 0.8)
          .sort((a, b) => techValue(a) - techValue(b))[0]
        : undefined;
      if (want && give && offer("techExchange", { techId: give, wantTechId: want })) {
        out.push({ type: "propose", to: other, kind: "techExchange", techId: give, wantTechId: want });
        return out;
      }
    }
    // Lean on a much weaker neighbor we dislike for tribute.
    const theirPower = militaryPower(view, other);
    if (
      pers.aggression > 0.5 && feel < 0 && (view.turn + other) % 20 === 3 && myPower > Math.max(50, theirPower * 3) &&
      offer("demandTribute", { percent: 5 })
    ) {
      out.push({ type: "propose", to: other, kind: "demandTribute", percent: 5 });
      return out;
    }
    // War: dislike plus a clear military edge, scaled by temperament. Never two wars at once.
    const wars = player.contacts.filter((id) => relation(view, view.viewer, id).status === "war").length;
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
