import {
  ARTIFACTS_RESEARCH, ARTIFACTS_SECOND_TECH_CHANCE, CLIMATES, INDUSTRY_PER_WORKER, NATIVE_FOOD_BONUS, NATIVES_POP, POLLUTION_TOLERANCE, SIZE_POP_BASE,
  SPECIAL_INCOME, SPLINTER_POP, TERRAFORM_STEP, climatePopulation, colonyMoraleParts, colonyOutput, getRace, government,
  gravityMultiplier, ADVANCED_START, CLIMATE_TABLE_BY_AGE, CREW, FIRST_FIELDS, TIERS_BY_ID, bodyMix, meanPlanets, DIFFICULTIES, DIFFICULTY_ORDER, JEALOUSY, GOVERNMENTS, PICK_OPTIONS, STAR_COLORS_BY_AGE, TAX_BC_PER_INDUSTRY,
  BATTLE_SCANNER_RANGE, FUEL_RANGES, ORBITAL_BASES, SPECIALS_BY_ID, TRANSIT_DETECTION_PER_SIZE, canColonize, fleetRange, maxPopulation, raceMaxPopulation, scanRange, type Player,
  BUILDINGS_BY_ID, BUILDING_SCRAP, buildingScrapRefund, GROWTH, PROJECTS_BY_ID, TRADE_GOODS_RATE, tradeGoodsMult, population, TECHS, TECH_LEVELS, TIER_OF_TECH, TRAIT_COSTS, techUnlocks, type Colony, type GalaxyAge, type NumericPick, type Planet, type PlayerView, type RaceTrait, type TechLevel,
  HULLS_BY_ID, REFIT, designStats, refitCost, type ShipDesign,
  SCORE, type ScoreBreakdown,
} from "@starlord/sim";
import { Tip, type TipCard } from "./Tip";
import { techSummary, unlockSummary } from "../help/articles";
import { buildingEffects } from "../help/effects";
import { climateName, pct, signed, words } from "./format";

/**
 * Tip cards that say what a thing on screen does, from the sim's own numbers.
 * The rule: never show a game thing by name alone.
 */

export function sizeTip(planet: Planet): TipCard {
  return {
    title: `${words(planet.size)} planet`, kind: "Size",
    rows: [
      ["Population on this climate", String(climatePopulation(CLIMATES[planet.type].popPercent, planet.size))],
      ["Population on a Gaia world", String(SIZE_POP_BASE[planet.size])],
      ["Industry without pollution", String(POLLUTION_TOLERANCE[planet.size])],
    ],
    text: ["Bigger planets hold more people and absorb more polluting industry. Racial and technology bonuses add to the population."],
  };
}

export function climateTip(planet: Planet): TipCard {
  const c = CLIMATES[planet.type];
  const next = TERRAFORM_STEP[planet.type];
  return {
    title: climateName(planet.type), kind: "Climate",
    rows: [
      ["Food per farmer", String(c.foodPerFarmer)],
      ["Population share", `${c.popPercent}% of a Gaia world`],
      ["Building upkeep", c.maintenancePenalty ? `+${Math.round(c.maintenancePenalty * 100)}%` : "normal"],
      ...(next ? [["Terraforms into", next.map(climateName).join(" or ")] as [string, string]] : []),
    ],
    text: [c.habitable ? (c.hostile ? "Hostile: only outposts and hardy races thrive here." : "Habitable.") : "No colonists until an Artificial Planet converts it, but an outpost ship can claim it: no population, more fuel and scanner range."],
  };
}

export function mineralsTip(planet: Planet): TipCard {
  return {
    title: `${words(planet.minerals)} minerals`, kind: "Minerals",
    rows: [["Industry per worker", String(INDUSTRY_PER_WORKER[planet.minerals])]],
    text: ["Base industry of each worker, before race, technology and morale bonuses."],
  };
}

export function gravityTip(planet: Planet, raceId: string): TipCard {
  const race = getRace(raceId);
  return {
    title: `${words(planet.gravity)} gravity`, kind: "Gravity",
    rows: [[`Output for ${race.plural}`, pct(gravityMultiplier(race, planet.gravity))]],
    text: ["Living away from your home gravity cuts food, industry and research. A Gravity Generator removes the penalty."],
  };
}

