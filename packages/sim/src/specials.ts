import { MAX_LEADERS } from "./data/leaders.js";
import { CACHE_BC, DEBRIS_BC, HERO_LEVEL, SPLINTER_POP } from "./data/galaxy.js";
import { TECH_TIERS } from "./data/techs.js";
import { newId, type TurnContext } from "./context.js";
import { grantTech } from "./empire.js";
import { assignJobsForFood } from "./jobs.js";
import { generateLeader } from "./leaders.js";
import { learnsWholeField, researchOptions } from "./rules.js";
import type { Colony, Id, PlayerId } from "./types.js";

/**
 * One-time system specials, triggered when an empire first explores a system
 * (pirate cache, ship debris, a marooned hero, a lost splinter colony) or
 * first settles a planet (natives join the colony, artifacts give a
 * breakthrough).
 */

/** Marks a star explored by an empire, triggering its one-time specials. */
export function explore(ctx: TurnContext, playerId: PlayerId, starId: Id): void {
  const p = ctx.state.players[playerId]!;
  if (p.kind !== "empire" || p.explored.includes(starId)) return;
  p.explored.push(starId);
  ctx.emit({ kind: "explored", playerId, starId });
  onExplore(ctx, playerId, starId);
}

export function onExplore(ctx: TurnContext, playerId: PlayerId, starId: Id): void {
  const { state, rng } = ctx;
  const star = state.galaxy.stars.find((s) => s.id === starId);
  const player = state.players[playerId]!;
  if (!star || player.kind !== "empire") return;
  switch (star.feature) {
    case "cache":
    case "debris": {
      const [lo, hi] = star.feature === "cache" ? CACHE_BC : DEBRIS_BC;
      const bc = rng.int(lo, hi);
      player.bc += bc;
      const what = star.feature === "cache"
        ? `Explorers found a pirate cache at ${star.name}: +${bc} BC.`
        : `Salvage crews stripped a drifting wreck at ${star.name}: +${bc} BC.`;
      delete star.feature;
      ctx.emit({ kind: "random", playerId, what, starId });
      break;
    }
    case "hero": {
      const hired = Object.values(state.leaders).filter((l) => l.ownerId === playerId).length;
      if (hired >= MAX_LEADERS) {
        ctx.emit({ kind: "random", playerId, what: `A stranded officer at ${star.name} could not join: you have no room for another leader.`, starId });
        break;
      }
      const hero = generateLeader(state, rng, rng.chance(0.5) ? "administrator" : "captain");
      const level = rng.int(HERO_LEVEL[0], HERO_LEVEL[1]);
      for (const k of Object.keys(hero.skills) as (keyof typeof hero.skills)[]) hero.skills[k] = (hero.skills[k]! / hero.level) * level;
      hero.level = level;
      hero.salary = level;
      hero.hireCost = 0;
      hero.ownerId = playerId;
      state.leaders[hero.id] = hero;
      delete star.feature;
      ctx.emit({ kind: "leader", playerId, leaderId: hero.id, what: `${hero.name}, marooned at ${star.name}, joined your empire in gratitude.` });
      break;
    }
  }
  // A splinter colony of the explorer's own people, lost long ago.
  for (const pid of star.planetIds) {
    const planet = state.planets[pid]!;
    if (planet.special !== "splinter" || planet.colonyId) continue;
    planet.special = "none";
    const pop = rng.int(SPLINTER_POP[0], SPLINTER_POP[1]);
    const colony: Colony = {
      id: newId(state, "c"), planetId: pid, ownerId: playerId, raceId: player.raceId, name: `${star.name} Splinter`, outpost: false,
      farmers: 0, workers: pop, scientists: 0, growthK: 0, buildings: [], queue: [], progress: 0, founded: state.turn,
      terraformed: 0, unrestUntil: 0,
    };
    planet.colonyId = colony.id;
    state.colonies[colony.id] = colony;
    assignJobsForFood(state, colony);
    ctx.emit({ kind: "colonyFounded", playerId, colonyId: colony.id, planetId: pid });
    ctx.emit({ kind: "random", playerId, what: `Long-lost kin at ${star.name} rejoined your empire as a splinter colony.`, starId });
  }
}

/** Effects of settling a special planet. */
export function onColonize(ctx: TurnContext, colony: Colony): void {
  const { state, rng } = ctx;
  const planet = state.planets[colony.planetId]!;
  const player = state.players[colony.ownerId]!;
  if (planet.special === "natives" && (planet.natives ?? 0) > 0 && !colony.outpost) {
    // The natives join the colony, farming only.
    colony.farmers += planet.natives!;
    colony.natives = planet.natives!;
    planet.natives = 0;
    assignJobsForFood(state, colony);
    ctx.emit({ kind: "random", playerId: colony.ownerId, what: `The natives of ${colony.name} joined the colony as farmers.`, starId: planet.starId });
  }
  if (planet.special === "artifacts" && !planet.artifactsClaimed && !colony.outpost) {
    planet.artifactsClaimed = true;
    // The first settlers decipher the relics: an immediate breakthrough in the cheapest open field.
    const open = TECH_TIERS.filter((t) => !t.hyper && !player.tiers.includes(t.id) && (t.prev === null || player.tiers.includes(t.prev)))
      .sort((a, b) => a.cost - b.cost || (a.id < b.id ? -1 : 1));
    const tier = open[0];
    if (!tier) return;
    const options = researchOptions(player, tier);
    const learned = learnsWholeField(player, tier) ? options : options.length ? [rng.pick(options)] : [];
    player.tiers.push(tier.id);
    if (player.research.tierId === tier.id) player.research.tierId = null;
    for (const t of learned) {
      if (grantTech(player, t)) ctx.emit({ kind: "techLearned", playerId: player.id, techId: t, tierId: tier.id, source: "event" });
    }
    ctx.emit({ kind: "random", playerId: player.id, what: `Relics on ${colony.name} gave your scientists a breakthrough in ${tier.name}.`, starId: planet.starId });
  }
}
