import {
  AGE_MINERAL_SHIFT, BLACK_HOLE_HOME_CLEARANCE, BLACK_HOLE_RADIUS, BROWN_DWARF_SPECIAL_CHANCE, MINERAL_STEPS, NATIVES_FRACTION,
  NEBULAE, SPECIAL_CHANCE, SPECIAL_WEIGHTS, STAR_COLORS_BY_AGE, WORMHOLE_MIN_DISTANCE, type SpecialKind,
} from "./data/galaxy.js";
import { STAR_NAMES } from "./data/names.js";
import {
  CLIMATES, MINERAL_WEIGHTS_BY_STAR, PLANET_SIZE_WEIGHTS, PLANET_TYPE_WEIGHTS, PLANETS_PER_STAR, SIZE_FACTOR,
  gravityOf, type Minerals, type PlanetSize, type PlanetType,
} from "./data/planets.js";
import { Rng } from "./rng.js";
import type { GalaxyAge, GalaxySize, Id, Nebula, Planet, Star } from "./types.js";

export const STAR_COUNTS: Record<GalaxySize, number> = { small: 20, medium: 36, large: 54, huge: 72 };

/** Minimum distance between stars, in parsecs. */
const MIN_STAR_GAP = 2.2;
/** Square parsecs of space per star. */
const AREA_PER_STAR = 14;
/** Every home star gets at least this many other stars within HOME_NEIGHBOR_RANGE... */
const HOME_NEIGHBORS = 2;
/** ...which is inside the starting fuel range (4 parsecs), so the first ships always have somewhere to go. */
const HOME_NEIGHBOR_RANGE = 3.5;

export interface GeneratedGalaxy {
  width: number;
  height: number;
  stars: Star[];
  planets: Record<Id, Planet>;
}

export function generateGalaxy(
  rng: Rng, size: GalaxySize, newId: (prefix: string) => Id, age: GalaxyAge = "average",
): GeneratedGalaxy {
  const count = STAR_COUNTS[size];
  const width = Math.round(Math.sqrt((count * AREA_PER_STAR) / 0.75));
  const height = Math.round(width * 0.75);
  const names = rng.shuffle([...STAR_NAMES]);
  const colors = STAR_COLORS_BY_AGE[age];

  const stars: Star[] = [];
  let attempts = 0;
  while (stars.length < count && attempts < count * 500) {
    attempts++;
    const x = 1 + rng.next() * (width - 2);
    const y = 1 + rng.next() * (height - 2);
    if (stars.some((s) => Math.hypot(s.x - x, s.y - y) < MIN_STAR_GAP)) continue;
    stars.push({
      id: newId("s"),
      name: names[stars.length % names.length]!,
      x: round1(x),
      y: round1(y),
      color: rng.weighted(colors),
      planetIds: [],
      special: null,
    });
  }

  const planets: Record<Id, Planet> = {};
  for (const star of stars) {
    const [min, max] = PLANETS_PER_STAR[star.color];
    const n = rng.int(min, max);
    const orbits = rng.shuffle([1, 2, 3, 4, 5]).slice(0, n).sort((a, b) => a - b);
    for (const orbit of orbits) {
      const p = rollPlanet(rng, star, orbit, newId("p"), age);
      planets[p.id] = p;
      star.planetIds.push(p.id);
    }
  }
  return { width, height, stars, planets };
}

function rollPlanet(rng: Rng, star: Star, orbit: number, id: Id, age: GalaxyAge): Planet {
  const type = rng.weighted(PLANET_TYPE_WEIGHTS[star.color]) as PlanetType;
  const size: PlanetSize = type === "asteroids" ? "small" : type === "gasGiant" ? "huge" : rng.weighted(PLANET_SIZE_WEIGHTS);
  let minerals = rng.weighted(MINERAL_WEIGHTS_BY_STAR[star.color]) as Minerals;
  const shift = AGE_MINERAL_SHIFT[age];
  if (shift !== 0 && rng.chance(Math.abs(shift))) minerals = shiftMinerals(minerals, Math.sign(shift));
  return { id, starId: star.id, orbit, type, size, minerals, gravity: gravityOf(size, minerals), special: "none", colonyId: null };
}

export function shiftMinerals(m: Minerals, steps: number): Minerals {
  const i = MINERAL_STEPS.indexOf(m);
  return MINERAL_STEPS[Math.max(0, Math.min(MINERAL_STEPS.length - 1, i + steps))]!;
}

/**
 * Picks spread-out home stars: start from a random star, then repeatedly take
 * the star farthest from all chosen ones. Farthest-first favours lonely stars,
 * so only stars with neighbours in reach qualify, and any home still short of
 * neighbours has the nearest stars drawn in. Black holes near a home collapse
 * into ordinary red stars so every start can move freely.
 */
export function pickHomeStars(rng: Rng, stars: Star[], count: number): Star[] {
  const all = stars.filter((s) => s.color !== "blackHole" && s.color !== "brown");
  if (all.length < count) throw new Error("galaxy too small for player count");
  const roomy = all.filter((s) => neighbours(stars, s).length >= HOME_NEIGHBORS);
  const candidates = roomy.length >= count ? roomy : all;
  const chosen: Star[] = [rng.pick(candidates)];
  while (chosen.length < count) {
    let best: Star | null = null;
    let bestDist = -1;
    for (const s of candidates) {
      if (chosen.includes(s)) continue;
      const d = Math.min(...chosen.map((c) => Math.hypot(c.x - s.x, c.y - s.y)));
      if (d > bestDist) {
        bestDist = d;
        best = s;
      }
    }
    chosen.push(best!);
  }
  for (const s of stars) {
    if (s.color === "blackHole" && chosen.some((h) => distance(h, s) < BLACK_HOLE_HOME_CLEARANCE)) s.color = "red";
  }
  for (const home of chosen) drawInNeighbours(stars, home, chosen);
  return chosen;
}

