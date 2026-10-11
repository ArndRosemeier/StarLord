import { ARMORS_BY_ID, COMPUTERS_BY_ID, HULLS_BY_ID, SHIELDS_BY_ID, SPECIALS_BY_ID, type HullSize } from "./data/components.js";
import {
  RAID_BUDGET_MULT, RAID_BUDGET_PERIOD, RAID_FLEET_CAP, RAID_GRACE_TURNS, RAID_HUMAN_POP_MULT, RAID_LAUNCH_ROLL,
  RAID_LUCKY_POP_MULT, RAIDER_CITADEL_ID, RAIDER_CITADEL_NAME, RAIDER_ERAS as ERAS, RAIDER_HOME_NAME, RAIDER_HULL_COST,
  RAIDER_SHIP_NAMES, SCRAP_TECH_CHANCE, type RaiderEra,
} from "./data/raiders.js";
import { getRace, hasTrait } from "./data/races.js";
import { TIER_OF_TECH } from "./data/techs.js";
import { newId, type TurnContext } from "./context.js";
import { empireTotals } from "./economy.js";
import { ALL_WEAPONS, designStats, weaponUnitCost } from "./designs.js";
import { portalStars } from "./movement.js";
import { npcPlayer, raidersId, spawn } from "./npc.js";
import type { Rng } from "./rng.js";
import type { Fleet, GameState, Id, Player, PlayerId, ShipDesign, ShipStack, Star } from "./types.js";

/** Hulls from smallest to largest. */
const HULL_ORDER: HullSize[] = ["frigate", "destroyer", "cruiser", "battleship", "titan", "doomStar"];

/** Design id of the raiders' ship on a hull; stable across eras, so the home fleet refits as their technology grows. */
export function raiderDesignId(hull: HullSize): string {
  return `vexari-${hull}`;
}

/** Every technology the raiders know in an era. */
export function raiderTechs(era: number): string[] {
  return ERAS.slice(0, era + 1).flatMap((e) => e.techs);
}

function eraOf(era: number): RaiderEra {
  return ERAS[Math.max(0, Math.min(ERAS.length - 1, era))]!;
}

/**
 * The raiders' warship on each hull for an era: xentronium armor, the era's
 * shield, computer and specials, and the rest of the hull filled with its weapons.
 */
export function raiderDesigns(era: number): ShipDesign[] {
  const e = eraOf(era);
  const player = { ...npcPlayer(0, "raiders"), techs: raiderTechs(era) };
  const designs: ShipDesign[] = HULL_ORDER.map((hull) => {
    const fits = (w: { minHull?: HullSize }) => !w.minHull || HULL_ORDER.indexOf(hull) >= HULL_ORDER.indexOf(w.minHull);
    const d: ShipDesign = {
      id: raiderDesignId(hull), name: RAIDER_SHIP_NAMES[hull], hull, armor: "xentroniumArmor", shield: e.shield,
      computer: e.computer, weapons: [], specials: e.specials.filter(fits).map((x) => x.id), module: null, obsolete: false,
    };
    const free = () => {
      const s = designStats(player, d);
      return s.spaceTotal - s.spaceUsed;
    };
    const unit = (weaponId: string) => weaponUnitCost(player, { weaponId, count: 1 }).space;
    const add = (weaponId: string, count: number) => {
      if (count <= 0) return;
      const m = d.weapons.find((x) => x.weaponId === weaponId);
      if (m) m.count += count;
      else d.weapons.push({ weaponId, count });
    };
    for (const w of e.weapons) if (w.count !== undefined && fits(w)) add(w.weaponId, w.count);
    const room = free();
    for (const w of e.weapons) if (w.share !== undefined && fits(w)) add(w.weaponId, Math.floor((room * w.share) / unit(w.weaponId)));
    add(e.filler, Math.floor(free() / unit(e.filler)));
    return d;
  });
  return [...designs, citadelDesign(era)];
}