export function specialTip(planet: Planet): TipCard | null {
  switch (planet.special) {
    case "gold": return { title: "Gold deposits", kind: "Special", text: [`+${SPECIAL_INCOME.gold} BC a turn for a populated colony here, raised by income bonuses.`] };
    case "gems": return { title: "Gem deposits", kind: "Special", text: [`+${SPECIAL_INCOME.gems} BC a turn for a populated colony here, raised by income bonuses.`] };
    case "artifacts": return {
      title: "Ancient artifacts", kind: "Special",
      text: [`+${ARTIFACTS_RESEARCH} research per scientist here. The first empire to explore the system learns a random technology from its open research fields (${pct(ARTIFACTS_SECOND_TECH_CHANCE)} chance of two).`],
    };
    case "natives": return {
      title: "Natives", kind: "Special",
      text: [`${NATIVES_POP} population of natives live here. Colonize the planet and they join as farmers growing ${NATIVE_FOOD_BONUS} food each on top of the land's plain rate (before morale and other modifiers); they pay no tax and never grow.`],
    };
    case "splinter": return {
      title: "Splinter colony", kind: "Special",
      text: [`Long-lost kin of the first empire to explore here: ${SPLINTER_POP} population (fewer if the planet holds fewer of them) join that empire as a free colony.`],
    };
    default: return null;
  }
}

/** Where a colony's morale comes from and what it does. */
export function moraleTip(view: PlayerView, colony: Colony): TipCard {
  const owner = view.players[colony.ownerId]!;
  const gov = government(owner);
  if (gov.noMorale) {
    return { title: "Morale", text: [`A ${gov.name} has no morale: output is never raised or lowered by it.`] };
  }
  const parts = colonyMoraleParts(view, colony);
  const o = colonyOutput(view, colony);
  return {
    title: "Morale", kind: `${signed(o.morale)}%`,
    rows: parts.length ? parts.map((p) => [p.why, `${signed(p.value)}%`] as [string, string]) : [["Nothing", "0%"]],
    text: [`Morale adds its percentage to food, industry and research, and to the population tax this colony pays (${signed(o.morale)}% now).`],
  };
}

/** "Medium terran, abundant minerals, normal gravity, gold": each word explains itself on hover or long press. */
export function PlanetFacts({ planet, raceId }: { planet: Planet; raceId: string }) {
  const special = specialTip(planet);
  return (
    <>
      <Tip card={sizeTip(planet)}><span className="explained">{words(planet.size)}</span></Tip>{" "}
      <Tip card={climateTip(planet)}><span className="explained">{climateName(planet.type)}</span></Tip>,{" "}
      <Tip card={mineralsTip(planet)}><span className="explained">{words(planet.minerals)} minerals</span></Tip>,{" "}
      <Tip card={gravityTip(planet, raceId)}><span className="explained">{planet.gravity} gravity</span></Tip>
      {special && <>, <Tip card={special}><span className="explained">{words(planet.special)}</span></Tip></>}
    </>
  );
}

const mult = (v: number) => (v === 1 ? "normal" : `${signed(Math.round((v - 1) * 100))}%`);

/** How many of the player's race a planet holds once settled, and where the number comes from. */
export function maxPopTip(planet: Planet, player: Player): TipCard {
  const race = getRace(player.raceId);
  const max = canColonize(planet.type) ? maxPopulation(planet, race, [], player) : 0;
  if (!canColonize(planet.type)) {
    return {
      title: "Max population", kind: "0",
      text: [`Nobody can live on ${climateName(planet.type).toLowerCase()} until an Artificial Planet converts it.`],
    };
  }
  return {
    title: "Max population", kind: `${max} ${race.plural}`,
    rows: [
      ["Size and climate alone", String(climatePopulation(CLIMATES[planet.type].popPercent, planet.size))],
      [`${race.plural}, by racial traits`, String(raceMaxPopulation(race, planet.type, planet.size))],
      ["With your technology", String(max)],
    ],
    text: ["The most people the planet holds right after colonizing. Buildings raise it further, and terraforming improves the climate."],
  };
}

const parsecs = (n: number) => `${n} parsec${n === 1 ? "" : "s"}`;
const FUEL_BY_TECH = (tech: string) => TECHS[tech]?.name ?? words(tech);

