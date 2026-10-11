import { priceText } from "./effects";
import { TECHS, TIER_OF_TECH, type Player, type PlayerView, type Proposal } from "@starlord/sim";
import { playerName, starName, words } from "../ui/format";

export const techName = (t: string | undefined) => (t ? TECHS[t]?.name ?? words(t) : "?");

/** One line describing a proposal and its terms. */
export function describeProposal(view: PlayerView, p: Proposal): string {
  const base = describeTerms(view, p);
  return p.price ? `${base}, at a price: ${priceText(view, p.to, p.price)}` : base;
}

function describeTerms(view: PlayerView, p: Proposal): string {
  const third = p.third !== undefined ? playerName(view, p.third) : "";
  switch (p.kind) {
    case "peace":
    case "ceasefire":
      return "offers a peace treaty";
    case "nonAggression":
      return "proposes a non-aggression pact";
    case "alliance":
      return "proposes an alliance";
    case "trade":
      return "proposes a trade treaty";
    case "research":
      return "proposes a research treaty";
    case "techExchange":
      return `offers ${techName(p.techId)} in exchange for ${techName(p.wantTechId)}`;
    case "demandTribute":
      return `demands a tribute of ${p.percent}% of your income`;
    case "demandTech":
      return `demands ${techName(p.wantTechId)}`;
    case "demandSystem":
      return `demands the ${starName(view, p.starId ?? "")} system`;
    case "demandWar":
      return `demands that you declare war on the ${third}`;
    case "demandPeace":
      return `demands that you make peace with the ${third}`;
    case "demandBreakAlliance":
      return `demands that you break your alliance with the ${third}`;
    case "compensation":
      return "demands compensation for your offences";
    case "demandStopSpying":
      return "demands that you recall your spies";
    case "demandRemoveFleet":
      return "demands that you withdraw your fleets from their systems";
  }
}

export function tradableTechs(from: Player, to: Player): string[] {
  return from.techs.filter((t) => !to.techs.includes(t) && TIER_OF_TECH[t]).sort((a, b) => techName(a).localeCompare(techName(b)));
}
