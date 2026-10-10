/**
 * Playable races. They mirror the 13 MoO2 archetypes under original names, so
 * nothing ships with the original trademarks. `assetKey` is the file name of the
 * race's video and portrait in /public (the source art still uses the old names).
 * Trait values are first-pass approximations, to be balanced with headless runs.
 */

export type Government = "feudal" | "dictatorship" | "democracy" | "unification";

export type RaceTrait =
  | "lowG" | "highG" | "aquatic" | "subterranean" | "largeHomeworld" | "richHomeworld"
  | "poorHomeworld" | "artifactsHomeworld" | "cybernetic" | "lithovore" | "repulsive"
  | "charismatic" | "uncreative" | "creative" | "tolerant" | "fantasticTraders"
  | "telepathic" | "lucky" | "omniscient" | "stealthy" | "transDimensional" | "warlord";

export interface RacePicks {
  /** Population growth multiplier delta, e.g. +1 = +100%. */
  growth: number;
  /** Bonus food per farmer. */
  farming: number;
  /** Bonus industry per worker. */
  industry: number;
  /** Bonus research per scientist. */
  science: number;
  /** Bonus BC per population unit. */
  money: number;
  /** Ship beam attack and defense levels, ground combat and spying, in MoO2 picks. */
  shipAttack: number;
  shipDefense: number;
  groundCombat: number;
  spying: number;
  government: Government;
  traits: RaceTrait[];
}

export interface RaceDef {
  id: string;
  name: string;
  /** Plural or collective name used in text. */
  plural: string;
  archetype: string;
  description: string;
  color: string;
  assetKey: string | null;
  picks: RacePicks;
}

const base: Omit<RacePicks, "government" | "traits"> = {
  growth: 0, farming: 0, industry: 0, science: 0, money: 0,
  shipAttack: 0, shipDefense: 0, groundCombat: 0, spying: 0,
};

const race = (
  def: Omit<RaceDef, "picks">,
  picks: Partial<RacePicks> & Pick<RacePicks, "government" | "traits">,
): RaceDef => ({ ...def, picks: { ...base, ...picks } });

export const RACES: RaceDef[] = [
  race(
    { id: "kyrrin", name: "Kyrrin", plural: "Kyrrin", archetype: "Avian pilots", color: "#d9b44a", assetKey: "Alkari",
      description: "Hollow-boned flyers whose evasive instincts make their warships hard to hit. Their homeworld hides relics of an older age." },
    { shipDefense: 3, government: "dictatorship", traits: ["artifactsHomeworld"] },
  ),
  race(
    { id: "gorvath", name: "Gorvath", plural: "Gorvath", archetype: "Heavy-world brutes", color: "#8a5a3c", assetKey: null,
      description: "Massive omnivores from a crushing world, fearsome in boarding actions and ground assaults." },
    { shipAttack: 1, groundCombat: 2, government: "dictatorship", traits: ["highG", "largeHomeworld"] },
  ),
  race(
    { id: "shadar", name: "Shadar", plural: "Shadar", archetype: "Shapeshifting spies", color: "#5a4a7a", assetKey: "Darlok",
      description: "Mimics who wear other faces. Their agents are everywhere and their ships slip past sensors." },
    { spying: 3, government: "dictatorship", traits: ["stealthy"] },
  ),
  race(
    { id: "lysari", name: "Lysari", plural: "Lysari", archetype: "Telepathic matriarchy", color: "#4a7ad9", assetKey: "Elerian",
      description: "A warrior sisterhood of mind-readers. They see the whole galaxy and bend minds to their will." },
    { farming: -0.5, shipAttack: 1, shipDefense: 1, government: "feudal", traits: ["telepathic", "omniscient"] },
  ),
  race(
    { id: "quillan", name: "Quillan", plural: "Quillan", archetype: "Merchant clans", color: "#c97a2a", assetKey: null,
      description: "Light-framed hagglers with uncanny luck. Every deal in the galaxy passes through their hands." },
    { money: 1, government: "dictatorship", traits: ["lowG", "fantasticTraders", "lucky"] },
  ),
  race(
    { id: "terran", name: "Terrans", plural: "Terrans", archetype: "Diplomatic generalists", color: "#3a9ad9", assetKey: "Terran",
      description: "Adaptable and persuasive. Terrans win friends easily and trade with anyone." },
    { science: 1, money: 0.5, government: "democracy", traits: ["charismatic"] },
  ),
  race(
    { id: "zhrikk", name: "Zhrikk", plural: "Zhrikk", archetype: "Hive insectoids", color: "#7ab32a", assetKey: "Klackon",
      description: "A single will in a billion bodies. Tireless farmers and builders who never question an order." },
    { farming: 1, industry: 1, government: "unification", traits: ["largeHomeworld", "uncreative"] },
  ),
  race(
    { id: "kordex", name: "Kordex", plural: "Kordex", archetype: "Cyborg engineers", color: "#7a7a8a", assetKey: "Meklar",
      description: "Flesh grafted onto machine. Their factories run day and night and their ships repair themselves." },
    { industry: 2, government: "dictatorship", traits: ["cybernetic"] },
  ),
  race(
    { id: "felhari", name: "Felhari", plural: "Felhari", archetype: "Feline warrior caste", color: "#d94a2a", assetKey: "Mrrshan",
      description: "Proud hunters with the sharpest gunners in known space. Their admirals are legends." },
    { shipAttack: 3, government: "dictatorship", traits: ["warlord"] },
  ),
  race(
    { id: "ythari", name: "Ythari", plural: "Ythari", archetype: "Scholar savants", color: "#9a4ad9", assetKey: "Psilon",
      description: "Frail giants of the intellect. Every field of research yields all its secrets to them." },
    { science: 2, government: "democracy", traits: ["creative", "lowG", "largeHomeworld"] },
  ),
  race(
    { id: "draskar", name: "Draskar", plural: "Draskar", archetype: "Burrowing reptiles", color: "#2a8a4a", assetKey: "Sakkra",
      description: "Cold-blooded breeders who tunnel deep beneath every world they settle." },
    { growth: 1, government: "feudal", traits: ["subterranean", "largeHomeworld"] },
  ),
  race(
    { id: "petrani", name: "Petrani", plural: "Petrani", archetype: "Silicon lifeforms", color: "#b3b3a0", assetKey: "Silicoid",
      description: "Living crystal that eats rock and shrugs off any climate, but cannot stand other species." },
    { growth: -0.5, industry: 1, science: -1, government: "dictatorship", traits: ["lithovore", "tolerant", "repulsive"] },
  ),
  race(
    { id: "thalassi", name: "Thalassi", plural: "Thalassi", archetype: "Aquatic mystics", color: "#2ab3b3", assetKey: "Trilarian",
      description: "Ocean dwellers who slip between dimensions and thrive on water worlds." },
    { science: 1, government: "democracy", traits: ["aquatic", "transDimensional"] },
  ),
];

export const RACES_BY_ID: Record<string, RaceDef> = Object.fromEntries(RACES.map((r) => [r.id, r]));

export function getRace(id: string): RaceDef {
  const r = RACES_BY_ID[id];
  if (!r) throw new Error(`unknown race ${id}`);
  return r;
}

export function hasTrait(r: RaceDef, t: RaceTrait): boolean {
  return r.picks.traits.includes(t);
}