/** The empire's fuel range: how far its ships fly from the nearest colony they can refuel at. */
export function fuelRangeTip(player: Player): TipCard {
  const range = fleetRange(player);
  const next = FUEL_RANGES.find((f) => f.range > range && !player.techs.includes(f.tech));
  const tanks = SPECIALS_BY_ID.extendedFuelTanks?.effects.fuelRangePct ?? 0;
  return {
    title: "Fuel range", kind: parsecs(range),
    rows: [
      ["Refuel at", "your colonies and outposts, and your allies' colonies"],
      ...(next ? [[`With ${FUEL_BY_TECH(next.tech)}`, parsecs(next.range)] as [string, string]] : []),
      ...(tanks ? [["Extended Fuel Tanks", `+${tanks}% for a fleet whose every ship carries them`] as [string, string]] : []),
    ],
    text: ["Ships can fly to any star within this distance of a colony they can refuel at. Better fuel cells raise it."],
  };
}

/** The empire's scanner coverage around its colonies and fleets. */
export function scanRangeTip(player: Player): TipCard {
  const range = scanRange(player);
  return {
    title: "Scanner range", kind: parsecs(range),
    rows: [
      ["Every colony and fleet", parsecs(range)],
      ["Orbital stations", `up to +${parsecs(Math.max(...ORBITAL_BASES.map((b) => BUILDINGS_BY_ID[b]?.effects.scanRange ?? 0)))} around their colony`],
      ["Battle Scanner", `+${parsecs(BATTLE_SCANNER_RANGE)} around the fleet carrying it`],
      ["Big ships", `seen ${parsecs(TRANSIT_DETECTION_PER_SIZE)} further per size class above a frigate`],
    ],
    text: ["Foreign fleets inside this range show on your map; outside it only stars and what you have explored are known. Stealthy and cloaked ships are only seen in the same system."],
  };
}

export function governmentTip(id: keyof typeof GOVERNMENTS): TipCard {
  const g = GOVERNMENTS[id];
  return {
    title: g.name, kind: "Government",
    rows: [
      ["Food", mult(g.foodMult)], ["Industry", mult(g.industryMult)], ["Research", mult(g.researchMult)], ["BC income", mult(g.bcMult)],
      ["Ship cost", mult(g.shipCostMult)], ["Command points", mult(g.commandPointsMult)],
      ["Morale", g.noMorale ? "none: never rises or falls" : g.morale ? `${signed(g.morale)}%` : "normal"],
      ["Without barracks", g.ungarrisonedPenalty ? `−${g.ungarrisonedPenalty}% morale` : "no penalty"],
      ["Capitol lost", g.capitalLossMorale ? `−${g.capitalLossMorale}% morale everywhere` : "no penalty"],
      ["Assimilating conquests", g.assimilatesInstantly ? "instant" : `${g.assimilationTurns} turns per unit (charismatic ½, repulsive ×2)`],
      ["Spy defense", signed(g.security * 10)],
    ],
    text: g.advanced ? [`Researching its advanced form upgrades it to ${GOVERNMENTS[g.advanced].name}.`] : undefined,
  };
}

export function traitTip(t: RaceTrait): TipCard {
  const d = TRAIT_COSTS[t];
  return { title: d.name ?? words(t), kind: "Ability", text: [d.text] };
}

/** "+1 industry per worker" for a numeric race pick. */
export function pickText(k: NumericPick, v: number): string {
  const opt = PICK_OPTIONS[k].options.find((o) => o.value === v);
  const n = opt?.text ?? signed(v);
  switch (k) {
    case "growth": return `${n} population growth`;
    case "farming": return `${n} per farmer`;
    case "industry": return `${n} industry per worker`;
    case "science": return `${n} research per scientist`;
    case "money": return `${n} per population`;
    case "shipAttack": return `${n} beam attack`;
    case "shipDefense": return `${n} beam defense`;
    case "groundCombat": return `${n} on ground combat rolls`;
    case "spying": return `${n} on spy rolls`;
  }
}

/** BC gained and industry lost each turn at a tax rate, over all your colonies. */
export function taxPreview(view: PlayerView, playerId: number, rate: number): { bc: number; industry: number } {
  let bc = 0;
  for (const c of Object.values(view.colonies)) {
    if (c.ownerId !== playerId || c.outpost) continue;
    const o = colonyOutput(view, c);
    const net = o.industry + o.taxes;
    bc += Math.floor(net * rate) * TAX_BC_PER_INDUSTRY;
  }
  return { bc, industry: bc / TAX_BC_PER_INDUSTRY };
}

