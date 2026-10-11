import {
  BLACK_HOLE_CLEARANCE, BLACK_HOLE_RADIUS, CLIMATE_TABLE_BY_AGE, GALAXY_SIZE_ORDER, HOME_FOOD_RANGE, HOME_MIN_PLANETS,
  HOME_PLANET_RANGE, HOME_SPACING, LAIR_CHANCE, MAP_LAYOUT, MAX_HERO_SYSTEMS, MAX_LAIRS, MAX_WORMHOLES, MINERAL_STEPS,
  NATIVES_POP, NEBULAE, ORBIT_WEIGHTS_BY_AGE, ORION_PLACEMENT, SPECIAL_CHANCE, SPECIAL_TRIES, SPECIAL_WEIGHTS,
  STAR_COLORS_BY_AGE, STAR_COUNTS, STAR_PLACEMENT, WORMHOLE_MIN_DISTANCE, WORMHOLE_PARTNER_POOL, type SpecialKind,
} from "./data/galaxy.js";
import { STAR_NAMES } from "./data/names.js";
import {
  BODY_BY_ORBIT_D10, CLIMATES, CLIMATE_BY_ZONE, MINERAL_WEIGHTS_BY_STAR, ORBIT_ZONES, PLANETS_PER_STAR_D10, PLANET_SIZES,
  PLANET_SIZE_WEIGHTS, gravityOf, type BodyKind, type Minerals, type NaturalClimate, type PlanetSize,
  type PlanetType, type StarColor,
} from "./data/planets.js";
import { hasTrait, type RaceDef } from "./data/races.js";
import { Rng } from "./rng.js";
import type { Difficulty, GalaxyAge, GalaxySize, Id, Nebula, Planet, Star } from "./types.js";

/**
 * Galaxy generation as the original does it: stars dropped into a jittered
 * grid, colours by galaxy age, planets by colour, orbit and zone, specials
 * rolled with the stars; then home systems, Orion, nebulae, monster lairs
 * and wormholes once the homes are known (see setup.ts).
 */

export interface GeneratedGalaxy {
  width: number;
  height: number;
  stars: Star[];
  planets: Record<Id, Planet>;
  /** Wormhole pairs rolled as specials; linked once the homes are known. */
  wormholes: number;
  /** Monster lairs rolled; placed once the homes are known. */
  lairs: number;
}

/** The map in parsecs for a galaxy size. */
export function mapSize(size: GalaxySize): { width: number; height: number } {
  const s = MAP_LAYOUT[size].scale;
  const u = STAR_PLACEMENT.unitsPerParsec * 10;
  return { width: round2((STAR_PLACEMENT.screen.width * s) / u), height: round2((STAR_PLACEMENT.screen.height * s) / u) };
}

/** Closest two stars may be, in parsecs (the original's 28-pixel screen rule). */
export function minStarGap(size: GalaxySize): number {
  return (Math.sqrt(STAR_PLACEMENT.minDistance2) * MAP_LAYOUT[size].scale) / (STAR_PLACEMENT.unitsPerParsec * 10);
}

/**
 * Rolls a whole galaxy: stars, planets, specials, and how many wormholes and
 * monster lairs it will have. Returns null when the stars don't fit, in which
 * case the original simply rolls a new galaxy.
 */
export function generateGalaxy(
  rng: Rng, size: GalaxySize, newId: (prefix: string) => Id, age: GalaxyAge = "average", difficulty: Difficulty = "average",
): GeneratedGalaxy | null {
  const count = STAR_COUNTS[size];
  const names = rng.shuffle([...STAR_NAMES]);
  const colors: StarColor[] = [];
  for (let i = 0; i < count; i++) colors.push(rng.weighted(STAR_COLORS_BY_AGE[age]));
  const spots = layoutStars(rng, size, colors, colors.map((_, i) => names[i % names.length]!));
  if (!spots) return null;
  const { width, height } = mapSize(size);
  const stars: Star[] = spots.map((p, i) => ({
    id: newId("s"), name: names[i % names.length]!, x: p.x, y: p.y, color: colors[i]!, planetIds: [], special: null,
  }));
  const planets: Record<Id, Planet> = {};
  for (const star of stars) {
    const n = PLANETS_PER_STAR_D10[star.color][rng.int(0, 9)]!;
    for (let k = 0; k < n; k++) addBody(rng, star, planets, age, newId);
  }
  const { wormholes, lairs } = rollSpecials(rng, stars, planets, size, difficulty);
  return { width, height, stars, planets, wormholes, lairs };
}

