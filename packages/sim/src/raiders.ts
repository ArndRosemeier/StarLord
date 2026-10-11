import { ARMORS_BY_ID, COMPUTERS_BY_ID, HULLS_BY_ID, SHIELDS_BY_ID, SPECIALS_BY_ID, type HullSize } from "./data/components.js";
import { CREW } from "./data/combat.js";
import {
  RAID_BUDGET_MULT, RAID_BUDGET_PERIOD, RAID_CAP_LOCK_BELOW, RAID_DESTROYER_WINDOW, RAID_FLEET_CAP, RAID_FRIGATE_WINDOW,
  RAID_GRACE_TURNS, RAID_HOME_MIN_TITANS, RAID_HOME_QUOTA, RAID_HUMAN_POP_MULT, RAID_LAUNCH_ROLL, RAID_LAUNCH_VALUE_MULT,
  RAID_LUCKY_POP_MULT, RAID_MAX_SHIPS, RAID_NO_FRIGATES_AT, RAID_TITAN_DISCOUNT, RAID_WEIGHT_LIMIT, RAIDER_CITADEL,
  RAIDER_CITADEL_ID, RAIDER_CITADEL_NAME, RAIDER_COMMON, RAIDER_DESIGNS, RAIDER_HOME_NAME, RAIDER_HULL_COST, RAIDER_HULLS,
  RAIDER_SHIP_NAMES, RAIDER_TECHS, SCRAP_TECH_CHANCE, type RaiderHull,
} from "./data/raiders.js";
import { getRace, hasTrait } from "./data/races.js";
import { TIER_OF_TECH } from "./data/techs.js";
import { newId, type TurnContext } from "./context.js";
import { empireTotals } from "./economy.js";
import { ALL_WEAPONS, weaponUnitCost } from "./designs.js";
import { portalStars } from "./movement.js";
import { npcPlayer, raidersId, spawn } from "./npc.js";
import type { Rng } from "./rng.js";
import type { Difficulty, Fleet, GameState, Id, Player, PlayerId, RaidersState, ShipDesign, ShipStack, Star } from "./types.js";

type Counts = Partial<Record<HullSize, number>>;
const count = (c: Counts | undefined, h: HullSize): number => c?.[h] ?? 0;
const hullRank = (h: RaiderHull): number => RAIDER_HULLS.indexOf(h);

/** Design id of the raiders' ship on a hull. */
export function raiderDesignId(hull: HullSize): string {
  return `vexari-${hull}`;
}

/**
 * The raiders' ship on a hull: the same fixed design all game long, with no
 * shield, a Moleculartronic computer, Xentronium armor, Damper Field and
 * Quantum Detonator; only its jammer depends on the difficulty level.
 */
export function raiderDesign(hull: RaiderHull, difficulty: Difficulty = "average"): ShipDesign {
  const spec = RAIDER_DESIGNS[hull];
  const jammer = spec.jammer[difficulty];
  return {
    id: raiderDesignId(hull), name: RAIDER_SHIP_NAMES[hull], hull, armor: RAIDER_COMMON.armor, shield: null, computer: RAIDER_COMMON.computer,
    weapons: spec.weapons.map((w) => ({ ...w, ...(w.mods ? { mods: [...w.mods] } : {}) })),
    specials: [...RAIDER_COMMON.specials, ...spec.specials, ...(jammer ? [jammer] : [])],
    module: null, obsolete: false,
  };
}

/** Every raider ship design for a difficulty level, and the citadel. */
export function raiderDesigns(difficulty: Difficulty = "average"): ShipDesign[] {
  return [...RAIDER_HULLS.map((h) => raiderDesign(h, difficulty)), citadelDesign()];
}

/** The citadel guarding the raiders' home: an immobile fortress with fixed stats, rebuilt fresh for every battle. */
export function citadelDesign(): ShipDesign {
  const c = RAIDER_CITADEL;
  const player = { ...npcPlayer(0, "raiders"), techs: [...RAIDER_TECHS] };
  const weapons = c.weapons
    .map((w) => {
      const mods = w.mods.length > 0 ? { mods: [...w.mods] } : {};
      const unit = weaponUnitCost(player, { weaponId: w.weaponId, count: 1, ...mods }).space;
      return { weaponId: w.weaponId, count: Math.min(w.max, Math.floor((c.weaponSpace * w.share) / unit)), ...mods, arc: "full" as const };
    })
    .filter((w) => w.count > 0);
  return {
    id: RAIDER_CITADEL_ID, name: RAIDER_CITADEL_NAME, hull: "doomStar", armor: RAIDER_COMMON.armor, shield: null, computer: c.computer,
    weapons: [], specials: [...c.specials], module: null, obsolete: false,
    fixed: {
      hits: c.structure, armor: c.armor, attack: COMPUTERS_BY_ID[c.computer]?.attack ?? 0, defense: 0, shield: 0, combatSpeed: 0,
      sizeClass: c.sizeClass, immobile: true, crew: c.crewLevel, weapons,
    },
  };
}