export const STANCE_TIPS: Record<"defend" | "attack", TipCard> = {
  defend: {
    title: "Defend", kind: "Fleet stance",
    text: [
      "Fights enemy ships it meets, but never fires on enemy planets or stations and cannot bombard or invade.",
      "Newly built ships join a defending fleet waiting at their shipyard.",
    ],
  },
  attack: {
    title: "Attack", kind: "Fleet stance",
    text: [
      "Counts as the attacker in battle and fires on enemy planets and stations as well as ships.",
      "Needed to bombard or invade colonies. New ships never join an attacking fleet.",
    ],
  },
};

export const FOCUS_TIPS: Record<"nearest" | "weakest" | "strongest", string> = {
  nearest: "Each ship fires at the closest enemy it can hit.",
  weakest: "Ships pick the enemy with the least armor and structure left, to finish it off.",
  strongest: "Ships pick the enemy with the highest combat strength, to take out the biggest threat.",
};

/** What a crew level means, and the next one. */
export function crewTip(level: number, xp: number): TipCard {
  const next = CREW.xp[level + 1];
  return {
    title: `${CREW.names[level]} crew`, kind: `${xp} XP`,
    rows: [
      ["Beam attack", signed(CREW.attack[level]!)], ["Beam defense", signed(CREW.defense[level]!)],
      ["Against missiles", signed(Math.floor(CREW.defense[level]! / 2))], ["Boarding", signed(CREW.boarding[level]!)],
      ...(next !== undefined ? [["Next level", `${CREW.names[level + 1]} at ${next} XP`] as [string, string]] : []),
    ],
    text: [`Ships gain ${CREW.xpPerTurn} XP a turn, more in battle and at a Space Academy; ordinary crews top out at ${CREW.xpCap} XP.`],
  };
}

export function difficultyText(d: keyof typeof DIFFICULTIES): string {
  const x = DIFFICULTIES[d];
  const parts = [
    x.aiOutputPerUnit ? `computer empires make ${signed(x.aiOutputPerUnit)} industry or research per worker and scientist (${signed(x.aiOutputPerUnit / 2)} food per farmer)` : "computer empires produce normally",
    x.aiGrowthPercent ? `grow ${signed(x.aiGrowthPercent)}% faster` : "",
    x.aiBcPerPop ? `earn ${signed(x.aiBcPerPop)} BC per population` : "",
    // AI_OFFERS: x grows by 4 per level, and offers come less often the bigger x; AI_TREATIES: the die shrinks by 40 per level.
    `come to you with offers ${DIFFICULTY_ORDER.indexOf(d) >= 3 ? "rarely" : DIFFICULTY_ORDER.indexOf(d) >= 2 ? "now and then" : "often"} and sign treaties among themselves ${DIFFICULTY_ORDER.indexOf(d) >= 3 ? "often" : DIFFICULTY_ORDER.indexOf(d) >= 2 ? "now and then" : "rarely"}`,
    DIFFICULTY_ORDER.indexOf(d) >= JEALOUSY.minDifficulty ? "grow jealous of your treaties with others" : "",
    x.customRaces ? "" : "custom races off",
  ].filter(Boolean);
  return `${x.name}: ${parts.join(", ")}.`;
}

export function galaxyAgeText(a: GalaxyAge): string {
  const w = STAR_COLORS_BY_AGE[a];
  const total = Object.values(w).reduce((s, v) => s + v, 0);
  // Share of all bodies (planets, asteroid belts, gas giants) with a farmable climate.
  let bodies = 0;
  let farmable = 0;
  for (const [c, weight] of Object.entries(w) as [keyof typeof w, number][]) {
    const n = weight * meanPlanets(c);
    bodies += n;
    const mix = Object.entries(bodyMix(c, a)) as [keyof typeof CLIMATES, number][];
    farmable += n * mix.reduce((s, [t, v]) => s + (CLIMATES[t].foodPerFarmer > 0 ? v : 0), 0);
  }
  return `${words(a)}: ${pct((w.blue + w.white) / total)} blue and white stars (rich minerals, hostile planets), ` +
    `${pct((w.yellow + w.orange) / total)} yellow and orange, ${pct(w.red / total)} red, ${pct(w.blackHole / total)} black holes; ` +
    `${pct(farmable / bodies)} of planets can grow food` +
    (CLIMATE_TABLE_BY_AGE[a] === "organic" ? ", more of them in the middle orbits." : ".");
}