interface Spot { sx: number; sy: number; x: number; y: number; bh: boolean; label: number }

/** Screen width of a star's name label in the original's map font, within its limits. */
function labelWidth(name: string): number {
  const { perChar, min, max } = STAR_PLACEMENT.label;
  return Math.max(min, Math.min(max, name.length * perChar));
}

/**
 * Star i goes into grid cell i with up to two cells of jitter, then anywhere,
 * keeping the original's spacing rules (in its screen pixels): no two stars
 * within 28 pixels, name labels may not overlap, and black holes stay
 * BLACK_HOLE_CLEARANCE parsecs from every other star.
 */
function layoutStars(rng: Rng, size: GalaxySize, colors: StarColor[], names: string[]): { x: number; y: number }[] | null {
  const L = MAP_LAYOUT[size];
  const P = STAR_PLACEMENT;
  const W = (P.screen.width * L.scale) / 10;
  const H = (P.screen.height * L.scale) / 10;
  const cw = Math.floor(W / L.cols);
  const ch = Math.floor(H / L.rows);
  const rowWidth = (P.rowWidth * 10) / L.scale;
  const placed: Spot[] = [];
  const toParsec = (units: number) => round2(units / P.unitsPerParsec);
  const fits = (s: Spot) => placed.every((o) => {
    const dx = Math.abs(s.sx - o.sx);
    const dy = Math.abs(s.sy - o.sy);
    if (dx * dx + dy * dy <= P.minDistance2) return false;
    if (dy < L.labelGap && dx < (s.label + o.label) / 2) return false;
    if (dy < P.rowGap && dx < rowWidth) return false;
    if ((s.bh || o.bh) && Math.hypot(s.x - o.x, s.y - o.y) < BLACK_HOLE_CLEARANCE) return false;
    return true;
  });
  for (let i = 0; i < colors.length; i++) {
    const bh = colors[i] === "blackHole";
    const label = labelWidth(names[i]!);
    let spot: Spot | null = null;
    for (let t = 0; t < P.cellTries && !spot; t++) {
      const ix = (cw * (i % L.cols) + rng.int(1, 2 * cw)) % W;
      const iy = (ch * Math.floor(i / L.cols) + rng.int(1, 2 * ch)) % H;
      const s = { sx: (ix * 10) / L.scale, sy: (iy * 10) / L.scale, x: toParsec(ix), y: toParsec(iy), bh, label };
      if (s.sx < P.margins.left || s.sx > P.screen.width - P.margins.right) continue;
      if (s.sy < P.margins.top || s.sy > P.screen.height - P.margins.bottom - L.bottomMargin) continue;
      if (fits(s)) spot = s;
    }
    for (let t = 0; t < P.anywhereTries && !spot; t++) {
      const sx = rng.int(P.anywhere.x[0], P.anywhere.x[1]);
      const sy = rng.int(P.anywhere.y[0], P.anywhere.y[1]);
      const s = { sx, sy, x: toParsec((sx * L.scale) / 10), y: toParsec((sy * L.scale) / 10), bh, label };
      if (fits(s)) spot = s;
    }
    if (!spot) return null;
    placed.push(spot);
  }
  return placed.map((s) => ({ x: s.x, y: s.y }));
}

/** Asteroid belts and gas giants are not real planets: nobody can live there until an Artificial Planet converts them. */
export function isRealPlanet(p: Planet): boolean {
  return p.type !== "asteroids" && p.type !== "gasGiant";
}