/** Hull prices now: cut once on Hard and Impossible when the first titan is bought. */
export function raiderHullCosts(r: RaidersState): Record<RaiderHull, number> {
  const pct = r.discounted ? RAID_TITAN_DISCOUNT.pct : 100;
  return Object.fromEntries(RAIDER_HULLS.map((h) => [h, Math.floor((RAIDER_HULL_COST[h] * pct) / 100)])) as Record<RaiderHull, number>;
}

/** What guards the raiders' home: the citadel, the home fleet and always at least one titan. */
export function raiderHomeShips(r: RaidersState): ShipStack[] {
  const ships: ShipStack[] = [{ designId: RAIDER_CITADEL_ID, count: 1 }];
  for (const h of RAIDER_HULLS) {
    const n = h === "titan" ? Math.max(RAID_HOME_MIN_TITANS, count(r.home, h)) : count(r.home, h);
    if (n > 0) ships.push({ designId: raiderDesignId(h), count: n, xp: CREW.raiderXp });
  }
  return ships;
}

/** Gives the raiders their technology and ship designs. */
function equip(state: GameState, raiders: Player): void {
  raiders.techs = [...RAIDER_TECHS];
  raiders.designs = raiderDesigns(state.settings.difficulty ?? "average");
}

/** The raiders' home fleet, if any of it is left. */
function homeFleet(state: GameState, raiders: Player): Fleet | undefined {
  return Object.values(state.fleets).find((f) => f.ownerId === raiders.id && f.starId === raiders.homeStarId);
}

function hullOfDesign(raiders: Player, designId: string): RaiderHull | null {
  const hull = raiders.designs.find((d) => d.id === designId && !d.fixed)?.hull;
  return hull && (RAIDER_HULLS as readonly HullSize[]).includes(hull) ? (hull as RaiderHull) : null;
}

/**
 * Ships the home fleet lost since it was last set up: each loss comes off the
 * home fleet, and a raid-pool ship of that hull, if any, takes its place.
 */
function countHomeLosses(state: GameState, raiders: Player): void {
  const r = state.raiders;
  const home = (r.home ??= {});
  const pool = (r.pool ??= {});
  const fleet = homeFleet(state, raiders);
  const placed = raiderHomeShips(r);
  for (const h of RAIDER_HULLS) {
    const id = raiderDesignId(h);
    const want = placed.find((s) => s.designId === id)?.count ?? 0;
    const have = fleet?.ships.filter((s) => s.designId === id).reduce((a, s) => a + s.count, 0) ?? 0;
    for (let lost = want - have; lost > 0; lost--) {
      if (count(home, h) <= 0) continue;
      home[h] = count(home, h) - 1;
      if (count(pool, h) > 0) {
        pool[h] = count(pool, h) - 1;
        home[h] = count(home, h) + 1;
      }
    }
  }
}

/** Sets up the home system fresh: citadel, home fleet and the minimum titan guard, all undamaged. */
function garrisonHome(state: GameState, raiders: Player): void {
  const home = state.galaxy.stars.find((s) => s.id === raiders.homeStarId);
  if (!home) return;
  const fleet = homeFleet(state, raiders) ?? spawn(state, raiders.id, home, [], "Vexari Home Fleet");
  fleet.ships = raiderHomeShips(state.raiders);
}

/** Adds the raiders and their hidden home system outside the galaxy. */
export function setupRaiders(state: GameState, _rng: Rng): void {
  const raiders = npcPlayer(state.players.length, "raiders");
  state.players.push(raiders);
  const home: Star = {
    id: newId(state, "s"), name: RAIDER_HOME_NAME, x: -6, y: state.galaxy.height / 2, color: "blackHole",
    planetIds: [], special: "raiderHome",
  };
  state.galaxy.stars.push(home);
  raiders.homeStarId = home.id;
  equip(state, raiders);
  state.raiders.nextRaid = graceEnd(state);
  state.raiders.budget = 0;
  state.raiders.homeBudget = 0;
  state.raiders.pool = {};
  state.raiders.deployed = {};
  state.raiders.home = {};
  state.raiders.caps = { ...RAID_FLEET_CAP };
  state.raiders.discounted = false;
  state.raiders.launch = 0;
  garrisonHome(state, raiders);
}