export function techLevelText(t: TechLevel): string {
  const d = TECH_LEVELS[t];
  const first = FIRST_FIELDS.slice(0, d.firstFields).map((id) => TIERS_BY_ID[id]!.name);
  const parts = [
    d.firstFields === 1 ? `only ${first[0]} (ships can't leave home until a drive is researched)` : `the ${first.length} basic fields`,
    d.pickedFields ? `${d.pickedFields} more fields, cheapest first` : "",
    d.buildings.length ? `${d.buildings.length} homeworld buildings` : "",
    d.advancedPop ? `homeworld at ${pct(ADVANCED_START.popBase * ADVANCED_START.popScale)} of its maximum population (at least ${ADVANCED_START.minPop})` : "",
    d.extraColonies ? `${d.extraColonies} extra colonies of ${d.extraColonyPop} population` : "",
    d.exploredRadius ? `${d.exploredRadius} parsecs around home explored` : "",
    d.bc === null
      ? `${ADVANCED_START.moneyLevelOffset * ADVANCED_START.bcPerMoneyLevel} BC (${ADVANCED_START.bcPerMoneyLevel} more or less per money pick step)`
      : `${d.bc} BC`,
  ].filter(Boolean);
  return `${d.name}: ${parts.join(", ")}.`;
}

/** A technology: what it does in numbers and everything it unlocks. */
export function techTip(id: string): TipCard {
  const t = TECHS[id]!;
  const unlocks = techUnlocks(id);
  return {
    title: t.name, kind: TIER_OF_TECH[id]?.name,
    text: [techSummary(id), ...unlocks.map((u) => `${u.name}: ${unlockSummary(u)}`)],
  };
}

export function buildingTip(id: string): TipCard {
  const b = BUILDINGS_BY_ID[id]!;
  return {
    title: b.name, kind: "Building",
    rows: [["Cost", `${b.cost} production`], ["Upkeep", `${b.maintenance} BC a turn`]],
    text: [...buildingEffects(b.effects), ...(b.description ? [b.description] : [])],
  };
}

/** What scrapping a building pays and costs, for the confirm step on the Colonies screen. */
export function buildingScrapTip(id: string): TipCard {
  const b = BUILDINGS_BY_ID[id]!;
  return {
    title: `Scrap ${b.name}`, kind: "Scrap",
    rows: [
      ["Refund", `+${buildingScrapRefund(id)} BC (${pct(BUILDING_SCRAP.refund)} of its ${b.cost} cost)`],
      ["Upkeep saved", `${b.maintenance} BC a turn`],
    ],
    text: [
      `Lost: ${[...buildingEffects(b.effects), ...(b.description ? [b.description] : [])].join(" ")}`,
      `Only ${BUILDING_SCRAP.perColonyPerTurn} building per colony can be scrapped each turn; the Capitol never.`,
    ],
  };
}

/** BC a turn that this colony's industry would bring as trade goods. */
export function tradeGoodsBC(raceId: string, industry: number): number {
  return tradeGoodsMult(getRace(raceId)) > 1 ? industry : Math.ceil(industry * TRADE_GOODS_RATE);
}

export function tradeGoodsTip(raceId: string, industry: number): TipCard {
  const full = tradeGoodsMult(getRace(raceId)) > 1;
  return {
    title: "Trade Goods", kind: "Ongoing",
    rows: [["Here now", `+${tradeGoodsBC(raceId, industry)} BC a turn`]],
    text: [full ? "Your traders sell industry for its full value: 1 BC per industry." : `Sells industry for BC at ${TRADE_GOODS_RATE} BC per industry, rounded up.`,
      "An empty queue does the same."],
  };
}

/** What a colony project does, with this colony's numbers where they matter. */
export function projectTip(id: string, colony: Colony, planet: Planet, industry: number, freePlanets?: Planet[]): TipCard {
  const p = PROJECTS_BY_ID[id]!;
  const text = [p.description];
  const rows: [string, string][] = [];
  if (id === "housing") {
    const pop = population(colony);
    text.push(`Growth rises by ${GROWTH.housingPercent}% × industry ÷ colonists each turn while it is first in the queue; nothing is built.`);
    if (pop > 0) rows.push(["Here now", `about +${Math.floor((GROWTH.housingPercent * industry) / pop)}% growth a turn`]);
  }
  if (id === "terraform") {
    const next = TERRAFORM_STEP[planet.type];
    rows.push(["Next step", next?.length ? next.map(climateName).join(" or ") + (next.length > 1 ? " (random)" : "") : `none, ${climateName(planet.type)} can't be terraformed`]);
    if (colony.terraformed) rows.push(["Done here", `${colony.terraformed} time${colony.terraformed > 1 ? "s" : ""}`]);
  }
  if (freePlanets) {
    rows.push(["Free planets here", freePlanets.length ? freePlanets.map((f) => `${words(f.size)} ${climateName(f.type)}${f.colonyId ? " (your outpost)" : ""}`).join(", ") : "none"]);
    text.push(freePlanets.length > 1
      ? "When it is finished you choose which planet it goes to."
      : "When it is finished it goes to the only free planet. If none is left by then, it is scrapped for half its cost.");
  }
  return { title: p.name, kind: "Project", rows, text };
}

