import { GUARDIAN_RANDOM_XENON, LAIR_MONSTERS, MONSTER_DESIGNS } from "./data/monsters.js";
import { TIER_OF_TECH, XENON_FIELD_TECHS, emptyHyperLevels } from "./data/techs.js";
import { grantTech } from "./empire.js";
import { newId, type TurnContext } from "./context.js";
import { distance } from "./galaxy.js";
import { maxPopulation } from "./economy.js";
import { getRace } from "./data/races.js";
import { heroJoins } from "./leaders.js";
import { setupRaiders } from "./raiders.js";
import type { Rng } from "./rng.js";
import type { Fleet, GameState, Player, Star } from "./types.js";

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
    designs: kind === "monsters" ? MONSTER_DESIGNS : [],
    spies: { home: 0, abroad: {} },
    leaderOffers: [],
    councilVote: "abstain",
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

/** Adds NPC players, Orion, monster lairs and the raiders' hidden home. */
export function setupNpcs(state: GameState, rng: Rng): void {
  const homes = state.players.filter((p) => p.kind === "empire").map((p) => state.galaxy.stars.find((s) => s.id === p.homeStarId)!);
  const nearHome = (s: Star, r: number) => homes.some((h) => distance(h, s) < r);

  if (state.settings.monsters) {
    const monsters = npcPlayer(state.players.length, "monsters");
    state.players.push(monsters);

    // Orion: the star nearest the galaxy's center that isn't someone's home.
    const center = { x: state.galaxy.width / 2, y: state.galaxy.height / 2 };
    const orion = state.galaxy.stars
      .filter((s) => !homes.includes(s))
      .sort((a, b) => distance(a, center) - distance(b, center))[0];
    if (orion) {
      orion.special = "orion";
      orion.name = "Orion";
      orion.color = "white";
      orion.nebula = false;
      for (const pid of orion.planetIds) delete state.planets[pid];
      const p = {
        id: newId(state, "p"), starId: orion.id, orbit: 3, type: "gaia" as const, size: "huge" as const,
        minerals: "ultraRich" as const, gravity: "heavy" as const, special: "artifacts" as const, colonyId: null,
      };
      state.planets[p.id] = p;
      orion.planetIds = [p.id];
      spawn(state, monsters.id, orion, [{ designId: "guardian", count: 1 }], "The Guardian");
    }

    const terran = getRace("terran");
    const maxHome = Math.max(...state.galaxy.stars.map((s) => Math.min(...homes.map((h) => distance(h, s)))));
    for (const star of state.galaxy.stars) {
      if (star.special || star.color === "blackHole" || homes.includes(star) || nearHome(star, 5)) continue;
      const value = star.planetIds.reduce((sum, id) => sum + maxPopulation(state.planets[id]!, terran), 0);
      if (value < 8 || !rng.chance(0.25)) continue;
      const depth = Math.min(...homes.map((h) => distance(h, star))) / maxHome;
      const idx = Math.min(LAIR_MONSTERS.length - 1, Math.floor(depth * LAIR_MONSTERS.length + rng.next() * 1.5 - 0.5));
      const designId = LAIR_MONSTERS[Math.max(0, idx)]!;
      const design = MONSTER_DESIGNS.find((d) => d.id === designId)!;
      spawn(state, monsters.id, star, [{ designId, count: 1 }], design.name);
      // Lairs guard treasure: a monster system always has a second special.
      const best = star.planetIds.map((id) => state.planets[id]!).find((p) => p.special === "none" && !p.colonyId);
      if (best) best.special = rng.pick(["gold", "gems", "artifacts"] as const);

    }
  }

  if (state.settings.raiders) setupRaiders(state, rng);
}

/**
 * Rewards for clearing monster lairs. Orion's guardian guards Loknar's ship:
 * the victor learns the Death Ray plus up to three other xenon technologies
 * it lacks, and the last of the elders joins if a captain's post is free.
 */
export function guardianSlain(ctx: TurnContext, killer: number, starId: string): void {
  const star = ctx.state.galaxy.stars.find((s) => s.id === starId);
  if (star?.special !== "orion") return;
  const p = ctx.state.players[killer]!;
  const learn = (tech: string) => {
    if (grantTech(p, tech)) ctx.emit({ kind: "techLearned", playerId: killer, techId: tech, tierId: TIER_OF_TECH[tech]?.id ?? "xenon", source: "salvage" });
  };
  learn("deathRay");
  const pool = XENON_FIELD_TECHS.filter((t) => !p.techs.includes(t));
  for (let i = 0; i < GUARDIAN_RANDOM_XENON && pool.length > 0; i++) {
    learn(pool.splice(ctx.rng.int(0, pool.length - 1), 1)[0]!);
  }
  if (p.kind === "empire") heroJoins(ctx.state, killer, "guardian", ctx.emit);
}

/** Every NPC weapon tech resolves to a tier or "never"; keep the helper close to its data. */
export function isNpcTech(tech: string): boolean {
  return !TIER_OF_TECH[tech];
}