function neighbours(stars: Star[], home: Star): Star[] {
  return stars.filter((s) => s !== home && s.color !== "blackHole" && distance(s, home) <= HOME_NEIGHBOR_RANGE);
}

/** Moves the nearest stars toward a home until it has enough within reach, keeping the minimum gap. */
function drawInNeighbours(stars: Star[], home: Star, homes: Star[]): void {
  let missing = HOME_NEIGHBORS - neighbours(stars, home).length;
  const outside = stars
    .filter((s) => !homes.includes(s) && s.color !== "blackHole" && distance(s, home) > HOME_NEIGHBOR_RANGE)
    .sort((a, b) => distance(a, home) - distance(b, home));
  for (const star of outside) {
    if (missing <= 0) return;
    const d = distance(star, home);
    const target = HOME_NEIGHBOR_RANGE - 0.2;
    const x = round1(home.x + ((star.x - home.x) / d) * target);
    const y = round1(home.y + ((star.y - home.y) / d) * target);
    if (stars.some((o) => o !== star && Math.hypot(o.x - x, o.y - y) < MIN_STAR_GAP)) continue;
    star.x = x;
    star.y = y;
    missing--;
  }
}

/**
 * Lays nebula clouds over the map, away from homeworlds. Stars inside are
 * flagged; their planets are often richer in minerals.
 */
export function placeNebulae(
  rng: Rng, size: GalaxySize, width: number, height: number, stars: Star[], planets: Record<Id, Planet>, homes: Star[],
): Nebula[] {
  const out: Nebula[] = [];
  for (let i = 0; i < NEBULAE.count[size]; i++) {
    for (let tries = 0; tries < 40; tries++) {
      const r = round1(NEBULAE.radius[0] + rng.next() * (NEBULAE.radius[1] - NEBULAE.radius[0]));
      const n: Nebula = { x: round1(r + rng.next() * (width - 2 * r)), y: round1(r + rng.next() * (height - 2 * r)), r };
      if (homes.some((h) => distance(h, n) < r + 1.5)) continue;
      if (out.some((o) => distance(o, n) < o.r + n.r)) continue;
      out.push(n);
      break;
    }
  }
  for (const s of stars) {
    if (s.color === "blackHole" || !out.some((n) => distance(n, s) <= n.r)) continue;
    s.nebula = true;
    for (const pid of s.planetIds) {
      const p = planets[pid]!;
      if (rng.chance(NEBULAE.mineralBoost)) {
        p.minerals = shiftMinerals(p.minerals, 1);
        p.gravity = gravityOf(p.size, p.minerals);
      }
    }
  }
  return out;
}

/**
 * Rolls system specials: at most one per system (monster lairs add their own
 * treasure on top). Brown dwarfs, which have no planets, are the likeliest to
 * hold one. Home systems, Orion and lairs that already have treasure are skipped.
 */
export function placeSpecials(rng: Rng, stars: Star[], planets: Record<Id, Planet>, homes: Star[]): void {
  const hasSpecial = (s: Star) => !!s.feature || s.planetIds.some((id) => planets[id]!.special !== "none");
  const eligible = (s: Star) => !homes.includes(s) && !s.special && s.color !== "blackHole" && !hasSpecial(s);
  for (const star of stars) {
    if (!eligible(star)) continue;
    if (!rng.chance(star.color === "brown" ? BROWN_DWARF_SPECIAL_CHANCE : SPECIAL_CHANCE)) continue;
    const habitable = star.planetIds.map((id) => planets[id]!).filter((p) => CLIMATES[p.type].habitable && !p.colonyId);
    const fertile = habitable.filter((p) => !CLIMATES[p.type].hostile);
    const weights: Partial<Record<SpecialKind, number>> = { ...SPECIAL_WEIGHTS };
    if (habitable.length === 0) for (const k of ["artifacts", "gold", "gems", "splinter"] as const) delete weights[k];
    if (fertile.length === 0) delete weights.natives;
    const kind = rng.weighted(weights);
    switch (kind) {
      case "artifacts":
      case "gold":
      case "gems":
      case "splinter":
        rng.pick(habitable).special = kind;
        break;
      case "natives": {
        const p = rng.pick(fertile);
        p.special = "natives";
        p.natives = Math.max(2, Math.floor(CLIMATES[p.type].popPerSize * SIZE_FACTOR[p.size] * NATIVES_FRACTION));
        break;
      }
      case "wormhole": {
        const partners = stars.filter((s) => s !== star && eligible(s) && distance(s, star) >= WORMHOLE_MIN_DISTANCE);
        if (partners.length === 0) break;
        const other = rng.pick(partners);
        star.feature = "wormhole";
        other.feature = "wormhole";
        star.wormholeTo = other.id;
        other.wormholeTo = star.id;
        break;
      }
      default:
        star.feature = kind;
    }
  }
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