/** What refitting one ship from one design to another costs and does, with the sim's own formula. */
export function refitTip(player: Player, from: ShipDesign, to: ShipDesign, turns?: number | null): TipCard {
  const a = designStats(player, from);
  const b = designStats(player, to);
  const hull = HULLS_BY_ID[to.hull];
  const min = Math.floor(hull.cost / REFIT.minHullCostDivisor);
  const diff = REFIT.costDifferenceMult * (b.cost - a.cost);
  const cost = refitCost(player, from, to);
  return {
    title: `Refit to ${to.name}`, kind: `${hull.name} refit`,
    rows: [
      ["Refit cost", `${cost} production`],
      ["Cost difference", `${REFIT.costDifferenceMult} × (${b.cost} − ${a.cost}) = ${diff}`],
      ["Minimum", `${hull.name} hull ${hull.cost} / ${REFIT.minHullCostDivisor} = ${min}`],
      ["New ship instead", `${b.cost} production`],
      ["Strength", `${a.strength} → ${b.strength}`],
      ...(turns !== undefined ? [["Done in", turns === null ? "never (no industry)" : `${turns} turn${turns === 1 ? "" : "s"}`] as [string, string]] : []),
    ],
    text: [
      "The job joins the colony's build queue and is paid with its production; it can be bought like any item.",
      "Until it is done the ship is in dock and takes no part in anything. It comes back repaired, with its crew's experience.",
      "Drives and fuel range improve on every ship by themselves; armor, shields, computers, weapons and specials change only by refitting.",
    ],
    note: "Removing the job from the queue scraps the ship.",
  };
}

/** The terms of an empire's score, each with what it counts, from the sim's SCORE numbers. */
export function scoreParts(b: ScoreBreakdown): { label: string; value: number; why: string }[] {
  const c = b.counts;
  const parts = [
    { label: "Turns played", value: b.turns, why: b.turns === 0 && c.turns > 0 ? "none: no population left" : `−${SCORE.perTurn} for each of ${c.turns} turns` },
    { label: "Galaxy and rivals", value: b.galaxy, why: b.galaxy > 0 ? `${c.empires} empires × ${b.galaxy / c.empires} for this galaxy size` : "none: no population left" },
    { label: "Research", value: b.research, why: `${c.fields} fields × ${SCORE.perField}` },
    { label: "Hyper-advanced", value: b.hyper, why: `${c.hyperCategories} categories × ${SCORE.perHyperCategory}` },
    { label: "Population", value: b.population, why: `${c.population} units × ${SCORE.perPop}` },
    { label: "Captured population", value: b.captured, why: `${c.capturedPop} units taken by invasion × ${SCORE.capturedPremium}, divided by galaxy size` },
    { label: "Empires eliminated", value: b.eliminations, why: `${c.eliminated} × ${SCORE.perEliminated}` },
    { label: "Guardian of Orion", value: b.orion, why: `${SCORE.orion} for slaying it` },
    { label: "Council victory", value: b.council, why: `${SCORE.council} for being elected` },
    { label: "Raiders destroyed", value: b.antares, why: `${SCORE.antares} for beating them at home` },
  ];
  return parts.filter((p) => p.value !== 0 || p.label === "Turns played" || p.label === "Population" || p.label === "Research");
}

/** Tip card for a score: its terms and the race pick multiplier. */
export function scoreTip(b: ScoreBreakdown): TipCard {
  return {
    title: `Score ${b.total}`, kind: "As in the original",
    rows: [
      ...scoreParts(b).map((p) => [p.label, signed(p.value)] as [string, string]),
      ["Subtotal", String(b.subtotal)],
      ["Race pick bonus", `×${b.multiplier / 100}`],
    ],
    text: [
      `The sum is multiplied by 100% plus ${SCORE.perUnspentPick}% for each race pick left unspent (${b.counts.unspentPicks} here). Quicker wins score higher: every turn costs a point.`,
    ],
  };
}
