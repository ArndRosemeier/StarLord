import {
  AI_OFFERS, AI_PEACE, AI_WAR, PAID_WAR, TIER_OF_TECH, attitude, audienceTired, canSign, counterPrice, demandAnswer, difficultyLevel, effectiveTemperament,
  empireExpenses, fixedRoll, isDemand, isScoredTreaty, monsterDemands, patience, peacePayLevel, peacePriceLevel, peaceWish, persOf, raceDiplomacyPoints,
  getRace, relation, shipLossesOf, strengthRatio, temperament, tradableTechs, treatyAnswer, trustIn,
  type Command, type PlayerId, type PlayerView, type Price, type Proposal, type ProposalKind, type ProposalTerms,
} from "@starlord/sim";
import { strategyOf } from "./strategies.js";
import { fleetStrength, me, myFleets } from "./util.js";

/**
 * Diplomacy for one empire, after the original. Computer rulers answer
 * proposals by the original's scores, come to human rulers with offers as
 * often as the original's contact gate allows (and with what its d20 table
 * picks), ask human allies to join their wars and join theirs, and offer
 * peace by the original's formula. Their dealings with other computer
 * empires (pacts, tribute, wars) and their grievances against humans
 * (strikes) are rules the turn itself runs (see the sim's aiDiplomacy and
 * relations). A human's automation answers the same way and offers peace and
 * treaties; its Aggressive strategy also starts wars by the computer
 * empires' strength test.
 */

/** A die fixed by the game, turn and purpose, so the same view always gives the same orders. */
function die(view: PlayerView, key: string): (n: number) => number {
  let i = 0;
  return (n) => fixedRoll(view, `ai${view.turn}|${view.viewer}|${key}|${i++}`, Math.max(1, Math.floor(n)));
}

function techValue(tech: string | undefined): number {
  return tech ? (TIER_OF_TECH[tech]?.cost ?? 0) : 0;
}

/**
 * What a computer ruler makes of a tech swap: the original's price factor
 * (v = relation + trust + diplomat - 50 x difficulty + 20 x vsHumans + 150
 * (+50 charismatic, +50 Xeno Psychology) + temperament + d150 - 1; factor
 * v + 100 % when v >= 0, else 10000 / (100 - v) %). StarLord accepts when what
 * you offer, times that factor, is worth what you ask for (how the original
 * applies the factor is an estimate).
 */
export function techSwapFactor(view: PlayerView, p: Proposal): number {
  const from = view.players[p.from]!;
  const race = getRace(from.raceId);
  const t = effectiveTemperament(view, view.viewer, p.from);
  let v = attitude(view, view.viewer, p.from) + trustIn(view, view.viewer, p.from) + Math.max(0, (from.diplomacyBonus ?? 0) - raceDiplomacyPoints(race)) -
    50 * difficultyLevel(view) + 20 * (from.isHuman ? (t?.vsHumans ?? 0) : 0) + 150 + (t?.treaty ?? 0) + fixedRoll(view, `${p.id}|swap`, 150) - 1;
  if (race.picks.traits.includes("charismatic")) v += 50;
  if (from.techs.includes("xenoPsychology")) v += 50;
  return v >= 0 ? (v + 100) / 100 : 100 / (100 - v);
}

/** The viewer's full answer to a proposal: accept or not, and for a treaty it would refuse, perhaps a price (the original's counter-offer). */
export function audienceAnswer(view: PlayerView, p: Proposal): { accept: boolean; price?: Price } {
  const peaceful = strategyOf(view, "diplomacy") === "peaceful";
  // A human's peaceful automation takes treaties a computer ruler would turn down.
  const warmth = peaceful ? 15 : 0;
  if (canSign(view, p.from, p.to, p.kind, p)) return { accept: false };
  const player = me(view);
  if (isScoredTreaty(p.kind)) {
    const a = treatyAnswer(view, p, warmth);
    if (a.kind === "accept") return { accept: true };
    // A counter-offer is a proposal back to them; skip it if they would not hear it.
    if (a.kind === "price" && !audienceTired(view, view.viewer, p.from) && !canSign(view, view.viewer, p.from, p.kind, { price: a.price })) {
      return { accept: false, price: a.price };
    }
    return { accept: false };
  }
  if (p.kind === "techExchange") return { accept: techValue(p.techId) * techSwapFactor(view, p) >= techValue(p.wantTechId) };
  if (p.kind === "compensation") {
    // Only a human pays compensation; its automation pays what it can spare to keep its treaties.
    const price = p.price ?? {};
    return { accept: peaceful || (price.bc ?? 0) <= player.bc / 2 || !!price.techId || !!price.tribute };
  }
  if (isDemand(p.kind)) {
    if (!player.isHuman) return { accept: demandAnswer(view, p).outcome === "accept" };
    // A human's automation answers its ally's call to arms (or a paid offer to join a war) if its fleets can take the enemy,
    // and other demands like a computer ruler.
    if (p.kind === "demandWar" && (p.payment || relation(view, p.from, p.to).status === "alliance") && p.third !== undefined) {
      return { accept: !peaceful && strengthRatio(view, view.viewer, p.third) >= 100 };
    }
    return { accept: demandAnswer(view, p).outcome === "accept" };
  }
  return { accept: false };
}