function freeOrbits(star: Star, planets: Record<Id, Planet>): number[] {
  const used = new Set(star.planetIds.map((id) => planets[id]!.orbit));
  return [1, 2, 3, 4, 5].filter((o) => !used.has(o));
}

/** A weighted pick among the empty orbits, by galaxy age. */
function pickOrbit(rng: Rng, star: Star, planets: Record<Id, Planet>, age: GalaxyAge): number | null {
  const free = freeOrbits(star, planets);
  if (free.length === 0) return null;
  const weights: Record<string, number> = {};
  for (const o of free) weights[o] = ORBIT_WEIGHTS_BY_AGE[age][o - 1]!;
  return Number(rng.weighted(weights));
}

/** Adds a body in a weighted empty orbit (optionally forcing its kind or a farmable climate). */
export function addBody(
  rng: Rng, star: Star, planets: Record<Id, Planet>, age: GalaxyAge, newId: (prefix: string) => Id,
  kind?: BodyKind, foodOnly = false,
): Planet | null {
  const orbit = pickOrbit(rng, star, planets, age);
  if (orbit === null) return null;
  const p = rollPlanet(rng, star, orbit, newId("p"), age, kind, foodOnly);
  planets[p.id] = p;
  star.planetIds.push(p.id);
  sortOrbits(star, planets);
  return p;
}

function sortOrbits(star: Star, planets: Record<Id, Planet>): void {
  star.planetIds.sort((a, b) => planets[a]!.orbit - planets[b]!.orbit);
}

/**
 * Rolls one body: its kind by orbit, then size, minerals by star colour,
 * gravity by minerals and size, and for real planets a climate by orbital zone.
 */
export function rollPlanet(
  rng: Rng, star: Star, orbit: number, id: Id, age: GalaxyAge, kind?: BodyKind, foodOnly = false,
): Planet {
  const body = kind ?? BODY_BY_ORBIT_D10[orbit - 1]![rng.int(0, 9)]!;
  // Asteroid belts and gas giants keep their usual look; their size only matters once converted.
  const size: PlanetSize = body === "asteroids" ? "small" : body === "gasGiant" ? "huge" : rng.weighted(PLANET_SIZE_WEIGHTS);
  const minerals = rng.weighted(MINERAL_WEIGHTS_BY_STAR[star.color]) as Minerals;
  const type: PlanetType = body === "planet" ? rollClimate(rng, star.color, orbit, age, foodOnly) : body;
  return { id, starId: star.id, orbit, type, size, minerals, gravity: gravityOf(size, minerals), special: "none", colonyId: null };
}

/** Orbital zone of an orbit (1..5) around a star. */
export function orbitZone(color: StarColor, orbit: number): number {
  return ORBIT_ZONES[color][orbit - 1]!;
}

export function climateWeights(color: StarColor, orbit: number, age: GalaxyAge, foodOnly = false): Partial<Record<NaturalClimate, number>> {
  const table = CLIMATE_BY_ZONE[CLIMATE_TABLE_BY_AGE[age]][orbitZone(color, orbit)]!;
  const out: Partial<Record<NaturalClimate, number>> = {};
  for (const [c, w] of Object.entries(table) as [NaturalClimate, number][]) {
    if (w > 0 && (!foodOnly || CLIMATES[c].foodPerFarmer > 0)) out[c] = w;
  }
  return out;
}

function rollClimate(rng: Rng, color: StarColor, orbit: number, age: GalaxyAge, foodOnly: boolean): NaturalClimate {
  return rng.weighted(climateWeights(color, orbit, age, foodOnly));
}

const isFarmable = (p: Planet) => isRealPlanet(p) && CLIMATES[p.type].foodPerFarmer > 0;
const SIZE_RANK = (s: PlanetSize) => PLANET_SIZES.indexOf(s);

export function hasSpecial(star: Star, planets: Record<Id, Planet>): boolean {
  return !!star.feature || star.planetIds.some((id) => planets[id]!.special !== "none");
}

