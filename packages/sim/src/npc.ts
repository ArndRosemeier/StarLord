import { AVENGER_DESIGN, GUARDIAN_RANDOM_XENON, LAIR_MONSTERS, LAIR_PLANET_UPGRADE, MONSTER_DESIGNS } from "./data/monsters.js";
import { LAIR_PLACEMENT_TRIES } from "./data/galaxy.js";
import { gravityOf } from "./data/planets.js";
import { TIER_OF_TECH, XENON_FIELD_TECHS, emptyHyperLevels } from "./data/techs.js";
import { grantTech } from "./empire.js";
import { newId, type TurnContext } from "./context.js";
import { atLeastMinerals, atLeastSize, distance, isRealPlanet, rollPlanet } from "./galaxy.js";
import { heroJoins } from "./leaders.js";
import { setupRaiders } from "./raiders.js";
import type { Rng } from "./rng.js";
import type { Fleet, GalaxyAge, GameState, Id, Planet, Player, Star } from "./types.js";

/** Monsters, Orion's guardian and the raiders from another dimension. */

export function npcPlayer(id: number, kind: "monsters" | "raiders"): Player {
  return {
    id,
    kind,
    name: kind === "monsters" ? "Monsters" : "Vexari",
    raceId: "terran",
    color: kind === "monsters" ? "#888888" : "#c0208a",
    isHuman: false,
    alive: true,
    government: "dictatorship",
    bc: 0,
    taxRate: 0,
    techs: ["deathRay"],
    tiers: [],
    research: { tierId: null, techChoice: null, progress: 0 },
    hyperLevels: emptyHyperLevels(),
    mutationPoints: 0,
    explored: [],
    contacts: [],
    homeStarId: "",
    designs: kind === "monsters" ? structuredClone(MONSTER_DESIGNS) : [],
    spies: { home: 0, abroad: {} },
    leaderOffers: [],
    doctrine: { retreatBelow: 0, focus: "nearest" },
    automation: [],
    hasPortal: false,
    eliminatedTurn: null,
  };
}

export function spawn(state: GameState, ownerId: number, star: Star, ships: Fleet["ships"], name: string): Fleet {
  const f: Fleet = {
    id: newId(state, "f"), ownerId, x: star.x, y: star.y, starId: star.id, destStarId: null,
    ships, stance: "attack", name,
  };
  state.fleets[f.id] = f;
  return f;
}

export function monstersId(state: GameState): number | null {
  return state.players.find((p) => p.kind === "monsters")?.id ?? null;
}

export function raidersId(state: GameState): number | null {
  return state.players.find((p) => p.kind === "raiders")?.id ?? null;
}

/**
 * Adds NPC players, the Guardian at Orion (placed during setup), the
 * monster lairs and the raiders' hidden home. Lairs go to random stars with
 * planets that are not homes, Orion, black holes, colonised or in `avoid`,
 * spread at least sqrt((W^2 + H^2) / (2 k)) apart for k lairs; each holds a
 * random monster and keeps its star's own special. Returns the lair stars.
 */
export function setupNpcs(state: GameState, rng: Rng, lairs = 0, avoid: Set<Id> = new Set()): Set<Id> {
  const homes = state.players.filter((p) => p.kind === "empire").map((p) => state.galaxy.stars.find((s) => s.id === p.homeStarId)!);
  const placed: Star[] = [];

  if (state.settings.monsters) {
    const monsters = npcPlayer(state.players.length, "monsters");
    state.players.push(monsters);
    const orion = state.galaxy.stars.find((s) => s.special === "orion");
    if (orion) spawn(state, monsters.id, orion, [{ designId: "guardian", count: 1 }], "The Guardian");

    const candidates = state.galaxy.stars.filter((s) => !s.special && s.color !== "blackHole" && !homes.includes(s) && !avoid.has(s.id)
      && s.planetIds.length > 0 && !s.planetIds.some((id) => state.planets[id]!.colonyId));
    const spacing = Math.sqrt((state.galaxy.width ** 2 + state.galaxy.height ** 2) / (2 * Math.max(1, lairs)));
    const age = state.settings.galaxyAge ?? "average";
    for (let n = 0; n < lairs && candidates.length > 0; n++) {
      let star: Star | null = null;
      for (let t = 0; t < LAIR_PLACEMENT_TRIES && !star; t++) {
        const s = rng.pick(candidates);
        if (!placed.includes(s) && placed.every((o) => distance(o, s) >= spacing)) star = s;
      }
      if (!star) continue;
      placed.push(star);
      const designId = rng.pick(LAIR_MONSTERS);
      const design = MONSTER_DESIGNS.find((d) => d.id === designId)!;
      spawn(state, monsters.id, star, [{ designId, count: 1 }], design.name);
      upgradeLairPlanet(state, rng, star, designId, age);
    }
  }

  if (state.settings.raiders) setupRaiders(state, rng);
  return new Set(placed.map((s) => s.id));
}