export function answerProposal(view: PlayerView, p: Proposal): boolean {
  return audienceAnswer(view, p).accept;
}

/** Answers to a proposal as orders: the answer, plus a counter-offer when the viewer names a price. */
export function answerOrders(view: PlayerView, p: Proposal): Command[] {
  const a = audienceAnswer(view, p);
  const out: Command[] = [{ type: "respond", proposalId: p.id, accept: a.accept }];
  if (a.price) out.push({ type: "propose", to: p.from, kind: p.kind, price: a.price });
  return out;
}

/** Whether the viewer may put this proposal to `other` now. */
function canOffer(view: PlayerView, other: PlayerId, kind: ProposalKind, terms: ProposalTerms = {}): boolean {
  return !canSign(view, view.viewer, other, kind, terms) && !audienceTired(view, view.viewer, other) &&
    !view.proposals.some((p) => p.from === view.viewer && p.to === other && p.kind === kind);
}

/** A tech swap with `other`: their most valuable tech we lack for our cheapest one worth at least 80% of it. */
function techSwap(view: PlayerView, other: PlayerId): ProposalTerms | null {
  const player = me(view);
  const them = view.players[other]!;
  const want = tradableTechs(them, player).sort((a, b) => techValue(b) - techValue(a) || a.localeCompare(b))[0];
  if (!want) return null;
  const give = tradableTechs(player, them).filter((t) => techValue(t) >= techValue(want) * 0.8)
    .sort((a, b) => techValue(a) - techValue(b) || a.localeCompare(b))[0];
  return give ? { techId: give, wantTechId: want } : null;
}

/**
 * The original's offers to a human (FUN_000501c5): a contact gate first (see
 * AI_OFFERS), then three d20 draws whose last fitting one picks a tech swap,
 * a pact, trade, research or an alliance, each with its own test.
 */