/**
 * Specials and monster lairs, rolled per star as the galaxy is made: every
 * star but the first (which may become Orion) with planets and not a black
 * hole has a SPECIAL_CHANCE of a special and a LAIR_CHANCE of adding a lair.
 * A special that fits nowhere in the system is rolled again.
 */
function rollSpecials(
  rng: Rng, stars: Star[], planets: Record<Id, Planet>, size: GalaxySize, difficulty: Difficulty,
): { wormholes: number; lairs: number } {
  let heroes = 0;
  let wormholes = 0;
  let lairs = 0;
  stars.forEach((star, i) => {
    if (i === 0 || star.color === "blackHole" || star.planetIds.length === 0) return;
    if (rng.chance(LAIR_CHANCE[difficulty])) lairs++;
    if (!rng.chance(SPECIAL_CHANCE)) return;
    const real = star.planetIds.map((id) => planets[id]!).filter((p) => isRealPlanet(p) && p.special === "none");
    for (let t = 0; t < SPECIAL_TRIES; t++) {
      const kind: SpecialKind = rng.weighted(SPECIAL_WEIGHTS);
      if (kind === "gold" || kind === "gems") {
        if (real.length === 0) continue;
        rng.pick(real).special = kind;
      } else if (kind === "natives" || kind === "splinter") {
        const fit = real.filter((p) => isFarmable(p) && SIZE_RANK(p.size) >= SIZE_RANK("medium"));
        if (fit.length === 0) continue;
        const p = rng.pick(fit);
        p.special = kind;
        if (kind === "natives") p.natives = NATIVES_POP;
      } else if (kind === "artifacts") {
        const fit = real.filter(isFarmable);
        if (fit.length === 0) continue;
        rng.pick(fit).special = "artifacts";
      } else if (kind === "hero") {
        if (heroes >= MAX_HERO_SYSTEMS[size]) continue;
        heroes++;
        star.feature = "hero";
      } else if (kind === "wormhole") {
        if (wormholes >= MAX_WORMHOLES[size]) continue;
        wormholes++;
      } else {
        star.feature = kind;
      }
      break;
    }
  });
  return { wormholes, lairs: Math.min(MAX_LAIRS, lairs) };
}


/**
 * Picks the home stars: sets of stars pairwise at least the home spacing
 * apart (see HOME_SPACING), built greedily from every start star; one such set
 * is picked at random and shuffled. The first star is never a home (it may
 * become Orion). Returns null when no set is big enough even after easing the
 * spacing HOME_SPACING.maxExtra times; `relax` keeps easing it (for more
 * empires than the setup screen offers).
 */
export function pickHomeStars(
  rng: Rng, stars: Star[], count: number, size: GalaxySize, width: number, height: number, relax = false,
): Star[] | null {
  const candidates = stars.slice(1);
  if (candidates.length < count) throw new Error("galaxy too small for player count");
  const base = count + (count > HOME_SPACING.manyEmpires ? GALAXY_SIZE_ORDER.indexOf(size) : 0);
  const spread = (MAP_LAYOUT[size].scale * Math.hypot(width, height)) / 10;
  for (let extra = 0; extra <= HOME_SPACING.maxExtra || relax; extra++) {
    const raw = spread / (base + extra);
    const d = relax && raw < HOME_SPACING.min ? raw : Math.max(HOME_SPACING.min, raw);
    const found = homeSet(rng, candidates, count, d);
    if (found) return found;
    if (d < 0.5) break;
  }
  return null;
}

function homeSet(rng: Rng, stars: Star[], count: number, d: number): Star[] | null {
  const sets: Star[][] = [];
  for (let k = 0; k < stars.length; k++) {
    const set = [stars[k]!];
    for (let j = 1; j < stars.length; j++) {
      const s = stars[(k + j) % stars.length]!;
      if (set.every((h) => distance(h, s) >= d)) set.push(s);
    }
    if (set.length >= count) sets.push(set);
  }
  if (sets.length === 0) return null;
  return rng.shuffle([...rng.pick(sets)]).slice(0, count);
}

