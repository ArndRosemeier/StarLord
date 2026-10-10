import { LAIR_MONSTERS, MONSTER_DESIGNS, RAID_INTERVAL, RAID_START, RAIDER_DESIGNS, raidFleet } from "./data/monsters.js";
import { TIER_OF_TECH, emptyHyperLevels } from "./data/techs.js";
import { newId, type TurnContext } from "./context.js";
import { distance } from "./galaxy.js";
import { maxPopulation } from "./economy.js";
import { getRace, hasTrait } from "./data/races.js";
import { TRAIT_EFFECTS } from "./data/racePicks.js";
import { heroJoins } from "./leaders.js";
import type { Rng } from "./rng.js";
import type { Fleet, GameState, Player, Star } from "./types.js";

/** Monsters, Orion's guardian and the raiders from another dimension. */

export const RAIDER_HOME_NAME = "Vex Prime";

function npcPlayer(id: number, kind: "monsters" | "raiders"): Player {
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
    designs: kind === "monsters" ? MONSTER_DESIGNS : RAIDER_DESIGNS,
    spies: { home: 0, abroad: {} },
    leaderOffers: [],
    councilVote: "abstain",
    doctrine: { retreatBelow: 0, focus: "nearest" },
    automation: [],
    hasPortal: false,
    eliminatedTurn: null,
  };
}

function spawn(state: GameState, ownerId: number, star: Star, ships: Fleet["ships"], name: string): Fleet {
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
      if (star.special || homes.includes(star) || nearHome(star, 5)) continue;
      const value = star.planetIds.reduce((sum, id) => sum + maxPopulation(state.planets[id]!, terran), 0);
      if (value < 8 || !rng.chance(0.25)) continue;
      const depth = Math.min(...homes.map((h) => distance(h, star))) / maxHome;
      const idx = Math.min(LAIR_MONSTERS.length - 1, Math.floor(depth * LAIR_MONSTERS.length + rng.next() * 1.5 - 0.5));
      const designId = LAIR_MONSTERS[Math.max(0, idx)]!;
      const design = MONSTER_DESIGNS.find((d) => d.id === designId)!;
      spawn(state, monsters.id, star, [{ designId, count: 1 }], design.name);
      // Lairs guard treasure.
      const best = star.planetIds.map((id) => state.planets[id]!).find((p) => p.special === "none");
      if (best) best.special = rng.pick(["gold", "gems", "artifacts"] as const);
    }
  }

  if (state.settings.raiders) {
    const raiders = npcPlayer(state.players.length, "raiders");
    state.players.push(raiders);
    const home: Star = {
      id: newId(state, "s"), name: RAIDER_HOME_NAME, x: -6, y: state.galaxy.height / 2, color: "blackHole",
      planetIds: [], special: "raiderHome",
    };
    state.galaxy.stars.push(home);
    raiders.homeStarId = home.id;
    spawn(state, raiders.id, home, [
      { designId: "raiderFortress", count: 1 },
      { designId: "raiderDreadnought", count: 4 },
      { designId: "raiderDestroyer", count: 6 },
    ], "Vexari Home Fleet");
    state.raiders.nextRaid = RAID_START + rng.int(0, 10);
  }
}

/** Raiders strike a random empire colony, fight, and vanish the following turn. */
export function raidTick(ctx: TurnContext): void {
  const { state, rng } = ctx;
  const rid = raidersId(state);
  if (rid === null || state.raiders.defeated) return;
  const home = state.players[rid]!.homeStarId;
  for (const f of Object.values(state.fleets)) {
    if (f.ownerId === rid && f.starId !== home) delete state.fleets[f.id];
  }
  if (state.turn < state.raiders.nextRaid) return;
  state.raiders.nextRaid = state.turn + rng.int(RAID_INTERVAL[0], RAID_INTERVAL[1]);
  // Lucky races are usually overlooked by raiders.
  const lucky = (c: { ownerId: number }) => hasTrait(getRace(state.players[c.ownerId]!.raceId), "lucky");
  const targets = Object.values(state.colonies).filter(
    (c) => state.players[c.ownerId]!.kind === "empire" && !c.outpost && !(lucky(c) && rng.chance(TRAIT_EFFECTS.luckyOverlook)),
  );
  if (targets.length === 0) return;
  // Raiders prefer the most populous colonies.
  targets.sort((a, b) => b.farmers + b.workers + b.scientists - (a.farmers + a.workers + a.scientists));
  const victim = rng.pick(targets.slice(0, Math.max(1, Math.ceil(targets.length / 3))));
  const star = state.galaxy.stars.find((s) => s.id === state.planets[victim.planetId]!.starId)!;
  spawn(state, rid, star, raidFleet(state.turn), "Vexari Raid");
  ctx.emit({ kind: "raid", playerId: victim.ownerId, starId: star.id });
}

/** Rewards for clearing monster lairs: Orion's guardian drops the Death Ray. */
export function guardianSlain(ctx: TurnContext, killer: number, starId: string): void {
  const star = ctx.state.galaxy.stars.find((s) => s.id === starId);
  const p = ctx.state.players[killer]!;
  if (star?.special === "orion" && !p.techs.includes("deathRay")) {
    p.techs.push("deathRay");
    ctx.emit({ kind: "techLearned", playerId: killer, techId: "deathRay", tierId: "orion", source: "salvage" });
  }
  // The last of the elders, freed with the guardian's fall, joins the victors.
  if (star?.special === "orion" && p.kind === "empire") heroJoins(ctx.state, killer, "guardian", ctx.emit);
}

/** Every NPC weapon tech resolves to a tier or "never"; keep the helper close to its data. */
export function isNpcTech(tech: string): boolean {
  return !TIER_OF_TECH[tech];
}