function offer(view: PlayerView, other: PlayerId): Command | null {
  const O = AI_OFFERS;
  const d = difficultyLevel(view);
  const them = view.players[other]!;
  const r = relation(view, view.viewer, other);
  if (r.status === "war") return null;
  const t = effectiveTemperament(view, view.viewer, other);
  const pers = t?.treaty ?? 0;
  const rel = attitude(view, view.viewer, other);
  const diplomat = Math.max(0, (them.diplomacyBonus ?? 0) - raceDiplomacyPoints(getRace(them.raceId)));
  let x = O.base + O.perDifficulty * d - Math.trunc(patience(view, view.viewer, other) / O.patienceDiv) - Math.trunc(trustIn(view, view.viewer, other) / O.trustDiv) +
    Math.trunc(rel / O.relationDiv) - Math.trunc(diplomat / O.diplomatDiv) + O.vsHumans * (t?.vsHumans ?? 0) - Math.trunc(pers / O.temperamentDiv) -
    (r.status === "nonAggression" ? O.nonAggression : 0) - (r.status === "alliance" ? O.alliance : 0) - (them.techs.includes("xenoPsychology") ? O.xenoPsychology : 0);
  x = Math.max(0, Math.min(O.max, x));
  const clock = view.audienceClock?.[view.viewer]?.[other] ?? 0;
  const roll = die(view, `offer${other}`);
  if (roll(100) > Math.trunc(clock / (Math.trunc((x * x) / 50) + 1))) return null;
  let pick: ProposalKind | null = null;
  for (let i = 0; i < 3; i++) {
    const n = roll(20);
    if (n <= O.table.tech) pick = techSwap(view, other) ? "techExchange" : pick;
    else if (n <= O.table.nonAggression) pick = r.status === "none" ? "nonAggression" : pick;
    else if (n <= O.table.trade) pick = rel >= 0 && !r.trade ? "trade" : pick;
    else if (n <= O.table.research) pick = rel >= 0 && !r.research ? "research" : pick;
    else if (n <= O.table.alliance) pick = r.status === "nonAggression" ? "alliance" : pick;
  }
  if (!pick) return null;
  const str = strengthRatio(view, view.viewer, other);
  const mine = me(view);
  const tradeTest = (a: number, b: number) =>
    roll(O.tradeDie) >= O.tradePerDifficulty * d + Math.trunc((a * 100) / (b + 1)) + 1 - 2 * pers - (r.status === "nonAggression" ? 25 : 0) - (r.status === "alliance" ? 50 : 0);
  let go = false;
  let terms: ProposalTerms = {};
  switch (pick) {
    case "techExchange":
      terms = techSwap(view, other) ?? {};
      go = true;
      break;
    case "nonAggression":
      go = str <= roll(O.pactDie - O.perDifficultyDie * d + 2 * pers);
      break;
    case "alliance":
      go = str <= roll(O.allianceDie - O.perDifficultyDie * d + 2 * pers);
      break;
    case "trade":
      go = tradeTest(Math.trunc(empireExpenses(view, view.viewer)), Math.trunc(empireExpenses(view, other)));
      break;
    case "research":
      go = tradeTest(mine.techs.length, them.techs.length);
      break;
    default:
      break;
  }
  // A trade treaty it would not offer turns into an offer to pay the human to attack one of its enemies.
  if (pick === "trade" && !go) return paidWarOffer(view, other, roll);
  if (!go || !canOffer(view, other, pick, terms)) return null;
  return { type: "propose", to: other, kind: pick, ...terms };
}

/**
 * The original's paid call to arms (FUN_000501c5, see PAID_WAR): an enemy the
 * ruler has fought long, hates and is losing ships to, picked at random, and
 * a payment (BC or a technology) at level its losses / (the enemy's + 1).
 */
function paidWarOffer(view: PlayerView, other: PlayerId, roll: (n: number) => number): Command | null {
  const P = PAID_WAR;
  if (temperament(view, view.viewer) === "xenophobic" || me(view).isHuman || !view.players[other]?.isHuman) return null;
  const player = me(view);
  const them = view.players[other]!;
  const enemies = player.contacts.filter((k) => {
    if (k === other || !them.contacts.includes(k) || !view.players[k]?.alive) return false;
    const r = relation(view, view.viewer, k);
    if (r.status !== "war" || view.turn - r.since < P.minWarTurns) return false;
    if (relation(view, other, k).status === "war") return false;
    const lost = shipLossesOf(view, view.viewer, k);
    return attitude(view, view.viewer, k) <= P.maxRelation && lost > 0 && shipLossesOf(view, k, view.viewer) < lost;
  });
  if (enemies.length === 0) return null;
  const enemy = enemies[roll(enemies.length) - 1]!;
  const level = Math.min(P.maxLevel, Math.trunc(shipLossesOf(view, view.viewer, enemy) / (shipLossesOf(view, enemy, view.viewer) + 1)));
  const payment = counterPrice(view, other, view.viewer, level, `paidWar${view.turn}|${view.viewer}|${other}`, "nonAggression");
  if (!payment) return null;
  const terms: ProposalTerms = { third: enemy, payment };
  return canOffer(view, other, "demandWar", terms) ? { type: "propose", to: other, kind: "demandWar", ...terms } : null;
}

/** Peace with a human by the original's formula (AI_PEACE); two computer empires make peace in the turn itself (AI_AI_PEACE). */
function peaceOffer(view: PlayerView, other: PlayerId, peaceful: boolean): Command | null {
  if (!canOffer(view, other, "peace")) return null;
  const w = peaceWish(view, view.viewer, other);
  if (w.turns < 1) return null;
  if (!peaceful && die(view, `peace${other}`)(100) > w.chance) return null;
  if (w.score > 10 && !peaceful) {
    const price = counterPrice(view, view.viewer, other, peacePriceLevel(w.score), `peace${view.turn}|${view.viewer}|${other}`, "peace");
    if (price && canOffer(view, other, "peace", { price })) return { type: "propose", to: other, kind: "peace", price };
  }
  // A losing computer ruler offers a human something for peace: a sum, a technology, a tribute or a system.
  if (w.score < AI_PEACE.payBelow && !me(view).isHuman && view.players[other]?.isHuman) {
    const payment = counterPrice(view, other, view.viewer, peacePayLevel(w.score), `peacePay${view.turn}|${view.viewer}|${other}`, "peace");
    if (payment && canOffer(view, other, "peace", { payment })) return { type: "propose", to: other, kind: "peace", payment };
  }
  return { type: "propose", to: other, kind: "peace" };
}