const NOT_BLACK_HOLE = (c: StarColor) => c !== "blackHole";

/** Rolls a star colour by galaxy age until it passes `ok` (giving up on `fallback`). */
function rerollColor(rng: Rng, age: GalaxyAge, ok: (c: StarColor) => boolean, fallback: StarColor): StarColor {
  for (let i = 0; i < 1000; i++) {
    const c = rng.weighted(STAR_COLORS_BY_AGE[age]);
    if (ok(c)) return c;
  }
  return fallback;
}

/**
 * Makes a home system as the original does: specials cleared, a black hole
 * turned into a star, at least HOME_MIN_PLANETS real planets, and one of them
 * picked as the homeworld. The star keeps its colour unless no orbit has the
 * zone the homeworld needs (or its mineral table can't give a rich or poor
 * homeworld), in which case the colour is rolled again. Returns the homeworld.
 */
export function buildHomeSystem(
  rng: Rng, star: Star, planets: Record<Id, Planet>, race: RaceDef, age: GalaxyAge, newId: (prefix: string) => Id,
): Planet {
  delete star.feature;
  star.nebula = false;
  for (const id of star.planetIds) {
    const p = planets[id]!;
    p.special = "none";
    delete p.natives;
  }
  if (star.color === "blackHole") star.color = rerollColor(rng, age, NOT_BLACK_HOLE, "yellow");
  const real = () => star.planetIds.map((id) => planets[id]!).filter(isRealPlanet);
  while (real().length < HOME_MIN_PLANETS) {
    const free = freeOrbits(star, planets);
    if (free.length > 0) {
      const p = rollPlanet(rng, star, rng.pick(free), newId("p"), age, "planet");
      planets[p.id] = p;
      star.planetIds.push(p.id);
    } else {
      const old = rng.pick(star.planetIds.map((id) => planets[id]!).filter((p) => !isRealPlanet(p)));
      planets[old.id] = rollPlanet(rng, star, old.orbit, old.id, age, "planet");
    }
  }
  const hw = rng.pick(real());

  const aquatic = hasTrait(race, "aquatic");
  const zones = aquatic ? [2, 3] : [2];
  const mineral: Minerals = hasTrait(race, "richHomeworld") ? "rich" : hasTrait(race, "poorHomeworld") ? "poor" : "abundant";
  const fits = (c: StarColor) => NOT_BLACK_HOLE(c) && ORBIT_ZONES[c].some((z) => zones.includes(z))
    && (MINERAL_WEIGHTS_BY_STAR[c][mineral] ?? 0) > 0;
  if (!fits(star.color)) star.color = rerollColor(rng, age, fits, "yellow");
  if (!zones.includes(orbitZone(star.color, hw.orbit))) {
    const target = rng.pick([1, 2, 3, 4, 5].filter((o) => zones.includes(orbitZone(star.color, o))));
    const other = star.planetIds.map((id) => planets[id]!).find((p) => p.orbit === target);
    if (other) other.orbit = hw.orbit;
    hw.orbit = target;
  }
  sortOrbits(star, planets);

  hw.type = aquatic ? "ocean" : "terran";
  hw.size = hasTrait(race, "largeHomeworld") ? "large" : "medium";
  hw.minerals = mineral;
  hw.gravity = hasTrait(race, "lowG") ? "low" : hasTrait(race, "highG") ? "heavy" : "normal";
  hw.special = hasTrait(race, "artifactsHomeworld") ? "artifacts" : "none";
  if (hw.special === "artifacts") hw.artifactsClaimed = true;
  return hw;
}

/**
 * The original's neighbour guarantees for every home: a star with a real
 * planet within HOME_PLANET_RANGE (else the nearest other star becomes a red
 * star with two new planets and is pulled in), and for races that eat, a
 * farmable planet within HOME_FOOD_RANGE (else one is added to, or made in, a
 * random system in range). Returns the stars it changed, which get no monster lair.
 */
