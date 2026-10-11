import {
  ATTITUDE, ATTITUDE_EVENTS, PATIENCE, PEACE_TREATY_TURNS, TEMPERAMENTS, TREATY_ANSWER, TREATY_YIELD, temperament, treatyAcceptChance, treatyPriceChance, treatyScore, empireTotals, empires, isDemand, relation, treatyPotential, treatyTotals,
  treatyYield, tributeAmount, type PlayerView, type Price, type Proposal, type ProposalKind, type TreatyName,
} from "@starlord/sim";
import { fmt, playerName, signed, starName } from "../ui/format";
import { techName } from "./terms";

/**
 * Plain statements of what treaties, proposals and diplomatic actions do,
 * with the rule numbers from the sim, so the player never has to guess.
 * `me` is the player, `them` the other empire.
 */

const attitudeLine = (n: number) => `their attitude toward you ${signed(n)}`;

/** Empires allied with `who`, who would join a war on them. */
function alliesOf(view: PlayerView, who: number, except: number): string[] {
  return empires(view)
    .filter((p) => p.alive && p.id !== who && p.id !== except && relation(view, who, p.id).status === "alliance")
    .map((p) => p.name);
}

/** How likely a computer ruler is to accept a treaty now, and why; empty for a human ruler or other kinds. */
export function answerOdds(view: PlayerView, me: number, them: number, kind: ProposalKind): string {
  if (view.players[them]?.isHuman) return "";
  if (!(kind in TREATY_ANSWER.need) && kind !== "peace" && kind !== "ceasefire") return "";
  const t = treatyScore(view, me, them, kind, null);
  const parts = t.parts.map((p) => `${p.why} ${signed(p.value)}`).join(", ");
  if (t.blocked) return ` They refuse: ${t.blocked}.`;
  const price = Math.round(treatyPriceChance(view, me, them, kind) * 100);
  return ` Chance they accept now: ${Math.round(treatyAcceptChance(view, me, them, kind) * 100)}%${price ? `, and ${price}% that they name a price instead` : ""} (${parts}, plus a d100; accepted at 0 or more, a price from ${TREATY_ANSWER.bigPrice}).`;
}

/** A price in words: "120 BC", "Fusion Drive", "a 5% tribute (about 3 BC a turn)", "the Vega system". */
export function priceText(view: PlayerView, payer: number, price: Price): string {
  if (price.bc) return `${fmt(price.bc)} BC`;
  if (price.techId) return `your knowledge of ${techName(price.techId)}`;
  if (price.tribute) return `a ${price.tribute}% tribute, about ${fmt(tributeAmount(view, payer, price.tribute), 1)} BC a turn until you stop`;
  if (price.starId) return `the ${starName(view, price.starId)} system`;
  return "nothing";
}

/** A computer ruler's temperament and what it does to treaty answers. */
export function temperamentText(view: PlayerView, them: number): { name: string; text: string } | null {
  const t = temperament(view, them);
  if (!t) return null;
  const d = TEMPERAMENTS[t];
  return { name: d.name, text: `${d.name}: ${signed(d.treaty)} to every treaty answer.` };
}

/** Why they will hear no more, and when they will again. */
export const TIRED_TEXT = `They will hear no more proposals for now; their patience recovers by ${PATIENCE.recovery} a turn.`;

export function proposalEffect(view: PlayerView, me: number, them: number, kind: ProposalKind): string {
  return treatyEffect(view, me, them, kind) + answerOdds(view, me, them, kind);
}

/** What a proposal does, without the odds of an answer. */
export function treatyEffect(view: PlayerView, me: number, them: number, kind: ProposalKind): string {
  switch (kind) {
    case "peace":
    case "ceasefire":
      return `Ends the war. Attacking them in the next ${PEACE_TREATY_TURNS} turns would cost ${ATTITUDE_EVENTS.brokePeace} attitude with them and ${ATTITUDE_EVENTS.brokePeaceOthers} with everyone else.`;
    case "nonAggression":
      return `A pledge not to attack: ${attitudeLine(ATTITUDE.nonAggression)}, growing by 1 every ${ATTITUDE.pactWarmthTurns} turns up to ${signed(ATTITUDE.nonAggression + ATTITUDE.nonAggressionWarmthCap)}. Breaking it costs ${ATTITUDE_EVENTS.brokeTreaty}. Ships only ever fight at war, pact or not.`;
    case "alliance":
      return `Your ships can refuel at each other's colonies, and if anyone declares war on one of you the other joins the war. ${capital(attitudeLine(ATTITUDE.alliance))}, growing to ${signed(ATTITUDE.alliance + ATTITUDE.allianceWarmthCap)}. Breaking it costs ${ATTITUDE_EVENTS.brokeAlliance}.`;
    case "trade":
    case "research": {
      const y = TREATY_YIELD[kind];
      const unit = kind === "trade" ? "BC" : "research";
      const size = theirPopKnown(view, them)
        ? `About ${signed(treatyPotential(view, me, them, kind), 1)} ${unit} a turn at full strength (${y.perPop} per population of the smaller empire).`
        : `${capital(unit)} worth ${y.perPop} per population of the smaller empire each turn at full strength (you have not seen their colonies, so their population is unknown).`;
      return `${size} It costs you while routes are set up, breaks even after ${y.breakEven} turns and is at full strength after ${y.full}. ${capital(attitudeLine(ATTITUDE.treaty))}.`;
    }
    case "techExchange":
      return `Each side learns the other's technology at once; attitude ${signed(ATTITUDE_EVENTS.techExchange)} both ways.`;
    case "demandTribute":
      return `They pay you a share of their income every turn until they stop. If they give in, ${attitudeLine(ATTITUDE_EVENTS.demandMet)}.`;
    case "demandTech":
    case "demandSystem":
    case "demandWar":
    case "demandPeace":
    case "demandBreakAlliance":
    case "demandStopSpying":
    case "demandRemoveFleet":
      return `${demandWhat(kind)} If they give in, ${attitudeLine(ATTITUDE_EVENTS.demandMet)}.`;
  }
}