/**
 * Answers proposals and demands, offers treaties to humans, asks human allies
 * to join its wars and joins theirs, offers peace, and pays off monsters that
 * threaten its systems.
 */
export function diplomacyOrders(view: PlayerView): Command[] {
  const player = me(view);
  const out: Command[] = [];
  const strategy = strategyOf(view, "diplomacy");
  const peaceful = strategy === "peaceful";

  for (const p of view.proposals.filter((x) => x.to === view.viewer)) out.push(...answerOrders(view, p));

  // A monster demanding tribute leaves if paid; pay when we can afford it.
  for (const ev of monsterDemands(view, view.viewer)) {
    if ((ev.strength ?? Infinity) <= player.bc) out.push({ type: "bribeMonster", eventId: ev.id });
  }

  const declared = new Set<PlayerId>();
  for (const other of player.contacts) {
    const them = view.players[other]!;
    if (!them.alive) continue;
    const r = relation(view, view.viewer, other);
    // Computer empires deal with each other in the turn itself, peace included.
    if (!player.isHuman && !them.isHuman) continue;
    if (r.status === "war") {
      const cmd = peaceOffer(view, other, peaceful);
      if (cmd) out.push(cmd);
      continue;
    }
    if (!player.isHuman && r.status === "alliance") {
      const roll = die(view, `ally${other}`);
      // The original's ally duties, 1 in 10 turns each: ask the human ally to join a war, and join the ally's wars.
      if (roll(AI_OFFERS.allyDuty) === 1) {
        const enemy = player.contacts.find((k) => k !== other && relation(view, view.viewer, k).status === "war" && them.contacts.includes(k) &&
          canOffer(view, other, "demandWar", { third: k }));
        if (enemy !== undefined) out.push({ type: "propose", to: other, kind: "demandWar", third: enemy });
      }
      if (roll(AI_OFFERS.allyDuty) === 1) {
        const enemy = them.contacts.find((k) => k !== view.viewer && !declared.has(k) && relation(view, other, k).status === "war" &&
          relation(view, view.viewer, k).status !== "war" && player.contacts.includes(k));
        if (enemy !== undefined) {
          declared.add(enemy);
          out.push({ type: "declareWar", target: enemy });
        }
      }
    }
    if (strategy === "aggressive" && player.isHuman && !declared.has(other) && aggressiveWar(view, other)) {
      declared.add(other);
      out.push({ type: "declareWar", target: other });
      continue;
    }
    const cmd = offer(view, other);
    if (cmd) out.push(cmd);
  }
  // One proposal of a kind to an empire at a time (a counter-offer may already have used it).
  const seen = new Set<string>();
  return out.filter((c) => {
    if (c.type !== "propose") return true;
    const key = `${c.to}|${c.kind}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * A human's Aggressive automation goes to war by the computer empires'
 * strength test: its fleets must outgun the neighbor's by 125% + d200 and
 * more for each treaty (see AI_WAR), at most one war at a time.
 */
function aggressiveWar(view: PlayerView, other: PlayerId): boolean {
  const player = me(view);
  if (player.contacts.some((k) => relation(view, view.viewer, k).status === "war")) return false;
  const r = relation(view, view.viewer, other);
  if (r.status === "peace" || myFleets(view).reduce((s, f) => s + fleetStrength(view, f), 0) <= 0) return false;
  const S = AI_WAR.strength;
  let t = S.base + die(view, `war${other}`)(S.roll) + S.perDifficulty * 2 + S.temperament * persOf(view, view.viewer, other);
  if (r.status === "nonAggression") t += S.nonAggression;
  if (r.status === "alliance") t += S.alliance;
  if (r.trade) t += S.trade;
  if (r.research) t += S.research;
  return strengthRatio(view, view.viewer, other) >= t;
}