export function guaranteeNeighbours(
  rng: Rng, size: GalaxySize, stars: Star[], planets: Record<Id, Planet>, homes: Star[], homeworlds: Planet[],
  eats: boolean[], age: GalaxyAge, newId: (prefix: string) => Id,
): Set<Id> {
  const changed = new Set<Id>();
  // The first star may become Orion and move away, so it never counts.
  const others = stars.slice(1).filter((s) => !homes.includes(s));
  const gap = minStarGap(size);

  for (const home of homes) {
    const near = (s: Star) => s !== home && distance(s, home) <= HOME_PLANET_RANGE;
    if (stars.slice(1).some((s) => near(s) && s.planetIds.some((id) => isRealPlanet(planets[id]!)))) continue;
    const byDistance = [...others].sort((a, b) => distance(a, home) - distance(b, home));
    const spotFor = (s: Star) => {
      const d = distance(s, home);
      if (d <= HOME_PLANET_RANGE) return { x: s.x, y: s.y };
      const r = HOME_PLANET_RANGE - 0.1;
      return { x: round2(home.x + ((s.x - home.x) / d) * r), y: round2(home.y + ((s.y - home.y) / d) * r) };
    };
    const clear = (s: Star, at: { x: number; y: number }) => stars.every((o) => o === s || (
      distance(o, at) >= gap && (o.color !== "blackHole" || distance(o, at) >= BLACK_HOLE_CLEARANCE)));
    const pick = byDistance.find((s) => clear(s, spotFor(s))) ?? byDistance[0];
    if (!pick) continue;
    const at = spotFor(pick);
    pick.x = at.x;
    pick.y = at.y;
    pick.color = "red";
    for (const id of pick.planetIds) delete planets[id];
    pick.planetIds = [];
    for (let k = 0; k < 2; k++) addBody(rng, pick, planets, age, newId, "planet");
    changed.add(pick.id);
  }

  homes.forEach((home, i) => {
    if (!eats[i]) return;
    const inRange = stars.slice(1).filter((s) => distance(s, home) <= HOME_FOOD_RANGE);
    const fed = inRange.some((s) => s.planetIds.some((id) => !homeworlds.includes(planets[id]!) && isFarmable(planets[id]!)));
    if (fed) return;
    const pool = inRange.filter((s) => !homes.includes(s));
    const host = pool.length > 0 ? rng.pick(pool) : home;
    if (freeOrbits(host, planets).length > 0) {
      if (host.color === "brown" || host.color === "blackHole") {
        host.color = rerollColor(rng, age, (c) => c !== "brown" && c !== "blackHole", "red");
      }
      addBody(rng, host, planets, age, newId, "planet", true);
    } else {
      const old = rng.pick(host.planetIds.map((id) => planets[id]!).filter((p) => !homeworlds.includes(p)));
      const p = rollPlanet(rng, host, old.orbit, old.id, age, "planet", true);
      planets[p.id] = { ...p, special: old.special === "gold" || old.special === "gems" ? old.special : "none" };
    }
    changed.add(host.id);
  });
  return changed;
}

/**
 * Orion: the first star swaps places with a random star near the map centre
 * (not a home or a guaranteed neighbour), keeps its own colour (a black hole
 * becomes a random star), and gets the galaxy's best planet in a middle orbit:
 * huge, Gaia, ultra rich and normal gravity. Its other planets turn into asteroid belts.
 */