/** End of the grace period, set by the starting tech level. */
function graceEnd(state: GameState): number {
  return RAID_GRACE_TURNS[state.settings.techLevel ?? "average"];
}

/** Whether the home fleet has every ship of its quota. */
function homeComplete(r: RaidersState): boolean {
  return RAIDER_HULLS.every((h) => RAID_HOME_QUOTA[h] <= 0 || count(r.home, h) >= RAID_HOME_QUOTA[h]);
}

/**
 * Every budget period after the grace period both budgets gain
 * ceil(mult × k / 100) points (k = periods so far); once the home fleet is
 * complete the raid budget takes the home budget's share too.
 */
function growBudgets(state: GameState): void {
  const r = state.raiders;
  const since = state.turn - graceEnd(state);
  if (since <= 0 || since % RAID_BUDGET_PERIOD !== 0) return;
  const k = since / RAID_BUDGET_PERIOD;
  const inc = Math.ceil((RAID_BUDGET_MULT[state.settings.difficulty ?? "average"] * k) / 100);
  r.budget = (r.budget ?? 0) + inc;
  if (homeComplete(r)) r.budget += inc;
  else r.homeBudget = (r.homeBudget ?? 0) + inc;
}

/**
 * Spends a budget, smallest hull first: again and again it buys the smallest
 * hull that is still in its time window, affordable and under its cap.
 * Frigates and destroyers are bought only early on (sooner over on harder
 * levels); the raid pool's caps for hulls below battleships close for good
 * once reached; on Hard and Impossible the first titan cuts every price.
 */
function buyShips(state: GameState, pool: "raid" | "home"): void {
  const r = state.raiders;
  const difficulty = state.settings.difficulty ?? "average";
  const since = state.turn - graceEnd(state);
  const counts = pool === "raid" ? (r.pool ??= {}) : (r.home ??= {});
  const caps = (r.caps ??= { ...RAID_FLEET_CAP });
  const cap = (h: RaiderHull) => (pool === "raid" ? count(caps, h) : RAID_HOME_QUOTA[h]);
  const inWindow = (h: RaiderHull) =>
    h === "frigate" ? since <= RAID_FRIGATE_WINDOW[difficulty] && state.settings.techLevel !== RAID_NO_FRIGATES_AT
      : h === "destroyer" ? since <= RAID_DESTROYER_WINDOW[difficulty] : true;
  let budget = pool === "raid" ? r.budget ?? 0 : r.homeBudget ?? 0;
  while (budget >= raiderHullCosts(r).frigate) {
    const cost = raiderHullCosts(r);
    const hull = RAIDER_HULLS.find((h) => inWindow(h) && cost[h] > 0 && budget >= cost[h] && count(counts, h) < cap(h));
    if (!hull) break;
    counts[hull] = count(counts, hull) + 1;
    budget -= cost[hull];
    // As in the original this checks the raid pool's cap even for home fleet purchases.
    if (hullRank(hull) < hullRank(RAID_CAP_LOCK_BELOW) && count(caps, hull) === counts[hull]) caps[hull] = 0;
    if (hull === "titan" && !r.discounted && RAID_TITAN_DISCOUNT.difficulties.includes(difficulty)) r.discounted = true;
  }
  if (pool === "raid") r.budget = budget;
  else r.homeBudget = budget;
}

/** Build-point value of some ships at today's prices. */
function fleetValue(r: RaidersState, c: Counts | undefined): number {
  const cost = raiderHullCosts(r);
  return RAIDER_HULLS.reduce((a, h) => a + cost[h] * count(c, h), 0);
}

/**
 * Whether a raid launches this turn. The raid pool must be worth at least a
 * third of the home fleet plus both unspent budgets; then, while raid ships
 * wait at home, the launch counter grows each turn and the raid goes on a
 * roll of 1..200 at most the counter + 1.
 */
function launches(state: GameState, rng: Rng): boolean {
  const r = state.raiders;
  const forced = r.forcedTarget !== undefined;
  if (!forced && RAID_LAUNCH_VALUE_MULT * fleetValue(r, r.pool) < fleetValue(r, r.home) + (r.budget ?? 0) + (r.homeBudget ?? 0)) return false;
  if (RAIDER_HULLS.some((h) => count(r.pool, h) > count(r.deployed, h))) r.launch = (r.launch ?? 0) + 1;
  if ((r.launch ?? 0) <= 0) return false;
  return rng.int(1, RAID_LAUNCH_ROLL) <= (r.launch ?? 0) + 1;
}

