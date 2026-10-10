/**
 * Playable races. They mirror the 13 MoO2 archetypes under original names, so
 * nothing ships with the original trademarks. `assetKey` names the race's video
 * and portrait in /public/races (`<assetKey>.mp4` and `<assetKey>.webp`).
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
  assetKey: string;
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
    { id: "kyrrin", name: "Kyrrin", plural: "Kyrrin", archetype: "Avian pilots", color: "#d9b44a", assetKey: "kyrrin",
      description: "Hollow-boned flyers whose evasive instincts make their warships hard to hit. Their homeworld hides relics of an older age." },
    { growth: 0.5, shipDefense: 3, government: "dictatorship", traits: ["artifactsHomeworld"] },
  ),
  race(
    { id: "gorvath", name: "Gorvath", plural: "Gorvath", archetype: "Heavy-world brutes", color: "#8a5a3c", assetKey: "gorvath",
      description: "Massive omnivores from a crushing world, fearsome in boarding actions and ground assaults." },
    { farming: 0.5, shipAttack: 1, groundCombat: 2, government: "dictatorship", traits: ["highG", "largeHomeworld"] },
  ),
  race(
    { id: "shadar", name: "Shadar", plural: "Shadar", archetype: "Shapeshifting spies", color: "#5a4a7a", assetKey: "shadar",
      description: "Mimics who wear other faces. Their agents are everywhere and their ships slip past sensors." },
    { industry: 1, spying: 3, government: "dictatorship", traits: ["stealthy"] },
  ),
  race(
    { id: "lysari", name: "Lysari", plural: "Lysari", archetype: "Telepathic matriarchy", color: "#4a7ad9", assetKey: "lysari",
      description: "A warrior sisterhood of mind-readers. They see the whole galaxy and bend minds to their will." },
    { science: 1, shipAttack: 1, shipDefense: 1, government: "feudal", traits: ["telepathic", "omniscient"] },
  ),
  race(
    { id: "quillan", name: "Quillan", plural: "Quillan", archetype: "Amphibian merchant clans", color: "#c97a2a", assetKey: "quillan",
      description: "Bejeweled amphibian traders with uncanny luck. Every deal in the galaxy passes through their webbed hands." },
    { growth: 0.5, money: 1, government: "dictatorship", traits: ["lowG", "fantasticTraders", "lucky"] },
  ),
  race(
    { id: "terran", name: "Terrans", plural: "Terrans", archetype: "Diplomatic generalists", color: "#3a9ad9", assetKey: "terran",
      description: "Adaptable and persuasive. Terrans win friends easily and trade with anyone." },
    { science: 1, money: 0.5, government: "democracy", traits: ["charismatic"] },
  ),
  race(
    { id: "zhrikk", name: "Zhrikk", plural: "Zhrikk", archetype: "Hive insectoids", color: "#7ab32a", assetKey: "zhrikk",
      description: "A single will in a billion bodies. Tireless farmers and builders who never question an order." },
    { farming: 1, industry: 1, government: "unification", traits: ["largeHomeworld", "uncreative"] },
  ),
  race(
    { id: "kordex", name: "Kordex", plural: "Kordex", archetype: "Cyborg engineers", color: "#7a7a8a", assetKey: "kordex",
      description: "Flesh grafted onto machine. Their factories run day and night and their ships repair themselves." },
    { industry: 2, government: "dictatorship", traits: ["cybernetic"] },
  ),
  race(
    { id: "felhari", name: "Felhari", plural: "Felhari", archetype: "Feline warrior caste", color: "#d94a2a", assetKey: "felhari",
      description: "Proud hunters with the sharpest gunners in known space. Their admirals are legends." },
    { industry: 1, shipAttack: 3, government: "dictatorship", traits: ["warlord"] },
  ),
  race(
    { id: "ythari", name: "Ythari", plural: "Ythari", archetype: "Scholar savants", color: "#9a4ad9", assetKey: "ythari",
      description: "Frail giants of the intellect. Every field of research yields all its secrets to them." },
    { science: 2, government: "democracy", traits: ["creative", "lowG", "largeHomeworld"] },
  ),
  race(
    { id: "draskar", name: "Draskar", plural: "Draskar", archetype: "Burrowing reptiles", color: "#2a8a4a", assetKey: "draskar",
      description: "Cold-blooded breeders who tunnel deep beneath every world they settle." },
    { growth: 1, government: "feudal", traits: ["subterranean", "largeHomeworld"] },
  ),
  race(
    { id: "petrani", name: "Petrani", plural: "Petrani", archetype: "Silicon lifeforms", color: "#b3b3a0", assetKey: "petrani",
      description: "Living crystal that eats rock and shrugs off any climate, but cannot stand other species." },
    { growth: -0.5, industry: 1, science: -1, government: "dictatorship", traits: ["lithovore", "tolerant", "repulsive"] },
  ),
  race(
    { id: "thalassi", name: "Thalassi", plural: "Thalassi", archetype: "Aquatic mystics", color: "#2ab3b3", assetKey: "thalassi",
      description: "Ocean dwellers who slip between dimensions and thrive on water worlds." },
    { science: 1, government: "democracy", traits: ["aquatic", "transDimensional"] },
  ),
];

/** A portrait and video a custom race can wear. */
export interface RaceLook {
  assetKey: string;
  name: string;
}

/** Art made for custom races only; the first entry is the builder's default look. */
export const CUSTOM_ONLY_LOOKS: RaceLook[] = [{ assetKey: "tramps", name: "Tramps" }];

/** Every look a custom race can pick: custom-only art first, then each playable race's. */
export const RACE_LOOKS: RaceLook[] = [...CUSTOM_ONLY_LOOKS, ...RACES.map((r) => ({ assetKey: r.assetKey, name: r.plural }))];

export const RACES_BY_ID: Record<string, RaceDef> = Object.fromEntries(RACES.map((r) => [r.id, r]));

/** Custom races in play, keyed by their content-derived id (see customRace.ts). */
const CUSTOM_RACES = new Map<string, RaceDef>();

export function registerRaces(defs: readonly RaceDef[] | undefined): void {
  for (const d of defs ?? []) if (!RACES_BY_ID[d.id]) CUSTOM_RACES.set(d.id, d);
}

export function getRace(id: string): RaceDef {
  const r = RACES_BY_ID[id] ?? CUSTOM_RACES.get(id);
  if (!r) throw new Error(`unknown race ${id}`);
  return r;
}

export function hasTrait(r: RaceDef, t: RaceTrait): boolean {
  return r.picks.traits.includes(t);
}