function demandWhat(kind: ProposalKind): string {
  switch (kind) {
    case "demandTech": return "They hand you the technology.";
    case "demandSystem": return "Every colony they have in that system becomes yours.";
    case "demandWar": return "They declare war on that empire.";
    case "demandPeace": return "They sign peace with that empire.";
    case "demandBreakAlliance": return "They end their alliance with that empire, which will resent them for it.";
    case "demandStopSpying": return "All their spies in your empire go home.";
    case "demandRemoveFleet": return "Their fleets orbiting your systems head home.";
    default: return "";
  }
}

/** What accepting or refusing a proposal another empire put to you means for you. */
export function incomingEffect(view: PlayerView, p: Proposal): { accept: string; refuse: string } {
  const me = p.to;
  const them = p.from;
  if (!isDemand(p.kind)) {
    return {
      accept: `${p.price ? `You pay ${priceText(view, me, p.price)}. ` : ""}${treatyEffect(view, me, them, p.kind)} Accepting: attitude ${signed(ATTITUDE_EVENTS.acceptedTreaty)} both ways.`,
      refuse: `${capital(attitudeLine(ATTITUDE_EVENTS.rejectedProposal))}.`,
    };
  }
  const third = p.third !== undefined ? playerName(view, p.third) : "";
  const give = ((): string => {
    switch (p.kind) {
      case "demandTribute": return `You pay ${p.percent}% of your income, about ${fmt(tributeAmount(view, me, p.percent ?? 0), 1)} BC a turn, until you stop.`;
      case "demandTech": return `They learn ${techName(p.wantTechId)}.`;
      case "demandSystem": return `Your colonies in the ${starName(view, p.starId ?? "")} system become theirs.`;
      case "demandWar": return `You declare war on the ${third}.`;
      case "demandPeace": return `You sign peace with the ${third}.`;
      case "demandBreakAlliance": return `Your alliance with the ${third} ends, and they resent it (${ATTITUDE_EVENTS.brokeAlliance}).`;
      case "demandStopSpying": return "All your spies in their empire come home.";
      case "demandRemoveFleet": return "Your fleets orbiting their systems head home.";
      default: return "";
    }
  })();
  return { accept: give, refuse: `${capital(attitudeLine(ATTITUDE_EVENTS.demandRefused))}.` };
}

/** Whether the viewer has seen any of their colonies, so their population is known. */
function theirPopKnown(view: PlayerView, them: number): boolean {
  return view.knownPopulation?.[them] !== undefined || Object.values(view.colonies).some((c) => c.ownerId === them);
}

const capital = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** What declaring war on them sets off. */
export function warEffect(view: PlayerView, me: number, them: number): string {
  const r = relation(view, me, them);
  const parts = [
    "Ships and colonies fight on sight and can be invaded.",
    "Trade, research treaties and tribute between you end.",
    `${capital(attitudeLine(ATTITUDE_EVENTS.declaredWar))} at once and ${ATTITUDE.war} while the war lasts.`,
  ];
  if ((r.peaceUntil ?? 0) > view.turn) {
    parts.push(`You are under a peace treaty until turn ${r.peaceUntil}: an extra ${ATTITUDE_EVENTS.brokePeace} with them and ${ATTITUDE_EVENTS.brokePeaceOthers} with everyone else.`);
  } else if (r.status !== "none") {
    parts.push(`Breaking a treaty costs ${ATTITUDE_EVENTS.brokeTreatyOthers} attitude with every other empire.`);
  }
  const allies = alliesOf(view, them, me);
  if (allies.length) parts.push(`Their allies join the war: ${allies.join(", ")}.`);
  return parts.join(" ");
}