/** A star with one of the empire's colonies (not outposts), picked at random. */
function targetStar(state: GameState, ownerId: PlayerId, rng: Rng): { ownerId: PlayerId; starId: Id } | null {
  const starIds = new Set(
    Object.values(state.colonies).filter((c) => c.ownerId === ownerId && !c.outpost).map((c) => state.planets[c.planetId]!.starId),
  );
  const stars = state.galaxy.stars.filter((s) => starIds.has(s.id));
  return stars.length > 0 ? { ownerId, starId: rng.pick(stars).id } : null;
}

/**
 * The empire a raid goes for: the one with the smallest population is left
 * out and the rest are weighted by (population - smallest)². Lucky empires
 * and, by difficulty, human players count less or more (but the smallest
 * is always measured by real population). The raid hits a random system
 * with one of its colonies.
 */
function raidTarget(state: GameState, rng: Rng): { ownerId: PlayerId; starId: Id } | null {
  const difficulty = state.settings.difficulty ?? "average";
  const candidates = state.players
    .filter((p) => p.kind === "empire" && p.alive)
    .map((p) => {
      const raw = empireTotals(state, p.id).population;
      let pop = raw;
      if (p.isHuman) pop *= RAID_HUMAN_POP_MULT[difficulty];
      if (hasTrait(getRace(p.raceId), "lucky")) pop *= RAID_LUCKY_POP_MULT;
      return { p, raw, pop };
    });
  if (candidates.length === 0) return null;
  const min = Math.min(...candidates.map((x) => x.raw));
  const smallest = candidates.find((x) => x.raw === min)!;
  const pool = candidates.length > 1 ? candidates.filter((x) => x !== smallest) : candidates;
  let weights = pool.map((x) => Math.floor((x.pop - min) ** 2));
  const sum = () => weights.reduce((a, b) => a + b, 0);
  while (sum() >= RAID_WEIGHT_LIMIT) weights = weights.map((w) => Math.floor(w / 2));
  let pick = pool[0]!;
  if (sum() > 0) {
    let roll = rng.int(1, sum());
    for (let i = 0; i < pool.length; i++) {
      roll -= weights[i]!;
      if (roll <= 0) {
        pick = pool[i]!;
        break;
      }
    }
  }
  return targetStar(state, pick.p.id, rng);
}

/**
 * Debug: makes the raiders strike an empire this turn, buying ships with
 * extra build points if none are waiting.
 */
export function forceRaid(state: GameState, targetId: PlayerId, budget: number): void {
  state.raiders.budget = (state.raiders.budget ?? 0) + budget;
  // A counter at the roll's top makes the launch certain; a forced raid skips the value gate.
  state.raiders.launch = RAID_LAUNCH_ROLL;
  state.raiders.forcedTarget = targetId;
}

/**
 * The raiders' turn, as in the original: grow both budgets, buy raid ships,
 * buy home fleet ships, then maybe launch a raid of up to six ships, largest
 * hulls first, at a random colony system of the target empire. Raid ships
 * come home at the end of the turn (see `raidersReturn`).
 */
export function raidTick(ctx: TurnContext): void {
  const { state, rng } = ctx;
  const rid = raidersId(state);
  if (rid === null || state.raiders.defeated) return;
  const raiders = state.players[rid]!;
  const r = state.raiders;
  if (!raiders.designs.some((d) => d.id === RAIDER_CITADEL_ID && d.fixed?.crew !== undefined)) equip(state, raiders);
  countHomeLosses(state, raiders);
  growBudgets(state);
  buyShips(state, "raid");
  buyShips(state, "home");
  garrisonHome(state, raiders);
  if (!launches(state, rng)) return;
  r.launch = 0;
  const forced = r.forcedTarget;
  delete r.forcedTarget;
  const target = (forced !== undefined ? targetStar(state, forced, rng) : null) ?? raidTarget(state, rng);
  if (!target) return;

  const deployed = (r.deployed ??= {});
  const ships: ShipStack[] = [];
  for (let i = 0; i < RAID_MAX_SHIPS; i++) {
    const hull = [...RAIDER_HULLS].reverse().find((h) => count(r.pool, h) - count(deployed, h) > 0);
    if (!hull) break;
    deployed[hull] = count(deployed, hull) + 1;
    const stack = ships.find((s) => s.designId === raiderDesignId(hull));
    if (stack) stack.count++;
    else ships.push({ designId: raiderDesignId(hull), count: 1, xp: CREW.raiderXp });
  }
  if (ships.length === 0) return;
  const star = state.galaxy.stars.find((s) => s.id === target.starId)!;
  spawn(state, rid, star, ships, "Vexari Raid");
  r.lastRaid = state.turn;
  ctx.emit({ kind: "raid", playerId: target.ownerId, starId: star.id });
}