/** The citadel guarding the raiders' home: an immobile fortress whose strength grows with their era. */
export function citadelDesign(era: number): ShipDesign {
  const c = eraOf(era).citadel;
  return {
    id: RAIDER_CITADEL_ID, name: RAIDER_CITADEL_NAME, hull: "doomStar", armor: "xentroniumArmor", shield: null, computer: null,
    weapons: [], specials: [], module: null, obsolete: false,
    fixed: {
      hits: c.hits, armor: c.armor, attack: c.attack, defense: c.defense, shield: c.shield, combatSpeed: 0, sizeClass: 10,
      immobile: true,
      weapons: [{ weaponId: "deathRay", count: c.deathRays }, { weaponId: "raiderTorpedo", count: c.torpedoes }],
    },
  };
}

/** Sets the raiders' technology and ship designs to an era. */
function enterEra(state: GameState, raiders: Player, era: number): void {
  state.raiders.era = era;
  raiders.techs = raiderTechs(era);
  raiders.designs = raiderDesigns(era);
}

/** The raiders' home fleet, if any of it is left. */
function homeFleet(state: GameState, raiders: Player): Fleet | undefined {
  return Object.values(state.fleets).find((f) => f.ownerId === raiders.id && f.starId === raiders.homeStarId);
}

/** Between raids the raiders rebuild their home fleet and citadel to the era's strength. */
function garrisonHome(state: GameState, raiders: Player): void {
  const home = state.galaxy.stars.find((s) => s.id === raiders.homeStarId);
  if (!home) return;
  const want = [{ designId: RAIDER_CITADEL_ID, count: 1 }, ...eraOf(state.raiders.era ?? 0).garrison.map((g) => ({ designId: raiderDesignId(g.hull), count: g.count }))];
  const fleet = homeFleet(state, raiders) ?? spawn(state, raiders.id, home, [], "Vexari Home Fleet");
  for (const w of want) {
    const stack = fleet.ships.find((s) => s.designId === w.designId);
    if (!stack) fleet.ships.push({ ...w });
    else stack.count = Math.max(stack.count, w.count);
  }
}

/** Adds the raiders and their hidden home system outside the galaxy. */
export function setupRaiders(state: GameState, rng: Rng): void {
  const raiders = npcPlayer(state.players.length, "raiders");
  state.players.push(raiders);
  const home: Star = {
    id: newId(state, "s"), name: RAIDER_HOME_NAME, x: -6, y: state.galaxy.height / 2, color: "blackHole",
    planetIds: [], special: "raiderHome",
  };
  state.galaxy.stars.push(home);
  raiders.homeStarId = home.id;
  enterEra(state, raiders, 0);
  garrisonHome(state, raiders);
  state.raiders.nextRaid = graceEnd(state);
  state.raiders.budget = 0;
  state.raiders.fleet = [];
  state.raiders.launch = 0;
}

/** First turn raids can come: the grace period depends on the starting tech level. */
function graceEnd(state: GameState): number {
  return RAID_GRACE_TURNS[state.settings.techLevel ?? "average"];
}

/** Every budget period after the grace period the raiders gain build points; k is the number of periods so far. */
function growBudget(state: GameState): void {
  const since = state.turn - graceEnd(state);
  if (since <= 0 || since % RAID_BUDGET_PERIOD !== 0) return;
  const k = since / RAID_BUDGET_PERIOD;
  state.raiders.budget = (state.raiders.budget ?? 0) + Math.ceil((RAID_BUDGET_MULT[state.settings.difficulty ?? "average"] * k) / 100);
}

/** Spends the budget on raid ships: the biggest hull it can afford whose cap isn't reached, again and again. */
function buyRaidShips(state: GameState): void {
  const fleet = (state.raiders.fleet ??= []);
  const hulls = HULL_ORDER.filter((h) => RAIDER_HULL_COST[h] !== undefined).reverse();
  for (;;) {
    const hull = hulls.find((h) => {
      const have = fleet.find((x) => x.designId === raiderDesignId(h))?.count ?? 0;
      return have < (RAID_FLEET_CAP[h] ?? 0) && RAIDER_HULL_COST[h]! <= (state.raiders.budget ?? 0);
    });
    if (!hull) return;
    state.raiders.budget = (state.raiders.budget ?? 0) - RAIDER_HULL_COST[hull]!;
    const stack = fleet.find((x) => x.designId === raiderDesignId(hull));
    if (stack) stack.count++;
    else fleet.push({ designId: raiderDesignId(hull), count: 1 });
  }
}

