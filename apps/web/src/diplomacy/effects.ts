import {
  NO_WAR_MULT, PATIENCE, PEACE_TREATY_TURNS, RELATION, RELATION_EVENTS, TEMPERAMENTS, TREATY_ANSWER, TREATY_WARMTH, TREATY_YIELD,
  empires, isDemand, peaceTurnsLeft, relation, temperament, treatyAcceptChance, treatyPriceChance, treatyScore, treatyTarget,
  treatyYield, tributeAmount, type PlayerView, type Price, type Proposal, type ProposalKind, type TreatyName,
} from "@starlord/sim";
import { fmt, playerName, signed, starName } from "../ui/format";
import { techName } from "./terms";

/**
 * Plain statements of what treaties, proposals and diplomatic actions do,
 * with the rule numbers from the sim, so the player never has to guess.
 * `me` is the player, `them` the other empire.
 */

/** How a treaty warms relations each turn. */
const warmthLine = (n: number) =>
  `relations may rise by 1 to ${n} each turn (chance: 100 minus the relation, in %), up to ${RELATION.capWithoutAlliance} without an alliance`;

/** Empires allied with `who`, who may join a war on them. */
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
  return { name: d.name, text: `${d.name}: ${signed(d.treaty)} to every treaty answer. Signing a treaty adds to the turns in which they will not start a war with you: ${d.noWar} (trade or research), ${Math.trunc(d.noWar * NO_WAR_MULT.nonAggression)} (non-aggression pact) or ${d.noWar * NO_WAR_MULT.alliance} (alliance).` };
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
      return `Ends the war: relations rise by ${RELATION_EVENTS.peace.gain}, but no higher than ${RELATION_EVENTS.peace.max}, and neither side may declare war for ${PEACE_TREATY_TURNS} turns. Then the treaty lapses to no treaty.`;
    case "nonAggression":
      return `A pledge not to attack: ${warmthLine(TREATY_WARMTH.nonAggression)}. Breaking it costs trust with them and reputation with everyone. Ships only ever fight at war, pact or not.`;
    case "alliance":
      return `Your ships can refuel at each other's colonies, and computer allies may join your wars (and ask you to join theirs). Relations rise by 1 to ${TREATY_WARMTH.alliance} every turn, with no cap. Breaking it costs trust and reputation.`;
    case "trade":
    case "research": {
      const unit = kind === "trade" ? "BC" : "research";
      const rate = kind === "trade" ? `, x your government's BC rate, +${TREATY_YIELD.traderPoints}% for Fantastic Traders` : ", x your government's research rate";
      const size = theirPopKnown(view, them)
        ? `About ${signed(treatyTarget(view, me, them, kind))} ${unit} a turn at full strength (half the smaller empire's population${rate}).`
        : `${capital(unit)} worth half the smaller empire's population${rate} each turn at full strength (you have not seen their colonies, so their population is unknown).`;
      const cost = kind === "research" ? " While it is negative, a research treaty's setup is paid in BC." : "";
      return `${size} It starts at minus half that population and climbs by 1/${TREATY_YIELD.rampSteps} of the full yield each turn, so it is at full strength after about ${2 * TREATY_YIELD.rampSteps} turns.${cost} ${capital(warmthLine(TREATY_WARMTH[kind]))}.`;
    }
    case "techExchange":
      return `Each side learns the other's technology at once; relations +${RELATION_EVENTS.techExchange} (gains count for less the better relations already are).`;
    case "demandTribute":
      return `They pay you a share of their income every turn until they stop. ${DEMAND_RISK}`;
    case "demandTech":
    case "demandSystem":
    case "demandWar":
    case "demandPeace":
    case "demandBreakAlliance":
    case "demandStopSpying":
    case "demandRemoveFleet":
      return `${demandWhat(kind)} ${DEMAND_RISK}`;
    case "compensation":
      return "They ask to be paid for your offences against them; refusing ends every treaty you have with them.";
  }
}

