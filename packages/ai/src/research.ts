import {
  OBJECTIVES, PICK_OPTIONS, RESEARCH_GROUPS, SHIP_SPECIALTIES, TIERS_BY_ID, TRAIT_COSTS, WEAPON_LEANS, availableTiers, getRace,
  leanings, learnsWholeField, mutationCost, researchOptions, type Command, type ResearchGroup, type NumericPick, type PlayerView, type RacePicks,
} from "@starlord/sim";
import { strategyOf } from "./strategies.js";
import { me } from "./util.js";

/** Applications the AI wants, best first. Anything else is taken cheapest first. */
const PRIORITY = [
  "automatedFactory", "hydroponicFarm", "researchLab", "biospheres", "deuteriumFuelCells", "fusionBeam", "fusionDrive",
  "classIShield", "soilEnrichment", "tritaniumArmor", "spacePort", "cloningCenter", "optronicComputer", "missileBase",
  "roboMinerPlant", "pollutionProcessor", "merculiteMissile", "iridiumFuelCells", "battleScanner", "terraforming",
  "supercomputer", "planetaryStockExchange", "neutronBlaster", "classIIIShield", "ionDrive", "zortriumArmor",
  "microbiotics", "planetaryRadiationShield", "roboticFactory", "positronicComputer", "autolab", "gravitonBeam",
  "astroUniversity", "holoSimulator", "confederation", "federation", "galacticUnification", "imperium",
  "heightenedIntelligence", "deepCoreMining", "androidWorkers", "classVShield", "neutroniumArmor", "phasor",
  "antimatterDrive", "galacticNetwork", "advancedCityPlanning", "titanHull", "plasmaCannon", "cyberneticComputer",
  "universalAntidote", "gaiaTransformation", "adamantiumArmor", "classVIIShield", "dimensionalPortal", "disruptorCannon",
  "hyperDrive", "evolutionaryMutation", "doomStarHull", "classXShield", "stellarConverter",
];

/** Applications each research strategy pulls ahead of the usual order, best first. */
export const RESEARCH_FOCUS: Record<string, string[]> = {
  economy: [
    "automatedFactory", "hydroponicFarm", "researchLab", "biospheres", "soilEnrichment", "cloningCenter", "roboMinerPlant",
    "pollutionProcessor", "supercomputer", "planetaryStockExchange", "microbiotics", "subterraneanFarms", "roboticFactory",
    "autolab", "astroUniversity", "recyclotron", "deepCoreMining", "androidWorkers", "androidScientists", "galacticNetwork",
    "galacticCurrencyExchange", "heightenedIntelligence",
  ],
  military: [
    "fusionBeam", "tritaniumArmor", "classIShield", "optronicComputer", "battleScanner", "merculiteMissile", "missileBase",
    "neutronBlaster", "zortriumArmor", "classIIIShield", "positronicComputer", "gravitonBeam", "spaceAcademy", "phasor",
    "titanHull", "plasmaCannon", "cyberneticComputer", "classVShield", "neutroniumArmor", "disruptorCannon",
    "adamantiumArmor", "classVIIShield", "doomStarHull", "classXShield", "stellarConverter",
  ],
  expansion: [
    "deuteriumFuelCells", "fusionDrive", "hydroponicFarm", "biospheres", "spacePort", "iridiumFuelCells", "soilEnrichment",
    "cloningCenter", "terraforming", "microbiotics", "ionDrive", "subterraneanFarms", "uridiumFuelCells", "artificialPlanet",
    "advancedCityPlanning", "antimatterDrive", "gaiaTransformation", "thoriumFuelCells", "hyperDrive",
  ],
};

/**
 * How far a leaning pulls an application forward: its place in the usual
 * order is scaled by LEAN_PULL / (LEAN_PULL + weight), so the original's
 * weight of 100 halves it and 20 takes a sixth off.
 */
export const LEAN_PULL = 100;

/** Research weight per application from the empire's objective, weapon lean and ship specialty. */
export function leanResearchWeights(view: PlayerView): Map<string, number> {
  const l = leanings(view, view.viewer);
  const out = new Map<string, number>();
  for (const def of [OBJECTIVES[l.objective], WEAPON_LEANS[l.weapon], SHIP_SPECIALTIES[l.specialty]]) {
    for (const [group, weight] of Object.entries(def.research) as [ResearchGroup, number][]) {
      for (const tech of RESEARCH_GROUPS[group]) out.set(tech, Math.max(out.get(tech) ?? 0, weight));
    }
  }
  return out;
}

function ranker(view: PlayerView): (tech: string) => number {
  const strategy = strategyOf(view, "research");
  const focus = RESEARCH_FOCUS[strategy] ?? [];
  // Balanced play researches like the computer empires: toward their leanings.
  const lean = strategy === "balanced" ? leanResearchWeights(view) : new Map<string, number>();
  return (tech) => {
    const f = focus.indexOf(tech);
    if (f !== -1) return f;
    const i = PRIORITY.indexOf(tech);
    const place = i === -1 ? PRIORITY.length : i;
    return focus.length + (place * LEAN_PULL) / (LEAN_PULL + (lean.get(tech) ?? 0));
  };
}

export function researchOrders(view: PlayerView): Command[] {
  const player = me(view);
  const out = mutationOrders(view);
  if (player.research.tierId) return out;
  const tiers = availableTiers(view, view.viewer).map((id) => TIERS_BY_ID[id]!);
  if (tiers.length === 0) return out;
  const rank = ranker(view);
  const unknown = rank("");
  const scored = tiers.map((t) => {
    const options = researchOptions(player, t).filter((x) => !player.techs.includes(x));
    const best = [...options].sort((a, b) => rank(a) - rank(b))[0];
    const r = best ? rank(best) : unknown + (t.hyper ? 10 : 0);
    // Wanted applications pull hard; otherwise prefer cheap fields.
    return { t, best, value: r * 40 + t.cost * 0.25 };
  });
  scored.sort((a, b) => a.value - b.value);
  const pick = scored[0]!;
  const whole = pick.t.hyper || learnsWholeField(player, pick.t);
  out.push(whole || !pick.best ? { type: "setResearch", tierId: pick.t.id } : { type: "setResearch", tierId: pick.t.id, techId: pick.best });
  return out;
}

/** Order in which the AI improves its race with Evolutionary Mutation. */
const MUTATION_ORDER: NumericPick[] = ["science", "industry", "growth", "farming", "money", "shipAttack", "shipDefense", "groundCombat", "spying"];

/** Spends mutation points greedily: drop drawbacks first, then raise the most useful picks. */
export function mutationOrders(view: PlayerView): Command[] {
  const player = me(view);
  if (player.mutationPoints <= 0) return [];
  const base = getRace(player.raceId).picks;
  let picks: RacePicks = { ...base, traits: [...base.traits] };
  const affordable = (next: RacePicks) => {
    const cost = mutationCost(base, next);
    return typeof cost === "number" && cost <= player.mutationPoints;
  };
  for (const t of base.traits) {
    if ((TRAIT_COSTS[t]?.cost ?? 0) >= 0) continue;
    const next = { ...picks, traits: picks.traits.filter((x) => x !== t) };
    if (affordable(next)) picks = next;
  }
  for (const key of MUTATION_ORDER) {
    const better = PICK_OPTIONS[key].options.filter((o) => o.value > picks[key]).sort((a, b) => b.value - a.value);
    for (const o of better) {
      const next = { ...picks, [key]: o.value };
      if (affordable(next)) {
        picks = next;
        break;
      }
    }
  }
  return typeof mutationCost(base, picks) === "number" ? [{ type: "mutateRace", picks }] : [];
}