/**
 * End of the turn: raid ships away from home vanish back to their dimension.
 * The survivors rejoin the raid pool; only ships destroyed on the raid are lost.
 */
export function raidersReturn(state: GameState): void {
  const rid = raidersId(state);
  if (rid === null) return;
  const raiders = state.players[rid]!;
  const r = state.raiders;
  const survivors: Counts = {};
  for (const f of Object.values(state.fleets)) {
    if (f.ownerId !== rid || f.starId === raiders.homeStarId) continue;
    for (const s of f.ships) {
      const h = hullOfDesign(raiders, s.designId);
      if (h) survivors[h] = count(survivors, h) + s.count;
    }
    delete state.fleets[f.id];
  }
  const pool = (r.pool ??= {});
  for (const h of RAIDER_HULLS) {
    const lost = Math.max(0, count(r.deployed, h) - count(survivors, h));
    if (lost > 0) pool[h] = Math.max(0, count(pool, h) - lost);
  }
  r.deployed = {};
}

// ---------------------------------------------------------------- the portal

/** Keeps every empire's `hasPortal` in step with its colonies (portals change hands with the colony). */
export function syncPortals(state: GameState): void {
  for (const p of state.players) if (p.kind === "empire") p.hasPortal = portalStars(state, p.id).length > 0;
}

/**
 * Empire fleets left at the raiders' home after a battle that did not end
 * them come back through the portal to the nearest system with one.
 */
export function returnThroughPortal(state: GameState, homeStarId: Id): void {
  const home = state.galaxy.stars.find((s) => s.id === homeStarId)!;
  for (const f of Object.values(state.fleets)) {
    if (f.starId !== homeStarId || state.players[f.ownerId]!.kind !== "empire") continue;
    const back = portalStars(state, f.ownerId)
      .map((id) => state.galaxy.stars.find((s) => s.id === id)!)
      .sort((a, b) => Math.hypot(a.x - home.x, a.y - home.y) - Math.hypot(b.x - home.x, b.y - home.y))[0];
    if (!back) {
      // With no portal left the way home is gone; the fleet is lost in the other dimension.
      delete state.fleets[f.id];
      continue;
    }
    f.starId = back.id;
    f.destStarId = null;
    f.x = back.x;
    f.y = back.y;
  }
}

// ---------------------------------------------------------------- salvage

/** Technologies a ship design is built from (armor, shield, computer, weapons, specials). */
function designTechs(design: ShipDesign): string[] {
  const techs = [
    HULLS_BY_ID[design.hull]?.requires,
    ARMORS_BY_ID[design.armor]?.requires,
    design.shield ? SHIELDS_BY_ID[design.shield]?.requires : null,
    design.computer ? COMPUTERS_BY_ID[design.computer]?.requires : null,
    ...design.weapons.map((m) => ALL_WEAPONS[m.weaponId]?.requires),
    ...design.specials.map((s) => SPECIALS_BY_ID[s]?.requires),
  ];
  return [...new Set(techs.filter((t): t is string => !!t && t !== "never"))];
}

/**
 * Scrapping a captured ship may teach one technology it carries that the
 * scrapper lacks. This is the only way to learn the raiders' xenon technology.
 */
export function salvageTech(ctx: TurnContext, playerId: PlayerId, design: ShipDesign, count: number): void {
  if (design.capturedFrom === undefined) return;
  const player = ctx.state.players[playerId]!;
  for (let i = 0; i < count; i++) {
    const unknown = designTechs(design).filter((t) => !player.techs.includes(t));
    if (unknown.length === 0 || !ctx.rng.chance(SCRAP_TECH_CHANCE)) continue;
    const tech = ctx.rng.pick(unknown);
    player.techs.push(tech);
    ctx.emit({ kind: "techLearned", playerId, techId: tech, tierId: TIER_OF_TECH[tech]?.id ?? "xenon", source: "salvage" });
  }
}