/** What a computer ruler may do when refusing a demand. */
const DEMAND_RISK = "A computer ruler weighs your fleets, size and technology against theirs: it may give in, refuse, warn you (a strike), end your treaties or declare war.";

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
      accept: `${p.price ? `You pay ${priceText(view, me, p.price)}. ` : ""}${treatyEffect(view, me, them, p.kind)}${agreedText(view, them)}`,
      refuse: p.kind === "compensation" ? "Every treaty you have with them ends." : "Nothing changes.",
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
      case "demandBreakAlliance": return `Your alliance with the ${third} ends, and they lose trust in you.`;
      case "demandStopSpying": return "All your spies in their empire come home.";
      case "demandRemoveFleet": return "Your fleets orbiting their systems head home.";
      default: return "";
    }
  })();
  const refuse = p.kind === "demandWar" && relation(view, me, them).status === "alliance" ? "Your alliance with them ends." : "Nothing changes at once.";
  return { accept: give + agreedText(view, them), refuse };
}

/** Whether the viewer has seen any of their colonies, so their population is known. */
function theirPopKnown(view: PlayerView, them: number): boolean {
  return view.knownPopulation?.[them] !== undefined || Object.values(view.colonies).some((c) => c.ownerId === them);
}

const capital = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** What agreeing to a computer ruler's request does for relations; empty for a human. */
function agreedText(view: PlayerView, them: number): string {
  if (view.players[them]?.isHuman) return "";
  const [lo, hi] = RELATION_EVENTS.agreedToRequest;
  return ` Agreeing to a computer ruler's request: relations +${lo} to +${hi}.`;
}

/** A research treaty's yield while it is still negative (paid in BC), else 0. */
function researchSetup(view: PlayerView, me: number, them: number): number {
  if (!relation(view, me, them).research) return 0;
  return Math.min(0, view.treatyYields?.[me]?.[them]?.research ?? 0);
}

/** What declaring war on them sets off. */
export function warEffect(view: PlayerView, me: number, them: number): string {
  const r = relation(view, me, them);
  const parts = [
    "Ships and colonies fight on sight and can be invaded.",
    "Trade, research treaties and tribute between you end.",
    `Relations fall to ${RELATION_EVENTS.declareWar.set} minus d${RELATION_EVENTS.declareWar.roll} and stay at ${RELATION.warCeiling} or below while the war lasts; the level they drift back to falls by ${-RELATION_EVENTS.declareWar.baseline} for good.`,
  ];
  const left = peaceTurnsLeft(view, me, them);
  if (left > 0) {
    parts.push(`Your peace treaty has ${left} turn${left === 1 ? "" : "s"} to run: breaking it costs trust with them and reputation with everyone.`);
  } else if (r.status !== "none" || r.trade || r.research) {
    parts.push("Breaking a treaty costs trust with them and reputation with everyone.");
  }
  const allies = alliesOf(view, them, me);
  if (allies.length) parts.push(`Their computer allies may join the war: ${allies.join(", ")}.`);
  return parts.join(" ");
}

/** What ending one of your treaties with them costs. */
export function endTreatyEffect(view: PlayerView, me: number, them: number, treaty: TreatyName): string {
  const y = treatyYield(view, me, them);
  const faith = "they lose trust in you, everyone else thinks less of you, and they will hear no proposals for a while";
  switch (treaty) {
    case "trade":
      return `You lose ${fmt(y.bc, 1)} BC a turn; ${faith}.`;
    case "research":
      return `You lose ${fmt(y.research, 1)} research a turn; relations fall by 2d${RELATION_EVENTS.researchBreak.roll} and the level they drift back to by d${RELATION_EVENTS.researchBreak.baselineRoll}; ${faith}.`;
    case "nonAggression":
      return `${capital(faith)}.`;
    case "alliance":
      return `${capital(faith)}; you can no longer refuel at their colonies.`;
    case "tribute": {
      const t = (view.tributes ?? []).find((x) => x.from === me && x.to === them);
      return `You stop paying about ${fmt(t ? tributeAmount(view, me, t.percent) : 0, 1)} BC a turn; ${faith}.`;
    }
  }
}