/**
 * The empire a raid goes for: weighted by (population - smallest)², the
 * smallest empire left out. Lucky empires and, by difficulty, human players
 * count less or more. Returns its most populous colony.
 */
function raidTarget(state: GameState, rng: Rng): { ownerId: PlayerId; planetId: Id } | null {
  const difficulty = state.settings.difficulty ?? "average";
  const candidates = state.players
    .filter((p) => p.kind === "empire" && p.alive)
    .map((p) => {
      let pop = empireTotals(state, p.id).population;
      if (p.isHuman) pop *= RAID_HUMAN_POP_MULT[difficulty];
      if (hasTrait(getRace(p.raceId), "lucky")) pop *= RAID_LUCKY_POP_MULT;
      return { p, pop };
    })
    .filter((x) => Object.values(state.colonies).some((c) => c.ownerId === x.p.id && !c.outpost));
  if (candidates.length === 0) return null;
  const min = Math.min(...candidates.map((x) => x.pop));
  const pool = candidates.length > 1 ? candidates.filter((x) => x !== candidates.find((y) => y.pop === min)) : candidates;
  const weights = pool.map((x) => (x.pop - min) ** 2);
  const total = weights.reduce((a, b) => a + b, 0);
  let pick = pool[0]!;
  if (total > 0) {
    let roll = rng.next() * total;
    for (let i = 0; i < pool.length; i++) {
      roll -= weights[i]!;
      if (roll < 0) {
        pick = pool[i]!;
        break;
      }
    }
  } else pick = rng.pick(pool);
  const colony = Object.values(state.colonies)
    .filter((c) => c.ownerId === pick.p.id && !c.outpost)
    .sort((a, b) => b.farmers + b.workers + b.scientists - (a.farmers + a.workers + a.scientists) || (a.id < b.id ? -1 : 1))[0]!;
  return { ownerId: pick.p.id, planetId: colony.planetId };
}

/**
 * Raiders strike one empire colony at a time and vanish the turn after.
 * After the grace period they buy raid ships from a growing budget and launch
 * once the fleet has waited long enough. Their technology advances with time
 * since the first raid; before each raid they refit and rebuild their home fleet.
 */
export function raidTick(ctx: TurnContext): void {
  const { state, rng } = ctx;
  const rid = raidersId(state);
  if (rid === null || state.raiders.defeated) return;
  const raiders = state.players[rid]!;
  const home = raiders.homeStarId;
  for (const f of Object.values(state.fleets)) {
    if (f.ownerId === rid && f.starId !== home) delete state.fleets[f.id];
  }
  if (state.turn < state.raiders.nextRaid) return;
  growBudget(state);
  buyRaidShips(state);
  // A ready raid fleet waits; each turn it waits makes the launch likelier.
  const fleet: ShipStack[] = state.raiders.fleet ?? [];
  if (fleet.length === 0) return;
  state.raiders.launch = (state.raiders.launch ?? 0) + 1;
  if (rng.int(1, RAID_LAUNCH_ROLL) > state.raiders.launch) return;
  const target = raidTarget(state, rng);
  if (!target) return;

  state.raiders.firstRaid ??= state.turn;
  const since = state.turn - state.raiders.firstRaid;
  const leading = Math.max(0, ...state.players.filter((p) => p.kind === "empire" && p.alive).map((p) => p.techs.length));
  let era = state.raiders.era ?? 0;
  while (era + 1 < ERAS.length && since >= ERAS[era + 1]!.from && leading >= ERAS[era + 1]!.minTechs) era++;
  if (era !== state.raiders.era || raiders.designs.length === 0 || !raiders.designs.some((d) => d.id === RAIDER_CITADEL_ID)) {
    enterEra(state, raiders, era);
  }
  garrisonHome(state, raiders);

  const star = state.galaxy.stars.find((s) => s.id === state.planets[target.planetId]!.starId)!;
  spawn(state, rid, star, fleet, "Vexari Raid");
  state.raiders.fleet = [];
  state.raiders.launch = 0;
  ctx.emit({ kind: "raid", playerId: target.ownerId, starId: star.id });
}

/** What a raid that won the field does to a colony this turn. */
export function raidRaze(state: GameState): RaiderEra["raze"] {
  return eraOf(state.raiders.era ?? 0).raze;
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