export function placeOrion(
  rng: Rng, stars: Star[], planets: Record<Id, Planet>, homes: Star[], keep: Set<Id>, width: number, height: number,
  newId: (prefix: string) => Id,
): Star {
  const orion = stars[0]!;
  const center = { x: width / 2, y: height / 2 };
  const movable = stars.filter((s) => !homes.includes(s) && !keep.has(s.id) && s.color !== "blackHole");
  let r = ORION_PLACEMENT.radius;
  let near = movable.filter((s) => distance(s, center) <= r);
  while (near.length < ORION_PLACEMENT.candidates && r < ORION_PLACEMENT.maxRadius) {
    r++;
    near = movable.filter((s) => distance(s, center) <= r);
  }
  const other = near.length > 0 ? rng.pick(near) : orion;
  [orion.x, orion.y, other.x, other.y] = [other.x, other.y, orion.x, orion.y];
  if (orion.color === "blackHole") orion.color = rng.pick(["blue", "white", "yellow", "orange", "red", "brown"] as const);

  const occupied = new Set(orion.planetIds.map((id) => planets[id]!.orbit));
  const orbit = occupied.has(4) && rng.chance(0.5) ? 4 : occupied.has(5) && rng.chance(1 / 3) ? 5 : rng.int(2, 4);
  for (const id of orion.planetIds) {
    const p = planets[id]!;
    if (p.orbit === orbit) {
      delete planets[id];
      continue;
    }
    planets[id] = { ...p, type: "asteroids", size: "small", gravity: gravityOf("small", p.minerals), special: "none" };
    delete planets[id]!.natives;
  }
  const p: Planet = {
    id: newId("p"), starId: orion.id, orbit, type: "gaia", size: "huge", minerals: "ultraRich", gravity: "normal",
    special: "artifacts", colonyId: null,
  };
  planets[p.id] = p;
  orion.planetIds = orion.planetIds.filter((id) => planets[id]).concat(p.id);
  sortOrbits(orion, planets);
  orion.special = "orion";
  orion.name = "Orion";
  orion.nebula = false;
  delete orion.feature;
  return orion;
}

/**
 * Lays nebula clouds over the map, away from the given stars (homes, Orion).
 * Stars inside are flagged; a black hole inside becomes an ordinary star.
 */
export function placeNebulae(
  rng: Rng, size: GalaxySize, width: number, height: number, stars: Star[], planets: Record<Id, Planet>, avoid: Star[],
  age: GalaxyAge, newId: (prefix: string) => Id,
): Nebula[] {
  const out: Nebula[] = [];
  const [lo, hi] = NEBULAE.count[size];
  const scale = MAP_LAYOUT[size].scale / MAP_LAYOUT.medium.scale;
  const wanted = rng.int(lo, hi);
  for (let i = 0; i < wanted; i++) {
    for (let tries = 0; tries < NEBULAE.tries; tries++) {
      const r = round1(scale * (NEBULAE.radius[0] + rng.next() * (NEBULAE.radius[1] - NEBULAE.radius[0])));
      const n: Nebula = { x: round1(r + rng.next() * (width - 2 * r)), y: round1(r + rng.next() * (height - 2 * r)), r };
      if (avoid.some((h) => distance(h, n) < r + 1.5)) continue;
      if (out.some((o) => distance(o, n) < o.r + n.r)) continue;
      out.push(n);
      break;
    }
  }
  for (const s of stars) {
    if (avoid.includes(s) || !out.some((n) => distance(n, s) <= n.r)) continue;
    if (s.color === "blackHole") {
      s.color = rerollColor(rng, age, NOT_BLACK_HOLE, "red");
      const n = PLANETS_PER_STAR_D10[s.color][rng.int(0, 9)]!;
      for (let k = 0; k < n; k++) addBody(rng, s, planets, age, newId);
    }
    s.nebula = true;
  }
  return out;
}

/**
 * Links the wormhole pairs rolled as specials. One end is a random star with
 * planets, no special and no wormhole, not a black hole or a home; the other
 * is picked among the first WORMHOLE_PARTNER_POOL such stars (homes allowed)
 * more than WORMHOLE_MIN_DISTANCE away.
 */
export function linkWormholes(
  rng: Rng, size: GalaxySize, stars: Star[], planets: Record<Id, Planet>, homes: Star[], pairs: number, skip: Set<Id>,
): void {
  const free = (s: Star) => s.planetIds.length > 0 && !s.special && !s.wormholeTo && s.color !== "blackHole"
    && !skip.has(s.id) && !hasSpecial(s, planets);
  for (let i = 0; i < pairs; i++) {
    const ends = stars.filter((s) => free(s) && !homes.includes(s));
    if (ends.length === 0) return;
    const a = rng.pick(ends);
    const partners = stars.filter((s) => s !== a && free(s) && distance(a, s) > WORMHOLE_MIN_DISTANCE[size]).slice(0, WORMHOLE_PARTNER_POOL);
    if (partners.length === 0) continue;
    const b = rng.pick(partners);
    a.feature = "wormhole";
    b.feature = "wormhole";
    a.wormholeTo = b.id;
    b.wormholeTo = a.id;
  }
}

