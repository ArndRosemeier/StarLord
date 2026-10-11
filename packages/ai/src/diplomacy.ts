import {
  AI_WAR, NO_WAR_MULT, TEMPERAMENTS, TIER_OF_TECH, attitude, settledShare, temperament, audienceTired, isScoredTreaty, patience, treatyAnswer, type Price, canSign, empireBonus, empireTotals, isDemand, monsterDemands, relation, type Command, type PlayerView,
  type Proposal, type ProposalKind, type ProposalTerms,
} from "@starlord/sim";
import { strategyOf } from "./strategies.js";
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
 * Whether the viewer accepts a proposal put to it, on the next turn or at
 * once in an audience.
 */
export function answerProposal(view: PlayerView, p: Proposal): boolean {
  return audienceAnswer(view, p).accept;
}

/**
 * The viewer's full answer to a proposal: accept or not, and for a treaty it
 * would refuse, perhaps a price it would sign for (the original's counter-offer).
 */
export function audienceAnswer(view: PlayerView, p: Proposal): { accept: boolean; price?: Price } {
  const peaceful = strategyOf(view, "diplomacy") === "peaceful";
  // A peaceful empire takes treaties it would otherwise turn down.
  const warmth = peaceful ? 15 : 0;
  if (canSign(view, p.from, p.to, p.kind, p)) return { accept: false };
  if (isScoredTreaty(p.kind)) {
    const a = treatyAnswer(view, p, warmth);
    if (a.kind === "accept") return { accept: true };
    // A counter-offer is a proposal back to them; skip it if they would not hear it.
    if (a.kind === "price" && !audienceTired(view, view.viewer, p.from) && !canSign(view, view.viewer, p.from, p.kind, { price: a.price })) {
      return { accept: false, price: a.price };
    }
    return { accept: false };
  }
  const myPower = myFleets(view).reduce((s, f) => s + fleetStrength(view, f), 0);
  // Xeno Psychology, telepathy, charisma and Diplomat leaders make every deal the proposer offers more appealing.
  const proposer = view.players[p.from]!;
  const feel = attitude(view, view.viewer, p.from) + empireBonus(proposer).diplomacy + (proposer.diplomacyBonus ?? 0) + warmth;
  if (p.kind === "techExchange") return { accept: feel > -10 && techValue(p.wantTechId) <= techValue(p.techId) * 1.25 };
  if (isDemand(p.kind)) return { accept: acceptDemand(view, p, feel, myPower) };
  return { accept: false };
}

/** Answers to a proposal as orders: the answer, plus a counter-offer when the viewer names a price. */
export function answerOrders(view: PlayerView, p: Proposal): Command[] {
  const a = audienceAnswer(view, p);
  const out: Command[] = [{ type: "respond", proposalId: p.id, accept: a.accept }];
  if (a.price) out.push({ type: "propose", to: p.from, kind: p.kind, price: a.price });
  return out;
}

/**
 * Answers proposals and demands, offers treaties and tech swaps to friendly
 * neighbors, leans on weak ones for tribute, sues for peace when a war drags
 * on, declares war on disliked weaker neighbors when its personality is
 * aggressive, and pays off monsters that threaten its systems. The peaceful
 * strategy never starts a war or makes demands and settles wars quickly; the
 * aggressive one plays with the most warlike temperament.
 */
export function diplomacyOrders(view: PlayerView): Command[] {
  const player = me(view);
  const out: Command[] = [];
  const strategy = strategyOf(view, "diplomacy");
  const peaceful = strategy === "peaceful";
  const base = personality(view);
  const pers = strategy === "aggressive" ? { ...base, aggression: Math.max(base.aggression, 0.9) } : base;
  const myPower = myFleets(view).reduce((s, f) => s + fleetStrength(view, f), 0);
  const myPop = empireTotals(view, view.viewer).population;
  const temper = temperament(view, view.viewer);
  const noWar = temper ? TEMPERAMENTS[temper].noWar : 0;
  const lust = strategy === "aggressive" ? Math.max(0.9, pers.aggression) : temper ? (pers.aggression + TEMPERAMENTS[temper].warLust) / 2 : pers.aggression;
  const crowded = settledShare(view) >= AI_WAR.crowdedShare || view.turn >= AI_WAR.crowdedTurn;
  /** First turn a treaty with them no longer stops us declaring war. */
  const bound = (r: ReturnType<typeof relation>) => Math.max(
    r.status === "nonAggression" ? r.since + noWar * NO_WAR_MULT.nonAggression : 0,
    r.trade ? (r.tradeSince ?? r.since) + noWar * NO_WAR_MULT.trade : 0,
    r.research ? (r.researchSince ?? r.since) + noWar * NO_WAR_MULT.research : 0,
    r.peaceUntil ?? 0,
  );

  for (const p of view.proposals.filter((x) => x.to === view.viewer)) out.push(...answerOrders(view, p));

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
    // Computer rulers wait until the other side's patience has recovered before asking again.
    const offer = (kind: ProposalKind, terms: ProposalTerms = {}) =>
      !canSign(view, view.viewer, other, kind, terms) && !view.proposals.some((p) => p.from === view.viewer && p.to === other && p.kind === kind) &&
      patience(view, other, view.viewer) >= 0 && !audienceTired(view, view.viewer, other);
    if (r.status === "war") {
      const tired = peaceful ? view.turn - r.since > 10 : view.turn - r.since > 30 && militaryPower(view, other) >= myPower * 0.8;
      if (tired && offer("peace")) {
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
    if (feel > 50 && r.status === "nonAggression" && offer("alliance")) {
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
      !peaceful && pers.aggression > 0.5 && feel < 0 && (view.turn + other) % 20 === 3 && myPower > Math.max(50, theirPower * 3) &&
      offer("demandTribute", { percent: 5 })
    ) {
      out.push({ type: "propose", to: other, kind: "demandTribute", percent: 5 });
      return out;
    }
    // War: dislike plus a clear military edge, or any neighbor it doesn't love once the galaxy is crowded,
    // scaled by temperament. Never two wars at once, and never while a treaty still binds (the original's NOWAR).
    const wars = player.contacts.filter((id) => relation(view, view.viewer, id).status === "war").length;
    const theirPop = empireTotals(view, other).population;
    const edge = (x: number) => myPower > Math.max(AI_WAR.minPower, theirPower * (x - lust));
    const wanted = feel < AI_WAR.dislike - lust * AI_WAR.dislikeSpan ? edge(AI_WAR.edge) : crowded && feel < AI_WAR.crowdedMaxAttitude && edge(AI_WAR.crowdedEdge);
    if (
      !peaceful && wars === 0 && view.turn > (strategy === "aggressive" ? AI_WAR.earliestTurnAggressive : AI_WAR.earliestTurn) &&
      r.status !== "alliance" && view.turn >= bound(r) && myPop > theirPop * AI_WAR.minPopShare && wanted
    ) {
      out.push({ type: "declareWar", target: other });
      return out;
    }
  }
  return out;
}
