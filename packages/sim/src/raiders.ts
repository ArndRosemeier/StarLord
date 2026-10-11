import { ARMORS_BY_ID, COMPUTERS_BY_ID, HULLS_BY_ID, SHIELDS_BY_ID, SPECIALS_BY_ID, type HullSize } from "./data/components.js";
import {
  RAID_DIFFICULTY_SHIFT, RAID_FIRST_DELAY, RAID_FIRST_TURN, RAIDER_CITADEL_ID, RAIDER_CITADEL_NAME, RAIDER_ERAS as ERAS,
  RAIDER_HOME_NAME, RAIDER_SHIP_NAMES, SCRAP_TECH_CHANCE, type RaiderEra,
} from "./data/raiders.js";
import { getRace, hasTrait } from "./data/races.js";
import { TRAIT_EFFECTS } from "./data/racePicks.js";
import { TIER_OF_TECH } from "./data/techs.js";
import { newId, type TurnContext } from "./context.js";
import { ALL_WEAPONS, designStats, weaponUnitCost } from "./designs.js";
import { portalStars } from "./movement.js";
import { npcPlayer, raidersId, spawn } from "./npc.js";
import type { Rng } from "./rng.js";
import type { Fleet, GameState, Id, Player, PlayerId, ShipDesign, Star } from "./types.js";

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
  const shift = RAID_DIFFICULTY_SHIFT[state.settings.difficulty ?? "average"];
  state.raiders.nextRaid = Math.max(1, RAID_FIRST_TURN + shift + rng.int(RAID_FIRST_DELAY[0], RAID_FIRST_DELAY[1]));
}

/**
 * Raiders strike one empire colony at a time and vanish the turn after.
 * Their technology advances with time since the first raid; before each raid
 * they refit and rebuild their home fleet.
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

  state.raiders.firstRaid ??= state.turn;
  const since = state.turn - state.raiders.firstRaid;
  const leading = Math.max(0, ...state.players.filter((p) => p.kind === "empire" && p.alive).map((p) => p.techs.length));
  let era = state.raiders.era ?? 0;
  while (era + 1 < ERAS.length && since >= ERAS[era + 1]!.from && leading >= ERAS[era + 1]!.minTechs) era++;
  if (era !== state.raiders.era || raiders.designs.length === 0 || !raiders.designs.some((d) => d.id === RAIDER_CITADEL_ID)) {
    enterEra(state, raiders, era);
  }
  garrisonHome(state, raiders);
  const e = eraOf(era);
  state.raiders.nextRaid = state.turn + rng.int(e.interval[0], e.interval[1]);

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
  const ships = e.raid.map((r, i) => ({ designId: raiderDesignId(r.hull), count: r.count + (i === 0 ? rng.int(0, e.extra) : 0) }));
  spawn(state, rid, star, ships, "Vexari Raid");
  ctx.emit({ kind: "raid", playerId: victim.ownerId, starId: star.id });
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