const G = RELATION_EVENTS.gift;
const giftRise = `relations rise by its worth x (${G.rollBase} + d${G.roll}) and the level they drift back to by its worth`;
export const GIFT_EFFECT = {
  bc: `Worth 1 for every 10 turns of their expenses it covers (at most ${G.maxBc}); ${giftRise}.`,
  tech: `They learn it at once. Worth ${G.techPerLevel} x its level / their best level; ${giftRise}.`,
  system: `Every colony you have there becomes theirs. Worth half its population + 1; ${giftRise}.`,
  tribute: `A share of your income every turn until you stop. Worth ${G.tribute}; ${giftRise}, and paying keeps warming them.`,
};

export const SURRENDER_EFFECT = "All your colonies, ships, leaders and treasury pass to them and you leave the game.";

/** One line per treaty or tribute you have with them, saying what it does for you now. */
export function activeEffects(view: PlayerView, me: number, them: number): { label: string; text: string; tone?: "good" | "bad" }[] {
  const r = relation(view, me, them);
  const out: { label: string; text: string; tone?: "good" | "bad" }[] = [];
  const y = treatyYield(view, me, them);
  const ramp = (kind: "trade" | "research") => {
    const now = view.treatyYields?.[me]?.[them]?.[kind];
    const full = treatyTarget(view, me, them, kind);
    if (now === undefined || now >= full) return "";
    return `; still setting up, climbing by about ${fmt(full / TREATY_YIELD.rampSteps, 1)} a turn to ${signed(full)}`;
  };
  const setup = researchSetup(view, me, them);
  const unseen = theirPopKnown(view, them) ? "" : " (estimated from what you have seen of them)";
  if (r.status === "war") out.push({ label: "War", text: "Ships and colonies fight on sight; no treaties or tribute.", tone: "bad" });
  if (r.status === "peace") {
    const left = peaceTurnsLeft(view, me, them);
    out.push({ label: "Peace treaty", text: `Neither side may declare war for ${left} more turn${left === 1 ? "" : "s"}; then the treaty lapses to no treaty.` });
  }
  if (r.status === "nonAggression") {
    out.push({ label: "Non-aggression pact", text: `${capital(warmthLine(TREATY_WARMTH.nonAggression))}.` });
  }
  if (r.status === "alliance") {
    out.push({ label: "Alliance", text: `Shared refuelling; computer allies may join your wars. Relations rise by 1 to ${TREATY_WARMTH.alliance} every turn.`, tone: "good" });
  }
  if (r.trade) {
    const bc = y.bc - setup;
    out.push({ label: "Trade", text: `${signed(bc, 1)} BC a turn${unseen}${ramp("trade")}.`, tone: bc >= 0 ? "good" : "bad" });
  }
  if (r.research) {
    out.push({ label: "Research", text: setup < 0
      ? `Still setting up: costs you ${fmt(-setup)} BC a turn${unseen}${ramp("research")}.`
      : `${signed(y.research, 1)} research a turn${unseen}${ramp("research")}.`, tone: setup < 0 ? "bad" : "good" });
  }
  for (const t of view.tributes ?? []) {
    if (t.from === them && t.to === me) out.push({ label: "Tribute", text: `They pay you ${t.percent}% of their income, about ${fmt(tributeAmount(view, them, t.percent), 1)} BC a turn.`, tone: "good" });
    if (t.from === me && t.to === them) out.push({ label: "Tribute", text: `You pay them ${t.percent}% of your income, about ${fmt(tributeAmount(view, me, t.percent), 1)} BC a turn.`, tone: "bad" });
  }
  return out;
}