/** What ending one of your treaties with them costs. */
export function endTreatyEffect(view: PlayerView, me: number, them: number, treaty: TreatyName): string {
  const totals = treatyTotals(view);
  const y = treatyYield(view, me, them, totals);
  switch (treaty) {
    case "trade":
      return `You lose ${fmt(y.bc, 1)} BC a turn; ${attitudeLine(ATTITUDE_EVENTS.brokeTreaty)}.`;
    case "research":
      return `You lose ${fmt(y.research, 1)} research a turn; ${attitudeLine(ATTITUDE_EVENTS.brokeTreaty)}.`;
    case "nonAggression":
      return `${capital(attitudeLine(ATTITUDE_EVENTS.brokeTreaty))}, and the pact's goodwill fades.`;
    case "alliance":
      return `${capital(attitudeLine(ATTITUDE_EVENTS.brokeAlliance))}; you can no longer refuel at their colonies.`;
    case "tribute": {
      const t = (view.tributes ?? []).find((x) => x.from === me && x.to === them);
      return `You stop paying about ${fmt(t ? tributeAmount(view, me, t.percent) : 0, 1)} BC a turn; ${attitudeLine(ATTITUDE_EVENTS.brokeTreaty)}.`;
    }
  }
}

export const GIFT_EFFECT = {
  bc: `Attitude +${ATTITUDE_EVENTS.giftPerBc} per BC, at most +${ATTITUDE_EVENTS.giftBcCap}.`,
  tech: `They learn it at once; attitude +${ATTITUDE_EVENTS.giftTech}.`,
  system: `Every colony you have there becomes theirs; attitude +${ATTITUDE_EVENTS.giftSystem}.`,
  tribute: `A share of your income every turn until you stop; attitude +${ATTITUDE.tributePaid} while you pay.`,
};

export const SURRENDER_EFFECT = "All your colonies, ships, leaders and treasury pass to them and you leave the game.";

/** One line per treaty or tribute you have with them, saying what it does for you now. */
export function activeEffects(view: PlayerView, me: number, them: number): { label: string; text: string; tone?: "good" | "bad" }[] {
  const r = relation(view, me, them);
  const out: { label: string; text: string; tone?: "good" | "bad" }[] = [];
  const totals = treatyTotals(view);
  const y = treatyYield(view, me, them, totals);
  const ramp = (since: number, kind: "trade" | "research") => {
    const left = TREATY_YIELD[kind].full - (view.turn - since);
    if (left <= 0) return "";
    const full = theirPopKnown(view, them) ? ` (${signed(treatyPotential(view, me, them, kind), 1)})` : "";
    const even = TREATY_YIELD[kind].breakEven - (view.turn - since);
    return even > 0 ? `; still setting up: breaks even in ${even} turn${even === 1 ? "" : "s"}, full strength${full} in ${left}`
      : `; full strength${full} in ${left} turn${left === 1 ? "" : "s"}`;
  };
  const unseen = theirPopKnown(view, them) ? "" : " (estimated from what you have seen of them)";
  if (r.status === "war") out.push({ label: "War", text: "Ships and colonies fight on sight; no treaties or tribute.", tone: "bad" });
  if (r.status === "peace") {
    out.push({ label: "Peace treaty", text: (r.peaceUntil ?? 0) > view.turn
      ? `Attacking before turn ${r.peaceUntil} costs ${ATTITUDE_EVENTS.brokePeace} attitude with them and ${ATTITUDE_EVENTS.brokePeaceOthers} with everyone.`
      : "The protected period is over; war would only cost the usual attitude." });
  }
  if (r.status === "nonAggression") {
    const held = Math.min(ATTITUDE.nonAggressionWarmthCap, Math.floor((view.turn - r.since) / ATTITUDE.pactWarmthTurns));
    out.push({ label: "Non-aggression pact", text: `${capital(attitudeLine(ATTITUDE.nonAggression + held))}.` });
  }
  if (r.status === "alliance") {
    const held = Math.min(ATTITUDE.allianceWarmthCap, Math.floor((view.turn - r.since) / ATTITUDE.pactWarmthTurns));
    out.push({ label: "Alliance", text: `Shared refuelling, they join wars declared on you; ${attitudeLine(ATTITUDE.alliance + held)}.`, tone: "good" });
  }
  if (r.trade) {
    out.push({ label: "Trade", text: `${signed(y.bc, 1)} BC a turn${unseen}${ramp(r.tradeSince ?? r.since, "trade")}.`, tone: y.bc >= 0 ? "good" : "bad" });
  }
  if (r.research) {
    out.push({ label: "Research", text: `${signed(y.research, 1)} research a turn${unseen}${ramp(r.researchSince ?? r.since, "research")}.`, tone: y.research >= 0 ? "good" : "bad" });
  }
  for (const t of view.tributes ?? []) {
    if (t.from === them && t.to === me) out.push({ label: "Tribute", text: `They pay you ${t.percent}% of their income, about ${fmt(tributeAmount(view, them, t.percent), 1)} BC a turn.`, tone: "good" });
    if (t.from === me && t.to === them) out.push({ label: "Tribute", text: `You pay them ${t.percent}% of your income, about ${fmt(tributeAmount(view, me, t.percent), 1)} BC a turn.`, tone: "bad" });
  }
  return out;
}
