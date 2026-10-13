import { HEROES } from "./data/leaders.js";
import { ARTIFACTS_SECOND_TECH_CHANCE, CACHE_BC, DEBRIS_BC, SPLINTER_POP } from "./data/galaxy.js";
import { TECH_TIERS } from "./data/techs.js";
import { newId, type TurnContext } from "./context.js";
import { grantTech } from "./empire.js";
import { maxPopulation } from "./economy.js";
import { getRace } from "./data/races.js";
import { assignDefaultJobs, assignJobsForFood } from "./jobs.js";
import { hasRoomFor, hireLeader, hirePrice } from "./leaders.js";
import { learnsWholeField, researchOptions } from "./rules.js";
import type { Colony, Id, Player, PlayerId } from "./types.js";

/**
 * One-time system specials, as in the original: the first empire to explore
 * a system finds a pirate cache, ship debris, a marooned hero, a lost
 * splinter colony or ancient artifacts (one or two technologies); natives
 * join whoever first settles their planet.
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
      const bc = star.feature === "cache" ? CACHE_BC : DEBRIS_BC;
      player.bc += bc;
      const what = star.feature === "cache"
        ? `Explorers found a pirate cache at ${star.name}: +${bc} BC.`
        : `Salvage crews stripped a drifting wreck at ${star.name}: +${bc} BC.`;
      delete star.feature;
      ctx.emit({ kind: "random", playerId, what, starId });
      break;
    }
    case "hero": {
      // A hero from the roster, stranded here, joins without a fee.
      const stranded = Object.values(state.leaders)
        .filter((l) => l.status === "pool" && !HEROES[l.heroId]?.special && hasRoomFor(state, playerId, l.kind))
        .sort((a, b) => (a.id < b.id ? -1 : 1));
      if (stranded.length === 0) {
        ctx.emit({ kind: "random", playerId, what: `A stranded officer at ${star.name} could not join: you have no room for another leader.`, starId });
        break;
      }
      const hero = rng.pick(stranded);
      player.bc += hirePrice(state, playerId, hero);
      hireLeader(state, playerId, hero.id, ctx.emit);
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
    const pop = Math.min(SPLINTER_POP, maxPopulation(planet, getRace(player.raceId), [], player));
    const colony: Colony = {
      id: newId(state, "c"), planetId: pid, ownerId: playerId, raceId: player.raceId, name: `${star.name} Splinter`, outpost: false,
      farmers: 0, workers: pop, scientists: 0, growthK: 0, buildings: [], queue: [], progress: 0, founded: state.turn,
      terraformed: 0,
    };
    planet.colonyId = colony.id;
    state.colonies[colony.id] = colony;
    assignDefaultJobs(state, colony);
    ctx.emit({ kind: "colonyFounded", playerId, colonyId: colony.id, planetId: pid });
    ctx.emit({ kind: "random", playerId, what: `Long-lost kin at ${star.name} rejoined your empire as a splinter colony.`, starId });
  }
  // Ancient artifacts: the first explorer deciphers one technology, sometimes two.
  for (const pid of star.planetIds) {
    const planet = state.planets[pid]!;
    if (planet.special !== "artifacts" || planet.artifactsClaimed) continue;
    planet.artifactsClaimed = true;
    const count = rng.chance(ARTIFACTS_SECOND_TECH_CHANCE) ? 2 : 1;
    for (let i = 0; i < count; i++) {
      const tier = artifactBreakthrough(ctx, player);
      if (tier) ctx.emit({ kind: "random", playerId, what: `Relics found at ${star.name} gave your scientists a breakthrough in ${tier}.`, starId });
    }
  }
}

/**
 * Learns one random application from the empire's open fields (each
 * application equally likely), which completes its field. Returns the
 * field's name, or null when nothing is open.
 */
function artifactBreakthrough(ctx: TurnContext, player: Player): string | null {
  const choices: { tier: (typeof TECH_TIERS)[number]; tech: string }[] = [];
  for (const tier of TECH_TIERS) {
    if (tier.hyper || player.tiers.includes(tier.id) || (tier.prev !== null && !player.tiers.includes(tier.prev))) continue;
    for (const tech of researchOptions(player, tier)) if (!player.techs.includes(tech)) choices.push({ tier, tech });
  }
  if (choices.length === 0) return null;
  const { tier, tech } = ctx.rng.pick(choices);
  const learned = learnsWholeField(player, tier) ? researchOptions(player, tier) : [tech];
  player.tiers.push(tier.id);
  if (player.research.tierId === tier.id) player.research.tierId = null;
  for (const t of learned) {
    if (grantTech(player, t)) ctx.emit({ kind: "techLearned", playerId: player.id, techId: t, tierId: tier.id, source: "event" });
  }
  return tier.name;
}

/** Effects of settling a special planet. */
export function onColonize(ctx: TurnContext, colony: Colony): void {
  const { state } = ctx;
  const planet = state.planets[colony.planetId]!;
  if (planet.special === "natives" && (planet.natives ?? 0) > 0 && !colony.outpost) {
    // The natives join the colony, farming only.
    colony.farmers += planet.natives!;
    colony.natives = planet.natives!;
    planet.natives = 0;
    assignJobsForFood(state, colony);
    ctx.emit({ kind: "random", playerId: colony.ownerId, what: `The natives of ${colony.name} joined the colony as farmers.`, starId: planet.starId });
  }
}
