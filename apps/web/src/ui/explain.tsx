import {
  ARTIFACTS_RESEARCH, CLIMATES, INDUSTRY_PER_WORKER, NATIVE_FOOD_BONUS, NATIVES_FRACTION, POLLUTION_TOLERANCE, SIZE_POP_BASE,
  SPECIAL_INCOME, SPLINTER_POP, TERRAFORM_STEP, climatePopulation, colonyMoraleParts, colonyOutput, getRace, government,
  gravityMultiplier, AGE_MINERAL_SHIFT, CREW, DIFFICULTIES, GOVERNMENTS, PICK_OPTIONS, STAR_COLORS_BY_AGE, TAX_BC_PER_INDUSTRY,
  BUILDINGS_BY_ID, GROWTH, PROJECTS_BY_ID, TRADE_GOODS_RATE, tradeGoodsMult, population, TECHS, TECH_LEVELS, TIER_OF_TECH, TRAIT_COSTS, techUnlocks, type Colony, type GalaxyAge, type NumericPick, type Planet, type PlayerView, type RaceTrait, type TechLevel,
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
    text: [c.habitable ? (c.hostile ? "Hostile: only outposts and hardy races thrive here." : "Habitable.") : "Not habitable until an Artificial Planet converts it."],
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
      text: [`+${ARTIFACTS_RESEARCH} research per scientist here. The first settlers also get an instant breakthrough in the cheapest open research field.`],
    };
    case "natives": return {
      title: "Natives", kind: "Special",
      text: [`About ${pct(NATIVES_FRACTION)} of the planet's population lives here already. Colonize it and they join as farmers growing ${NATIVE_FOOD_BONUS} extra food each; they pay no tax and never grow.`],
    };
    case "splinter": return {
      title: "Splinter colony", kind: "Special",
      text: [`Long-lost kin of the first empire to explore here: ${SPLINTER_POP[0]} to ${SPLINTER_POP[1]} population join that empire as a free colony.`],
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
      ["Assimilating conquests", g.assimilatesInstantly ? "instant" : `${g.assimilationTurns} turns per unit`],
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
    x.aiAttitudeToHumans ? `feel ${signed(x.aiAttitudeToHumans)} toward you` : "",
    x.customRaces ? "" : "custom races off",
  ].filter(Boolean);
  return `${x.name}: ${parts.join(", ")}.`;
}

export function galaxyAgeText(a: GalaxyAge): string {
  const w = STAR_COLORS_BY_AGE[a];
  const total = Object.values(w).reduce((s, v) => s + v, 0);
  const shift = AGE_MINERAL_SHIFT[a];
  return `${words(a)}: ${pct((w.blue + w.white) / total)} blue and white stars (rich, hostile planets), ${pct((w.orange + w.red) / total)} orange and red (fertile, mineral-poor)` +
    (shift ? `; ${pct(Math.abs(shift))} of planets one mineral step ${shift > 0 ? "richer" : "poorer"}.` : ".");
}

export function techLevelText(t: TechLevel): string {
  const d = TECH_LEVELS[t];
  const parts = [
    d.generalFields ? "all basic fields" : "no fields beyond the starting ones (ships can't leave home until a drive is researched)",
    d.maxFieldLevel ? `every field up to level ${d.maxFieldLevel}` : "",
    d.extraFields ? `${d.extraFields} random extra fields` : "",
    d.buildings.length ? `${d.buildings.length} homeworld buildings` : "",
    d.extraColonies ? `${d.extraColonies} extra colonies of ${d.extraColonyPop} population` : "",
    d.exploredRadius ? `${d.exploredRadius} parsecs around home explored` : "",
    `${d.bc} BC`,
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
    rows.push(["Free planets here", freePlanets.length ? freePlanets.map((f) => `${words(f.size)} ${climateName(f.type)}`).join(", ") : "none"]);
    text.push(freePlanets.length > 1
      ? "When it is finished you choose which planet it goes to."
      : "When it is finished it goes to the only free planet. If none is left by then, it is scrapped for half its cost.");
  }
  return { title: p.name, kind: "Project", rows, text };
}