/** Raises a planet's minerals to at least `min`. */
export function atLeastMinerals(m: Minerals, min: Minerals): Minerals {
  return MINERAL_STEPS[Math.max(MINERAL_STEPS.indexOf(m), MINERAL_STEPS.indexOf(min))]!;
}

/** Raises a planet's size to at least `min`. */
export function atLeastSize(s: PlanetSize, min: PlanetSize): PlanetSize {
  return PLANET_SIZES[Math.max(SIZE_RANK(s), SIZE_RANK(min))]!;
}

/**
 * Share of bodies of each type around a star of this colour, computed exactly
 * from the generation tables (orbit weights, body by orbit, climate by zone).
 */
export function bodyMix(color: StarColor, age: GalaxyAge = "average"): Partial<Record<PlanetType, number>> {
  const counts = PLANETS_PER_STAR_D10[color];
  const weights = ORBIT_WEIGHTS_BY_AGE[age];
  // Chance each orbit is taken after n weighted picks without replacement.
  const occupied = [0, 0, 0, 0, 0];
  let bodies = 0;
  const walk = (left: number, free: number[], p: number, nShare: number) => {
    if (left === 0 || free.length === 0) return;
    const total = free.reduce((s, o) => s + weights[o]!, 0);
    for (const o of free) {
      const q = p * (weights[o]! / total);
      occupied[o] = occupied[o]! + q * nShare;
      walk(left - 1, free.filter((x) => x !== o), q, nShare);
    }
  };
  for (const n of counts) {
    bodies += n / counts.length;
    walk(n, [0, 1, 2, 3, 4], 1, 1 / counts.length);
  }
  const out: Partial<Record<PlanetType, number>> = {};
  if (bodies === 0) return out;
  const add = (t: PlanetType, v: number) => { out[t] = (out[t] ?? 0) + v / bodies; };
  occupied.forEach((occ, o) => {
    const kinds = BODY_BY_ORBIT_D10[o]!;
    for (const k of kinds) {
      const share = occ / kinds.length;
      if (k !== "planet") { add(k, share); continue; }
      const table = climateWeights(color, o + 1, age);
      const total = Object.values(table).reduce((s, v) => s + (v ?? 0), 0);
      for (const [c, w] of Object.entries(table) as [NaturalClimate, number][]) add(c, (share * w) / total);
    }
  });
  return out;
}

/** Average planets (of any kind) around a star of this colour. */
export function meanPlanets(color: StarColor): number {
  const t = PLANETS_PER_STAR_D10[color];
  return t.reduce((s, n) => s + n, 0) / t.length;
}

/** Whether the straight line from a to b passes within `radius` of point c. */
export function segmentPassesNear(
  a: { x: number; y: number }, b: { x: number; y: number }, c: { x: number; y: number }, radius: number,
): boolean {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((c.x - a.x) * dx + (c.y - a.y) * dy) / len2));
  return Math.hypot(a.x + t * dx - c.x, a.y + t * dy - c.y) < radius;
}

/** Black holes on the map (the raiders' off-map home is not one). */
export function blackHoles(stars: Star[]): Star[] {
  return stars.filter((s) => s.color === "blackHole" && s.special !== "raiderHome");
}

/** Whether a straight move between two points is blocked by a black hole. */
export function blockedByBlackHole(stars: Star[], from: { x: number; y: number }, to: { x: number; y: number }): boolean {
  return blackHoles(stars).some((bh) => segmentPassesNear(from, to, bh, BLACK_HOLE_RADIUS));
}

export function distance(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