/** The planet a monster guards is raised as LAIR_PLANET_UPGRADE says. */
function upgradeLairPlanet(state: GameState, rng: Rng, star: Star, designId: string, age: GalaxyAge): void {
  const up = LAIR_PLANET_UPGRADE[designId];
  if (!up) return;
  const old = state.planets[rng.pick(star.planetIds)]!;
  const p: Planet = isRealPlanet(old) ? { ...old } : { ...rollPlanet(rng, star, old.orbit, old.id, age, "planet"), special: old.special };
  p.size = atLeastSize(p.size, up.size);
  p.minerals = atLeastMinerals(p.minerals, up.minerals);
  if (up.climate && !(up.climate === "terran" && p.type === "gaia")) p.type = up.climate;
  p.gravity = gravityOf(p.size, p.minerals);
  state.planets[p.id] = p;
}

/** Games saved before the monsters got their original stats take the current designs. */
export function refreshMonsterDesigns(state: GameState): void {
  const monsters = state.players.find((p) => p.kind === "monsters");
  if (!monsters || MONSTER_DESIGNS.every((d) => monsters.designs.some((x) => x.id === d.id && x.fixed?.crew === 0))) return;
  monsters.designs = structuredClone(MONSTER_DESIGNS);
}

/**
 * Rewards for slaying Orion's guardian, as in the original: the victor gets
 * the elders' ship it guarded (the Avenger, with the last of the elders as its
 * captain if a captain's post is free), learns the Death Ray plus up to three
 * other xenon technologies it lacks, and scores a bonus.
 */
export function guardianSlain(ctx: TurnContext, killer: number, starId: string): void {
  const star = ctx.state.galaxy.stars.find((s) => s.id === starId);
  if (star?.special !== "orion" || ctx.state.guardianSlainBy !== undefined) return;
  const p = ctx.state.players[killer]!;
  if (p.kind === "empire") ctx.state.guardianSlainBy = killer;
  const learn = (tech: string) => {
    if (grantTech(p, tech)) ctx.emit({ kind: "techLearned", playerId: killer, techId: tech, tierId: TIER_OF_TECH[tech]?.id ?? "xenon", source: "salvage" });
  };
  learn("deathRay");
  const pool = XENON_FIELD_TECHS.filter((t) => !p.techs.includes(t));
  for (let i = 0; i < GUARDIAN_RANDOM_XENON && pool.length > 0; i++) {
    learn(pool.splice(ctx.rng.int(0, pool.length - 1), 1)[0]!);
  }
  if (p.kind !== "empire") return;
  if (!p.designs.some((d) => d.id === AVENGER_DESIGN.id)) p.designs.push(structuredClone(AVENGER_DESIGN));
  const fleet = spawn(ctx.state, killer, star, [{ designId: AVENGER_DESIGN.id, count: 1 }], AVENGER_DESIGN.name);
  fleet.stance = "defend";
  heroJoins(ctx.state, killer, "guardian", ctx.emit, fleet.id);
}

/** Every NPC weapon tech resolves to a tier or "never"; keep the helper close to its data. */
export function isNpcTech(tech: string): boolean {
  return !TIER_OF_TECH[tech];
}
