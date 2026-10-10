import { TIERS_BY_ID, availableTiers, type Command, type PlayerView } from "@starlord/sim";
import { me } from "./util.js";

/** Techs the AI wants, best first. Anything else is taken cheapest first. */
const PRIORITY = [
  "automatedFactory", "hydroponicFarm", "researchLab", "deuteriumFuelCells", "outpostShip", "biospheres",
  "fusionBeam", "classIShield", "fusionDrive", "soilEnrichment", "destroyerHull", "tritaniumArmor", "spacePort",
  "cloningCenter", "optronicComputer", "missileBase", "roboMinerPlant", "pollutionProcessor", "merculiteMissile",
  "cruiserHull", "iridiumFuelCells", "battleScanner", "terraforming", "supercomputer", "planetaryStockExchange",
  "neutronBlaster", "classIIIShield", "ionDrive", "zortriumArmor", "microbiotics", "battleshipHull",
  "planetaryRadiationShield", "advancedCityPlanning", "roboticFactory", "positronicComputer", "autolab", "gravitonBeam",
  "astroUniversity", "holoSimulator", "advancedGovernment", "deepCoreMining", "classVShield", "neutroniumArmor",
  "phasor", "antimatterDrive", "galacticNetwork", "gaiaTransformation", "titanHull", "plasmaCannon",
  "cyberneticComputer", "adamantiumArmor", "classVIIShield", "dimensionalPortal", "disruptorCannon",
];

const rank = (tech: string) => {
  const i = PRIORITY.indexOf(tech);
  return i === -1 ? PRIORITY.length : i;
};

export function researchOrders(view: PlayerView): Command[] {
  const player = me(view);
  if (player.research.tierId) return [];
  const tiers = availableTiers(view, view.viewer).map((id) => TIERS_BY_ID[id]!);
  if (tiers.length === 0) return [];
  const scored = tiers.map((t) => {
    const best = [...t.techs].sort((a, b) => rank(a) - rank(b))[0]!;
    // Wanted techs pull hard; otherwise prefer cheap tiers.
    return { t, best, value: rank(best) * 40 + t.cost };
  });
  scored.sort((a, b) => a.value - b.value);
  const pick = scored[0]!;
  return [{ type: "setResearch", tierId: pick.t.id, techId: pick.best }];
}
